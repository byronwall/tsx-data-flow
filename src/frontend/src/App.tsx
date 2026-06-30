import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { JSX } from "solid-js";
import { render } from "solid-js/web";
import { STYLE } from "../../html/styles.mjs";
import {
  fanOutAnchor,
  fanOutGraphSvg,
  renderCodeMap,
} from "../../html/code-map.mjs";
import { markdownToHtml } from "../../html/markdown-to-html.mjs";
import { fanOutIdentity, fanOutRootsFor } from "../../analysis/fan-out.mjs";
import "./style.css";

type ReportView = (typeof REPORT_VIEWS)[number];
type FileView = Exclude<ReportView, "overview">;
type OverviewFilter = "all" | "findings" | "unknown" | "participating";
type OverviewSort = "burden" | "findings" | "depth" | "file";
type Navigate = (href: string, replace?: boolean) => void;
type SelectOption<T extends string = string> = readonly [T, string];

interface SpanLocation {
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

interface RootInfo {
  label: string;
  kind?: string;
  def?: { file: string; line: number } | null;
}

interface Sink {
  id: string;
  file?: string;
  line?: number;
  span?: SpanLocation;
  scores?: { burden?: number };
  metrics?: { maximumPathDepth?: number };
  advice?: {
    primaryShape?: string;
    shape?: string;
    firstCut?: string;
    headline?: string;
  };
  roots?: string[];
  sources?: Array<{ kind?: string }>;
  family?: string;
  kind?: string;
  representativeSteps?: Array<{ file?: string; line?: number }>;
  expression?: string;
  target?: string;
  label?: string;
  rootInfos?: RootInfo[];
  renderContext?: { tag?: string; attribute?: string; component?: string };
}

interface FanOutEntry {
  root: string;
  kind?: string;
  def?: { file: string; line: number } | null;
  sinkCount: number;
  fileCount: number;
  line: number | null;
  maxDepth: number;
  sinks: ReachedSink[];
  graphSinks: ReachedSink[];
}

interface ReachedSink {
  id: string;
  file?: string;
  line?: number;
  label?: string;
  depth: number;
}

interface Report {
  meta?: { root?: string };
  summary?: {
    sinks?: number;
    sources?: number;
    pathFamilies?: number;
    unknownEdges?: number;
    nodes?: number;
  };
  concentration?: {
    fileCount: number;
    top5: number;
    hot4Plus: number;
  };
  sinks?: Sink[];
  helpers?: Array<Record<string, unknown> & { file?: string }>;
  repeatedForks?: Array<Record<string, unknown> & { file?: string }>;
  contextRelay?: Array<Record<string, unknown> & { parentFile?: string }>;
  unknownEdges?: Array<Record<string, unknown> & { file?: string }>;
  packGroups?: Array<Record<string, unknown>>;
  graph?: {
    nodes?: Array<{ file?: string }>;
    edges?: Array<{ location?: { file?: string } }>;
  };
}

interface OverviewState {
  q: string;
  filter: OverviewFilter;
  sort: OverviewSort;
  page: number;
  all: boolean;
}

interface OverviewRow {
  key: string;
  count: number;
  worst: number;
  depth: number;
  worstSink: Sink | null;
  shape: string;
  ownership: string;
  firstCut: string;
}

interface OverviewGroup {
  key: string;
  count: number;
  worst: number;
  depth: number;
  shapes: string[];
  ownership: string[];
  worstSink: Sink | null;
}

type EntryCountKey = "boundaries" | "relays" | "unknown" | "fanOut";
type EntryCounts = Record<EntryCountKey, number>;

const style = document.createElement("style");
style.textContent = STYLE;
document.head.appendChild(style);

const REPORT_VIEWS = [
  "overview",
  "findings",
  "repeated-forks",
  "work-packets",
  "fan-out",
  "fan-in",
  "path-families",
  "defensive-ledger",
  "prop-relay",
  "context-relay",
  "boundary-report",
  "junctions",
  "inline-preview",
  "component-refs",
] as const;

const VIEW_LABELS: Record<ReportView, string> = {
  overview: "Overview report",
  findings: "Findings",
  "repeated-forks": "Repeated forks",
  "work-packets": "Work packets",
  "fan-out": "Fan-out",
  "fan-in": "Fan-in",
  "path-families": "Path families",
  "defensive-ledger": "Defensive ledger",
  "prop-relay": "Prop relay",
  "context-relay": "Context relay",
  "boundary-report": "Boundary report",
  junctions: "Junctions",
  "inline-preview": "Inline preview",
  "component-refs": "References",
};

const FILE_VIEWS: FileView[] = REPORT_VIEWS.filter(
  (view): view is FileView => view !== "overview",
).sort((a, b) => labelFor(a).localeCompare(labelFor(b)));

const TYPE_COLUMNS = [
  { key: "boundaries", col: "boundaries", label: "Boundaries" },
  { key: "fanOut", col: "fanout", label: "Fan-out" },
  { key: "relays", col: "relays", label: "Relays" },
  { key: "unknown", col: "unknown", label: "Unknown" },
] as const satisfies ReadonlyArray<{
  key: EntryCountKey;
  col: string;
  label: string;
}>;
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

function labelFor(view: string | null | undefined): string {
  if (!view) return "";
  return Object.hasOwn(VIEW_LABELS, view)
    ? VIEW_LABELS[view as ReportView]
    : view;
}

function App() {
  const [location, setLocation] = createSignal(currentLocation());

  const navigate: Navigate = (href, replace = false) => {
    const next = new URL(href, window.location.origin);
    if (replace) window.history.replaceState({}, "", next);
    else window.history.pushState({}, "", next);
    setLocation(currentLocation());
  };

  onMount(() => {
    const onPop = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPop);
    onCleanup(() => window.removeEventListener("popstate", onPop));
  });

