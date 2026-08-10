import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceSlice } from "./evidence-slice";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import { fieldAttachmentId } from "./route-totality-field-lineage-id";
import type {
  RouteTotalityField,
  RouteTotalityFieldAttachment,
  RouteTotalityFieldOrigin,
} from "./route-totality-field-lineage";
import type { FieldState, PathState } from "./route-totality-field-lineage-support";
import { comparePath, uniqueLocations } from "./route-totality-field-lineage-support";

export type AttachmentAccumulator = {
  origin: RouteTotalityFieldOrigin;
  field: FieldState;
  occurrenceId: string;
  terminalId: string;
  path: PathState;
};

export function addAttachment(
  attachments: Map<string, AttachmentAccumulator>,
  origin: RouteTotalityFieldOrigin,
  field: FieldState,
  occurrenceId: string,
  terminalId: string,
  path: PathState,
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const key = JSON.stringify({ origin, field: field.elementIds, occurrenceId, terminalId });
  const current = attachments.get(key);
  if (!current) {
    attachments.set(key, { origin, field, occurrenceId, terminalId, path });
    cancellation.throwIfCancelled();
    return;
  }
  if (comparePath(path, current.path) < 0) current.path = path;
  cancellation.throwIfCancelled();
}

export function projectAttachment(
  attachment: AttachmentAccumulator,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  relationsById: ReadonlyMap<string, EvidenceSlice["relations"][number]>,
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldAttachment {
  cancellation.throwIfCancelled();
  const field = projectField(attachment.field, cancellation);
  const locations = locationsForPath(
    attachment.path,
    elementsById,
    relationsById,
    attachment.terminalId,
    surface,
    cancellation,
  );
  const evidencePathElementIds = copyIds(attachment.path.elementIds, cancellation);
  const evidencePathRelationIds = copyIds(attachment.path.relationIds, cancellation);
  cancellation.throwIfCancelled();
  const result: RouteTotalityFieldAttachment = {
    id: "",
    origin: { ...attachment.origin },
    field,
    occurrenceId: attachment.occurrenceId,
    terminalIds: [attachment.terminalId],
    evidencePathElementIds,
    evidencePathRelationIds,
    proof: [{
      kind: "route-totality-field-lineage",
      detail: "The proven field or literal index path reaches the exact route occurrence and render terminal.",
      locations,
      status: "proven",
    }],
    locations,
    consumer: null,
    alias: null,
    transformationIds: [],
    transformationKinds: [],
  };
  result.id = fieldAttachmentId({
    origin: result.origin,
    fieldElementIds: result.field.elementIds,
    occurrenceId: result.occurrenceId,
    terminalIds: result.terminalIds,
    consumerId: null,
    transformationIds: result.transformationIds,
    evidencePathElementIds: result.evidencePathElementIds,
    evidencePathRelationIds: result.evidencePathRelationIds,
  });
  return result;
}

function projectField(field: FieldState, cancellation: AnalysisCancellationToken): RouteTotalityField {
  cancellation.throwIfCancelled();
  const elementIds = copyIds(field.elementIds, cancellation);
  const segments: RouteTotalityField["segments"] = [];
  for (const segment of field.segments) {
    cancellation.throwIfCancelled();
    segments.push({ ...segment });
  }
  cancellation.throwIfCancelled();
  return { elementIds, segments, label: field.label, location: field.location };
}

function locationsForPath(
  path: PathState,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  relationsById: ReadonlyMap<string, EvidenceSlice["relations"][number]>,
  terminalId: string,
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  const locations = [] as RouteTotalityFieldAttachment["locations"];
  for (const elementId of path.elementIds) {
    cancellation.throwIfCancelled();
    const location = elementsById.get(elementId)?.location;
    if (location) locations.push(location);
  }
  for (const relationId of path.relationIds) {
    cancellation.throwIfCancelled();
    const relation = relationsById.get(relationId);
    if (!relation) continue;
    for (const location of relation.proof.locations) {
      cancellation.throwIfCancelled();
      locations.push(location);
    }
  }
  for (const terminal of surface.terminals) {
    cancellation.throwIfCancelled();
    if (terminal.id === terminalId) {
      locations.push(terminal.location);
      break;
    }
  }
  return uniqueLocations(locations, cancellation);
}

function copyIds(values: readonly string[], cancellation: AnalysisCancellationToken): string[] {
  cancellation.throwIfCancelled();
  const copied: string[] = [];
  for (const value of values) {
    cancellation.throwIfCancelled();
    copied.push(value);
  }
  cancellation.throwIfCancelled();
  return copied;
}
