import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { RouteDataDetail } from "../../../api/contracts";
import { ComponentTopologyHeader, ComponentTopologyLegend } from "./ComponentTopologyChrome";
import { ComponentTopologyDebugControls } from "./ComponentTopologyDebugControls";
import { ComponentTopologyInspector } from "./ComponentTopologyInspector";
import { componentTopologyIsolation, projectIsolatedComponentTopology, type ComponentTopologyIsolation } from "./component-topology-isolation";
import { DEFAULT_COMPONENT_TOPOLOGY_LAYOUT_SETTINGS, layoutComponentTopology, type ComponentTopologyForceVector, type ComponentTopologyLayoutSettings, type ComponentTopologyLayoutStep } from "./component-topology-layout";
import { applyManualTopologyPositions, topologyPositionChanges, topologyPositionSnapshot, type ComponentTopologyPosition } from "./component-topology-manual-layout";
import { buildComponentTopology, componentTopologySelectionFocus, projectVisibleComponentTopology, summarizeSharedComponentHubs, type ComponentTopologyEdge, type ComponentTopologyLayoutEdge, type ComponentTopologyLayoutNode } from "./component-topology-model";
import { componentTopologyDownstreamProofEdgeIds } from "./component-topology-resource-proof";
import { componentTopologySelectionCopyPayload } from "./component-topology-selection";
import { selectVisibleTopologyLabelIds, topologyLabelBudget } from "./component-topology-labels";
import { mergeTopologyRings, type ComponentTopologyRing } from "./hidden-component-projection";
import { hiddenComponentReferenceCount } from "./hidden-components-pane-model";
import { createComponentTopologyPolicy } from "./component-topology-policy";
import { buildTopologyNodeSourceTouches, buildTopologySourceLens, projectTopologySourceLens } from "./topology-source-lens";
import type { GenericUiMode } from "./trajectory-url-state";

type Camera = { x: number; y: number; scale: number };
type Drag = {
  pointerId: number;
  start: { x: number; y: number };
  startClient: { x: number; y: number };
  camera: Camera;
  nodeId: string | null;
  nodeStart: ComponentTopologyPosition | null;
  moved: boolean;
};
const DEFAULT_CAMERA: Camera = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = .25;
const MAX_SCALE = 4;
const PAN_THRESHOLD = 4;

