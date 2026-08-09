import type { AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { RouteTotalityAnchorIndex } from "./route-totality-anchor-index";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import { isFullyProvenElement } from "./route-totality-field-lineage-transition";

export type RouteTotalityFieldLineageIndexes = {
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>;
  relationsById: ReadonlyMap<string, EvidenceSlice["relations"][number]>;
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>;
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>;
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>;
  gapsById: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>;
};

export function buildRouteTotalityFieldLineageIndexes(
  slice: EvidenceSlice,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineageIndexes {
  cancellation.throwIfCancelled();
  const elementsById = new Map<string, EvidenceSlice["elements"][number]>();
  const relationsById = new Map<string, EvidenceSlice["relations"][number]>();
  for (const element of slice.elements) {
    cancellation.throwIfCancelled();
    elementsById.set(element.id, element);
  }
  for (const relation of slice.relations) {
    cancellation.throwIfCancelled();
    relationsById.set(relation.id, relation);
  }
  const relationsByFrom = relationIndex(slice, "from", cancellation);
  const relationsByTo = relationIndex(slice, "to", cancellation);
  const gapsByFrom = gapIndex(slice, cancellation);
  const gapsById = gapIdIndex(slice, cancellation);
  cancellation.throwIfCancelled();
  return { elementsById, relationsById, relationsByFrom, relationsByTo, gapsByFrom, gapsById };
}

export function routeTotalityFieldRootOccurrenceId(
  anchors: RouteTotalityAnchorIndex,
  surface: RouteOccurrenceSurface,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  cancellation: AnalysisCancellationToken,
): string | null {
  cancellation.throwIfCancelled();
  const roots: RouteOccurrenceSurface["occurrences"][number][] = [];
  for (const occurrence of surface.occurrences) {
    cancellation.throwIfCancelled();
    if (occurrence.parentOccurrenceId === null && occurrence.scopeSeed === surface.scope.seed) roots.push(occurrence);
  }
  if (roots.length !== 1) return null;
  const root = roots[0];
  const endpointAnchors: typeof anchors.occurrenceAnchors = [];
  for (const anchor of anchors.occurrenceAnchors) {
    cancellation.throwIfCancelled();
    if (anchor.endpoint.id === root.id) endpointAnchors.push(anchor);
  }
  if (endpointAnchors.length !== 1 || anchors.occurrenceIssuesByEndpointId.has(root.id)) return null;
  const anchor = endpointAnchors[0];
  const reverse = anchors.occurrenceAnchorsByEvidenceElementId.get(anchor.evidenceElementId) ?? [];
  if (anchor.evidenceElementId !== surface.scope.seed || reverse.length !== 1) return null;
  cancellation.throwIfCancelled();
  return isFullyProvenElement(elementsById.get(anchor.evidenceElementId), cancellation) ? root.id : null;
}

export function hasRouteTotalityFieldLineageTruncation(
  truncation: Record<string, boolean>,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  for (const value of Object.values(truncation)) {
    cancellation.throwIfCancelled();
    if (value) return true;
  }
  cancellation.throwIfCancelled();
  return false;
}

export function hasRouteTotalityFieldLineageId(
  values: readonly string[],
  id: string,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  for (const value of values) {
    cancellation.throwIfCancelled();
    if (value === id) return true;
  }
  cancellation.throwIfCancelled();
  return false;
}

function relationIndex(
  slice: EvidenceSlice,
  endpoint: "from" | "to",
  cancellation: AnalysisCancellationToken,
): ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]> {
  cancellation.throwIfCancelled();
  const indexed = new Map<string, EvidenceSlice["relations"]>();
  const sorted = cancellableStableSort(slice.relations, (left, right) => left.id.localeCompare(right.id), cancellation);
  for (const relation of sorted) {
    cancellation.throwIfCancelled();
    const key = relation[endpoint];
    const current = indexed.get(key) ?? [];
    current.push(relation);
    indexed.set(key, current);
  }
  cancellation.throwIfCancelled();
  return indexed;
}

function gapIndex(
  slice: EvidenceSlice,
  cancellation: AnalysisCancellationToken,
): ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]> {
  cancellation.throwIfCancelled();
  const indexed = new Map<string, EvidenceSlice["gaps"]>();
  const sorted = cancellableStableSort(slice.gaps, (left, right) => left.id.localeCompare(right.id), cancellation);
  for (const gap of sorted) {
    cancellation.throwIfCancelled();
    if (!gap.from) continue;
    const current = indexed.get(gap.from) ?? [];
    current.push(gap);
    indexed.set(gap.from, current);
  }
  cancellation.throwIfCancelled();
  return indexed;
}

function gapIdIndex(
  slice: EvidenceSlice,
  cancellation: AnalysisCancellationToken,
): ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]> {
  cancellation.throwIfCancelled();
  const indexed = new Map<string, EvidenceSlice["gaps"]>();
  const sorted = cancellableStableSort(slice.gaps, (left, right) => left.id.localeCompare(right.id), cancellation);
  for (const gap of sorted) {
    cancellation.throwIfCancelled();
    const current = indexed.get(gap.id) ?? [];
    current.push(gap);
    indexed.set(gap.id, current);
  }
  cancellation.throwIfCancelled();
  return indexed;
}
