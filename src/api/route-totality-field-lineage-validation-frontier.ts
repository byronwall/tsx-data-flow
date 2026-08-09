import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { cancellableStableSort } from "../analysis/cancellable-stable-sort";
import {
  canonicalRouteTotalityFieldGap,
  hasRouteTotalityFieldGap,
} from "../analysis/route-totality-field-lineage-truncation";
import {
  classifyRouteTotalityFieldTransition,
  isFullyProvenElement,
  isFullyProvenRelation,
} from "../analysis/route-totality-field-lineage-transition";
import { addIssue, type ValidationIssue } from "./route-occurrence-validation-graph";
import {
  exactElement,
  exactGap,
  exactRelation,
  sameLocations,
  type EvidenceGap,
  type EvidenceIndexes,
  type FieldFrontier,
  type SurfaceIndexes,
} from "./route-totality-field-lineage-validation-index";
import {
  componentPropBindingContext,
  componentPropBoundary,
} from "./route-totality-field-lineage-validation-binding";
import { validateFieldLineageFrontierPath } from "./route-totality-field-lineage-validation-frontier-path";
import { validateUniqueFieldLineageIds } from "./route-totality-field-lineage-validation-structure";

export function validateFieldLineageFrontierStop(
  frontier: FieldFrontier,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
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
    validateEvidenceTruncatedFrontier(frontier, evidence, surface, path, issues, cancellation);
  } else {
    if (frontier.gapId !== null) {
      addIssue(issues, [...path, "gapId"], "only evidence-truncated frontiers may contain a gap id");
    }
    validateFieldLineageFrontierPath(frontier, evidence, surface, path, issues, cancellation);
  }
  cancellation.throwIfCancelled();
}

function validateEvidenceTruncatedFrontier(
  frontier: FieldFrontier,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (!frontier.gapId) {
    addIssue(issues, [...path, "gapId"], "evidence-truncated frontier requires one exact gap id");
    return;
  }
  const gap = exactGap(evidence, frontier.gapId);
  if (!gap) {
    addIssue(issues, [...path, "gapId"], "evidence-truncated frontier gap must exist exactly once");
    return;
  }
  const canonicalGap = gap.from
    ? canonicalRouteTotalityFieldGap(gap.from, evidence.gapsByFrom, cancellation)
    : null;
  if (!canonicalGap || canonicalGap.id !== gap.id) {
    addIssue(issues, [...path, "gapId"], "evidence-truncated frontier must use the lexicographically canonical gap id");
  }
  if (!frontier.stoppedAtElementId || gap.from !== frontier.stoppedAtElementId) {
    addIssue(issues, [...path, "stoppedAtElementId"], "truncation frontier stopped element must equal its exact gap source");
  }
  const stopped = frontier.stoppedAtElementId ? exactElement(evidence, frontier.stoppedAtElementId) : undefined;
  if (!stopped || !isFullyProvenElement(stopped, cancellation)) {
    addIssue(issues, [...path, "stoppedAtElementId"], "truncation frontier must retain its last fully proven element");
  }
  validateCanonicalTruncationPath(frontier, evidence, surface, path, issues, cancellation);
  const expectedRelationId = namedGapRelationId(gap, evidence, cancellation);
  if (frontier.stoppedAtRelationId !== expectedRelationId) {
    addIssue(issues, [...path, "stoppedAtRelationId"], "truncation frontier relation must match its exact gap relation");
  }
  const expectedLocation = gap.location ?? stopped?.location ?? null;
  if (!sameOptionalLocation(frontier.location, expectedLocation, cancellation)) {
    addIssue(issues, [...path, "location"], "truncation frontier location must match its exact gap location");
  }
  const expectedLocations = truncationProofLocations(frontier, gap, expectedRelationId, evidence, cancellation);
  if (frontier.proof.length !== 1
    || frontier.proof[0].kind !== "route-totality-field-frontier"
    || frontier.proof[0].detail !== "The bounded field path reached an evidence slice gap."
    || frontier.proof[0].status !== "partial"
    || !sameLocations(frontier.proof[0].locations, expectedLocations, cancellation)) {
    addIssue(issues, [...path, "proof"], "truncation frontier proof must match its exact gap and canonical path");
  }
  cancellation.throwIfCancelled();
}

