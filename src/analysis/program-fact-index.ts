import { performance } from "node:perf_hooks";
import type { ProgramElement, ProgramElementKind } from "./program-evidence";
import {
  compactFactBytes,
  compactFactFromElement,
  type CompactProgramFact,
} from "./program-evidence-compact-facts";
import type { SliceDirection } from "./scope-seam";

export type ProgramFactRole = string;

export type ProgramFactIndexInstrumentation = {
  compactFactCount: number;
  compactFactBytesEstimate: number;
  hydratedElementCount: number;
  hydrationTimeMs: number;
  factIterations: number;
  memoHits: number;
};

export type ProgramFactHydrator = (fact: CompactProgramFact) => ProgramElement;

/**
 * Compact source catalog used to choose a bounded lazy evidence frontier.
 *
 * The catalog retains scalar source identity and selection metadata. It does
 * not retain full ProgramElement objects, relation records, or proof arrays.
 */
export class ProgramFactIndex {
  /** Route-file candidates only. This compatibility view is intentionally bounded. */
  private readonly routeCandidateFacts: readonly CompactProgramFact[];
  readonly facts: readonly CompactProgramFact[];
  readonly sourceFiles: readonly string[];
  readonly factCount: number;
  readonly compactFactBytesEstimate: number;

  private readonly factsById = new Map<string, CompactProgramFact>();
  private readonly factsByRole = new Map<ProgramFactRole, CompactProgramFact[]>();
  private readonly factsByFile = new Map<string, CompactProgramFact[]>();
  private readonly filesBySymbolId = new Map<string, Set<string>>();
  private readonly filesByKind = new Map<ProgramElementKind, Set<string>>();
  private readonly hydratedById = new Map<string, ProgramElement>();
  private readonly hydrator: ProgramFactHydrator;
  private hydrationCount = 0;
  private hydrationTimeMs = 0;
  private factIterations = 0;
  private memoHits = 0;

  constructor(
    records: readonly (CompactProgramFact | ProgramElement)[],
    sourceFiles: readonly string[],
    hydrator?: ProgramFactHydrator,
  ) {
    const eagerElements = new Map<string, ProgramElement>();
    this.facts = records.map((record) => {
      if (isCompactFact(record)) return record;
      eagerElements.set(record.id, record);
      return compactFactFromElement(record);
    });
    this.hydrator = hydrator ?? ((fact) => {
      const element = eagerElements.get(fact.id);
      if (!element) throw new Error(`No hydrator is available for compact fact ${fact.id}.`);
      return element;
    });
    this.sourceFiles = [...new Set(sourceFiles)];
    this.factCount = this.facts.length;
    this.compactFactBytesEstimate = this.facts.reduce((total, fact) => total + compactFactBytes(fact), 0);

    for (const fact of this.facts) {
      if (!this.factsById.has(fact.id)) this.factsById.set(fact.id, fact);
      const fileFacts = this.factsByFile.get(fact.location.file) ?? [];
      fileFacts.push(fact);
      this.factsByFile.set(fact.location.file, fileFacts);
      if (fact.symbolId) {
        const symbolFiles = this.filesBySymbolId.get(fact.symbolId) ?? new Set<string>();
        symbolFiles.add(fact.location.file);
        this.filesBySymbolId.set(fact.symbolId, symbolFiles);
      }
      const kindFiles = this.filesByKind.get(fact.kind) ?? new Set<string>();
      kindFiles.add(fact.location.file);
      this.filesByKind.set(fact.kind, kindFiles);
      for (const role of rolesFor(fact)) {
        const candidates = this.factsByRole.get(role) ?? [];
        candidates.push(fact);
        this.factsByRole.set(role, candidates);
      }
    }

    this.routeCandidateFacts = this.sourceFiles
      .filter(isRouteCandidateFile)
      .flatMap((file) => this.factsByFile.get(file) ?? []);
  }

  get elements(): readonly CompactProgramFact[] {
    this.factIterations += this.routeCandidateFacts.length;
    return this.routeCandidateFacts;
  }

  /** Return compact metadata without hydrating a full element. */
  getFact(elementId: string): CompactProgramFact | undefined {
    this.factIterations += 1;
    return this.factsById.get(elementId);
  }

