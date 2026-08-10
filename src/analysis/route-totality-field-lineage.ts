import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import { buildRouteTotalityAnchorIndex } from "./route-totality-anchor-index";
import { type AttachmentAccumulator } from "./route-totality-field-lineage-attachment";
import { type FrontierAccumulator } from "./route-totality-field-lineage-frontier";
import {
  buildRouteTotalityFieldLineageIndexes,
  routeTotalityFieldRootOccurrenceId,
} from "./route-totality-field-lineage-index";
import { projectRouteTotalityFieldLineageResult } from "./route-totality-field-lineage-result";
import { compareOrigin } from "./route-totality-field-lineage-support";
import {
  emitRouteTotalityFieldTruncationFrontiers,
  type TruncatedTraversalState,
} from "./route-totality-field-lineage-truncation";
import {
  isProvenOrigin,
  traverseRouteTotalityFieldOrigin,
} from "./route-totality-field-lineage-traversal";
import type { FieldLineageStopReason } from "./route-totality-field-lineage-transition";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import type { EvidenceProof, OriginRole, SourceLocation } from "./scope-seam";

export type RouteTotalityFieldSegment = {
  kind: "property" | "string-index" | "numeric-index";
  value: string;
};

export type RouteTotalityField = {
  elementIds: string[];
  segments: RouteTotalityFieldSegment[];
  label: string;
  location: SourceLocation;
};

export type RouteTotalityFieldOrigin = {
  elementId: string;
  role: OriginRole;
};

export type RouteTotalityFieldAttachment = {
  id: string;
  origin: RouteTotalityFieldOrigin;
  field: RouteTotalityField;
  occurrenceId: string;
  terminalIds: [string];
  evidencePathElementIds: string[];
  evidencePathRelationIds: string[];
  proof: EvidenceProof[];
  locations: SourceLocation[];
};

export type RouteTotalityFieldFrontierReason = FieldLineageStopReason
  | "identity-lost"
  | "renamed-prop"
  | "evidence-truncated";

export type RouteTotalityFieldFrontier = {
  id: string;
  origin: RouteTotalityFieldOrigin;
  field: Omit<RouteTotalityField, "location"> | null;
  occurrenceId: string | null;
  reason: RouteTotalityFieldFrontierReason;
  gapId: string | null;
  stoppedAtElementId: string | null;
  stoppedAtRelationId: string | null;
  evidencePathElementIds: string[];
  evidencePathRelationIds: string[];
  location: SourceLocation | null;
  proof: EvidenceProof[];
};

export type RouteTotalityFieldLineage = {
  status: "complete" | "partial" | "unavailable";
  unavailableReason: string | null;
  attachments: RouteTotalityFieldAttachment[];
  frontiers: RouteTotalityFieldFrontier[];
  counts: {
    origins: number;
    fields: number;
    occurrences: number;
    terminals: number;
    frontiers: number;
  };
  omissions: string[];
};

/** Build the bounded, exact named-field projection for one route. */
export function buildRouteTotalityFieldLineage(
  provider: EvidenceRelationProvider,
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteTotalityFieldLineage {
  cancellation.throwIfCancelled();
  const indexes = buildRouteTotalityFieldLineageIndexes(slice, cancellation);
  const { elementsById, relationsById, relationsByFrom, relationsByTo, gapsByFrom } = indexes;
  const anchors = buildRouteTotalityAnchorIndex(slice, surface, cancellation);
  const rootOccurrenceId = routeTotalityFieldRootOccurrenceId(anchors, surface, elementsById, cancellation);
  const attachments = new Map<string, AttachmentAccumulator>();
  const frontiers: FrontierAccumulator = { emitted: new Map(), omittedIds: new Set() };
  const carrierGaps: string[] = [];
  const truncations = new Map<string, TruncatedTraversalState>();
  const origins = cancellableStableSort(slice.origins, compareOrigin, cancellation);

  for (const originRecord of origins) {
    cancellation.throwIfCancelled();
    const originElement = elementsById.get(originRecord.elementId);
    const rawOrigin = provider.facts.getElement(originRecord.elementId);
    if (!isProvenOrigin(originRecord, originElement, rawOrigin, cancellation)) continue;
    traverseRouteTotalityFieldOrigin({
      provider,
      origin: originRecord,
      rootOccurrenceId,
      elementsById,
      relationsByFrom,
      relationsByTo,
      gapsByFrom,
      anchors,
      surface,
      attachments,
      frontiers,
      carrierGaps,
      truncations,
      cancellation,
    });
  }

  emitRouteTotalityFieldTruncationFrontiers(
    truncations,
    relationsByFrom,
    relationsById,
    elementsById,
    frontiers,
    cancellation,
  );
  const result = projectRouteTotalityFieldLineageResult(
    slice,
    surface,
    attachments,
    frontiers,
    elementsById,
    relationsById,
    cancellation,
  );
  const omissions = [...result.omissions, ...new Set(carrierGaps)];
  return omissions.length === result.omissions.length
    ? result
    : { ...result, status: "partial", omissions };
}

export function unavailableRouteTotalityFieldLineage(reason: string): RouteTotalityFieldLineage {
  return {
    status: "unavailable",
    unavailableReason: reason,
    attachments: [],
    frontiers: [],
    counts: { origins: 0, fields: 0, occurrences: 0, terminals: 0, frontiers: 0 },
    omissions: [reason],
  };
}
