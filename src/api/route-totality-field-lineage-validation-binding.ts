import type { AnalysisCancellationToken } from "../analysis/cancellation";
import {
  componentPropBindingEvidenceIncomplete,
  componentPropBoundarySemanticKey,
} from "../analysis/route-totality-field-lineage-component-binding";
import {
  componentBindingDefinitionEvidence,
  componentBindingOwnershipMatches,
  componentBindingReceiverEvidence,
  type ComponentBindingEvidenceGraph,
  type ComponentBindingOwnershipExpectation,
} from "../analysis/program-component-binding-metadata";
import {
  isFullyProvenElement,
  isFullyProvenRelation,
} from "../analysis/route-totality-field-lineage-transition";
import {
  exactElement,
  exactRelation,
  type EvidenceElement,
  type EvidenceIndexes,
  type EvidenceRelation,
  type SurfaceIndexes,
} from "./route-totality-field-lineage-validation-index";

export function componentPropBindingContext(
  source: EvidenceElement,
  target: EvidenceElement,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  const boundaryGroups = componentPropBoundaryGroups(source.id, evidence, cancellation);
  const boundaryCounts = boundaryGroups.map((group) => distinctProvenBoundaryCount(group.relations, cancellation));
  const boundaryCount = boundaryGroups.length > 1 ? boundaryGroups.length : boundaryCounts[0] ?? 0;
  const completeBoundaryGroups = boundaryGroups.filter((group) => group.relations.every((relation) => isFullyProvenRelation(relation, cancellation)));
  const bindingSource = source.kind === "component-prop-binding";
  const receiverCandidates = bindingSource
    ? (evidence.incoming.get(target.id) ?? []).filter((relation) =>
      relation.from === source.id
        && relation.kind === "component-prop-binding",
    )
    : (evidence.outgoing.get(target.id) ?? []).filter((relation) =>
      relation.kind === "component-prop-binding",
    );
  const receiverRelations = receiverCandidates.filter((relation) => isFullyProvenRelation(relation, cancellation));
  const bindingElementId = target.kind === "component-prop-binding"
    ? target.id
    : bindingSource ? source.id : null;
  const bindingElement = bindingElementId ? exactElement(evidence, bindingElementId) : undefined;
  const graph: ComponentBindingEvidenceGraph = {
    element: (id) => exactElement(evidence, id),
    incoming: (id) => evidence.incoming.get(id) ?? [],
    outgoing: (id) => evidence.outgoing.get(id) ?? [],
  };
  const receiverId = receiverCandidates.length === 1
    ? bindingSource ? target.id : receiverCandidates[0].to
    : null;
  const receiverEvidence = receiverId
    ? componentBindingReceiverEvidence(receiverId, graph, cancellation)
    : null;
  const ownershipOccurrenceId = boundaryGroups.length === 1
    ? boundaryGroups[0].targetId
    : bindingElement?.componentBinding?.componentOccurrenceElementId ?? null;
  const boundaryAnchors = ownershipOccurrenceId
    ? surface.anchors.occurrenceAnchorsByEvidenceElementId.get(ownershipOccurrenceId) ?? []
    : [];
  const definitionEvidence = ownershipOccurrenceId
    ? componentBindingDefinitionEvidence(ownershipOccurrenceId, graph, cancellation)
    : { candidates: [], definition: null, ready: false };
  const ownershipExpectation: ComponentBindingOwnershipExpectation | null = receiverEvidence?.parameter
    && receiverEvidence.receiver
    && definitionEvidence.definition
    && ownershipOccurrenceId
    ? {
      componentOccurrenceElementId: ownershipOccurrenceId,
      componentDefinitionId: definitionEvidence.definition.id,
      parameterElementId: receiverEvidence.parameter.id,
      receiverElementId: receiverEvidence.receiver.id,
      candidateCount: receiverCandidates.length,
    }
    : null;
  const ownershipReady = Boolean(
    bindingElement
      && isFullyProvenElement(bindingElement, cancellation)
      && ownershipExpectation
      && definitionEvidence.ready
      && receiverEvidence?.ready
      && boundaryAnchors.length === 1
      && componentBindingOwnershipMatches(bindingElement?.componentBinding, ownershipExpectation),
  );
  const bindingAmbiguous = receiverCandidates.length > 1
    || (receiverEvidence?.fieldInputCandidates.length ?? 0) > 1
    || (receiverEvidence?.referenceCandidates.length ?? 0) > 1
    || definitionEvidence.candidates.length > 1
    || boundaryCount > 1
    || boundaryAnchors.length > 1;
  const boundary = bindingSource
    ? null
    : boundaryGroups.length === 1
      && completeBoundaryGroups.length === 1
      && boundaryCount === 1
      && ownershipReady
      ? boundaryAnchors[0]
      : null;
  return {
    boundaryCount,
    occurrenceAnchorCount: ownershipOccurrenceId ? boundaryAnchors.length : boundaryCount,
    receiverCount: receiverCandidates.length,
    receiverFieldInputCount: receiverEvidence?.fieldInputCandidates.length ?? 0,
    receiverRootProven: Boolean(
      receiverCandidates.length === 1
        && receiverRelations.length === 1
        && receiverEvidence?.ready
        && ownershipReady,
    ),
    bindingAmbiguous,
    bindingIncomplete: bindingElementId === null
      ? true
      : componentPropBindingEvidenceIncomplete(
        bindingElementId,
        evidence.outgoing,
        evidence.incoming,
        evidence.elementsById,
        evidence.gapsByFrom,
        cancellation,
      )
        || (!bindingSource && completeBoundaryGroups.length !== boundaryGroups.length)
        || receiverRelations.length !== receiverCandidates.length
        || !receiverEvidence?.ready
        || !definitionEvidence.ready
        || !ownershipReady,
    boundary,
  };
}