  const onDocumentClick: JSX.EventHandler<HTMLDivElement, MouseEvent> = (
    event,
  ) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("/api/") ||
      href.startsWith("http") ||
      href.startsWith("mailto:")
    )
      return;
    if (anchor.hasAttribute("download") || anchor.target) return;
    event.preventDefault();
    navigate(href);
  };

  return (
    <div onClick={onDocumentClick}>
      <Router location={location()} navigate={navigate} />
    </div>
  );
}

function Router(props: { location: URL; navigate: Navigate }) {
  const path = () => props.location.pathname;
  return (
    <Show
      when={path() === "/file"}
      fallback={
        <Show
          when={path() === "/report"}
          fallback={
            <OverviewPage location={props.location} navigate={props.navigate} />
          }
        >
          <ReportPage location={props.location} />
        </Show>
      }
    >
      <FilePage location={props.location} />
    </Show>
  );
}

function Shell(props: {
  context?: string;
  tabs?: JSX.Element;
  wide?: boolean;
  children: JSX.Element;
}) {
  return (
    <>
      <header class="topbar">
        <div class="topbar-bar">
          <a class="brand" href="/">
            tsx-dataflow
          </a>
          <Show when={props.context}>
            <span class="topbar-context" title={props.context}>
              {props.context}
            </span>
          </Show>
        </div>
        {props.tabs}
      </header>
      <div class="layout">
        <main classList={{ wide: props.wide }}>{props.children}</main>
      </div>
    </>
  );
}

function ReportTabs(props: { active: ReportView | null }) {
  const active = () => props.active;
  return (
    <nav class="report-tabs" aria-label="Workspace reports">
      <a class="report-tab" classList={{ active: !active() }} href="/">
        Overview
      </a>
      <For each={REPORT_VIEWS}>
        {(view) => (
          <a
            class="report-tab"
            classList={{ active: active() === view }}
            href={`/report?view=${encodeURIComponent(view)}`}
            aria-current={active() === view ? "page" : undefined}
          >
            {labelFor(view)}
          </a>
        )}
      </For>
    </nav>
  );
}

