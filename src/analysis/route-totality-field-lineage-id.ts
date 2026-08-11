import { stableHash } from "./scope-seam";

type OriginIdentity = { elementId: string; role: string; selectedEvidenceId?: string | null };

export function fieldTransformationId(value: {
  kind: string;
  fromElementIds: readonly string[];
  toElementIds: readonly string[];
  evidenceRelationIds: readonly string[];
  supportingElementIds: readonly string[];
  supportingRelationIds: readonly string[];
  targetConsumer?: unknown;
}): string {
  return stableFieldId("transformation", [
    value.kind,
    ...value.fromElementIds,
    ...value.toElementIds,
    ...value.evidenceRelationIds,
    ...[...value.supportingElementIds].sort(),
    ...[...value.supportingRelationIds].sort(),
    ...(value.targetConsumer ? [JSON.stringify(value.targetConsumer)] : []),
  ]);
}

export function fieldConsumerId(value: {
  elementId: string;
  occurrenceElementId: string;
  occurrenceId: string;
  routeTerminalId: string | null;
  fieldLineageTerminalElementId: string;
  fieldLineageTerminalRelationId: string;
  target: unknown;
}): string {
  return stableFieldId("consumer", [
    value.elementId,
    value.occurrenceElementId,
    value.occurrenceId,
    value.routeTerminalId ?? "none",
    value.fieldLineageTerminalElementId,
    value.fieldLineageTerminalRelationId,
    JSON.stringify(value.target),
  ]);
}

export function fieldAttachmentId(value: {
  origin: OriginIdentity;
  fieldElementIds: readonly string[];
  occurrenceId: string;
  terminalIds: readonly string[];
  consumerId: string | null;
  transformationIds: readonly string[];
  evidencePathElementIds: readonly string[];
  evidencePathRelationIds: readonly string[];
}): string {
  return stableFieldId("attachment", [
    JSON.stringify(value.origin),
    ...value.fieldElementIds,
    value.occurrenceId,
    ...value.terminalIds,
    value.consumerId ?? "none",
    ...value.transformationIds,
    ...value.evidencePathElementIds,
    ...value.evidencePathRelationIds,
  ]);
}

export function fieldFrontierId(value: {
  origin: OriginIdentity;
  fieldElementIds: readonly string[];
  occurrenceId: string | null;
  reason: string;
  gapId: string | null;
  stoppedAtElementId: string | null;
  stoppedAtRelationId: string | null;
  missingTransformationKind: string | null;
  transformationIds: readonly string[];
}): string {
  return stableFieldId("frontier", [
    JSON.stringify(value.origin),
    ...value.fieldElementIds,
    value.occurrenceId ?? "none",
    value.reason,
    value.gapId ?? "none",
    value.stoppedAtElementId ?? "none",
    value.stoppedAtRelationId ?? "none",
    value.missingTransformationKind ?? "none",
    ...value.transformationIds,
  ]);
}

function stableFieldId(kind: string, values: readonly string[]): string {
  return `route-totality-field-${kind}:${stableHash(JSON.stringify(values))}`;
}
