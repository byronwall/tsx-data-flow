import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { RouteTotalityDisplayLayoutEdge, RouteTotalityDisplayLayoutNode, RouteTotalityDisplayLayout } from "./route-totality-display-layout";
import type { RouteTotalityLayout } from "./route-totality-model";
import type { RouteInvestigationSelection } from "./route-investigation-selection";
import type { RouteTotalityEmphasis } from "./route-totality-emphasis";
import type { RouteTotalityBoundaryStub } from "./route-totality-boundary-stubs";
import type { RouteTotalityDisplayZoom } from "./route-totality-display-labels";
import type { TrajectoryGraphCamera } from "./trajectory-url-state";
import type { RouteTotalityCameraController } from "./route-totality-camera";
import {
  DisplayBoundaryStubMark,
  DisplayTotalityBridgeEdge,
  DisplayTotalityEdge,
  DisplayTotalityNode,
} from "./RouteTotalityDisplayMarks";
import {
  routeInvestigationSelectionForEdge,
  routeInvestigationSelectionForNode,
  sameRouteInvestigationSelection,
} from "./route-investigation-selection";
import { routeTotalityFindingSummaryForNode } from "./route-totality-finding-model";
import type { RouteTotality } from "../../../api/contracts";
import type { RouteContextContinuityVisual } from "./route-context-continuity-state";
import { RouteContextContinuityOverlay } from "./RouteContextContinuityOverlay";
import type { RouteTotalityFieldFocusModel } from "./route-totality-field-lineage-model";

export type RouteTotalityViewportProps = {
  totality: RouteTotality | null;
  layout: RouteTotalityLayout;
  displayLayout: RouteTotalityDisplayLayout;
  displayBounds: { width: number; height: number };
  visibleDisplayNodes: readonly RouteTotalityDisplayLayoutNode[];
  visibleDisplayEdges: readonly RouteTotalityDisplayLayoutEdge[];
  boundaryStubs: readonly RouteTotalityBoundaryStub[];
  displayLabelIds: ReadonlySet<string>;
  displayZoom: RouteTotalityDisplayZoom;
  camera: TrajectoryGraphCamera;
  cameraController: Pick<RouteTotalityCameraController, "dragging" | "startPan" | "movePan" | "finishPan" | "cancelPan" | "consumeSuppressedClick" | "clearEmptySelection" | "zoomFromWheel">;
  selection: RouteInvestigationSelection;
  fieldFocus: RouteTotalityFieldFocusModel;
  fieldFrontierLabels: ReadonlyMap<string, string>;
  emphasis: RouteTotalityEmphasis;
  isolated: boolean;
  forcesVisible: boolean;
  onSvgRef: (element: SVGSVGElement) => void;
  onSelect: (selection: Exclude<RouteInvestigationSelection, null>) => void;
  onContextSelect: (selection: Exclude<RouteInvestigationSelection, null>) => void;
  onRegisterMark: (selectionId: string, element: SVGGElement) => void;
  contextVisual: RouteContextContinuityVisual;
};

