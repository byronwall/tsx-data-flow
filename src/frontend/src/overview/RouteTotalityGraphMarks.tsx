import { Show, createMemo } from "solid-js";
import type { RouteTotality } from "../../../api/contracts";
import {
  routeTotalityEdgeLabel,
  routeTotalityEdgePath,
  routeTotalityLocationLabel,
  routeTotalityNodeKindLabel,
  routeTotalityNodeLabel,
  routeTotalityNodeSummary,
  type RouteTotalityLayoutEdge,
  type RouteTotalityLayoutNode,
  type RouteTotalityZoom,
} from "./route-totality-model";
import type {
  RouteInvestigationEdgeSelection,
  RouteInvestigationNodeSelection,
  RouteInvestigationSelection,
} from "./route-investigation-selection";
import type { RouteTotalityBoundaryStub } from "./route-totality-boundary-stubs";
import type { RouteTotalityFindingSummary } from "./route-totality-finding-model";

type RouteTotalityBridge = RouteTotality["bridges"][number];

export function TotalityEdge(props: {
  edge: RouteTotalityLayoutEdge;
  selection: RouteInvestigationEdgeSelection;
  selected: boolean;
  emphasisActive: boolean;
  active: boolean;
  frontier: boolean;
  hidden: boolean;
  onSelect: (selection: RouteInvestigationEdgeSelection) => void;
  onRegister: (element: SVGGElement) => void;
  zoom: RouteTotalityZoom;
}) {
  const path = createMemo(() => routeTotalityEdgePath(props.edge));
  const point = createMemo(() => edgeLabelPoint(props.edge));
  return <g ref={props.onRegister} data-route-selection={props.selection.graphId} class={`route-totality-edge-family-${props.edge.family}`} classList={{ selected: props.selected, "emphasis-active": props.active, "emphasis-frontier": props.frontier, "emphasis-dimmed": props.emphasisActive && !props.active && !props.frontier, "isolation-hidden": props.hidden }} role="button" tabIndex={props.hidden ? -1 : 0} aria-hidden={props.hidden ? "true" : undefined} aria-pressed={props.selected} aria-label={`Select ${props.edge.family} edge ${routeTotalityEdgeLabel(props.edge)}${props.active ? " · in emphasized reach" : props.frontier ? " · partial frontier" : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); props.onSelect(props.selection); }} onKeyDown={(event) => selectOnKey(event, props.selection, props.onSelect)}>
    <path class="route-totality-edge-hit" d={path()} /><path class="route-totality-edge-line" d={path()} />
    <Show when={props.zoom === "high"}><text class="route-totality-edge-label" x={point().x} y={point().y}>{routeTotalityEdgeLabel(props.edge)}</text></Show>
    <title>{routeTotalityEdgeLabel(props.edge)} · {props.edge.detail} · {props.edge.locations[0] ? routeTotalityLocationLabel(props.edge.locations[0]) : "Location unavailable"}</title>
  </g>;
}

export function TotalityBridgeEdge(props: {
  bridge: RouteTotalityBridge;
  from: RouteTotalityLayoutNode;
  to: RouteTotalityLayoutNode;
  visible: boolean;
  active: boolean;
  frontier: boolean;
  hidden: boolean;
}) {
  const path = createMemo(() => {
    const fromX = props.from.x + props.from.width / 2;
    const fromY = props.from.y + props.from.height / 2;
    const toX = props.to.x + props.to.width / 2;
    const toY = props.to.y + props.to.height / 2;
    const curve = Math.max(34, Math.abs(toX - fromX) * 0.28);
    return `M ${fromX} ${fromY} C ${fromX + curve} ${fromY}, ${toX - curve} ${toY}, ${toX} ${toY}`;
  });
  return <g classList={{ "bridge-visible": props.visible, "bridge-active": props.active, "bridge-frontier": props.frontier, "isolation-hidden": props.hidden }} role="img" aria-hidden={props.visible && !props.hidden ? undefined : "true"} aria-label={`${props.bridge.direction === "origin-to-render" ? "Origin to render" : "Terminal to origin"} handoff · ${props.bridge.status}`}>
    <path class="route-totality-bridge-line" d={path()} />
    <title>{props.bridge.proof.detail} · {props.bridge.status} · {props.bridge.locations.length} exact location(s)</title>
  </g>;
}

export function BoundaryStubMark(props: { stub: RouteTotalityBoundaryStub }) {
  return <g class={`route-totality-boundary-stub family-${props.stub.family}`}>
    <line class="route-totality-boundary-stub-line" x1={props.stub.x1} y1={props.stub.y1} x2={props.stub.x2} y2={props.stub.y2} />
    <text class="route-totality-boundary-stub-label" x={props.stub.x2} y={props.stub.y2 - 4} text-anchor={props.stub.textAnchor}>{props.stub.label}</text>
    <title>{props.stub.label} · {props.stub.detail}</title>
  </g>;
}

export function TotalityNode(props: {
  node: RouteTotalityLayoutNode;
  selection: RouteInvestigationNodeSelection;
  selected: boolean;
  emphasisActive: boolean;
  active: boolean;
  frontier: boolean;
  hidden: boolean;
  findings: RouteTotalityFindingSummary;
  onSelect: (selection: RouteInvestigationNodeSelection) => void;
  onRegister: (element: SVGGElement) => void;
  zoom: RouteTotalityZoom;
}) {
  const label = createMemo(() => routeTotalityNodeLabel(props.node, props.zoom));
  const summary = createMemo(() => routeTotalityNodeSummary(props.node, props.zoom));
  const location = createMemo(() => routeTotalityLocationLabel(props.node.location));
  const details = createMemo(() => props.node.detailLines.join(" · "));
  return <g ref={props.onRegister} data-route-selection={props.selection.graphId} class={`route-totality-node-kind-${props.node.kind}`} classList={{ selected: props.selected, "emphasis-active": props.active, "emphasis-frontier": props.frontier, "emphasis-dimmed": props.emphasisActive && !props.active && !props.frontier, "isolation-hidden": props.hidden }} transform={`translate(${props.node.x} ${props.node.y})`} role="button" tabIndex={props.hidden ? -1 : 0} aria-hidden={props.hidden ? "true" : undefined} aria-pressed={props.selected} aria-label={`Select ${routeTotalityNodeKindLabel(props.node.kind)} ${label()}${props.active ? " · in emphasized reach" : props.frontier ? " · partial frontier" : ""}${props.findings.count ? ` · ${props.findings.count} exact finding${props.findings.count === 1 ? "" : "s"}` : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); props.onSelect(props.selection); }} onKeyDown={(event) => selectOnKey(event, props.selection, props.onSelect)}>
    {nodeSurface(props.node.kind, props.node.width, props.node.height)}
    <Show when={props.findings.count > 0}><g class="route-totality-finding-marker" aria-hidden="true"><circle cx={props.node.width - 10} cy="10" r="7" /><text x={props.node.width - 10} y="13" text-anchor="middle">{props.findings.count}</text><title>{props.findings.count} exact indexed finding{props.findings.count === 1 ? "" : "s"}</title></g></Show>
    <text class="route-totality-node-label" x="14" y="23">{label()}</text>
    <text class="route-totality-node-kind-label" x="14" y="42">{routeTotalityNodeKindLabel(props.node.kind)}</text>
    <text class="route-totality-node-summary" x="14" y="61">{summary()}</text>
    <Show when={props.zoom === "high"}><text class="route-totality-node-location" x="14" y="73">{location()}</text></Show>
    <title>{label()} · {summary()} · {details()} · {location()}</title>
  </g>;
}

export function LegendMark(props: { kind: string; label: string }) {
  return <span class={`route-totality-legend-mark mark-${props.kind}`}><i class={props.kind} />{props.label}</span>;
}

function nodeSurface(kind: RouteTotalityLayoutNode["kind"], width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  if (kind === "origin") return <circle class="route-totality-node-surface" cx={centerX} cy={centerY} r="24" />;
  if (kind === "occurrence" || kind === "evidence-element") return <rect class="route-totality-node-surface" width={width} height={height} rx="7" />;
  return <polygon class="route-totality-node-surface" points={`${centerX},5 ${width - 9},${centerY} ${centerX},${height - 5} 9,${centerY}`} />;
}

function edgeLabelPoint(edge: RouteTotalityLayoutEdge) {
  return { x: (edge.fromNode.x + edge.fromNode.width / 2 + edge.toNode.x + edge.toNode.width / 2) / 2, y: (edge.fromNode.y + edge.fromNode.height / 2 + edge.toNode.y + edge.toNode.height / 2) / 2 - 7 };
}

function selectOnKey<T extends Exclude<RouteInvestigationSelection, null>>(event: KeyboardEvent, selection: T, select: (selection: T) => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  select(selection);
}
