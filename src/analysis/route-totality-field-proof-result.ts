import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceProof, ProgramElement, ProgramRelation, SourceLocation } from "./scope-seam";
import {
  fieldAttachmentId,
  fieldConsumerId,
  fieldFrontierId,
  fieldTransformationId,
} from "./route-totality-field-lineage-id";
import type {
  RouteTotalityFieldAttachment,
  RouteTotalityFieldFrontier,
  RouteTotalityFieldLineage,
  RouteTotalityFieldOrigin,
  RouteTotalityFieldTransformation,
  RouteTotalityFieldTargetConsumer,
} from "./route-totality-field-lineage";
import type { ExactFieldTransferKind } from "./route-totality-field-transfer-verifier";

export type FieldProofResultInput = {
  origin: RouteTotalityFieldOrigin;
  collectionField: ProgramElement;
  collectionElement: ProgramElement;
  consumerField: ProgramElement;
  occurrence: ProgramElement;
  consumerValue: ProgramElement;
  binding: ProgramElement;
  occurrenceId: string;
  terminalId: string;
  transformations: RouteTotalityFieldTransformation[];
  partial: boolean;
  consumerKind: "render" | "condition" | "handler";
  consumerLabel: string;
  directConsumer: boolean;
  sourceField: ProgramElement | null;
  boundaryMode: "direct" | "whole-object" | "scalar-alias";
  alias: string | null;
  targetConsumer: RouteTotalityFieldTargetConsumer;
  fieldLineageTerminalElementId: string;
  fieldLineageTerminalRelationId: string;
};

export function provenFieldProof(input: FieldProofResultInput, cancellation: AnalysisCancellationToken): RouteTotalityFieldLineage {
  const locations = uniqueLocations([
    ...input.transformations.flatMap((item) => item.locations),
    input.consumerValue.location,
  ], cancellation);
  const consumer = {
    id: "",
    elementId: input.consumerValue.id,
    occurrenceElementId: input.occurrence.id,
    kind: input.consumerKind,
    label: input.consumerLabel,
    occurrenceId: input.occurrenceId,
    routeTerminalId: input.terminalId,
    fieldLineageTerminalElementId: input.fieldLineageTerminalElementId,
    fieldLineageTerminalRelationId: input.fieldLineageTerminalRelationId,
    target: input.targetConsumer,
    location: input.consumerValue.location,
  };
  consumer.id = fieldConsumerId(consumer);
  const attachment: RouteTotalityFieldAttachment = {
    id: "",
    origin: input.origin,
    field: {
      elementIds: [input.collectionField.id, input.collectionElement.id, (input.sourceField ?? input.consumerField).id],
      segments: [
        { kind: "property", value: input.collectionField.fieldName! },
        { kind: "collection-element", value: "*" },
        { kind: "property", value: (input.sourceField ?? input.consumerField).fieldName! },
      ],
      label: `${input.collectionField.fieldName}[*].${(input.sourceField ?? input.consumerField).fieldName!}`,
      location: input.sourceField?.location ?? input.consumerField.location,
    },
    occurrenceId: input.occurrenceId,
    terminalIds: [input.terminalId],
    evidencePathElementIds: [input.origin.elementId],
    evidencePathRelationIds: [],
    proof: [proof("The shared verifier accepts every exact C01-C12 transfer.", locations)],
    locations,
    consumer,
    alias: input.alias,
    transformationIds: input.transformations.map((item) => item.id),
    transformationKinds: input.transformations.map((item) => item.kind),
  };
  attachment.id = fieldAttachmentId({
    origin: attachment.origin,
    fieldElementIds: attachment.field.elementIds,
    occurrenceId: attachment.occurrenceId,
    terminalIds: attachment.terminalIds,
    consumerId: attachment.consumer?.id ?? null,
    transformationIds: attachment.transformationIds,
    evidencePathElementIds: attachment.evidencePathElementIds,
    evidencePathRelationIds: attachment.evidencePathRelationIds,
  });
  return {
    status: input.partial ? "partial" : "complete",
    unavailableReason: null,
    attachments: [attachment],
    frontiers: [],
    counts: { origins: 1, fields: 1, occurrences: 1, terminals: 1, frontiers: 0, transformations: input.transformations.length },
    omissions: input.partial ? ["The shared route evidence is partial."] : [],
    transformations: input.transformations,
  };
}