  /** Return one full source element and cache only queried IDs. */
  getElement(elementId: string): ProgramElement | undefined {
    const cached = this.hydratedById.get(elementId);
    if (cached) {
      this.memoHits += 1;
      return cached;
    }
    const fact = this.getFact(elementId);
    if (!fact) return undefined;
    const started = performance.now();
    const element = this.hydrator(fact);
    this.hydratedById.set(elementId, element);
    this.hydrationCount += 1;
    this.hydrationTimeMs += performance.now() - started;
    return element;
  }

  elementFor(elementId: string): ProgramElement | undefined {
    return this.getElement(elementId);
  }

  getInstrumentation(): ProgramFactIndexInstrumentation {
    return {
      compactFactCount: this.factCount,
      compactFactBytesEstimate: this.compactFactBytesEstimate,
      hydratedElementCount: this.hydrationCount,
      hydrationTimeMs: this.hydrationTimeMs,
      factIterations: this.factIterations,
      memoHits: this.memoHits,
    };
  }

  roleCandidates(role: ProgramFactRole): readonly CompactProgramFact[] {
    const candidates = this.factsByRole.get(role) ?? [];
    this.factIterations += candidates.length;
    return candidates;
  }

  getRoleCandidates(role: ProgramFactRole): readonly CompactProgramFact[] {
    return this.roleCandidates(role);
  }

  kindCandidates(kind: ProgramElementKind): readonly CompactProgramFact[] {
    const candidates = this.facts.filter((fact) => fact.kind === kind);
    this.factIterations += this.facts.length;
    return candidates;
  }

  fileCandidates(file: string): readonly CompactProgramFact[] {
    const candidates = this.factsByFile.get(file) ?? [];
    this.factIterations += candidates.length;
    return candidates;
  }

  sourceFileList(): readonly string[] {
    return this.sourceFiles;
  }

  /** Return source files that can emit relations touching one endpoint. */
  relationSourceFilesFor(elementId: string): readonly string[] {
    const element = this.getFact(elementId);
    if (!element) return [];
    const files = new Set<string>();
    const seen = new Set<string>();
    const addElement = (candidate: CompactProgramFact | undefined) => {
      if (!candidate || seen.has(candidate.id)) return;
      seen.add(candidate.id);
      files.add(candidate.location.file);
      addSymbol(candidate.symbolId);
    };
    const addSymbol = (symbolId: string | null) => {
      if (!symbolId) return;
      for (const file of this.filesBySymbolId.get(symbolId) ?? []) files.add(file);
    };

    addElement(element);
    addElement(element.ownerId ? this.factsById.get(element.ownerId) : undefined);
    addElement(element.definitionId ? this.factsById.get(element.definitionId) : undefined);
    addSymbol(element.symbolId);
    if (element.ownerId) addSymbol(this.factsById.get(element.ownerId)?.symbolId ?? null);
    if (element.definitionId) addSymbol(this.factsById.get(element.definitionId)?.symbolId ?? null);
    if (HTTP_BOUNDARY_KINDS.has(element.kind)) {
      for (const kind of HTTP_BOUNDARY_KINDS) {
        for (const file of this.filesByKind.get(kind) ?? []) files.add(file);
      }
    }
    return this.orderedFiles(files);
  }

  priorityFor(elementId: string, direction: SliceDirection = "forward"): number {
    const element = this.factsById.get(elementId);
    if (!element) return 0;
    const roles = rolesFor(element);
    const hasOrigin = roles.some((role) => ORIGIN_ROLES.has(role));
    const hasTerminal = roles.some((role) => TERMINAL_ROLES.has(role));
    const originWeight = hasOrigin
      ? direction === "backward" || direction === "both" ? 4_000 : 3_000
      : 0;
    const terminalWeight = hasTerminal
      ? direction === "forward" || direction === "both" ? 4_000 : 3_000
      : 0;
    const boundaryWeight = boundaryFor(element) ? 2_000 : 0;
    const kindWeight = element.kind === "source-file" ? 100 : element.kind.endsWith("-entry") ? 80 : 0;
    return Math.max(originWeight, terminalWeight, boundaryWeight) + kindWeight;
  }

