import path from "node:path";
import * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import type { EvidenceSlice } from "./evidence-slice";
import { toSliceElement, toSliceRelation } from "./evidence-slice-normalization";
import { sourceRelationId, stableHash, type ProgramElement, type ProgramRelation } from "./scope-seam";
import type { RouteTotalitySelectedSource } from "./route-totality-selected-source";
import type { CompactProgramFact } from "./program-evidence-compact-facts";

export type SelectedFilesystemInputResolution =
  | { kind: "exact"; element: ProgramElement }
  | { kind: "ambiguous"; element: ProgramElement }
  | { kind: "unresolved" };

/** Exact compiler-node and provider-backed evidence lookup. Labels never join identity. */
export class RouteTotalityFieldProofIndex {
  private readonly elementsByKey = new Map<string, ProgramElement[]>();
  private readonly elementsById = new Map<string, ProgramElement>();
  private readonly relationsById = new Map<string, ProgramRelation>();
  private readonly relationsByFrom = new Map<string, ProgramRelation[]>();

  constructor(
    private readonly root: string,
    private readonly provider: EvidenceRelationProvider,
    readonly slice: EvidenceSlice,
  ) {
    for (const element of slice.elements) this.addElement(element);
    for (const relation of slice.relations) this.addRelation(relation);
  }

  element(node: TypeScript.Node, kind: string): ProgramElement | null {
    const source = node.getSourceFile();
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    const end = source.getLineAndCharacterOfPosition(node.getEnd());
    const file = path.relative(this.root, source.fileName);
    const key = `${file}:${start.line + 1}:${start.character + 1}:${end.line + 1}:${end.character + 1}`;
    let candidates = (this.elementsByKey.get(key) ?? []).filter((candidate) => candidate.kind === kind && candidate.status === "proven");
    if (candidates.length === 0) {
      for (const fact of this.provider.facts.fileCandidates(file)) {
        if (fact.kind !== kind || fact.confidence !== "proven" || locationKey(fact.location) !== key) continue;
        const element = this.provider.facts.getElement(fact.id);
        if (element) this.addElement(toSliceElement(element));
      }
      candidates = (this.elementsByKey.get(key) ?? []).filter((candidate) => candidate.kind === kind && candidate.status === "proven");
    }
    return candidates.length === 1 ? candidates[0] : null;
  }

