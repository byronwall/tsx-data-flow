import type { AnalysisCancellationToken } from "../analysis/cancellation";
import {
  classifyRouteTotalityFieldTransition,
  isFullyProvenElement,
  isFullyProvenProof,
  isFullyProvenRelation,
} from "../analysis/route-totality-field-lineage-transition";
import { addIssue, type ValidationIssue } from "./route-occurrence-validation-graph";
import {
  exactElement,
  exactRelation,
  sameLocations,
  type AvailableSurface,
  type EvidenceElement,
  type EvidenceIndexes,
  type EvidenceRelation,
  type FieldAttachment,
  type FieldValue,
  type SurfaceIndexes,
  type SurfaceOccurrence,
} from "./route-totality-field-lineage-validation-index";
import { hasFieldLineageId, validateUniqueFieldLineageIds } from "./route-totality-field-lineage-validation-structure";

export function validateFieldLineageField(
  field: FieldValue,
  evidence: EvidenceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
  includesLocation: boolean,
  evidencePathElementIds: readonly string[] = [],
  evidencePathRelationIds: readonly string[] = [],
): void {
  cancellation.throwIfCancelled();
  if (field.elementIds.length !== field.segments.length) {
    addIssue(issues, path, "field element and segment counts must match");
  }
  if (field.elementIds.length === 0) addIssue(issues, [...path, "elementIds"], "field requires at least one element");
  let expectedLabel = "";
  for (let index = 0; index < field.segments.length; index += 1) {
    cancellation.throwIfCancelled();
    const segment = field.segments[index];
    if (segment.kind !== "property" || segment.value.length === 0) {
      addIssue(issues, [...path, "segments", index], "Milestone 1 fields require static named property segments");
    }
    expectedLabel = expectedLabel ? `${expectedLabel}.${segment.value}` : segment.value;
    const element = exactElement(evidence, field.elementIds[index]);
    if (!element) {
      addIssue(issues, [...path, "elementIds", index], "field element must exist exactly once in the evidence slice");
      continue;
    }
    if (!isFullyProvenElement(element, cancellation)
      || element.kind !== "field-read"
      || element.operationKind !== "field-read"
      || element.fieldName !== segment.value) {
      addIssue(issues, [...path, "elementIds", index], "field element must be the exact fully proven static named field-read");
    }
    if (index > 0) {
      validateFieldInput(
        field.elementIds[index - 1],
        field.elementIds[index],
        evidence,
        [...path, "elementIds", index],
        issues,
        cancellation,
        evidencePathElementIds,
        evidencePathRelationIds,
      );
    }
  }
  if (field.label !== expectedLabel) addIssue(issues, [...path, "label"], "field label must be built from exact field segments");
  if (includesLocation && "location" in field && field.elementIds.length > 0) {
    const final = exactElement(evidence, field.elementIds[field.elementIds.length - 1]);
    if (final && !sameLocations([final.location], [field.location], cancellation)) {
      addIssue(issues, [...path, "location"], "field location must match the final exact field-read");
    }
  }
  cancellation.throwIfCancelled();
}

