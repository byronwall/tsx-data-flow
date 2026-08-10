import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceSlice } from "./evidence-slice";
import {
  componentBoundaryFrontierOccurrenceId,
  componentPropBindingReadiness,
  lastFieldSegment,
  type ComponentPropBindingContext,
} from "./route-totality-field-lineage-component-binding";
import { addAttachment, type AttachmentAccumulator } from "./route-totality-field-lineage-attachment";
import { addFrontier, makeFrontier, type FrontierAccumulator } from "./route-totality-field-lineage-frontier";
import { hasRouteTotalityFieldLineageId } from "./route-totality-field-lineage-index";
import {
  appendField,
  lastLocation,
  nextState,
  proofsForStop,
  type FieldState,
  type TraversalState,
} from "./route-totality-field-lineage-support";
import {
  type FieldLineageTransition,
} from "./route-totality-field-lineage-transition";
import {
  recordRouteTotalityFieldTruncations,
  type TruncatedTraversalState,
} from "./route-totality-field-lineage-truncation";
import type { RouteTotalityAnchorIndex } from "./route-totality-anchor-index";
import type { RouteTotalityFieldFrontierReason } from "./route-totality-field-lineage";

export type RouteTotalityFieldTransitionAdvanceInput = {
  state: TraversalState;
  relation: EvidenceSlice["relations"][number];
  target: EvidenceSlice["elements"][number] | undefined;
  transition: FieldLineageTransition;
  targetField: FieldState | null;
  bindingContext: ComponentPropBindingContext | null;
  terminalId: string | null;
  outgoing: readonly EvidenceSlice["relations"][number][];
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>;
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>;
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>;
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>;
  anchors: RouteTotalityAnchorIndex;
  attachments: Map<string, AttachmentAccumulator>;
  frontiers: FrontierAccumulator;
  carrierGaps: string[];
  truncations: Map<string, TruncatedTraversalState>;
  queue: TraversalState[];
  cancellation: AnalysisCancellationToken;
};

/** Advance one classified relation without changing the bounded traversal policy. */
export function advanceRouteTotalityFieldTransition(
  input: RouteTotalityFieldTransitionAdvanceInput,
): void {
  const {
    state,
    relation,
    target,
    transition,
    targetField,
    bindingContext,
    terminalId,
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
  } = input;
  cancellation.throwIfCancelled();
  if (transition.kind === "stop") {
    if (!state.field) {
      carrierGaps.push(`Carrier path stopped at ${target?.location.file ?? relation.proof.locations[0]?.file ?? "unknown"}:${target?.location.line ?? relation.proof.locations[0]?.line ?? 0} (${transition.reason}).`);
    }
    addStopFrontier(state, relation, target, transition.reason, elementsById, frontiers, cancellation);
    return;
  }
  if (!target) return;
  if (hasRouteTotalityFieldLineageId(state.elementIds, target.id, cancellation)) {
    addStopFrontier(state, relation, target, "identity-lost", elementsById, frontiers, cancellation);
    return;
  }
  if (transition.kind === "preserve") {
    const next = nextState(
      state,
      target,
      relation,
      state.field,
      state.currentOccurrenceId,
      cancellation,
      state.componentPropReceiver,
      undefined,
      relation.kind === "carrier" && relation.proof.kind === "solid-show-render-prop",
    );
    recordRouteTotalityFieldTruncations(next, gapsByFrom, truncations, cancellation);
    queue.push(next);
    return;
  }
  if (transition.kind === "component-prop-binding-start") {
    const boundary = bindingContext?.boundary;
    if (!boundary) {
      addStopFrontier(state, relation, target, "partial-proof", elementsById, frontiers, cancellation);
      return;
    }
    enqueue(
      nextState(state, target, relation, state.field, boundary.endpoint.id, cancellation, null),
      gapsByFrom,
      truncations,
      queue,
      cancellation,
    );
    return;
  }
  if (transition.kind === "component-prop-binding-receiver") {
    if (state.field && target.fieldName !== lastFieldSegment(state.field)) {
      addStopFrontier(state, relation, target, "renamed-prop", elementsById, frontiers, cancellation);
      return;
    }
    if (!target.fieldName) {
      addStopFrontier(state, relation, target, "partial-proof", elementsById, frontiers, cancellation);
      return;
    }
    enqueue(
      nextState(
        state,
        target,
        relation,
        state.field,
        state.currentOccurrenceId,
        cancellation,
        { elementId: target.id, propName: target.fieldName },
      ),
      gapsByFrom,
      truncations,
      queue,
      cancellation,
    );
    return;
  }
  if (transition.kind === "field-input") {
    if (!targetField) {
      addStopFrontier(state, relation, target, "partial-proof", elementsById, frontiers, cancellation);
      return;
    }
    const nextField = state.field ? appendField(state.field, targetField, cancellation) : targetField;
    enqueue(
      nextState(state, target, relation, nextField, state.currentOccurrenceId, cancellation, null),
      gapsByFrom,
      truncations,
      queue,
      cancellation,
    );
    return;
  }
  if (transition.kind === "component-prop") {
    emitComponentPropFrontier(
      state,
      relation,
      target,
      outgoing,
      relationsByFrom,
      relationsByTo,
      elementsById,
      gapsByFrom,
      anchors,
      frontiers,
      cancellation,
    );
    return;
  }
  if (transition.kind === "render-terminal" && state.field && terminalId) {
    const next = nextState(state, target, relation, state.field, transition.occurrenceId, cancellation);
    addAttachment(
      attachments,
      state.origin,
      state.field,
      transition.occurrenceId,
      terminalId,
      next,
      cancellation,
    );
  }
}

function enqueue(
  state: TraversalState,
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
  truncations: Map<string, TruncatedTraversalState>,
  queue: TraversalState[],
  cancellation: AnalysisCancellationToken,
): void {
  recordRouteTotalityFieldTruncations(state, gapsByFrom, truncations, cancellation);
  queue.push(state);
}

function emitComponentPropFrontier(
  state: TraversalState,
  relation: EvidenceSlice["relations"][number],
  target: EvidenceSlice["elements"][number],
  outgoing: readonly EvidenceSlice["relations"][number][],
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
  anchors: RouteTotalityAnchorIndex,
  frontiers: FrontierAccumulator,
  cancellation: AnalysisCancellationToken,
): void {
  if (!state.field) return;
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
  if (readiness === "ready") return;
  addStopFrontier(
    {
      ...state,
      currentOccurrenceId: componentBoundaryFrontierOccurrenceId(state.currentOccurrenceId),
    },
    relation,
    target,
    readiness === "ambiguous" ? "ambiguous-target" : "partial-proof",
    elementsById,
    frontiers,
    cancellation,
  );
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
