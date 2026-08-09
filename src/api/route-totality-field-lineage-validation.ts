import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { NO_ANALYSIS_CANCELLATION } from "../analysis/cancellation";
import {
  classifyRouteTotalityFieldTransition,
  isFullyProvenElement,
  isFullyProvenProof,
  isFullyProvenRelation,
} from "../analysis/route-totality-field-lineage-transition";
import { MAX_FRONTIERS } from "../analysis/route-totality-field-lineage-support";
import type { RouteTotality } from "./route-totality-contracts";
import {
  addIssue,
  type ValidationIssue,
} from "./route-occurrence-validation-graph";
import {
  availableEvidence,
  availableSurface,
  endpointOccurrenceAnchorId,
  endpointOccurrenceAnchors,
  exactElement,
  exactRelation,
  fullyProvenOrigin,
  hasPartialInputs,
  indexEvidence,
  indexSurface,
  isUnavailable,
  sameLocations,
  type AvailableSurface,
  type EvidenceElement,
  type EvidenceIndexes,
  type EvidenceOrigin,
  type EvidenceRelation,
  type FieldAttachment,
  type FieldFrontier,
  type FieldValue,
  type SurfaceIndexes,
  type SurfaceOccurrence,
} from "./route-totality-field-lineage-validation-index";
import { validateFieldLineageAttachmentTerminals } from "./route-totality-field-lineage-validation-terminal";
import {
  validateFieldLineageCounts,
  hasFieldLineageId,
  validateSortedFieldLineageIds,
  validateStableFieldLineageId,
  validateUniqueFieldLineageIds,
} from "./route-totality-field-lineage-validation-structure";

const CAP_OMISSION = /^Field frontier limit reached; ([1-9]\d*) additional frontiers were omitted\. The emitted frontier count is a lower bound\.$/;

export function validateRouteTotalityFieldLineage(
  totality: RouteTotality,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): ValidationIssue[] {
  cancellation.throwIfCancelled();
  const issues: ValidationIssue[] = [];
  const lineage = totality.fieldLineage;
  const unavailableInputs = isUnavailable(totality.occurrenceSurface) || isUnavailable(totality.evidenceSlice);

  if (lineage.status === "unavailable") {
    validateUnavailable(lineage, unavailableInputs, issues, cancellation);
    cancellation.throwIfCancelled();
    return issues;
  }

  if (lineage.unavailableReason !== null) {
    addIssue(issues, ["fieldLineage", "unavailableReason"], "available field lineage must not contain an unavailable reason");
  }
  if (unavailableInputs) {
    addIssue(issues, ["fieldLineage", "status"], "unavailable route inputs require unavailable field lineage");
    if (lineage.attachments.length > 0 || lineage.frontiers.length > 0) {
      addIssue(issues, ["fieldLineage"], "unavailable route inputs cannot contain field attachments or frontiers");
    }
    cancellation.throwIfCancelled();
    return issues;
  }

  const evidence = availableEvidence(totality.evidenceSlice);
  const surface = availableSurface(totality.occurrenceSurface);
  if (!evidence || !surface) {
    addIssue(issues, ["fieldLineage"], "available field lineage requires available route inputs");
    cancellation.throwIfCancelled();
    return issues;
  }
  const evidenceIndexes = indexEvidence(evidence, cancellation);
  const surfaceIndexes = indexSurface(evidence, surface, cancellation);
  validateFieldLineageCounts(lineage, issues, cancellation);
  validateAttachments(lineage.attachments, evidenceIndexes, surface, surfaceIndexes, issues, cancellation);
  validateFrontiers(lineage.frontiers, evidenceIndexes, surfaceIndexes, issues, cancellation);
  validateStatus(lineage, hasPartialInputs(evidence, surface, cancellation), issues, cancellation);
  cancellation.throwIfCancelled();
  return issues;
}

