import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { RouteTotalityDisplayLayoutAnnotation, RouteTotalityDisplayLayoutEdge, RouteTotalityDisplayLayoutNode, RouteTotalityDisplayLayout } from "./route-totality-display-layout";
import type { RouteTotalityLayout } from "./route-totality-model";
import type { RouteInvestigationSelection } from "./route-investigation-selection";
import type { RouteTotalityEmphasis } from "./route-totality-emphasis";
import type { RouteTotalityBoundaryStub } from "./route-totality-boundary-stubs";
import type { RouteTotalityDisplayZoom } from "./route-totality-display-labels";
import type { TrajectoryGraphCamera } from "./trajectory-url-state";
import type { RouteTotalityCameraController } from "./route-totality-camera";
import {
  DisplayBoundaryStubMark,
  DisplayTotalityAnnotation,
  DisplayTotalityBridgeEdge,
  DisplayTotalityEdge,
  DisplayTotalityNode,
} from "./RouteTotalityDisplayMarks";
import {
  routeInvestigationSelectionForEdge,
  routeInvestigationSelectionForNode,
  sameRouteInvestigationSelection,
} from "./route-investigation-selection";
import {
  routeTotalityDisplayEvidenceLaneY,
  selectionForRouteTotalityDisplayAnnotation,
} from "./route-totality-graph-state";
import { routeTotalityFindingSummaryForNode } from "./route-totality-finding-model";
import type { RouteTotality } from "../../../api/contracts";

type RouteTotalityRenderableAnnotation = Omit<RouteTotalityDisplayLayoutAnnotation, "x" | "y"> & { x: number; y: number };