export function RouteTotalityViewport(props: RouteTotalityViewportProps) {
  let svg: SVGSVGElement | undefined;
  const [viewportSize, setViewportSize] = createSignal({ width: 0, height: 0 });
  const viewportScale = createMemo(() => {
    const viewport = viewportSize();
    if (!viewport.width || !viewport.height) return 1;
    return Math.min(viewport.width / props.displayBounds.width, viewport.height / props.displayBounds.height) || 1;
  });
  const labelRenderScale = createMemo(() => Math.max(.001, props.camera.scale * viewportScale()));
  onMount(() => {
    const suppressDraggedClick = (event: MouseEvent) => {
      const suppressed = props.cameraController.consumeSuppressedClick(event);
      if (suppressed) event.stopPropagation();
    };
    svg?.addEventListener("click", suppressDraggedClick, true);
    onCleanup(() => svg?.removeEventListener("click", suppressDraggedClick, true));
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
  return <div class="route-totality-viewport">
    <svg
      ref={(element) => { svg = element; props.onSvgRef(element); }}
      classList={{ dragging: props.cameraController.dragging() }}
      class="route-totality-svg"
      viewBox={`0 0 ${props.displayBounds.width} ${props.displayBounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      tabindex="0"
      aria-label={`${props.visibleDisplayNodes.length} visible route totality marks in the route backbone`}
      onPointerDown={(event) => props.cameraController.startPan(event)}
      onPointerMove={(event) => props.cameraController.movePan(event)}
      onPointerUp={(event) => props.cameraController.finishPan(event)}
      onPointerCancel={(event) => props.cameraController.finishPan(event)}
      onLostPointerCapture={() => props.cameraController.cancelPan()}
      onClick={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        const mark = target?.closest("[data-route-selection]");
        const hiddenMark = target?.closest(".interaction-hidden, .isolation-hidden");
        if (!mark || hiddenMark) props.cameraController.clearEmptySelection();
      }}
      onWheel={(event) => props.cameraController.zoomFromWheel(event)}
    >
      <defs>
        <marker id="route-totality-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 z" /></marker>
        <marker id="route-totality-force-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 5 2.5 L 0 5 z" /></marker>
      </defs>
      <g transform={`translate(${props.camera.x} ${props.camera.y}) scale(${props.camera.scale})`}>
        <Show when={props.displayLayout.nodes.length}><text class="route-totality-lane-label" x="20" y="22">ROUTE OCCURRENCE SURFACE</text></Show>
        <g class="route-totality-edges"><For each={props.visibleDisplayEdges}>{(displayEdge) => {
          const edge = displayEdge.edge;
          const target = routeInvestigationSelectionForEdge(edge);
          const withinFocus = props.emphasis.focusNodeIds.has(edge.from) && props.emphasis.focusNodeIds.has(edge.to);
          return <DisplayTotalityEdge edge={displayEdge} selection={target} selected={sameRouteInvestigationSelection(props.selection, target)} emphasisActive={props.emphasis.active} active={props.emphasis.activeLayoutEdgeIds.has(edge.id)} secondary={props.emphasis.secondaryLayoutEdgeIds.has(edge.id)} frontier={props.emphasis.frontierLayoutEdgeIds.has(edge.id)} fieldFocused={Boolean(props.fieldFocus.origin)} fieldActive={props.fieldFocus.activeEdgeIds.has(edge.id)} fieldFrontier={props.fieldFocus.frontierEdgeIds.has(edge.id)} fieldFrontierLabel={props.fieldFrontierLabels.get(edge.id) ?? null} hidden={props.isolated && !props.emphasis.focusEdgeIds.has(edge.id) && !withinFocus} onSelect={props.onSelect} onRegister={(element) => props.onRegisterMark(target.graphId, element)} />;
        }}</For></g>
        <g class="route-totality-bridge-edges" aria-label="Cross-layer handoffs"><For each={props.displayLayout.bridges}>{(bridge) => <DisplayTotalityBridgeEdge bridge={bridge} emphasisActive={props.emphasis.active} visible={Boolean(bridge.fromNode && bridge.toNode) && (props.emphasis.active || Boolean(props.fieldFocus.origin))} active={props.emphasis.activeBridgeIds.has(bridge.bridge.bridge.id)} frontier={props.emphasis.frontierBridgeIds.has(bridge.bridge.bridge.id)} fieldFocused={Boolean(props.fieldFocus.origin)} fieldActive={props.fieldFocus.activeBridgeIds.has(bridge.bridge.bridge.id)} fieldFrontier={props.emphasis.frontierBridgeIds.has(bridge.bridge.bridge.id)} hidden={props.isolated && (!bridge.fromNode || !bridge.toNode || !props.emphasis.focusNodeIds.has(bridge.fromNode.id) || !props.emphasis.focusNodeIds.has(bridge.toNode.id))} />}</For></g>
        <RouteContextContinuityOverlay
          visual={props.contextVisual}
          emphasis={props.emphasis}
          isolated={props.isolated}
          selection={props.selection}
          onSelect={props.onContextSelect}
        />
        <g class="route-totality-boundary-stubs" aria-label="Isolation boundary stubs"><For each={props.boundaryStubs}>{(stub) => <DisplayBoundaryStubMark stub={stub} />}</For></g>
        <g class="route-totality-nodes"><For each={props.visibleDisplayNodes}>{(displayNode) => {
          const node = displayNode.node;
          const target = routeInvestigationSelectionForNode(node);
          return <DisplayTotalityNode node={displayNode} selection={target} selected={sameRouteInvestigationSelection(props.selection, target)} emphasisActive={props.emphasis.active} active={props.emphasis.activeNodeIds.has(node.id)} secondary={props.emphasis.secondaryNodeIds.has(node.id)} frontier={props.emphasis.frontierNodeIds.has(node.id)} fieldFocused={Boolean(props.fieldFocus.origin)} fieldActive={props.fieldFocus.activeNodeIds.has(node.id)} fieldFrontier={props.fieldFocus.frontierNodeIds.has(node.id)} fieldSummary={props.fieldFocus.summariesByNodeId.get(node.id) ?? null} uiCollapsed={props.layout.uiProjection.mode === "hidden" && props.layout.uiProjection.collapsedRootIds.has(node.id)} stackChildrenModified={props.layout.stackProjection.modifiedParentNodeIds.has(node.id)} hidden={props.isolated && !props.emphasis.focusNodeIds.has(node.id)} showLabel={props.displayLabelIds.has(displayNode.id)} findings={routeTotalityFindingSummaryForNode(props.totality, node)} labelRenderScale={labelRenderScale()} onSelect={props.onSelect} onRegister={(element) => props.onRegisterMark(target.graphId, element)} zoom={props.displayZoom} />;
        }}</For></g>
        <g class="route-totality-forces" classList={{ visible: props.forcesVisible }} aria-hidden={!props.forcesVisible}><For each={props.displayLayout.forces.filter((force) => force.magnitude > .01)}>{(force) => (
          <line data-node-id={force.id} x1={force.x} y1={force.y} x2={force.x + force.dx} y2={force.y + force.dy} marker-end="url(#route-totality-force-arrow)" />
        )}</For></g>
        <Show when={props.layout.summary.status === "unavailable"}><text class="route-totality-empty-label" x={props.displayBounds.width / 2} y={props.displayBounds.height / 2} text-anchor="middle">No route totality graph is available.</text></Show>
      </g>
    </svg>
  </div>;
}
