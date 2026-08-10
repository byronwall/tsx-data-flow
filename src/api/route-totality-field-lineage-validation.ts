import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "../analysis/cancellation";
import { MAX_FRONTIERS } from "../analysis/route-totality-field-lineage-frontier";
import { isFullyProvenElement, isFullyProvenProof } from "../analysis/route-totality-field-lineage-transition";
import {
  EXACT_FIELD_TRANSFER_KINDS,
  verifyExactFieldTransfer,
} from "../analysis/route-totality-field-transfer-verifier";
import { SELECTED_ORIGIN_UNAVAILABLE_REASON } from "../analysis/route-totality-field-proof";
import type { RouteTotality } from "./route-totality-contracts";
import { addIssue, type ValidationIssue } from "./route-occurrence-validation-graph";
import { validateFieldLineageFrontierStop } from "./route-totality-field-lineage-validation-frontier";
import {
  availableEvidence,
  availableSurface,
  endpointOccurrenceAnchors,
  endpointTerminalAnchors,
  exactElement,
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
  type FieldAttachment,
  type FieldFrontier,
  type SurfaceIndexes,
  type SurfaceOccurrence,
} from "./route-totality-field-lineage-validation-index";
import {
  validateFieldLineageAttachmentPath,
  validateFieldLineageAttachmentProof,
  validateFieldLineageField,
} from "./route-totality-field-lineage-validation-path";
import { validateFieldLineageAttachmentTerminals } from "./route-totality-field-lineage-validation-terminal";
import {
  validateFieldLineageCounts,
  validateSortedFieldLineageIds,
  validateStableFieldLineageId,
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
  validateTransformations(lineage, evidenceIndexes, issues, cancellation);
  validateAttachments(lineage.attachments, lineage.transformations, evidenceIndexes, surface, surfaceIndexes, issues, cancellation);
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
  if (!unavailableInputs && lineage.unavailableReason !== SELECTED_ORIGIN_UNAVAILABLE_REASON) {
    addIssue(issues, ["fieldLineage", "status"], "available route inputs cannot produce unavailable field lineage");
  }
  if (lineage.attachments.length > 0 || lineage.frontiers.length > 0) {
    addIssue(issues, ["fieldLineage"], "unavailable field lineage cannot contain attachments or frontiers");
  }
  for (const key of ["origins", "fields", "occurrences", "terminals", "frontiers", "transformations"] as const) {
    cancellation.throwIfCancelled();
    if (lineage.counts[key] !== 0) addIssue(issues, ["fieldLineage", "counts", key], "unavailable field lineage must have zero counts");
  }
  if (lineage.unavailableReason && (lineage.omissions.length !== 1 || lineage.omissions[0] !== lineage.unavailableReason)) {
    addIssue(issues, ["fieldLineage", "omissions"], "unavailable field lineage must have one omission equal to its reason");
  }
  cancellation.throwIfCancelled();
}

function validateAttachments(
  attachments: readonly FieldAttachment[],
  transformations: readonly RouteTotality["fieldLineage"]["transformations"][number][],
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
    if (attachment.transformationIds.length > 0 && attachment.origin.selectedEvidenceId === null) {
      addIssue(issues, [...path, "origin", "selectedEvidenceId"], "ledger origin must carry the exact selected route-data evidence id");
    }
    const occurrence = validateOccurrence(
      attachment.occurrenceId,
      evidence,
      surface,
      surfaceIndexes,
      [...path, "occurrenceId"],
      issues,
      cancellation,
    );
    if (attachment.transformationIds.length > 0) {
      validateLedgerAttachment(attachment, transformations, occurrence, evidence, surfaceIndexes, path, issues, cancellation);
    } else {
      validateFieldLineageField(attachment.field, evidence, [...path, "field"], issues, cancellation, true, attachment.evidencePathElementIds, attachment.evidencePathRelationIds);
    }
    validateFieldLineageAttachmentProof(attachment, [...path, "proof"], issues, cancellation);
    validateSortedFieldLineageIds(attachment.terminalIds, [...path, "terminalIds"], "terminal", issues, cancellation);
    if (attachment.transformationIds.length === 0) {
      validateFieldLineageAttachmentPath(attachment, originElement, occurrence, evidence, surface, surfaceIndexes, path, issues, cancellation);
    }
    if (attachment.transformationIds.length === 0) {
      validateFieldLineageAttachmentTerminals(attachment, occurrence, evidence, surfaceIndexes, path, issues, cancellation);
    }
  }
  cancellation.throwIfCancelled();
}

