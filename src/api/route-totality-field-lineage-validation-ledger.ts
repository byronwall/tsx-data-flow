import type { AnalysisCancellationToken } from "../analysis/cancellation";
import {
  fieldTransformationId,
} from "../analysis/route-totality-field-lineage-id";
import { isFullyProvenElement, isFullyProvenProof } from "../analysis/route-totality-field-lineage-transition";
import {
  deriveExactFieldTargetPolicy,
  EXACT_FIELD_TRANSFER_KINDS,
  verifyExactFieldTransfer,
} from "../analysis/route-totality-field-transfer-verifier";
import type { RouteTotality } from "./route-totality-contracts";
import { addIssue, type ValidationIssue } from "./route-occurrence-validation-graph";
import {
  endpointOccurrenceAnchors,
  endpointTerminalAnchors,
  exactElement,
  sameLocations,
  type EvidenceIndexes,
  type FieldAttachment,
  type SurfaceIndexes,
  type SurfaceOccurrence,
} from "./route-totality-field-lineage-validation-index";
import { validateStableFieldLineageId } from "./route-totality-field-lineage-validation-structure";

type Transformation = RouteTotality["fieldLineage"]["transformations"][number];

export function validateLedgerTransformations(
  lineage: RouteTotality["fieldLineage"],
  evidence: EvidenceIndexes,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  const seen = new Set<string>();
  const graph = transferGraph(evidence);
  for (let index = 0; index < lineage.transformations.length; index += 1) {
    cancellation.throwIfCancelled();
    const value = lineage.transformations[index];
    const path = ["fieldLineage", "transformations", index] as Array<string | number>;
    validateStableFieldLineageId(lineage.transformations, index, path, issues);
    if (seen.has(value.id)) addIssue(issues, [...path, "id"], "duplicate transformation id");
    seen.add(value.id);
    if (value.id !== fieldTransformationId(value)) addIssue(issues, [...path, "id"], "transformation id must equal its deterministic semantic identity");
    if (value.status !== "proven" || value.fromElementIds.length !== 1 || value.toElementIds.length !== 1
      || value.locations.length === 0 || value.proof.length === 0) {
      addIssue(issues, path, "each ledger transformation requires one proven exact source, target, and proof location");
    }
    for (const proof of value.proof) {
      if (!isFullyProvenProof(proof) || !sameLocations(proof.locations, value.locations, cancellation)) {
        addIssue(issues, [...path, "proof"], "ledger transformation proof must be fully proven and match its locations");
      }
    }
    for (const id of [...value.fromElementIds, ...value.toElementIds]) {
      if (!exactElement(evidence, id) || !isFullyProvenElement(exactElement(evidence, id), cancellation)) {
        addIssue(issues, path, "ledger transformations must reference fully proven evidence elements");
      }
    }
    const verification = verifyExactFieldTransfer(value, graph, cancellation);
    if (!verification.ok) addIssue(issues, path, verification.detail);
  }
}

export function validateLedgerAttachment(
  attachment: FieldAttachment,
  transformations: readonly Transformation[],
  occurrence: SurfaceOccurrence | undefined,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  const byId = new Map(transformations.map((item) => [item.id, item]));
  const unresolvedSteps = attachment.transformationIds.map((id) => byId.get(id));
  if (unresolvedSteps.some((item) => !item) || unresolvedSteps.length === 0
    || attachment.transformationKinds.length !== unresolvedSteps.length) {
    addIssue(issues, [...path, "transformationIds"], "attachment must reference every exact ledger transfer");
    return;
  }
  const steps = unresolvedSteps as Transformation[];
  for (let index = 0; index < steps.length; index += 1) {
    cancellation.throwIfCancelled();
    if (attachment.transformationKinds[index] !== steps[index].kind) {
      addIssue(issues, [...path, "transformationKinds", index], "transformation kind must match its referenced ledger record");
    }
    if (index > 0 && steps[index - 1].toElementIds[0] !== steps[index].fromElementIds[0]) {
      addIssue(issues, [...path, "transformationIds", index], "ledger transfers must form one contiguous exact chain");
    }
  }
  if (steps[0].fromElementIds[0] !== attachment.origin.elementId) {
    addIssue(issues, [...path, "origin"], "ledger chain must start at the selected exact origin");
  }
  if (steps.length !== EXACT_FIELD_TRANSFER_KINDS.length
    || steps.some((step, index) => step.kind !== EXACT_FIELD_TRANSFER_KINDS[index])) {
    addIssue(issues, [...path, "transformationIds"], "attachment must reference one ordered C01-C12 transfer chain");
    return;
  }
  const graph = transferGraph(evidence);
  const policy = deriveExactFieldTargetPolicy(steps, graph);
  if (!policy) {
    addIssue(issues, [...path, "transformationIds"], "ledger chain must derive one exact compiler-backed target policy");
    return;
  }
  for (let index = 0; index < steps.length; index += 1) {
    const verification = verifyExactFieldTransfer(steps[index], graph, cancellation, policy);
    if (!verification.ok) addIssue(issues, [...path, "transformationIds", index], verification.detail);
  }
  validateExactField(attachment, steps, policy, evidence, path, issues, cancellation);
  validateExactConsumer(attachment, occurrence, policy, evidence, surface, path, issues, cancellation);
}

