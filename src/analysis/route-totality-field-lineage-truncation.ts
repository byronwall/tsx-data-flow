import type { AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { EvidenceGap, EvidenceProof, SourceLocation } from "./scope-seam";
import type { RouteTotalityFieldOrigin } from "./route-totality-field-lineage";
import { addFrontier, makeFrontier, type FrontierAccumulator } from "./route-totality-field-lineage-frontier";
import {
  comparePath,
  lastLocation,
  uniqueLocations,
  type FieldState,
  type PathState,
  type TraversalState,
} from "./route-totality-field-lineage-support";

export type TruncatedTraversalState = {
  origin: RouteTotalityFieldOrigin;
  field: FieldState;
  currentElementId: string;
  currentOccurrenceId: string;
  path: PathState;
  gap: EvidenceGap;
};

export function hasRouteTotalityFieldGap<T extends { from: string | null }>(
  elementId: string,
  gapsByFrom: ReadonlyMap<string, readonly T[]>,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  for (const gap of gapsByFrom.get(elementId) ?? []) {
    cancellation.throwIfCancelled();
    if (gap.from === elementId) return true;
  }
  cancellation.throwIfCancelled();
  return false;
}

export function canonicalRouteTotalityFieldGap<T extends { from: string | null; id: string }>(
  elementId: string,
  gapsByFrom: ReadonlyMap<string, readonly T[]>,
  cancellation: AnalysisCancellationToken,
): T | null {
  cancellation.throwIfCancelled();
  const matches = (gapsByFrom.get(elementId) ?? []).filter((gap) => gap.from === elementId);
  const sorted = cancellableStableSort(matches, (left, right) => left.id.localeCompare(right.id), cancellation);
  cancellation.throwIfCancelled();
  return sorted[0] ?? null;
}

export function recordRouteTotalityFieldTruncations(
  state: TraversalState,
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
  truncations: Map<string, TruncatedTraversalState>,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  if (!state.field || !hasRouteTotalityFieldGap(state.currentElementId, gapsByFrom, cancellation)) return false;
  if (!state.currentOccurrenceId) return true;
  for (const gap of gapsByFrom.get(state.currentElementId) ?? []) {
    cancellation.throwIfCancelled();
    if (gap.from !== state.currentElementId) continue;
    addTruncatedState(truncations, {
      origin: state.origin,
      field: state.field,
      currentElementId: state.currentElementId,
      currentOccurrenceId: state.currentOccurrenceId,
      path: state,
      gap,
    }, cancellation);
  }
  cancellation.throwIfCancelled();
  return true;
}

export function emitRouteTotalityFieldTruncationFrontiers(
  truncations: ReadonlyMap<string, TruncatedTraversalState>,
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  relationsById: ReadonlyMap<string, EvidenceSlice["relations"][number]>,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  frontiers: FrontierAccumulator,
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const states: TruncatedTraversalState[] = [];
  for (const state of truncations.values()) {
    cancellation.throwIfCancelled();
    states.push(state);
  }
  const sorted = cancellableStableSort(states, (left, right) => truncationKey(left).localeCompare(truncationKey(right)), cancellation);
  for (const state of sorted) {
    cancellation.throwIfCancelled();
    const relationId = namedGapRelation(state.gap, relationsByFrom, cancellation);
    const location = state.gap.location ?? lastLocation(state.path, elementsById, cancellation);
    addFrontier(frontiers, makeFrontier(
      state.origin,
      state.field,
      state.currentOccurrenceId,
      "evidence-truncated",
      state.currentElementId,
      relationId,
      location,
      proofsForTruncation(state.path, state.gap, elementsById, relationsById, relationId, cancellation),
      state.path,
      state.gap.id,
      cancellation,
    ), cancellation);
  }
  cancellation.throwIfCancelled();
}

function addTruncatedState(
  states: Map<string, TruncatedTraversalState>,
  candidate: TruncatedTraversalState,
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const key = truncationKey(candidate);
  const current = states.get(key);
  if (!current
    || candidate.gap.id.localeCompare(current.gap.id) < 0
    || (candidate.gap.id === current.gap.id && comparePath(candidate.path, current.path) < 0)) {
    states.set(key, candidate);
  }
  cancellation.throwIfCancelled();
}

function proofsForTruncation(
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

function namedGapRelation(
  gap: EvidenceSlice["gaps"][number],
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  cancellation: AnalysisCancellationToken,
): string | null {
  cancellation.throwIfCancelled();
  if (!gap.from || !gap.to) return null;
  const matches: EvidenceSlice["relations"][number][] = [];
  for (const relation of relationsByFrom.get(gap.from) ?? []) {
    cancellation.throwIfCancelled();
    if (relation.to === gap.to) matches.push(relation);
  }
  cancellation.throwIfCancelled();
  return matches.length === 1 ? matches[0].id : null;
}

function truncationKey(state: TruncatedTraversalState): string {
  return JSON.stringify({
    origin: state.origin,
    field: state.field.elementIds,
    currentElementId: state.currentElementId,
    currentOccurrenceId: state.currentOccurrenceId,
    reason: "evidence-truncated",
  });
}
