import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceProof, ProgramElement, ProgramRelation, SourceLocation } from "./scope-seam";
import { stableHash } from "./scope-seam";
import type {
  RouteTotalityFieldAttachment,
  RouteTotalityFieldFrontier,
  RouteTotalityFieldLineage,
  RouteTotalityFieldOrigin,
  RouteTotalityFieldTransformation,
} from "./route-totality-field-lineage";
import type { ExactFieldTransferKind } from "./route-totality-field-transfer-verifier";

export type FieldProofResultInput = {
  origin: RouteTotalityFieldOrigin;
  games: ProgramElement;
  collectionElement: ProgramElement;
  field: ProgramElement;
  occurrence: ProgramElement;
  titleValue: ProgramElement;
  binding: ProgramElement;
  occurrenceId: string;
  terminalId: string;
  transformations: RouteTotalityFieldTransformation[];
  partial: boolean;
};

export function provenFieldProof(input: FieldProofResultInput, cancellation: AnalysisCancellationToken): RouteTotalityFieldLineage {
  const locations = uniqueLocations([
    ...input.transformations.flatMap((item) => item.locations),
    input.titleValue.location,
  ], cancellation);
  const consumer = {
    id: stableId("consumer", [input.occurrence.id, input.titleValue.id, input.binding.id]),
    elementId: input.titleValue.id,
    occurrenceElementId: input.occurrence.id,
    kind: "render" as const,
    label: `${input.occurrence.label}.title`,
    occurrenceId: input.occurrenceId,
    routeTerminalId: input.terminalId,
    location: input.titleValue.location,
  };
  const attachment: RouteTotalityFieldAttachment = {
    id: stableId("attachment", [input.origin.elementId, input.games.id, input.collectionElement.id, input.field.id, input.occurrenceId, consumer.id]),
    origin: input.origin,
    field: {
      elementIds: [input.games.id, input.collectionElement.id, input.field.id],
      segments: [
        { kind: "property", value: input.games.fieldName! },
        { kind: "collection-element", value: "*" },
        { kind: "property", value: input.field.fieldName! },
      ],
      label: `${input.games.fieldName}[*].${input.field.fieldName}`,
      location: input.field.location,
    },
    occurrenceId: input.occurrenceId,
    terminalIds: [input.terminalId],
    evidencePathElementIds: [input.origin.elementId],
    evidencePathRelationIds: [],
    proof: [proof("The shared verifier accepts every exact C01-C12 transfer.", locations)],
    locations,
    consumer,
    alias: null,
    transformationIds: input.transformations.map((item) => item.id),
    transformationKinds: input.transformations.map((item) => item.kind),
  };
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

export function failedFieldProof(
  origin: RouteTotalityFieldOrigin,
  current: ProgramElement | null,
  missingTransformationKind: ExactFieldTransferKind,
  accepted: readonly RouteTotalityFieldTransformation[],
  detail: string,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage {
  const locations = current ? uniqueLocations([current.location], cancellation) : [];
  const frontier: RouteTotalityFieldFrontier = {
    id: stableId("frontier", [origin.elementId, current?.id ?? "none", missingTransformationKind, detail]),
    origin,
    field: null,
    occurrenceId: null,
    reason: "partial-proof",
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
): RouteTotalityFieldTransformation {
  const locations = uniqueLocations(relations.flatMap((relation) => relation.proof.locations), cancellation);
  return {
    id: stableId("transformation", [kind, from.id, to.id, ...relations.map((item) => item.id), ...supportingRelations.map((item) => item.id)]),
    kind,
    fromElementIds: [from.id],
    toElementIds: [to.id],
    evidenceRelationIds: relations.map((item) => item.id),
    supportingElementIds: supportingElements.map((item) => item.id).sort(),
    supportingRelationIds: supportingRelations.map((item) => item.id).sort(),
    locations,
    proof: [proof(`The shared compiler evidence proves the exact ${kind} transfer.`, locations)],
    status: "proven",
  };
}

function proof(detail: string, locations: SourceLocation[], status: "proven" | "partial" = "proven"): EvidenceProof {
  return { kind: "route-totality-field-transfer", detail, locations, status };
}

function stableId(kind: string, values: readonly string[]): string {
  return `route-totality-field-${kind}:${stableHash(JSON.stringify(values))}`;
}

function uniqueLocations(locations: readonly SourceLocation[], cancellation: AnalysisCancellationToken): SourceLocation[] {
  const records = new Map<string, SourceLocation>();
  for (const location of locations) {
    cancellation.throwIfCancelled();
    records.set(JSON.stringify(location), location);
  }
  return [...records.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
