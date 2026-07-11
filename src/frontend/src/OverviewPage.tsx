import type { AnalysisReport } from "../../types";
import { For, Show, createEffect, createMemo, createResource, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { fetchJson } from "./api";
import { readHiddenColumns, writeHiddenColumns } from "./client-state";
import { ReportTabs, Shell } from "./Layout";
import {
  emptyEntryCounts,
  entryTypeCountsByFile,
  overviewHref,
  overviewRows,
  overviewState,
} from "./overview-model";
import type {
  EntryCountKey,
  OverviewFilter,
  OverviewSort,
  OverviewState,
} from "./overview-model";

type Report = AnalysisReport;
export type Navigate = (href: string, replace?: boolean) => void;
type SelectOption<T extends string = string> = readonly [T, string];

const TYPE_COLUMNS = [
  { key: "boundaries", col: "boundaries", label: "Boundaries" },
  { key: "fanOut", col: "fanout", label: "Fan-out" },
  { key: "relays", col: "relays", label: "Relays" },
  { key: "unknown", col: "unknown", label: "Unknown" },
] as const satisfies ReadonlyArray<{ key: EntryCountKey; col: string; label: string }>;
const PAGE_SIZE = 25;
const SORT_HEADING: Record<OverviewSort, string> = {
  burden: "Files by burden",
  findings: "Files by finding count",
  depth: "Files by path depth",
  file: "Files by path",
};
const FILTER_OPTIONS = [
  ["all", "All files"],
  ["findings", "Files with findings"],
  ["unknown", "Files with unknown edges"],
  ["participating", "Graph-participating files"],
] as const satisfies readonly SelectOption<OverviewFilter>[];
const SORT_OPTIONS = [
  ["burden", "Burden"],
  ["findings", "Finding count"],
  ["depth", "Path depth"],
  ["file", "File path"],
] as const satisfies readonly SelectOption<OverviewSort>[];

export function OverviewPage(props: { location: URL; navigate: Navigate }) {
  const [report] = createResource(
    () => props.location.search,
    () => fetchJson<Report>("/api/report.json"),
  );
  const state = createMemo(() => overviewState(props.location.searchParams));
  const rows = createMemo(() => overviewRows(report(), state()));
  const pageRows = createMemo(() => {
    if (state().all) return rows();
    return rows().slice(
      (state().page - 1) * PAGE_SIZE,
      state().page * PAGE_SIZE,
    );
  });
  const concentration = createMemo(() => report()?.concentration);
  const typeCounts = createMemo(() => entryTypeCountsByFile(report()));
  const totalPages = createMemo(() =>
    Math.max(1, Math.ceil(rows().length / PAGE_SIZE)),
  );
  const rangeStart = createMemo(() =>
    rows().length ? (state().all ? 1 : (state().page - 1) * PAGE_SIZE + 1) : 0,
  );
  const rangeEnd = createMemo(() =>
    state().all
      ? rows().length
      : Math.min(rows().length, state().page * PAGE_SIZE),
  );

  let searchInput!: HTMLInputElement;
  const submitSearch: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (
    event,
  ) => {
    event.preventDefault();
    props.navigate(
      overviewHref(state(), { q: searchInput.value.trim(), page: 1 }),
    );
  };

  return (
    <Shell
      context={report()?.meta?.root ?? ""}
      tabs={<ReportTabs active={null} />}
    >
      <Show
        when={!report.loading}
        fallback={<p class="meta">Loading analysis...</p>}
      >
        <div class="toolbar">
          <h1 style={{"margin":"0"}}>Render-path overview</h1>
          <form action="/refresh" method="post">
            <button type="submit">↻ Re-analyze</button>
          </form>
        </div>
        <SummaryCards summary={report()?.summary} />
        <div class="toolbar">
          <form onSubmit={submitSearch}>
            <input
              ref={searchInput}
              name="q"
              type="search"
              value={state().q}
              placeholder="Search files and reports"
            />
            <button type="submit">Search</button>
          </form>
          <SelectLink
            label="Show"
            value={state().filter}
            options={FILTER_OPTIONS}
            hrefFor={(value) =>
              overviewHref(state(), { filter: value, page: 1 })
            }
          />
          <SelectLink
            label="Sort"
            value={state().sort}
            options={SORT_OPTIONS}
            hrefFor={(value) => overviewHref(state(), { sort: value, page: 1 })}
          />
          <a class="btn" href="/">
            Reset
          </a>
        </div>
        <h2>{SORT_HEADING[state().sort] ?? "Files"}</h2>
        <Show when={(concentration()?.fileCount ?? 0) > 0}>
          <p class="meta">
            Top {Math.min(5, concentration()?.fileCount ?? 0)} file(s) hold{" "}
            {Math.round((concentration()?.top5 ?? 0) * 100)}% of ranked burden ·{" "}
            {concentration()?.fileCount ?? 0} file(s) with ≥1 finding,{" "}
            {concentration()?.hot4Plus ?? 0} with ≥4.
          </p>
        </Show>
        <p class="meta">
          {rows().length
            ? `Showing ${rangeStart()}-${rangeEnd()} of ${rows().length} file${rows().length === 1 ? "" : "s"}`
            : "No matching files"}
        </p>
        <ColumnToggle />
        <table class="overview-table" id="overview-table">
          <thead>
            <tr>
              <SortHeader state={state()} sort="file" label="File" />
              <SortHeader state={state()} sort="findings" label="Findings" />
              <SortHeader state={state()} sort="burden" label="Worst" />
              <SortHeader state={state()} sort="depth" label="Path depth" />
              <For each={TYPE_COLUMNS}>
                {(col) => <th class={`col-${col.col} num`}>{col.label}</th>}
              </For>
              <th>Dominant shape</th>
              <th>Ownership</th>
              <th>First cut</th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={pageRows().length}
              fallback={
                <tr>
                  <td colspan={7 + TYPE_COLUMNS.length} class="meta">
                    No matching files.
                  </td>
                </tr>
              }
            >
              <For each={pageRows()}>
                {(row) => {
                  const counts =
                    typeCounts().get(row.key) ?? emptyEntryCounts();
                  return (
                    <tr>
                      <td>
                        <a href={`/file?path=${encodeURIComponent(row.key)}`}>
                          {row.key}
                        </a>
                      </td>
                      <td>{row.count}</td>
                      <td>{row.worst.toFixed(2)}</td>
                      <td>{row.depth}</td>
                      <For each={TYPE_COLUMNS}>
                        {(col: (typeof TYPE_COLUMNS)[number]) => (
                          <td class={`col-${col.col} num`}>
                            {counts[col.key] || <span class="meta">·</span>}
                          </td>
                        )}
                      </For>
                      <td>{row.shape}</td>
                      <td>{row.ownership}</td>
                      <td>{row.firstCut}</td>
                    </tr>
                  );
                }}
              </For>
            </Show>
          </tbody>
        </table>
        <Show when={!state().all && totalPages() > 1}>
          <nav class="pager" aria-label="File result pages">
            <a
              class="btn"
              classList={{ disabled: state().page <= 1 }}
              href={overviewHref(state(), { page: state().page - 1 })}
            >
              Previous
            </a>
            <span class="meta">
              Page {state().page} of {totalPages()}
            </span>
            <a
              class="btn"
              classList={{ disabled: state().page >= totalPages() }}
              href={overviewHref(state(), { page: state().page + 1 })}
            >
              Next
            </a>
            <a class="btn" href={overviewHref(state(), { all: true })}>
              Show all {rows().length}
            </a>
          </nav>
        </Show>
        <Show when={state().all && rows().length > PAGE_SIZE}>
          <nav class="pager" aria-label="File result pages">
            <a
              class="btn"
              href={overviewHref(state(), { all: false, page: 1 })}
            >
              Paginate
            </a>
          </nav>
        </Show>
      </Show>
    </Shell>
  );
}

function SummaryCards(props: { summary?: Report["summary"] }) {
  const items = () => [
    ["Sinks", props.summary?.sinks],
    ["Sources", props.summary?.sources],
    ["Path families", props.summary?.pathFamilies],
    ["Unknown edges", props.summary?.unknownEdges],
    ["Graph nodes", props.summary?.nodes],
  ];
  return (
    <div class="cards">
      <For each={items()}>
        {([label, value]) => (
          <div class="card">
            <div class="n">{value ?? 0}</div>
            <div class="l">{label}</div>
          </div>
        )}
      </For>
    </div>
  );
}

function SelectLink<T extends string>(props: {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  hrefFor(value: T): string;
}) {
  const current = () =>
    props.options.find(([value]) => value === props.value)?.[1] ?? props.value;
  return (
    <div class="popover" data-popover>
      <button
        type="button"
        class="popover-trigger"
        data-popover-trigger
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <span class="popover-label">{props.label}</span>
        <span class="popover-value">{current()}</span>
        <span class="popover-caret">▼</span>
      </button>
      <div class="popover-panel" role="listbox">
        <For each={props.options}>
          {([value, label]) => (
            <a
              class="popover-opt"
              classList={{ active: value === props.value }}
              href={props.hrefFor(value)}
            >
              {label}
            </a>
          )}
        </For>
      </div>
    </div>
  );
}

function SortHeader(props: {
  state: OverviewState;
  sort: OverviewSort;
  label: string;
}) {
  const active = () => props.state.sort === props.sort;
  return (
    <th
      class="sortable"
      classList={{ active: active() }}
      aria-sort={active() ? "descending" : undefined}
    >
      <a href={overviewHref(props.state, { sort: props.sort, page: 1 })}>
        <span class="th-label">{props.label}</span>
        <Show when={active()}>
          <span class="caret" aria-hidden="true">
            ▼
          </span>
        </Show>
      </a>
    </th>
  );
}

function ColumnToggle() {
  const columns = TYPE_COLUMNS.map((column) => column.col);
  const [hidden, setHidden] = createSignal<ReadonlySet<string>>(new Set());

  onMount(() => {
    setHidden(readHiddenColumns(window.localStorage, columns));
  });

  createEffect(() => {
    const hiddenColumns = hidden();
    const table = document.getElementById("overview-table");
    if (!table) return;
    for (const column of columns) {
      table.classList.toggle(`hide-${column}`, hiddenColumns.has(column));
    }
  });

  const toggle: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    const col = event.currentTarget.dataset.col;
    if (!col) return;
    const next = new Set(hidden());
    if (event.currentTarget.checked) next.delete(col);
    else next.add(col);
    setHidden(next);
    writeHiddenColumns(window.localStorage, next);
  };
  return (
    <fieldset
      class="col-toggle"
      id="col-toggle"
      aria-label="Show or hide columns"
    >
      <span class="meta">Columns:</span>
      <For each={TYPE_COLUMNS}>
        {(col) => (
          <label>
            <input
              type="checkbox"
              data-col={col.col}
              checked={!hidden().has(col.col)}
              onInput={toggle}
            />{" "}
            {col.label}
          </label>
        )}
      </For>
    </fieldset>
  );
}

