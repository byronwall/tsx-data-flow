import type { AnalysisCancellationToken } from "./cancellation";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { isExactSourceCarrierRelation } from "./route-totality-field-transfer-carrier-verifier";
import type { ProgramElement, ProgramRelation } from "./scope-seam";

export type FieldCarrierPath = { call: ProgramElement; relations: ProgramRelation[] };
export type FieldCarrierSearchResult =
  | { kind: "complete"; paths: FieldCarrierPath[] }
  | { kind: "budget-exhausted"; paths: FieldCarrierPath[] };

export type FieldCarrierSearchLimits = { maxStates: number; maxDepth: number };
export const FIELD_CARRIER_SEARCH_LIMITS: FieldCarrierSearchLimits = { maxStates: 256, maxDepth: 24 };

/** Search exact carrier relations. Any unvisited state makes uniqueness unavailable. */
export function searchFieldCarrierPaths(
  index: Pick<RouteTotalityFieldProofIndex, "outgoing" | "byId">,
  originId: string,
  collectionFieldId: string,
  cancellation: AnalysisCancellationToken,
  limits: FieldCarrierSearchLimits = FIELD_CARRIER_SEARCH_LIMITS,
): FieldCarrierSearchResult {
  const queue: Array<{ ids: string[]; relations: ProgramRelation[] }> = [{ ids: [originId], relations: [] }];
  const matches: FieldCarrierPath[] = [];
  let visited = 0;
  let exhausted = false;
  while (queue.length > 0) {
    cancellation.throwIfCancelled();
    if (visited >= limits.maxStates) {
      exhausted = true;
      break;
    }
    visited += 1;
    const current = queue.shift()!;
    const currentId = current.ids.at(-1)!;
    for (const relation of index.outgoing(currentId, cancellation)) {
      cancellation.throwIfCancelled();
      if (current.ids.includes(relation.to) || relation.status !== "proven" || relation.proof.status !== "proven") continue;
      const target = index.byId(relation.to);
      const source = index.byId(relation.from);
      if (!source || !target || source.status !== "proven" || target.status !== "proven") continue;
      if (relation.to === collectionFieldId && relation.kind === "field-input"
        && relation.proof.kind === "property-access" && target.kind === "field-read") {
        matches.push({ call: source, relations: current.relations });
        continue;
      }
      if (!isExactSourceCarrierRelation(source, target, relation)) continue;
      if (current.relations.length >= limits.maxDepth) {
        exhausted = true;
        continue;
      }
      queue.push({ ids: [...current.ids, relation.to], relations: [...current.relations, relation] });
    }
  }
  const unique = [...new Map(matches.map((item) => [
    item.relations.map((relation) => relation.id).join("\0"),
    item,
  ])).values()];
  return exhausted ? { kind: "budget-exhausted", paths: unique } : { kind: "complete", paths: unique };
}
