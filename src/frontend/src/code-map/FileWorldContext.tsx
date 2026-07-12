import { For, Show } from "solid-js";
import type { FilePage } from "../../../api/contracts";

export function FileWorldContext(props: { context: FilePage["worldContext"] }) {
  const area = () => props.context.area;
  const role = () => area().sourceCount && area().sinkCount ? "Transforms + renders" : area().sourceCount ? "Source only" : area().sinkCount ? "Render only" : "Connected area";
  return <section class="file-world-context popover" data-popover aria-label="This file in the repository">
    <button class="file-world-summary popover-trigger" type="button" data-popover-trigger aria-expanded="false" title={`This file in the repository · ${role()}`}>
      <span><strong>Repository context</strong><span>{role()}</span></span>
      <span class="file-world-counts"><b>{props.context.incoming.length}↑</b> <b>{props.context.outgoing.length}↓</b> <b>{props.context.totals.crossingTrajectories}</b> paths</span>
      <span aria-hidden="true">▾</span>
    </button>
      <div class="file-world-popover popover-panel">
        <div class="file-world-body">
        <p>{props.context.totals.connectedAreas} related areas in a {props.context.totals.repositoryAreas}-area repository. These are data-flow relationships, not imports. A trajectory contributor may be several code or module hops away; hop distance is shown only when the retained path preserves intermediary areas.</p>
        <div class="file-world-columns">
          <ConnectionList title="Upstream trace contributors" items={props.context.incoming} direction="from" />
          <ConnectionList title="Downstream trace destinations" items={props.context.outgoing} direction="to" />
        </div>
        <Show when={props.context.trajectories.length} fallback={<p class="meta">No top representative trajectory crosses this file.</p>}>
          <h4>Representative render paths</h4>
          <ul class="file-world-trajectories"><For each={props.context.trajectories.slice(0, 6)}>{(trajectory) => <li>
            <span><code>{actionableInputs(trajectory.sourceLabels).join(", ") || "local input"}</code> → <a href={`/file?path=${encodeURIComponent(trajectory.terminal.path)}&finding=${encodeURIComponent(trajectory.id)}#L${trajectory.terminal.line}`}><code>{trajectory.label}</code></a></span>
            <span>{trajectory.depth} steps · burden {trajectory.burden.toFixed(2)}{trajectory.traceComplete ? "" : " · incomplete"}</span>
          </li>}</For></ul>
        </Show>
        <a class="file-world-map-link" href={`/?area=${encodeURIComponent(area().id)}`}>Open this area in the repository map</a>
        </div>
      </div>
  </section>;
}

function actionableInputs(labels: string[]) {
  return [...new Set(labels.map((label) => label.trim()).filter((label) => /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(label) && !["undefined", "null", "true", "false"].includes(label)))].slice(0, 4);
}

function ConnectionList(props: { title: string; items: FilePage["worldContext"]["incoming"]; direction: "from" | "to" }) {
  return <section><h4>{props.title}</h4><Show when={props.items.length} fallback={<p class="meta">No indexed {props.direction === "from" ? "upstream" : "downstream"} area.</p>}><ul><For each={props.items.slice(0, 8)}>{(item) => <li>
    <span class="file-world-connection-main"><a href={`/file?path=${encodeURIComponent(item.path)}`} title={item.path}><code>{item.label}</code></a><span>{relationshipLabel(item)}<Show when={item.via.length}> · via <code>{item.via.join(" → ")}</code></Show></span></span>
    <span>{item.flowCount} {item.flowCount === 1 ? "flow" : "flows"}<Show when={item.incompleteCount}> · {item.incompleteCount} incomplete</Show></span>
  </li>}</For></ul></Show></section>;
}

function relationshipLabel(item: FilePage["worldContext"]["incoming"][number]) {
  if (item.relationship === "traced-edge") return "direct analyzer data-flow edge · not an import claim";
  const route = item.via.length ? `${item.via.length + 1} retained area hops` : "intermediary route not retained";
  return item.relationship === "trajectory-contributor" ? `trajectory contributor · ${route}` : `trajectory contributor + analyzer edge · ${route} · not an import claim`;
}