function validateUnavailable(
  lineage: RouteTotality["fieldLineage"],
  unavailableInputs: boolean,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (!lineage.unavailableReason) {
    addIssue(issues, ["fieldLineage", "unavailableReason"], "unavailable field lineage requires a reason");
  }
  if (!unavailableInputs) {
    addIssue(issues, ["fieldLineage", "status"], "available route inputs cannot produce unavailable field lineage");
  }
  if (lineage.attachments.length > 0 || lineage.frontiers.length > 0) {
    addIssue(issues, ["fieldLineage"], "unavailable field lineage cannot contain attachments or frontiers");
  }
  const counts = lineage.counts;
  for (const key of ["origins", "fields", "occurrences", "terminals", "frontiers"] as const) {
    cancellation.throwIfCancelled();
    if (counts[key] !== 0) addIssue(issues, ["fieldLineage", "counts", key], "unavailable field lineage must have zero counts");
  }
  if (lineage.unavailableReason && (lineage.omissions.length !== 1 || lineage.omissions[0] !== lineage.unavailableReason)) {
    addIssue(issues, ["fieldLineage", "omissions"], "unavailable field lineage must have one omission equal to its reason");
  }
  cancellation.throwIfCancelled();
}

function validateAttachments(
  attachments: readonly FieldAttachment[],
  evidence: EvidenceIndexes,
  surface: AvailableSurface,
  surfaceIndexes: SurfaceIndexes,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const ids = new Set<string>();
  for (let index = 0; index < attachments.length; index += 1) {
    cancellation.throwIfCancelled();
    const attachment = attachments[index];
    const path = ["fieldLineage", "attachments", index] as Array<string | number>;
    validateStableFieldLineageId(attachments, index, path, issues);
    if (ids.has(attachment.id)) addIssue(issues, [...path, "id"], `duplicate field attachment id "${attachment.id}"`);
    ids.add(attachment.id);
    const originElement = validateOrigin(attachment.origin, evidence, [...path, "origin"], issues, cancellation);
    const occurrence = validateOccurrence(
      attachment.occurrenceId,
      evidence,
      surface,
      surfaceIndexes,
      [...path, "occurrenceId"],
      issues,
      cancellation,
    );
    validateField(attachment.field, evidence, [...path, "field"], issues, cancellation, true);
    validateAttachmentProof(attachment, [...path, "proof"], issues, cancellation);
    validateSortedFieldLineageIds(attachment.terminalIds, [...path, "terminalIds"], "terminal", issues, cancellation);
    validateAttachmentPath(
      attachment,
      originElement,
      occurrence,
      evidence,
      surface,
      surfaceIndexes,
      path,
      issues,
      cancellation,
    );
    validateFieldLineageAttachmentTerminals(
      attachment,
      originElement,
      occurrence,
      evidence,
      surfaceIndexes,
      path,
      issues,
      cancellation,
    );
  }
  cancellation.throwIfCancelled();
}

function validateFrontiers(
  frontiers: readonly FieldFrontier[],
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const ids = new Set<string>();
  for (let index = 0; index < frontiers.length; index += 1) {
    cancellation.throwIfCancelled();
    const frontier = frontiers[index];
    const path = ["fieldLineage", "frontiers", index] as Array<string | number>;
    validateStableFieldLineageId(frontiers, index, path, issues);
    if (ids.has(frontier.id)) addIssue(issues, [...path, "id"], `duplicate field frontier id "${frontier.id}"`);
    ids.add(frontier.id);
    validateOrigin(frontier.origin, evidence, [...path, "origin"], issues, cancellation);
    if (!frontier.field) {
      addIssue(issues, [...path, "field"], "Milestone 1 field frontiers require the last exact field identity");
    } else {
      validateField(frontier.field, evidence, [...path, "field"], issues, cancellation, false);
    }
    if (frontier.occurrenceId !== null) {
      validateOccurrence(
        frontier.occurrenceId,
        evidence,
        undefined,
        surface,
        [...path, "occurrenceId"],
        issues,
        cancellation,
      );
    }
    validateFrontierStop(frontier, evidence, path, issues, cancellation);
  }
  cancellation.throwIfCancelled();
}