export function componentPropBoundary(
  sourceElementId: string,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  cancellation: AnalysisCancellationToken,
  bindingElementId?: string,
): { occurrenceId: string } | null {
  cancellation.throwIfCancelled();
  const bindings = (evidence.outgoing.get(sourceElementId) ?? []).filter((relation) =>
    relation.kind === "component-prop-binding"
      && (bindingElementId === undefined || relation.to === bindingElementId),
  );
  if (bindings.length !== 1 || !isFullyProvenRelation(bindings[0], cancellation)) return null;
  const bindingTarget = exactElement(evidence, bindings[0].to);
  const source = exactElement(evidence, sourceElementId);
  if (!source || !bindingTarget || bindingTarget.kind !== "component-prop-binding") return null;
  const context = componentPropBindingContext(source, bindingTarget, evidence, surface, cancellation);
  if (!context?.boundary) return null;
  return { occurrenceId: context.boundary.endpoint.id };
}

export function hasComponentPropBridge(
  from: string,
  to: string,
  elementIds: readonly string[],
  relationIds: readonly string[],
  evidence: EvidenceIndexes,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  const fromIndex = elementIds.indexOf(from);
  const toIndex = elementIds.indexOf(to);
  if (fromIndex < 0 || toIndex <= fromIndex) return false;
  for (let index = fromIndex; index < toIndex; index += 1) {
    cancellation.throwIfCancelled();
    const relation = exactRelation(evidence, relationIds[index]);
    if (relation?.kind === "component-prop-binding") return true;
  }
  cancellation.throwIfCancelled();
  return false;
}

type ComponentPropBoundaryGroup = {
  targetId: string;
  relations: EvidenceRelation[];
};

function distinctProvenBoundaryCount(
  relations: readonly EvidenceRelation[],
  cancellation: AnalysisCancellationToken,
): number {
  return distinctProvenBoundaryRelations(relations, cancellation).length;
}

function distinctProvenBoundaryRelations(
  relations: readonly EvidenceRelation[],
  cancellation: AnalysisCancellationToken,
): EvidenceRelation[] {
  cancellation.throwIfCancelled();
  const unique = new Map<string, EvidenceRelation>();
  for (const relation of relations) {
    cancellation.throwIfCancelled();
    if (!isFullyProvenRelation(relation, cancellation)) continue;
    const key = componentPropBoundarySemanticKey(relation);
    if (!unique.has(key)) unique.set(key, relation);
  }
  cancellation.throwIfCancelled();
  return [...unique.values()];
}

function componentPropBoundaryGroups(
  sourceElementId: string,
  evidence: EvidenceIndexes,
  cancellation: AnalysisCancellationToken,
): ComponentPropBoundaryGroup[] {
  cancellation.throwIfCancelled();
  const groups = new Map<string, ComponentPropBoundaryGroup>();
  for (const relation of evidence.outgoing.get(sourceElementId) ?? []) {
    cancellation.throwIfCancelled();
    const target = exactElement(evidence, relation.to);
    if (relation.kind !== "component-prop"
      || !target
      || target.kind !== "component-occurrence"
    ) continue;
    const group = groups.get(relation.to) ?? { targetId: relation.to, relations: [] };
    group.relations.push(relation);
    groups.set(relation.to, group);
  }
  const values = [...groups.values()];
  cancellation.throwIfCancelled();
  return values;
}
