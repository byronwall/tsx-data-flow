import { For, Show } from "solid-js";
import type {
  ContextNodeEndpoint,
  ContextNodeMark,
  ContextVisualLink,
  ContextVisualRelay,
} from "./route-context-continuity-index";
import type { RouteTotalityEmphasis } from "./route-totality-emphasis";
import type { RouteContextContinuityVisual } from "./route-context-continuity-state";
import {
  combineRouteContextNodeVisibility,
  routeContextNodeVisibility,
  type RouteContextNodeVisibility,
} from "./route-context-continuity-visibility";
import {
  routeInvestigationSelectionForContextLink,
  routeInvestigationSelectionForContextOccurrence,
  sameRouteInvestigationSelection,
  type RouteInvestigationContextSelection,
  type RouteInvestigationSelection,
} from "./route-investigation-selection";

export function RouteContextContinuityOverlay(props: {
  visual: RouteContextContinuityVisual;
  emphasis: RouteTotalityEmphasis;
  isolated: boolean;
  selection: RouteInvestigationSelection;
  onSelect: (selection: Exclude<RouteInvestigationSelection, null>) => void;
}) {
  const nodeVisibility = (nodeId: string) => routeContextNodeVisibility(nodeId, props.emphasis, props.isolated);
  return <g class="route-context-continuity-layer">
    <g class="route-context-overlay-links">
      <For each={props.visual.links}>{(link) => <ContextLinkMark
        link={link}
        focused={link.contextId === props.visual.focusedId}
        selected={sameRouteInvestigationSelection(props.selection, linkSelection(link))}
        nodeVisibility={nodeVisibility}
        selection={linkSelection(link)}
        onSelect={props.onSelect}
      />}</For>
    </g>
    <g class="route-context-relay-links">
      <For each={props.visual.relays}>{(relay) => <ContextRelayMark relay={relay} nodeVisibility={nodeVisibility} />}</For>
    </g>
    <g class="route-context-node-marks">
      <For each={props.visual.marks}>{(mark) => <ContextNodeMarkGlyph
        mark={mark}
        selected={sameRouteInvestigationSelection(props.selection, markSelection(mark))}
        nodeVisibility={nodeVisibility}
        selection={markSelection(mark)}
        onSelect={props.onSelect}
      />}</For>
    </g>
  </g>;

  function linkSelection(link: ContextVisualLink): RouteInvestigationSelection {
    return routeInvestigationSelectionForContextLink(link.link.id, link.from?.nodeId ?? null, link.to?.nodeId ?? null);
  }

  function markSelection(mark: ContextNodeMark): RouteInvestigationContextSelection {
    return routeInvestigationSelectionForContextOccurrence(mark.contextId, mark.occurrenceId, mark.role);
  }
}

function ContextLinkMark(props: {
  link: ContextVisualLink;
  focused: boolean;
  selected: boolean;
  nodeVisibility: (nodeId: string) => RouteContextNodeVisibility;
  selection: RouteInvestigationSelection;
  onSelect: (selection: Exclude<RouteInvestigationSelection, null>) => void;
}) {
  const geometry = () => curveGeometry(props.link.from!, props.link.to!, stableBend(props.link.id));
  const visibility = () => combineRouteContextNodeVisibility([
    props.nodeVisibility(props.link.from!.nodeId),
    props.nodeVisibility(props.link.to!.nodeId),
  ]);
  const interactionHidden = () => visibility() === "hidden";
  const label = () => {
    const paths = props.link.link.memberPaths.map(memberPath).filter(Boolean);
    return paths.length ? paths.join(" / ") : props.link.link.members.join(", ") || "whole value";
  };
  return <g
    class={`context-color-${props.link.colorIndex} status-${props.link.status}`}
    classList={{ ...visibilityClasses(visibility()), selected: props.selected, interactive: true, "interaction-hidden": interactionHidden() }}
    role={interactionHidden() ? undefined : "button"}
    tabindex={interactionHidden() ? undefined : 0}
    aria-hidden={interactionHidden() ? "true" : undefined}
    aria-pressed={interactionHidden() ? undefined : props.selected}
    aria-label={interactionHidden() ? undefined : `${label()} context link from ${props.link.from?.nodeId} to ${props.link.to?.nodeId}`}
    onClick={(event) => {
      if (interactionHidden()) return;
      event.stopPropagation();
      if (props.link.from && props.link.to) props.onSelect(routeInvestigationSelectionForContextLink(props.link.link.id, props.link.from.nodeId, props.link.to.nodeId));
    }}
    onKeyDown={(event) => {
      if (interactionHidden()) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (props.link.from && props.link.to) props.onSelect(routeInvestigationSelectionForContextLink(props.link.link.id, props.link.from.nodeId, props.link.to.nodeId));
    }}
  >
    <path class="route-context-overlay-line route-context-overlay-hit" d={geometry().path} />
    <path class="route-context-overlay-line" d={geometry().path} />
    <ProviderGlyph x={geometry().start.x} y={geometry().start.y} />
    <ConsumerGlyph x={geometry().end.x} y={geometry().end.y} />
    <Show when={props.focused}>
      <text class="route-context-overlay-label" x={geometry().label.x} y={geometry().label.y - 6} text-anchor="middle">
        {clip(label(), 44)}
      </text>
    </Show>
  </g>;
}

