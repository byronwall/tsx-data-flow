import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import type { ProgramElement } from "./program-evidence";
import { buildRouteTotalityAnchorIndex, type RouteTotalityAnchorIndex } from "./route-totality-anchor-index";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import {
  buildRouteTotalityFieldLineageIndexes,
  hasRouteTotalityFieldLineageId,
  hasRouteTotalityFieldLineageTruncation,
  routeTotalityFieldRootOccurrenceId,
} from "./route-totality-field-lineage-index";
import { classifyRouteTotalityFieldTransition, isFullyProvenElement, isFullyProvenProof, type FieldLineageStopReason } from "./route-totality-field-lineage-transition";
import type {
  EvidenceProof,
  OriginRole,
  SourceLocation,
} from "./scope-seam";
import {
  addAttachment,
  addFrontier,
  addTruncatedState,
  appendField,
  compareOrigin,
  comparePath,
  compareTraversal,
  lastLocation,
  lineageCounts,
  makeFrontier,
  nextState,
  projectAttachment,
  proofsForStop,
  proofsForTruncation,
  traversalKey,
  type AttachmentAccumulator,
  type FieldState,
  type FrontierAccumulator,
  type PathState,
  type TraversalState,
  type TruncatedTraversalState,
} from "./route-totality-field-lineage-support";

