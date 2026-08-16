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
import type { RouteTotalityFieldOccurrenceSummary } from "./route-totality-field-lineage-model";

export function DisplayTotalityEdge(props: {
  edge: RouteTotalityDisplayLayoutEdge;
  selection: RouteInvestigationEdgeSelection;
  selected: boolean;
  emphasisActive: boolean;
  active: boolean;
  secondary: boolean;
  frontier: boolean;
  fieldFocused: boolean;
  fieldActive: boolean;
  fieldFrontier: boolean;
  fieldFrontierLabel: string | null;
  hidden: boolean;
  onSelect: (selection: RouteInvestigationEdgeSelection) => void;
  onRegister: (element: SVGGElement) => void;
}) {
  const path = createMemo(() => routeTotalityDisplayEdgePath(props.edge));
  const interactionHidden = () => props.hidden;
  return <g
    ref={props.onRegister}
    data-route-selection={props.selection.graphId}
    class={`route-totality-edge-family-${props.edge.edge.family}`}
    classList={{
      selected: props.selected,
      "emphasis-active": props.active && !props.secondary,
      "emphasis-secondary": props.secondary,
      "emphasis-frontier": props.frontier,
      "field-path": props.fieldFocused && props.fieldActive,
      "field-frontier": props.fieldFocused && props.fieldFrontier && !props.fieldActive,
      "field-dimmed": props.fieldFocused && !props.fieldActive && !props.fieldFrontier,
      "emphasis-dimmed": props.emphasisActive && !props.active && !props.frontier,
      "isolation-hidden": props.hidden,
      "interaction-hidden": interactionHidden(),
    }}
    role={interactionHidden() ? undefined : "button"}
    tabindex={interactionHidden() ? undefined : 0}
    aria-hidden={interactionHidden() ? "true" : undefined}
    aria-pressed={interactionHidden() ? undefined : props.selected}
    aria-label={interactionHidden() ? undefined : props.fieldFocused && props.fieldFrontier && props.fieldFrontierLabel
      ? props.fieldFrontierLabel
      : `Select ${props.edge.edge.family} edge ${props.edge.edge.label || props.edge.edge.kind}${props.active ? " · in emphasized reach" : props.frontier ? " · partial frontier" : ""}`}
    onClick={(event) => { if (interactionHidden()) return; event.stopPropagation(); props.onSelect(props.selection); }}
    onKeyDown={(event) => { if (interactionHidden()) return; selectOnKey(event, props.selection, props.onSelect); }}
  >
    <path class="route-totality-edge-hit" d={path()} />
    <path class="route-totality-edge-line" d={path()} />
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
  fieldFocused: boolean;
  fieldActive: boolean;
  fieldFrontier: boolean;
  fieldSummary: RouteTotalityFieldOccurrenceSummary | null;
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
  const fieldSummary = createMemo(() => props.fieldSummary?.labelText ?? "");
  const interactionHidden = () => props.hidden;
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
      "field-path": props.fieldFocused && props.fieldActive,
      "field-frontier": props.fieldFocused && props.fieldFrontier && !props.fieldActive,
      "field-dimmed": props.fieldFocused && !props.fieldActive && !props.fieldFrontier,
      "ui-collapsed": props.uiCollapsed,
      "stack-children-modified": props.stackChildrenModified,
      "emphasis-dimmed": props.emphasisActive && !props.active && !props.frontier,
      "isolation-hidden": props.hidden,
      "interaction-hidden": interactionHidden(),
    }}
    transform={`translate(${props.node.x} ${props.node.y})`}
    role={interactionHidden() ? undefined : "button"}
    tabindex={interactionHidden() ? undefined : 0}
    aria-hidden={interactionHidden() ? "true" : undefined}
    aria-pressed={interactionHidden() ? undefined : props.selected}
    aria-label={interactionHidden() ? undefined : `Select ${routeTotalityNodeKindLabel(props.node.node.kind)} ${label()}${props.uiCollapsed ? " · UI implementation hidden" : ""}${props.stackChildrenModified ? " · layout wrapper children promoted" : ""}${props.active ? " · in emphasized reach" : props.frontier ? " · partial frontier" : ""}${props.findings.count ? ` · ${props.findings.count} exact finding${props.findings.count === 1 ? "" : "s"}` : ""}`}
    onClick={(event) => { if (interactionHidden()) return; event.stopPropagation(); props.onSelect(props.selection); }}
    onKeyDown={(event) => { if (interactionHidden()) return; selectOnKey(event, props.selection, props.onSelect); }}
  >
    <rect x={centerX() - 14} y={centerY() - 14} width="28" height="28" fill="transparent" pointer-events="all" />
    <Show when={props.uiCollapsed}>{nodeStatusRing("route-totality-node-collapse-ring", props.node.node.kind, props.node.width, props.node.height, 4)}</Show>
    <Show when={props.stackChildrenModified}>{nodeStatusRing("route-totality-node-stack-ring", props.node.node.kind, props.node.width, props.node.height, props.uiCollapsed ? 8 : 4)}</Show>
    {nodeSurface(props.node.node.kind, props.node.width, props.node.height)}
    <Show when={props.findings.count > 0}>
      <g class="route-totality-finding-marker" aria-hidden="true">
        <circle cx={centerX()} cy={centerY()} r={props.node.radius + 3} />
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
    <Show when={props.fieldFocused && fieldSummary()}>
      <text
        class="route-totality-node-summary route-totality-node-field-summary"
        x={(centerX() + props.node.radius + 5) * labelScale()}
        y={(centerY() + 17) * labelScale()}
        transform={`scale(${1 / labelScale()})`}
      >{fieldSummary()}</text>
    </Show>
  </g>;
}

