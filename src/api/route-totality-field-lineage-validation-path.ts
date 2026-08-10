import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { hasRouteTotalityFieldGap } from "../analysis/route-totality-field-lineage-truncation";
import {
  classifyIndexReadMetadata,
  classifyRouteTotalityFieldTransition,
  isFullyProvenElement,
  isFullyProvenProof,
  isFullyProvenRelation,
} from "../analysis/route-totality-field-lineage-transition";
import { fieldLabel } from "../analysis/route-totality-field-lineage-support";
import { addIssue, type ValidationIssue } from "./route-occurrence-validation-graph";
import {
  exactElement,
  exactRelation,
  solidShowTerminalOccurrenceForElement,
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
import {
  componentPropBindingContext,
  componentPropBoundary,
  hasComponentPropBridge,
} from "./route-totality-field-lineage-validation-binding";

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
    const element = exactElement(evidence, field.elementIds[index]);
    if (!element) {
      addIssue(issues, [...path, "elementIds", index], "field element must exist exactly once in the evidence slice");
      continue;
    }
    let validSegment = false;
    if (segment.kind === "property") {
      validSegment = segment.value.length > 0
        && isFullyProvenElement(element, cancellation)
        && element.kind === "field-read"
        && element.operationKind === "field-read"
        && element.fieldName === segment.value;
    } else {
      const indexClassification = element.kind === "index-read"
        ? classifyIndexReadMetadata(element.index)
        : { kind: "partial" as const };
      validSegment = indexClassification.kind === "accepted"
        && indexClassification.segment.kind === segment.kind
        && indexClassification.segment.value === segment.value
        && isFullyProvenElement(element, cancellation)
        && element.operationKind === "index-read";
    }
    if (!validSegment) {
      addIssue(issues, [...path, "elementIds", index], "field element must match one exact fully proven compiler-backed field or literal index read");
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
  expectedLabel = fieldLabel(field.segments, cancellation);
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
  let currentFieldElementId: string | null = null;
  let componentPropReceiverElementId: string | null = null;
  let solidShowRenderPropTerminal = false;
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
    if (hasRouteTotalityFieldGap(source.id, evidence.gapsByFrom, cancellation)) {
      addIssue(issues, [...path, "evidencePathElementIds", index], "field attachment path cannot cross an ordinary evidence gap");
      continue;
    }
    const occurrenceAnchors = surface.anchors.occurrenceAnchorsByEvidenceElementId.get(target.id) ?? [];
    const terminalAnchors = surface.anchors.terminalAnchorsByEvidenceElementId.get(target.id) ?? [];
    const terminal = terminalAnchors.length === 1 ? terminalAnchors[0].endpoint : undefined;
    const solidShowTerminalOccurrenceId = solidShowRenderPropTerminal
      ? solidShowTerminalOccurrenceForElement(surface, target.id, cancellation)
      : null;
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
      staticNamedField: target.kind === "field-read" ? target.fieldName !== null : null,
      sourceFieldName: source.fieldName,
      targetFieldName: target.fieldName,
      indexMetadata: target.kind === "index-read" ? target.index : null,
      currentFieldElementId,
      componentPropReceiverElementId,
      occurrenceAnchorCount: occurrenceAnchors.length,
      terminalAnchorCount: terminalAnchors.length,
      currentOccurrenceId,
      terminalOwnerOccurrenceId: terminal?.ownerOccurrenceId,
      solidShowTerminalOccurrenceId,
      componentPropBoundaryCount: bindingContext?.boundaryCount,
      componentPropOccurrenceAnchorCount: bindingContext?.occurrenceAnchorCount,
      componentPropBindingReceiverCount: bindingContext?.receiverCount,
      componentPropReceiverFieldInputCount: bindingContext?.receiverFieldInputCount,
      componentPropReceiverRootProven: bindingContext?.receiverRootProven,
      componentPropBindingAmbiguous: bindingContext?.bindingAmbiguous,
      componentPropBindingIncomplete: bindingContext?.bindingIncomplete,
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
      currentFieldElementId = target.id;
      componentPropReceiverElementId = null;
      solidShowRenderPropTerminal = false;
      continue;
    }
    if (transition.kind === "preserve") {
      solidShowRenderPropTerminal = relation.kind === "carrier" && relation.proof.kind === "solid-show-render-prop";
      continue;
    }
    if (transition.kind === "component-prop-binding-start") {
      const boundary = componentPropBoundary(source.id, evidence, surface, cancellation, target.id);
      if (!boundary) {
        addIssue(issues, [...path, "evidencePathRelationIds", index], "component-prop binding must retain one exact component occurrence boundary");
      } else {
        currentOccurrenceId = boundary.occurrenceId;
      }
      componentPropReceiverElementId = null;
      solidShowRenderPropTerminal = false;
      continue;
    }
    if (transition.kind === "component-prop-binding-receiver") {
      if (fieldIndex > 0 && target.fieldName !== attachment.field.segments.at(-1)?.value) {
        addIssue(issues, [...path, "field"], "component-prop binding cannot rename an existing field");
      }
      if (!target.fieldName) {
        addIssue(issues, [...path, "evidencePathRelationIds", index], "component-prop binding receiver must have one exact named field");
      }
      componentPropReceiverElementId = target.id;
      solidShowRenderPropTerminal = false;
      continue;
    }
    if (transition.kind === "component-prop") {
      addIssue(issues, [...path, "evidencePathRelationIds", index], "Milestone 1 field attachments cannot stop at a consumer boundary without a terminal");
      continue;
    }
    if (transition.kind === "render-terminal") {
      terminalAttachment = true;
      currentOccurrenceId = transition.occurrenceId;
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
  if (terminalAttachment && currentOccurrenceId !== attachment.occurrenceId) {
    addIssue(issues, [...path, "occurrenceId"], "field attachment occurrence must be the exact terminal owner occurrence");
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
    staticNamedField: target.kind === "field-read" ? target.fieldName !== null : null,
    sourceFieldName: source.fieldName,
    targetFieldName: target.fieldName,
    indexMetadata: target.kind === "index-read" ? target.index : null,
    currentFieldElementId: from,
    componentPropReceiverElementId: null,
    occurrenceAnchorCount: 0,
    terminalAnchorCount: 0,
    currentOccurrenceId: null,
    terminalOwnerOccurrenceId: undefined,
    solidShowTerminalOccurrenceId: null,
    cancellation,
  });
  if (transition.kind !== "field-input") {
    addIssue(issues, path, "adjacent field elements must satisfy the exact field-input transition policy");
  }
  cancellation.throwIfCancelled();
}
