import type { AnalysisCancellationToken } from "./cancellation";

/** Sort deterministically while allowing every comparison to observe cancellation. */
export function cancellableStableSort<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
  cancellation: AnalysisCancellationToken,
): T[] {
  cancellation.throwIfCancelled();
  const indexed: Array<{ value: T; index: number }> = [];
  for (let index = 0; index < values.length; index += 1) {
    cancellation.throwIfCancelled();
    indexed.push({ value: values[index], index });
  }
  cancellation.throwIfCancelled();
  indexed.sort((left, right) => {
    cancellation.throwIfCancelled();
    return compare(left.value, right.value) || left.index - right.index;
  });
  cancellation.throwIfCancelled();
  const sorted: T[] = [];
  for (const item of indexed) {
    cancellation.throwIfCancelled();
    sorted.push(item.value);
  }
  cancellation.throwIfCancelled();
  return sorted;
}
