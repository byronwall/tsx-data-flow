import type { AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import type { ProgramElement } from "./program-evidence";
import { indexReadMetadataFromElement } from "./program-index-read-metadata";
import type { RouteTotalityAnchorIndex } from "./route-totality-anchor-index";
import { addAttachment, type AttachmentAccumulator } from "./route-totality-field-lineage-attachment";
import {
  componentPropBindingContext,
  componentPropBindingReadiness,
  componentBoundaryFrontierOccurrenceId,
  lastFieldSegment,
  provenComponentPropBoundaries,
} from "./route-totality-field-lineage-component-binding";
import { addFrontier, makeFrontier, type FrontierAccumulator } from "./route-totality-field-lineage-frontier";
import { hasRouteTotalityFieldLineageId } from "./route-totality-field-lineage-index";
import {
  appendField,
  comparePath,
  compareTraversal,
  lastLocation,
  nextState,
  proofsForStop,
  traversalKey,
  type TraversalState,
} from "./route-totality-field-lineage-support";
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
import type { RouteTotalityFieldFrontierReason } from "./route-totality-field-lineage";

export type RouteTotalityFieldTraversalInput = {
  provider: EvidenceRelationProvider;
  origin: EvidenceSlice["origins"][number];
  rootOccurrenceId: string | null;
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>;
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>;
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>;
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>;
  anchors: RouteTotalityAnchorIndex;
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
        componentPropBoundaryCount: bindingContext?.boundaryCount,
        componentPropOccurrenceAnchorCount: bindingContext?.occurrenceAnchorCount,
        componentPropBindingReceiverCount: bindingContext?.receiverCount,
        componentPropReceiverFieldInputCount: bindingContext?.receiverFieldInputCount,
        componentPropReceiverRootProven: bindingContext?.receiverRootProven,
        componentPropBindingAmbiguous: bindingContext?.bindingAmbiguous,
        componentPropBindingIncomplete: bindingContext?.bindingIncomplete,
        cancellation,
      });
      if (transition.kind === "stop") {
        if (!state.field) {
          carrierGaps.push(`Carrier path stopped at ${target?.location.file ?? relation.proof.locations[0]?.file ?? "unknown"}:${target?.location.line ?? relation.proof.locations[0]?.line ?? 0} (${transition.reason}).`);
        }
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
        if (!targetField) {
          addStopFrontier(state, relation, target, "partial-proof", elementsById, frontiers, cancellation);
          continue;
        }
        const nextField = state.field
          ? appendField(
            state.field,
            targetField,
            cancellation,
          )
          : targetField;
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
            gapsByFrom,
            anchors,
            cancellation,
          );
          if (readiness !== "ready") {
            const frontierState = {
              ...state,
              currentOccurrenceId: componentBoundaryFrontierOccurrenceId(state.currentOccurrenceId),
            };
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
