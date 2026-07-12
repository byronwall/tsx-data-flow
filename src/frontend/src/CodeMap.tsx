import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import type { FilePage } from "../../api/contracts";
import { SourcePane } from "./code-map/SourcePane";
import { Inventory } from "./code-map/Inventory";
import { EntryDetails, EntryNavigation, ExpressionDetails, ExpressionNavigation } from "./code-map/FindingDetails";
import type { Navigate } from "./router";

export function CodeMap(props: { location: URL; data: FilePage; navigate: Navigate; requestedId?: string | null }) {
  let panelRef: HTMLElement | undefined;
  let jumpPulseTimer: number | undefined;
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [jumpedLine, setJumpedLine] = createSignal<number | null>(null);
  const [jumpPulseLine, setJumpPulseLine] = createSignal<number | null>(null);
  const requestedSelection = createMemo(() => props.requestedId && (props.data.inventory.some((entry) => entry.id === props.requestedId) || Boolean(props.data.expressionsById[props.requestedId])) ? props.requestedId : null);
  const effectiveSelectedId = createMemo(() => requestedSelection() ?? selectedId());
  const selectedEntry = createMemo(() => props.data.inventory.find((entry) => entry.id === effectiveSelectedId()));
  const selectedFinding = createMemo(() => effectiveSelectedId() ? props.data.findingsById[effectiveSelectedId()!] : undefined);
  const selectedExpression = createMemo(() => effectiveSelectedId() ? props.data.expressionsById[effectiveSelectedId()!] : undefined);
  const pathLines = createMemo(() => new Set((selectedFinding()?.path ?? []).filter((step) => step.location?.path === props.data.file.path).map((step) => step.location!.line)));
  const lines = new Map<number, HTMLTableRowElement>();
  const reveal = (line: number) => lines.get(line)?.scrollIntoView({ behavior: "smooth", block: "center" });
  const clearJumpTarget = () => {
    setJumpedLine(null);
    setJumpPulseLine(null);
    window.clearTimeout(jumpPulseTimer);
  };
  const showLine = (line: number) => {
    setJumpedLine(line);
    setJumpPulseLine(null);
    window.clearTimeout(jumpPulseTimer);
    window.requestAnimationFrame(() => {
      setJumpPulseLine(line);
      jumpPulseTimer = window.setTimeout(() => setJumpPulseLine(null), 1200);
    });
    reveal(line);
  };
  const jump = (line: number) => {
    showLine(line);
    const url = new URL(window.location.href); url.hash = `L${line}`; props.navigate(`${url.pathname}${url.search}${url.hash}`, true);
  };
  const select = (id: string) => {
    clearJumpTarget();
    setSelectedId(id);
    const url = new URL(window.location.href); url.searchParams.delete("finding"); url.searchParams.delete("expression");
    if (props.data.expressionsById[id]) url.searchParams.set("expression", id); else url.searchParams.set("finding", id);
    url.hash = ""; props.navigate(`${url.pathname}${url.search}`, true);
    const line = props.data.expressionsById[id]?.location.line ?? props.data.inventory.find((entry) => entry.id === id)?.line; if (line) reveal(line);
    window.requestAnimationFrame(() => { if (panelRef) panelRef.scrollTop = 0; });
  };
  const close = () => {
    setSelectedId(null); const url = new URL(window.location.href); url.searchParams.delete("finding"); url.searchParams.delete("expression"); props.navigate(`${url.pathname}${url.search}${url.hash}`, true);
    window.requestAnimationFrame(() => { if (panelRef) panelRef.scrollTop = 0; });
  };
  onMount(() => {
    const line = props.location.hash.match(/^#L(\d+)$/)?.[1]; if (line) jump(Number(line));
  });
  createEffect(on(() => props.location.hash, (hash) => {
    const line = hash.match(/^#L(\d+)$/)?.[1];
    if (line) showLine(Number(line));
  }, { defer: true }));
  onCleanup(() => window.clearTimeout(jumpPulseTimer));
  return <div class="codemap-native">
    <SourcePane file={props.data.file} expressions={props.data.expressionsById} selectedId={effectiveSelectedId()} jumpedLine={jumpedLine()} jumpPulseLine={jumpPulseLine()} pathLines={pathLines()} registerLine={(line, element) => lines.set(line, element)} jump={jump} select={select} />
    <section class="codemap-panel-shell">
      <Show when={selectedEntry()}>{(entry) => <EntryNavigation entry={entry()} finding={props.data.findingsById[entry().id]} close={close} jump={jump} />}</Show>
      <Show when={selectedExpression()}>{(expression) => <ExpressionNavigation expression={expression()} close={close} jump={jump} />}</Show>
      <aside class="codemap-panel" ref={panelRef}>
      <Show when={selectedExpression()} fallback={<Show when={selectedEntry()} fallback={<Inventory entries={props.data.inventory} selectedId={effectiveSelectedId()} select={select} location={props.location} navigate={props.navigate} />}>{(entry) => <EntryDetails entry={entry()} finding={props.data.findingsById[entry().id]} jump={jump} selectExpression={select} />}</Show>}>
          {(expression) => <ExpressionDetails expression={expression()} findings={props.data.findingsById} jump={jump} />}
        </Show>
      </aside>
    </section>
  </div>;
}