function validateOrigin(
  origin: { elementId: string; role: string },
  evidence: EvidenceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): EvidenceElement | undefined {
  cancellation.throwIfCancelled();
  const key = `${origin.elementId}:${origin.role}`;
  const records = evidence.originsByKey.get(key) ?? [];
  if (records.length !== 1) {
    addIssue(issues, path, "field lineage origin must have one exact evidence origin record");
  } else if (!fullyProvenOrigin(records[0], cancellation)) {
    addIssue(issues, path, "field lineage origin record must be fully proven with located proof");
  }
  const elements = evidence.elementsById.get(origin.elementId) ?? [];
  if (elements.length !== 1) {
    addIssue(issues, path, "field lineage origin must have one exact evidence element");
    return undefined;
  }
  const element = elements[0];
  if (!isFullyProvenElement(element, cancellation)) {
    addIssue(issues, path, "field lineage origin evidence element must be fully proven with located proof");
  }
  if (!hasFieldLineageId(element.originRoles, origin.role as EvidenceOrigin["role"], cancellation)) {
    addIssue(issues, path, "field lineage origin role must match its exact evidence element kind");
  }
  cancellation.throwIfCancelled();
  return element;
}

function validateOccurrence(
  occurrenceId: string,
  evidence: EvidenceIndexes,
  availableSurface: AvailableSurface | undefined,
  surface: SurfaceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): SurfaceOccurrence | undefined {
  cancellation.throwIfCancelled();
  const occurrences = surface.occurrencesById.get(occurrenceId) ?? [];
  if (occurrences.length !== 1) {
    addIssue(issues, path, "field lineage occurrence must exist exactly once in the occurrence surface");
    return undefined;
  }
  const occurrence = occurrences[0];
  if (surface.definitionIds.has(occurrenceId)) {
    addIssue(issues, path, "field lineage occurrence cannot use a definition id");
  }
  const anchors = endpointOccurrenceAnchors(surface.anchors, occurrenceId, cancellation);
  if (anchors.length !== 1 || surface.anchors.occurrenceIssuesByEndpointId.has(occurrenceId)) {
    addIssue(issues, path, "field lineage occurrence must have one unshared exact evidence anchor");
  } else {
    const reverse = surface.anchors.occurrenceAnchorsByEvidenceElementId.get(anchors[0].evidenceElementId) ?? [];
    if (reverse.length !== 1 || !isFullyProvenElement(exactElement(evidence, anchors[0].evidenceElementId), cancellation)) {
      addIssue(issues, path, "field lineage occurrence anchor must be uniquely and fully proven");
    }
  }
  if (availableSurface && occurrence.parentOccurrenceId === null
    && (occurrence.scopeSeed !== availableSurface.scope.seed || occurrence.id !== surface.rootOccurrenceId)) {
    addIssue(issues, path, "root field attachment is allowed only for the exact route seed occurrence");
  }
  cancellation.throwIfCancelled();
  return occurrence;
}