  stablePriority(elementId: string, direction: SliceDirection = "forward"): number {
    return this.priorityFor(elementId, direction);
  }

  comparePriority(leftId: string, rightId: string, direction: SliceDirection = "forward"): number {
    const priorityDifference = this.priorityFor(rightId, direction) - this.priorityFor(leftId, direction);
    if (priorityDifference !== 0) return priorityDifference;
    return this.sourceKey(leftId).localeCompare(this.sourceKey(rightId));
  }

  private sourceKey(elementId: string): string {
    const element = this.factsById.get(elementId);
    if (!element) return `~${elementId}`;
    const { file, span } = element.location;
    return `${file}:${span.startLine}:${span.startColumn}:${span.endLine}:${span.endColumn}:${element.kind}:${element.id}`;
  }

  private orderedFiles(files: ReadonlySet<string>): readonly string[] {
    return this.sourceFiles.filter((file) => files.has(file));
  }
}

const HTTP_BOUNDARY_KINDS = new Set<ProgramElementKind>([
  "fetch-input",
  "resource-input",
  "resource-result",
  "http-response",
]);

const ORIGIN_ROLES = new Set([
  "argument",
  "environment",
  "working-directory",
  "stdin",
  "request",
  "event",
  "filesystem",
  "fetch",
  "resource",
  "network",
  "external-read",
  "input-boundary",
]);

const TERMINAL_ROLES = new Set([
  "render",
  "component-occurrence",
  "stdout",
  "file-write",
  "exit",
  "side-effect",
  "return",
  "http-response",
  "response",
  "message",
  "child-process",
  "completion",
]);

function rolesFor(element: CompactProgramFact): string[] {
  const roles: string[] = [];
  switch (element.kind) {
    case "parameter":
      if (element.attributes.originRole) roles.push(String(element.attributes.originRole));
      else if (element.attributes.name === "argv") roles.push("argument");
      else if (element.attributes.name === "env") roles.push("environment");
      else if (element.attributes.name === "cwd") roles.push("working-directory");
      break;
    case "environment-input":
      roles.push("environment");
      break;
    case "process-input":
      roles.push(String(element.attributes.name ?? "").includes("stdin") ? "stdin" : "argument");
      break;
    case "file-input":
      roles.push("filesystem");
      break;
    case "fetch-input":
      roles.push("fetch", "network");
      break;
    case "resource-input":
      roles.push("resource");
      break;
    case "external-read":
      roles.push("external-read");
      break;
    case "render-terminal":
    case "dom-terminal":
      roles.push("render");
      break;
    case "stdout":
      roles.push(String(element.attributes.operation ?? element.label).includes("stderr") ? "side-effect" : "stdout");
      break;
    case "stderr":
      roles.push("side-effect");
      break;
    case "exit-status":
      roles.push("exit");
      break;
    case "file-write":
      roles.push("file-write");
      break;
    case "http-response":
      roles.push("http-response");
      break;
    case "message":
      roles.push("message");
      break;
    case "return":
      if (element.attributes.terminalRole === "http-response") roles.push("http-response");
      else if (element.attributes.terminalRole === "response") roles.push("response", "return");
      else if (element.attributes.terminalRole === "return") roles.push("return");
      break;
    case "external-effect":
    case "network-request":
      roles.push("side-effect");
      break;
    case "component-occurrence":
      roles.push("component-occurrence");
      break;
    default:
      break;
  }
  return roles;
}

function boundaryFor(element: CompactProgramFact): string | null {
  return BOUNDARY_KINDS.has(element.kind) ? element.kind : null;
}

const BOUNDARY_KINDS = new Set<ProgramElementKind>([
  "file-input",
  "file-write",
  "fetch-input",
  "network-request",
  "http-response",
  "external-read",
  "message",
  "environment-input",
  "process-input",
  "stdout",
  "stderr",
  "exit-status",
  "resource-input",
  "resource-result",
  "external-effect",
]);

function isCompactFact(value: CompactProgramFact | ProgramElement): value is CompactProgramFact {
  return "nodeStart" in value && "proofKind" in value && "attributes" in value;
}

function isRouteCandidateFile(file: string): boolean {
  return file.split("/").includes("routes");
}