function FileTabs(props: { path: string; active: FileView | null }) {
  const base = () => `/file?path=${encodeURIComponent(props.path)}`;
  const active = () => props.active;
  return (
    <nav class="report-tabs" aria-label="File sections">
      <a class="report-tab" classList={{ active: !active() }} href={base()}>
        Code map
      </a>
      <For each={FILE_VIEWS}>
        {(view) => (
          <a
            class="report-tab"
            classList={{ active: active() === view }}
            href={`${base()}&view=${encodeURIComponent(view)}`}
            aria-current={active() === view ? "page" : undefined}
          >
            {labelFor(view)}
          </a>
        )}
      </For>
    </nav>
  );
}

function OverviewPage(props: { location: URL; navigate: Navigate }) {
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
          <h1 style="margin:0">Render-path overview</h1>
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
                        {(col) => (
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
    <div class="popover open-on-hover">
      <span class="popover-trigger">
        <span class="popover-label">{props.label}</span>
        <span class="popover-value">{current()}</span>
        <span class="popover-caret">▼</span>
      </span>
      <div class="popover-panel">
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
  const toggle: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
    const table = document.getElementById("overview-table");
    if (!table) return;
    const col = event.currentTarget.dataset.col;
    table.classList.toggle(`hide-${col}`, !event.currentTarget.checked);
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
              checked
              onInput={toggle}
            />{" "}
            {col.label}
          </label>
        )}
      </For>
    </fieldset>
  );
}

function ReportPage(props: { location: URL }) {
  const view = createMemo<ReportView>(() => {
    const nextView = props.location.searchParams.get("view");
    return isReportView(nextView) ? nextView : "overview";
  });
  const [report] = createResource(
    () => view(),
    (nextView) => fetchText(`/api/report.${encodeURIComponent(nextView)}.md`),
  );
  const [meta] = createResource(
    () => props.location.search,
    () => fetchJson<Report>("/api/report.json"),
  );
  const fanOutHtml = createMemo(() => {
    if (view() !== "fan-out") return "";
    return renderFanOutViewer(meta(), props.location);
  });
  return (
    <Shell
      context={meta()?.meta?.root ?? ""}
      tabs={<ReportTabs active={view()} />}
    >
      <div class="toolbar">
        <h1 style="margin:0">{labelFor(view())}</h1>
        <a class="btn" href={`/api/report.${encodeURIComponent(view())}.md`}>
          Markdown
        </a>
      </div>
      <Show
        when={!report.loading}
        fallback={<p class="meta">Loading report...</p>}
      >
        <Show
          when={view() === "fan-out" && fanOutHtml()}
          fallback={
            <div class="body" innerHTML={markdownToHtml(report() ?? "")} />
          }
        >
          <div class="body" innerHTML={fanOutHtml()} />
        </Show>
      </Show>
    </Shell>
  );
}