  elements(node: TypeScript.Node, kind: string): ProgramElement[] {
    const source = node.getSourceFile();
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    const end = source.getLineAndCharacterOfPosition(node.getEnd());
    const file = path.relative(this.root, source.fileName);
    const key = `${file}:${start.line + 1}:${start.character + 1}:${end.line + 1}:${end.character + 1}`;
    let candidates = (this.elementsByKey.get(key) ?? []).filter((candidate) => candidate.kind === kind && candidate.status === "proven");
    if (candidates.length === 0) {
      for (const fact of this.provider.facts.fileCandidates(file)) {
        if (fact.kind !== kind || fact.confidence !== "proven" || locationKey(fact.location) !== key) continue;
        const element = this.provider.facts.getElement(fact.id);
        if (element) this.addElement(toSliceElement(element));
      }
      candidates = (this.elementsByKey.get(key) ?? []).filter((candidate) => candidate.kind === kind && candidate.status === "proven");
    }
    return [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()]
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  byId(id: string): ProgramElement | null {
    const existing = this.elementsById.get(id);
    if (existing) return existing;
    const element = this.provider.facts.getElement(id);
    if (!element) return null;
    const normalized = toSliceElement(element);
    this.addElement(normalized);
    return normalized;
  }

  relation(id: string): ProgramRelation | null { return this.relationsById.get(id) ?? null; }

  outgoing(id: string, cancellation?: AnalysisCancellationToken): readonly ProgramRelation[] {
    for (const relation of this.provider.getRelations(id, "forward", cancellation)) {
      this.byId(relation.from);
      this.byId(relation.to);
      this.addRelation(toSliceRelation(relation));
    }
    return [...(this.relationsByFrom.get(id) ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  }

  exactRelations(from: string, to: string, kind: string, proofKind: string, cancellation: AnalysisCancellationToken): ProgramRelation[] {
    return this.outgoing(from, cancellation).filter((relation) => (
      relation.to === to && relation.kind === kind && relation.proof.kind === proofKind
        && relation.status === "proven" && relation.proof.status === "proven"
    ));
  }

  /**
   * Materialize one route-scoped terminal only from one exact compiler-resolved
   * JSX occurrence and its single compiler definition relation.
   */
  componentRenderTerminal(occurrenceId: string, definitionId: string): ProgramElement | null {
    const occurrence = this.byId(occurrenceId);
    if (!occurrence || !occurrence.symbol) return null;
    const id = `route-component-render-terminal:${stableHash(`${occurrence.id}:${definitionId}`)}`;
    const existing = this.elementsById.get(id);
    if (existing) return existing;
    const proof = {
      kind: "component-render-terminal",
      detail: "One compiler-resolved JSX component occurrence renders through this exact route terminal.",
      locations: [occurrence.location],
      status: "proven" as const,
    };
    const terminal: ProgramElement = {
      id,
      kind: "render-terminal",
      fieldName: null,
      operationKind: null,
      index: null,
      label: occurrence.label,
      source: occurrence.source,
      location: occurrence.location,
      status: "proven",
      proof: [proof],
      symbol: occurrence.symbol,
      module: occurrence.module ?? null,
      componentBinding: null,
      ownerId: occurrence.id,
      attributes: { terminalKind: "component-render-boundary", definitionId },
      originRoles: [],
      terminalRoles: ["render"],
      boundary: null,
    };
    const relation: ProgramRelation = {
      id: sourceRelationId(occurrence.id, terminal.id, "render-terminal", proof),
      from: occurrence.id,
      to: terminal.id,
      kind: "render-terminal",
      status: "proven",
      proof,
    };
    this.addElement(terminal);
    this.addRelation(relation);
    return terminal;
  }

  /** Materialize the exact field-consumer terminal inside its compiler owner. */
  fieldConsumerTerminal(consumerId: string): ProgramElement | null {
    const consumer = this.byId(consumerId);
    if (!consumer || consumer.kind !== "field-consumer" || !consumer.ownerId || consumer.status !== "proven") return null;
    const id = `route-field-consumer-terminal:${stableHash(consumer.id)}`;
    const existing = this.elementsById.get(id);
    if (existing) return existing;
    const proof = {
      kind: "render-consumer" as const,
      detail: "The compiler-resolved field consumer defines this exact field-lineage render terminal.",
      locations: [consumer.location],
      status: "proven" as const,
    };
    const terminal: ProgramElement = {
      id,
      kind: "render-terminal",
      fieldName: null,
      operationKind: null,
      index: null,
      label: consumer.label,
      source: consumer.source,
      location: consumer.location,
      status: "proven",
      proof: [proof],
      symbol: consumer.symbol,
      module: consumer.module ?? null,
      componentBinding: null,
      ownerId: consumer.ownerId,
      attributes: { terminalKind: "field-consumer" },
      originRoles: [],
      terminalRoles: ["render"],
      boundary: null,
    };
    this.addElement(terminal);
    return terminal;
  }

  /** Materialize one exact direct scalar consumer for a JSX child expression. */
  scalarFieldConsumer(field: ProgramElement, definition: ProgramElement, label: string): ProgramElement {
    const id = `route-scalar-field-consumer:${stableHash(`${field.id}:${definition.id}:${label}`)}`;
    const existing = this.elementsById.get(id);
    if (existing) return existing;
    const proof = {
      kind: "render-consumer" as const,
      detail: "The compiler identifies one exact direct scalar field expression at its JSX child consumer.",
      locations: [field.location],
      status: "proven" as const,
    };
    const consumer: ProgramElement = {
      id,
      kind: "field-consumer",
      fieldName: field.fieldName,
      operationKind: "field-read",
      index: null,
      label,
      source: field.source,
      location: field.location,
      status: "proven",
      proof: [proof],
      symbol: field.symbol,
      module: field.module ?? null,
      componentBinding: null,
      ownerId: definition.id,
      attributes: { consumerKind: "render", label },
      originRoles: [],
      terminalRoles: ["render"],
      boundary: null,
    };
    const relationProof = {
      kind: "render-consumer" as const,
      detail: "The exact scalar field expression reaches its occurrence-owned consumer.",
      locations: [field.location],
      status: "proven" as const,
    };
    const relation: ProgramRelation = {
      id: sourceRelationId(field.id, consumer.id, "consumer-value", relationProof),
      from: field.id,
      to: consumer.id,
      kind: "consumer-value",
      status: "proven",
      proof: relationProof,
    };
    this.addElement(consumer);
    this.addRelation(relation);
    return consumer;
  }

  /** Materialize one exact consumer-to-field-lineage-terminal relation. */
  consumerRenderTerminal(consumerId: string, terminalId: string): ProgramRelation | null {
    const consumer = this.byId(consumerId);
    const terminal = this.byId(terminalId);
    if (!consumer || !terminal || terminal.kind !== "render-terminal" || consumer.kind === "render-terminal") return null;
    const proof = {
      kind: "field-consumer-terminal" as const,
      detail: "Compiler-backed containment binds this exact consumer value to its field-lineage render terminal.",
      locations: [consumer.location, terminal.location],
      status: "proven" as const,
    };
    const relation: ProgramRelation = {
      id: sourceRelationId(consumer.id, terminal.id, "render-terminal", proof),
      from: consumer.id,
      to: terminal.id,
      kind: "render-terminal",
      status: "proven",
      proof,
    };
    this.addRelation(relation);
    return relation;
  }

  materializedElements(): ProgramElement[] {
    return [...this.elementsById.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  materializedRelations(): ProgramRelation[] {
    return [...this.relationsById.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  elementsAtLocation(location: ProgramElement["location"], kinds: readonly string[]): ProgramElement[] {
    const matches: ProgramElement[] = [];
    for (const fact of this.provider.facts.fileCandidates(location.file)) {
      if (!kinds.includes(fact.kind) || fact.confidence !== "proven" || locationKey(fact.location) !== locationKey(location)) continue;
      const element = this.byId(fact.id);
      if (element) matches.push(element);
    }
    return [...new Map(matches.map((element) => [element.id, element])).values()]
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  graph() {
    return {
      element: (id: string) => this.byId(id) ?? undefined,
      relation: (id: string) => this.relation(id) ?? undefined,
      outgoing: (id: string) => this.outgoing(id),
    };
  }

  selectedFilesystemInput(evidence: NonNullable<RouteTotalitySelectedSource["evidence"]>): SelectedFilesystemInputResolution {
    const exactFact = this.provider.facts.getFact(evidence.elementId);
    const exactElement = this.byId(evidence.elementId);
    if (!exactFact || !exactElement || !isSelectedFileInputFact(exactFact)
      || locationKey(exactFact.location) !== selectedLocationKey(evidence)) return { kind: "unresolved" };
    const matches: string[] = [];
    for (const fact of this.provider.facts.fileCandidates(evidence.file)) {
      if (!isSelectedFileInputFact(fact) || locationKey(fact.location) !== selectedLocationKey(evidence)) continue;
      matches.push(fact.id);
    }
    if (matches.length === 1 && matches[0] === evidence.elementId) return { kind: "exact", element: exactElement };
    return matches.includes(evidence.elementId) ? { kind: "ambiguous", element: exactElement } : { kind: "unresolved" };
  }

  private addElement(element: ProgramElement): void {
    if (this.elementsById.has(element.id)) return;
    this.elementsById.set(element.id, element);
    const key = locationKey(element.location);
    const values = this.elementsByKey.get(key) ?? [];
    values.push(element);
    this.elementsByKey.set(key, values);
  }

  private addRelation(relation: ProgramRelation): void {
    if (this.relationsById.has(relation.id)) return;
    this.relationsById.set(relation.id, relation);
    const values = this.relationsByFrom.get(relation.from) ?? [];
    values.push(relation);
    this.relationsByFrom.set(relation.from, values);
  }
}

function isSelectedFileInputFact(fact: CompactProgramFact | undefined): boolean {
  return Boolean(fact && fact.kind === "file-input" && fact.confidence === "proven" && fact.proofKind === "host-api"
    && fact.attributes.operation === "readFile" && fact.attributes.module === "node:fs/promises");
}

function selectedLocationKey(evidence: NonNullable<RouteTotalitySelectedSource["evidence"]>): string {
  return `${evidence.file}:${evidence.span.startLine}:${evidence.span.startColumn}:${evidence.span.endLine}:${evidence.span.endColumn}`;
}

function locationKey(location: ProgramElement["location"]): string {
  return `${location.file}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}
