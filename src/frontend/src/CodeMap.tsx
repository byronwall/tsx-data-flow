import { Show, createMemo, createSignal, onMount } from "solid-js";
import type { FilePage } from "../../api/contracts";
import { SourcePane } from "./code-map/SourcePane";
import { Inventory } from "./code-map/Inventory";
import { EntryDetails, EntryNavigation } from "./code-map/FindingDetails";
import type { Navigate } from "./router";

export function CodeMap(props: { location: URL; data: FilePage; navigate: Navigate; requestedId?: string | null }) {
  let panelRef: HTMLElement | undefined;
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const effectiveSelectedId = createMemo(() => selectedId() ?? (props.requestedId && props.data.inventory.some((entry) => entry.id === props.requestedId) ? props.requestedId : null));
  const selectedEntry = createMemo(() => props.data.inventory.find((entry) => entry.id === effectiveSelectedId()));
  const selectedFinding = createMemo(() => effectiveSelectedId() ? props.data.findingsById[effectiveSelectedId()!] : undefined);
  const pathLines = createMemo(() => new Set((selectedFinding()?.path ?? []).filter((step) => step.location?.path === props.data.file.path).map((step) => step.location!.line)));
  const lines = new Map<number, HTMLTableRowElement>();
  const jump = (line: number) => {
    lines.get(line)?.scrollIntoView({ block: "center" });
    const url = new URL(window.location.href); url.hash = `L${line}`; props.navigate(`${url.pathname}${url.search}${url.hash}`, true);
  };
  const select = (id: string) => {
    setSelectedId(id);
    const url = new URL(window.location.href); url.searchParams.set("finding", id); url.hash = ""; props.navigate(`${url.pathname}${url.search}`, true);
    const line = props.data.inventory.find((entry) => entry.id === id)?.line; if (line) jump(line);
    window.requestAnimationFrame(() => { if (panelRef) panelRef.scrollTop = 0; });
  };
  const close = () => {
    setSelectedId(null); const url = new URL(window.location.href); url.searchParams.delete("finding"); props.navigate(`${url.pathname}${url.search}${url.hash}`, true);
    window.requestAnimationFrame(() => { if (panelRef) panelRef.scrollTop = 0; });
  };
  onMount(() => {
    const line = props.location.hash.match(/^#L(\d+)$/)?.[1]; if (line) jump(Number(line));
  });
  return <div class="codemap-native">
    <SourcePane file={props.data.file} selectedId={effectiveSelectedId()} pathLines={pathLines()} registerLine={(line, element) => lines.set(line, element)} select={select} />
    <section class="codemap-panel-shell">
      <Show when={selectedEntry()}>{(entry) => <EntryNavigation entry={entry()} finding={props.data.findingsById[entry().id]} close={close} jump={jump} />}</Show>
      <aside class="codemap-panel" ref={panelRef}>
        <Show when={selectedEntry()} fallback={<Inventory entries={props.data.inventory} selectedId={effectiveSelectedId()} select={select} location={props.location} navigate={props.navigate} />}>
          {(entry) => <EntryDetails entry={entry()} finding={props.data.findingsById[entry().id]} jump={jump} />}
        </Show>
      </aside>
    </section>
  </div>;
}