function validateCanonicalTruncationPath(
  frontier: FieldFrontier,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const elementIds = frontier.evidencePathElementIds;
  const relationIds = frontier.evidencePathRelationIds;
  if (elementIds.length === 0) {
    addIssue(issues, [...path, "evidencePathElementIds"], "truncation frontier requires its canonical path");
    return;
  }
  if (elementIds[0] !== frontier.origin.elementId) {
    addIssue(issues, [...path, "evidencePathElementIds", 0], "truncation path must start at its exact origin");
  }
  if (elementIds[elementIds.length - 1] !== frontier.stoppedAtElementId) {
    addIssue(issues, [...path, "evidencePathElementIds"], "truncation path must end at its stopped element");
  }
  validateUniqueFieldLineageIds(elementIds, [...path, "evidencePathElementIds"], "evidence element", issues, cancellation);
  validateUniqueFieldLineageIds(relationIds, [...path, "evidencePathRelationIds"], "evidence relation", issues, cancellation);
  if (relationIds.length !== elementIds.length - 1) {
    addIssue(issues, path, "truncation path must contain one relation between adjacent elements");
  }
  for (let index = 0; index < elementIds.length; index += 1) {
    cancellation.throwIfCancelled();
    const element = exactElement(evidence, elementIds[index]);
    if (!element || !isFullyProvenElement(element, cancellation)) {
      addIssue(issues, [...path, "evidencePathElementIds", index], "truncation path elements must be unique, existing, and fully proven");
    }
  }

  let currentOccurrenceId = surface.rootOccurrenceId;
  let fieldIndex = 0;
  let currentFieldElementId: string | null = null;
  let componentPropReceiverElementId: string | null = null;
  for (let index = 0; index < relationIds.length; index += 1) {
    cancellation.throwIfCancelled();
    const relation = exactRelation(evidence, relationIds[index]);
    const source = exactElement(evidence, elementIds[index]);
    const target = exactElement(evidence, elementIds[index + 1]);
    if (!relation || !source || !target
      || relation.from !== source.id
      || relation.to !== target.id
      || !isFullyProvenRelation(relation, cancellation)) {
      addIssue(issues, [...path, "evidencePathRelationIds", index], "truncation path relation must exactly connect fully proven adjacent evidence");
      continue;
    }
    if (hasRouteTotalityFieldGap(source.id, evidence.gapsByFrom, cancellation)) {
      addIssue(issues, [...path, "evidencePathElementIds", index], "truncation path cannot cross an ordinary evidence gap");
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
      isInitialOrigin: index === 0 && source.id === frontier.origin.elementId,
      staticNamedField: target.kind === "field-read" ? target.fieldName !== null : null,
      indexMetadata: target.kind === "index-read" ? target.index : null,
      currentFieldElementId,
      componentPropReceiverElementId,
      occurrenceAnchorCount: occurrenceAnchors.length,
      terminalAnchorCount: terminalAnchors.length,
      currentOccurrenceId,
      terminalOwnerOccurrenceId: terminal?.ownerOccurrenceId,
      componentPropBoundaryCount: bindingContext?.boundaryCount,
      componentPropOccurrenceAnchorCount: bindingContext?.occurrenceAnchorCount,
      componentPropBindingReceiverCount: bindingContext?.receiverCount,
      componentPropReceiverRootProven: bindingContext?.receiverRootProven,
      componentPropBindingIncomplete: bindingContext?.bindingIncomplete,
      cancellation,
    });
    if (transition.kind === "stop" || transition.kind === "component-prop" || transition.kind === "render-terminal") {
      addIssue(issues, [...path, "evidencePathRelationIds", index], "truncation path must contain only accepted traversal transitions");
      continue;
    }
    if (transition.kind === "field-input") {
      if (!frontier.field
        || fieldIndex >= frontier.field.elementIds.length
        || target.id !== frontier.field.elementIds[fieldIndex]) {
        addIssue(issues, [...path, "field"], "truncation path must carry exact field elements in order");
      }
      fieldIndex += 1;
      currentFieldElementId = target.id;
      componentPropReceiverElementId = null;
      continue;
    }
    if (transition.kind === "component-prop-binding-start") {
      const boundary = componentPropBoundary(source.id, evidence, surface, cancellation);
      if (!boundary) {
        addIssue(issues, [...path, "evidencePathRelationIds", index], "component-prop binding must retain one exact component occurrence boundary");
      } else {
        currentOccurrenceId = boundary.occurrenceId;
      }
      componentPropReceiverElementId = null;
      continue;
    }
    if (transition.kind === "component-prop-binding-receiver") {
      if (frontier.field && fieldIndex > 0 && target.fieldName !== frontier.field.segments.at(-1)?.value) {
        addIssue(issues, [...path, "field"], "component-prop binding cannot rename an existing field");
      }
      if (!target.fieldName) {
        addIssue(issues, [...path, "evidencePathRelationIds", index], "component-prop binding receiver must have one exact named field");
      }
      componentPropReceiverElementId = target.id;
      continue;
    }
  }
  if (!frontier.field || fieldIndex !== frontier.field.elementIds.length || fieldIndex === 0) {
    addIssue(issues, [...path, "field"], "truncation path must carry every exact field element");
  }
  if (!frontier.occurrenceId || frontier.occurrenceId !== currentOccurrenceId) {
    addIssue(issues, [...path, "occurrenceId"], "truncation frontier must retain its exact current occurrence");
  }
  cancellation.throwIfCancelled();
}

