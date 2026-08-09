import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import type { RouteTotality } from "../../../api/contracts";
import type { HiddenComponentPolicy } from "../../../api/hidden-component-policy";
import { layoutRouteTotality, routeTotalityPayloadIdentity, type RouteTotalityLayout, type RouteTotalityLayoutNode } from "./route-totality-model";
import { routeInvestigationSelectionForNode, type RouteInvestigationSelection } from "./route-investigation-selection";
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
import { emphasisModeForSelection, persistedSelection, reconcileRouteTotalityState, selectionFromPersisted, buildRouteTotalityLedger, renderableRouteTotalityAnnotations, routeTotalityDisplayBounds, type RouteTotalityInvestigationStateChange } from "./route-totality-graph-state";
import { RouteTotalityViewport } from "./RouteTotalityViewport";
import { createRouteTotalityGraphActions } from "./route-totality-graph-actions";
import { fieldOriginFocusForOrigin, selectRouteTotalityFieldInspectorResult, type RouteTotalityFieldOriginFocus } from "./route-totality-field-lineage-model";
import { DEFAULT_ROUTE_TOTALITY_SURFACE_LAYOUT_SETTINGS } from "./route-totality-surface-layout";
import { createTopologyLayoutDebug } from "./topology-layout-debug";
import { createRouteContextContinuityUiState } from "./route-context-continuity-state";

const COMPACT_COUNT_KEYS = ["origins", "occurrences", "boundaries", "terminals", "evidenceRelations", "evidenceGaps"] as const;

