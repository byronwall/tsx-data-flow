import { For, Show } from "solid-js";
import type { Workspace } from "../../../api/contracts";

type ComponentMap = Workspace["semanticMap"]["components"];
type ComponentNode = ComponentMap["nodes"][number];

export function ComponentStructureInspector(props: { selected: ComponentNode | null; callers: ComponentNode[]; children: ComponentNode[]; onSelect: (id: string) => void }) {
  return <aside class="component-structure-inspector" aria-label="Component selection inspector">
    <Show when={props.selected} fallback={<div class="component-inspector-empty"><span class="micro-label">Inspector</span><strong>Select a component</strong><p>Click a node to inspect its source and direct render relationships.</p></div>}>
      {(selected) => <div class="component-inspector-content">
        <header><span class={`type-tag component-role-${selected().role}`}>{roleLabel(selected().role)}</span><h3 class="mono" title={selected().name}>{selected().name}</h3><span class="mono component-inspector-path" title={selected().path}>{selected().path}:{selected().line}</span></header>
        <dl><div><dt>Callers</dt><dd>{selected().incomingCount}</dd></div><div><dt>Children</dt><dd>{selected().outgoingCount}</dd></div><div><dt>Uses</dt><dd>{selected().useCount}</dd></div></dl>
        <a class="btn component-source-link" href={`/file?path=${encodeURIComponent(selected().path)}#L${selected().line}`}>Open source</a>
        <RelationshipList label="Rendered by" nodes={props.callers} empty="No indexed parent component." onSelect={props.onSelect} />
        <RelationshipList label="Renders" nodes={props.children} empty="No indexed child components." onSelect={props.onSelect} />
      </div>}
    </Show>
  </aside>;
}

function RelationshipList(props: { label: string; nodes: ComponentNode[]; empty: string; onSelect: (id: string) => void }) {
  return <section class="component-relationship-list"><h4>{props.label}<span>{props.nodes.length}</span></h4><Show when={props.nodes.length} fallback={<p>{props.empty}</p>}><ul><For each={props.nodes}>{(node) => <li><button type="button" title={`${node.path}:${node.line}`} onClick={() => props.onSelect(node.id)}><code>{node.name}</code><span>{fileName(node.path)}</span></button></li>}</For></ul></Show></section>;
}

function roleLabel(role: ComponentNode["role"]) { return role === "root" ? "root" : role === "branch" ? "composer" : role === "leaf" ? "terminal" : "shared"; }
function fileName(path: string) { return path.split("/").at(-1) ?? path; }
