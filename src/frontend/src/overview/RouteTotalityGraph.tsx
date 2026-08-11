import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import type { RouteDataDetail, RouteTotality } from "../../../api/contracts";
import type { HiddenComponentPolicy } from "../../../api/hidden-component-policy";
import { layoutRouteTotality, routeTotalityPayloadIdentity, type RouteTotalityLayout, type RouteTotalityLayoutNode } from "./route-totality-model";
import { routeInvestigationSelectionForNode, sameRouteInvestigationSelection, type RouteInvestigationSelection } from "./route-investigation-selection";
import { RouteTotalityInspector } from "./RouteTotalityInspector";
import { buildRouteTotalityInspectorRecord } from "./route-totality-inspector-model";
import { buildRouteTotalityAdjacency, buildRouteTotalityEmphasis, type RouteTotalityEmphasisMode } from "./route-totality-emphasis";
import { buildRouteTotalityBoundaryStubs } from "./route-totality-boundary-stubs";
import type { SourceEvidenceTarget } from "./source-evidence-model";
import { routeTotalityFindingSummaryForSelection } from "./route-totality-finding-model";
import { buildRouteTotalityDisplayModel } from "./route-totality-display-model";
import { layoutRouteTotalityDisplay, type RouteTotalityDisplayLayout } from "./route-totality-display-layout";
import { routeTotalityDisplayZoomLevel, selectRouteTotalityDisplayLabelIds, type RouteTotalityDisplayZoom } from "./route-totality-display-labels";
import { RouteTotalityControls } from "./RouteTotalityControls";
import { ComponentTopologyDebugControls } from "./ComponentTopologyDebugControls";
import type { GenericUiMode, TrajectoryGraphCamera, TrajectoryTotalitySelection } from "./trajectory-url-state";
import { DEFAULT_ROUTE_TOTALITY_CAMERA, createRouteTotalityCamera } from "./route-totality-camera";
import { emphasisModeForSelection, persistedSelection, reconcileRouteTotalityState, selectionFromPersisted, buildRouteTotalityLedger, routeTotalityDisplayBounds, type RouteTotalityInvestigationStateChange } from "./route-totality-graph-state";
import { RouteTotalityViewport } from "./RouteTotalityViewport";
import { createRouteTotalityGraphActions } from "./route-totality-graph-actions";
import { hasRouteTotalityFieldOrigin, selectRouteTotalityFieldFocus, type RouteTotalityFieldOriginFocus } from "./route-totality-field-lineage-model";
import { selectRouteTotalityFieldFrontierLabels, selectRouteTotalityFieldInspectorResult, type RouteTotalityFieldInspectorScope } from "./route-totality-field-inspector-model";
import { routeTotalityFieldInspectorScopeForSelection } from "./route-totality-field-inspector-scope";
import { DEFAULT_ROUTE_TOTALITY_SURFACE_LAYOUT_SETTINGS } from "./route-totality-surface-layout";
import { createTopologyLayoutDebug } from "./topology-layout-debug";
import { createRouteContextContinuityUiState } from "./route-context-continuity-state";
import {
  exactRouteTotalityOriginForSource,
  exactRouteTotalityOriginSelection,
} from "./route-totality-source-focus";

const COMPACT_COUNT_KEYS = ["origins", "occurrences", "boundaries", "terminals", "evidenceRelations", "evidenceGaps"] as const;

type RouteTotalityGraphProps = {
  totality: RouteTotality | null;
  shadowEvidence: RouteDataDetail["shadowEvidence"];
  selectedSourceKey: string | null;
  selectedSourceEvidence: RouteDataDetail["evidence"][number] | null;
  fieldFocus: string | null;
  consumerFocus: string | null;
  generation: number;
  scopeKey?: string;
  selection?: TrajectoryTotalitySelection | null;
  camera?: TrajectoryGraphCamera | null;
  isolated?: boolean;
  contextFocus?: string | null;
  onContextFocusChange?: (contextFocus: string | null) => void;
  onFieldFocusChange: (fieldFocus: string | null, consumerFocus?: string | null) => void;
  onClearFieldFocus: () => void;
  hiddenComponentPolicy: HiddenComponentPolicy;
  genericUiMode: GenericUiMode | null;
  onGenericUiMode: (mode: GenericUiMode) => void;
  onInvestigationStateChange: (change: RouteTotalityInvestigationStateChange) => void;
  onOpenSource?: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
};