export function ComponentTopologyGraph(props: { detail: RouteDataDetail; sourceKey: string | null; genericUiMode: GenericUiMode | null; revealResetKey: string; onSource: (key: string | null) => void; onGenericUiMode: (mode: GenericUiMode) => void; onShowPaths: () => void }) {
  const topology = createMemo(() => buildComponentTopology(props.detail));
  const policy = createComponentTopologyPolicy({ detail: () => props.detail, topology, genericUiMode: () => props.genericUiMode, revealResetKey: () => props.revealResetKey, onGenericUiMode: (mode) => props.onGenericUiMode(mode) });
  const { effectiveGenericUiMode, revealedComponentIds, hiddenProjection, allHiddenProjection, setGenericUiMode, revealComponent, hideComponentAgain } = policy;
  const sourceLens = createMemo(() => buildTopologySourceLens(props.detail, topology(), props.sourceKey));
  const projectedSourceLens = createMemo(() => projectTopologySourceLens(sourceLens(), hiddenProjection().originalToVisibleAncestorIds));
  const sharedHubs = createMemo(() => summarizeSharedComponentHubs(hiddenProjection().topology));
  const visibleTopology = createMemo(() => projectVisibleComponentTopology(hiddenProjection().topology, sharedHubs().hiddenEdgeIds));
  const [isolation, setIsolation] = createSignal<ComponentTopologyIsolation | null>(null);
  const displayedTopology = createMemo(() => projectIsolatedComponentTopology(visibleTopology(), isolation()));
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null);
  const [camera, setCamera] = createSignal(DEFAULT_CAMERA);
  const labelParticipantIds = createMemo(() => new Set([
    ...projectedSourceLens().componentIds,
    ...projectedSourceLens().handoffComponentIds,
    ...projectedSourceLens().resourceParticipantIds,
  ]));
  const layoutLabelIds = createMemo(() => selectVisibleTopologyLabelIds(displayedTopology()));
  const renderedLabelIds = createMemo(() => selectVisibleTopologyLabelIds(displayedTopology(), {
    selectedNodeId: selectedNodeId(),
    participantNodeIds: labelParticipantIds(),
    limit: topologyLabelBudget(camera().scale, displayedTopology().nodes.length),
  }));
  const [layoutSettings, setLayoutSettings] = createSignal<ComponentTopologyLayoutSettings>({ ...DEFAULT_COMPONENT_TOPOLOGY_LAYOUT_SETTINGS });
  const [layoutSteps, setLayoutSteps] = createSignal<ComponentTopologyLayoutStep[]>([]);
  const simulatedLayout = createMemo(() => layoutComponentTopology(displayedTopology(), 1200, 760, layoutSettings(), layoutSteps(), layoutLabelIds()));
  const [editingPositions, setEditingPositions] = createSignal(false);
  const [manualPositions, setManualPositions] = createSignal(new Map<string, ComponentTopologyPosition>());
  const [manualEditStart, setManualEditStart] = createSignal<Map<string, ComponentTopologyPosition> | null>(null);
  const layout = createMemo(() => applyManualTopologyPositions(simulatedLayout(), manualPositions()));
  const manualChanges = createMemo(() => topologyPositionChanges(manualEditStart(), layout(), manualPositions()));
  const visibleNodeIds = createMemo(() => new Set(displayedTopology().nodes.map((node) => node.id)));
  const displayedRingsByNode = createMemo(() => mergeTopologyRings(sharedHubs().ringsByNode, hiddenProjection().uiRingsByNode));
  const displayedHubs = createMemo(() => {
    const visible = visibleNodeIds();
    const ringEntries = [...sharedHubs().ringsByNode];
    return sharedHubs().hubs.filter((hub) => hub.kind === "context"
      ? visible.has(hub.id)
      : ringEntries.some(([nodeId, rings]) => visible.has(nodeId) && rings.some((ring) => ring.hubId === hub.id)));
  });
  const displayedSummarizedReferenceCount = createMemo(() => {
    const hubs = displayedHubs();
    const visible = visibleNodeIds();
    const ringEntries = [...sharedHubs().ringsByNode];
    return hubs.reduce((sum, hub) => {
    if (hub.kind === "context") return sum + hub.connectionCount;
    return sum + ringEntries.filter(([nodeId, rings]) => visible.has(nodeId) && rings.some((ring) => ring.hubId === hub.id)).length;
    }, 0);
  });
  const [drag, setDrag] = createSignal<Drag | null>(null);
  const [debugVisible, setDebugVisible] = createSignal(false);
  const [forcesVisible, setForcesVisible] = createSignal(false);
  const [selectionCopied, setSelectionCopied] = createSignal(false);
  const [debugCopied, setDebugCopied] = createSignal(false);
  const [viewportSize, setViewportSize] = createSignal({ width: 0, height: 0 });
  const selectedNode = createMemo(() => topology().nodes.find((node) => node.id === selectedNodeId()) ?? null);
  const selectedLayoutNode = createMemo(() => layout().nodes.find((node) => node.id === selectedNodeId()) ?? null);
  const [inspectorMode, setInspectorMode] = createSignal<"selection" | "hidden">("selection");
  const revealForInspector = (componentId: string) => { revealComponent(componentId); setInspectorMode("hidden"); };
  const hideAgainForInspector = (componentId: string) => { hideComponentAgain(componentId); setInspectorMode("hidden"); };
  const allSourceTouches = createMemo(() => projectedSourceLens().source ? [] : buildTopologyNodeSourceTouches(props.detail, topology(), selectedNodeId(), hiddenProjection().originalToVisibleAncestorIds));
  const selectedConnections = createMemo(() => {
    const id = selectedNodeId(); if (!id) return [];
    const nodeById = new Map(displayedTopology().nodes.map((node) => [node.id, node]));
    return displayedTopology().edges.flatMap((edge) => {
      if (edge.from !== id && edge.to !== id) return [];
      const outgoing = edge.from === id;
      const neighbor = nodeById.get(outgoing ? edge.to : edge.from);
      return neighbor ? [{ edge, neighbor, outgoing }] : [];
    }).sort((left, right) => left.outgoing === right.outgoing ? lexical(left.neighbor.label, right.neighbor.label) : left.outgoing ? -1 : 1);
  });
  const downstreamProofEdgeIds = createMemo(() => componentTopologyDownstreamProofEdgeIds(props.detail, visibleTopology(), selectedNodeId()));
  const selectedFocus = createMemo(() => componentTopologySelectionFocus(visibleTopology(), selectedNodeId(), downstreamProofEdgeIds()));
  const isolationCandidate = createMemo(() => componentTopologyIsolation(visibleTopology(), selectedFocus(), selectedNodeId(), projectedSourceLens()));
  const handoffNodeIds = createMemo(() => new Set([...projectedSourceLens().handoffComponentIds, ...projectedSourceLens().resourceParticipantIds]));
  const selectNode = (id: string | null) => {
    const node = topology().nodes.find((item) => item.id === id);
    if (node?.kind === "source") {
      const sourceLabel = node.label.replace(/\s+from Prisma$/i, "");
      const sources = props.detail.sources.filter((item) => item.consumerLabel === node.label || item.label === sourceLabel);
      if (sources.length === 1) {
        props.onSource(sources[0].key);
        return;
      }
    }
    setSelectedNodeId(id);
  };
  const resetSelectionForSource = (_sourceKey: string | null) => {
    setSelectedNodeId(null);
    setIsolation(null);
  };
  createEffect(() => resetSelectionForSource(sourceLens().source?.key ?? null));
  createEffect(() => {
    const visibleIds = new Set(displayedTopology().nodes.map((node) => node.id));
    const selected = selectedNodeId();
    if (selected && !visibleIds.has(selected)) {
      setSelectedNodeId(null);
      setIsolation(null);
    }
  });
  let copiedResetTimer: number | undefined;
  let debugCopiedResetTimer: number | undefined;
  const viewportScale = createMemo(() => {
    const viewport = viewportSize();
    if (!viewport.width || !viewport.height) return 1;
    return Math.min(viewport.width / layout().width, viewport.height / layout().height) || 1;
  });
  const labelRenderScale = createMemo(() => camera().scale * viewportScale());
  const toggleIsolation = () => {
    if (isolation()) {
      setIsolation(null);
    } else {
      const candidate = isolationCandidate();
      if (!candidate) return;
      setIsolation(candidate);
    }
    setCamera(DEFAULT_CAMERA);
    setDrag(null);
    setEditingPositions(false);
    setForcesVisible(false);
    setManualPositions(new Map());
    setManualEditStart(null);
  };
  const resetProjectionInteraction = () => {
    setIsolation(null);
    setCamera(DEFAULT_CAMERA);
    setDrag(null);
    setEditingPositions(false);
    setForcesVisible(false);
    setManualPositions(new Map());
    setManualEditStart(null);
    setLayoutSteps([]);
  };
  createEffect(() => {
    effectiveGenericUiMode();
    [...revealedComponentIds()].sort(lexical).join(",");
    resetProjectionInteraction();
  });
  let svg: SVGSVGElement | undefined;
  onMount(() => {
    const updateViewportSize = () => {
      const bounds = svg?.getBoundingClientRect();
      if (bounds) setViewportSize({ width: bounds.width, height: bounds.height });
    };
    updateViewportSize();
    if (typeof ResizeObserver === "undefined" || !svg) return;
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(svg);
    onCleanup(() => observer.disconnect());
  });
  onMount(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (key === "i") {
        if (!isolation() && !isolationCandidate()) return;
        event.preventDefault();
        toggleIsolation();
        return;
      }
      if (key !== "d") return;
      event.preventDefault();
      setDebugVisible((visible) => {
        if (visible) {
          setForcesVisible(false);
          setEditingPositions(false);
        }
        return !visible;
      });
    };
    document.addEventListener("keydown", handleShortcut);
    onCleanup(() => document.removeEventListener("keydown", handleShortcut));
  });
  onCleanup(() => {
    if (copiedResetTimer !== undefined) window.clearTimeout(copiedResetTimer);
    if (debugCopiedResetTimer !== undefined) window.clearTimeout(debugCopiedResetTimer);
  });
  const copySelection = async () => {
    const id = selectedNodeId();
    if (!id) return;
    const payload = componentTopologySelectionCopyPayload({
      detail: props.detail,
      topology: topology(),
      visibleTopology: displayedTopology(),
      selectedNodeId: id,
      focusedEdgeIds: selectedFocus().edgeIds,
      downstreamProofEdgeIds: downstreamProofEdgeIds(),
      recurringHiddenEdgeIds: sharedHubs().hiddenEdgeIds,
      policyHiddenEdgeIds: hiddenProjection().hiddenEdgeIds,
      selectedRings: displayedRingsByNode().get(id) ?? [],
      policyMode: effectiveGenericUiMode(),
      policyHiddenComponents: hiddenProjection().hidden.map((record) => ({ componentId: record.componentId, label: record.label, visibleParentIds: record.visibleParentIds, incomingReferenceCount: record.incomingReferenceCount })),
      policyHiddenReferenceCount: hiddenComponentReferenceCount(hiddenProjection().hidden),
      summarizedReferenceCount: displayedSummarizedReferenceCount(),
      view: `${window.location.pathname}${window.location.search}`,
    });
    if (!payload) return;
    await copyText(JSON.stringify(payload, null, 2));
    setSelectionCopied(true);
    if (copiedResetTimer !== undefined) window.clearTimeout(copiedResetTimer);
    copiedResetTimer = window.setTimeout(() => setSelectionCopied(false), 1300);
  };
  const updateLayoutSetting = (key: Exclude<keyof ComponentTopologyLayoutSettings, "separationPasses">, value: number) => {
    if (key === "simulationTicks") {
      setLayoutSteps([]);
      setLayoutSettings((settings) => ({ ...settings, simulationTicks: value, separationPasses: 0 }));
      return;
    }
    setLayoutSettings((settings) => ({ ...settings, [key]: value }));
  };
  const runLayoutTicks = (count: number) => {
    const allowed = Math.min(count, 320 - layoutSettings().simulationTicks);
    if (allowed <= 0) return;
    setLayoutSteps((steps) => [...steps, ...Array<ComponentTopologyLayoutStep>(allowed).fill("tick")]);
    setLayoutSettings((settings) => ({ ...settings, simulationTicks: settings.simulationTicks + allowed }));
  };
  const runSeparationPass = () => {
    setLayoutSteps((steps) => [...steps, "separate"]);
    setLayoutSettings((settings) => ({ ...settings, separationPasses: settings.separationPasses + 1 }));
  };
  const toggleEditingPositions = () => {
    if (editingPositions()) {
      setEditingPositions(false);
      return;
    }
    setManualEditStart(topologyPositionSnapshot(layout()));
    setEditingPositions(true);
    setForcesVisible(false);
  };
  const resetLayoutDebug = () => {
    setLayoutSteps([]);
    setLayoutSettings({ ...DEFAULT_COMPONENT_TOPOLOGY_LAYOUT_SETTINGS });
    setEditingPositions(false);
    setManualPositions(new Map());
    setManualEditStart(null);
  };
  const copyLayoutDebugState = async () => {
    const currentLayout = layout();
    const payload = {
      kind: "component-topology-layout-debug",
      settings: layoutSettings(),
      steps: layoutSteps(),
      manualPositions: {
        editing: editingPositions(),
        movedNodeCount: manualChanges().length,
        changes: manualChanges().map((change) => ({
          ...change,
          before: { x: round(change.before.x), y: round(change.before.y) },
          after: { x: round(change.after.x), y: round(change.after.y) },
          dx: round(change.dx),
          dy: round(change.dy),
          distance: round(change.distance),
        })),
      },
      camera: camera(),
      viewport: viewportSize(),
      projection: {
        genericUiMode: effectiveGenericUiMode(),
        policyHiddenNodeIds: [...hiddenProjection().hiddenNodeIds].sort(lexical),
        policyHiddenEdgeIds: [...hiddenProjection().hiddenEdgeIds].sort(lexical),
        policyHiddenComponentCount: hiddenProjection().hidden.length,
        policyHiddenReferenceCount: hiddenComponentReferenceCount(hiddenProjection().hidden),
        policyRingCount: hiddenProjection().uiRingsByNode.size,
        recurringHiddenEdgeCount: sharedHubs().hiddenEdgeIds.size,
      },
      canvas: { width: round(currentLayout.width), height: round(currentLayout.height) },
      nodes: currentLayout.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
        terminal: node.terminal,
        depth: node.depth,
        x: round(node.x),
        y: round(node.y),
        radius: round(node.radius),
        incomingCount: node.incomingCount,
        outgoingCount: node.outgoingCount,
      })),
      edges: currentLayout.edges.map((edge) => {
        const dx = edge.toNode.x - edge.fromNode.x;
        const dy = edge.toNode.y - edge.fromNode.y;
        return {
          id: edge.id,
          kind: edge.kind,
          from: edge.from,
          to: edge.to,
          distance: round(Math.hypot(dx, dy)),
          angleDegrees: round(Math.atan2(-dy, dx) * 180 / Math.PI),
        };
      }),
    };
    await copyText(JSON.stringify(payload, null, 2));
    setDebugCopied(true);
    if (debugCopiedResetTimer !== undefined) window.clearTimeout(debugCopiedResetTimer);
    debugCopiedResetTimer = window.setTimeout(() => setDebugCopied(false), 1300);
  };
  const resetCamera = () => setCamera(DEFAULT_CAMERA);
  const zoomAt = (nextScale: number, anchor = { x: layout().width / 2, y: layout().height / 2 }) => {
    const current = camera();
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const worldX = (anchor.x - current.x) / current.scale;
    const worldY = (anchor.y - current.y) / current.scale;
    setCamera({ x: anchor.x - worldX * scale, y: anchor.y - worldY * scale, scale });
  };
  const pointerPoint = (event: PointerEvent | WheelEvent) => svgPoint(event, svg, layout().width, layout().height);
  const startDrag = (event: PointerEvent, nodeId: string | null = null) => {
    if (event.button !== 0) return;
    const node = nodeId ? layout().nodes.find((item) => item.id === nodeId) : null;
    svg?.setPointerCapture?.(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      start: pointerPoint(event),
      startClient: { x: event.clientX, y: event.clientY },
      camera: { ...camera() },
      nodeId,
      nodeStart: node ? { x: node.x, y: node.y } : null,
      moved: false,
    });
  };
  const onPointerMove = (event: PointerEvent) => {
    const active = drag(); if (!active || active.pointerId !== event.pointerId) return;
    const moved = active.moved || pointerMoved(active.startClient, event, PAN_THRESHOLD);
    if (!moved) return;
    if (!active.moved) setDrag({ ...active, moved: true });
    const point = pointerPoint(event);
    if (editingPositions() && active.nodeId && active.nodeStart) {
      const next = {
        x: clamp(active.nodeStart.x + (point.x - active.start.x) / active.camera.scale, 24, layout().width - 24),
        y: clamp(active.nodeStart.y + (point.y - active.start.y) / active.camera.scale, 24, layout().height - 24),
      };
      setManualPositions((positions) => {
        const updated = new Map(positions);
        updated.set(active.nodeId!, next);
        return updated;
      });
      return;
    }
    setCamera({ ...active.camera, x: active.camera.x + point.x - active.start.x, y: active.camera.y + point.y - active.start.y });
  };
  const finishDrag = (event: PointerEvent, selectDeadClick = true) => {
    const active = drag(); if (!active || active.pointerId !== event.pointerId) return;
    const moved = active.moved || pointerMoved(active.startClient, event, PAN_THRESHOLD);
    if (svg?.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    setDrag(null);
    if (selectDeadClick && !moved) selectNode(active.nodeId);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const normalizedDelta = clamp(event.deltaY, -100, 100);
    zoomAt(camera().scale * Math.exp(-normalizedDelta * .00065), pointerPoint(event));
  };
  return <section class="component-topology" aria-label="Route component topology">
    <ComponentTopologyHeader lens={projectedSourceLens()} summarizedReferenceCount={displayedSummarizedReferenceCount()} genericUiMode={effectiveGenericUiMode()} hiddenComponentCount={hiddenProjection().hidden.length} hiddenReferenceCount={hiddenComponentReferenceCount(hiddenProjection().hidden)} configuredComponentCount={allHiddenProjection().hidden.length} configuredReferenceCount={hiddenComponentReferenceCount(allHiddenProjection().hidden)} uiRingCount={hiddenProjection().uiRingsByNode.size} scale={camera().scale} isolated={Boolean(isolation())} isolationNodeCount={isolation()?.nodeIds.size ?? isolationCandidate()?.nodeIds.size ?? 0} isolationAvailable={Boolean(isolationCandidate())} onShowPaths={props.onShowPaths} onGenericUiMode={setGenericUiMode} onToggleIsolation={toggleIsolation} onZoomOut={() => zoomAt(camera().scale / 1.25)} onResetCamera={resetCamera} onZoomIn={() => zoomAt(camera().scale * 1.25)} />
    <div class="component-topology-viewport">
      <button type="button" class="component-topology-source-clear" hidden={!sourceLens().source} title="Clear the selected data source filter" onClick={() => props.onSource(null)}>
        <code>{sourceLens().source?.label ?? "Source"}</code>
        <small>{sourceLens().source?.consumerLabel ? `via ${sourceLens().source!.consumerLabel} · Click to clear` : "Click to clear"}</small>
      </button>
      <div class="component-topology-debug-overlay" hidden={!debugVisible()}>
        <ComponentTopologyDebugControls
          settings={layoutSettings()}
          copied={debugCopied()}
          forcesVisible={forcesVisible()}
          editingPositions={editingPositions()}
          manualMoveCount={manualChanges().length}
          onSetting={updateLayoutSetting}
          onTick={runLayoutTicks}
          onSeparate={runSeparationPass}
          onToggleForces={() => setForcesVisible((visible) => !visible)}
          onToggleEditing={toggleEditingPositions}
          onReset={resetLayoutDebug}
          onCopy={() => void copyLayoutDebugState()}
        />
      </div>
      <ComponentTopologyLegend hubs={isolation() ? [] : displayedHubs()} uiPolicyEnabled={effectiveGenericUiMode() === "hidden"} uiRingCount={isolation() ? 0 : hiddenProjection().uiRingsByNode.size} hiddenComponentCount={hiddenProjection().hidden.length} hiddenReferenceCount={hiddenComponentReferenceCount(hiddenProjection().hidden)} />
      <svg ref={svg} class="component-topology-svg" classList={{ dragging: Boolean(drag()), editing: editingPositions(), isolated: Boolean(isolation()) }} viewBox={`0 0 ${layout().width} ${layout().height}`} role="img" aria-label={`${displayedTopology().totals.components} connected route-scoped components and ${displayedTopology().edges.length} visible directional connections${isolation() ? ", isolated to the current focus" : ""}`} preserveAspectRatio="xMidYMid meet"
        onPointerDown={(event) => startDrag(event)} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={(event) => finishDrag(event, false)} onWheel={onWheel}>
        <defs>
          <marker id="component-topology-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 z" /></marker>
          <marker id="component-topology-force-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 5 2.5 L 0 5 z" /></marker>
        </defs>
        <g class="component-topology-camera-layer" transform={`translate(${camera().x} ${camera().y}) scale(${camera().scale})`}>
          <g class="component-topology-edges"><For each={layout().edges.filter((edge) => !sharedHubs().hiddenEdgeIds.has(edge.id))}>{(edge) => {
            const active = () => !selectedNodeId() || selectedFocus().edgeIds.has(edge.id);
            const sourceActive = () => projectedSourceLens().componentIds.has(edge.from) && projectedSourceLens().componentIds.has(edge.to);
            const handoffActive = () => {
              if (sourceActive()) return false;
              return handoffNodeIds().has(edge.from) && handoffNodeIds().has(edge.to);
            };
            const sourceSelection = () => Boolean(projectedSourceLens().pathCount || projectedSourceLens().handoffPathCount || projectedSourceLens().resources.length);
            return <path classList={{ inferred: edge.confidence === "inferred", [`kind-${edge.kind}`]: true, focused: Boolean(selectedNodeId()) && active(), dimmed: !isolation() && !active(), "source-focused": sourceActive(), "source-resource-focused": handoffActive(), "source-dimmed": !isolation() && sourceSelection() && !sourceActive() && !handoffActive() }} d={edgePath(edge)} marker-end="url(#component-topology-arrow)"><title>{edgeLabel(edge)}</title></path>;
          }}</For></g>
          <g class="component-topology-nodes"><Index each={layout().nodes}>{(node) => {
            const current = () => node();
            const hub = () => sharedHubs().hubById.get(current().id);
            const rings = () => isolation() ? [] : displayedRingsByNode().get(current().id) ?? [];
            const transforms = () => projectedSourceLens().transformsByNodeId.get(current().id) ?? [];
            const fields = () => projectedSourceLens().fieldsByNodeId.get(current().id) ?? [];
            const sourceParticipant = () => projectedSourceLens().componentIds.has(current().id);
            const handoffParticipant = () => projectedSourceLens().handoffComponentIds.has(current().id);
            const resourceParticipant = () => projectedSourceLens().resourceParticipantIds.has(current().id);
            const sourceSelection = () => Boolean(projectedSourceLens().pathCount || projectedSourceLens().handoffPathCount || projectedSourceLens().resources.length);
            return <g class={`component-topology-node kind-${current().kind}`} classList={{ "route-entry": current().routeEntry, terminal: current().terminal, hub: isHub(current()), "shared-hub": Boolean(hub()) && !isolation(), selected: selectedNodeId() === current().id, dimmed: !isolation() && Boolean(selectedNodeId()) && !selectedFocus().nodeIds.has(current().id), "source-path": sourceParticipant(), "source-resource-participation": resourceParticipant() || handoffParticipant(), "source-transform-touch": Boolean(transforms().length), "source-dimmed": !isolation() && sourceSelection() && !sourceParticipant() && !handoffParticipant() && !resourceParticipant() }} style={hub() && !isolation() ? { "--topology-hub-color": hub()!.color, "--topology-hub-fill": hub()!.fill } : undefined} transform={`translate(${current().x} ${current().y})`} data-node-id={current().id} role="button" tabindex="0" aria-label={`${current().kind === "source" ? "Filter by" : "Inspect"} ${current().label}${resourceParticipant() ? ", proven resource participation" : ""}${handoffParticipant() ? ", consumer-level handoff participation" : ""}${fields().length ? `, source fields ${fields().map((field) => field.label).join(", ")}` : ""}${transforms().length ? `, ${transforms().length} transforms` : ""}`} onPointerDown={(event) => { event.stopPropagation(); if (current().kind === "source" && !editingPositions()) selectNode(current().id); else startDrag(event, current().id); }} onPointerUp={(event) => { event.stopPropagation(); finishDrag(event); }} on:click={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectNode(current().id); } }}>
            <For each={rings()}>{(ring, index) => <circle class="component-topology-hub-ring" r={current().radius + 2.2 + index() * 1.6} style={{ stroke: ring.color }}><title>{ringTitle(ring)}</title></circle>}</For>
            <Show when={transforms().length}><circle class="component-topology-transform-ring" r={current().radius + 4.5}><title>{transforms().length} retained transforms</title></circle></Show>
            <Show when={current().terminal} fallback={<Show when={current().kind === "context"} fallback={<circle class="component-topology-node-mark" r={current().radius} />}><rect class="component-topology-node-mark" x={-current().radius} y={-current().radius} width={current().radius * 2} height={current().radius * 2} rx="2" transform="rotate(45)" /></Show>}><rect class="component-topology-node-mark" x={-current().radius} y={-current().radius} width={current().radius * 2} height={current().radius * 2} rx="1" /></Show>
            <Show when={renderedLabelIds().has(current().id)}>{(() => {
              const placement = labelPlacement(current());
              return <><text x={placement.x * labelRenderScale()} y={placement.y * labelRenderScale()} text-anchor={placement.anchor} transform={`scale(${1 / labelRenderScale()})`}>{clip(current().label, 24)}</text><Show when={fields().length}><text class="component-topology-field-label" x={placement.x * labelRenderScale()} y={(placement.y + 13) * labelRenderScale()} text-anchor={placement.anchor} transform={`scale(${1 / labelRenderScale()})`}>{fieldLabel(fields().map((field) => field.label))}</text></Show><Show when={transforms().length}><text class="component-topology-transform-label" x={placement.x * labelRenderScale()} y={(placement.y + (fields().length ? 26 : 13)) * labelRenderScale()} text-anchor={placement.anchor} transform={`scale(${1 / labelRenderScale()})`}>{transforms().length} {transforms().length === 1 ? "transform" : "transforms"}</text></Show></>;
            })()}</Show>
            <title>{nodeTitle(current())}</title>
          </g>;
          }}</Index></g>
          <g class="component-topology-forces" classList={{ visible: forcesVisible() }} aria-hidden={!forcesVisible()}><For each={layout().forces.filter((force) => force.magnitude > .01)}>{(force) => {
            const line = forceVectorLine(force);
            return <line data-node-id={force.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} marker-end="url(#component-topology-force-arrow)">
              <title>Next tick: Δx {round(force.dx)}, Δy {round(force.dy)}, magnitude {round(force.magnitude)}</title>
            </line>;
          }}</For></g>
        </g>
      </svg>
      <ComponentTopologyInspector lens={projectedSourceLens()} selectedNode={selectedNode()} selectedLayoutNode={selectedLayoutNode()} allSourceTouches={allSourceTouches()} connections={selectedConnections()} selectionCopied={selectionCopied()} policy={props.detail.hiddenComponentPolicy} topology={topology()} hiddenProjection={hiddenProjection()} allHiddenProjection={allHiddenProjection()} genericUiMode={effectiveGenericUiMode()} revealedComponentIds={revealedComponentIds()} inspectorMode={inspectorMode()} onSelect={selectNode} onSource={props.onSource} onCopy={() => void copySelection()} onInspectorMode={setInspectorMode} onReveal={revealForInspector} onHideAgain={hideAgainForInspector} onShowAll={() => setGenericUiMode("all")} />
    </div>
  </section>;
}

