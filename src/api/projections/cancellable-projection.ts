import type { AnalysisCancellationToken } from "../../analysis/cancellation";

export function projectItems<Input, Output>(
  items: readonly Input[],
  project: (item: Input, cancellation: AnalysisCancellationToken) => Output,
  cancellation: AnalysisCancellationToken,
): Output[] {
  const output: Output[] = [];
  for (const item of items) {
    cancellation.throwIfCancelled();
    output.push(project(item, cancellation));
  }
  cancellation.throwIfCancelled();
  return output;
}

export function sortedProject<Input, Output>(
  items: readonly Input[],
  compare: (left: Input, right: Input) => number,
  project: (item: Input, cancellation: AnalysisCancellationToken) => Output,
  cancellation: AnalysisCancellationToken,
): Output[] {
  cancellation.throwIfCancelled();
  const sorted = [...items].sort((left, right) => {
    cancellation.throwIfCancelled();
    return compare(left, right);
  });
  cancellation.throwIfCancelled();
  return projectItems(sorted, project, cancellation);
}

export function countItems<Input>(
  items: readonly Input[],
  include: (item: Input) => boolean,
  cancellation: AnalysisCancellationToken,
): number {
  let total = 0;
  for (const item of items) {
    cancellation.throwIfCancelled();
    if (include(item)) total += 1;
  }
  return total;
}

export function sumItems<Input>(
  items: readonly Input[],
  value: (item: Input) => number,
  cancellation: AnalysisCancellationToken,
): number {
  let total = 0;
  for (const item of items) {
    cancellation.throwIfCancelled();
    total += value(item);
  }
  return total;
}
