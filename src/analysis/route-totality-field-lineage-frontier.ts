import type { AnalysisCancellationToken } from "./cancellation";
import { stableHash } from "./scope-seam";
import type {
  RouteTotalityFieldFrontier,
  RouteTotalityFieldFrontierReason,
  RouteTotalityFieldOrigin,
} from "./route-totality-field-lineage";
import type { EvidenceProof, SourceLocation } from "./scope-seam";
import type { FieldState, PathState } from "./route-totality-field-lineage-support";

export type FrontierAccumulator = {
  emitted: Map<string, RouteTotalityFieldFrontier>;
  omittedIds: Set<string>;
};

export const MAX_FRONTIERS = 256;

export function makeFrontier(
  origin: RouteTotalityFieldOrigin,
  field: FieldState | null,
  occurrenceId: string | null,
  reason: RouteTotalityFieldFrontierReason,
  stoppedAtElementId: string | null,
  stoppedAtRelationId: string | null,
  location: SourceLocation | null,
  proof: EvidenceProof[],
  path: PathState | null,
  gapId: string | null,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldFrontier {
  cancellation.throwIfCancelled();
  const elementIds: string[] = [];
  const segments: Array<{ kind: "property" | "string-index" | "numeric-index"; value: string }> = [];
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
  const evidencePathElementIds = copyPathIds(path?.elementIds ?? [], cancellation);
  const evidencePathRelationIds = copyPathIds(path?.relationIds ?? [], cancellation);
  cancellation.throwIfCancelled();
  return {
    id: `route-totality-field-frontier:${stableHash(JSON.stringify({
      origin,
      field: field?.elementIds ?? [],
      occurrenceId,
      reason,
      stoppedAtElementId,
      stoppedAtRelationId: reason === "evidence-truncated" ? null : stoppedAtRelationId,
    }))}`,
    origin: { ...origin },
    field: field ? { elementIds, segments, label: field.label } : null,
    occurrenceId,
    reason,
    gapId,
    stoppedAtElementId,
    stoppedAtRelationId,
    evidencePathElementIds,
    evidencePathRelationIds,
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
    accumulator.emitted.set(frontier.id, canonicalFrontier(existing, frontier, cancellation));
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

function copyPathIds(values: readonly string[], cancellation: AnalysisCancellationToken): string[] {
  cancellation.throwIfCancelled();
  const copied: string[] = [];
  for (const value of values) {
    cancellation.throwIfCancelled();
    copied.push(value);
  }
  cancellation.throwIfCancelled();
  return copied;
}

function canonicalFrontier(
  left: RouteTotalityFieldFrontier,
  right: RouteTotalityFieldFrontier,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldFrontier {
  cancellation.throwIfCancelled();
  if (left.reason === "evidence-truncated" && right.reason === "evidence-truncated") {
    const byGap = (left.gapId ?? "\uffff").localeCompare(right.gapId ?? "\uffff");
    if (byGap !== 0) return byGap < 0 ? left : right;
  }
  const leftKey = JSON.stringify({
    evidencePathElementIds: left.evidencePathElementIds,
    evidencePathRelationIds: left.evidencePathRelationIds,
    location: left.location,
    proof: left.proof,
  });
  const rightKey = JSON.stringify({
    evidencePathElementIds: right.evidencePathElementIds,
    evidencePathRelationIds: right.evidencePathRelationIds,
    location: right.location,
    proof: right.proof,
  });
  cancellation.throwIfCancelled();
  return leftKey.localeCompare(rightKey) <= 0 ? left : right;
}
