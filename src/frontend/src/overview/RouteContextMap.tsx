import { For, Show, createMemo } from "solid-js";
import type { RouteDataDetail } from "../../../api/contracts";
import { routeComponentHierarchy, routeTerminalGroups, type RouteContextBranch } from "./route-context-model";

export function RouteContextMap(props: { detail: RouteDataDetail; selectedId: string | null; onSelect: (id: string) => void; onOpenTrajectory: () => void }) {
  const sources = createMemo(() => props.detail.context.nodes.filter((node) => node.kind === "source"));
  const componentHierarchy = createMemo(() => routeComponentHierarchy(props.detail.context.nodes));
  const terminalGroups = createMemo(() => routeTerminalGroups(props.detail.context.nodes, props.detail.terminals));
  const hiddenTerminalCount = () => Math.max(0, props.detail.trajectory.routeReachableTerminalCount - props.detail.terminals.length);
  return <div class="route-context-map">
    <div class="route-context-intro"><strong>Route scope</strong><span>Structural context, not a proven data-flow or complete consumer map. Open the ordered trajectory for retained operation evidence.</span></div>
    <div class="route-context-facts"><span><b>Route</b><code>{props.detail.route.pathPattern}</code></span><span><b>File</b><code>{props.detail.route.file}</code></span><span><b>Parameters</b><code>{props.detail.route.parameters.map((item) => `${item.name}:${item.kind}`).join(", ") || "none"}</code></span></div>
    <div class="route-context-columns">
      <section><header><h3>PERSISTED INPUTS</h3><span>{sources().length} retained</span></header><div class="route-context-card-list"><For each={sources()}>{(node) => <ContextButton node={node} selected={props.selectedId === node.id} onSelect={props.onSelect} />}</For></div></section>
      <section><header><h3>ROUTE-MODULE JSX HIERARCHY</h3><span>{props.detail.route.file}</span></header><ul class="route-context-tree"><For each={componentHierarchy()}>{(branch) => <ContextTreeBranch branch={branch} selectedId={props.selectedId} onSelect={props.onSelect} />}</For></ul></section>
      <section><header><h3>RETAINED RENDER SAMPLE</h3><span>{props.detail.terminals.length} of {props.detail.trajectory.routeReachableTerminalCount} route-reachable sites</span></header><p class="route-context-coverage">Ranked structural candidates, grouped by owning component. They are not an exhaustive or proven list of consumers of the persisted value.<Show when={hiddenTerminalCount()}> {hiddenTerminalCount()} additional sites are outside this bounded sample.</Show></p><div class="route-terminal-groups"><For each={terminalGroups()}>{(group) => <div><h4>{group.label} <span>{group.terminals.length}</span></h4><For each={group.terminals}>{(node) => <ContextButton node={node} selected={props.selectedId === node.id} onSelect={props.onSelect} />}</For></div>}</For></div></section>
    </div>
    <button type="button" class="btn route-context-open" disabled={!props.detail.operations.length} onClick={() => props.onOpenTrajectory()}>Open ordered trajectory →</button>
  </div>;
}

function ContextTreeBranch(props: { branch: RouteContextBranch; selectedId: string | null; onSelect: (id: string) => void }) {
  return <li><ContextButton node={props.branch.node} selected={props.selectedId === props.branch.node.id} onSelect={props.onSelect} /><Show when={props.branch.children.length}><ul><For each={props.branch.children}>{(branch) => <ContextTreeBranch branch={branch} selectedId={props.selectedId} onSelect={props.onSelect} />}</For></ul></Show></li>;
}

function ContextButton(props: { node: RouteDataDetail["context"]["nodes"][number]; selected: boolean; onSelect: (id: string) => void }) {
  return <button type="button" classList={{ selected: props.selected, framework: props.node.role === "framework" }} onClick={() => props.onSelect(props.node.id)}><strong>{props.node.label}</strong><span class="mono">{props.node.file ? `${props.node.file.split("/").at(-1)}${props.node.line ? `:${props.node.line}` : ""}` : props.node.kind}</span></button>;
}
