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
  bindingIncomplete: boolean;
  boundary: RouteTotalityAnchorIndex["occurrenceAnchors"][number] | null;
};

export function componentBoundaryFrontierOccurrenceId(currentOccurrenceId: string | null): string | null {
  return currentOccurrenceId;
}

export function componentPropBoundarySemanticKey(
  relation: Pick<EvidenceSlice["relations"][number], "id" | "kind" | "from" | "to" | "status" | "proof">,
): string {
  return relation.id;
}

export function componentPropBindingContext(
  sourceElementId: string,
  target: EvidenceSlice["elements"][number] | undefined,
  outgoing: readonly EvidenceSlice["relations"][number][],
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
  anchors: RouteTotalityAnchorIndex,
  cancellation: AnalysisCancellationToken,
): ComponentPropBindingContext | null {
  cancellation.throwIfCancelled();
  if (!target) return null;
  const boundaryGroups = componentPropBoundaryGroups(sourceElementId, outgoing, elementsById, cancellation);
  const provenBoundaryCounts = boundaryGroups.map((group) => distinctProvenBoundaryRelations(group.relations, cancellation).length);
  const boundaryCount = boundaryGroups.length > 1
    ? boundaryGroups.length
    : provenBoundaryCounts[0] ?? 0;
  const completeBoundaryGroups = boundaryGroups.filter((group) => group.relations.every((candidate) => isFullyProvenRelation(candidate, cancellation)));
  const boundaryAnchors = boundaryGroups.length === 1 && completeBoundaryGroups.length === 1 && boundaryCount === 1
    ? anchors.occurrenceAnchorsByEvidenceElementId.get(boundaryGroups[0].targetId) ?? []
    : [];
  const boundary = boundaryGroups.length === 1 && completeBoundaryGroups.length === 1 && boundaryCount === 1 && boundaryAnchors.length === 1
    ? boundaryAnchors[0]
    : null;
  const sourceKind = elementsById.get(sourceElementId)?.kind;
  const receiverCandidates = sourceKind === "component-prop-binding"
    ? (relationsByTo.get(target.id) ?? []).filter((candidate) =>
      candidate.kind === "component-prop-binding"
        && candidate.from === sourceElementId
    )
    : (relationsByFrom.get(target.id) ?? []).filter((candidate) =>
      candidate.kind === "component-prop-binding",
    );
  const receiverRelations = receiverCandidates.filter((candidate) => isFullyProvenRelation(candidate, cancellation));
  const receiverRootProven = sourceKind === "component-prop-binding"
    ? receiverCandidates.length === 1 && receiverRelations.length === 1
      && receiverRootForBindingReceiver(target.id, relationsByTo, elementsById, cancellation)
    : receiverCandidates.length === 1 && receiverRelations.length === 1
      && receiverRootForBindingReceiver(receiverRelations[0].to, relationsByTo, elementsById, cancellation);
  const bindingElementId = target.kind === "component-prop-binding"
    ? target.id
    : sourceKind === "component-prop-binding" ? sourceElementId : null;
  cancellation.throwIfCancelled();
  return {
    boundaryCount,
    occurrenceAnchorCount: boundaryGroups.length === 1 && completeBoundaryGroups.length === 1 && boundaryCount === 1
      ? boundaryAnchors.length
      : boundaryCount,
    receiverCount: receiverCandidates.length,
    receiverRootProven,
    bindingIncomplete: bindingElementId === null
      ? completeBoundaryGroups.length !== boundaryGroups.length || receiverRelations.length !== receiverCandidates.length
      : componentPropBindingEvidenceIncomplete(
        bindingElementId,
        relationsByFrom,
        relationsByTo,
        elementsById,
        gapsByFrom,
        cancellation,
      ) || completeBoundaryGroups.length !== boundaryGroups.length || receiverRelations.length !== receiverCandidates.length,
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
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
  anchors: RouteTotalityAnchorIndex,
  cancellation: AnalysisCancellationToken,
): ComponentPropBindingReadiness {
  cancellation.throwIfCancelled();
  const boundaryGroups = componentPropBoundaryGroups(sourceElementId, outgoing, elementsById, cancellation);
  if (boundaryGroups.length !== 1) return boundaryGroups.length > 1 ? "ambiguous" : "partial";
  const boundaryGroup = boundaryGroups[0];
  if (boundaryGroup.targetId !== boundaryRelation.to) return "partial";
  const provenBoundaryRelations = distinctProvenBoundaryRelations(boundaryGroup.relations, cancellation);
  if (provenBoundaryRelations.length > 1) return "ambiguous";
  if (provenBoundaryRelations.length === 0) return "partial";
  if (!boundaryGroup.relations.every((candidate) => isFullyProvenRelation(candidate, cancellation))) return "partial";
  const boundaryAnchors = anchors.occurrenceAnchorsByEvidenceElementId.get(boundaryRelation.to) ?? [];
  if (boundaryAnchors.length === 0) return "missing";
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
  if (componentPropBindingEvidenceIncomplete(
    bindingTarget.id,
    relationsByFrom,
    relationsByTo,
    elementsById,
    gapsByFrom,
    cancellation,
  )) return "partial";
  return receiverRootForBindingReceiver(provenReceivers[0].to, relationsByTo, elementsById, cancellation)
    ? "ready"
    : "partial";
}

export function componentPropBindingEvidenceIncomplete(
  bindingId: string,
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number] | readonly EvidenceSlice["elements"][number][]>,
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  if ((gapsByFrom.get(bindingId) ?? []).length > 0) return true;
  const receivers = (relationsByFrom.get(bindingId) ?? []).filter((relation) =>
    relation.kind === "component-prop-binding",
  );
  for (const receiver of receivers) {
    cancellation.throwIfCancelled();
    if (hasGap(receiver.to, gapsByFrom)) return true;
    const fieldInputs = (relationsByTo.get(receiver.to) ?? []).filter((relation) => relation.kind === "field-input");
    for (const fieldInput of fieldInputs) {
      cancellation.throwIfCancelled();
      if (hasGap(fieldInput.from, gapsByFrom)) return true;
      const references = (relationsByTo.get(fieldInput.from) ?? []).filter((relation) =>
        relation.kind === "references"
          && exactBindingElement(elementsById, relation.from)?.kind === "parameter",
      );
      for (const reference of references) {
        cancellation.throwIfCancelled();
        if (hasGap(reference.from, gapsByFrom)) return true;
      }
    }
  }
  cancellation.throwIfCancelled();
  return false;
}

