import type { AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { EvidenceProof, SourceLocation } from "./scope-seam";
import type {
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

export function appendField(
  previous: FieldState,
  next: FieldState,
  consecutive: boolean,
  cancellation: AnalysisCancellationToken,
): FieldState | null {
  cancellation.throwIfCancelled();
  if (!consecutive) return null;
  const elementIds = copyIds(previous.elementIds, next.elementIds, cancellation);
  const segments: RouteTotalityFieldSegment[] = [];
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
  const elementIds = copyIds(state.elementIds, [target.id], cancellation);
  const relationIds = copyIds(state.relationIds, [relation.id], cancellation);
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

function copyIds(
  left: readonly string[],
  right: readonly string[],
  cancellation: AnalysisCancellationToken,
): string[] {
  cancellation.throwIfCancelled();
  const copied: string[] = [];
  for (const value of left) {
    cancellation.throwIfCancelled();
    copied.push(value);
  }
  for (const value of right) {
    cancellation.throwIfCancelled();
    copied.push(value);
  }
  cancellation.throwIfCancelled();
  return copied;
}

function locationKey(location: SourceLocation): string {
  return `${location.file}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}
