import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { componentPropBindingEvidenceIncomplete } from "../analysis/route-totality-field-lineage-component-binding";
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
  const boundaries = uniqueComponentPropBoundaries(source.id, evidence, cancellation);
  const bindingSource = source.kind === "component-prop-binding";
  const receiverRelations = bindingSource
    ? (evidence.incoming.get(target.id) ?? []).filter((relation) =>
      relation.from === source.id
        && relation.kind === "component-prop-binding"
        && isFullyProvenRelation(relation, cancellation),
    )
    : (evidence.outgoing.get(target.id) ?? []).filter((relation) =>
      relation.kind === "component-prop-binding" && isFullyProvenRelation(relation, cancellation),
    );
  const receiverRootProven = bindingSource
    ? receiverRelations.length === 1 && receiverRootForBindingReceiver(target.id, evidence, cancellation)
      : receiverRelations.length === 1 && receiverRootForBindingReceiver(receiverRelations[0].to, evidence, cancellation);
  const bindingElementId = target.kind === "component-prop-binding"
    ? target.id
    : bindingSource ? source.id : null;
  return {
    boundaryCount: boundaries.length,
    occurrenceAnchorCount: boundaries.length === 1
      ? surface.anchors.occurrenceAnchorsByEvidenceElementId.get(boundaries[0].to)?.length ?? 0
      : boundaries.length,
    receiverCount: receiverRelations.length,
    receiverRootProven,
    bindingIncomplete: bindingElementId === null
      ? false
      : componentPropBindingEvidenceIncomplete(
        bindingElementId,
        evidence.outgoing,
        evidence.incoming,
        evidence.elementsById,
        evidence.gapsByFrom,
        cancellation,
      ),
  };
}

export function componentPropBoundary(
  sourceElementId: string,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  cancellation: AnalysisCancellationToken,
): { occurrenceId: string } | null {
  cancellation.throwIfCancelled();
  const boundaries = uniqueComponentPropBoundaries(sourceElementId, evidence, cancellation);
  if (boundaries.length !== 1) return null;
  const anchors = surface.anchors.occurrenceAnchorsByEvidenceElementId.get(boundaries[0].to) ?? [];
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

function uniqueComponentPropBoundaries(
  sourceElementId: string,
  evidence: EvidenceIndexes,
  cancellation: AnalysisCancellationToken,
): EvidenceRelation[] {
  cancellation.throwIfCancelled();
  const byTarget = new Map<string, EvidenceRelation>();
  for (const relation of evidence.outgoing.get(sourceElementId) ?? []) {
    cancellation.throwIfCancelled();
    const target = exactElement(evidence, relation.to);
    if (relation.kind !== "component-prop"
      || !target
      || target.kind !== "component-occurrence"
      || !isFullyProvenRelation(relation, cancellation)) continue;
    const existing = byTarget.get(relation.to);
    if (!existing || relation.id.localeCompare(existing.id) < 0) byTarget.set(relation.to, relation);
  }
  const values = [...byTarget.values()];
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
