import type { AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";



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