function namedGapRelationId(
  gap: EvidenceGap,
  evidence: EvidenceIndexes,
  cancellation: AnalysisCancellationToken,
): string | null {
  cancellation.throwIfCancelled();
  if (!gap.from || !gap.to) return null;
  const matches: string[] = [];
  for (const relation of evidence.outgoing.get(gap.from) ?? []) {
    cancellation.throwIfCancelled();
    if (relation.to === gap.to) matches.push(relation.id);
  }
  cancellation.throwIfCancelled();
  return matches.length === 1 ? matches[0] : null;
}

function truncationProofLocations(
  frontier: FieldFrontier,
  gap: EvidenceGap,
  relationId: string | null,
  evidence: EvidenceIndexes,
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  const locations = [] as NonNullable<FieldFrontier["location"]>[];
  for (const elementId of frontier.evidencePathElementIds) {
    cancellation.throwIfCancelled();
    const location = exactElement(evidence, elementId)?.location;
    if (location) locations.push(location);
  }
  if (relationId) {
    const relation = exactRelation(evidence, relationId);
    for (const location of relation?.proof.locations ?? []) {
      cancellation.throwIfCancelled();
      locations.push(location);
    }
  }
  if (gap.location) locations.push(gap.location);
  for (const proof of gap.proof) {
    cancellation.throwIfCancelled();
    for (const location of proof.locations) {
      cancellation.throwIfCancelled();
      locations.push(location);
    }
  }
  const unique = new Map<string, NonNullable<FieldFrontier["location"]>>();
  for (const location of locations) {
    cancellation.throwIfCancelled();
    unique.set(locationKey(location), location);
  }
  const values: NonNullable<FieldFrontier["location"]>[] = [];
  for (const location of unique.values()) {
    cancellation.throwIfCancelled();
    values.push(location);
  }
  return cancellableStableSort(values, (left, right) => locationKey(left).localeCompare(locationKey(right)), cancellation);
}

function sameOptionalLocation(
  left: FieldFrontier["location"],
  right: FieldFrontier["location"],
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  if (left === null || right === null) return left === right;
  return sameLocations([left], [right], cancellation);
}

function locationKey(location: NonNullable<FieldFrontier["location"]>): string {
  return `${location.file}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}