export type RouteTotalityFieldSegment = {
  kind: "property" | "string-index" | "number-index";
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
  terminalIds: string[];
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
  stoppedAtElementId: string | null;
  stoppedAtRelationId: string | null;
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
  const frontiers: FrontierAccumulator = {
    emitted: new Map<string, RouteTotalityFieldFrontier>(),
    omittedIds: new Set<string>(),
  };
  const truncations = new Map<string, TruncatedTraversalState>();
  const origins = cancellableStableSort(slice.origins, compareOrigin, cancellation);

  for (const originRecord of origins) {
    cancellation.throwIfCancelled();
    const originElement = elementsById.get(originRecord.elementId);
    const rawOrigin = provider.facts.getElement(originRecord.elementId);
    if (!isProvenOrigin(originRecord, originElement, rawOrigin, cancellation)) continue;
    traverseOrigin(
      provider,
      originRecord,
      rootOccurrenceId,
      elementsById,
      relationsById,
      relationsByFrom,
      relationsByTo,
      gapsByFrom,
      anchors,
      attachments,
      frontiers,
      truncations,
      cancellation,
    );
  }

  emitTruncatedFrontiers(
    truncations,
    relationsByFrom,
    relationsById,
    elementsById,
    frontiers,
    cancellation,
  );

  const projectedAttachments: RouteTotalityFieldAttachment[] = [];
  for (const attachment of attachments.values()) {
    cancellation.throwIfCancelled();
    projectedAttachments.push(projectAttachment(
      attachment,
      elementsById,
      relationsById,
      surface,
      cancellation,
    ));
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
    counts: lineageCounts(sortedAttachments, sortedFrontiers, cancellation),
    omissions,
  };
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

function traverseOrigin(
  provider: EvidenceRelationProvider,
  origin: EvidenceSlice["origins"][number],
  rootOccurrenceId: string | null,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  relationsById: ReadonlyMap<string, EvidenceSlice["relations"][number]>,
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
  anchors: RouteTotalityAnchorIndex,
  attachments: Map<string, AttachmentAccumulator>,
  frontiers: FrontierAccumulator,
  truncations: Map<string, TruncatedTraversalState>,
  cancellation: AnalysisCancellationToken,
): void {
  const originIdentity = { elementId: origin.elementId, role: origin.role };
  const queue: TraversalState[] = [{
    origin: originIdentity,
    currentElementId: origin.elementId,
    currentOccurrenceId: rootOccurrenceId,
    field: null,
    elementIds: [origin.elementId],
    relationIds: [],
    partial: false,
  }];
  const best = new Map<string, PathState>();

  while (queue.length > 0) {
    cancellation.throwIfCancelled();
    const sortedQueue = cancellableStableSort(queue, compareTraversal, cancellation);
    queue.length = 0;
    for (const state of sortedQueue) {
      cancellation.throwIfCancelled();
      queue.push(state);
    }
    const state = queue.shift();
    if (!state) continue;
    const stateKey = traversalKey(state);
    const previous = best.get(stateKey);
    if (previous && comparePath(previous, state) <= 0) continue;
    best.set(stateKey, state);
    recordGapsForState(state, gapsByFrom, truncations, cancellation);
    const outgoing = relationsByFrom.get(state.currentElementId) ?? [];

    for (const relation of outgoing) {
      cancellation.throwIfCancelled();
      const source = elementsById.get(relation.from);
      const target = elementsById.get(relation.to);
      const rawTarget = target ? provider.facts.getElement(target.id) : undefined;
      const namedField = target ? namedPropertyField(rawTarget, target, cancellation) : null;
      const occurrenceAnchors = target
        ? anchors.occurrenceAnchorsByEvidenceElementId.get(target.id) ?? []
        : [];
      const terminalAnchors = target
        ? anchors.terminalAnchorsByEvidenceElementId.get(target.id) ?? []
        : [];
      const terminal = terminalAnchors.length === 1 ? terminalAnchors[0].endpoint : undefined;
      const transition = classifyRouteTotalityFieldTransition({
        relation,
        source,
        target,
        outgoingRelations: outgoing,
        incomingRelations: target ? relationsByTo.get(target.id) ?? [] : [],
        hasField: state.field !== null,
        isInitialOrigin: state.currentElementId === origin.elementId && state.elementIds.length === 1,
        staticNamedField: target ? rawTarget ? namedField !== null : null : null,
        occurrenceAnchorCount: occurrenceAnchors.length,
        terminalAnchorCount: terminalAnchors.length,
        currentOccurrenceId: state.currentOccurrenceId,
        terminalOwnerOccurrenceId: terminal?.ownerOccurrenceId,
        cancellation,
      });
      if (transition.kind === "stop") {
        addStopFrontier(
          state,
          relation,
          target,
          transition.reason,
          elementsById,
          frontiers,
          cancellation,
        );
        continue;
      }
      if (!target) continue;
      if (hasRouteTotalityFieldLineageId(state.elementIds, target.id, cancellation)) {
        addStopFrontier(
          state,
          relation,
          target,
          "identity-lost",
          elementsById,
          frontiers,
          cancellation,
        );
        continue;
      }

      if (transition.kind === "preserve") {
        const next = nextState(
          state,
          target,
          relation,
          state.field,
          state.currentOccurrenceId,
          cancellation,
        );
        recordGapsForState(next, gapsByFrom, truncations, cancellation);
        queue.push(next);
        continue;
      }

      if (transition.kind === "field-input") {
        if (!namedField) {
          addStopFrontier(
            state,
            relation,
            target,
            "partial-proof",
            elementsById,
            frontiers,
            cancellation,
          );
          continue;
        }
        const nextField = state.field
          ? appendField(
            state.field,
            namedField,
            relation.from === state.field.elementIds[state.field.elementIds.length - 1],
            cancellation,
          )
          : namedField;
        if (!nextField) {
          addStopFrontier(
            state,
            relation,
            target,
            "identity-lost",
            elementsById,
            frontiers,
            cancellation,
          );
          continue;
        }
        const next = nextState(
          state,
          target,
          relation,
          nextField,
          state.currentOccurrenceId,
          cancellation,
        );
        recordGapsForState(next, gapsByFrom, truncations, cancellation);
        queue.push(next);
        continue;
      }

      if (transition.kind === "component-prop") {
        const occurrence = occurrenceAnchors[0]?.endpoint;
        if (!state.field || !occurrence) continue;
        const next = nextState(state, target, relation, state.field, occurrence.id, cancellation);
        recordGapsForState(next, gapsByFrom, truncations, cancellation);
        addAttachment(attachments, originIdentity, state.field, occurrence.id, next, cancellation);
        continue;
      }

      if (transition.kind === "render-terminal") {
        const terminalEndpoint = terminalAnchors[0]?.endpoint;
        if (!state.field || !state.currentOccurrenceId || !terminalEndpoint) continue;
        const next = nextState(
          state,
          target,
          relation,
          state.field,
          state.currentOccurrenceId,
          cancellation,
        );
        recordGapsForState(next, gapsByFrom, truncations, cancellation);
        addAttachment(
          attachments,
          originIdentity,
          state.field,
          state.currentOccurrenceId,
          next,
          cancellation,
          terminalEndpoint.id,
        );
      }
    }
  }
}

function addStopFrontier(
  state: TraversalState,
  relation: EvidenceSlice["relations"][number],
  target: EvidenceSlice["elements"][number] | undefined,
  reason: RouteTotalityFieldFrontierReason,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  frontiers: FrontierAccumulator,
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (!state.field) return;
  addFrontier(frontiers, makeFrontier(
    state.origin,
    state.field,
    state.currentOccurrenceId,
    reason,
    target?.id ?? null,
    relation.id,
    target?.location ?? relation.proof.locations[0] ?? lastLocation(state, elementsById, cancellation),
    proofsForStop(state, relation, elementsById, target, cancellation),
    cancellation,
  ), cancellation);
}

function recordGapsForState(
  state: TraversalState,
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
  truncations: Map<string, TruncatedTraversalState>,
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (!state.field) return;
  for (const gap of gapsByFrom.get(state.currentElementId) ?? []) {
    cancellation.throwIfCancelled();
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
}

function emitTruncatedFrontiers(
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
      proofsForTruncation(
        state.path,
        state.gap,
        elementsById,
        relationsById,
        relationId,
        cancellation,
      ),
      cancellation,
      state.gap.id,
    ), cancellation);
  }
  cancellation.throwIfCancelled();
}

