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
  kind: "property" | "string-index" | "numeric-index" | "collection-element";
  value: string;
};

export type RouteTotalityFieldConsumer = {
  id: string;
  elementId: string;
  occurrenceElementId: string;
  kind: "render" | "condition" | "handler";
  label: string;
  occurrenceId: string;
  routeTerminalId: string | null;
  fieldLineageTerminalElementId: string;
  fieldLineageTerminalRelationId: string;
  target: RouteTotalityFieldTargetConsumer;
  location: SourceLocation;
};

export type RouteTotalityFieldTargetConsumer = {
  targetKey: string;
  consumerKind: "render" | "condition" | "handler";
  consumerFieldElementId: string;
  consumerValueElementId: string;
  bindingElementId: string;
  ownerDefinitionElementId: string;
  consumerOwnerElementId: string;
  jsx: {
    tagName: string;
    tagSymbol: string;
    tagModule: string;
    propName: string | null;
    identity: "intrinsic" | "component";
  } | null;
  handler: {
    receiverName: string;
    receiverSymbol: string;
    methodSymbol: string;
    calleeSymbol: string;
    actionName: string;
    actionArgumentSymbol: string;
    payloadObject: string;
    argumentField: string;
    forwardedParameterSymbol: string | null;
  } | null;
  condition: {
    operator: string | null;
    literal: string | null;
    nestedShow: boolean | null;
    collectionName: string | null;
  } | null;
};

export type RouteTotalityFieldTransformation = {
  id: string;
  kind: string;
  fromElementIds: string[];
  toElementIds: string[];
  evidenceRelationIds: string[];
  supportingElementIds: string[];
  supportingRelationIds: string[];
  targetConsumer: RouteTotalityFieldTargetConsumer | null;
  locations: SourceLocation[];
  proof: EvidenceProof[];
  status: "proven" | "partial" | "unsupported";
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
  selectedEvidenceId: string | null;
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
  consumer: RouteTotalityFieldConsumer | null;
  alias: string | null;
  transformationIds: string[];
  transformationKinds: string[];
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
  missingTransformationKind: string | null;
  transformationIds: string[];
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
    transformations: number;
  };
  omissions: string[];
  transformations: RouteTotalityFieldTransformation[];
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
    counts: { origins: 0, fields: 0, occurrences: 0, terminals: 0, frontiers: 0, transformations: 0 },
    omissions: [reason],
    transformations: [],
  };
}
