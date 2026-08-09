import type { EvidenceSlice } from "./evidence-slice";
import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceProof, SourceLocation } from "./scope-seam";
import { stableHash } from "./scope-seam";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import type {
  RouteTotalityField,
  RouteTotalityFieldAttachment,
  RouteTotalityFieldFrontier,
  RouteTotalityFieldFrontierReason,
  RouteTotalityFieldOrigin,
  RouteTotalityFieldSegment,
} from "./route-totality-field-lineage";

export type FieldState = {
  elementIds: string[];
  segments: RouteTotalityFieldSegment[];
  label: string;
  location: SourceLocation;
};

export type PathState = {
  currentElementId: string;
  currentOccurrenceId: string | null;
  field: FieldState | null;
  elementIds: string[];
  relationIds: string[];
  partial: boolean;
};

export type TraversalState = PathState & {
  origin: RouteTotalityFieldOrigin;
};

export type AttachmentAccumulator = {
  origin: RouteTotalityFieldOrigin;
  field: FieldState;
  occurrenceId: string;
  terminalIds: Set<string>;
  path: PathState;
};

export const MAX_FRONTIERS = 256;

export function appendField(previous: FieldState, next: FieldState, consecutive: boolean): FieldState | null {
  if (!consecutive) return null;
  const segments = [...previous.segments, ...next.segments];
  return {
    elementIds: [...previous.elementIds, ...next.elementIds],
    segments,
    label: fieldLabel(segments),
    location: next.location,
  };
}

export function fieldLabel(segments: RouteTotalityFieldSegment[]): string {
  return segments.reduce((label, segment) => {
    if (segment.kind === "property") return label ? `${label}.${segment.value}` : segment.value;
    if (segment.kind === "string-index") return `${label}["${segment.value}"]`;
    return `${label}[${segment.value}]`;
  }, "");
}

export function nextState(
  state: TraversalState,
  target: EvidenceSlice["elements"][number],
  relation: EvidenceSlice["relations"][number],
  field: FieldState | null,
  occurrenceId = state.currentOccurrenceId,
): TraversalState {
  return {
    origin: state.origin,
    currentElementId: target.id,
    currentOccurrenceId: occurrenceId,
    field,
    elementIds: [...state.elementIds, target.id],
    relationIds: [...state.relationIds, relation.id],
    partial: state.partial || target.status === "partial" || relation.status === "partial",
  };
}

export function addAttachment(
  attachments: Map<string, AttachmentAccumulator>,
  origin: RouteTotalityFieldOrigin,
  field: FieldState,
  occurrenceId: string,
  path: PathState,
  terminalId?: string,
): void {
  const key = JSON.stringify({ origin, field: field.elementIds, occurrenceId });
  const current = attachments.get(key);
  if (!current) {
    attachments.set(key, { origin, field, occurrenceId, terminalIds: terminalId ? new Set([terminalId]) : new Set(), path });
    return;
  }
  if (terminalId) current.terminalIds.add(terminalId);
  if (comparePath(path, current.path) < 0) current.path = path;
}

export function projectAttachment(
  attachment: AttachmentAccumulator,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
): RouteTotalityFieldAttachment {
  const field = projectField(attachment.field);
  const terminalIds = [...attachment.terminalIds].sort();
  const locations = locationsForPath(attachment.path, elementsById, slice, terminalIds, surface);
  const status = attachment.path.partial ? "partial" : "proven";
  return {
    id: `route-totality-field-attachment:${stableHash(JSON.stringify({
      origin: attachment.origin,
      field: attachment.field.elementIds,
      occurrenceId: attachment.occurrenceId,
    }))}`,
    origin: attachment.origin,
    field,
    occurrenceId: attachment.occurrenceId,
    terminalIds,
    evidencePathElementIds: [...attachment.path.elementIds],
    evidencePathRelationIds: [...attachment.path.relationIds],
    proof: [{
      kind: "route-totality-field-lineage",
      detail: "The proven named property path reaches the exact route occurrence.",
      locations,
      status,
    }],
    locations,
  };
}

function projectField(field: FieldState): RouteTotalityField {
  return {
    elementIds: [...field.elementIds],
    segments: field.segments.map((segment) => ({ ...segment })),
    label: field.label,
    location: field.location,
  };
}

export function makeFrontier(
  origin: RouteTotalityFieldOrigin,
  field: FieldState | null,
  occurrenceId: string | null,
  reason: RouteTotalityFieldFrontierReason,
  stoppedAtElementId: string | null,
  stoppedAtRelationId: string | null,
  location: SourceLocation | null,
  proof: EvidenceProof[],
): RouteTotalityFieldFrontier {
  return {
    id: `route-totality-field-frontier:${stableHash(JSON.stringify({
      origin,
      field: field?.elementIds ?? [],
      occurrenceId,
      reason,
      stoppedAtElementId,
      stoppedAtRelationId,
    }))}`,
    origin,
    field: field ? {
      elementIds: [...field.elementIds],
      segments: field.segments.map((segment) => ({ ...segment })),
      label: field.label,
    } : null,
    occurrenceId,
    reason,
    stoppedAtElementId,
    stoppedAtRelationId,
    location,
    proof,
  };
}