function namedGapRelation(
  gap: EvidenceSlice["gaps"][number],
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  cancellation: AnalysisCancellationToken,
): string | null {
  cancellation.throwIfCancelled();
  if (!gap.from || !gap.to) return null;
  const matching: EvidenceSlice["relations"][number][] = [];
  for (const relation of relationsByFrom.get(gap.from) ?? []) {
    cancellation.throwIfCancelled();
    if (relation.to === gap.to) matching.push(relation);
  }
  cancellation.throwIfCancelled();
  return matching.length === 1 ? matching[0].id : null;
}

function namedPropertyField(
  raw: ProgramElement | undefined,
  element: EvidenceSlice["elements"][number],
  cancellation: AnalysisCancellationToken,
): FieldState | null {
  cancellation.throwIfCancelled();
  if (!raw
    || raw.kind !== "field-read"
    || raw.operationKind !== "field-read"
    || raw.confidence !== "proven"
    || raw.proof.locations.length === 0
    || !isFullyProvenElement(element, cancellation)
    || element.kind !== "field-read"
    || element.operationKind !== "field-read") {
    return null;
  }
  const property = raw.attributes.property;
  if (typeof property !== "string" || property.length === 0 || element.fieldName !== property) return null;
  cancellation.throwIfCancelled();
  return {
    elementIds: [element.id],
    segments: [{ kind: "property", value: property }],
    label: property,
    location: element.location,
  };
}

function isProvenOrigin(
  origin: EvidenceSlice["origins"][number],
  element: EvidenceSlice["elements"][number] | undefined,
  raw: ProgramElement | undefined,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  if (origin.status !== "proven" || origin.proof.length === 0 || !isFullyProvenElement(element, cancellation)) return false;
  for (const proof of origin.proof) {
    cancellation.throwIfCancelled();
    if (!isFullyProvenProof(proof)) return false;
  }
  cancellation.throwIfCancelled();
  return Boolean(element && hasRouteTotalityFieldLineageId(element.originRoles, origin.role, cancellation))
    && raw?.confidence === "proven"
    && raw.proof.locations.length > 0;
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

function truncationKey(state: TruncatedTraversalState): string {
  return JSON.stringify({
    origin: state.origin,
    field: state.field.elementIds,
    currentElementId: state.currentElementId,
    currentOccurrenceId: state.currentOccurrenceId,
    gap: state.gap.id,
  });
}
