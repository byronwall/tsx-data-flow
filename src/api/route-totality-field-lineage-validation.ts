import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { NO_ANALYSIS_CANCELLATION } from "../analysis/cancellation";
import type { RouteTotality } from "./route-totality-contracts";
import {
  addIssue,
  type ValidationIssue,
} from "./route-occurrence-validation-graph";

type AvailableEvidence = Extract<RouteTotality["evidenceSlice"], { elements: unknown[] }>;
type AvailableSurface = Extract<RouteTotality["occurrenceSurface"], { occurrences: unknown[] }>;
type EvidenceElement = AvailableEvidence["elements"][number];
type EvidenceRelation = AvailableEvidence["relations"][number];
type EvidenceOrigin = AvailableEvidence["origins"][number];
type SurfaceOccurrence = AvailableSurface["occurrences"][number];
type SurfaceTerminal = AvailableSurface["terminals"][number];

export function validateRouteTotalityFieldLineage(
  totality: RouteTotality,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lineage = totality.fieldLineage;
  const unavailableInputs = isUnavailable(totality.occurrenceSurface) || isUnavailable(totality.evidenceSlice);
  const partialInputs = hasPartialInputs(totality);

  if (unavailableInputs && (lineage.attachments.length > 0 || lineage.frontiers.length > 0)) {
    addIssue(issues, ["fieldLineage"], "unavailable route inputs cannot contain field attachments or frontiers");
  }
  if (unavailableInputs && lineage.status !== "unavailable") {
    addIssue(issues, ["fieldLineage", "status"], "unavailable route inputs require unavailable field lineage");
  }
  if (lineage.status === "unavailable") {
    if (!lineage.unavailableReason) addIssue(issues, ["fieldLineage", "unavailableReason"], "unavailable field lineage requires a reason");
    if (lineage.attachments.length > 0 || lineage.frontiers.length > 0) addIssue(issues, ["fieldLineage"], "unavailable field lineage cannot contain attachments or frontiers");
    if (!unavailableInputs) addIssue(issues, ["fieldLineage", "status"], "available route inputs cannot produce unavailable field lineage");
  } else if (lineage.unavailableReason !== null) {
    addIssue(issues, ["fieldLineage", "unavailableReason"], "available field lineage must not contain an unavailable reason");
  }

  const expectedCounts = lineageCounts(lineage, cancellation);
  for (const key of Object.keys(expectedCounts) as Array<keyof typeof expectedCounts>) {
    cancellation.throwIfCancelled();
    if (lineage.counts[key] !== expectedCounts[key]) addIssue(issues, ["fieldLineage", "counts", key], `count must equal ${expectedCounts[key]}`);
  }
  validateAttachmentReferences(totality, issues, cancellation);
  validateFrontierReferences(totality, issues, cancellation);

  if (lineage.status === "complete") {
    if (partialInputs) addIssue(issues, ["fieldLineage", "status"], "partial or bounded route inputs require partial field lineage");
    if (lineage.frontiers.length > 0) addIssue(issues, ["fieldLineage", "status"], "complete field lineage cannot contain frontiers");
    if (lineage.omissions.length > 0) addIssue(issues, ["fieldLineage", "omissions"], "complete field lineage cannot contain omissions");
    if (lineage.attachments.some((attachment) => attachment.proof.some((proof) => proof.status !== "proven"))) addIssue(issues, ["fieldLineage", "attachments"], "complete field lineage requires proven attachment proof");
  }
  if (lineage.status === "partial" && lineage.attachments.length === 0 && lineage.frontiers.length === 0 && lineage.omissions.length === 0 && !unavailableInputs) {
    addIssue(issues, ["fieldLineage", "status"], "partial field lineage requires a frontier, attachment, omission, or bounded input");
  }
  return issues;
}

