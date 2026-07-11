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
  const chooseFilter = (value: Filter) => { setFilter(value); updateUrl("etype", value, "all"); };
  const chooseSort = (value: Sort) => { setSort(value); updateUrl("lsort", value, "score"); };
  return (
    <section class="inventory" aria-label="File inventory">
      <div class="inventory-toolbar">
        <div class="inventory-filter"><span class="inventory-toolbar-label">Show</span><div class="inventory-filter-options" role="group" aria-label="Show entries">
          <button type="button" class="inventory-toggle" aria-pressed={filter() === "all"} onClick={() => chooseFilter("all")}>All entries</button>
          <button type="button" class="inventory-toggle" aria-pressed={filter() === "defended"} onClick={() => chooseFilter("defended")}>Defended</button>
          <For each={kinds()}>{(kind) => <button type="button" class="inventory-toggle" aria-pressed={filter() === kind} onClick={() => chooseFilter(kind)}>{labelKind(kind)}</button>}</For>
        </div></div>
        <div class="inventory-sort"><span class="inventory-toolbar-label">Sort</span><div class="inventory-sort-options" role="group" aria-label="Sort entries">
          <button type="button" class="inventory-toggle" aria-pressed={sort() === "score"} onClick={() => chooseSort("score")}>Priority</button>
          <button type="button" class="inventory-toggle" aria-pressed={sort() === "line"} onClick={() => chooseSort("line")}>Line</button>
          <button type="button" class="inventory-toggle" aria-pressed={sort() === "sources"} onClick={() => chooseSort("sources")}>Sources</button>
          <button type="button" class="inventory-toggle" aria-pressed={sort() === "type"} onClick={() => chooseSort("type")}>Type</button>
        </div></div>
      </div>
      <div class="inventory-header" aria-hidden="true"><span>Type</span><span>Line</span><span>Identifier</span><span>Metric</span></div>
      <ol class="inventory-list">
        <For each={visible()}>{(entry) => (
          <li><button type="button" class="inventory-row" data-entry-id={entry.id} classList={{ active: entry.id === props.selectedId, "has-defenses": entry.flags.hasDefenses }} onClick={() => props.select(entry.id)}>
            <span class={`type-tag tt-${entry.kind}`}>{labelKind(entry.kind)}</span>
            <span class="inventory-line">{entry.line ?? "?"}</span>
            <span class="inventory-label"><code class="inventory-name">{entry.label}</code><Show when={entry.secondaryLabel}> <code class="inventory-secondary">{entry.secondaryLabel}</code></Show></span>
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
