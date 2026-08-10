import type { AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import type { ProgramElement } from "./program-evidence";
import { indexReadMetadataFromElement } from "./program-index-read-metadata";
import {
  solidShowRenderPropTerminalAnchor,
  type RouteTotalityAnchorIndex,
} from "./route-totality-anchor-index";
import { type AttachmentAccumulator } from "./route-totality-field-lineage-attachment";
import {
  componentPropBindingContext,
  provenComponentPropBoundaries,
} from "./route-totality-field-lineage-component-binding";
import { addFrontier, makeFrontier, type FrontierAccumulator } from "./route-totality-field-lineage-frontier";
import { hasRouteTotalityFieldLineageId } from "./route-totality-field-lineage-index";
import {
  comparePath,
  compareTraversal,
  lastLocation,
  traversalKey,
  type TraversalState,
} from "./route-totality-field-lineage-support";
import { advanceRouteTotalityFieldTransition } from "./route-totality-field-lineage-transition-advance";
import { fieldForTarget } from "./route-totality-field-lineage-target-field";
import {
  recordRouteTotalityFieldTruncations,
  type TruncatedTraversalState,
} from "./route-totality-field-lineage-truncation";
import {
  classifyRouteTotalityFieldTransition,
  isFullyProvenElement,
  isFullyProvenProof,
} from "./route-totality-field-lineage-transition";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";

export type RouteTotalityFieldTraversalInput = {
  provider: EvidenceRelationProvider;
  origin: EvidenceSlice["origins"][number];
  rootOccurrenceId: string | null;
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>;
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>;
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>;
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>;
  anchors: RouteTotalityAnchorIndex;
  surface: RouteOccurrenceSurface;
  attachments: Map<string, AttachmentAccumulator>;
  frontiers: FrontierAccumulator;
  carrierGaps: string[];
  truncations: Map<string, TruncatedTraversalState>;
  cancellation: AnalysisCancellationToken;
};

export function traverseRouteTotalityFieldOrigin(input: RouteTotalityFieldTraversalInput): void {
  const {
    provider,
    origin,
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
  } = input;
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
    solidShowRenderPropTerminal: false,
    carrier: false,
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
    if (recordRouteTotalityFieldTruncations(state, gapsByFrom, truncations, cancellation)) continue;
    const outgoing = relationsByFrom.get(state.currentElementId) ?? [];
    if (outgoing.length === 0) {
      addUncontinuedFieldFrontier(state, elementsById, frontiers, cancellation);
      continue;
    }

    for (const relation of outgoing) {
      cancellation.throwIfCancelled();
      const source = elementsById.get(relation.from);
      const target = elementsById.get(relation.to);
      if (relation.kind === "component-prop" && target?.kind === "component-occurrence") {
        const canonicalBoundary = provenComponentPropBoundaries(
          state.currentElementId,
          outgoing,
          elementsById,
          cancellation,
        ).find((candidate) => candidate.to === relation.to);
        if (canonicalBoundary && canonicalBoundary.id !== relation.id) continue;
      }
      const rawTarget = target ? provider.facts.getElement(target.id) : undefined;
      const targetField = target ? fieldForTarget(rawTarget, target, cancellation) : null;
      const indexMetadata = target?.kind === "index-read"
        ? rawTarget ? indexReadMetadataFromElement(rawTarget) : null
        : null;
      const occurrenceAnchors = target ? anchors.occurrenceAnchorsByEvidenceElementId.get(target.id) ?? [] : [];
      const terminalAnchors = target ? anchors.terminalAnchorsByEvidenceElementId.get(target.id) ?? [] : [];
      const terminal = terminalAnchors.length === 1 ? terminalAnchors[0].endpoint : undefined;
      const solidShowTerminal = target && state.solidShowRenderPropTerminal
        ? solidShowRenderPropTerminalAnchor(anchors, surface, target.id, cancellation)
        : null;
      const bindingContext = relation.kind === "component-prop-binding"
        ? componentPropBindingContext(
          state.currentElementId,
          target,
          outgoing,
          relationsByFrom,
          relationsByTo,
          elementsById,
          gapsByFrom,
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
        staticNamedField: target?.kind === "field-read" ? targetField !== null : null,
        sourceFieldName: source?.fieldName ?? null,
        targetFieldName: target?.fieldName ?? null,
        indexMetadata,
        currentFieldElementId: state.field?.elementIds.at(-1) ?? null,
        componentPropReceiverElementId: state.componentPropReceiver?.elementId ?? null,
        occurrenceAnchorCount: occurrenceAnchors.length,
        terminalAnchorCount: terminalAnchors.length,
        currentOccurrenceId: state.currentOccurrenceId,
        terminalOwnerOccurrenceId: terminal?.ownerOccurrenceId,
        solidShowTerminalOccurrenceId: solidShowTerminal?.endpoint.ownerOccurrenceId ?? null,
        componentPropBoundaryCount: bindingContext?.boundaryCount,
        componentPropOccurrenceAnchorCount: bindingContext?.occurrenceAnchorCount,
        componentPropBindingReceiverCount: bindingContext?.receiverCount,
        componentPropReceiverFieldInputCount: bindingContext?.receiverFieldInputCount,
        componentPropReceiverRootProven: bindingContext?.receiverRootProven,
        componentPropBindingAmbiguous: bindingContext?.bindingAmbiguous,
        componentPropBindingIncomplete: bindingContext?.bindingIncomplete,
        cancellation,
      });
      advanceRouteTotalityFieldTransition({
        state,
        relation,
        target,
        transition,
        targetField,
        bindingContext,
        terminalId: terminalAnchors.length === 1 ? terminalAnchors[0].endpoint.id : null,
        outgoing,
        relationsByFrom,
        relationsByTo,
        elementsById,
        gapsByFrom,
        anchors,
        attachments,
        frontiers,
        carrierGaps,
        truncations,
        queue,
        cancellation,
      });
    }
  }
}

function addUncontinuedFieldFrontier(
  state: TraversalState,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  frontiers: FrontierAccumulator,
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (!state.field) return;
  const location = lastLocation(state, elementsById, cancellation) ?? state.field.location;
  addFrontier(frontiers, makeFrontier(
    state.origin,
    state.field,
    state.currentOccurrenceId,
    "unsupported-relation",
    state.currentElementId,
    null,
    location,
    [{
      kind: "route-totality-field-frontier",
      detail: "No indexed relation continues from this exact field-carrying state.",
      locations: [location],
      status: "proven",
    }],
    state,
    null,
    cancellation,
  ), cancellation);
}

export function isProvenOrigin(
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