export function DisplayTotalityBridgeEdge(props: {
  bridge: RouteTotalityDisplayLayoutBridge;
  emphasisActive: boolean;
  visible: boolean;
  active: boolean;
  frontier: boolean;
  fieldFocused: boolean;
  fieldActive: boolean;
  fieldFrontier: boolean;
  hidden: boolean;
}) {
  const path = createMemo(() => routeTotalityDisplayBridgePath(props.bridge));
  const bridge = () => props.bridge.bridge.bridge;
  const visiblePath = () => path();
  return <g
    classList={{ "bridge-visible": props.visible && Boolean(visiblePath()), "bridge-active": props.active, "bridge-frontier": props.frontier, "emphasis-dimmed": props.emphasisActive && !props.active && !props.frontier, "field-path": props.fieldFocused && props.fieldActive, "field-frontier": props.fieldFocused && props.fieldFrontier && !props.fieldActive, "field-dimmed": props.fieldFocused && !props.fieldActive && !props.fieldFrontier, "isolation-hidden": props.hidden }}
    role="img"
    aria-hidden={props.visible && !props.hidden && Boolean(visiblePath()) ? undefined : "true"}
    aria-label={`${bridge().direction === "origin-to-render" ? "Origin to render" : "Terminal to origin"} handoff · ${bridge().status}`}
  >
    <Show when={visiblePath()}>{(d) => <path class="route-totality-bridge-line" d={d()} />}</Show>
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
    role={props.hidden ? undefined : canSelect() ? "button" : "img"}
    tabindex={props.hidden || !canSelect() ? undefined : 0}
    aria-hidden={props.hidden ? "true" : undefined}
    aria-pressed={!props.hidden && canSelect() ? props.selected : undefined}
    aria-label={props.hidden ? undefined : `${annotation().label} · ${annotation().detail}`}
    onClick={(event) => {
      if (props.hidden) return;
      event.stopPropagation();
      if (props.selection) props.onSelect(props.selection);
    }}
    onKeyDown={(event) => {
      if (props.hidden) return;
      if (!props.selection || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      props.onSelect(props.selection);
    }}
  >
    <rect x="-10" y="-18" width={annotationWidth(annotation())} height="34" fill="transparent" pointer-events="all" />
    <circle class="route-totality-node-surface" cx="0" cy="0" r="8" />
    <text class="route-totality-node-label" x={14 * labelScale()} y={4 * labelScale()} transform={`scale(${1 / labelScale()})`}>{clip(annotation().label, 24)}</text>
  </g>;
}

export function DisplayBoundaryStubMark(props: { stub: RouteTotalityBoundaryStub }) {
  return <g class={`route-totality-boundary-stub family-${props.stub.family}`} role="img" aria-label={`${props.stub.label} · ${props.stub.detail}`}>
    <line class="route-totality-boundary-stub-line" x1={props.stub.x1} y1={props.stub.y1} x2={props.stub.x2} y2={props.stub.y2} />
    <text class="route-totality-boundary-stub-label" x={props.stub.x2} y={props.stub.y2 - 4} text-anchor={props.stub.textAnchor}>{props.stub.label}</text>
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
  if (kind === "gap") return <rect class="route-totality-node-surface" x={centerX - radius} y={centerY - radius} width={radius * 2} height={radius * 2} rx="1" transform={`rotate(45 ${centerX} ${centerY})`} />;
  return <circle class="route-totality-node-surface" cx={centerX} cy={centerY} r={radius} />;
}

function nodeStatusRing(className: string, kind: RouteTotalityNodeKind, width: number, height: number, offset: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 + offset;
  if (kind === "terminal") return <rect class={className} x={centerX - radius} y={centerY - radius} width={radius * 2} height={radius * 2} rx="2" />;
  if (kind === "gap") return <rect class={className} x={centerX - radius} y={centerY - radius} width={radius * 2} height={radius * 2} rx="2" transform={`rotate(45 ${centerX} ${centerY})`} />;
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
