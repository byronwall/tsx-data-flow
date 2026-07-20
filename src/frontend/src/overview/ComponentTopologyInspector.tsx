import { For, Show } from "solid-js";
import type { ComponentTopologyEdge, ComponentTopologyLayoutNode, ComponentTopologyNode } from "./component-topology-model";
import type { TopologyNodeSourceTouch, TopologySourceLens } from "./topology-source-lens";

type Connection = { edge: ComponentTopologyEdge; neighbor: ComponentTopologyNode; outgoing: boolean };

export function ComponentTopologyInspector(props: {
  lens: TopologySourceLens;
  selectedNode: ComponentTopologyNode | null;
  selectedLayoutNode: ComponentTopologyLayoutNode | null;
  allSourceTouches: TopologyNodeSourceTouch[];
  connections: Connection[];
  selectionCopied: boolean;
  onSelect: (id: string) => void;
  onSource: (key: string | null) => void;
  onCopy: () => void;
}) {
  return <aside class="component-topology-inspector" aria-label="Topology selection inspector">
    <strong>{props.selectedNode ? "Selection" : "Selected data source"}</strong>
    <Show when={props.selectedNode} fallback={<Show when={props.lens.source} fallback={<p>Select a data source to show its proven paths through the topology.</p>}>{(source) => <>
      <code class="component-topology-inspector-name">{source().label}</code>
      <span>{source().kind} · {source().totalFields} shape fields · {props.lens.pathCount} paths · {props.lens.resources.length} resources · {props.lens.transforms.length} retained source transforms</span>
      <code class="component-topology-inspector-location">{source().file}:{source().line}</code>
      <div class="component-topology-source-fields"><For each={source().fields}>{(field) => <span><code>{field.key}</code><small>{field.typeText}</small></span>}</For></div>
      <StageInventory lens={props.lens} onSelect={props.onSelect} />
      <p>{props.lens.matchMode === "exact" ? "Highlighted components occur on paths rooted at this source." : props.lens.matchMode === "resource" ? "The exact fetcher and resource owner are highlighted; the returned render handoff is not proven." : "This source is consumed on the route, but no rendered handoff was proven."}</p>
    </>}</Show>}>{(node) => <>
      <code class="component-topology-inspector-name">{node().label}</code>
      <span>{props.selectedLayoutNode?.terminal ? "Leaf in component view" : kindLabel(node().kind)} · {node().incomingCount} in · {node().outgoingCount} out</span>
      <Show when={node().file}><code class="component-topology-inspector-location">{node().file}{node().line ? `:${node().line}` : ""}</code></Show>
      <div class="component-topology-node-sources" hidden={Boolean(props.lens.source)}>
        <strong>Sources through this node</strong>
        <Show when={props.allSourceTouches.length} fallback={<small>No proven data path or resource consumption includes this node.</small>}>
          <For each={props.allSourceTouches}>{(touch) => <button type="button" onClick={() => touch.source ? props.onSource(touch.source.key) : props.onSelect(touch.targetId)}>
            <span><b>{touch.label}</b><small>{touch.detail}</small></span>
            <span class="component-topology-node-source-fields">
              <Show when={touch.fields.length} fallback={<small>{touch.mode === "path" ? "Proven data path; field identity not established" : "Proven resource consumption; returned value path not established"}</small>}>
                <small>{touch.fields.length} returned fields available at this resource owner</small>
                <span><For each={touch.fields}>{(field) => <code>{field.key}</code>}</For></span>
              </Show>
            </span>
            <em>{touch.source ? "Filter →" : "Inspect →"}</em>
          </button>}</For>
        </Show>
      </div>
      <Show when={props.lens.fieldsByNodeId.get(node().id)?.length}><div class="component-topology-node-fields">
        <strong>Source fields through this component</strong>
        <For each={props.lens.fieldsByNodeId.get(node().id)}>{(field) => <span><code>{field.label}</code><small>{field.pathCount} lineage {field.pathCount === 1 ? "path" : "paths"}</small></span>}</For>
      </div></Show>
      <Show when={props.lens.transformsByNodeId.get(node().id)?.length}><div class="component-topology-node-transforms"><strong>Transforms in this component</strong><For each={props.lens.transformsByNodeId.get(node().id)}>{(transform) => <span><b>{transform.effect}</b><code>{transform.label}</code><small>{location(transform.file, transform.line)}</small></span>}</For></div></Show>
      <Show when={props.lens.terminalsByNodeId.get(node().id)?.length}><div class="component-topology-node-terminals">
        <strong>Downstream render terminals</strong>
        <small>This component is a leaf only in the component-level view. The selected source continues to these render sites inside it.</small>
        <For each={props.lens.terminalsByNodeId.get(node().id)}>{(terminal) => <span><code>{terminal.label}</code><small>{terminal.pathCount} lineage {terminal.pathCount === 1 ? "path" : "paths"}</small></span>}</For>
      </div></Show>
      <div class="component-topology-inspector-connections">
        <strong>Connections</strong>
        <Show when={props.connections.length} fallback={<span>No named connections</span>}>
          <For each={props.connections}>{(connection) => <button type="button" onClick={() => props.onSelect(connection.neighbor.id)} title={edgeLabel(connection.edge)}>
            <span>{connection.outgoing ? "→" : "←"}</span><code>{connection.neighbor.label}</code><small>{connection.edge.kind}{viaLabel(connection.edge)}</small>
          </button>}</For>
        </Show>
      </div>
      <footer class="component-topology-inspector-actions">
        <span>Debug context</span>
        <button type="button" onClick={props.onCopy}>{props.selectionCopied ? "Copied JSON" : "Copy JSON"}</button>
      </footer>
    </>}</Show>
  </aside>;
}