function FilePage(props: { location: URL }) {
  const relPath = createMemo(
    () => props.location.searchParams.get("path") ?? "",
  );
  const activeView = createMemo<FileView | null>(() => {
    const view = props.location.searchParams.get("view");
    return view && FILE_VIEWS.includes(view as FileView)
      ? (view as FileView)
      : null;
  });
  const [fileData] = createResource(
    () => relPath(),
    async (path) => {
      if (!path) return null;
      const [report, fullReport, source] = await Promise.all([
        fetchJson<Report>(`/api/report.json?path=${encodeURIComponent(path)}`),
        fetchJson<Report>("/api/report.json"),
        fetchText(`/api/source?path=${encodeURIComponent(path)}`),
      ]);
      return { report, fullReport, source };
    },
  );
  const [markdown] = createResource(
    () => [relPath(), activeView()].join("\0"),
    async () => {
      const view = activeView();
      if (!relPath() || !view) return "";
      return fetchText(
        `/api/report.${encodeURIComponent(view)}.md?path=${encodeURIComponent(relPath())}`,
      );
    },
  );

  return (
    <Shell
      context={relPath()}
      tabs={<FileTabs path={relPath()} active={activeView()} />}
      wide
    >
      <Show when={relPath()} fallback={<p class="meta">Missing ?path.</p>}>
        <nav class="crumbs">
          <a href="/">← Overview</a>
          <span>/</span>
          <span>{relPath()}</span>
        </nav>
        <div class="toolbar">
          <h1 style="margin:0">{relPath()}</h1>
          <a
            class="btn"
            href={`/api/report.json?path=${encodeURIComponent(relPath())}`}
          >
            JSON
          </a>
          <form action="/refresh" method="post">
            <input
              type="hidden"
              name="from"
              value={`/file?path=${encodeURIComponent(relPath())}`}
            />
            <button type="submit">↻ Re-analyze</button>
          </form>
        </div>
        <Show
          when={!fileData.loading}
          fallback={<p class="meta">Loading file...</p>}
        >
          <Show
            when={activeView()}
            fallback={
              <CodeMap
                relPath={relPath()}
                source={fileData()?.source ?? ""}
                report={fileData()?.report}
                fullReport={fileData()?.fullReport}
              />
            }
          >
            <h2>{labelFor(activeView())}</h2>
            <Show
              when={!markdown.loading}
              fallback={<p class="meta">Loading report...</p>}
            >
              <div class="body" innerHTML={markdownToHtml(markdown() ?? "")} />
            </Show>
          </Show>
        </Show>
      </Show>
    </Shell>
  );
}

function CodeMap(props: {
  relPath: string;
  source: string;
  report?: Report | null;
  fullReport?: Report | null;
}) {
  const [selected, setSelected] = createSignal(
    new URLSearchParams(window.location.search).get("finding"),
  );
  const html = createMemo(() => {
    const report = props.report;
    const fullReport = props.fullReport ?? report;
    const sinks = (report?.sinks ?? []).filter(
      (sink) => sink.file === props.relPath,
    );
    return renderCodeMap({
      relPath: props.relPath,
      source: props.source,
      sinks,
      meta: report?.meta,
      resolveSource: null,
      selectedFinding: selected(),
      forks: (report?.repeatedForks ?? []).filter(
        (fork) => fork.file === props.relPath,
      ),
      helpers: (report?.helpers ?? []).filter(
        (helper) => helper.file === props.relPath,
      ),
      unknownEdges: (report?.unknownEdges ?? []).filter(
        (edge) => edge.file === props.relPath,
      ),
      relays: (report?.contextRelay ?? []).filter(
        (relay) => relay.parentFile === props.relPath,
      ),
      fanOut: fanOutEntriesForFile(fullReport?.sinks ?? [], props.relPath),
    });
  });

  const selectFinding = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("finding", id);
    else url.searchParams.delete("finding");
    window.history.replaceState({}, "", url);
    setSelected(id);
  };

  const onCodeMapClick: JSX.EventHandler<HTMLDivElement, MouseEvent> = (
    event,
  ) => {
    if (!(event.target instanceof Element)) return;
    const back = event.target.closest(".panel-back");
    if (back) {
      selectFinding(null);
      return;
    }
    const row = event.target.closest("[data-finding]");
    if (row instanceof HTMLElement && row.dataset.finding) {
      selectFinding(row.dataset.finding);
      return;
    }
    const line = event.target.closest("[data-line]");
    if (line instanceof HTMLElement) {
      document
        .querySelector(`[data-line="${CSS.escape(line.dataset.line ?? "")}"]`)
        ?.scrollIntoView({ block: "center" });
    }
  };

  return <div onClick={onCodeMapClick} innerHTML={html()} />;
}

