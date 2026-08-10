import type { AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import { projectAttachment, type AttachmentAccumulator } from "./route-totality-field-lineage-attachment";
import { lineageCounts } from "./route-totality-field-lineage-counts";
import type { FrontierAccumulator } from "./route-totality-field-lineage-frontier";
import { hasRouteTotalityFieldLineageTruncation } from "./route-totality-field-lineage-index";
import type {
  RouteTotalityFieldFrontier,
  RouteTotalityFieldLineage,
} from "./route-totality-field-lineage";

export function projectRouteTotalityFieldLineageResult(
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
  attachments: ReadonlyMap<string, AttachmentAccumulator>,
  frontiers: FrontierAccumulator,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  relationsById: ReadonlyMap<string, EvidenceSlice["relations"][number]>,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage {
  cancellation.throwIfCancelled();
  const projectedAttachments = [] as RouteTotalityFieldLineage["attachments"];
  for (const attachment of attachments.values()) {
    cancellation.throwIfCancelled();
    projectedAttachments.push(projectAttachment(attachment, elementsById, relationsById, surface, cancellation));
  }
  const sortedAttachments = cancellableStableSort(
    projectedAttachments,
    (left, right) => left.id.localeCompare(right.id),
    cancellation,
  );
  const projectedFrontiers: RouteTotalityFieldFrontier[] = [];
  for (const frontier of frontiers.emitted.values()) {
    cancellation.throwIfCancelled();
    projectedFrontiers.push(frontier);
  }
  const sortedFrontiers = cancellableStableSort(
    projectedFrontiers,
    (left, right) => left.id.localeCompare(right.id),
    cancellation,
  );
  const omissions = lineageOmissions(slice, surface, sortedFrontiers, frontiers, cancellation);
  const partialInputs = hasPartialInputs(slice, surface, cancellation);
  const status = sortedFrontiers.length > 0 || partialInputs || frontiers.omittedIds.size > 0
    ? "partial"
    : "complete";
  cancellation.throwIfCancelled();
  return {
    status,
    unavailableReason: null,
    attachments: sortedAttachments,
    frontiers: sortedFrontiers,
    counts: lineageCounts(sortedAttachments, sortedFrontiers, cancellation, 0),
    omissions,
    transformations: [],
  };
}

function lineageOmissions(
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
  frontiers: readonly RouteTotalityFieldFrontier[],
  accumulator: FrontierAccumulator,
  cancellation: AnalysisCancellationToken,
): string[] {
  cancellation.throwIfCancelled();
  const omissions = new Set<string>();
  if (frontiers.length > 0) omissions.add("Field continuity stopped at one or more bounded frontiers.");
  if (!slice.coverage.complete) omissions.add("The shared evidence slice is partial.");
  if (slice.coverage.budgetExhausted || hasRouteTotalityFieldLineageTruncation(slice.coverage.truncation, cancellation)) {
    omissions.add("The shared evidence slice is bounded or truncated.");
  }
  if (surface.status !== "complete") omissions.add("The occurrence surface is partial.");
  if (accumulator.omittedIds.size > 0) {
    omissions.add(
      `Field frontier limit reached; ${accumulator.omittedIds.size} additional frontiers were omitted. The emitted frontier count is a lower bound.`,
    );
  }
  const values: string[] = [];
  for (const omission of omissions) {
    cancellation.throwIfCancelled();
    values.push(omission);
  }
  return cancellableStableSort(values, (left, right) => left.localeCompare(right), cancellation);
}

function hasPartialInputs(
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  const partial = surface.status !== "complete"
    || !slice.coverage.complete
    || slice.coverage.budgetExhausted
    || hasRouteTotalityFieldLineageTruncation(slice.coverage.truncation, cancellation);
  cancellation.throwIfCancelled();
  return partial;
}
