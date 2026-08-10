import * as TypeScript from "typescript";
import type { EvidenceSlice } from "./evidence-slice";
import type { ProgramElement } from "./scope-seam";

/** Exact compiler-node to materialized-evidence lookup. Labels never take part. */
export class RouteTotalityFieldProofIndex {
  private readonly elementsByKey = new Map<string, ProgramElement[]>();
  private readonly elementsById = new Map<string, ProgramElement>();
  private readonly relationsByFrom = new Map<string, EvidenceSlice["relations"]>();

  constructor(private readonly ts: typeof TypeScript, readonly slice: EvidenceSlice) {
    for (const element of slice.elements) {
      this.elementsById.set(element.id, element);
      const key = locationKey(element.location);
      const values = this.elementsByKey.get(key) ?? [];
      values.push(element);
      this.elementsByKey.set(key, values);
    }
    for (const relation of slice.relations) {
      const values = this.relationsByFrom.get(relation.from) ?? [];
      values.push(relation);
      this.relationsByFrom.set(relation.from, values);
    }
  }

  element(node: TypeScript.Node, kind: ProgramElement["kind"]): ProgramElement | null {
    const source = node.getSourceFile();
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    const end = source.getLineAndCharacterOfPosition(node.getEnd());
    const candidates = (this.elementsByKey.get(`${source.fileName}:${start.line + 1}:${start.character + 1}:${end.line + 1}:${end.character + 1}`) ?? [])
      .filter((candidate) => candidate.kind === kind && candidate.status === "proven");
    return candidates.length === 1 ? candidates[0] : null;
  }

  byId(id: string): ProgramElement | null { return this.elementsById.get(id) ?? null; }

  outgoing(id: string) { return this.relationsByFrom.get(id) ?? []; }
}

function locationKey(location: ProgramElement["location"]): string {
  return `${location.file}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}