function edgePath(edge: ComponentTopologyLayoutEdge) {
  const dx = edge.toNode.x - edge.fromNode.x; const dy = edge.toNode.y - edge.fromNode.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const startX = edge.fromNode.x + dx / distance * (edge.fromNode.radius + 1);
  const startY = edge.fromNode.y + dy / distance * (edge.fromNode.radius + 1);
  const endX = edge.toNode.x - dx / distance * (edge.toNode.radius + 7);
  const endY = edge.toNode.y - dy / distance * (edge.toNode.radius + 7);
  const curve = Math.min(36, distance * .12);
  const normalX = -dy / distance * curve; const normalY = dx / distance * curve;
  const middleX = (startX + endX) / 2 + normalX; const middleY = (startY + endY) / 2 + normalY;
  return `M ${startX} ${startY} Q ${middleX} ${middleY} ${endX} ${endY}`;
}

function forceVectorLine(force: ComponentTopologyForceVector) {
  return {
    x1: force.x,
    y1: force.y,
    x2: force.x + force.dx,
    y2: force.y + force.dy,
  };
}

function isHub(node: ComponentTopologyLayoutNode) { return node.incomingCount >= 3 || node.outgoingCount >= 4; }
function labelPlacement(node: ComponentTopologyLayoutNode): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  return { x: node.radius + 5, y: 3, anchor: "start" };
}
function clip(value: string, limit: number) { return value.length > limit ? `${value.slice(0, limit - 1)}…` : value; }
function fieldLabel(fields: string[]) {
  const visible = fields.slice(0, 3);
  return `${visible.join(" · ")}${fields.length > visible.length ? ` · +${fields.length - visible.length}` : ""}`;
}
function viaLabel(edge: Pick<ComponentTopologyEdge, "via">) { return edge.via?.length ? ` via ${edge.via.join(" → ")}` : ""; }
function edgeLabel(edge: ComponentTopologyEdge) { return `${edge.kind}${viaLabel(edge)} · ${edge.confidence}${edge.count > 1 ? ` · ${edge.count} retained paths` : ""}`; }
function ringTitle(ring: ComponentTopologyRing) {
  return "category" in ring
    ? `Generic UI hidden by components/ui convention\n${ring.hiddenComponentIds.length} components · ${ring.hiddenReferenceCount} references\nOpen Hidden pane to review or reveal`
    : `Connects to shared hub ${ring.label}`;
}
function nodeTitle(node: ComponentTopologyLayoutNode) {
  const location = node.file ? `${node.file}${node.line ? `:${node.line}` : ""}` : "location unavailable";
  return `${node.label} · ${node.terminal ? "leaf in component view" : node.kind}\n${node.incomingCount} incoming · ${node.outgoingCount} outgoing\n${location}`;
}
function kindLabel(kind: ComponentTopologyLayoutNode["kind"]) { return kind === "source" ? "Data source / handler" : kind === "boundary" ? "Resource loader" : kind === "context" ? "Context" : "Component"; }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function svgPoint(event: PointerEvent | WheelEvent, svg: SVGSVGElement | undefined, viewWidth: number, viewHeight: number) {
  if (!svg) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight) || 1;
  const offsetX = (rect.width - viewWidth * scale) / 2;
  const offsetY = (rect.height - viewHeight * scale) / 2;
  return { x: (event.clientX - rect.left - offsetX) / scale, y: (event.clientY - rect.top - offsetY) / scale };
}
function pointerMoved(start: { x: number; y: number }, event: PointerEvent, threshold: number) {
  return Math.hypot(event.clientX - start.x, event.clientY - start.y) > threshold;
}
function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
function round(value: number) { return Math.round(value * 1000) / 1000; }
async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* use the local fallback */ }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy command was rejected");
  } finally {
    textarea.remove();
  }
}
