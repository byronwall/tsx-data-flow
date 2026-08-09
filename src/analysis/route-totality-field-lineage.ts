import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import type { ProgramElement } from "./program-evidence";
import { buildRouteTotalityAnchorIndex, type RouteTotalityAnchorIndex } from "./route-totality-anchor-index";
import { addAttachment, type AttachmentAccumulator } from "./route-totality-field-lineage-attachment";
import {
  componentPropBindingContext,
  componentPropBindingReadiness,
  lastFieldSegment,
  uniqueProvenComponentPropBoundaries,
} from "./route-totality-field-lineage-component-binding";
import { addFrontier, makeFrontier, type FrontierAccumulator } from "./route-totality-field-lineage-frontier";
import {
  buildRouteTotalityFieldLineageIndexes,
  hasRouteTotalityFieldLineageId,
  routeTotalityFieldRootOccurrenceId,
} from "./route-totality-field-lineage-index";
import { projectRouteTotalityFieldLineageResult } from "./route-totality-field-lineage-result";
import {
  appendField,
  compareOrigin,
  comparePath,
  compareTraversal,
  lastLocation,
  nextState,
  proofsForStop,
  traversalKey,
  type FieldState,
  type TraversalState,
} from "./route-totality-field-lineage-support";
import {
  emitRouteTotalityFieldTruncationFrontiers,
  recordRouteTotalityFieldTruncations,
  type TruncatedTraversalState,
} from "./route-totality-field-lineage-truncation";
import {
  classifyRouteTotalityFieldTransition,
  isFullyProvenElement,
  isFullyProvenProof,
  type FieldLineageStopReason,
} from "./route-totality-field-lineage-transition";
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

  emitRouteTotalityFieldTruncationFrontiers(
    truncations,
    relationsByFrom,
    relationsById,
    elementsById,
    frontiers,
    cancellation,
  );
  return projectRouteTotalityFieldLineageResult(
    slice,
    surface,
    attachments,
    frontiers,
    elementsById,
    relationsById,
    cancellation,
  );
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
    componentPropReceiver: null,
  }];
  const best = new Map<string, TraversalState>();

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
    recordRouteTotalityFieldTruncations(state, gapsByFrom, truncations, cancellation);
    const outgoing = relationsByFrom.get(state.currentElementId) ?? [];

    for (const relation of outgoing) {
      cancellation.throwIfCancelled();
      const source = elementsById.get(relation.from);
      const target = elementsById.get(relation.to);
      if (relation.kind === "component-prop" && target?.kind === "component-occurrence") {
        const canonicalBoundary = uniqueProvenComponentPropBoundaries(
          state.currentElementId,
          outgoing,
          elementsById,
          cancellation,
        ).find((candidate) => candidate.to === relation.to);
        if (canonicalBoundary && canonicalBoundary.id !== relation.id) continue;
      }
      if (relation.kind === "component-prop-binding" && source?.kind !== "component-prop-binding") {
        const boundary = outgoing.find((candidate) =>
          candidate.kind === "component-prop"
            && candidate.from === state.currentElementId
            && elementsById.get(candidate.to)?.kind === "component-occurrence",
        );
        if (!boundary || componentPropBindingReadiness(
          state.currentElementId,
          boundary,
          outgoing,
          relationsByFrom,
          relationsByTo,
          elementsById,
          anchors,
          cancellation,
        ) !== "ready") continue;
      }
      const rawTarget = target ? provider.facts.getElement(target.id) : undefined;
      const namedField = target ? namedPropertyField(rawTarget, target, cancellation) : null;
      const occurrenceAnchors = target ? anchors.occurrenceAnchorsByEvidenceElementId.get(target.id) ?? [] : [];
      const terminalAnchors = target ? anchors.terminalAnchorsByEvidenceElementId.get(target.id) ?? [] : [];
      const terminal = terminalAnchors.length === 1 ? terminalAnchors[0].endpoint : undefined;
      const bindingContext = relation.kind === "component-prop-binding"
        ? componentPropBindingContext(
          state.currentElementId,
          target,
          outgoing,
          relationsByFrom,
          relationsByTo,
          elementsById,
          anchors,
          cancellation,
        )
        : null;
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
        componentPropBoundaryCount: bindingContext?.boundaryCount,
        componentPropOccurrenceAnchorCount: bindingContext?.occurrenceAnchorCount,
        componentPropBindingReceiverCount: bindingContext?.receiverCount,
        componentPropReceiverRootProven: bindingContext?.receiverRootProven,
        cancellation,
      });
      if (transition.kind === "stop") {
        addStopFrontier(state, relation, target, transition.reason, elementsById, frontiers, cancellation);
        continue;
      }
      if (!target) continue;
      if (hasRouteTotalityFieldLineageId(state.elementIds, target.id, cancellation)) {
        addStopFrontier(state, relation, target, "identity-lost", elementsById, frontiers, cancellation);
        continue;
      }
      if (transition.kind === "preserve") {
        const next = nextState(state, target, relation, state.field, state.currentOccurrenceId, cancellation);
        recordRouteTotalityFieldTruncations(next, gapsByFrom, truncations, cancellation);
        queue.push(next);
        continue;
      }
      if (transition.kind === "component-prop-binding-start") {
        const boundary = bindingContext?.boundary;
        if (!boundary) {
          addStopFrontier(state, relation, target, "partial-proof", elementsById, frontiers, cancellation);
          continue;
        }
        const next = nextState(
          state,
          target,
          relation,
          state.field,
          boundary.endpoint.id,
          cancellation,
          null,
        );
        recordRouteTotalityFieldTruncations(next, gapsByFrom, truncations, cancellation);
        queue.push(next);
        continue;
      }
      if (transition.kind === "component-prop-binding-receiver") {
        if (state.field && target?.fieldName !== lastFieldSegment(state.field)) {
          addStopFrontier(state, relation, target, "renamed-prop", elementsById, frontiers, cancellation);
          continue;
        }
        if (!target?.fieldName) {
          addStopFrontier(state, relation, target, "partial-proof", elementsById, frontiers, cancellation);
          continue;
        }
        const next = nextState(
          state,
          target,
          relation,
          state.field,
          state.currentOccurrenceId,
          cancellation,
          { elementId: target.id, propName: target.fieldName },
        );
        recordRouteTotalityFieldTruncations(next, gapsByFrom, truncations, cancellation);
        queue.push(next);
        continue;
      }
      if (transition.kind === "field-input") {
        if (!namedField) {
          addStopFrontier(state, relation, target, "partial-proof", elementsById, frontiers, cancellation);
          continue;
        }
        const nextField = state.field
          ? appendField(
            state.field,
            namedField,
            Boolean(state.componentPropReceiver)
              || relation.from === state.field.elementIds[state.field.elementIds.length - 1],
            cancellation,
          )
          : namedField;
        if (!nextField) {
          addStopFrontier(state, relation, target, "identity-lost", elementsById, frontiers, cancellation);
          continue;
        }
        const next = nextState(state, target, relation, nextField, state.currentOccurrenceId, cancellation, null);
        recordRouteTotalityFieldTruncations(next, gapsByFrom, truncations, cancellation);
        queue.push(next);
        continue;
      }
      if (transition.kind === "component-prop") {
        if (state.field) {
          const readiness = componentPropBindingReadiness(
            state.currentElementId,
            relation,
            outgoing,
            relationsByFrom,
            relationsByTo,
            elementsById,
            anchors,
            cancellation,
          );
          if (readiness !== "ready") {
            const boundaryAnchor = anchors.occurrenceAnchorsByEvidenceElementId.get(target?.id ?? "")?.[0];
            const frontierState = boundaryAnchor
              ? { ...state, currentOccurrenceId: boundaryAnchor.endpoint.id }
              : state;
            addStopFrontier(
              frontierState,
              relation,
              target,
              readiness === "ambiguous" ? "ambiguous-target" : "partial-proof",
              elementsById,
              frontiers,
              cancellation,
            );
          }
        }
        continue;
      }
      if (transition.kind === "render-terminal") {
        const terminalEndpoint = terminalAnchors[0]?.endpoint;
        if (!state.field || !state.currentOccurrenceId || !terminalEndpoint) continue;
        const next = nextState(state, target, relation, state.field, state.currentOccurrenceId, cancellation);
        addAttachment(
          attachments,
          originIdentity,
          state.field,
          state.currentOccurrenceId,
          terminalEndpoint.id,
          next,
          cancellation,
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
  const stopProof = proofsForStop(state, relation, elementsById, target, cancellation).map((proof) => reason === "partial-proof"
    ? { ...proof, status: "partial" as const }
    : proof);
  addFrontier(frontiers, makeFrontier(
    state.origin,
    state.field,
    state.currentOccurrenceId,
    reason,
    target?.id ?? null,
    relation.id,
    target?.location ?? relation.proof.locations[0] ?? lastLocation(state, elementsById, cancellation),
    stopProof,
    state,
    null,
    cancellation,
  ), cancellation);
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
