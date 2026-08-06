import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  collectProgramEvidenceForRoot,
  type ProgramEvidence,
} from "../program-evidence";
import {
  boundaryPolicy,
  scopeCandidateId,
  scopePolicy,
  scopeSeedFor,
  type EvidenceProof,
  type ScopeCandidate,
  type ScopeSeed,
  type SourceIdentity,
  type SourceLocation,
} from "../scope-seam";

type EvidenceElement = {
  id: string;
  kind: string;
  label: string;
  location: SourceLocation;
  symbol?: string | null;
  symbolId?: string | null;
  source?: SourceIdentity;
};

type EvidenceRelation = {
  id: string;
  from: string;
  to: string;
  kind: string;
  confidence?: string;
  status?: string;
  evidence?: readonly SourceLocation[];
  proof?: { locations: readonly SourceLocation[] };
};

type ScopeEvidence = {
  elements: readonly EvidenceElement[];
  relations: readonly EvidenceRelation[];
};

type HttpRegistration = {
  importLocation: SourceLocation;
  callLocation: SourceLocation;
  argumentLocation: SourceLocation;
  bindingName: string;
  handlerName: string;
  callElement: EvidenceElement;
};

/** Discover Node HTTP handler scopes from exact import and registration proof. */
export function discoverHttpServiceCandidates(
  root: string,
  evidence: ScopeEvidence,
): ScopeCandidate[] {
  const candidates: ScopeCandidate[] = [];
  const seenEntryIds = new Set<string>();

  for (const registration of httpRegistrations(root, evidence.elements)) {
    const handler = registeredHandler(registration, evidence.elements, evidence.relations);
    if (!handler || seenEntryIds.has(handler.id)) continue;
    seenEntryIds.add(handler.id);

    const proof: EvidenceProof[] = [
      {
        kind: "node-http-import",
        detail: `${registration.importLocation.file} imports ${registration.bindingName} from node:http.`,
        locations: [registration.importLocation],
        status: "proven",
      },
      {
        kind: "node-http-registration",
        detail: `${registration.callElement.label} passes ${registration.handlerName} to the Node HTTP server registration.`,
        locations: [registration.callLocation, registration.argumentLocation],
        status: "proven",
      },
      {
        kind: "node-http-handler",
        detail: `${registration.handlerName} resolves to the in-project HTTP handler declaration.`,
        locations: [registration.argumentLocation, handler.location],
        status: "proven",
      },
    ];
    const defaults = scopePolicy({
      direction: "forward",
      boundaryPolicy: boundaryPolicy({ maxElements: 512, maxRelations: 1024 }),
    });
    candidates.push({
      id: scopeCandidateId("http-service", sourceIdentityForElement(handler)),
      kind: "handler",
      adapter: "http-service",
      label: `HTTP handler ${registration.handlerName}`,
      entryElementId: handler.id,
      entry: handler.location,
      framework: "node:http",
      proof,
      defaults,
    });
  }
  return candidates;
}

/** Convert an HTTP service candidate into the shared slice seed. */
export function buildHttpServiceSeed(candidate: ScopeCandidate): ScopeSeed {
  return scopeSeedFor(candidate);
}

export type EvidenceSliceAdapterInput = {
  evidence: ProgramEvidence;
  seeds: ScopeSeed[];
};

export async function loadHttpServiceEvidence(
  fixtureRoot: string,
): Promise<EvidenceSliceAdapterInput> {
  const root = path.resolve(fixtureRoot);
  const evidence = await collectProgramEvidenceForRoot(root);
  const candidates = discoverHttpServiceCandidates(root, evidence);
  return { evidence, seeds: candidates.map(buildHttpServiceSeed) };
}

export const evidenceSliceAdapter = {
  name: "http-service",
  load: loadHttpServiceEvidence,
};

