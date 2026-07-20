import { For, Show } from "solid-js";
import type { SharedHub } from "./component-topology-model";
import type { TopologySourceLens } from "./topology-source-lens";

export function ComponentTopologyHeader(props: {
  lens: TopologySourceLens;
  summarizedReferenceCount: number;
  scale: number;
  onShowPaths: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
  onZoomIn: () => void;
}) {
  return <header class="component-topology-summary">
    <div class="route-flow-mode-toolbar" role="group" aria-label="Route flow view"><button type="button" aria-pressed="true">Topology</button><button type="button" aria-pressed="false" onClick={() => props.onShowPaths()}>Detailed paths</button></div>
    <div><Show when={props.lens.source} fallback={<><strong>Route topology</strong><span>Select a data source to show its proven paths and resource participation.</span></>}>{(source) => <><strong><code>{source().label}</code> through {new Set([...props.lens.componentIds, ...props.lens.resourceParticipantIds]).size.toLocaleString()} nodes</strong><span>{props.lens.terminalCount.toLocaleString()} render terminals · {props.lens.pathCount.toLocaleString()} lineage paths · {props.lens.resources.length} resources · {props.lens.transforms.length} retained source transforms</span></>}</Show></div>
    <span class="component-topology-note">{props.summarizedReferenceCount ? `${props.summarizedReferenceCount} shared refs summarized` : "Bright nodes participate in the selected source view"}</span>
    <div class="component-topology-camera" role="group" aria-label="Topology zoom"><button type="button" aria-label="Zoom out topology" onClick={() => props.onZoomOut()}>−</button><button type="button" aria-label="Reset topology view" onClick={() => props.onResetCamera()}>{Math.round(props.scale * 100)}%</button><button type="button" aria-label="Zoom in topology" onClick={() => props.onZoomIn()}>+</button></div>
  </header>;
}

export function ComponentTopologyLegend(props: { hubs: SharedHub[] }) {
  return <div class="component-topology-hub-legend" aria-label="Topology legend">
    <strong>Nodes</strong>
    <span><i class="component-topology-key component" aria-hidden="true" /><small>Component</small></span><span><i class="component-topology-key route" aria-hidden="true" /><small>Route</small></span><span><i class="component-topology-key source" aria-hidden="true" /><small>Source</small></span><span><i class="component-topology-key boundary" aria-hidden="true" /><small>Resource</small></span><span><i class="component-topology-key context" aria-hidden="true" /><small>Context</small></span><span><i class="component-topology-key transform" aria-hidden="true" /><small>Transform ring</small></span><span><i class="component-topology-key terminal" aria-hidden="true" /><small>Component leaf</small></span><span><i class="component-topology-key hub" aria-hidden="true" /><small>Hub</small></span>
    <Show when={props.hubs.length}><strong class="component-topology-legend-section">Rings</strong><For each={props.hubs.slice(0, 8)}>{(hub) => <span><i style={{ background: hub.color }} /><code>{hub.label}</code><small>{hub.connectionCount} {hub.relationLabel}</small></span>}</For><Show when={props.hubs.length > 8}><small>+{props.hubs.length - 8} more hubs</small></Show></Show>
  </div>;
}
