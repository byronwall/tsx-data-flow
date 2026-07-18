import { For, Show, createEffect, createResource, onCleanup, onMount } from "solid-js";
import type { RouteDataDetail } from "../../../api/contracts";
import { fetchSourceExcerpt } from "../api";

export function TrajectorySourceDialog(props: { evidence: RouteDataDetail["evidence"][number] | null; evidenceList: RouteDataDetail["evidence"]; onSelect: (id: string) => void; onClose: () => void }) {
  const [source] = createResource(() => props.evidence, (evidence) => fetchSourceExcerpt(evidence));
  let closeButton!: HTMLButtonElement;
  createEffect(() => { if (props.evidence) queueMicrotask(() => closeButton?.focus()); });
  onMount(() => { const keydown = (event: KeyboardEvent) => { if (props.evidence && event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); props.onClose(); } }; document.addEventListener("keydown", keydown, true); onCleanup(() => document.removeEventListener("keydown", keydown, true)); });
  const move = (direction: number) => { const index = props.evidenceList.findIndex((item) => item.id === props.evidence?.id); const next = props.evidenceList[index + direction]; if (next) props.onSelect(next.id); };
  return <div class="trajectory-source-modal" hidden={!props.evidence} role="dialog" aria-modal="true" aria-label="Trajectory source evidence">
    <header><div><span class="micro-label">Source evidence</span><strong>{props.evidence?.file}:{props.evidence?.line}</strong></div><div><button type="button" disabled={props.evidenceList[0]?.id === props.evidence?.id} onClick={() => move(-1)}>Previous</button><button type="button" disabled={props.evidenceList.at(-1)?.id === props.evidence?.id} onClick={() => move(1)}>Next</button><a class="btn" href={props.evidence ? `/file?path=${encodeURIComponent(props.evidence.file)}#L${props.evidence.line}` : "/file"}>Open full file</a><button ref={closeButton} type="button" aria-label="Close source evidence" onClick={() => props.onClose()}>×</button></div></header>
    <div class="trajectory-source-body"><Show when={!source.loading} fallback={<p>Loading source context…</p>}><Show when={source()?.data} fallback={<p class="error">Unable to load the source excerpt.</p>}>{(data) => <pre><For each={data().lines}>{(line) => <span classList={{ focus: line.focus }}><b>{line.number}</b><code>{line.text || " "}</code></span>}</For></pre>}</Show></Show></div>
  </div>;
}