function httpRegistrations(
  root: string,
  elements: readonly EvidenceElement[],
): HttpRegistration[] {
  const registrations: HttpRegistration[] = [];
  for (const file of sourceFiles(root, elements)) {
    const source = readSource(file);
    if (source === null) continue;
    for (const imported of nodeHttpImports(root, file, source)) {
      const callPattern = new RegExp(
        `\\b${escapeRegExp(imported.bindingName)}\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)`,
        "g",
      );
      for (const match of source.slice(imported.end).matchAll(callPattern)) {
        const relativeStart = match.index ?? 0;
        const start = imported.end + relativeStart;
        if (source[start - 1] === ".") continue;
        const handlerName = match[1];
        const callEnd = start + match[0].length;
        const argumentStart = start + match[0].lastIndexOf(handlerName);
        const callElement = callElementAt(root, file, elements, start, callEnd);
        if (!callElement) continue;
        registrations.push({
          importLocation: imported.location,
          callLocation: sourceLocationAt(root, file, source, start, callEnd),
          argumentLocation: sourceLocationAt(
            root,
            file,
            source,
            argumentStart,
            argumentStart + handlerName.length,
          ),
          bindingName: imported.bindingName,
          handlerName,
          callElement,
        });
      }
    }
  }
  return registrations;
}