function renderFanOutViewer(report: Report | undefined, location: URL): string {
  const entries = sortFanOutEntries(
    fanOutEntriesGlobal(report?.sinks ?? []),
    location.searchParams.get("fosort") ?? "spread",
  );
  if (!entries.length) {
    return '<p class="meta">No shared source fans out to >=2 render sinks.</p>';
  }
  const selected = location.searchParams.get("fanout");
  const active =
    entries.find((entry) => fanOutAnchor(entry.root) === selected) ??
    entries[0];
  const hrefFor = (changes: Record<string, string>) => {
    const params = new URLSearchParams(location.searchParams);
    params.set("view", "fan-out");
    for (const [key, value] of Object.entries(changes)) params.set(key, value);
    return `/report?${params.toString()}`;
  };
  const tabs = entries
    .slice(0, 8)
    .map((entry) => {
      const on = entry === active;
      return `<a class="fo-tab${on ? " active" : ""}"${
        on ? ' aria-current="true"' : ""
      } href="${escapeAttr(hrefFor({ fanout: fanOutAnchor(entry.root) }))}">${escapeHtml(
        entry.root,
      )} <span class="fo-tab-val">${entry.sinkCount}</span></a>`;
    })
    .join("");
  const sortKey = location.searchParams.get("fosort") ?? "spread";
  const sortLinks = [
    ["spread", "spread"],
    ["depth", "depth"],
    ["files", "files"],
    ["name", "name"],
  ]
    .map(
      ([key, label]) =>
        `<a class="fo-sort-btn${key === sortKey ? " active" : ""}" href="${escapeAttr(
          hrefFor({ fosort: key, fanout: fanOutAnchor(active.root) }),
        )}">${label}</a>`,
    )
    .join("");
  const tag =
    active.fileCount === 1
      ? '<span class="fo-tag fo-tag-single">single-file · candidate split</span>'
      : `<span class="fo-tag fo-tag-cross">${active.fileCount} files · cross-file usage</span>`;
  const defLine = active.def
    ? ` · defined at <a class="xfile" href="/file?path=${encodeURIComponent(
        active.def.file,
      )}#L${active.def.line}">${escapeHtml(active.def.file)}:${active.def.line}</a>`
    : "";
  return `<p class="meta fo-explain">A <strong>fan-out</strong> is a single source whose value is consumed by many render sinks; changing it touches every one. Pick a source to see where it spreads.</p>
<div class="fo-controls"><div class="fo-tabs">${tabs}</div><span class="fo-sort"><span class="meta">Sort sources:</span> ${sortLinks}</span></div>
<section class="fanout-entry" id="${fanOutAnchor(active.root)}">
  <h3>${escapeHtml(active.root)} ${tag} <span class="meta">· ${active.sinkCount} sinks · max depth ${active.maxDepth}${defLine}</span></h3>
  ${fanOutGraphSvg(active, null)}
</section>`;
}

function sortFanOutEntries(
  entries: FanOutEntry[],
  sortKey: string,
): FanOutEntry[] {
  return [...entries].sort((left, right) => {
    if (sortKey === "name") return left.root.localeCompare(right.root);
    if (sortKey === "depth") return right.maxDepth - left.maxDepth;
    if (sortKey === "files") return right.fileCount - left.fileCount;
    return right.sinkCount - left.sinkCount || right.maxDepth - left.maxDepth;
  });
}

function fanOutEntriesGlobal(sinks: Sink[]): FanOutEntry[] {
  return fanOutEntries(sinks, null);
}

function fanOutEntriesForFile(sinks: Sink[], relPath: string): FanOutEntry[] {
  return fanOutEntries(sinks, relPath).filter(
    (entry) => entry.sinks.length > 0,
  );
}

