import { Show, createMemo } from "solid-js";
import {
  routeTotalityNodeKindLabel,
  type RouteTotalityNodeKind,
  routeTotalityLocationLabel,
} from "./route-totality-model";
import {
  routeTotalityDisplayBridgePath,
  routeTotalityDisplayEdgePath,
  type RouteTotalityDisplayLayoutAnnotation,
  type RouteTotalityDisplayLayoutBridge,
  type RouteTotalityDisplayLayoutEdge,
  type RouteTotalityDisplayLayoutNode,
} from "./route-totality-display-layout";
import {
  routeTotalityDisplayNodeLabel,
  routeTotalityDisplayNodeSummary,
  type RouteTotalityDisplayZoom,
} from "./route-totality-display-labels";
import type {
  RouteInvestigationEdgeSelection,
  RouteInvestigationNodeSelection,
  RouteInvestigationSelection,
} from "./route-investigation-selection";
import type { RouteTotalityBoundaryStub } from "./route-totality-boundary-stubs";
import type { RouteTotalityFindingSummary } from "./route-totality-finding-model";

export function DisplayTotalityEdge(props: {
  edge: RouteTotalityDisplayLayoutEdge;
  selection: RouteInvestigationEdgeSelection;
  selected: boolean;
  emphasisActive: boolean;
  active: boolean;
  secondary: boolean;
  frontier: boolean;
  hidden: boolean;
  onSelect: (selection: RouteInvestigationEdgeSelection) => void;
  onRegister: (element: SVGGElement) => void;
}) {
  const path = createMemo(() => routeTotalityDisplayEdgePath(props.edge));
  return <g
    ref={props.onRegister}
    data-route-selection={props.selection.graphId}
    class={`route-totality-edge-family-${props.edge.edge.family}`}
    classList={{
      selected: props.selected,
      "emphasis-active": props.active && !props.secondary,
      "emphasis-secondary": props.secondary,
      "emphasis-frontier": props.frontier,
      "emphasis-dimmed": props.emphasisActive && !props.active && !props.frontier,
      "isolation-hidden": props.hidden,
    }}
    role="button"
    tabindex={props.hidden ? -1 : 0}
    aria-hidden={props.hidden ? "true" : undefined}
    aria-pressed={props.selected}
    aria-label={`Select ${props.edge.edge.family} edge ${props.edge.edge.label || props.edge.edge.kind}${props.active ? " · in emphasized reach" : props.frontier ? " · partial frontier" : ""}`}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); props.onSelect(props.selection); }}
    onKeyDown={(event) => selectOnKey(event, props.selection, props.onSelect)}
  >
    <path class="route-totality-edge-hit" d={path()} />
    <path class="route-totality-edge-line" d={path()} />
    <title>{props.edge.edge.label || props.edge.edge.kind} · {props.edge.edge.detail} · {props.edge.edge.locations[0] ? routeTotalityLocationLabel(props.edge.edge.locations[0]) : "Location unavailable"}</title>
  </g>;
}