function validateTransformations(
  lineage: RouteTotality["fieldLineage"], evidence: EvidenceIndexes, issues: ValidationIssue[], cancellation: AnalysisCancellationToken,
): void {
  const seen = new Set<string>();
  const graph = {
    element: (id: string) => exactElement(evidence, id),
    relation: (id: string) => {
      const values = evidence.relationsById.get(id) ?? [];
      return values.length === 1 ? values[0] : undefined;
    },
    outgoing: (id: string) => evidence.outgoing.get(id) ?? [],
  };
  for (let index = 0; index < lineage.transformations.length; index += 1) {
    cancellation.throwIfCancelled();
    const value = lineage.transformations[index];
    const path = ["fieldLineage", "transformations", index] as Array<string | number>;
    validateStableFieldLineageId(lineage.transformations, index, path, issues);
    if (seen.has(value.id)) addIssue(issues, [...path, "id"], "duplicate transformation id");
    seen.add(value.id);
    if (value.status !== "proven" || value.fromElementIds.length !== 1 || value.toElementIds.length !== 1 || value.locations.length === 0 || value.proof.length === 0) {
      addIssue(issues, path, "each ledger transformation requires one proven exact source, target, and proof location");
    }
    for (const proof of value.proof) {
      if (!isFullyProvenProof(proof) || !sameLocations(proof.locations, value.locations, cancellation)) addIssue(issues, [...path, "proof"], "ledger transformation proof must be fully proven and match its locations");
    }
    for (const id of [...value.fromElementIds, ...value.toElementIds]) {
      if (!exactElement(evidence, id) || !isFullyProvenElement(exactElement(evidence, id), cancellation)) addIssue(issues, path, "ledger transformations must reference fully proven evidence elements");
    }
    const verification = verifyExactFieldTransfer(value, graph, cancellation);
    if (!verification.ok) addIssue(issues, path, verification.detail);
  }
}