function exactBindingElement(
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number] | readonly EvidenceSlice["elements"][number][]>,
  elementId: string,
): EvidenceSlice["elements"][number] | undefined {
  const value = elementsById.get(elementId);
  if (!value) return undefined;
  if ("length" in value) return value.length === 1 ? value[0] : undefined;
  return value;
}

function hasGap(
  elementId: string,
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
): boolean {
  return (gapsByFrom.get(elementId) ?? []).length > 0;
}

export function lastFieldSegment(field: FieldState): string | null {
  return field.segments.at(-1)?.value ?? null;
}

export function provenComponentPropBoundaries(
  sourceElementId: string,
  outgoing: readonly EvidenceSlice["relations"][number][],
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  cancellation: AnalysisCancellationToken,
): EvidenceSlice["relations"][number][] {
  cancellation.throwIfCancelled();
  const values: EvidenceSlice["relations"][number][] = [];
  for (const group of componentPropBoundaryGroups(sourceElementId, outgoing, elementsById, cancellation)) {
    cancellation.throwIfCancelled();
    if (!group.relations.every((candidate) => isFullyProvenRelation(candidate, cancellation))) continue;
    const proven = distinctProvenBoundaryRelations(group.relations, cancellation);
    if (proven.length === 1) values.push(proven[0]);
  }
  cancellation.throwIfCancelled();
  return values;
}

function distinctProvenBoundaryRelations(
  relations: readonly EvidenceSlice["relations"][number][],
  cancellation: AnalysisCancellationToken,
): EvidenceSlice["relations"][number][] {
  cancellation.throwIfCancelled();
  const unique = new Map<string, EvidenceSlice["relations"][number]>();
  for (const relation of relations) {
    cancellation.throwIfCancelled();
    if (!isFullyProvenRelation(relation, cancellation)) continue;
    const key = componentPropBoundarySemanticKey(relation);
    if (!unique.has(key)) unique.set(key, relation);
  }
  cancellation.throwIfCancelled();
  return [...unique.values()];
}

type ComponentPropBoundaryGroup = {
  targetId: string;
  relations: EvidenceSlice["relations"][number][];
};

function componentPropBoundaryGroups(
  sourceElementId: string,
  outgoing: readonly EvidenceSlice["relations"][number][],
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  cancellation: AnalysisCancellationToken,
): ComponentPropBoundaryGroup[] {
  cancellation.throwIfCancelled();
  const groups = new Map<string, ComponentPropBoundaryGroup>();
  for (const candidate of outgoing) {
    cancellation.throwIfCancelled();
    if (candidate.kind === "component-prop"
      && candidate.from === sourceElementId
      && elementsById.get(candidate.to)?.kind === "component-occurrence") {
      const group = groups.get(candidate.to) ?? { targetId: candidate.to, relations: [] };
      group.relations.push(candidate);
      groups.set(candidate.to, group);
    }
  }
  const values = [...groups.values()];
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
  if (!receiver
    || !isFullyProvenElement(receiver, cancellation)
    || receiver.kind !== "field-read"
    || receiver.operationKind !== "field-read"
    || receiver.fieldName === null) return false;
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
  return Boolean(
    parameter
      && isFullyProvenElement(parameter, cancellation)
      && parameter.symbol
      && root.symbol
      && parameter.symbol === root.symbol,
  );
}