export function validateFieldLineageAttachmentPath(
  attachment: FieldAttachment,
  origin: EvidenceElement | undefined,
  occurrence: SurfaceOccurrence | undefined,
  evidence: EvidenceIndexes,
  availableSurface: AvailableSurface,
  surface: SurfaceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const elementIds = attachment.evidencePathElementIds;
  const relationIds = attachment.evidencePathRelationIds;
  if (elementIds.length === 0) {
    addIssue(issues, [...path, "evidencePathElementIds"], "field attachment requires an exact evidence path");
    return;
  }
  if (elementIds[0] !== attachment.origin.elementId) {
    addIssue(issues, [...path, "evidencePathElementIds", 0], "field attachment path must start at its exact origin");
  }
  if (origin && elementIds[0] !== origin.id) {
    addIssue(issues, [...path, "evidencePathElementIds", 0], "field attachment path must start at the proven origin evidence element");
  }
  validateUniqueFieldLineageIds(elementIds, [...path, "evidencePathElementIds"], "evidence element", issues, cancellation);
  validateUniqueFieldLineageIds(relationIds, [...path, "evidencePathRelationIds"], "evidence relation", issues, cancellation);
  if (relationIds.length !== elementIds.length - 1) {
    addIssue(issues, path, "field attachment path must contain one relation between adjacent elements");
  }
  for (let index = 0; index < elementIds.length; index += 1) {
    cancellation.throwIfCancelled();
    const element = exactElement(evidence, elementIds[index]);
    if (!element || !isFullyProvenElement(element, cancellation)) {
      addIssue(issues, [...path, "evidencePathElementIds", index], "field attachment path elements must be unique, existing, and fully proven");
    }
  }

  let currentOccurrenceId = surface.rootOccurrenceId;
  let fieldIndex = 0;
  let terminalAttachment = false;
  for (let index = 0; index < relationIds.length; index += 1) {
    cancellation.throwIfCancelled();
    const relation = exactRelation(evidence, relationIds[index]);
    const source = exactElement(evidence, elementIds[index]);
    const target = exactElement(evidence, elementIds[index + 1]);
    if (!relation || !source || !target) {
      addIssue(issues, [...path, "evidencePathRelationIds", index], "field attachment path relation must connect exact existing evidence");
      continue;
    }
    if (relation.from !== source.id || relation.to !== target.id || !isFullyProvenRelation(relation, cancellation)) {
      addIssue(issues, [...path, "evidencePathRelationIds", index], "field attachment path relation must exactly connect fully proven adjacent elements");
      continue;
    }
    const occurrenceAnchors = surface.anchors.occurrenceAnchorsByEvidenceElementId.get(target.id) ?? [];
    const terminalAnchors = surface.anchors.terminalAnchorsByEvidenceElementId.get(target.id) ?? [];
    const terminal = terminalAnchors.length === 1 ? terminalAnchors[0].endpoint : undefined;
    const bindingContext = relation.kind === "component-prop-binding"
      ? componentPropBindingContext(source, target, evidence, surface, cancellation)
      : null;
    const transition = classifyRouteTotalityFieldTransition({
      relation,
      source,
      target,
      outgoingRelations: evidence.outgoing.get(source.id) ?? [],
      incomingRelations: evidence.incoming.get(target.id) ?? [],
      hasField: fieldIndex > 0,
      isInitialOrigin: index === 0 && source.id === attachment.origin.elementId,
      staticNamedField: target.fieldName !== null,
      occurrenceAnchorCount: occurrenceAnchors.length,
      terminalAnchorCount: terminalAnchors.length,
      currentOccurrenceId,
      terminalOwnerOccurrenceId: terminal?.ownerOccurrenceId,
      componentPropBoundaryCount: bindingContext?.boundaryCount,
      componentPropOccurrenceAnchorCount: bindingContext?.occurrenceAnchorCount,
      componentPropBindingReceiverCount: bindingContext?.receiverCount,
      componentPropReceiverRootProven: bindingContext?.receiverRootProven,
      cancellation,
    });
    if (transition.kind === "stop") {
      addIssue(issues, [...path, "evidencePathRelationIds", index], "field attachment path uses a partial or unsupported field transition");
      continue;
    }
    if (transition.kind === "field-input") {
      if (fieldIndex >= attachment.field.elementIds.length || target.id !== attachment.field.elementIds[fieldIndex]) {
        addIssue(issues, [...path, "field"], "field elements must occur in the exact accepted path order");
      }
      fieldIndex += 1;
      continue;
    }
    if (transition.kind === "component-prop-binding-start") {
      const boundary = componentPropBoundary(source.id, evidence, surface, cancellation);
      if (!boundary) {
        addIssue(issues, [...path, "evidencePathRelationIds", index], "component-prop binding must retain one exact component occurrence boundary");
      } else {
        currentOccurrenceId = boundary.occurrenceId;
      }
      continue;
    }
    if (transition.kind === "component-prop-binding-receiver") {
      if (fieldIndex > 0 && target.fieldName !== attachment.field.segments.at(-1)?.value) {
        addIssue(issues, [...path, "field"], "component-prop binding cannot rename an existing field");
      }
      if (!target.fieldName) {
        addIssue(issues, [...path, "evidencePathRelationIds", index], "component-prop binding receiver must have one exact named field");
      }
      continue;
    }
    if (transition.kind === "component-prop") {
      addIssue(issues, [...path, "evidencePathRelationIds", index], "Milestone 1 field attachments cannot stop at a consumer boundary without a terminal");
      continue;
    }
    if (transition.kind === "render-terminal") {
      terminalAttachment = true;
      const anchor = terminalAnchors[0];
      if (index !== relationIds.length - 1
        || !anchor
        || attachment.terminalIds.length !== 1
        || !hasFieldLineageId(attachment.terminalIds, anchor.endpoint.id, cancellation)) {
        addIssue(issues, [...path, "evidencePathElementIds", index + 1], "render-terminal attachment path must end at its one exact terminal anchor");
      }
    }
  }
  if (fieldIndex !== attachment.field.elementIds.length || fieldIndex === 0) {
    addIssue(issues, [...path, "field"], "attachment path must carry every exact field element");
  }
  if (!terminalAttachment || attachment.terminalIds.length !== 1) {
    addIssue(issues, [...path, "terminalIds"], "Milestone 1 field attachments require one exact render terminal");
  }
  if (occurrence?.parentOccurrenceId === null
    && (occurrence.scopeSeed !== availableSurface.scope.seed || occurrence.id !== surface.rootOccurrenceId)) {
    addIssue(issues, [...path, "occurrenceId"], "root attachment must use the exact route seed occurrence");
  }
  cancellation.throwIfCancelled();
}

