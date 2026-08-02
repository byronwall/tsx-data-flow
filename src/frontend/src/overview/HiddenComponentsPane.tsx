import { For, Show, createMemo } from "solid-js";
import type { HiddenComponentPolicy } from "../../../api/hidden-component-policy";
import type { HiddenComponentProjection } from "./hidden-component-projection";
import { buildHiddenComponentInventory, hiddenComponentReferenceCount } from "./hidden-components-pane-model";

export function HiddenComponentsPane(props: {
  policy: HiddenComponentPolicy;
  topology: Parameters<typeof buildHiddenComponentInventory>[0];
  projection: HiddenComponentProjection;
  allMatches: HiddenComponentProjection;
  mode: "hidden" | "all";
  revealedComponentIds: ReadonlySet<string>;
  onReveal: (componentId: string) => void;
  onHideAgain: (componentId: string) => void;
  onShowAll: () => void;
}) {
  const groups = createMemo(() => buildHiddenComponentInventory(props.topology, props.projection, props.allMatches, props.mode, props.revealedComponentIds));
  const hiddenReferenceCount = createMemo(() => hiddenComponentReferenceCount(props.projection.hidden));
  const allReferenceCount = createMemo(() => hiddenComponentReferenceCount(props.allMatches.hidden));
  return <div class="component-topology-hidden-pane">
    <header class="component-topology-hidden-header">
      <div><strong>Hidden by convention</strong><span>{props.mode === "hidden" ? `${props.projection.hidden.length} hidden · ${hiddenReferenceCount()} references` : "Generic UI is shown"}</span></div>
      <button type="button" disabled={props.mode === "all"} onClick={() => props.onShowAll()}>Show all</button>
    </header>
    <p class="component-topology-hidden-copy">{props.mode === "all"
      ? `Show all is active. The current rule matches ${props.allMatches.hidden.length} component${props.allMatches.hidden.length === 1 ? "" : "s"}; none are hidden from the canvas.`
      : props.allMatches.hidden.length
        ? "Generic UI stays out of the canvas until you reveal an individual component. Hidden descendants remain collapsed."
        : "No components match the active hidden-component rules."}</p>
    <dl class="component-topology-hidden-facts">
      <div><dt>Config</dt><dd><code>{props.policy.configPath ?? "built-in defaults"}</code></dd></div>
      <div><dt>Include</dt><dd><code>{props.policy.include.join(", ") || "none"}</code></dd></div>
      <div><dt>Exclude</dt><dd><code>{props.policy.exclude.join(", ") || "none"}</code></dd></div>
      <div><dt>Matches</dt><dd>{props.allMatches.hidden.length} · {allReferenceCount()} refs</dd></div>
    </dl>
    <Show when={groups().length} fallback={<p class="component-topology-hidden-empty">{props.mode === "hidden" && props.revealedComponentIds.size ? "All matched components are individually revealed." : "Nothing is currently hidden."}</p>}>
      <div class="component-topology-hidden-groups">
        <For each={groups()}>{(group) => <section>
          <header><span>Last visible parent</span><strong><code>{group.parentLabel}</code>{group.parentLocation ? <small>{group.parentLocation}</small> : null}</strong></header>
          <table>
            <thead><tr><th>Component</th><th>Definition</th><th>Rule</th><th>Refs</th><th>State</th><th>Action</th></tr></thead>
            <tbody><For each={group.items}>{(item) => <tr>
              <td><code title={item.componentId}>{item.label}</code></td>
              <td><code title={item.file}>{shortDefinition(item.file, item.line)}</code></td>
              <td><code title={item.matchedRule}>{item.matchedRule}</code></td>
              <td class="component-topology-hidden-number">{item.incomingReferenceCount}</td>
              <td><span class={`component-topology-hidden-state ${item.state}`}>{item.state === "hidden" ? "Hidden" : "Revealed"}</span></td>
              <td><button type="button" onClick={() => item.state === "hidden" ? props.onReveal(item.componentId) : props.onHideAgain(item.componentId)}>{item.state === "hidden" ? "Show" : "Hide again"}</button></td>
            </tr>}</For></tbody>
          </table>
        </section>}</For>
      </div>
    </Show>
  </div>;
}

function shortDefinition(file: string, line: number | null) {
  return `${file.split("/").at(-1) ?? file}${line ? `:${line}` : ""}`;
}