export type RouteTotalityViewportProps = {
  totality: RouteTotality | null;
  layout: RouteTotalityLayout;
  displayLayout: RouteTotalityDisplayLayout;
  displayBounds: { width: number; height: number };
  visibleDisplayNodes: readonly RouteTotalityDisplayLayoutNode[];
  visibleDisplayEdges: readonly RouteTotalityDisplayLayoutEdge[];
  displayAnnotations: readonly RouteTotalityRenderableAnnotation[];
  boundaryStubs: readonly RouteTotalityBoundaryStub[];
  displayLabelIds: ReadonlySet<string>;
  displayZoom: RouteTotalityDisplayZoom;
  camera: TrajectoryGraphCamera;
  cameraController: Pick<RouteTotalityCameraController, "dragging" | "startPan" | "movePan" | "finishPan" | "zoomFromWheel">;
  evidenceVisible: boolean;
  selection: RouteInvestigationSelection;
  emphasis: RouteTotalityEmphasis;
  isolated: boolean;
  forcesVisible: boolean;
  onSvgRef: (element: SVGSVGElement) => void;
  onSelect: (selection: Exclude<RouteInvestigationSelection, null>) => void;
  onRegisterMark: (selectionId: string, element: SVGGElement) => void;
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
  const hasDetachedAnnotations = () => props.evidenceVisible && props.displayAnnotations.some((item) => (
    item.annotation.attachment !== "direct" || item.annotation.scope === "route-global"
  ));
  const detachedAnnotationLaneY = () => {
    const first = props.displayAnnotations.find((item) => (
      item.annotation.attachment !== "direct" || item.annotation.scope === "route-global"
    ));
    return first ? first.y - 18 : props.displayBounds.height - 18;
  };
  return <div class="route-totality-viewport">
    <svg
      ref={(element) => { svg = element; props.onSvgRef(element); }}
      classList={{ dragging: props.cameraController.dragging() }}
      class="route-totality-svg"
      viewBox={`0 0 ${props.displayBounds.width} ${props.displayBounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      tabindex="0"
      aria-label={`${props.visibleDisplayNodes.length} visible route totality marks${props.evidenceVisible ? " with evidence detail" : " in the route backbone"}`}
      onPointerDown={(event) => props.cameraController.startPan(event)}
      onPointerMove={(event) => props.cameraController.movePan(event)}
      onPointerUp={(event) => props.cameraController.finishPan(event)}
      onPointerCancel={(event) => props.cameraController.finishPan(event)}
      onWheel={(event) => props.cameraController.zoomFromWheel(event)}
    >
      <defs>
        <marker id="route-totality-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker>
        <marker id="route-totality-force-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 5 2.5 L 0 5 z" /></marker>
      </defs>
      <g transform={`translate(${props.camera.x} ${props.camera.y}) scale(${props.camera.scale})`}>
        <Show when={props.displayLayout.nodes.length}><text class="route-totality-lane-label" x="20" y="22">ROUTE OCCURRENCE SURFACE</text></Show>
        <Show when={props.evidenceVisible && props.displayLayout.evidenceNodes.length}><text class="route-totality-lane-label" x="20" y={routeTotalityDisplayEvidenceLaneY(props.displayLayout)}>EVIDENCE DETAIL</text></Show>
        <g class="route-totality-edges"><For each={props.visibleDisplayEdges}>{(displayEdge) => {
          const edge = displayEdge.edge;
          const target = routeInvestigationSelectionForEdge(edge);
          const withinFocus = props.emphasis.focusNodeIds.has(edge.from) && props.emphasis.focusNodeIds.has(edge.to);
          return <DisplayTotalityEdge edge={displayEdge} selection={target} selected={sameRouteInvestigationSelection(props.selection, target)} emphasisActive={props.emphasis.active} active={props.emphasis.activeLayoutEdgeIds.has(edge.id)} secondary={props.emphasis.secondaryLayoutEdgeIds.has(edge.id)} frontier={props.emphasis.frontierLayoutEdgeIds.has(edge.id)} hidden={props.isolated && !props.emphasis.focusEdgeIds.has(edge.id) && !withinFocus} onSelect={props.onSelect} onRegister={(element) => props.onRegisterMark(target.graphId, element)} />;
        }}</For></g>
        <g class="route-totality-bridge-edges" aria-label="Cross-layer handoffs"><For each={props.displayLayout.bridges}>{(bridge) => <DisplayTotalityBridgeEdge bridge={bridge} visible={Boolean(bridge.fromNode && bridge.toNode) && (props.evidenceVisible || props.emphasis.active)} active={props.emphasis.activeBridgeIds.has(bridge.bridge.bridge.id)} frontier={props.emphasis.frontierBridgeIds.has(bridge.bridge.bridge.id)} hidden={props.isolated && (!bridge.fromNode || !bridge.toNode || !props.emphasis.focusNodeIds.has(bridge.fromNode.id) || !props.emphasis.focusNodeIds.has(bridge.toNode.id))} />}</For></g>
        <g class="route-totality-boundary-stubs" aria-label="Isolation boundary stubs"><For each={props.boundaryStubs}>{(stub) => <DisplayBoundaryStubMark stub={stub} />}</For></g>
        <g class="route-totality-annotations" aria-label="Route totality annotations"><For each={props.displayAnnotations}>{(item) => {
          const target = selectionForRouteTotalityDisplayAnnotation(item.annotation, props.layout);
          return <DisplayTotalityAnnotation item={item} x={item.x} y={item.y} selection={target} selected={sameRouteInvestigationSelection(props.selection, target)} hidden={props.isolated && Boolean(target?.target === "node" && !props.emphasis.focusNodeIds.has(target.graphId))} labelRenderScale={labelRenderScale()} onSelect={props.onSelect} />;
        }}</For></g>
        <g class="route-totality-nodes"><For each={props.visibleDisplayNodes}>{(displayNode) => {
          const node = displayNode.node;
          const target = routeInvestigationSelectionForNode(node);
          return <DisplayTotalityNode node={displayNode} selection={target} selected={sameRouteInvestigationSelection(props.selection, target)} emphasisActive={props.emphasis.active} active={props.emphasis.activeNodeIds.has(node.id)} secondary={props.emphasis.secondaryNodeIds.has(node.id)} frontier={props.emphasis.frontierNodeIds.has(node.id)} uiCollapsed={props.layout.uiProjection.mode === "hidden" && props.layout.uiProjection.collapsedRootIds.has(node.id)} stackChildrenModified={props.layout.stackProjection.modifiedParentNodeIds.has(node.id)} hidden={props.isolated && !props.emphasis.focusNodeIds.has(node.id)} showLabel={props.displayLabelIds.has(displayNode.id)} findings={routeTotalityFindingSummaryForNode(props.totality, node)} labelRenderScale={labelRenderScale()} onSelect={props.onSelect} onRegister={(element) => props.onRegisterMark(target.graphId, element)} zoom={props.displayZoom} />;
        }}</For></g>
        <g class="route-totality-forces" classList={{ visible: props.forcesVisible }} aria-hidden={!props.forcesVisible}><For each={props.displayLayout.forces.filter((force) => force.magnitude > .01)}>{(force) => (
          <line data-node-id={force.id} x1={force.x} y1={force.y} x2={force.x + force.dx} y2={force.y + force.dy} marker-end="url(#route-totality-force-arrow)">
            <title>Next tick: Δx {round(force.dx)}, Δy {round(force.dy)}, magnitude {round(force.magnitude)}</title>
          </line>
        )}</For></g>
        <Show when={hasDetachedAnnotations()}><text class="route-totality-lane-label" x="20" y={detachedAnnotationLaneY()}>UNANCHORED / ROUTE-GLOBAL EVIDENCE</text></Show>
        <Show when={props.layout.summary.status === "unavailable"}><text class="route-totality-empty-label" x={props.displayBounds.width / 2} y={props.displayBounds.height / 2} text-anchor="middle">No route totality graph is available.</text></Show>
      </g>
    </svg>
  </div>;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
