import { For, Show, createMemo, createSignal, untrack } from "solid-js";
import type { InventoryEntry } from "../../../api/contracts";
import type { Navigate } from "../router";

type Filter = "all" | InventoryEntry["kind"] | "defended";
type Sort = "score" | "line" | "sources" | "type";

export function Inventory(props: { entries: InventoryEntry[]; selectedId: string | null; select: (id: string) => void; location: URL; navigate: Navigate }) {
  const [filter, setFilter] = createSignal<Filter>(untrack(() => validFilter(props.location.searchParams.get("etype"))));
  const [sort, setSort] = createSignal<Sort>(untrack(() => validSort(props.location.searchParams.get("lsort"))));
  const updateUrl = (key: string, value: string, defaultValue: string) => { const url = new URL(window.location.href); if (value === defaultValue) url.searchParams.delete(key); else url.searchParams.set(key, value); props.navigate(`${url.pathname}${url.search}${url.hash}`, true); };
  const visible = createMemo(() => {
    const activeFilter = filter(); const activeSort = sort();
    return props.entries.filter((entry) => activeFilter === "all" || (activeFilter === "defended" ? entry.flags.hasDefenses : entry.kind === activeFilter))
      .slice().sort((left, right) => compare(left, right, activeSort));
  });
  const kinds = createMemo(() => [...new Set(props.entries.map((entry) => entry.kind))]);
  return (
    <section class="inventory" aria-label="File inventory">
      <div class="inventory-toolbar">
        <label>Show <select value={filter()} onChange={(event) => { const value = event.currentTarget.value as Filter; setFilter(value); updateUrl("etype", value, "all"); }}>
          <option value="all">All entries</option><option value="defended">Defended</option>
          <For each={kinds()}>{(kind) => <option value={kind}>{labelKind(kind)}</option>}</For>
        </select></label>
        <label>Sort <select value={sort()} onChange={(event) => { const value = event.currentTarget.value as Sort; setSort(value); updateUrl("lsort", value, "score"); }}>
          <option value="score">Priority</option><option value="line">Line</option><option value="sources">Sources</option><option value="type">Type</option>
        </select></label>
      </div>
      <ol class="inventory-list">
        <For each={visible()}>{(entry) => (
          <li><button type="button" class="inventory-row" data-entry-id={entry.id} classList={{ active: entry.id === props.selectedId }} onClick={() => props.select(entry.id)}>
            <span class={`type-tag tt-${entry.kind}`}>{labelKind(entry.kind)}</span>
            <span class="inventory-line">:{entry.line ?? "?"}</span>
            <span class="inventory-label">{entry.label}<Show when={entry.secondaryLabel}> <small>{entry.secondaryLabel}</small></Show></span>
            <span class="inventory-metric">{metric(entry)}</span>
          </button></li>
        )}</For>
      </ol>
      <Show when={visible().length === 0}><p class="meta">No matching entries.</p></Show>
    </section>
  );
}

function compare(left: InventoryEntry, right: InventoryEntry, mode: Sort) {
  if (mode === "line") return left.sort.line - right.sort.line || lexical(left.id, right.id);
  if (mode === "sources") return right.sort.sources - left.sort.sources || right.sort.score - left.sort.score;
  if (mode === "type") return left.sort.kindOrder - right.sort.kindOrder || left.sort.line - right.sort.line;
  return right.sort.score - left.sort.score || left.sort.line - right.sort.line;
}
function metric(entry: InventoryEntry) {
  if (entry.kind === "finding") return entry.burden.toFixed(2);
  if (entry.kind === "fan-out") return `${entry.sinkCount} sinks`;
  if (entry.kind === "relay") return `${entry.props.length} props`;
  if (entry.kind === "fork") return `${entry.siteLines.length} sites`;
  if (entry.kind === "boundary") return `${entry.inboundSources} in`;
  return `${entry.occurrences}×`;
}
function labelKind(kind: InventoryEntry["kind"]) { return kind === "unknown-edge" ? "unknown" : kind; }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function validFilter(value: string | null): Filter { return value === "defended" || value === "finding" || value === "fork" || value === "boundary" || value === "relay" || value === "unknown-edge" || value === "fan-out" ? value : "all"; }
function validSort(value: string | null): Sort { return value === "line" || value === "sources" || value === "type" ? value : "score"; }