export function RouteTotalityGraph(props: RouteTotalityGraphProps) {
  const effectiveGenericUiMode = createMemo<GenericUiMode>(() => props.genericUiMode ?? (props.hiddenComponentPolicy.enabledByDefault ? "hidden" : "all"));
  const layout = createMemo<RouteTotalityLayout>(() => layoutRouteTotality(props.totality, {
    hiddenComponentPolicy: props.hiddenComponentPolicy,
    genericUiMode: effectiveGenericUiMode(),
  }));
  const displayModel = createMemo(() => buildRouteTotalityDisplayModel(layout(), props.totality));
  const layoutDebug = createTopologyLayoutDebug({ defaults: DEFAULT_ROUTE_TOTALITY_SURFACE_LAYOUT_SETTINGS });
  const displayLayout = createMemo<RouteTotalityDisplayLayout>(() => layoutRouteTotalityDisplay(displayModel(), {
    settings: layoutDebug.settings(),
    steps: layoutDebug.steps(),
  }));
  const contextUi = createRouteContextContinuityUiState({
    totality: () => props.totality,
    layout,
    displayLayout,
    contextFocus: props.contextFocus,
    onContextFocusChange: props.onContextFocusChange,
  });
  const initialSelection = untrack(() => selectionFromPersisted(props.selection ?? null, layout()));
  const [selection, setSelection] = createSignal<RouteInvestigationSelection>(initialSelection);
  const [activeFieldOrigin, setActiveFieldOrigin] = createSignal<RouteTotalityFieldOriginFocus | null>(null);
  const [fieldInspectorScope, setFieldInspectorScope] = createSignal<RouteTotalityFieldInspectorScope | null>(null);
  const [emphasisMode, setEmphasisMode] = createSignal<RouteTotalityEmphasisMode | null>(untrack(() => emphasisModeForSelection(initialSelection)));
  const [isolated, setIsolated] = createSignal(untrack(() => Boolean(props.isolated && emphasisModeForSelection(initialSelection) !== null)));
  const markRefs = new Map<string, SVGGElement>();
  let svg: SVGSVGElement | undefined;
  let previousIdentity = "";
  let previousPayloadIdentity = "";
  let previousGenericUiMode: GenericUiMode | undefined;
  let previousHiddenComponentPolicyFingerprint = "";
  let previousScopeKey: string | null | undefined;
  let previousControlledSelectionIdentity: string | null = null;
  let hasPreviousControlledSelectionIdentity = false;
  let previousSourceFocusIdentity: string | null = null;
  let previousSelectedSourceKey: string | null | undefined;
  let sourceSelectionWasCleared = false;
  let skipControlledSync = false;
  let skipControlledCameraSync = false;

  const applyLocalInvestigationState = (nextSelection: RouteInvestigationSelection, nextIsolated: boolean) => {
    setSelection(nextSelection);
    setIsolated(nextIsolated);
  };
  const emitInvestigationState = (nextSelection: RouteInvestigationSelection, nextIsolated: boolean, nextCamera?: TrajectoryGraphCamera | null) => {
    applyLocalInvestigationState(nextSelection, nextIsolated);
    const change: RouteTotalityInvestigationStateChange = {
      selection: persistedSelection(nextSelection),
      isolated: nextIsolated,
    };
    if (nextCamera !== undefined) change.camera = nextCamera;
    props.onInvestigationStateChange(change);
  };
  const setFieldInspectorScopeForSelection = (next: Exclude<RouteInvestigationSelection, null>) => {
    const nextFieldScope = routeTotalityFieldInspectorScopeForSelection(
      props.totality,
      next,
      untrack(() => activeFieldOrigin()),
    );
    setActiveFieldOrigin(nextFieldScope.origin);
    setFieldInspectorScope(nextFieldScope.scope);
  };
  const cameraController = createRouteTotalityCamera({
    initialCamera: untrack(() => props.camera ? { ...props.camera } : null),
    getViewportSize: () => displayBounds(),
    getSvg: () => svg,
    onCommit: (nextCamera) => emitInvestigationState(selection(), isolated(), nextCamera),
    onTap: () => {
      setEmphasisMode(null);
      if (activeFieldOrigin()) setFieldInspectorScope({ kind: "origin" });
      emitInvestigationState(null, false);
    },
  });
  const camera = cameraController.camera;

  createEffect(() => {
    const payloadIdentity = routeTotalityPayloadIdentity(props.totality, props.generation);
    const hiddenPolicyFingerprint = hiddenComponentPolicyFingerprint(props.hiddenComponentPolicy);
    const identity = JSON.stringify([
      payloadIdentity,
      effectiveGenericUiMode(),
      hiddenPolicyFingerprint,
    ]);
    const initialPayload = previousIdentity === "";
    const scopeKey = props.scopeKey ?? props.totality?.route.key ?? null;
    const scopeChanged = !initialPayload && scopeKey !== previousScopeKey;
    const payloadChanged = !initialPayload && payloadIdentity !== previousPayloadIdentity;
    const rendererChanged = !initialPayload && effectiveGenericUiMode() !== previousGenericUiMode;
    const policyChanged = !initialPayload && hiddenPolicyFingerprint !== previousHiddenComponentPolicyFingerprint;
    if (identity === previousIdentity && scopeKey === previousScopeKey) return;
    previousIdentity = identity;
    previousPayloadIdentity = payloadIdentity;
    previousGenericUiMode = effectiveGenericUiMode();
    previousHiddenComponentPolicyFingerprint = hiddenPolicyFingerprint;
    previousScopeKey = scopeKey;
    skipControlledSync = false;
    skipControlledCameraSync = false;
    cameraController.cancelPan();
    if (scopeChanged) {
      cameraController.cancelPendingCommit();
    }
    const requestedSelection = props.selection !== undefined ? props.selection : persistedSelection(selection());
    const requestedIsolation = props.isolated !== undefined ? props.isolated : isolated();
    const reconciliation = reconcileRouteTotalityState({
      totality: props.totality,
      layout: layout(),
      requestedSelection,
      requestedIsolation,
      currentMode: emphasisMode(),
      initialPayload,
      scopeChanged,
    });
    setEmphasisMode(reconciliation.emphasisMode);
    applyLocalInvestigationState(reconciliation.selection, reconciliation.isolated);
    const nextFieldOrigin = initialPayload
      ? null
      : scopeChanged || payloadChanged || rendererChanged || policyChanged
        ? null
        : untrack(() => activeFieldOrigin());
    const validFieldOrigin = nextFieldOrigin && hasRouteTotalityFieldOrigin(props.totality, nextFieldOrigin)
      ? nextFieldOrigin
      : null;
    setActiveFieldOrigin(validFieldOrigin);
    if (!validFieldOrigin) setFieldInspectorScope(null);
    else if (initialPayload || scopeChanged || payloadChanged || rendererChanged || policyChanged) setFieldInspectorScope({ kind: "origin" });
    if (scopeChanged || payloadChanged || rendererChanged || policyChanged) {
      skipControlledSync = props.selection !== undefined || props.isolated !== undefined;
    }

    if (scopeChanged) {
      skipControlledSync = props.selection !== undefined || props.isolated !== undefined;
      skipControlledCameraSync = props.camera !== undefined;
      cameraController.setCamera({ ...DEFAULT_ROUTE_TOTALITY_CAMERA });
    } else if (initialPayload) {
      cameraController.setCamera(props.camera ? { ...props.camera } : { ...DEFAULT_ROUTE_TOTALITY_CAMERA });
    }
    if (reconciliation.needsCorrection) {
      if (!scopeChanged) skipControlledSync = props.selection !== undefined || props.isolated !== undefined;
      emitInvestigationState(reconciliation.selection, reconciliation.isolated, scopeChanged ? null : undefined);
    }
  });

  createEffect(() => {
    const controlledSelection = props.selection;
    const controlledIsolation = props.isolated;
    const controlledSelectionIdentity = controlledSelection?.graphId ?? null;
    const controlledSelectionChanged = controlledSelection !== undefined
      && (!hasPreviousControlledSelectionIdentity || controlledSelectionIdentity !== previousControlledSelectionIdentity);
    if (controlledSelection === undefined) {
      hasPreviousControlledSelectionIdentity = false;
    } else {
      hasPreviousControlledSelectionIdentity = true;
      previousControlledSelectionIdentity = controlledSelectionIdentity;
    }
    if (skipControlledSync) {
      skipControlledSync = false;
      return;
    }
    if (controlledSelection === undefined && controlledIsolation === undefined) return;
    const reconciliation = untrack(() => {
      const currentSelection = selection();
      const selectionChanged = controlledSelection !== undefined
        && (controlledSelection?.graphId ?? null) !== (currentSelection?.graphId ?? null);
      return reconcileRouteTotalityState({
        totality: props.totality,
        layout: layout(),
        requestedSelection: controlledSelection !== undefined ? controlledSelection : persistedSelection(currentSelection),
        requestedIsolation: controlledIsolation !== undefined ? controlledIsolation : isolated(),
        currentMode: selectionChanged && controlledSelection?.kind === "node" ? "both" : emphasisMode(),
        initialPayload: false,
        scopeChanged: false,
      });
    });
    setEmphasisMode(reconciliation.emphasisMode);
    applyLocalInvestigationState(reconciliation.selection, reconciliation.isolated);
    if (controlledSelectionChanged) {
      if (reconciliation.selection) setFieldInspectorScopeForSelection(reconciliation.selection);
      else setFieldInspectorScope(untrack(() => activeFieldOrigin()) ? { kind: "origin" } : null);
    }
    if (reconciliation.needsCorrection) {
      skipControlledSync = props.selection !== undefined || props.isolated !== undefined;
      emitInvestigationState(reconciliation.selection, reconciliation.isolated);
    }
  });

  createEffect(() => {
    const focus = activeFieldOrigin();
    if (focus && props.totality && !hasRouteTotalityFieldOrigin(props.totality, focus)) {
      setActiveFieldOrigin(null);
      setFieldInspectorScope(null);
    }
  });

  createEffect(() => {
    const selectedSourceKey = props.selectedSourceKey;
    if (selectedSourceKey !== previousSelectedSourceKey) {
      if (selectedSourceKey === null && previousSelectedSourceKey) sourceSelectionWasCleared = true;
      previousSelectedSourceKey = selectedSourceKey;
    }
    const origin = exactRouteTotalityOriginForSource(props.totality, props.selectedSourceEvidence);
    const evidence = props.selectedSourceEvidence;
    if (!origin || !evidence) {
      previousSourceFocusIdentity = null;
      setActiveFieldOrigin(null);
      setFieldInspectorScope(null);
      return;
    }
    const focusIdentity = [
      props.scopeKey ?? props.totality?.route.key ?? "",
      routeTotalityPayloadIdentity(props.totality, props.generation),
      evidence.id,
      origin.elementId,
      origin.role,
    ].join(":");
    if (focusIdentity === previousSourceFocusIdentity) {
      if (!activeFieldOrigin()) {
        setActiveFieldOrigin(origin);
        setFieldInspectorScope({ kind: "origin" });
      } else if (!fieldInspectorScope()) {
        setFieldInspectorScope({ kind: "origin" });
      }
      return;
    }
    previousSourceFocusIdentity = focusIdentity;
    const wasCleared = sourceSelectionWasCleared;
    sourceSelectionWasCleared = false;
    setActiveFieldOrigin(origin);
    if (props.selection !== null && props.selection !== undefined) {
      const currentSelection = selection();
      if (currentSelection) setFieldInspectorScopeForSelection(currentSelection);
      else setFieldInspectorScope({ kind: "origin" });
      return;
    }
    setFieldInspectorScope({ kind: "origin" });
    const sourceSelection = exactRouteTotalityOriginSelection(layout(), origin);
    if (!sourceSelection) return;
    setEmphasisMode("both");
    if (wasCleared) {
      applyLocalInvestigationState(sourceSelection, false);
      return;
    }
    emitInvestigationState(sourceSelection, false);
  });

  createEffect(() => {
    if (props.camera === undefined) return;
    if (cameraController.isCommitPending()) return;
    if (skipControlledCameraSync) {
      skipControlledCameraSync = false;
      return;
    }
    cameraController.syncControlledCamera(props.camera);
  });

  onCleanup(() => {
    markRefs.clear();
  });

  const displayZoom = createMemo<RouteTotalityDisplayZoom>(() => routeTotalityDisplayZoomLevel(camera().scale));
  const compactCounts = createMemo(() => COMPACT_COUNT_KEYS.flatMap((key) => {
    const item = layout().summary.countSummaries.find((summary) => summary.key === key);
    return item ? [item] : [];
  }));
  const adjacency = createMemo(() => buildRouteTotalityAdjacency(layout(), props.totality));
  const emphasis = createMemo(() => buildRouteTotalityEmphasis(
    adjacency(),
    layout(),
    selection(),
    emphasisMode(),
  ));
  const fieldFocus = createMemo(() => selectRouteTotalityFieldFocus(props.totality, layout(), activeFieldOrigin(), props.fieldFocus, props.consumerFocus));
  const fieldFrontierLabels = createMemo(() => selectRouteTotalityFieldFrontierLabels(
    props.totality,
    activeFieldOrigin(),
    displayLayout().edges,
  ));
  const visibleDisplayNodes = createMemo(() => {
    return [...displayLayout().nodes];
  });
  const visibleDisplayEdges = createMemo(() => {
    return [...displayLayout().edges];
  });
  const displayLabelIds = createMemo(() => selectRouteTotalityDisplayLabelIds(
    visibleDisplayNodes(),
    {
      cameraScale: camera().scale,
      selectedNodeIds: selection()?.target === "node" ? new Set([selection()!.graphId]) : new Set(),
      focusedNodeIds: new Set([
        ...emphasis().focusNodeIds,
        ...emphasis().frontierNodeIds,
        ...fieldFocus().activeNodeIds,
        ...fieldFocus().frontierNodeIds,
      ]),
      participantNodeIds: new Set([
        ...emphasis().activeNodeIds,
        ...emphasis().frontierNodeIds,
        ...fieldFocus().activeNodeIds,
        ...fieldFocus().frontierNodeIds,
      ]),
      fieldSummaryNodeIds: new Set(fieldFocus().summariesByNodeId.keys()),
    },
  ));
  const baseDisplayBounds = createMemo(() => routeTotalityDisplayBounds(displayLayout()));
  const boundaryStubLayout = createMemo<RouteTotalityLayout>(() => {
    const display = displayLayout();
    const displayNodes = display.nodes.map((displayNode) => ({
      ...displayNode.node,
      x: displayNode.x,
      y: displayNode.y,
      width: displayNode.width,
      height: displayNode.height,
    }));
    return {
      ...layout(),
      nodes: displayNodes,
      width: baseDisplayBounds().width,
      height: baseDisplayBounds().height,
    };
  });
  const boundaryStubs = createMemo(() => isolated()
    ? buildRouteTotalityBoundaryStubs(boundaryStubLayout(), adjacency(), emphasis().focusNodeIds, emphasis().focusEdgeIds)
    : []);
  const displayBounds = createMemo(() => routeTotalityDisplayBounds(
    displayLayout(),
    boundaryStubs(),
  ));
  const selectedRecord = createMemo(() => buildRouteTotalityInspectorRecord(props.totality, layout(), selection()));
  const selectedFieldResult = createMemo(() => {
    const origin = activeFieldOrigin() ?? exactRouteTotalityOriginForSource(props.totality, props.selectedSourceEvidence);
    const scope = fieldInspectorScope() ?? (origin ? { kind: "origin" as const } : null);
    return scope
      ? selectRouteTotalityFieldInspectorResult(props.totality, layout(), origin, scope, props.fieldFocus, props.consumerFocus)
      : null;
  });
  const ledgerItems = createMemo(() => buildRouteTotalityLedger(props.totality, layout()));
  const findingSummary = createMemo(() => routeTotalityFindingSummaryForSelection(
    props.totality,
    layout(),
    selection()?.target === "node" ? { kind: "node", id: selection()!.graphId } : selection()?.target === "edge" ? { kind: "edge", id: selection()!.graphId } : null,
  ));
  const startSelection = createMemo<Exclude<RouteInvestigationSelection, null> | null>(() => {
    const selectedSourceEntry = exactRouteTotalityOriginSelection(layout(), activeFieldOrigin());
    if (selectedSourceEntry) return selectedSourceEntry;
    const entry = (layout().nodes as RouteTotalityLayoutNode[]).find((node) => node.kind === "origin")
      ?? (layout().nodes as RouteTotalityLayoutNode[]).find((node) => node.kind === "occurrence")
      ?? (layout().nodes as RouteTotalityLayoutNode[]).find((node) => node.kind === "terminal");
    return entry ? routeInvestigationSelectionForNode(entry) : null;
  });
  const actions = createRouteTotalityGraphActions({
    selection,
    emphasis,
    setEmphasisMode,
    emitInvestigationState,
    markRefs,
    focusFallback: () => svg?.focus(),
    resetCamera: cameraController.reset,
  });
  const selectWithFieldFocus = (next: Exclude<RouteInvestigationSelection, null>) => {
    const willClearSelection = sameRouteInvestigationSelection(selection(), next);
    if (willClearSelection) setFieldInspectorScope(activeFieldOrigin() ? { kind: "origin" } : null);
    else setFieldInspectorScopeForSelection(next);
    actions.select(next);
  };
  const selectFromInspectorWithFieldFocus = (next: Exclude<RouteInvestigationSelection, null>) => {
    setFieldInspectorScopeForSelection(next);
    actions.selectFromInspector(next);
  };
  const clearSelectionWithFieldFocus = () => {
    if (activeFieldOrigin()) setFieldInspectorScope({ kind: "origin" });
    actions.clearSelection();
  };
  const copyLayoutDebugState = async () => {
    const current = displayLayout();
    await layoutDebug.copy({
      kind: "route-totality-layout-debug",
      settings: layoutDebug.settings(),
      steps: layoutDebug.steps(),
      route: layout().summary.route,
      camera: camera(),
      canvas: { width: round(current.width), height: round(current.height) },
      nodes: current.nodes.map((node) => ({
        id: node.id,
        label: node.node.label,
        kind: node.node.kind,
        depth: node.depth,
        degree: node.degree,
        x: round(node.x + node.radius),
        y: round(node.y + node.radius),
        radius: round(node.radius),
      })),
      edges: current.edges.map((edge) => ({
        id: edge.id,
        kind: edge.edge.kind,
        family: edge.edge.family,
        from: edge.edge.from,
        to: edge.edge.to,
        distance: round(Math.hypot(
          edge.toNode.x - edge.fromNode.x,
          edge.toNode.y - edge.fromNode.y,
        )),
      })),
    });
  };

  return <section class="route-totality-graph" aria-label="Route totality graph">
    <RouteTotalityControls
      routePath={layout().summary.route?.pathPattern ?? "Route totality"}
      routeFile={layout().summary.route?.file ?? "No route identity returned"}
      fieldOriginLabel={fieldFocus().originLabel}
      zoomScale={camera().scale}
      genericUiMode={effectiveGenericUiMode()}
      hiddenUiNodeCount={layout().uiProjection.hiddenNodeIds.size}
      availableHiddenUiNodeCount={layout().uiProjection.availableHiddenNodeCount}
      onGenericUiMode={props.onGenericUiMode}
      onClearFieldFocus={props.onClearFieldFocus}
      onZoomOut={() => cameraController.zoomAt(camera().scale / 1.25, undefined, true)}
      onReset={actions.reset}
      onZoomIn={() => cameraController.zoomAt(camera().scale * 1.25, undefined, true)}
    />
    <div class="route-totality-body">
      <div class="route-totality-debug-overlay" hidden={!layoutDebug.visible()}>
        <ComponentTopologyDebugControls
          settings={layoutDebug.settings()}
          copied={layoutDebug.copied()}
          forcesVisible={layoutDebug.forcesVisible()}
          onSetting={layoutDebug.updateSetting}
          onTick={layoutDebug.runTicks}
          onSeparate={layoutDebug.runSeparationPass}
          onToggleForces={layoutDebug.toggleForces}
          onReset={layoutDebug.reset}
          onCopy={() => void copyLayoutDebugState()}
        />
      </div>
      <RouteTotalityViewport
        totality={props.totality}
        layout={layout()}
        displayLayout={displayLayout()}
        displayBounds={displayBounds()}
        visibleDisplayNodes={visibleDisplayNodes()}
        visibleDisplayEdges={visibleDisplayEdges()}
        boundaryStubs={boundaryStubs()}
        displayLabelIds={displayLabelIds()}
        displayZoom={displayZoom()}
        camera={camera()}
        cameraController={cameraController}
        selection={selection()}
        fieldFocus={fieldFocus()}
        fieldFrontierLabels={fieldFrontierLabels()}
        emphasis={emphasis()}
        isolated={isolated()}
        forcesVisible={layoutDebug.forcesVisible()}
        onSvgRef={(element) => { svg = element; }}
        onSelect={selectWithFieldFocus}
        onContextSelect={selectWithFieldFocus}
        onRegisterMark={actions.registerMark}
        contextVisual={contextUi.visual()}
      />
      <RouteTotalityInspector
        totality={props.totality}
        shadowEvidence={props.shadowEvidence}
        summary={layout().summary}
        counts={compactCounts()}
        ledgerItems={ledgerItems()}
        startSelectionAvailable={layout().summary.status !== "unavailable" && Boolean(startSelection())}
        selected={selectedRecord}
        fieldResult={selectedFieldResult()}
        emphasis={emphasis()}
        emphasisMode={emphasisMode()}
        isolated={isolated()}
        findings={findingSummary()}
        onClear={clearSelectionWithFieldFocus}
        onSelect={selectFromInspectorWithFieldFocus}
        onEmphasize={actions.emphasize}
        onClearEmphasis={actions.clearEmphasis}
        onIsolate={actions.isolate}
        onRestore={actions.restoreFullRoute}
        onOpenSource={props.onOpenSource ?? (() => undefined)}
        onFieldFocusChange={props.onFieldFocusChange}
        onClearFieldFocus={props.onClearFieldFocus}
        onContextSelect={selectFromInspectorWithFieldFocus}
        onSelectStart={() => { const target = startSelection(); if (target) selectWithFieldFocus(target); }}
        contextUi={contextUi}
      />
    </div>
  </section>;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function hiddenComponentPolicyFingerprint(policy: HiddenComponentPolicy): string {
  return JSON.stringify({
    enabledByDefault: policy.enabledByDefault,
    include: policy.include,
    exclude: policy.exclude,
    configPath: policy.configPath,
  });
}