function fanOutEntries(sinks: Sink[], relPath: string | null): FanOutEntry[] {
  const entries = new Map<
    string,
    {
      root: string;
      kind?: string;
      def?: { file: string; line: number } | null;
      total: number;
      files: Set<string>;
      inFile: ReachedSink[];
      graphSinks: ReachedSink[];
      maxDepth: number;
      example: Sink | null;
    }
  >();
  for (const sink of sinks) {
    for (const info of fanOutRootsFor(sink)) {
      const { key, label } = fanOutIdentity(sink, info);
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          root: label,
          kind: info.kind,
          def: info.def ?? null,
          total: 0,
          files: new Set(),
          inFile: [],
          graphSinks: [],
          maxDepth: 0,
          example: null,
        };
        entries.set(key, entry);
      }
      entry.total += 1;
      if (sink.file) entry.files.add(sink.file);
      const reached = reachedSinkDescriptor(sink);
      entry.graphSinks.push(reached);
      entry.maxDepth = Math.max(
        entry.maxDepth,
        sink.metrics?.maximumPathDepth ?? 0,
      );
      if (relPath == null || sink.file === relPath) {
        entry.inFile.push(reached);
        if (
          !entry.example ||
          (sink.metrics?.maximumPathDepth ?? 0) >
            (entry.example.metrics?.maximumPathDepth ?? 0)
        ) {
          entry.example = sink;
        }
      }
    }
  }
  return [...entries.values()]
    .filter((entry) => entry.total >= 2)
    .map((entry) => ({
      root: entry.root,
      kind: entry.kind,
      def: entry.def,
      sinkCount: entry.total,
      fileCount: entry.files.size,
      line: entry.example?.line ?? entry.inFile[0]?.line ?? null,
      maxDepth: entry.maxDepth,
      sinks: entry.inFile,
      graphSinks: entry.graphSinks,
    }))
    .sort((left, right) => right.sinkCount - left.sinkCount);
}