function validateAttachmentReferences(
  totality: RouteTotality,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  const lineage = totality.fieldLineage;
  const surface = availableSurface(totality.occurrenceSurface);
  const evidence = availableEvidence(totality.evidenceSlice);
  if (!surface || !evidence) return;
  const elements = new Map(evidence.elements.map((element) => [element.id, element]));
  const relations = new Map(evidence.relations.map((relation) => [relation.id, relation]));
  const origins = new Map(evidence.origins.map((origin) => [`${origin.elementId}:${origin.role}`, origin]));
  const occurrences = new Map(surface.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const terminals = new Map(surface.terminals.map((terminal) => [terminal.id, terminal]));
  const definitionIds = new Set(surface.definitions.map((definition) => definition.id));
  const ids = new Set<string>();

  lineage.attachments.forEach((attachment, index) => {
    cancellation.throwIfCancelled();
    const path = ["fieldLineage", "attachments", index] as Array<string | number>;
    validateSortedId(lineage.attachments, index, path, issues);
    if (ids.has(attachment.id)) addIssue(issues, [...path, "id"], `duplicate field attachment id "${attachment.id}"`);
    ids.add(attachment.id);
    const origin = origins.get(`${attachment.origin.elementId}:${attachment.origin.role}`);
    if (!origin) addIssue(issues, [...path, "origin"], "field attachment origin is not present in the evidence slice");
    else if (origin.status !== "proven" || origin.proof.length === 0) addIssue(issues, [...path, "origin"], "field attachment origin must be proven");
    const occurrence = occurrences.get(attachment.occurrenceId);
    if (!occurrence) addIssue(issues, [...path, "occurrenceId"], "field attachment occurrence is not present in the occurrence surface");
    if (definitionIds.has(attachment.occurrenceId)) addIssue(issues, [...path, "occurrenceId"], "field attachment must use an occurrence id, not a definition id");
    const occurrenceAnchorId = occurrence && exactOccurrenceAnchorId(occurrence, surface.scope.seed, evidence);
    if (occurrence && !occurrenceAnchorId) addIssue(issues, [...path, "occurrenceId"], "field attachment occurrence does not have one exact evidence anchor");
    if (occurrence && occurrence.parentOccurrenceId !== null && occurrenceAnchorId && attachment.evidencePathElementIds[attachment.evidencePathElementIds.length - 1] !== occurrenceAnchorId) {
      addIssue(issues, [...path, "evidencePathElementIds"], "non-root field attachment path must end at its exact occurrence anchor");
    }
    validateField(attachment.field, elements, relations, [...path, "field"], issues, cancellation);
    validatePath(attachment, origin, occurrence, elements, relations, terminals, surface, evidence, path, issues, cancellation);
    validateUniqueSorted(attachment.terminalIds, [...path, "terminalIds"], "terminal", issues, cancellation);
    if (attachment.proof.length === 0) addIssue(issues, [...path, "proof"], "field attachment requires proof");
    if (attachment.locations.length === 0) addIssue(issues, [...path, "locations"], "field attachment requires locations");
    if (attachment.proof.some((proof) => !sameLocations(proof.locations, attachment.locations))) addIssue(issues, [...path, "proof"], "field attachment proof locations must match attachment locations");
  });
}

function validateFrontierReferences(
  totality: RouteTotality,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  const lineage = totality.fieldLineage;
  const unavailableInputs = isUnavailable(totality.occurrenceSurface) || isUnavailable(totality.evidenceSlice);
  if (unavailableInputs) {
    if (lineage.frontiers.length > 0) addIssue(issues, ["fieldLineage", "frontiers"], "unavailable route inputs cannot contain field frontiers");
    return;
  }
  const surface = availableSurface(totality.occurrenceSurface);
  const evidence = availableEvidence(totality.evidenceSlice);
  if (!surface || !evidence) return;
  const elements = new Map(evidence.elements.map((element) => [element.id, element]));
  const relations = new Map(evidence.relations.map((relation) => [relation.id, relation]));
  const origins = new Map(evidence.origins.map((origin) => [`${origin.elementId}:${origin.role}`, origin]));
  const occurrences = new Map(surface.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const definitionIds = new Set(surface.definitions.map((definition) => definition.id));
  const ids = new Set<string>();
  lineage.frontiers.forEach((frontier, index) => {
    cancellation.throwIfCancelled();
    const path = ["fieldLineage", "frontiers", index] as Array<string | number>;
    validateSortedId(lineage.frontiers, index, path, issues);
    if (ids.has(frontier.id)) addIssue(issues, [...path, "id"], `duplicate field frontier id "${frontier.id}"`);
    ids.add(frontier.id);
    const origin = origins.get(`${frontier.origin.elementId}:${frontier.origin.role}`);
    if (!origin) addIssue(issues, [...path, "origin"], "field frontier origin is not present in the evidence slice");
    else if (origin.status !== "proven" || origin.proof.length === 0) addIssue(issues, [...path, "origin"], "field frontier origin must be proven");
    if (frontier.occurrenceId !== null && !occurrences.has(frontier.occurrenceId)) addIssue(issues, [...path, "occurrenceId"], "field frontier occurrence is not present in the occurrence surface");
    if (frontier.occurrenceId !== null && definitionIds.has(frontier.occurrenceId)) addIssue(issues, [...path, "occurrenceId"], "field frontier must use an occurrence id, not a definition id");
    if (frontier.field) validateFieldWithoutLocation(frontier.field, elements, relations, [...path, "field"], issues, cancellation);
    if (frontier.stoppedAtElementId !== null) {
      const element = elements.get(frontier.stoppedAtElementId);
      if (!element) addIssue(issues, [...path, "stoppedAtElementId"], "field frontier stopped element is not in the evidence slice");
      else if (element.proof.length === 0) addIssue(issues, [...path, "stoppedAtElementId"], "field frontier stopped element must carry proof");
    }
    if (frontier.stoppedAtRelationId !== null) {
      const relation = relations.get(frontier.stoppedAtRelationId);
      if (!relation) addIssue(issues, [...path, "stoppedAtRelationId"], "field frontier stopped relation is not in the evidence slice");
      else if (relation.proof.locations.length === 0) addIssue(issues, [...path, "stoppedAtRelationId"], "field frontier stopped relation must carry proof");
    }
    if (frontier.proof.some((proof) => proof.locations.length === 0)) addIssue(issues, [...path, "proof"], "field frontier proof requires locations");
    if (frontier.proof.length === 0) addIssue(issues, [...path, "proof"], "field frontier requires proof");
    if (frontier.reason === "partial-proof" && !frontier.proof.some((proof) => proof.status === "partial")) addIssue(issues, [...path, "proof"], "partial-proof frontier requires partial proof");
  });
}

function validateField(
  field: RouteTotality["fieldLineage"]["attachments"][number]["field"],
  elements: Map<string, EvidenceElement>,
  relations: Map<string, EvidenceRelation>,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  validateFieldShape(field, path, issues, cancellation);
  field.elementIds.forEach((elementId, index) => {
    cancellation.throwIfCancelled();
    const element = elements.get(elementId);
    if (!element) addIssue(issues, [...path, "elementIds", index], "field element is not in the evidence slice");
    else if (element.kind !== "field-read" || element.status !== "proven" || element.proof.length === 0) addIssue(issues, [...path, "elementIds", index], "field element must be a proven field-read");
  });
  const last = elements.get(field.elementIds[field.elementIds.length - 1]);
  if (last && !sameLocation(last.location, field.location)) addIssue(issues, [...path, "location"], "field location must match the final field-read element");
  validateFieldContinuity(field.elementIds, relations, path, issues, cancellation);
}

function validateFieldWithoutLocation(
  field: NonNullable<RouteTotality["fieldLineage"]["frontiers"][number]["field"]>,
  elements: Map<string, EvidenceElement>,
  relations: Map<string, EvidenceRelation>,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  validateFieldShape(field, path, issues, cancellation);
  for (const elementId of field.elementIds) {
    cancellation.throwIfCancelled();
    const element = elements.get(elementId);
    if (!element) addIssue(issues, [...path, "elementIds"], "frontier field element is not in the evidence slice");
    else if (element.kind !== "field-read" || element.status !== "proven" || element.proof.length === 0) addIssue(issues, [...path, "elementIds"], "frontier field element must be a proven field-read");
  }
  validateFieldContinuity(field.elementIds, relations, path, issues, cancellation);
}

function validateFieldShape(
  field: { elementIds: string[]; segments: Array<{ kind: string; value: string }>; label: string },
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  if (field.elementIds.length !== field.segments.length) addIssue(issues, path, "field element and segment counts must match");
  const expectedLabel = field.segments.reduce((label, segment) => label ? `${label}.${segment.value}` : segment.value, "");
  if (field.label !== expectedLabel) addIssue(issues, [...path, "label"], "field label must be built from exact field segments");
  field.segments.forEach((segment, index) => {
    cancellation.throwIfCancelled();
    if (segment.kind !== "property") addIssue(issues, [...path, "segments", index], "Milestone 1 field segments must be named properties");
    if (segment.value.length === 0) addIssue(issues, [...path, "segments", index, "value"], "field segment value must not be empty");
  });
}

function validateFieldContinuity(
  elementIds: string[],
  relations: Map<string, EvidenceRelation>,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  for (let index = 0; index + 1 < elementIds.length; index += 1) {
    cancellation.throwIfCancelled();
    const matching = [...relations.values()].filter((relation) => relation.from === elementIds[index] && relation.to === elementIds[index + 1]);
    if (matching.length !== 1 || matching[0].kind !== "field-input" || matching[0].status !== "proven" || matching[0].proof.locations.length === 0) {
      addIssue(issues, [...path, "elementIds", index], "field element chain must use one exact proven field-input relation");
    }
  }
}

function validatePath(
  attachment: RouteTotality["fieldLineage"]["attachments"][number],
  origin: EvidenceOrigin | undefined,
  occurrence: SurfaceOccurrence | undefined,
  elements: Map<string, EvidenceElement>,
  relations: Map<string, EvidenceRelation>,
  terminals: Map<string, SurfaceTerminal>,
  surface: AvailableSurface,
  evidence: AvailableEvidence,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  if (origin && attachment.evidencePathElementIds[0] !== origin.elementId) addIssue(issues, [...path, "evidencePathElementIds", 0], "field path must start at its exact origin element");
  validateUnique(attachment.evidencePathElementIds, [...path, "evidencePathElementIds"], "evidence element", issues, cancellation);
  validateUnique(attachment.evidencePathRelationIds, [...path, "evidencePathRelationIds"], "evidence relation", issues, cancellation);
  if (attachment.evidencePathRelationIds.length !== attachment.evidencePathElementIds.length - 1) addIssue(issues, path, "field path must contain one relation between adjacent elements");
  attachment.evidencePathElementIds.forEach((elementId, index) => {
    cancellation.throwIfCancelled();
    const element = elements.get(elementId);
    if (!element) addIssue(issues, [...path, "evidencePathElementIds", index], "field path references an unknown evidence element");
    else if (element.proof.length === 0 || element.status === "unsupported") addIssue(issues, [...path, "evidencePathElementIds", index], "field path elements must be proven or partial");
  });
  attachment.evidencePathRelationIds.forEach((relationId, index) => {
    cancellation.throwIfCancelled();
    const relation = relations.get(relationId);
    if (!relation) {
      addIssue(issues, [...path, "evidencePathRelationIds", index], "field path references an unknown relation");
      return;
    }
    const from = attachment.evidencePathElementIds[index];
    const to = attachment.evidencePathElementIds[index + 1];
    if (relation.from !== from || relation.to !== to) addIssue(issues, [...path, "evidencePathRelationIds", index], "field path relation does not connect adjacent elements");
    if (relation.status === "unsupported" || relation.proof.locations.length === 0) addIssue(issues, [...path, "evidencePathRelationIds", index], "field path relations must carry proof");
  });
  const fieldPositions = attachment.field.elementIds.map((id) => attachment.evidencePathElementIds.indexOf(id));
  if (fieldPositions.some((position, index) => position < 0 || (index > 0 && position <= fieldPositions[index - 1]))) addIssue(issues, [...path, "field"], "field elements must appear in path order");
  const finalPathElementId = attachment.evidencePathElementIds[attachment.evidencePathElementIds.length - 1];
  const finalTerminalAnchorIds = new Set<string>();
  for (const terminalId of attachment.terminalIds) {
    cancellation.throwIfCancelled();
    const terminal = terminals.get(terminalId);
    if (!terminal) {
      addIssue(issues, [...path, "terminalIds"], `field attachment references unknown terminal "${terminalId}"`);
      continue;
    }
    const expectedKind = terminal.kind === "jsx-text" || terminal.kind === "render-expression" ? "render-terminal" : "dom-terminal";
    const candidates = evidence.elements.filter((element) => element.kind === expectedKind
      && provenEvidenceElement(element)
      && element.terminalRoles.includes("render")
      && evidence.terminals.some((item) => item.elementId === element.id
        && item.role === "render"
        && item.status === "proven"
        && item.proof.length > 0
        && item.proof.every((proof) => proof.status === "proven" && proof.locations.length > 0))
      && sameLocation(element.location, terminal.location));
    if (candidates.length !== 1) addIssue(issues, [...path, "terminalIds"], "terminal must use one exact evidence anchor");
    if (candidates.length === 1) {
      if (!terminalReachableFromField(attachment.field.elementIds[attachment.field.elementIds.length - 1], candidates[0].id, elements, relations, cancellation)) {
        addIssue(issues, [...path, "terminalIds"], "terminal must be reachable through the proven field route path");
      }
      if (candidates[0].id === finalPathElementId) finalTerminalAnchorIds.add(candidates[0].id);
    }
    if (terminal.ownerOccurrenceId !== null && terminal.ownerOccurrenceId !== attachment.occurrenceId) addIssue(issues, [...path, "terminalIds"], "terminal owner must match the field attachment occurrence");
  }
  if (attachment.terminalIds.length > 0 && finalTerminalAnchorIds.size === 0) addIssue(issues, [...path, "evidencePathElementIds"], "field path must end at one exact terminal anchor");
  if (occurrence && occurrence.parentOccurrenceId === null && occurrence.scopeSeed !== surface.scope.seed) addIssue(issues, [...path, "occurrenceId"], "root field attachment must use the selected route scope root");
}

function terminalReachableFromField(
  fieldElementId: string,
  terminalElementId: string,
  elements: Map<string, EvidenceElement>,
  relations: Map<string, EvidenceRelation>,
  cancellation: AnalysisCancellationToken,
): boolean {
  const preservingKinds = new Set(["references", "argument-binding", "return-expression", "return-value"]);
  const relationsByFrom = new Map<string, EvidenceRelation[]>();
  for (const relation of relations.values()) {
    cancellation.throwIfCancelled();
    if (!preservingKinds.has(relation.kind) && relation.kind !== "render-terminal") continue;
    const current = relationsByFrom.get(relation.from) ?? [];
    current.push(relation);
    relationsByFrom.set(relation.from, current);
  }
  const queue = [fieldElementId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    cancellation.throwIfCancelled();
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    for (const relation of relationsByFrom.get(currentId) ?? []) {
      cancellation.throwIfCancelled();
      if (relation.status !== "proven" || relation.proof.status !== "proven" || relation.proof.locations.length === 0) continue;
      const target = elements.get(relation.to);
      if (!target || !provenEvidenceElement(target)) continue;
      if (relation.kind === "render-terminal") {
        if (target.id === terminalElementId) return true;
        continue;
      }
      if (!visited.has(target.id)) queue.push(target.id);
    }
  }
  return false;
}

function lineageCounts(
  lineage: RouteTotality["fieldLineage"],
  cancellation: AnalysisCancellationToken,
) {
  const origins = new Set<string>();
  const fields = new Set<string>();
  const occurrences = new Set<string>();
  const terminals = new Set<string>();
  for (const attachment of lineage.attachments) {
    cancellation.throwIfCancelled();
    origins.add(`${attachment.origin.elementId}:${attachment.origin.role}`);
    fields.add(attachment.field.elementIds.join("\u0000"));
    occurrences.add(attachment.occurrenceId);
    for (const terminal of attachment.terminalIds) terminals.add(terminal);
  }
  for (const frontier of lineage.frontiers) {
    cancellation.throwIfCancelled();
    origins.add(`${frontier.origin.elementId}:${frontier.origin.role}`);
    if (frontier.field) fields.add(frontier.field.elementIds.join("\u0000"));
    if (frontier.occurrenceId) occurrences.add(frontier.occurrenceId);
  }
  return { origins: origins.size, fields: fields.size, occurrences: occurrences.size, terminals: terminals.size, frontiers: lineage.frontiers.length };
}

function validateSortedId<T extends { id: string }>(items: readonly T[], index: number, path: Array<string | number>, issues: ValidationIssue[]): void {
  if (index > 0 && items[index - 1].id.localeCompare(items[index].id) > 0) addIssue(issues, path, "items must be sorted by stable id");
}

function validateUniqueSorted(values: readonly string[], path: Array<string | number>, label: string, issues: ValidationIssue[], cancellation: AnalysisCancellationToken): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    cancellation.throwIfCancelled();
    if (seen.has(value)) addIssue(issues, [...path, index], `duplicate ${label} id "${value}"`);
    seen.add(value);
    if (index > 0 && values[index - 1].localeCompare(value) > 0) addIssue(issues, [...path, index], `${label} ids must be sorted`);
  });
}