function validateLedgerAttachment(
  attachment: FieldAttachment,
  transformations: readonly RouteTotality["fieldLineage"]["transformations"][number][],
  occurrence: SurfaceOccurrence | undefined,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  path: Array<string | number>, issues: ValidationIssue[], cancellation: AnalysisCancellationToken,
): void {
  const byId = new Map(transformations.map((item) => [item.id, item]));
  const unresolvedSteps = attachment.transformationIds.map((id) => byId.get(id));
  if (unresolvedSteps.some((item) => !item) || unresolvedSteps.length === 0 || attachment.transformationKinds.length !== unresolvedSteps.length) {
    addIssue(issues, [...path, "transformationIds"], "attachment must reference every exact ledger transfer");
    return;
  }
  const steps = unresolvedSteps as NonNullable<typeof unresolvedSteps[number]>[];
  for (let index = 0; index < steps.length; index += 1) {
    cancellation.throwIfCancelled();
    const step = steps[index]!;
    if (attachment.transformationKinds[index] !== step.kind) addIssue(issues, [...path, "transformationKinds", index], "transformation kind must match its referenced ledger record");
    if (index > 0 && steps[index - 1]!.toElementIds[0] !== step.fromElementIds[0]) addIssue(issues, [...path, "transformationIds", index], "ledger transfers must form one contiguous exact chain");
  }
  if (steps[0]!.fromElementIds[0] !== attachment.origin.elementId) addIssue(issues, [...path, "origin"], "ledger chain must start at the selected exact origin");
  if (steps.length !== EXACT_FIELD_TRANSFER_KINDS.length
    || steps.some((step, index) => step.kind !== EXACT_FIELD_TRANSFER_KINDS[index])) {
    addIssue(issues, [...path, "transformationIds"], "attachment must reference one ordered C01-C12 transfer chain");
  }
  const fieldIds = attachment.field.elementIds;
  if (fieldIds.length !== 3 || !fieldIds.every((id) => steps.some((step) => step.fromElementIds[0] === id || step.toElementIds[0] === id))) {
    addIssue(issues, [...path, "field"], "ledger chain must contain each exact field read");
  }
  const expected = `${attachment.field.segments[0]?.value}[*].${attachment.field.segments[2]?.value}`;
  if (attachment.field.segments.length !== 3 || attachment.field.segments[1]?.kind !== "collection-element" || attachment.field.segments[1]?.value !== "*" || attachment.field.label !== expected) {
    addIssue(issues, [...path, "field"], "ledger field must use exact property, collection-element, property segments");
  }
  const consumer = attachment.consumer;
  const last = steps.at(-1)!;
  const consumerElement = consumer ? exactElement(evidence, consumer.elementId) : undefined;
  const consumerOccurrence = consumer ? exactElement(evidence, consumer.occurrenceElementId) : undefined;
  if (!consumer || !consumerElement || !consumerOccurrence || last.toElementIds[0] === consumer.elementId
    || consumer.occurrenceId !== attachment.occurrenceId || !sameLocations([consumer.location], [consumerElement.location], cancellation) || !occurrence) {
    addIssue(issues, [...path, "consumer"], "ledger consumer must be the exact expression owned by this occurrence");
    return;
  }
  const anchor = endpointOccurrenceAnchors(surface.anchors, occurrence.id, cancellation)[0];
  if (!anchor || anchor.evidenceElementId !== consumer.occurrenceElementId || !contains(consumerOccurrence.location, consumer.location)) {
    addIssue(issues, [...path, "consumer"], "consumer expression must belong to the exact anchored call-site occurrence");
  }
  const terminal = attachment.terminalIds.length === 1 ? surface.terminalsById.get(attachment.terminalIds[0]) ?? [] : [];
  if (terminal.length !== 1 || !endpointTerminalAnchors(surface.anchors, attachment.terminalIds[0], cancellation).length) {
    addIssue(issues, [...path, "terminalIds"], "ledger attachment requires one exact route render terminal anchor");
  }
}

function contains(owner: { file: string; span: { startLine: number; startColumn: number; endLine: number; endColumn: number } }, child: { file: string; span: { startLine: number; startColumn: number; endLine: number; endColumn: number } }): boolean {
  return owner.file === child.file
    && (owner.span.startLine < child.span.startLine || owner.span.startLine === child.span.startLine && owner.span.startColumn <= child.span.startColumn)
    && (owner.span.endLine > child.span.endLine || owner.span.endLine === child.span.endLine && owner.span.endColumn >= child.span.endColumn);
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
      const isCarrierFrontier = frontier.origin.role === "filesystem"
        && frontier.origin.selectedEvidenceId !== null
        && frontier.reason === "partial-proof"
        && frontier.missingTransformationKind !== null
        && EXACT_FIELD_TRANSFER_KINDS.includes(frontier.missingTransformationKind as typeof EXACT_FIELD_TRANSFER_KINDS[number])
        && frontier.occurrenceId === null
        && frontier.transformationIds.length <= EXACT_FIELD_TRANSFER_KINDS.length;
      if (!isCarrierFrontier) addIssue(issues, [...path, "field"], "a null-field frontier requires one typed selected-source C01-C12 failure");
    } else {
      validateFieldLineageField(
        frontier.field,
        evidence,
        [...path, "field"],
        issues,
        cancellation,
        false,
        frontier.evidencePathElementIds,
        frontier.evidencePathRelationIds,
      );
    }
    if (frontier.occurrenceId !== null) {
      validateOccurrence(frontier.occurrenceId, evidence, undefined, surface, [...path, "occurrenceId"], issues, cancellation);
    }
    if (frontier.field) validateFieldLineageFrontierStop(frontier, evidence, surface, path, issues, cancellation);
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
  if (!element.originRoles.includes(origin.role as EvidenceOrigin["role"])) {
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