function ContextRelayMark(props: {
  relay: ContextVisualRelay;
  nodeVisibility: (nodeId: string) => RouteContextNodeVisibility;
}) {
  const geometry = () => curveGeometry(props.relay.from!, props.relay.to!, stableBend(props.relay.id) + 14);
  const visibility = () => combineRouteContextNodeVisibility([
    props.nodeVisibility(props.relay.from!.nodeId),
    props.nodeVisibility(props.relay.to!.nodeId),
  ]);
  const interactionHidden = () => visibility() === "hidden";
  return <g
    class={`context-color-${props.relay.colorIndex} status-${props.relay.status}`}
    classList={{ ...visibilityClasses(visibility()), "interaction-hidden": interactionHidden() }}
    role="img"
    aria-hidden={interactionHidden() ? "true" : undefined}
    aria-label={interactionHidden() ? undefined : `${props.relay.pathLabel} · ${props.relay.status} · context relay`}
  >
    <path class="route-context-relay-line" d={geometry().path} />
    <ConsumerGlyph x={geometry().start.x} y={geometry().start.y} />
    <g class="route-context-factory-mark" transform={`translate(${geometry().label.x} ${geometry().label.y}) rotate(45)`}>
      <rect x="-4" y="-4" width="8" height="8" />
    </g>
    <ProviderGlyph x={geometry().end.x} y={geometry().end.y} />
    <text class="route-context-overlay-label route-context-relay-label" x={geometry().label.x} y={geometry().label.y - 8} text-anchor="middle">
      {clip(props.relay.pathLabel, 52)}
    </text>
  </g>;
}

function ContextNodeMarkGlyph(props: {
  mark: ContextNodeMark;
  selected: boolean;
  nodeVisibility: (nodeId: string) => RouteContextNodeVisibility;
  selection: RouteInvestigationSelection;
  onSelect: (selection: Exclude<RouteInvestigationSelection, null>) => void;
}) {
  const point = () => markPoint(props.mark);
  const visibility = () => props.nodeVisibility(props.mark.endpoint.nodeId);
  const interactionHidden = () => visibility() === "hidden";
  return <g
    class={`context-color-${props.mark.colorIndex} status-${props.mark.status}`}
    classList={{ ...visibilityClasses(visibility()), selected: props.selected, interactive: true, "interaction-hidden": interactionHidden() }}
    role={interactionHidden() ? undefined : "button"}
    tabindex={interactionHidden() ? undefined : 0}
    aria-hidden={interactionHidden() ? "true" : undefined}
    aria-pressed={interactionHidden() ? undefined : props.selected}
    aria-label={interactionHidden() ? undefined : `${props.mark.role === "provider" ? "Provider" : "Consumer"} occurrence ${props.mark.occurrenceId}`}
    onClick={(event) => {
      if (interactionHidden()) return;
      event.stopPropagation();
      props.onSelect(routeInvestigationSelectionForContextOccurrence(props.mark.contextId, props.mark.occurrenceId, props.mark.role));
    }}
    onKeyDown={(event) => {
      if (interactionHidden()) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      props.onSelect(routeInvestigationSelectionForContextOccurrence(props.mark.contextId, props.mark.occurrenceId, props.mark.role));
    }}
  >
    <Show when={props.mark.role === "provider"} fallback={<ConsumerGlyph x={point().x} y={point().y} />}>
      <ProviderGlyph x={point().x} y={point().y} />
    </Show>
  </g>;
}

function visibilityClasses(visibility: RouteContextNodeVisibility) {
  return {
    "emphasis-active": visibility === "active",
    "emphasis-secondary": visibility === "secondary",
    "emphasis-frontier": visibility === "frontier",
    "emphasis-dimmed": visibility === "dimmed",
    "isolation-hidden": visibility === "hidden",
  };
}

function ProviderGlyph(props: { x: number; y: number }) {
  return <rect class="route-context-role-mark role-provider" x={props.x - 4} y={props.y - 4} width="8" height="8" transform={`rotate(45 ${props.x} ${props.y})`} />;
}

function ConsumerGlyph(props: { x: number; y: number }) {
  return <g class="route-context-role-mark role-consumer">
    <circle cx={props.x} cy={props.y} r="4.5" />
    <circle class="route-context-consumer-dot" cx={props.x} cy={props.y} r="1.35" />
  </g>;
}

function curveGeometry(from: ContextNodeEndpoint, to: ContextNodeEndpoint, bend: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) {
    const radius = Math.max(from.radius, to.radius) + 9;
    const start = { x: from.x - radius * .7, y: from.y - radius * .7 };
    const end = { x: to.x + radius * .7, y: to.y - radius * .7 };
    const label = { x: from.x + bend, y: from.y - radius * 2.2 };
    return {
      start,
      end,
      label,
      path: `M ${start.x} ${start.y} Q ${label.x} ${label.y} ${end.x} ${end.y}`,
    };
  }
  const length = distance;
  const ux = dx / length;
  const uy = dy / length;
  const normalX = -uy;
  const normalY = ux;
  const start = { x: from.x + ux * (from.radius + 8), y: from.y + uy * (from.radius + 8) };
  const end = { x: to.x - ux * (to.radius + 8), y: to.y - uy * (to.radius + 8) };
  const label = {
    x: (start.x + end.x) / 2 + normalX * bend,
    y: (start.y + end.y) / 2 + normalY * bend,
  };
  return {
    start,
    end,
    label,
    path: `M ${start.x} ${start.y} Q ${label.x} ${label.y} ${end.x} ${end.y}`,
  };
}

function markPoint(mark: ContextNodeMark): { x: number; y: number } {
  const angle = -Math.PI / 2 + (Math.PI * 2 * mark.slot) / Math.max(1, mark.slotCount);
  const radius = mark.endpoint.radius + 9;
  return {
    x: mark.endpoint.x + Math.cos(angle) * radius,
    y: mark.endpoint.y + Math.sin(angle) * radius,
  };
}

function stableBend(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = ((hash * 33) + id.charCodeAt(index)) >>> 0;
  return ((hash % 5) - 2) * 8;
}

function memberPath(path: readonly string[]): string {
  return path.join(".");
}

function clip(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