export function addFrontier(frontiers: Map<string, RouteTotalityFieldFrontier>, frontier: RouteTotalityFieldFrontier): void {
  if (frontiers.size >= MAX_FRONTIERS && !frontiers.has(frontier.id)) return;
  frontiers.set(frontier.id, frontier);
}

export function proofsForStop(
  state: PathState,
  relation: EvidenceSlice["relations"][number],
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  target: EvidenceSlice["elements"][number] | undefined,
): EvidenceProof[] {
  const locations = uniqueLocations([
    ...state.elementIds.flatMap((id) => {
      const location = elementsById.get(id)?.location;
      return location ? [location] : [];
    }),
    ...relation.proof.locations,
    ...(target ? [target.location] : []),
  ]);
  return [{
    kind: "route-totality-field-frontier",
    detail: "The bounded field path stopped before a proven downstream identity.",
    locations,
    status: relation.status === "partial"
      || relation.proof.status === "partial"
      || target?.status === "partial"
      || target?.proof.some((proof) => proof.status === "partial")
      ? "partial"
      : "proven",
  }];
}

export function proofsForPath(
  path: PathState,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
): EvidenceProof[] {
  const locations = uniqueLocations([
    ...path.elementIds.flatMap((id) => {
      const location = elementsById.get(id)?.location;
      return location ? [location] : [];
    }),
    ...path.relationIds.flatMap((id) => slice.relations.find((relation) => relation.id === id)?.proof.locations ?? []),
  ]);
  return [{
    kind: "route-totality-field-frontier",
    detail: "The bounded field path stopped at the evidence frontier.",
    locations,
    status: path.partial ? "partial" : "proven",
  }];
}

function locationsForPath(
  path: PathState,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
  terminalIds: string[],
  surface: RouteOccurrenceSurface,
): SourceLocation[] {
  const locations = [
    ...path.elementIds.flatMap((id) => {
      const location = elementsById.get(id)?.location;
      return location ? [location] : [];
    }),
    ...path.relationIds.flatMap((id) => slice.relations.find((relation) => relation.id === id)?.proof.locations ?? []),
    ...terminalIds.flatMap((id) => {
      const location = surface.terminals.find((terminal) => terminal.id === id)?.location;
      return location ? [location] : [];
    }),
  ];
  return uniqueLocations(locations);
}

export function hasSliceTruncation(slice: EvidenceSlice): boolean {
  return slice.coverage.budgetExhausted || Object.values(slice.coverage.truncation).some(Boolean);
}

export function lineageCounts(
  attachments: readonly RouteTotalityFieldAttachment[],
  frontiers: readonly RouteTotalityFieldFrontier[],
  cancellation: AnalysisCancellationToken,
) {
  const origins = new Set([...attachments, ...frontiers].map((item) => `${item.origin.elementId}:${item.origin.role}`));
  const fields = new Set([
    ...attachments.map((item) => item.field.elementIds.join("\u0000")),
    ...frontiers.flatMap((item) => item.field ? [item.field.elementIds.join("\u0000")] : []),
  ]);
  const occurrences = new Set([
    ...attachments.map((item) => item.occurrenceId),
    ...frontiers.flatMap((item) => item.occurrenceId ? [item.occurrenceId] : []),
  ]);
  const terminals = new Set(attachments.flatMap((item) => item.terminalIds));
  for (const attachment of attachments) cancellation.throwIfCancelled();
  for (const frontier of frontiers) cancellation.throwIfCancelled();
  return { origins: origins.size, fields: fields.size, occurrences: occurrences.size, terminals: terminals.size, frontiers: frontiers.length };
}

export function traversalKey(state: TraversalState): string {
  return JSON.stringify({
    origin: state.origin,
    currentElementId: state.currentElementId,
    currentOccurrenceId: state.currentOccurrenceId,
    field: state.field?.elementIds ?? [],
  });
}

export function compareTraversal(left: TraversalState, right: TraversalState): number {
  return comparePath(left, right)
    || left.currentElementId.localeCompare(right.currentElementId)
    || (left.currentOccurrenceId ?? "").localeCompare(right.currentOccurrenceId ?? "");
}

export function comparePath(left: PathState, right: PathState): number {
  return (left.partial ? 1 : 0) - (right.partial ? 1 : 0)
    || left.relationIds.length - right.relationIds.length
    || left.relationIds.join("\u0000").localeCompare(right.relationIds.join("\u0000"));
}

export function lastLocation(path: PathState, elementsById: Map<string, EvidenceSlice["elements"][number]>): SourceLocation | null {
  return elementsById.get(path.currentElementId)?.location ?? null;
}

export function uniqueLocations(locations: SourceLocation[]): SourceLocation[] {
  return [...new Map(locations.map((location) => [locationKey(location), location])).values()]
    .sort((left, right) => locationKey(left).localeCompare(locationKey(right)));
}

export function locationKey(location: SourceLocation): string {
  return `${location.file}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}

export function compareOrigin(left: EvidenceSlice["origins"][number], right: EvidenceSlice["origins"][number]): number {
  return `${left.elementId}:${left.role}`.localeCompare(`${right.elementId}:${right.role}`);
}
