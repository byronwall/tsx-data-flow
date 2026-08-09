import type { AnalysisCancellationToken } from "../analysis/cancellation";
import {
  componentPropBindingEvidenceIncomplete,
  componentPropBoundarySemanticKey,
} from "../analysis/route-totality-field-lineage-component-binding";
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
  const receiverRootProven = bindingSource
    ? receiverCandidates.length === 1 && receiverRelations.length === 1 && receiverRootForBindingReceiver(target.id, evidence, cancellation)
      : receiverCandidates.length === 1 && receiverRelations.length === 1 && receiverRootForBindingReceiver(receiverRelations[0].to, evidence, cancellation);
  const bindingElementId = target.kind === "component-prop-binding"
    ? target.id
    : bindingSource ? source.id : null;
  return {
    boundaryCount,
    occurrenceAnchorCount: boundaryGroups.length === 1 && completeBoundaryGroups.length === 1 && boundaryCount === 1
      ? surface.anchors.occurrenceAnchorsByEvidenceElementId.get(boundaryGroups[0].targetId)?.length ?? 0
      : boundaryCount,
    receiverCount: receiverCandidates.length,
    receiverRootProven,
    bindingIncomplete: bindingElementId === null
      ? completeBoundaryGroups.length !== boundaryGroups.length || receiverRelations.length !== receiverCandidates.length
      : componentPropBindingEvidenceIncomplete(
        bindingElementId,
        evidence.outgoing,
        evidence.incoming,
        evidence.elementsById,
        evidence.gapsByFrom,
        cancellation,
      ) || completeBoundaryGroups.length !== boundaryGroups.length || receiverRelations.length !== receiverCandidates.length,
  };
}

export function componentPropBoundary(
  sourceElementId: string,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  cancellation: AnalysisCancellationToken,
): { occurrenceId: string } | null {
  cancellation.throwIfCancelled();
  const boundaryGroups = componentPropBoundaryGroups(sourceElementId, evidence, cancellation);
  const provenBoundaryRelations = boundaryGroups.length === 1
    ? distinctProvenBoundaryRelations(boundaryGroups[0].relations, cancellation)
    : [];
  if (boundaryGroups.length !== 1
    || provenBoundaryRelations.length !== 1
    || !boundaryGroups[0].relations.every((relation) => isFullyProvenRelation(relation, cancellation))) return null;
  const anchors = surface.anchors.occurrenceAnchorsByEvidenceElementId.get(boundaryGroups[0].targetId) ?? [];
  if (anchors.length !== 1) return null;
  return { occurrenceId: anchors[0].endpoint.id };
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

function receiverRootForBindingReceiver(
  receiverId: string,
  evidence: EvidenceIndexes,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  const receiver = exactElement(evidence, receiverId);
  if (!receiver
    || !isFullyProvenElement(receiver, cancellation)
    || receiver.kind !== "field-read"
    || receiver.operationKind !== "field-read"
    || receiver.fieldName === null) return false;
  const fieldInputs = (evidence.incoming.get(receiverId) ?? []).filter((relation) =>
    relation.kind === "field-input" && isFullyProvenRelation(relation, cancellation),
  );
  if (fieldInputs.length !== 1) return false;
  const root = exactElement(evidence, fieldInputs[0].from);
  if (!root || root.kind !== "value" || !isFullyProvenElement(root, cancellation)) return false;
  const references = (evidence.incoming.get(root.id) ?? []).filter((relation) =>
    relation.kind === "references"
      && exactElement(evidence, relation.from)?.kind === "parameter"
      && isFullyProvenRelation(relation, cancellation),
  );
  if (references.length !== 1) return false;
  const parameter = exactElement(evidence, references[0].from);
  cancellation.throwIfCancelled();
  return Boolean(
    parameter
      && isFullyProvenElement(parameter, cancellation)
      && parameter.symbol
      && root.symbol
      && parameter.symbol === root.symbol,
  );
}
