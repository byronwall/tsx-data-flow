import {
  For,
  Show,
  createEffect,
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
  boundaryAnchor,
  boundaryGraphSvg,
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
  metrics?: {
    maximumPathDepth?: number;
    mergeWidth?: number;
    controlDependencyCount?: number;
    representationChurn?: number;
    helperHops?: number;
  };
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
  representativeSteps?: Array<{
    file?: string;
    line?: number;
    label?: string;
    kind?: string;
  }>;
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

interface BoundaryHelper {
  name: string;
  file: string;
  line: number;
  inSources?: number;
  callerCount?: number;
  verdict?: string;
  inRoots?: string[];
  callers?: Array<{ file: string; line: number }>;
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
  helpers?: BoundaryHelper[];
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

interface PickerItem {
  key: string;
  href: string;
  label: string;
  value: string;
  optionLabel: string;
  active: boolean;
}

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
  beforeContext?: JSX.Element;
  actions?: JSX.Element;
  tabs?: JSX.Element;
  wide?: boolean;
  children: JSX.Element;
}) {
  let headerRef: HTMLElement | undefined;

  onMount(() => {
    const updateTopbarHeight = () => {
      const height = headerRef?.getBoundingClientRect().height ?? 0;
      document.documentElement.style.setProperty(
        "--topbar-height",
        `${Math.ceil(height)}px`,
      );
    };
    updateTopbarHeight();
    window.addEventListener("resize", updateTopbarHeight);
    const observer =
      "ResizeObserver" in window
        ? new ResizeObserver(updateTopbarHeight)
        : null;
    if (observer && headerRef) observer.observe(headerRef);
    onCleanup(() => {
      window.removeEventListener("resize", updateTopbarHeight);
      observer?.disconnect();
    });
  });

  return (
    <>
      <header class="topbar" ref={headerRef}>
        <div class="topbar-bar">
          <div class="topbar-identity">
            <a class="brand" href="/">
              tsx-dataflow
            </a>
            {props.beforeContext}
            <Show when={props.context}>
              <span class="topbar-context" title={props.context}>
                {props.context}
              </span>
            </Show>
          </div>
          <Show when={props.actions}>
            <div class="topbar-actions">{props.actions}</div>
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
  const boundaryHtml = createMemo(() => {
    if (view() !== "boundary-report") return "";
    return renderBoundaryViewer(meta(), props.location);
  });
  const fanInHtml = createMemo(() => {
    if (view() !== "fan-in") return "";
    return renderFanInViewer(meta(), props.location);
  });
  const junctionHtml = createMemo(() => {
    if (view() !== "junctions") return "";
    return renderJunctionViewer(meta(), props.location);
  });
  const propRelayHtml = createMemo(() => {
    if (view() !== "prop-relay") return "";
    return renderPropRelayViewer(meta(), props.location);
  });
  const networkHtml = createMemo(
    () =>
      fanOutHtml() ||
      boundaryHtml() ||
      fanInHtml() ||
      junctionHtml() ||
      propRelayHtml(),
  );
  const markdownHtml = createMemo(() => markdownToHtml(report() ?? ""));
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
          when={networkHtml()}
          fallback={<div class="body" innerHTML={markdownHtml()} />}
        >
          <div class="body">
            <div innerHTML={networkHtml()} />
            <section class="md-mirror" aria-label="Markdown report">
              <div innerHTML={markdownHtml()} />
            </section>
          </div>
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
      beforeContext={
        <a class="topbar-back" href="/">
          ← Overview
        </a>
      }
      actions={
        <>
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
        </>
      }
      tabs={<FileTabs path={relPath()} active={activeView()} />}
      wide
    >
      <Show when={relPath()} fallback={<p class="meta">Missing ?path.</p>}>
        <Show
          when={!fileData.loading}
          fallback={<p class="meta">Loading file...</p>}
        >
          <Show
            when={activeView()}
            fallback={
              <>
                <CodeMap
                  location={props.location}
                  relPath={relPath()}
                  source={fileData()?.source ?? ""}
                  report={fileData()?.report}
                  fullReport={fileData()?.fullReport}
                />
              </>
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
  location: URL;
  relPath: string;
  source: string;
  report?: Report | null;
  fullReport?: Report | null;
}) {
  let rootRef: HTMLDivElement | undefined;
  const [selected, setSelected] = createSignal(
    props.location.searchParams.get("finding"),
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

  const currentMap = () => rootRef?.querySelector(".codemap");

  const rowForLine = (line: string) =>
    currentMap()?.querySelector(`tr[data-line="${CSS.escape(line)}"]`);

  const jumpToLine = (line: string | undefined | null) => {
    if (!line) return;
    const row = rowForLine(line);
    row?.scrollIntoView({ block: "center" });
    row?.classList.add("flash");
    window.setTimeout(() => row?.classList.remove("flash"), 850);

    const url = new URL(window.location.href);
    url.hash = `L${line}`;
    window.history.replaceState({}, "", url);
  };

  const scrollSelectedFinding = (id: string | null) => {
    if (!id) return;
    const map = currentMap();
    if (!map) return;
    const panel = map.querySelector(".panel");
    const finding = panel?.querySelector(
      `.finding[data-finding="${CSS.escape(id)}"]`,
    );
    finding?.scrollIntoView({ block: "nearest" });
    const hit = Array.from(map.querySelectorAll<HTMLElement>(".hit")).find(
      (node) => (node.dataset.findings ?? "").split(",").includes(id),
    );
    if (hit) {
      map
        .querySelectorAll(".hit.sel")
        .forEach((node) => node.classList.remove("sel"));
      hit.classList.add("sel");
      hit.scrollIntoView({ block: "center" });
      return;
    }
    if (finding instanceof HTMLElement) jumpToLine(finding.dataset.sinkLine);
  };

  createEffect(() => {
    const nextFinding = props.location.searchParams.get("finding");
    setSelected(nextFinding);
    window.requestAnimationFrame(() => {
      const hashLine = props.location.hash.match(/^#L(\d+)$/)?.[1];
      if (nextFinding) scrollSelectedFinding(nextFinding);
      else if (hashLine) jumpToLine(hashLine);
    });
  });

  createEffect(() => {
    const id = selected();
    html();
    window.requestAnimationFrame(() => {
      if (id) scrollSelectedFinding(id);
    });
  });

  const selectFinding = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("finding", id);
    else url.searchParams.delete("finding");
    if (id) url.hash = "";
    window.history.replaceState({}, "", url);
    setSelected(id);
  };

  const onCodeMapClick: JSX.EventHandler<HTMLDivElement, MouseEvent> = (
    event,
  ) => {
    if (!(event.target instanceof Element)) return;
    const back = event.target.closest(".panel-back");
    if (back) {
      event.preventDefault();
      selectFinding(null);
      return;
    }
    const line = event.target.closest(".goto-line, .path-step-no");
    if (line instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      jumpToLine(line.dataset.line);
      return;
    }
    const hit = event.target.closest(".hit");
    if (hit instanceof HTMLElement) {
      const firstId = (hit.dataset.findings ?? "").split(",").find(Boolean);
      if (firstId) selectFinding(firstId);
      return;
    }
    const row = event.target.closest(".finding-row, .xref");
    if (row instanceof HTMLElement && row.dataset.finding) {
      event.preventDefault();
      selectFinding(row.dataset.finding);
      return;
    }
    const sinkRow = event.target.closest("tr.has-sink");
    if (sinkRow instanceof HTMLElement) {
      const firstId = Array.from(sinkRow.querySelectorAll<HTMLElement>(".hit"))
        .flatMap((node) => (node.dataset.findings ?? "").split(","))
        .find(Boolean);
      if (firstId) selectFinding(firstId);
    }
  };

  return <div ref={rootRef} onClick={onCodeMapClick} innerHTML={html()} />;
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
  const sortKey = location.searchParams.get("fosort") ?? "spread";
  const tabs = renderPickerTabs(
    entries.map((entry) => ({
      key: fanOutAnchor(entry.root),
      href: hrefFor({ fanout: fanOutAnchor(entry.root) }),
      label: entry.root,
      value: String(fanOutValue(entry, sortKey)),
      optionLabel: `${entry.root} · ${entry.sinkCount} sinks · depth ${entry.maxDepth} · ${entry.fileCount} file(s)`,
      active: entry === active,
    })),
    { id: "fanout-src", ariaLabel: "Other fan-out sources" },
  );
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

function renderBoundaryViewer(
  report: Report | undefined,
  location: URL,
): string {
  const helpers = report?.helpers ?? [];
  if (!helpers.length) {
    return '<p class="meta">No first-party helper functions were reached on a render path. (Imported library calls stay opaque; try --max-helper-depth.)</p>';
  }
  const selected = location.searchParams.get("boundary");
  const active =
    helpers.find((helper) => boundaryAnchor(helper) === selected) ?? helpers[0];
  const hrefFor = (changes: Record<string, string>) => {
    const params = new URLSearchParams(location.searchParams);
    params.set("view", "boundary-report");
    for (const [key, value] of Object.entries(changes)) params.set(key, value);
    return `/report?${params.toString()}`;
  };
  const tabs = renderPickerTabs(
    helpers.map((helper) => ({
      key: boundaryAnchor(helper),
      href: hrefFor({ boundary: boundaryAnchor(helper) }),
      label: helper.name,
      value: helper.verdict ?? "",
      optionLabel: `${helper.name} · ${helper.callerCount ?? 0} caller(s) · ${helper.verdict ?? "boundary"}`,
      active: helper === active,
    })),
    { id: "boundary-src", ariaLabel: "Other boundaries" },
  );
  const definedAt = `${active.file}:${active.line}`;
  return `<p class="meta fo-explain">A <strong>boundary</strong> is a first-party function on a render path. The diagram shows inbound source lineages on the left, the function in the middle, and the call sites it re-spreads to on the right.</p>
<div class="fo-controls"><div class="fo-tabs">${tabs}</div></div>
<section class="fanout-entry" id="${boundaryAnchor(active)}">
  <h3>${escapeHtml(active.name)}() <span class="fo-tag fo-tag-cross">${escapeHtml(
    active.verdict ?? "boundary",
  )}</span> <span class="meta">· ${active.inSources ?? 0} inbound source(s) · ${
    active.callerCount ?? 0
  } caller(s) · defined at <a class="xfile" href="/file?path=${encodeURIComponent(
    active.file,
  )}#L${active.line}">${escapeHtml(definedAt)}</a></span></h3>
  ${boundaryGraphSvg(active)}
</section>`;
}

function renderFanInViewer(report: Report | undefined, location: URL): string {
  const entries = fanInEntries(report?.sinks ?? []);
  if (!entries.length) {
    return '<p class="meta">No render sink has multiple traced root sources.</p>';
  }
  const selected = location.searchParams.get("fanin");
  const active = entries.find((entry) => entry.key === selected) ?? entries[0];
  const hrefFor = (key: string) => {
    const params = new URLSearchParams(location.searchParams);
    params.set("view", "fan-in");
    params.set("fanin", key);
    return `/report?${params.toString()}`;
  };
  const tabs = renderPickerTabs(
    entries.map((entry) => ({
      key: entry.key,
      href: hrefFor(entry.key),
      label: entry.label,
      value: String(entry.rootCount),
      optionLabel: `${entry.label} · ${entry.rootCount} roots · depth ${entry.depth}`,
      active: entry === active,
    })),
    { id: "fanin-src", ariaLabel: "Other fan-in sinks" },
  );
  return `<p class="meta fo-explain">A <strong>fan-in</strong> is one render sink fed by many source lineages. Pick a sink to see the inputs converging into it.</p>
<div class="fo-controls"><div class="fo-tabs">${tabs}</div></div>
<section class="fanout-entry" id="${escapeAttr(active.key)}">
  <h3>${escapeHtml(active.label)} <span class="fo-tag fo-tag-cross">${active.rootCount} roots</span> <span class="meta">· max depth ${active.depth} · predicates ${active.predicates}</span></h3>
  ${relationshipGraphSvg({
    ariaLabel: `Fan-in graph for ${active.label}`,
    leftTitle: `root sources (${active.roots.length})`,
    left: active.roots,
    middleLabel: active.label,
    middleSub: `depth ${active.depth}`,
    middleHref: active.file
      ? `/file?path=${encodeURIComponent(active.file)}#L${active.line}`
      : null,
    rightTitle: "render sink",
    right: [
      {
        label: `${active.file}:${active.line}`,
        file: active.file,
        line: active.line,
      },
    ],
  })}
</section>`;
}

function renderJunctionViewer(
  report: Report | undefined,
  location: URL,
): string {
  const entries = (report?.helpers ?? [])
    .filter(
      (helper) =>
        (helper.inSources ?? 0) >= 3 && (helper.callerCount ?? 0) >= 2,
    )
    .sort(
      (left, right) =>
        (right.inSources ?? 0) * Math.max(1, right.callerCount ?? 0) -
        (left.inSources ?? 0) * Math.max(1, left.callerCount ?? 0),
    );
  if (!entries.length) {
    return '<p class="meta">No junction helpers merge >=3 source lineages and re-spread to >=2 callers.</p>';
  }
  const selected = location.searchParams.get("junction");
  const active =
    entries.find((helper) => boundaryAnchor(helper) === selected) ?? entries[0];
  const hrefFor = (key: string) => {
    const params = new URLSearchParams(location.searchParams);
    params.set("view", "junctions");
    params.set("junction", key);
    return `/report?${params.toString()}`;
  };
  const tabs = renderPickerTabs(
    entries.map((helper) => ({
      key: boundaryAnchor(helper),
      href: hrefFor(boundaryAnchor(helper)),
      label: helper.name,
      value: `${helper.inSources ?? 0}×${helper.callerCount ?? 0}`,
      optionLabel: `${helper.name} · ${helper.inSources ?? 0} in · ${helper.callerCount ?? 0} out`,
      active: helper === active,
    })),
    { id: "junction-src", ariaLabel: "Other junctions" },
  );
  return `<p class="meta fo-explain">A <strong>junction</strong> is a helper where independent source lineages converge and then re-spread to multiple callers.</p>
<div class="fo-controls"><div class="fo-tabs">${tabs}</div></div>
<section class="fanout-entry" id="${boundaryAnchor(active)}">
  <h3>${escapeHtml(active.name)}() <span class="fo-tag fo-tag-cross">junction</span> <span class="meta">· ${active.inSources ?? 0} in · ${active.callerCount ?? 0} out</span></h3>
  ${boundaryGraphSvg(active)}
</section>`;
}

function renderPropRelayViewer(
  report: Report | undefined,
  location: URL,
): string {
  const entries = propRelayEntries(report?.sinks ?? []);
  if (!entries.length) {
    return '<p class="meta">No sinks show prop-relay style wrapper steps.</p>';
  }
  const selected = location.searchParams.get("relay");
  const active = entries.find((entry) => entry.key === selected) ?? entries[0];
  const hrefFor = (key: string) => {
    const params = new URLSearchParams(location.searchParams);
    params.set("view", "prop-relay");
    params.set("relay", key);
    return `/report?${params.toString()}`;
  };
  const tabs = renderPickerTabs(
    entries.map((entry) => ({
      key: entry.key,
      href: hrefFor(entry.key),
      label: entry.label,
      value: String(entry.wrapperSteps),
      optionLabel: `${entry.label} · ${entry.wrapperSteps} wrapper steps · ${entry.boundaries} boundaries`,
      active: entry === active,
    })),
    { id: "relay-src", ariaLabel: "Other prop relays" },
  );
  return `<p class="meta fo-explain">A <strong>prop relay</strong> is a value carried through component boundaries or wrapper steps before it renders.</p>
<div class="fo-controls"><div class="fo-tabs">${tabs}</div></div>
<section class="fanout-entry" id="${escapeAttr(active.key)}">
  <h3>${escapeHtml(active.label)} <span class="fo-tag fo-tag-cross">${active.wrapperSteps} wrapper step(s)</span> <span class="meta">· ${active.boundaries} component boundary step(s)</span></h3>
  ${relationshipGraphSvg({
    ariaLabel: `Prop relay graph for ${active.label}`,
    leftTitle: `source lineages (${active.roots.length})`,
    left: active.roots,
    middleLabel: `${active.wrapperSteps} wrapper step(s)`,
    middleSub: `${active.boundaries} boundary step(s)`,
    middleHref: null,
    rightTitle: "render sink",
    right: [
      {
        label: `${active.file}:${active.line}`,
        file: active.file,
        line: active.line,
      },
    ],
  })}
</section>`;
}

function renderPickerTabs(
  items: PickerItem[],
  options: { id: string; ariaLabel: string; limit?: number },
): string {
  const limit = options.limit ?? 8;
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const tabs = shown.map((item) => renderPickerTab(item)).join("");
  const dropdown = rest.length
    ? renderOverflowPicker(rest, options.id, options.ariaLabel)
    : "";
  return `${tabs}${dropdown}`;
}

function renderPickerTab(item: PickerItem): string {
  return `<a class="fo-tab${item.active ? " active" : ""}"${
    item.active ? ' aria-current="true"' : ""
  } href="${escapeAttr(item.href)}">${escapeHtml(item.label)} <span class="fo-tab-val">${escapeHtml(
    item.value,
  )}</span></a>`;
}

function renderOverflowPicker(
  items: PickerItem[],
  id: string,
  ariaLabel: string,
): string {
  const active = items.find((item) => item.active);
  const label = active?.label ?? `+${items.length} more`;
  const options = items
    .map(
      (item) =>
        `<a role="option" class="popover-opt${item.active ? " active" : ""}"${
          item.active ? ' aria-selected="true"' : ""
        } href="${escapeAttr(item.href)}">${escapeHtml(item.optionLabel)}</a>`,
    )
    .join("");
  return `<div class="popover open-on-hover" data-popover-id="${escapeAttr(id)}">
  <span class="fo-tab popover-trigger${active ? " active" : ""}" role="button" aria-haspopup="listbox" aria-expanded="false">
    ${escapeHtml(label)} <span class="fo-tab-val">▾</span>
  </span>
  <div class="popover-panel" role="listbox" aria-label="${escapeAttr(ariaLabel)}">${options}</div>
</div>`;
}

function fanOutValue(entry: FanOutEntry, sortKey: string): string {
  if (sortKey === "depth") return String(entry.maxDepth);
  if (sortKey === "files") return `${entry.fileCount}f`;
  if (sortKey === "name") return `${entry.sinkCount}`;
  return String(entry.sinkCount);
}

function fanInEntries(sinks: Sink[]) {
  return sinks
    .map((sink) => {
      const roots = sourceLabelsForSink(sink);
      return {
        key: `fanin-${sink.id}`,
        label: sinkLabel(sink),
        file: sink.file ?? "",
        line: sink.line ?? 0,
        roots,
        rootCount: sink.metrics?.mergeWidth ?? roots.length,
        predicates: sink.metrics?.controlDependencyCount ?? 0,
        depth: sink.metrics?.maximumPathDepth ?? 0,
      };
    })
    .filter((entry) => entry.rootCount >= 2 || entry.roots.length >= 2)
    .sort(
      (left, right) =>
        right.rootCount - left.rootCount || right.depth - left.depth,
    );
}

function propRelayEntries(sinks: Sink[]) {
  return sinks
    .map((sink) => {
      const roots = sourceLabelsForSink(sink);
      const wrapperSteps = sink.metrics?.representationChurn ?? 0;
      const boundaries = Math.max(0, (sink.metrics?.mergeWidth ?? 1) - 1);
      const helperHops = sink.metrics?.helperHops ?? 0;
      return {
        key: `relay-${sink.id}`,
        label: sinkLabel(sink),
        file: sink.file ?? "",
        line: sink.line ?? 0,
        roots,
        wrapperSteps,
        boundaries,
        helperHops,
        depth: sink.metrics?.maximumPathDepth ?? 0,
      };
    })
    .filter(
      (entry) =>
        entry.wrapperSteps > 0 || entry.boundaries > 0 || entry.helperHops > 0,
    )
    .sort(
      (left, right) =>
        right.boundaries - left.boundaries ||
        right.wrapperSteps - left.wrapperSteps ||
        right.depth - left.depth,
    );
}

function sourceLabelsForSink(sink: Sink): string[] {
  const labels = fanOutRootsFor(sink).map((info) => info.label);
  if (!labels.length) labels.push(...(sink.roots ?? []));
  return [...new Set(labels)].slice(0, 12);
}

function sinkLabel(sink: Sink): string {
  const ctx = sink.renderContext ?? {};
  const rendered = [ctx.component ?? ctx.tag, ctx.attribute]
    .filter(Boolean)
    .join(" / ");
  const label =
    rendered || sink.label || sink.expression || sink.target || sink.id;
  return `${sink.file ? `:${sink.line} ` : ""}${label}`;
}

function relationshipGraphSvg(options: {
  ariaLabel: string;
  leftTitle: string;
  left: string[];
  middleLabel: string;
  middleSub: string;
  middleHref: string | null;
  rightTitle: string;
  right: Array<{ label: string; file?: string; line?: number }>;
}): string {
  const left = options.left.length ? options.left : ["(no traced inputs)"];
  const right = options.right.length
    ? options.right
    : [{ label: "(no resolved sinks)" }];
  const nodeH = 24;
  const gap = 10;
  const colW = 210;
  const midW = 190;
  const midGap = 56;
  const midX = colW + midGap;
  const rightX = midX + midW + midGap;
  const width = rightX + colW;
  const rows = Math.max(left.length, right.length, 1);
  const height = Math.max(124, 48 + rows * (nodeH + gap));
  const midCy = height / 2;
  const cyOf = (index: number, count: number) => {
    const blockH = Math.max(0, count * (nodeH + gap) - gap);
    return (height - blockH) / 2 + index * (nodeH + gap) + nodeH / 2;
  };
  const sourceHsl = "262 60% 52%";
  const sinkHsl = "150 55% 40%";
  const edges: string[] = [];
  const nodes: string[] = [];
  nodes.push(
    `<text x="0" y="16" font-size="11" font-weight="600" fill="var(--muted)">${escapeHtml(options.leftTitle)}</text>`,
    `<text x="${rightX}" y="16" font-size="11" font-weight="600" fill="var(--muted)">${escapeHtml(options.rightTitle)}</text>`,
  );
  left.forEach((label, index) => {
    const cy = cyOf(index, left.length);
    nodes.push(
      `<g class="fg-node"><rect class="fg-hit" x="0" y="${cy - nodeH / 2}" width="${colW}" height="${nodeH}" rx="6" fill="hsl(${sourceHsl} / 0.08)" stroke="hsl(${sourceHsl} / 0.5)"/><text x="12" y="${cy + 4}" font-size="11" fill="currentColor">${escapeHtml(truncText(label, 30))}</text></g>`,
    );
    edges.push(
      `<path d="M${colW} ${cy} C ${colW + 30} ${cy}, ${midX - 30} ${midCy}, ${midX} ${midCy}" fill="none" stroke="hsl(${sourceHsl} / 0.5)" stroke-width="1.4"/>`,
    );
  });
  right.forEach((item, index) => {
    const cy = cyOf(index, right.length);
    const content = `<g class="fg-node"><rect class="fg-hit" x="${rightX}" y="${cy - nodeH / 2}" width="${colW}" height="${nodeH}" rx="6" fill="hsl(${sinkHsl} / 0.08)" stroke="hsl(${sinkHsl} / 0.5)"/><text x="${rightX + 12}" y="${cy + 4}" font-size="11" fill="currentColor">${escapeHtml(truncText(item.label, 30))}</text></g>`;
    nodes.push(
      item.file && item.line
        ? `<a class="xfile" href="/file?path=${encodeURIComponent(item.file)}#L${item.line}">${content}</a>`
        : content,
    );
    edges.push(
      `<path d="M${midX + midW} ${midCy} C ${midX + midW + 30} ${midCy}, ${rightX - 30} ${cy}, ${rightX} ${cy}" fill="none" stroke="hsl(${sinkHsl} / 0.5)" stroke-width="1.4"/>`,
    );
  });
  const midNode = `<g class="fg-src"><rect x="${midX}" y="${midCy - 18}" width="${midW}" height="36" rx="8" fill="hsl(205 70% 50% / 0.16)" stroke="hsl(205 70% 50%)" stroke-width="2"/>
    <text x="${midX + 12}" y="${midCy - 2}" font-size="11.5" font-weight="600" fill="currentColor">${escapeHtml(truncText(options.middleLabel, 24))}</text>
    <text x="${midX + 12}" y="${midCy + 13}" font-size="10" fill="var(--muted)">${escapeHtml(options.middleSub)}</text></g>`;
  const middle = options.middleHref
    ? `<a class="xfile" href="${escapeAttr(options.middleHref)}">${midNode}</a>`
    : midNode;
  return `<div class="fanout-graph">
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${escapeAttr(options.ariaLabel)}">
    ${edges.join("")}
    ${nodes.join("")}
    ${middle}
  </svg>
  <div class="fg-legend"><span class="fg-key"><span class="fg-swatch" style="background:hsl(${sourceHsl})"></span>${escapeHtml(options.leftTitle)}</span><span class="fg-key"><span class="fg-swatch" style="background:hsl(205 70% 50%)"></span>selected node</span><span class="fg-key"><span class="fg-swatch" style="background:hsl(${sinkHsl})"></span>${escapeHtml(options.rightTitle)}</span></div>
</div>`;
}

function truncText(value: unknown, max: number): string {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
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