function validateField(
  field: FieldValue,
  evidence: EvidenceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
  includesLocation: boolean,
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
      validateFieldInput(field.elementIds[index - 1], field.elementIds[index], evidence, [...path, "elementIds", index], issues, cancellation);
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

function validateFieldInput(
  from: string,
  to: string,
  evidence: EvidenceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
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

function validateAttachmentPath(
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
  let componentAttachment = false;
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
    if (transition.kind === "component-prop") {
      const anchor = occurrenceAnchors[0];
      componentAttachment = true;
      currentOccurrenceId = anchor?.endpoint.id ?? null;
      if (index !== relationIds.length - 1
        || !occurrence
        || anchor?.endpoint.id !== occurrence.id
        || target.id !== endpointOccurrenceAnchorId(surface.anchors, occurrence.id, cancellation)) {
        addIssue(issues, [...path, "evidencePathElementIds", index + 1], "component-prop attachment must end at its exact occurrence anchor");
      }
      continue;
    }
    if (transition.kind === "render-terminal") {
      terminalAttachment = true;
      const anchor = terminalAnchors[0];
      if (index !== relationIds.length - 1
        || !anchor
        || !hasFieldLineageId(attachment.terminalIds, anchor.endpoint.id, cancellation)) {
        addIssue(issues, [...path, "evidencePathElementIds", index + 1], "render-terminal attachment path must end at one listed exact terminal anchor");
      }
    }
  }
  if (fieldIndex !== attachment.field.elementIds.length || fieldIndex === 0) {
    addIssue(issues, [...path, "field"], "attachment path must carry every exact field element");
  }
  if (componentAttachment) {
    if (attachment.terminalIds.length > 0 || terminalAttachment) {
      addIssue(issues, [...path, "terminalIds"], "component-prop attachments stop at the occurrence and cannot contain terminals");
    }
  } else if (!terminalAttachment || attachment.terminalIds.length === 0) {
    addIssue(issues, [...path, "evidencePathElementIds"], "field attachment must end at an exact component occurrence or render terminal");
  }
  if (occurrence?.parentOccurrenceId === null
    && (occurrence.scopeSeed !== availableSurface.scope.seed || occurrence.id !== surface.rootOccurrenceId)) {
    addIssue(issues, [...path, "occurrenceId"], "root attachment must use the exact route seed occurrence");
  }
  cancellation.throwIfCancelled();
}

function validateAttachmentProof(
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

function validateFrontierStop(
  frontier: FieldFrontier,
  evidence: EvidenceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (frontier.stoppedAtElementId !== null && !exactElement(evidence, frontier.stoppedAtElementId)) {
    addIssue(issues, [...path, "stoppedAtElementId"], "field frontier stopped element must exist exactly once");
  }
  if (frontier.stoppedAtRelationId !== null && !exactRelation(evidence, frontier.stoppedAtRelationId)) {
    addIssue(issues, [...path, "stoppedAtRelationId"], "field frontier stopped relation must exist exactly once");
  }
  if (frontier.proof.length === 0) addIssue(issues, [...path, "proof"], "field frontier requires proof");
  let hasPartialProof = false;
  for (const proof of frontier.proof) {
    cancellation.throwIfCancelled();
    if (proof.locations.length === 0 || proof.status === "unsupported") {
      addIssue(issues, [...path, "proof"], "field frontier proof requires a located proven or partial proof");
    }
    if (proof.status === "partial") hasPartialProof = true;
  }
  if ((frontier.reason === "partial-proof" || frontier.reason === "evidence-truncated") && !hasPartialProof) {
    addIssue(issues, [...path, "proof"], "partial and truncation frontiers require partial proof");
  }
  if (frontier.reason === "evidence-truncated") {
    const stopped = frontier.stoppedAtElementId ? exactElement(evidence, frontier.stoppedAtElementId) : undefined;
    if (!stopped || !isFullyProvenElement(stopped, cancellation)) {
      addIssue(issues, [...path, "stoppedAtElementId"], "truncation frontier must retain its last fully proven element");
    }
  }
  cancellation.throwIfCancelled();
}

function validateStatus(
  lineage: RouteTotality["fieldLineage"],
  partialInputs: boolean,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (lineage.frontiers.length > MAX_FRONTIERS) {
    addIssue(issues, ["fieldLineage", "frontiers"], `field lineage may emit at most ${MAX_FRONTIERS} frontiers`);
  }
  let capOmissions = 0;
  for (const omission of lineage.omissions) {
    cancellation.throwIfCancelled();
    if (CAP_OMISSION.test(omission)) capOmissions += 1;
  }
  if (capOmissions > 1) addIssue(issues, ["fieldLineage", "omissions"], "field frontier cap omission must appear once");
  if (capOmissions > 0 && lineage.frontiers.length !== MAX_FRONTIERS) {
    addIssue(issues, ["fieldLineage", "frontiers"], "capped field lineage must retain the full bounded frontier count");
  }
  const partialReason = lineage.frontiers.length > 0 || partialInputs || capOmissions > 0;
  if (lineage.status === "complete") {
    if (partialReason) addIssue(issues, ["fieldLineage", "status"], "complete field lineage cannot have frontiers, caps, or partial inputs");
    if (lineage.omissions.length > 0) addIssue(issues, ["fieldLineage", "omissions"], "complete field lineage cannot contain omissions");
  }
  if (lineage.status === "partial" && !partialReason) {
    addIssue(issues, ["fieldLineage", "status"], "partial field lineage requires a frontier, partial input, or capped frontier output");
  }
  cancellation.throwIfCancelled();
}