function validateExactField(
  attachment: FieldAttachment,
  steps: readonly Transformation[],
  policy: NonNullable<ReturnType<typeof deriveExactFieldTargetPolicy>>,
  evidence: EvidenceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  const expectedIds = [steps[1].toElementIds[0], steps[2].toElementIds[0], steps[10].toElementIds[0]];
  if (attachment.field.elementIds.length !== 3
    || attachment.field.elementIds.some((id, index) => id !== expectedIds[index])) {
    addIssue(issues, [...path, "field", "elementIds"], "field element ids must equal the exact C02, C03, and C11 chain positions");
  }
  const collection = exactElement(evidence, expectedIds[0]);
  const collectionElement = exactElement(evidence, expectedIds[1]);
  const consumerField = exactElement(evidence, expectedIds[2]);
  const segments = attachment.field.segments;
  const expectedLabel = `${policy.collectionFieldName}[*].${policy.consumerFieldName}`;
  if (!collection || collection.kind !== "field-read" || collection.fieldName !== policy.collectionFieldName
    || !collectionElement || collectionElement.kind !== "collection-element"
    || !consumerField || consumerField.kind !== "field-read" || consumerField.fieldName !== policy.consumerFieldName
    || segments.length !== 3 || segments[0]?.kind !== "property" || segments[0]?.value !== collection.fieldName
    || segments[1]?.kind !== "collection-element" || segments[1]?.value !== "*"
    || segments[2]?.kind !== "property" || segments[2]?.value !== consumerField.fieldName
    || attachment.field.label !== expectedLabel
    || !sameLocations([attachment.field.location], consumerField ? [consumerField.location] : [], cancellation)) {
    addIssue(issues, [...path, "field"], "field segments, names, label, and location must derive from the exact chain facts");
  }
}

function validateExactConsumer(
  attachment: FieldAttachment,
  occurrence: SurfaceOccurrence | undefined,
  policy: NonNullable<ReturnType<typeof deriveExactFieldTargetPolicy>>,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  const consumer = attachment.consumer;
  const consumerElement = consumer ? exactElement(evidence, consumer.elementId) : undefined;
  const consumerOccurrence = consumer ? exactElement(evidence, consumer.occurrenceElementId) : undefined;
  if (!consumer || !consumerElement || !consumerOccurrence || !occurrence
    || consumer.elementId !== policy.consumerValueElementId
    || consumer.occurrenceElementId !== policy.componentOccurrenceElementId
    || consumer.kind !== "render"
    || consumer.label !== `${policy.componentLabel}.${policy.propName}`
    || consumer.occurrenceId !== attachment.occurrenceId
    || !sameLocations([consumer.location], [consumerElement.location], cancellation)) {
    addIssue(issues, [...path, "consumer"], "consumer must equal the exact C12 value, kind, label, location, and occurrence owner");
    return;
  }
  const occurrenceAnchors = endpointOccurrenceAnchors(surface.anchors, occurrence.id, cancellation);
  if (occurrenceAnchors.length !== 1 || occurrenceAnchors[0].evidenceElementId !== policy.componentOccurrenceElementId
    || !contains(consumerOccurrence.location, consumer.location)) {
    addIssue(issues, [...path, "consumer"], "consumer expression must belong to the exact anchored component occurrence");
  }
  const terminalId = attachment.terminalIds.length === 1 ? attachment.terminalIds[0] : null;
  const terminalRecords = terminalId ? surface.terminalsById.get(terminalId) ?? [] : [];
  const terminalAnchors = terminalId ? endpointTerminalAnchors(surface.anchors, terminalId, cancellation) : [];
  if (!terminalId || consumer.routeTerminalId !== terminalId || terminalRecords.length !== 1
    || terminalAnchors.length !== 1 || terminalAnchors[0].evidenceElementId !== policy.renderTerminalElementId) {
    addIssue(issues, [...path, "terminalIds"], "consumer terminal must map to the exact compiler-backed render terminal");
  }
}

function transferGraph(evidence: EvidenceIndexes) {
  return {
    element: (id: string) => exactElement(evidence, id),
    relation: (id: string) => {
      const values = evidence.relationsById.get(id) ?? [];
      return values.length === 1 ? values[0] : undefined;
    },
    outgoing: (id: string) => evidence.outgoing.get(id) ?? [],
  };
}

function contains(
  owner: { file: string; span: { startLine: number; startColumn: number; endLine: number; endColumn: number } },
  child: { file: string; span: { startLine: number; startColumn: number; endLine: number; endColumn: number } },
): boolean {
  return owner.file === child.file
    && (owner.span.startLine < child.span.startLine
      || owner.span.startLine === child.span.startLine && owner.span.startColumn <= child.span.startColumn)
    && (owner.span.endLine > child.span.endLine
      || owner.span.endLine === child.span.endLine && owner.span.endColumn >= child.span.endColumn);
}
