import path from "node:path";
import * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import type { EvidenceSlice } from "./evidence-slice";
import { toSliceElement, toSliceRelation } from "./evidence-slice-normalization";
import type { ProgramElement, ProgramRelation } from "./scope-seam";
import type { RouteTotalitySelectedSource } from "./route-totality-selected-source";

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

  materializedElements(): ProgramElement[] {
    return [...this.elementsById.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  materializedRelations(): ProgramRelation[] {
    return [...this.relationsById.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  graph() {
    return {
      element: (id: string) => this.byId(id) ?? undefined,
      relation: (id: string) => this.relation(id) ?? undefined,
      outgoing: (id: string) => this.outgoing(id),
    };
  }

  selectedFilesystemInput(evidence: NonNullable<RouteTotalitySelectedSource["evidence"]>): ProgramElement | null {
    const matches: ProgramElement[] = [];
    for (const fact of this.provider.facts.fileCandidates(evidence.file)) {
      if (fact.kind !== "file-input" || fact.confidence !== "proven" || fact.proofKind !== "host-api"
        || fact.attributes.operation !== "readFile" || fact.attributes.module !== "node:fs/promises"
        || locationKey(fact.location) !== `${evidence.file}:${evidence.span.startLine}:${evidence.span.startColumn}:${evidence.span.endLine}:${evidence.span.endColumn}`) continue;
      const element = this.byId(fact.id);
      if (element) matches.push(element);
    }
    return matches.length === 1 ? matches[0] : null;
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

function locationKey(location: ProgramElement["location"]): string {
  return `${location.file}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}