function reachedSinkDescriptor(sink: Sink): ReachedSink {
  const ctx = sink.renderContext ?? {};
  const label = [ctx.tag, ctx.attribute].filter(Boolean).join(" / ");
  return {
    id: sink.id,
    file: sink.file,
    line: sink.line,
    label: label || sink.label || sink.expression || sink.id,
    depth: sink.metrics?.maximumPathDepth ?? 0,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function overviewState(params: URLSearchParams): OverviewState {
  const q = (params.get("q") ?? "").trim();
  const filterParam = params.get("filter");
  const sortParam = params.get("sort");
  const filter = isOverviewFilter(filterParam) ? filterParam : "all";
  const sort = isOverviewSort(sortParam) ? sortParam : "burden";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  return { q, filter, sort, page, all: params.get("all") === "1" };
}

function overviewHref(
  state: OverviewState,
  changes: Partial<OverviewState> = {},
) {
  const next = { ...state, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.filter && next.filter !== "all") params.set("filter", next.filter);
  if (next.sort && next.sort !== "burden") params.set("sort", next.sort);
  if (next.all) params.set("all", "1");
  else if (next.page && next.page !== 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function overviewRows(
  report: Report | undefined,
  state: OverviewState,
): OverviewRow[] {
  if (!report) return [];
  const participating = graphParticipationFiles(report);
  const q = state.q.toLowerCase();
  const typeCounts = entryTypeCountsByFile(report);
  const groups = new Map<string, OverviewGroup>();
  for (const sink of report.sinks ?? []) {
    if (!sink.file) continue;
    const group = groups.get(sink.file) ?? {
      key: sink.file,
      count: 0,
      worst: 0,
      depth: 0,
      shapes: [],
      ownership: [],
      worstSink: null,
    };
    group.count += 1;
    const burden = sink.scores?.burden ?? 0;
    if (burden > group.worst) {
      group.worst = burden;
      group.worstSink = sink;
    }
    group.depth = Math.max(group.depth, sink.metrics?.maximumPathDepth ?? 0);
    group.shapes.push(shapeOf(sink));
    group.ownership.push(ownershipOf(sink));
    groups.set(sink.file, group);
  }
  let rows = [...groups.values()].map((group) => ({
    ...group,
    shape: modalValue(group.shapes),
    ownership: modalValue(group.ownership),
    firstCut: firstCutFor(group.worstSink),
  }));
  rows = rows.filter((row) => {
    const counts = typeCounts.get(row.key) ?? emptyEntryCounts();
    if (state.filter === "findings" && row.count <= 0) return false;
    if (state.filter === "unknown" && !counts.unknown) return false;
    if (state.filter === "participating" && !participating.has(row.key))
      return false;
    if (
      q &&
      ![row.key, row.shape, row.ownership, row.firstCut]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
      return false;
    return true;
  });
  rows.sort((left, right) => {
    if (state.sort === "file") return left.key.localeCompare(right.key);
    if (state.sort === "findings")
      return (
        right.count - left.count ||
        right.worst - left.worst ||
        left.key.localeCompare(right.key)
      );
    if (state.sort === "depth")
      return (
        right.depth - left.depth ||
        right.worst - left.worst ||
        left.key.localeCompare(right.key)
      );
    return right.worst - left.worst || left.key.localeCompare(right.key);
  });
  return rows;
}

function entryTypeCountsByFile(
  report: Report | undefined,
): Map<string, EntryCounts> {
  const counts = new Map<string, EntryCounts>();
  const bump = (file: string | undefined, key: EntryCountKey) => {
    if (!file) return;
    const next = counts.get(file) ?? {
      boundaries: 0,
      relays: 0,
      unknown: 0,
      fanOut: 0,
    };
    next[key] += 1;
    counts.set(file, next);
  };
  for (const helper of report?.helpers ?? []) bump(helper.file, "boundaries");
  for (const relay of report?.contextRelay ?? [])
    bump(relay.parentFile, "relays");
  for (const edge of report?.unknownEdges ?? []) bump(edge.file, "unknown");
  const roots = new Map<string, { count: number; files: Set<string> }>();
  for (const sink of report?.sinks ?? []) {
    if (!sink.file) continue;
    for (const root of sink.roots ?? []) {
      const entry = roots.get(root) ?? { count: 0, files: new Set() };
      entry.count += 1;
      entry.files.add(sink.file);
      roots.set(root, entry);
    }
  }
  for (const entry of roots.values()) {
    if (entry.count < 2) continue;
    for (const file of entry.files) bump(file, "fanOut");
  }
  return counts;
}

function graphParticipationFiles(report: Report): Set<string> {
  const files = new Set<string>();
  for (const node of report?.graph?.nodes ?? [])
    if (node.file) files.add(node.file);
  for (const edge of report?.graph?.edges ?? [])
    if (edge.location?.file) files.add(edge.location.file);
  if (files.size === 0) {
    for (const sink of report?.sinks ?? []) if (sink.file) files.add(sink.file);
  }
  return files;
}

function modalValue(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "—"
  );
}

function emptyEntryCounts(): EntryCounts {
  return { boundaries: 0, relays: 0, unknown: 0, fanOut: 0 };
}

function shapeOf(sink: Sink): string {
  return (
    sink.advice?.primaryShape ??
    sink.advice?.shape ??
    sink.family ??
    sink.kind ??
    "uncategorized"
  );
}

function ownershipOf(sink: Sink): string {
  if ((sink.roots ?? []).some((root) => /^use[A-Z]/.test(root)))
    return "feature hook/context";
  if ((sink.sources ?? []).some((source) => source.kind === "prop"))
    return "props";
  return "local";
}

function firstCutFor(sink: Sink | null): string {
  return (
    sink?.advice?.firstCut ?? sink?.advice?.headline ?? "local boundary cleanup"
  );
}

function isOverviewFilter(value: string | null): value is OverviewFilter {
  return (
    value === "all" ||
    value === "findings" ||
    value === "unknown" ||
    value === "participating"
  );
}

function isOverviewSort(value: string | null): value is OverviewSort {
  return (
    value === "burden" ||
    value === "findings" ||
    value === "depth" ||
    value === "file"
  );
}

function isReportView(value: string | null): value is ReportView {
  return REPORT_VIEWS.includes(value as ReportView);
}

function currentLocation(): URL {
  return new URL(window.location.href);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
render(() => <App />, root);