function validateUnique(values: readonly string[], path: Array<string | number>, label: string, issues: ValidationIssue[], cancellation: AnalysisCancellationToken): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    cancellation.throwIfCancelled();
    if (seen.has(value)) addIssue(issues, [...path, index], `duplicate ${label} id "${value}"`);
    seen.add(value);
  });
}

function sameLocations(left: readonly RouteTotality["scopeProof"][number]["locations"][number][], right: readonly RouteTotality["scopeProof"][number]["locations"][number][]): boolean {
  return JSON.stringify(left.map(locationKey)) === JSON.stringify(right.map(locationKey));
}

function sameLocation(left: RouteTotality["scopeProof"][number]["locations"][number], right: RouteTotality["scopeProof"][number]["locations"][number]): boolean {
  return locationKey(left) === locationKey(right);
}

function locationKey(location: RouteTotality["scopeProof"][number]["locations"][number]): string {
  return `${location.file}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}

function isUnavailable(value: unknown): value is { status: "unavailable"; reason: string } {
  return Boolean(value && typeof value === "object" && "reason" in value && (value as { status?: unknown }).status === "unavailable");
}

function availableEvidence(value: RouteTotality["evidenceSlice"]): AvailableEvidence | null {
  return "elements" in value ? value : null;
}

function availableSurface(value: RouteTotality["occurrenceSurface"]): AvailableSurface | null {
  return "occurrences" in value ? value : null;
}

function hasPartialInputs(totality: RouteTotality): boolean {
  const surface = availableSurface(totality.occurrenceSurface);
  const evidence = availableEvidence(totality.evidenceSlice);
  if (!surface || !evidence) return false;
  return surface.status !== "complete"
    || Object.values(surface.truncation).some(Boolean)
    || !evidence.coverage.complete
    || evidence.coverage.budgetExhausted
    || Object.values(evidence.coverage.truncation).some(Boolean);
}

function exactOccurrenceAnchorId(
  occurrence: SurfaceOccurrence,
  entryElementId: string,
  evidence: AvailableEvidence,
): string | null {
  if (occurrence.parentOccurrenceId === null && occurrence.scopeSeed === entryElementId) {
    const entry = evidence.elements.find((element) => element.id === entryElementId);
    return entry && provenEvidenceElement(entry) && sameLocation(entry.location, occurrence.callSite) ? entry.id : null;
  }
  const candidates = evidence.elements.filter((element) => element.kind === "component-occurrence"
    && provenEvidenceElement(element)
    && sameLocation(element.location, occurrence.callSite));
  return candidates.length === 1 ? candidates[0].id : null;
}

function provenEvidenceElement(element: EvidenceElement): boolean {
  return element.status === "proven"
    && element.proof.length > 0
    && element.proof.every((proof) => proof.status === "proven" && proof.locations.length > 0);
}