function StageInventory(props: { lens: TopologySourceLens; onSelect: (id: string) => void }) {
  return <div class="component-topology-stage-inventory">
    <section>
      <strong>Resources in play</strong>
      <Show when={props.lens.resources.length} fallback={<small>No retained resource boundary on these paths.</small>}>
        <For each={props.lens.resources}>{(resource) => <button type="button" onClick={() => props.onSelect(resource.id)}>
          <span class="resource-mark" aria-hidden="true">◇</span>
          <span><code>{resource.label}</code><small>{[resource.handler, resource.owner].filter(Boolean).join(" → ")}</small></span>
        </button>}</For>
      </Show>
    </section>
    <section>
      <strong>Transforms on selected source</strong>
      <Show when={props.lens.transforms.length} fallback={<small>{props.lens.transformMatchMode === "unavailable" ? "No source-rooted path is proven. Field-overlap transform candidates are not counted." : "No retained transforms act on this source."}</small>}>
        <For each={props.lens.transforms.slice(0, 10)}>{(transform) => <button type="button" disabled={!transform.nodeIds[0]} onClick={() => transform.nodeIds[0] && props.onSelect(transform.nodeIds[0])}>
          <b>{transform.effect}</b>
          <span><code>{transform.label}</code><small>{transform.component} · {location(transform.file, transform.line)} · {transform.pathCount} paths</small></span>
        </button>}</For>
        <Show when={props.lens.transforms.length > 10}><small>+{props.lens.transforms.length - 10} more retained transforms</small></Show>
      </Show>
    </section>
  </div>;
}

function location(file: string | null, line: number | null) { return file ? `${file.split("/").at(-1)}${line ? `:${line}` : ""}` : "location unavailable"; }
function kindLabel(kind: ComponentTopologyLayoutNode["kind"]) { return kind === "source" ? "Data source / handler" : kind === "boundary" ? "Resource loader" : kind === "context" ? "Context" : "Component"; }
function viaLabel(edge: Pick<ComponentTopologyEdge, "via">) { return edge.via?.length ? ` via ${edge.via.join(" → ")}` : ""; }
function edgeLabel(edge: ComponentTopologyEdge) { return `${edge.kind}${viaLabel(edge)} · ${edge.confidence}${edge.count > 1 ? ` · ${edge.count} retained paths` : ""}`; }
