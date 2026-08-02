import { For, Show } from "solid-js";
import type { SharedHub } from "./component-topology-model";
import type { TopologySourceLens } from "./topology-source-lens";

export function ComponentTopologyHeader(props: {
  lens: TopologySourceLens;
  summarizedReferenceCount: number;
  genericUiMode: "hidden" | "all";
  hiddenComponentCount: number;
  hiddenReferenceCount: number;
  configuredComponentCount: number;
  configuredReferenceCount: number;
  uiRingCount: number;
  scale: number;
  isolated: boolean;
  isolationNodeCount: number;
  isolationAvailable: boolean;
  onShowPaths: () => void;
  onGenericUiMode: (mode: "hidden" | "all") => void;
  onToggleIsolation: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
  onZoomIn: () => void;
}) {
  return <header class="component-topology-summary">
    <div class="route-flow-mode-toolbar" role="group" aria-label="Route flow view"><button type="button" aria-pressed="true">Topology</button><button type="button" aria-pressed="false" onClick={() => props.onShowPaths()}>Detailed paths</button></div>
    <div class="component-topology-policy-toggle" role="group" aria-label="Generic UI visibility"><button type="button" aria-pressed={props.genericUiMode === "hidden"} onClick={() => props.onGenericUiMode("hidden")}>Hide generic UI</button><button type="button" aria-pressed={props.genericUiMode === "all"} onClick={() => props.onGenericUiMode("all")}>Show all</button></div>
    <div><Show when={props.lens.source} fallback={<><strong>Route topology · no field lineage selected</strong><span>Select a data source; green field labels only appear when field-level paths are proven.</span></>}>{(source) => <>
      <strong><code>{source().label}</code>{props.lens.pathCount ? ` through ${new Set([...props.lens.componentIds, ...props.lens.resourceParticipantIds]).size.toLocaleString()} nodes` : props.lens.handoffPathCount ? ` through ${new Set([...props.lens.handoffComponentIds, ...props.lens.resourceParticipantIds]).size.toLocaleString()} consumer-handoff nodes` : " · no proven field lineage"}</strong>
      <span>{props.lens.terminalCount.toLocaleString()} render terminals · {(props.lens.pathCount || props.lens.handoffPathCount).toLocaleString()} {props.lens.pathCount ? "lineage" : props.lens.handoffFieldProven ? "field-mapped handoff" : "consumer handoff"} paths · {props.lens.resources.length} resources · {props.lens.transforms.length} retained source transforms</span>
    </>}</Show></div>
    <span class="component-topology-note">{props.lens.source
      ? props.lens.pathCount
        ? "Green marks show proven selected-source lineage"
        : props.lens.handoffPathCount
          ? props.lens.handoffFieldProven
            ? "Blue marks follow consumer paths whose returned field is proven to depend on this source"
            : "Blue marks continue through the proven consumer handoff; field identity remains unproven"
          : "No green lineage is drawn without proven source paths"
    : props.summarizedReferenceCount
        ? `${props.summarizedReferenceCount} shared refs summarized · blue dashed edges are resource loads`
        : "Blue dashed edges are resource loads; gray edges are component relationships"}</span>
    <span class="component-topology-policy-summary">{props.genericUiMode === "hidden"
      ? `${props.hiddenComponentCount} generic UI hidden · ${props.hiddenReferenceCount} references${props.uiRingCount ? ` · ${props.uiRingCount} parent rings` : ""}`
      : `Generic UI shown · ${props.configuredComponentCount} configured matches · ${props.configuredReferenceCount} references`}</span>
    <button type="button" class="component-topology-isolation" disabled={!props.isolated && !props.isolationAvailable} aria-pressed={props.isolated} title={props.isolated ? "Show the full topology without clearing the current focus (I)" : "Relayout with only the currently emphasized nodes (I)"} onClick={() => props.onToggleIsolation()}>
      {props.isolated ? `Isolated · ${props.isolationNodeCount} nodes` : "Isolate focus"} <kbd>I</kbd>
    </button>
    <div class="component-topology-camera" role="group" aria-label="Topology zoom"><button type="button" aria-label="Zoom out topology" onClick={() => props.onZoomOut()}>−</button><button type="button" aria-label="Reset topology view" onClick={() => props.onResetCamera()}>{Math.round(props.scale * 100)}%</button><button type="button" aria-label="Zoom in topology" onClick={() => props.onZoomIn()}>+</button></div>
  </header>;
}

export function ComponentTopologyLegend(props: { hubs: SharedHub[]; uiPolicyEnabled: boolean; uiRingCount: number; hiddenComponentCount: number; hiddenReferenceCount: number }) {
  return <div class="component-topology-hub-legend" aria-label="Topology legend">
    <strong>Nodes</strong>
    <span><i class="component-topology-key component" aria-hidden="true" /><small>Component</small></span><span><i class="component-topology-key route" aria-hidden="true" /><small>Route</small></span><span><i class="component-topology-key source" aria-hidden="true" /><small>Source</small></span><span><i class="component-topology-key boundary" aria-hidden="true" /><small>Resource</small></span><span><i class="component-topology-key context" aria-hidden="true" /><small>Context</small></span><span><i class="component-topology-key transform" aria-hidden="true" /><small>Transform ring</small></span><span><i class="component-topology-key terminal" aria-hidden="true" /><small>Component leaf</small></span><span><i class="component-topology-key hub" aria-hidden="true" /><small>Hub</small></span>
    <strong class="component-topology-legend-section">Edges</strong><span><i class="component-topology-edge-key resource-load" aria-hidden="true" /><small>Resource / consumer handoff</small></span><span><i class="component-topology-edge-key source-lineage" aria-hidden="true" /><small>Exact source lineage</small></span>
    <Show when={props.uiPolicyEnabled || props.uiRingCount || props.hubs.length}><strong class="component-topology-legend-section">Rings</strong><Show when={props.uiPolicyEnabled || props.uiRingCount}><span><i class="component-topology-policy-ring-key" aria-hidden="true" /><small>Hidden by convention</small><small>{props.hiddenComponentCount} components · {props.hiddenReferenceCount} refs</small></span></Show><Show when={props.hubs.length}><strong class="component-topology-legend-subsection">Recurring references</strong><For each={props.hubs.slice(0, 8)}>{(hub) => <span><i style={{ background: hub.color }} /><code>{hub.label}</code><small>{hub.connectionCount} {hub.relationLabel}</small></span>}</For><Show when={props.hubs.length > 8}><small>+{props.hubs.length - 8} more hubs</small></Show></Show></Show>
  </div>;
}
