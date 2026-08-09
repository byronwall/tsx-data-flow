import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceSlice } from "./evidence-slice";
import {
  isFullyProvenElement,
  isFullyProvenRelation,
} from "./route-totality-field-lineage-transition";
import type { FieldState } from "./route-totality-field-lineage-support";
import type { RouteTotalityAnchorIndex } from "./route-totality-anchor-index";

export type ComponentPropBindingReadiness = "ready" | "missing" | "partial" | "ambiguous";

export type ComponentPropBindingContext = {
  boundaryCount: number;
  occurrenceAnchorCount: number;
  receiverCount: number;
  receiverRootProven: boolean;
  boundary: RouteTotalityAnchorIndex["occurrenceAnchors"][number] | null;
};

export function componentPropBindingContext(
  sourceElementId: string,
  target: EvidenceSlice["elements"][number] | undefined,
  outgoing: readonly EvidenceSlice["relations"][number][],
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  anchors: RouteTotalityAnchorIndex,
  cancellation: AnalysisCancellationToken,
): ComponentPropBindingContext | null {
  cancellation.throwIfCancelled();
  if (!target) return null;
  const boundaries = uniqueProvenComponentPropBoundaries(sourceElementId, outgoing, elementsById, cancellation);
  const boundary = boundaries.length === 1
    ? (anchors.occurrenceAnchorsByEvidenceElementId.get(boundaries[0].to) ?? [])[0] ?? null
    : null;
  const sourceKind = elementsById.get(sourceElementId)?.kind;
  const receiverRelations = sourceKind === "component-prop-binding"
    ? (relationsByTo.get(target.id) ?? []).filter((candidate) =>
      candidate.kind === "component-prop-binding"
        && candidate.from === sourceElementId
        && isFullyProvenRelation(candidate, cancellation),
    )
    : (relationsByFrom.get(target.id) ?? []).filter((candidate) =>
      candidate.kind === "component-prop-binding" && isFullyProvenRelation(candidate, cancellation),
    );
  const receiverRootProven = sourceKind === "component-prop-binding"
    ? receiverRelations.length === 1
      && receiverRootForBindingReceiver(target.id, relationsByTo, elementsById, cancellation)
    : receiverRelations.length === 1
      && receiverRootForBindingReceiver(receiverRelations[0].to, relationsByTo, elementsById, cancellation);
  cancellation.throwIfCancelled();
  return {
    boundaryCount: boundaries.length,
    occurrenceAnchorCount: boundaries.length === 1
      ? anchors.occurrenceAnchorsByEvidenceElementId.get(boundaries[0].to)?.length ?? 0
      : boundaries.length,
    receiverCount: receiverRelations.length,
    receiverRootProven,
    boundary,
  };
}

export function componentPropBindingReadiness(
  sourceElementId: string,
  boundaryRelation: EvidenceSlice["relations"][number],
  outgoing: readonly EvidenceSlice["relations"][number][],
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  anchors: RouteTotalityAnchorIndex,
  cancellation: AnalysisCancellationToken,
): ComponentPropBindingReadiness {
  cancellation.throwIfCancelled();
  const boundaryCandidates = uniqueProvenComponentPropBoundaries(sourceElementId, outgoing, elementsById, cancellation)
    .filter((candidate) => candidate.to === boundaryRelation.to);
  if (boundaryCandidates.length !== 1) return boundaryCandidates.length > 1 ? "ambiguous" : "partial";
  const boundaryAnchors = anchors.occurrenceAnchorsByEvidenceElementId.get(boundaryRelation.to) ?? [];
  if (boundaryAnchors.length !== 1) return "ambiguous";
  const bindings = outgoing.filter((candidate) => candidate.kind === "component-prop-binding");
  if (bindings.length === 0) return "missing";
  const provenBindings = bindings.filter((candidate) => isFullyProvenRelation(candidate, cancellation));
  if (provenBindings.length !== bindings.length) return "partial";
  if (provenBindings.length !== 1) return "ambiguous";
  const bindingTarget = elementsById.get(provenBindings[0].to);
  if (!bindingTarget || !isFullyProvenElement(bindingTarget, cancellation)) return "partial";
  const receivers = (relationsByFrom.get(bindingTarget.id) ?? []).filter((candidate) => candidate.kind === "component-prop-binding");
  if (receivers.length === 0) return "partial";
  const provenReceivers = receivers.filter((candidate) => isFullyProvenRelation(candidate, cancellation));
  if (provenReceivers.length !== receivers.length) return "partial";
  if (provenReceivers.length !== 1) return "ambiguous";
  return receiverRootForBindingReceiver(provenReceivers[0].to, relationsByTo, elementsById, cancellation)
    ? "ready"
    : "partial";
}

export function lastFieldSegment(field: FieldState): string | null {
  return field.segments.at(-1)?.value ?? null;
}

export function uniqueProvenComponentPropBoundaries(
  sourceElementId: string,
  outgoing: readonly EvidenceSlice["relations"][number][],
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  cancellation: AnalysisCancellationToken,
): EvidenceSlice["relations"][number][] {
  cancellation.throwIfCancelled();
  const byTarget = new Map<string, EvidenceSlice["relations"][number]>();
  for (const candidate of outgoing) {
    cancellation.throwIfCancelled();
    if (candidate.kind !== "component-prop"
      || candidate.from !== sourceElementId
      || elementsById.get(candidate.to)?.kind !== "component-occurrence"
      || !isFullyProvenRelation(candidate, cancellation)) continue;
    const existing = byTarget.get(candidate.to);
    if (!existing || candidate.id.localeCompare(existing.id) < 0) byTarget.set(candidate.to, candidate);
  }
  const values = [...byTarget.values()];
  cancellation.throwIfCancelled();
  return values;
}

function receiverRootForBindingReceiver(
  receiverId: string,
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  const receiver = elementsById.get(receiverId);
  if (!receiver || receiver.kind !== "field-read" || receiver.operationKind !== "field-read" || receiver.fieldName === null) return false;
  const fieldInputs = (relationsByTo.get(receiverId) ?? []).filter((relation) =>
    relation.kind === "field-input" && isFullyProvenRelation(relation, cancellation),
  );
  if (fieldInputs.length !== 1) return false;
  const root = elementsById.get(fieldInputs[0].from);
  if (!root || root.kind !== "value" || !isFullyProvenElement(root, cancellation)) return false;
  const references = (relationsByTo.get(root.id) ?? []).filter((relation) =>
    relation.kind === "references"
      && elementsById.get(relation.from)?.kind === "parameter"
      && isFullyProvenRelation(relation, cancellation),
  );
  if (references.length !== 1) return false;
  const parameter = elementsById.get(references[0].from);
  cancellation.throwIfCancelled();
  return Boolean(parameter?.symbol && root.symbol && parameter.symbol === root.symbol);
}