function nodeHttpImports(
  root: string,
  file: string,
  source: string,
): Array<{ bindingName: string; location: SourceLocation; end: number }> {
  const imports: Array<{ bindingName: string; location: SourceLocation; end: number }> = [];
  const pattern = /\bimport\s+(?!type\b)\{([\s\S]*?)\}\s*from\s*["']node:http["']\s*;?/g;
  for (const match of source.matchAll(pattern)) {
    const bindingName = namedCreateServerBinding(match[1]);
    if (!bindingName) continue;
    const start = match.index ?? 0;
    imports.push({
      bindingName,
      location: sourceLocationAt(root, file, source, start, start + match[0].length),
      end: start + match[0].length,
    });
  }
  return imports;
}

function namedCreateServerBinding(specifiers: string): string | null {
  for (const specifier of specifiers.split(",")) {
    const match = /^\s*createServer(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(specifier);
    if (match) return match[1] ?? "createServer";
  }
  return null;
}

function registeredHandler(
  registration: HttpRegistration,
  elements: readonly EvidenceElement[],
  relations: readonly EvidenceRelation[],
): EvidenceElement | null {
  const argumentRelations = relations.filter((relation) =>
    relation.kind === "argument"
    && relation.to === registration.callElement.id
    && relationIsProven(relation)
    && relationHasLocation(relation, registration.argumentLocation),
  );
  const argumentElements = uniqueElements(
    argumentRelations
      .map((relation) => elements.find((element) => element.id === relation.from))
      .filter((element): element is EvidenceElement => Boolean(element))
      .filter((element) =>
        element.label === registration.handlerName
        && locationContainsRange(element.location, registration.argumentLocation),
      ),
  );
  if (argumentElements.length !== 1) return null;
  const argument = argumentElements[0];

  const definitionRelations = relations.filter((relation) =>
    relation.kind === "definition"
    && relation.from === argument.id
    && relationIsProven(relation)
    && relationHasLocation(relation, registration.argumentLocation),
  );
  const handlers = uniqueElements(
    definitionRelations
      .map((relation) => elements.find((element) => element.id === relation.to))
      .filter((element): element is EvidenceElement => Boolean(element))
      .filter((element) =>
        element.label === registration.handlerName
        && /^(?:handler|function)-entry$/.test(element.kind),
      ),
  );
  return handlers.length === 1 ? handlers[0] : null;
}

function callElementAt(
  root: string,
  file: string,
  elements: readonly EvidenceElement[],
  start: number,
  end: number,
): EvidenceElement | null {
  const sourceStart = sourcePositionForOffset(file, start);
  const sourceEnd = sourcePositionForOffset(file, end);
  const matches = elements.filter((element) =>
    element.kind === "call"
    && sameFile(root, element.location.file, file)
    && resolvesToNodeHttpCreateServer(element)
    && locationContainsPoint(element.location, sourceStart.line, sourceStart.column)
    && locationContainsPoint(element.location, sourceEnd.line, sourceEnd.column),
  );
  return matches.length === 1 ? matches[0] : null;
}

function resolvesToNodeHttpCreateServer(element: EvidenceElement): boolean {
  const symbol = element.symbol ?? element.symbolId;
  if (!symbol || symbol === "createServer") return true;
  return /(?:["'](?:node:)?http["']|(?:node:)?http)\.createServer$/.test(symbol);
}

function sourceFiles(root: string, elements: readonly EvidenceElement[]): string[] {
  const files = new Set<string>();
  for (const element of elements) {
    const file = absoluteFileFor(root, element.location.file);
    if (file) files.add(file);
  }
  return [...files].sort();
}

function readSource(file: string): string | null {
  if (!existsSync(file)) return null;
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function sourceIdentityForElement(element: EvidenceElement): SourceIdentity {
  if (element.source) return element.source;
  const start = positionKey(element.location.span.startLine, element.location.span.startColumn);
  const end = positionKey(element.location.span.endLine, element.location.span.endColumn);
  return { file: element.location.file, start, end: Math.max(start + 1, end) };
}

function sourceLocationAt(
  root: string,
  file: string,
  source: string,
  start: number,
  end: number,
): SourceLocation {
  const startPoint = lineAndColumn(source, start);
  const endPoint = lineAndColumn(source, Math.max(start + 1, end));
  return {
    file: relativeFile(root, file),
    line: startPoint.line,
    column: startPoint.column,
    span: {
      startLine: startPoint.line,
      startColumn: startPoint.column,
      endLine: endPoint.line,
      endColumn: endPoint.column,
    },
  };
}

function sourcePositionForOffset(file: string, offset: number): { line: number; column: number } {
  const source = readSource(file) ?? "";
  return lineAndColumn(source, offset);
}

function lineAndColumn(source: string, offset: number): { line: number; column: number } {
  const boundedOffset = Math.max(0, Math.min(offset, source.length));
  const prefix = source.slice(0, boundedOffset);
  const lineBreaks = prefix.match(/\n/g)?.length ?? 0;
  const lastBreak = prefix.lastIndexOf("\n");
  return { line: lineBreaks + 1, column: boundedOffset - lastBreak };
}

function locationContainsRange(location: SourceLocation, range: SourceLocation): boolean {
  return locationContainsPoint(location, range.span.startLine, range.span.startColumn)
    && locationContainsPoint(location, range.span.endLine, range.span.endColumn);
}

function locationContainsPoint(location: SourceLocation, line: number, column: number): boolean {
  const start = positionKey(location.span.startLine, location.span.startColumn);
  const end = positionKey(location.span.endLine, location.span.endColumn);
  const point = positionKey(line, column);
  return start <= point && end >= point;
}

function relationHasLocation(relation: EvidenceRelation, location: SourceLocation): boolean {
  return relationLocations(relation).some((candidate) =>
    sameLocationFile(candidate, location)
    && locationContainsRange(candidate, location),
  );
}

function relationLocations(relation: EvidenceRelation): readonly SourceLocation[] {
  if (relation.evidence) return relation.evidence;
  return relation.proof?.locations ?? [];
}

function relationIsProven(relation: EvidenceRelation): boolean {
  return relation.status === "proven" || relation.confidence === "proven";
}

function uniqueElements(elements: readonly EvidenceElement[]): EvidenceElement[] {
  return [...new Map(elements.map((element) => [element.id, element])).values()];
}

function sameLocationFile(left: SourceLocation, right: SourceLocation): boolean {
  return left.file.replaceAll("\\", "/") === right.file.replaceAll("\\", "/");
}

function positionKey(line: number, column: number): number {
  return line * 1_000_000 + column;
}

function absoluteFileFor(root: string, file: string): string | null {
  const absolute = path.normalize(path.isAbsolute(file) ? file : path.resolve(root, file));
  return isInside(path.resolve(root), absolute) ? absolute : null;
}

function sameFile(root: string, evidenceFile: string, targetFile: string): boolean {
  const absoluteEvidenceFile = absoluteFileFor(root, evidenceFile);
  return absoluteEvidenceFile !== null && path.normalize(absoluteEvidenceFile) === path.normalize(targetFile);
}

function relativeFile(root: string, file: string): string {
  return path.relative(path.resolve(root), path.resolve(file)).replaceAll(path.sep, "/");
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
