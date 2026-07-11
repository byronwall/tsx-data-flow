import { For, Show, createMemo, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import type { ReportData } from "../../../api/contracts";

const PAGE_SIZE = 25;
const OMITTED_FIELDS = new Set(["id", "label", "location", "graph", "child"]);

type ReportItem = Extract<ReportData, { items: unknown[] }>["items"][number];

export function ReportTable(props: { data: Extract<ReportData, { items: unknown[] }> }) {
  const items = () => props.data.items as ReportItem[];
  const [query, setQuery] = createSignal("");
  const [page, setPage] = createSignal(1);
  const columns = createMemo(() => {
    const first = items()[0];
    return first ? Object.keys(first).filter((key) => !OMITTED_FIELDS.has(key)) : [];
  });
  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return needle ? items().filter((item) => searchableText(item).includes(needle)) : items();
  });
  const totalPages = () => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE));
  const currentPage = () => Math.min(page(), totalPages());
  const pageItems = createMemo(() => filtered().slice((currentPage() - 1) * PAGE_SIZE, currentPage() * PAGE_SIZE));
  const updateQuery: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => { setQuery(event.currentTarget.value); setPage(1); };

  return <section class="report-list" aria-label={`${props.data.view} results`}>
    <div class="report-controls">
      <input type="search" value={query()} onInput={updateQuery} placeholder="Filter this report" aria-label="Filter report rows" />
      <span class="meta">{filtered().length} of {items().length} entries</span>
    </div>
    <Show when={pageItems().length} fallback={<p class="empty-state">No matching entries.</p>}>
      <table class="report-table">
        <thead><tr><th class="report-name-col">Entry</th><th class="report-location-col">Location</th><For each={columns()}>{(key) => <th>{humanize(key)}</th>}</For></tr></thead>
        <tbody><For each={pageItems()}>{(item) => <tr>
          <td class="report-name"><ReportLabel item={item} /></td>
          <td class="report-location"><Location item={item} /></td>
          <For each={columns()}>{(key) => <td classList={{ "report-number": typeof field(item, key) === "number", "report-code": isCodeField(key) }}>{renderValue(key, field(item, key))}</td>}</For>
        </tr>}</For></tbody>
      </table>
    </Show>
    <Show when={totalPages() > 1}><nav class="pager" aria-label="Report result pages">
      <button type="button" disabled={currentPage() === 1} onClick={() => setPage(currentPage() - 1)}>Previous</button>
      <span class="meta">Page {currentPage()} of {totalPages()}</span>
      <button type="button" disabled={currentPage() === totalPages()} onClick={() => setPage(currentPage() + 1)}>Next</button>
    </nav></Show>
  </section>;
}

function ReportLabel(props: { item: ReportItem }) {
  return <Show when={locationOf(props.item)} fallback={<code>{props.item.label}</code>}>{(location) => <a href={`/file?path=${encodeURIComponent(location().path)}#L${location().line}`}><code>{props.item.label}</code></a>}</Show>;
}
function Location(props: { item: ReportItem }) {
  return <Show when={locationOf(props.item)} fallback={<span class="meta">—</span>}>{(location) => <a title={`${location().path}:${location().line}`} href={`/file?path=${encodeURIComponent(location().path)}#L${location().line}`}><code>{shortLocation(location().path, location().line)}</code></a>}</Show>;
}
function renderValue(name: string, value: unknown) {
  if (name === "shape" && value === "uncategorized") return <span class="meta">—</span>;
  if (Array.isArray(value) || (value && typeof value === "object")) return <span title={format(value)}>{format(value)}</span>;
  return format(value);
}
function field(item: ReportItem, key: string): unknown { return (item as unknown as Record<string, unknown>)[key]; }
function locationOf(item: ReportItem): { path: string; line: number } | null {
  const location = field(item, "location");
  return location && typeof location === "object" && "path" in location && "line" in location
    ? location as { path: string; line: number }
    : null;
}
function searchableText(item: ReportItem): string { return JSON.stringify(item).toLowerCase(); }
function shortLocation(path: string, line: number): string { return `${path.split("/").pop() ?? path}:${line}`; }
function humanize(value: string): string { return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()); }
function isCodeField(key: string): boolean { return ["expression", "pivots", "causes", "props", "roots", "contextHooks", "sharedProps", "component"].includes(key); }
function format(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map((entry) => format(entry)).join(", ") || "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.path === "string" && typeof record.line === "number") return shortLocation(record.path, record.line);
    return Object.values(record).map((entry) => format(entry)).join(" · ");
  }
  return String(value);
}