export function mergeProvenFieldProofs(
  values: readonly RouteTotalityFieldLineage[],
  partial: boolean,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage {
  const attachments = values.flatMap((value) => value.attachments);
  const frontiers = values.flatMap((value) => value.frontiers);
  const transformations = [...new Map(values.flatMap((value) => value.transformations).map((item) => [item.id, item])).values()];
  const fields = new Set(attachments.map((attachment) => attachment.field.elementIds.join("\u0000")));
  for (const frontier of frontiers) {
    cancellation.throwIfCancelled();
    if (frontier.field) fields.add(frontier.field.elementIds.join("\u0000"));
  }
  const occurrences = new Set(attachments.map((attachment) => attachment.occurrenceId));
  const terminals = new Set(attachments.flatMap((attachment) => attachment.terminalIds));
  const omissions = [...new Set(values.flatMap((value) => value.omissions))];
  cancellation.throwIfCancelled();
  return {
    status: partial || frontiers.length > 0 ? "partial" : "complete",
    unavailableReason: null,
    attachments: attachments.sort((left, right) => left.id.localeCompare(right.id)),
    frontiers: frontiers.sort((left, right) => left.id.localeCompare(right.id)),
    counts: {
      origins: values.length > 0 ? 1 : 0,
      fields: fields.size,
      occurrences: occurrences.size,
      terminals: terminals.size,
      frontiers: frontiers.length,
      transformations: transformations.length,
    },
    omissions,
    transformations: transformations.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function failedFieldProof(
  origin: RouteTotalityFieldOrigin,
  current: ProgramElement | null,
  missingTransformationKind: ExactFieldTransferKind | "unsupported-transform",
  accepted: readonly RouteTotalityFieldTransformation[],
  detail: string,
  cancellation: AnalysisCancellationToken,
  reason: RouteTotalityFieldFrontier["reason"] = "partial-proof",
  field: Omit<NonNullable<RouteTotalityFieldFrontier["field"]>, "location"> | null = null,
): RouteTotalityFieldLineage {
  const locations = current ? uniqueLocations([current.location], cancellation) : [];
  const normalizedField = field ? {
    ...field,
    elementIds: field.elementIds.filter((_, index) => field.segments[index]?.kind !== "collection-element"),
  } : null;
  const frontier: RouteTotalityFieldFrontier = {
    id: "",
    origin,
    field: normalizedField,
    occurrenceId: null,
    reason,
    gapId: null,
    stoppedAtElementId: current?.id ?? origin.elementId,
    stoppedAtRelationId: null,
    evidencePathElementIds: [origin.elementId],
    evidencePathRelationIds: [],
    location: current?.location ?? null,
    proof: locations.length ? [proof(detail, locations, "partial")] : [],
    missingTransformationKind,
    transformationIds: accepted.map((item) => item.id),
  };
  frontier.id = fieldFrontierId({
    origin: frontier.origin,
    fieldElementIds: normalizedField?.elementIds ?? [],
    occurrenceId: frontier.occurrenceId,
    reason: frontier.reason,
    gapId: frontier.gapId,
    stoppedAtElementId: frontier.stoppedAtElementId,
    stoppedAtRelationId: frontier.stoppedAtRelationId,
    missingTransformationKind: frontier.missingTransformationKind,
    transformationIds: frontier.transformationIds,
  });
  return {
    status: "partial",
    unavailableReason: null,
    attachments: [],
    frontiers: [frontier],
    counts: { origins: 1, fields: 0, occurrences: 0, terminals: 0, frontiers: 1, transformations: accepted.length },
    omissions: [detail],
    transformations: [...accepted],
  };
}

export function fieldTransformation(
  kind: ExactFieldTransferKind,
  from: ProgramElement,
  to: ProgramElement,
  relations: readonly ProgramRelation[],
  supportingElements: readonly ProgramElement[] = [],
  supportingRelations: readonly ProgramRelation[] = [],
  cancellation: AnalysisCancellationToken,
  targetConsumer: RouteTotalityFieldTargetConsumer | null = null,
): RouteTotalityFieldTransformation {
  const locations = uniqueLocations(relations.flatMap((relation) => relation.proof.locations), cancellation);
  return {
    id: fieldTransformationId({
      kind,
      fromElementIds: [from.id],
      toElementIds: [to.id],
      evidenceRelationIds: relations.map((item) => item.id),
      supportingElementIds: supportingElements.map((item) => item.id),
      supportingRelationIds: supportingRelations.map((item) => item.id),
      targetConsumer,
    }),
    kind,
    fromElementIds: [from.id],
    toElementIds: [to.id],
    evidenceRelationIds: relations.map((item) => item.id),
    supportingElementIds: supportingElements.map((item) => item.id).sort(),
    supportingRelationIds: supportingRelations.map((item) => item.id).sort(),
    targetConsumer,
    locations,
    proof: [proof(`The shared compiler evidence proves the exact ${kind} transfer.`, locations)],
    status: "proven",
  };
}

function proof(detail: string, locations: SourceLocation[], status: "proven" | "partial" = "proven"): EvidenceProof {
  return { kind: "route-totality-field-transfer", detail, locations, status };
}

function uniqueLocations(locations: readonly SourceLocation[], cancellation: AnalysisCancellationToken): SourceLocation[] {
  const records = new Map<string, SourceLocation>();
  for (const location of locations) {
    cancellation.throwIfCancelled();
    records.set(JSON.stringify(location), location);
  }
  return [...records.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