export function DisplayTotalityNode(props: {
  node: RouteTotalityDisplayLayoutNode;
  selection: RouteInvestigationNodeSelection;
  selected: boolean;
  emphasisActive: boolean;
  active: boolean;
  secondary: boolean;
  frontier: boolean;
  uiCollapsed: boolean;
  stackChildrenModified: boolean;
  hidden: boolean;
  showLabel: boolean;
  findings: RouteTotalityFindingSummary;
  labelRenderScale: number;
  onSelect: (selection: RouteInvestigationNodeSelection) => void;
  onRegister: (element: SVGGElement) => void;
  zoom: RouteTotalityDisplayZoom;
}) {
  const label = createMemo(() => routeTotalityDisplayNodeLabel(props.node, "low"));
  const summary = createMemo(() => routeTotalityDisplayNodeSummary(props.node, props.zoom));
  const location = createMemo(() => routeTotalityLocationLabel(props.node.node.location));
  const details = createMemo(() => props.node.node.detailLines.join(" · "));
  const centerX = () => props.node.width / 2;
  const centerY = () => props.node.height / 2;
  const labelScale = () => Math.max(.001, props.labelRenderScale);
  return <g
    ref={props.onRegister}
    data-route-selection={props.selection.graphId}
    class={`route-totality-node-kind-${props.node.node.kind}`}
    classList={{
      selected: props.selected,
      "emphasis-active": props.active && !props.secondary,
      "emphasis-secondary": props.secondary,
      "emphasis-frontier": props.frontier,
      "ui-collapsed": props.uiCollapsed,
      "stack-children-modified": props.stackChildrenModified,
      "emphasis-dimmed": props.emphasisActive && !props.active && !props.frontier,
      "isolation-hidden": props.hidden,
    }}
    transform={`translate(${props.node.x} ${props.node.y})`}
    role="button"
    tabindex={props.hidden ? -1 : 0}
    aria-hidden={props.hidden ? "true" : undefined}
    aria-pressed={props.selected}
    aria-label={`Select ${routeTotalityNodeKindLabel(props.node.node.kind)} ${label()}${props.uiCollapsed ? " · UI implementation hidden" : ""}${props.stackChildrenModified ? " · layout wrapper children promoted" : ""}${props.active ? " · in emphasized reach" : props.frontier ? " · partial frontier" : ""}${props.findings.count ? ` · ${props.findings.count} exact finding${props.findings.count === 1 ? "" : "s"}` : ""}`}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); props.onSelect(props.selection); }}
    onKeyDown={(event) => selectOnKey(event, props.selection, props.onSelect)}
  >
    <rect x={centerX() - 14} y={centerY() - 14} width="28" height="28" fill="transparent" pointer-events="all" />
    <Show when={props.uiCollapsed}>{nodeStatusRing("route-totality-node-collapse-ring", props.node.node.kind, props.node.width, props.node.height, 4)}</Show>
    <Show when={props.stackChildrenModified}>{nodeStatusRing("route-totality-node-stack-ring", props.node.node.kind, props.node.width, props.node.height, props.uiCollapsed ? 8 : 4)}</Show>
    {nodeSurface(props.node.node.kind, props.node.width, props.node.height)}
    <Show when={props.findings.count > 0}>
      <g class="route-totality-finding-marker" aria-hidden="true">
        <circle cx={centerX()} cy={centerY()} r={props.node.radius + 3} />
        <title>{props.findings.count} exact indexed finding{props.findings.count === 1 ? "" : "s"}</title>
      </g>
    </Show>
    <Show when={props.showLabel}>
      <text
        class="route-totality-node-label"
        x={(centerX() + props.node.radius + 5) * labelScale()}
        y={(centerY() + 4) * labelScale()}
        transform={`scale(${1 / labelScale()})`}
      >{clip(label(), 24)}</text>
    </Show>
    <title>{label()}{props.uiCollapsed ? " · UI implementation hidden inside this node" : ""}{props.stackChildrenModified ? " · layout wrapper children were promoted into this node" : ""} · {summary()} · {details()} · {location()}</title>
  </g>;
}

export function DisplayTotalityBridgeEdge(props: {
  bridge: RouteTotalityDisplayLayoutBridge;
  visible: boolean;
  active: boolean;
  frontier: boolean;
  hidden: boolean;
}) {
  const path = createMemo(() => routeTotalityDisplayBridgePath(props.bridge));
  const bridge = () => props.bridge.bridge.bridge;
  const visiblePath = () => path();
  return <g
    classList={{ "bridge-visible": props.visible && Boolean(visiblePath()), "bridge-active": props.active, "bridge-frontier": props.frontier, "isolation-hidden": props.hidden }}
    role="img"
    aria-hidden={props.visible && !props.hidden && Boolean(visiblePath()) ? undefined : "true"}
    aria-label={`${bridge().direction === "origin-to-render" ? "Origin to render" : "Terminal to origin"} handoff · ${bridge().status}`}
  >
    <Show when={visiblePath()}>{(d) => <path class="route-totality-bridge-line" d={d()} />}</Show>
    <title>{bridge().proof.detail} · {bridge().status} · {bridge().locations.length} exact location(s)</title>
  </g>;
}