type RouteTotalityGraphProps = {
  totality: RouteTotality | null;
  generation: number;
  scopeKey?: string;
  selection?: TrajectoryTotalitySelection | null;
  camera?: TrajectoryGraphCamera | null;
  isolated?: boolean;
  contextFocus?: string | null;
  onContextFocusChange?: (contextFocus: string | null) => void;
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
  const [showEvidenceDetail, setShowEvidenceDetail] = createSignal(false);
  const [emphasisMode, setEmphasisMode] = createSignal<RouteTotalityEmphasisMode | null>(untrack(() => emphasisModeForSelection(initialSelection)));
  const [isolated, setIsolated] = createSignal(untrack(() => Boolean(props.isolated && emphasisModeForSelection(initialSelection) !== null)));
  const markRefs = new Map<string, SVGGElement>();
  let svg: SVGSVGElement | undefined;
  let previousIdentity = "";
  let previousScopeKey: string | null | undefined;
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
  const cameraController = createRouteTotalityCamera({
    initialCamera: untrack(() => props.camera ? { ...props.camera } : null),
    getViewportSize: () => displayBounds(),
    getSvg: () => svg,
    onCommit: (nextCamera) => emitInvestigationState(selection(), isolated(), nextCamera),
    onTap: () => {
      setEmphasisMode(null);
      emitInvestigationState(null, false);
    },
  });
  const camera = cameraController.camera;

  createEffect(() => {
    const identity = JSON.stringify([
      routeTotalityPayloadIdentity(props.totality, props.generation),
      effectiveGenericUiMode(),
    ]);
    const initialPayload = previousIdentity === "";
    const scopeKey = props.scopeKey ?? props.totality?.route.key ?? null;
    const scopeChanged = !initialPayload && scopeKey !== previousScopeKey;
    if (identity === previousIdentity && scopeKey === previousScopeKey) return;
    previousIdentity = identity;
    previousScopeKey = scopeKey;
    skipControlledSync = false;
    skipControlledCameraSync = false;
    setShowEvidenceDetail(false);
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
    setActiveFieldOrigin(initialPayload
      ? fieldOriginFocusForSelection(props.totality, reconciliation.selection)
      : null);

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
    if (reconciliation.selection?.target === "node") {
      const focus = fieldOriginFocusForSelection(props.totality, reconciliation.selection);
      if (reconciliation.selection.kind === "origin") setActiveFieldOrigin(focus);
    }
    if (reconciliation.needsCorrection) {
      skipControlledSync = props.selection !== undefined || props.isolated !== undefined;
      emitInvestigationState(reconciliation.selection, reconciliation.isolated);
    }
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
  const evidenceVisible = createMemo(() => {
    const current = selection();
    return showEvidenceDetail()
      || current?.kind === "evidence-element"
      || (current?.target === "edge" && current.source === "evidence-slice");
  });
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
  const visibleDisplayNodes = createMemo(() => evidenceVisible()
    ? [...displayLayout().nodes, ...displayLayout().evidenceNodes]
    : [...displayLayout().nodes]);
  const visibleDisplayEdges = createMemo(() => evidenceVisible()
    ? [...displayLayout().edges, ...displayLayout().evidenceEdges]
    : [...displayLayout().edges]);
  const displayLabelIds = createMemo(() => selectRouteTotalityDisplayLabelIds(
    visibleDisplayNodes(),
    {
      cameraScale: camera().scale,
      includeEvidence: evidenceVisible(),
      selectedNodeIds: selection()?.target === "node" ? new Set([selection()!.graphId]) : new Set(),
      focusedNodeIds: new Set([...emphasis().focusNodeIds, ...emphasis().frontierNodeIds]),
      participantNodeIds: new Set([...emphasis().activeNodeIds, ...emphasis().frontierNodeIds]),
    },
  ));
  const baseDisplayBounds = createMemo(() => routeTotalityDisplayBounds(
    displayLayout(),
    evidenceVisible(),
    renderableRouteTotalityAnnotations(displayLayout(), evidenceVisible()),
  ));
  const boundaryStubLayout = createMemo<RouteTotalityLayout>(() => {
    const displayNodes = [...displayLayout().nodes, ...displayLayout().evidenceNodes].map((displayNode) => ({
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
    evidenceVisible(),
    renderableRouteTotalityAnnotations(displayLayout(), evidenceVisible()),
    boundaryStubs(),
  ));
  const displayAnnotations = createMemo(() => renderableRouteTotalityAnnotations(displayLayout(), evidenceVisible()));
  const selectedRecord = createMemo(() => buildRouteTotalityInspectorRecord(props.totality, layout(), selection()));
  const selectedFieldResult = createMemo(() => {
    const record = selectedRecord();
    return record?.kind === "occurrence"
      ? selectRouteTotalityFieldInspectorResult(props.totality, activeFieldOrigin(), record.selection.recordId)
      : null;
  });
  const ledgerItems = createMemo(() => buildRouteTotalityLedger(props.totality, layout()));
  const findingSummary = createMemo(() => routeTotalityFindingSummaryForSelection(
    props.totality,
    layout(),
    selection()?.target === "node" ? { kind: "node", id: selection()!.graphId } : selection()?.target === "edge" ? { kind: "edge", id: selection()!.graphId } : null,
  ));
  const startSelection = createMemo<Exclude<RouteInvestigationSelection, null> | null>(() => {
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
    const focus = fieldOriginFocusForSelection(props.totality, next);
    if (next.target === "node" && next.kind === "origin") setActiveFieldOrigin(focus);
    actions.select(next);
  };
  const selectFromInspectorWithFieldFocus = (next: Exclude<RouteInvestigationSelection, null>) => {
    const focus = fieldOriginFocusForSelection(props.totality, next);
    if (next.target === "node" && next.kind === "origin") setActiveFieldOrigin(focus);
    actions.selectFromInspector(next);
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
      zoomScale={camera().scale}
      genericUiMode={effectiveGenericUiMode()}
      hiddenUiNodeCount={layout().uiProjection.hiddenNodeIds.size}
      availableHiddenUiNodeCount={layout().uiProjection.availableHiddenNodeCount}
      onGenericUiMode={props.onGenericUiMode}
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
        displayAnnotations={displayAnnotations()}
        boundaryStubs={boundaryStubs()}
        displayLabelIds={displayLabelIds()}
        displayZoom={displayZoom()}
        camera={camera()}
        cameraController={cameraController}
        evidenceVisible={evidenceVisible()}
        selection={selection()}
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
        summary={layout().summary}
        counts={compactCounts()}
        evidenceVisible={evidenceVisible()}
        evidenceDetailEnabled={showEvidenceDetail()}
        evidenceNodeCount={displayModel().counts.evidenceNodeCount}
        ledgerItems={ledgerItems()}
        startSelectionAvailable={layout().summary.status !== "unavailable" && Boolean(startSelection())}
        selected={selectedRecord}
        fieldResult={selectedFieldResult()}
        emphasis={emphasis()}
        emphasisMode={emphasisMode()}
        isolated={isolated()}
        findings={findingSummary()}
        onClear={actions.clearSelection}
        onSelect={selectFromInspectorWithFieldFocus}
        onEmphasize={actions.emphasize}
        onClearEmphasis={actions.clearEmphasis}
        onIsolate={actions.isolate}
        onRestore={actions.restoreFullRoute}
        onOpenSource={props.onOpenSource ?? (() => undefined)}
        onContextSelect={selectFromInspectorWithFieldFocus}
        onSelectStart={() => { const target = startSelection(); if (target) selectWithFieldFocus(target); }}
        onToggleEvidence={() => setShowEvidenceDetail((value) => !value)}
        contextUi={contextUi}
      />
    </div>
  </section>;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fieldOriginFocusForSelection(
  totality: RouteTotality | null,
  selection: RouteInvestigationSelection,
): RouteTotalityFieldOriginFocus | null {
  if (!selection || selection.target !== "node" || selection.kind !== "origin") return null;
  return fieldOriginFocusForOrigin(totality, selection.recordId, selection.originRole);
}