export function validateFieldLineageAttachmentProof(
  attachment: FieldAttachment,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (attachment.proof.length === 0 || attachment.locations.length === 0) {
    addIssue(issues, path, "field attachment requires proof and locations");
  }
  for (const proof of attachment.proof) {
    cancellation.throwIfCancelled();
    if (!isFullyProvenProof(proof) || !sameLocations(proof.locations, attachment.locations, cancellation)) {
      addIssue(issues, path, "field attachment proof must be fully proven and match attachment locations");
    }
  }
  cancellation.throwIfCancelled();
}

function validateFieldInput(
  from: string,
  to: string,
  evidence: EvidenceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
  evidencePathElementIds: readonly string[] = [],
  evidencePathRelationIds: readonly string[] = [],
): void {
  cancellation.throwIfCancelled();
  const source = exactElement(evidence, from);
  const target = exactElement(evidence, to);
  const outgoing = evidence.outgoing.get(from) ?? [];
  const matches: EvidenceRelation[] = [];
  for (const relation of outgoing) {
    cancellation.throwIfCancelled();
    if (relation.from === from && relation.to === to && relation.kind === "field-input" && isFullyProvenRelation(relation, cancellation)) {
      matches.push(relation);
    }
  }
  if (matches.length !== 1 || !source || !target) {
    if (hasComponentPropBridge(from, to, evidencePathElementIds, evidencePathRelationIds, evidence, cancellation)) return;
    addIssue(issues, path, "adjacent field elements require one exact proven field-input relation");
    return;
  }
  const transition = classifyRouteTotalityFieldTransition({
    relation: matches[0],
    source,
    target,
    outgoingRelations: outgoing,
    incomingRelations: evidence.incoming.get(to) ?? [],
    hasField: true,
    isInitialOrigin: false,
    staticNamedField: target.fieldName !== null,
    occurrenceAnchorCount: 0,
    terminalAnchorCount: 0,
    currentOccurrenceId: null,
    terminalOwnerOccurrenceId: undefined,
    cancellation,
  });
  if (transition.kind !== "field-input") {
    addIssue(issues, path, "adjacent field elements must satisfy the exact field-input transition policy");
  }
  cancellation.throwIfCancelled();
}

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
  return {
    boundaryCount: boundaries.length,
    occurrenceAnchorCount: boundaries.length === 1
      ? surface.anchors.occurrenceAnchorsByEvidenceElementId.get(boundaries[0].to)?.length ?? 0
      : boundaries.length,
    receiverCount: receiverRelations.length,
    receiverRootProven,
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
  if (!receiver || receiver.kind !== "field-read" || receiver.operationKind !== "field-read" || receiver.fieldName === null) return false;
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
  return Boolean(parameter?.symbol && root.symbol && parameter.symbol === root.symbol);
}

function hasComponentPropBridge(
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
