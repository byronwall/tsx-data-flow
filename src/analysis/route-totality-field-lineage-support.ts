import type { AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import type { EvidenceGap, EvidenceProof, SourceLocation } from "./scope-seam";
import { stableHash } from "./scope-seam";
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

export type FrontierAccumulator = {
  emitted: Map<string, RouteTotalityFieldFrontier>;
  omittedIds: Set<string>;
};

export type TruncatedTraversalState = {
  origin: RouteTotalityFieldOrigin;
  field: FieldState;
  currentElementId: string;
  currentOccurrenceId: string | null;
  path: PathState;
  gap: EvidenceGap;
};

export const MAX_FRONTIERS = 256;

export function appendField(
  previous: FieldState,
  next: FieldState,
  consecutive: boolean,
  cancellation: AnalysisCancellationToken,
): FieldState | null {
  cancellation.throwIfCancelled();
  if (!consecutive) return null;
  const elementIds: string[] = [];
  const segments: RouteTotalityFieldSegment[] = [];
  for (const elementId of previous.elementIds) {
    cancellation.throwIfCancelled();
    elementIds.push(elementId);
  }
  for (const elementId of next.elementIds) {
    cancellation.throwIfCancelled();
    elementIds.push(elementId);
  }
  for (const segment of previous.segments) {
    cancellation.throwIfCancelled();
    segments.push({ ...segment });
  }
  for (const segment of next.segments) {
    cancellation.throwIfCancelled();
    segments.push({ ...segment });
  }
  cancellation.throwIfCancelled();
  return {
    elementIds,
    segments,
    label: fieldLabel(segments, cancellation),
    location: next.location,
  };
}

export function fieldLabel(
  segments: readonly RouteTotalityFieldSegment[],
  cancellation: AnalysisCancellationToken,
): string {
  let label = "";
  for (const segment of segments) {
    cancellation.throwIfCancelled();
    if (segment.kind === "property") label = label ? `${label}.${segment.value}` : segment.value;
    else if (segment.kind === "string-index") label = `${label}["${segment.value}"]`;
    else label = `${label}[${segment.value}]`;
  }
  cancellation.throwIfCancelled();
  return label;
}

export function nextState(
  state: TraversalState,
  target: EvidenceSlice["elements"][number],
  relation: EvidenceSlice["relations"][number],
  field: FieldState | null,
  occurrenceId: string | null,
  cancellation: AnalysisCancellationToken,
): TraversalState {
  cancellation.throwIfCancelled();
  const elementIds: string[] = [];
  const relationIds: string[] = [];
  for (const elementId of state.elementIds) {
    cancellation.throwIfCancelled();
    elementIds.push(elementId);
  }
  elementIds.push(target.id);
  for (const relationId of state.relationIds) {
    cancellation.throwIfCancelled();
    relationIds.push(relationId);
  }
  relationIds.push(relation.id);
  cancellation.throwIfCancelled();
  return {
    origin: state.origin,
    currentElementId: target.id,
    currentOccurrenceId: occurrenceId,
    field,
    elementIds,
    relationIds,
    partial: false,
  };
}

export function addAttachment(
  attachments: Map<string, AttachmentAccumulator>,
  origin: RouteTotalityFieldOrigin,
  field: FieldState,
  occurrenceId: string,
  path: PathState,
  cancellation: AnalysisCancellationToken,
  terminalId?: string,
): void {
  cancellation.throwIfCancelled();
  const key = JSON.stringify({ origin, field: field.elementIds, occurrenceId });
  const current = attachments.get(key);
  if (!current) {
    const terminalIds = new Set<string>();
    if (terminalId) terminalIds.add(terminalId);
    attachments.set(key, { origin, field, occurrenceId, terminalIds, path });
    cancellation.throwIfCancelled();
    return;
  }
  if (terminalId) current.terminalIds.add(terminalId);
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
  const terminalIds: string[] = [];
  for (const terminalId of attachment.terminalIds) {
    cancellation.throwIfCancelled();
    terminalIds.push(terminalId);
  }
  const sortedTerminalIds = cancellableStableSort(terminalIds, (left, right) => left.localeCompare(right), cancellation);
  const locations = locationsForPath(
    attachment.path,
    elementsById,
    relationsById,
    sortedTerminalIds,
    surface,
    cancellation,
  );
  const elementIds: string[] = [];
  const relationIds: string[] = [];
  for (const elementId of attachment.path.elementIds) {
    cancellation.throwIfCancelled();
    elementIds.push(elementId);
  }
  for (const relationId of attachment.path.relationIds) {
    cancellation.throwIfCancelled();
    relationIds.push(relationId);
  }
  cancellation.throwIfCancelled();
  return {
    id: `route-totality-field-attachment:${stableHash(JSON.stringify({
      origin: attachment.origin,
      field: attachment.field.elementIds,
      occurrenceId: attachment.occurrenceId,
    }))}`,
    origin: { ...attachment.origin },
    field,
    occurrenceId: attachment.occurrenceId,
    terminalIds: sortedTerminalIds,
    evidencePathElementIds: elementIds,
    evidencePathRelationIds: relationIds,
    proof: [{
      kind: "route-totality-field-lineage",
      detail: "The proven named property path reaches the exact route occurrence.",
      locations,
      status: "proven",
    }],
    locations,
  };
}

function projectField(field: FieldState, cancellation: AnalysisCancellationToken): RouteTotalityField {
  cancellation.throwIfCancelled();
  const elementIds: string[] = [];
  const segments: RouteTotalityFieldSegment[] = [];
  for (const elementId of field.elementIds) {
    cancellation.throwIfCancelled();
    elementIds.push(elementId);
  }
  for (const segment of field.segments) {
    cancellation.throwIfCancelled();
    segments.push({ ...segment });
  }
  cancellation.throwIfCancelled();
  return {
    elementIds,
    segments,
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
  cancellation: AnalysisCancellationToken,
  semanticSuffix: string | null = null,
): RouteTotalityFieldFrontier {
  cancellation.throwIfCancelled();
  const elementIds: string[] = [];
  const segments: RouteTotalityFieldSegment[] = [];
  if (field) {
    for (const elementId of field.elementIds) {
      cancellation.throwIfCancelled();
      elementIds.push(elementId);
    }
    for (const segment of field.segments) {
      cancellation.throwIfCancelled();
      segments.push({ ...segment });
    }
  }
  cancellation.throwIfCancelled();
  return {
    id: `route-totality-field-frontier:${stableHash(JSON.stringify({
      origin,
      field: field?.elementIds ?? [],
      occurrenceId,
      reason,
      stoppedAtElementId,
      stoppedAtRelationId,
      semanticSuffix,
    }))}`,
    origin: { ...origin },
    field: field ? { elementIds, segments, label: field.label } : null,
    occurrenceId,
    reason,
    stoppedAtElementId,
    stoppedAtRelationId,
    location,
    proof,
  };
}

/** Keep the lexically first bounded set and remember every dropped identity. */
export function addFrontier(
  accumulator: FrontierAccumulator,
  frontier: RouteTotalityFieldFrontier,
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const existing = accumulator.emitted.get(frontier.id);
  if (existing) {
    accumulator.emitted.set(frontier.id, canonicalFrontier(existing, frontier));
    cancellation.throwIfCancelled();
    return;
  }
  if (accumulator.emitted.size < MAX_FRONTIERS) {
    accumulator.emitted.set(frontier.id, frontier);
    accumulator.omittedIds.delete(frontier.id);
    cancellation.throwIfCancelled();
    return;
  }
  let largestId: string | null = null;
  for (const emittedId of accumulator.emitted.keys()) {
    cancellation.throwIfCancelled();
    if (largestId === null || emittedId.localeCompare(largestId) > 0) largestId = emittedId;
  }
  if (largestId !== null && frontier.id.localeCompare(largestId) < 0) {
    const displaced = accumulator.emitted.get(largestId);
    accumulator.emitted.delete(largestId);
    if (displaced) accumulator.omittedIds.add(largestId);
    accumulator.emitted.set(frontier.id, frontier);
    accumulator.omittedIds.delete(frontier.id);
  } else {
    accumulator.omittedIds.add(frontier.id);
  }
  cancellation.throwIfCancelled();
}

export function addTruncatedState(
  states: Map<string, TruncatedTraversalState>,
  candidate: TruncatedTraversalState,
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const key = JSON.stringify({
    origin: candidate.origin,
    field: candidate.field.elementIds,
    currentElementId: candidate.currentElementId,
    currentOccurrenceId: candidate.currentOccurrenceId,
    gapId: candidate.gap.id,
  });
  const current = states.get(key);
  if (!current || comparePath(candidate.path, current.path) < 0) states.set(key, candidate);
  cancellation.throwIfCancelled();
}

export function proofsForStop(
  state: PathState,
  relation: EvidenceSlice["relations"][number],
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  target: EvidenceSlice["elements"][number] | undefined,
  cancellation: AnalysisCancellationToken,
): EvidenceProof[] {
  cancellation.throwIfCancelled();
  const locations: SourceLocation[] = [];
  for (const elementId of state.elementIds) {
    cancellation.throwIfCancelled();
    const location = elementsById.get(elementId)?.location;
    if (location) locations.push(location);
  }
  for (const location of relation.proof.locations) {
    cancellation.throwIfCancelled();
    locations.push(location);
  }
  if (target) locations.push(target.location);
  let targetHasPartialProof = false;
  for (const proof of target?.proof ?? []) {
    cancellation.throwIfCancelled();
    if (proof.status === "partial") {
      targetHasPartialProof = true;
      break;
    }
  }
  const partial = relation.status === "partial"
    || relation.proof.status === "partial"
    || target?.status === "partial"
    || targetHasPartialProof;
  cancellation.throwIfCancelled();
  return [{
    kind: "route-totality-field-frontier",
    detail: "The bounded field path stopped before a proven downstream identity.",
    locations: uniqueLocations(locations, cancellation),
    status: partial ? "partial" : "proven",
  }];
}

export function proofsForTruncation(
  state: PathState,
  gap: EvidenceGap,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  relationsById: ReadonlyMap<string, EvidenceSlice["relations"][number]>,
  namedRelationId: string | null,
  cancellation: AnalysisCancellationToken,
): EvidenceProof[] {
  cancellation.throwIfCancelled();
  const locations: SourceLocation[] = [];
  for (const elementId of state.elementIds) {
    cancellation.throwIfCancelled();
    const location = elementsById.get(elementId)?.location;
    if (location) locations.push(location);
  }
  if (namedRelationId) {
    const relation = relationsById.get(namedRelationId);
    if (relation) {
      for (const location of relation.proof.locations) {
        cancellation.throwIfCancelled();
        locations.push(location);
      }
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
  cancellation.throwIfCancelled();
  return [{
    kind: "route-totality-field-frontier",
    detail: "The bounded field path reached an evidence slice gap.",
    locations: uniqueLocations(locations, cancellation),
    status: "partial",
  }];
}

export function lineageCounts(
  attachments: readonly RouteTotalityFieldAttachment[],
  frontiers: readonly RouteTotalityFieldFrontier[],
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  const origins = new Set<string>();
  const fields = new Set<string>();
  const occurrences = new Set<string>();
  const terminals = new Set<string>();
  for (const attachment of attachments) {
    cancellation.throwIfCancelled();
    origins.add(`${attachment.origin.elementId}:${attachment.origin.role}`);
    fields.add(attachment.field.elementIds.join("\u0000"));
    occurrences.add(attachment.occurrenceId);
    for (const terminalId of attachment.terminalIds) {
      cancellation.throwIfCancelled();
      terminals.add(terminalId);
    }
  }
  for (const frontier of frontiers) {
    cancellation.throwIfCancelled();
    origins.add(`${frontier.origin.elementId}:${frontier.origin.role}`);
    if (frontier.field) fields.add(frontier.field.elementIds.join("\u0000"));
    if (frontier.occurrenceId) occurrences.add(frontier.occurrenceId);
  }
  cancellation.throwIfCancelled();
  return {
    origins: origins.size,
    fields: fields.size,
    occurrences: occurrences.size,
    terminals: terminals.size,
    frontiers: frontiers.length,
  };
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

export function lastLocation(
  path: PathState,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  cancellation: AnalysisCancellationToken,
): SourceLocation | null {
  cancellation.throwIfCancelled();
  const location = elementsById.get(path.currentElementId)?.location ?? null;
  cancellation.throwIfCancelled();
  return location;
}

export function uniqueLocations(
  locations: readonly SourceLocation[],
  cancellation: AnalysisCancellationToken,
): SourceLocation[] {
  cancellation.throwIfCancelled();
  const byKey = new Map<string, SourceLocation>();
  for (const location of locations) {
    cancellation.throwIfCancelled();
    byKey.set(locationKey(location), location);
  }
  const unique: SourceLocation[] = [];
  for (const location of byKey.values()) {
    cancellation.throwIfCancelled();
    unique.push(location);
  }
  return cancellableStableSort(unique, (left, right) => locationKey(left).localeCompare(locationKey(right)), cancellation);
}

export function compareOrigin(left: EvidenceSlice["origins"][number], right: EvidenceSlice["origins"][number]): number {
  return `${left.elementId}:${left.role}`.localeCompare(`${right.elementId}:${right.role}`);
}

function locationsForPath(
  path: PathState,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  relationsById: ReadonlyMap<string, EvidenceSlice["relations"][number]>,
  terminalIds: readonly string[],
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken,
): SourceLocation[] {
  cancellation.throwIfCancelled();
  const locations: SourceLocation[] = [];
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
  for (const terminalId of terminalIds) {
    cancellation.throwIfCancelled();
    let terminalLocation: SourceLocation | null = null;
    for (const terminal of surface.terminals) {
      cancellation.throwIfCancelled();
      if (terminal.id === terminalId) {
        terminalLocation = terminal.location;
        break;
      }
    }
    if (terminalLocation) locations.push(terminalLocation);
  }
  return uniqueLocations(locations, cancellation);
}

function canonicalFrontier(
  left: RouteTotalityFieldFrontier,
  right: RouteTotalityFieldFrontier,
): RouteTotalityFieldFrontier {
  const leftKey = JSON.stringify({
    location: left.location,
    proof: left.proof,
  });
  const rightKey = JSON.stringify({
    location: right.location,
    proof: right.proof,
  });
  return leftKey.localeCompare(rightKey) <= 0 ? left : right;
}

function locationKey(location: SourceLocation): string {
  return `${location.file}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}