export function DisplayTotalityAnnotation(props: {
  item: RouteTotalityDisplayLayoutAnnotation;
  x: number;
  y: number;
  selection: RouteInvestigationSelection;
  selected: boolean;
  hidden: boolean;
  labelRenderScale: number;
  onSelect: (selection: Exclude<RouteInvestigationSelection, null>) => void;
}) {
  const annotation = () => props.item.annotation;
  const canSelect = () => Boolean(props.selection);
  const kindClass = () => `route-totality-node-kind-${annotation().kind === "partial" ? "gap" : annotation().kind}`;
  const labelScale = () => Math.max(.001, props.labelRenderScale);
  return <g
    class={kindClass()}
    classList={{ selected: props.selected, "isolation-hidden": props.hidden }}
    transform={`translate(${props.x} ${props.y})`}
    role={canSelect() ? "button" : "img"}
    tabindex={props.hidden || !canSelect() ? -1 : 0}
    aria-hidden={props.hidden ? "true" : undefined}
    aria-pressed={canSelect() ? props.selected : undefined}
    aria-label={`${annotation().label} · ${annotation().detail}`}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation();
      if (props.selection) props.onSelect(props.selection);
    }}
    onKeyDown={(event) => {
      if (!props.selection || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      props.onSelect(props.selection);
    }}
  >
    <rect x="-10" y="-18" width={annotationWidth(annotation())} height="34" fill="transparent" pointer-events="all" />
    <circle class="route-totality-node-surface" cx="0" cy="0" r="8" />
    <text class="route-totality-node-label" x={14 * labelScale()} y={4 * labelScale()} transform={`scale(${1 / labelScale()})`}>{clip(annotation().label, 24)}</text>
    <title>{annotation().detail}{annotation().location ? ` · ${routeTotalityLocationLabel(annotation().location)}` : ""}</title>
  </g>;
}

export function DisplayBoundaryStubMark(props: { stub: RouteTotalityBoundaryStub }) {
  return <g class={`route-totality-boundary-stub family-${props.stub.family}`}>
    <line class="route-totality-boundary-stub-line" x1={props.stub.x1} y1={props.stub.y1} x2={props.stub.x2} y2={props.stub.y2} />
    <text class="route-totality-boundary-stub-label" x={props.stub.x2} y={props.stub.y2 - 4} text-anchor={props.stub.textAnchor}>{props.stub.label}</text>
    <title>{props.stub.label} · {props.stub.detail}</title>
  </g>;
}

export function DisplayLegendMark(props: { kind: string; label: string }) {
  return <span class={`route-totality-legend-mark mark-${props.kind}`}><i class={props.kind} />{props.label}</span>;
}

function nodeSurface(kind: RouteTotalityNodeKind, width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2;
  if (kind === "terminal") return <rect class="route-totality-node-surface" x={centerX - radius} y={centerY - radius} width={radius * 2} height={radius * 2} rx="1" />;
  if (kind === "framework-boundary" || kind === "gap") return <rect class="route-totality-node-surface" x={centerX - radius} y={centerY - radius} width={radius * 2} height={radius * 2} rx="1" transform={`rotate(45 ${centerX} ${centerY})`} />;
  return <circle class="route-totality-node-surface" cx={centerX} cy={centerY} r={radius} />;
}

function nodeStatusRing(className: string, kind: RouteTotalityNodeKind, width: number, height: number, offset: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 + offset;
  if (kind === "terminal") return <rect class={className} x={centerX - radius} y={centerY - radius} width={radius * 2} height={radius * 2} rx="2" />;
  if (kind === "framework-boundary" || kind === "gap") return <rect class={className} x={centerX - radius} y={centerY - radius} width={radius * 2} height={radius * 2} rx="2" transform={`rotate(45 ${centerX} ${centerY})`} />;
  return <circle class={className} cx={centerX} cy={centerY} r={radius} />;
}

function annotationWidth(annotation: RouteTotalityDisplayLayoutAnnotation["annotation"]): number {
  return Math.max(180, Math.min(420, annotation.label.length * 7 + 54));
}

function clip(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function selectOnKey<T extends Exclude<RouteInvestigationSelection, null>>(
  event: KeyboardEvent,
  selection: T,
  select: (selection: T) => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  select(selection);
}
