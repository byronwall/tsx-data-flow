import { renderMarkdownView, REPORT_VIEWS } from "../core.mjs";
import {
  entryTypeCountsByFile,
  fanOutEntriesForFile,
  firstCutFor,
  hotspotGroups,
  modalValue,
} from "../reports/overview-selectors.mjs";
import { markdownToHtml } from "../html/markdown-to-html.mjs";
import { escapeHtml } from "../html/escape.mjs";
import { page } from "../html/page.mjs";
import { renderCodeMap } from "../html/code-map.mjs";
import { peekReferences } from "../html/source-peek.mjs";
import { FILE_VIEWS, VIEW_LABELS, viewLabel } from "./view-config.mjs";
import {
  OVERVIEW_PAGE_SIZE,
  OVERVIEW_TYPE_COLUMNS,
  SORT_HEADING,
} from "./overview-config.mjs";
import { overviewHref, overviewState, paramHref } from "./url-helpers.mjs";
import { popover, reportTabs } from "./network-viewers.mjs";
export {
  boundaryViewer,
  fanOutViewer,
  reportTabs,
} from "./network-viewers.mjs";

function graphParticipationFiles(report) {
  const files = new Set();
  for (const node of report.graph?.nodes ?? []) {
    if (node.file) files.add(node.file);
  }
  for (const edge of report.graph?.edges ?? []) {
    if (edge.location?.file) files.add(edge.location.file);
  }
  return files;
}

function fileHasUnknownEdges(group) {
  return group.worstSink?.metrics?.unknownEdgeCount > 0;
}

function searchableGroupText(group) {
  return [
    group.key,
    modalValue(group.shapes),
    modalValue(group.ownership),
    firstCutFor(group.worstSink),
  ]
    .join(" ")
    .toLowerCase();
}

function overviewRows(report, state) {
  const participating = graphParticipationFiles(report);
  const q = state.q.toLowerCase();
  const groups = hotspotGroups(report, "file").filter((group) => {
    // "findings" was an accepted filter value with no handler — it silently
    // behaved like "all". Honor it: only files that actually have a finding.
    if (state.filter === "findings" && !(group.count > 0)) return false;
    if (state.filter === "unknown" && !fileHasUnknownEdges(group)) return false;
    if (state.filter === "participating" && !participating.has(group.key))
      return false;
    if (q && !searchableGroupText(group).includes(q)) return false;
    return true;
  });
  const sorted = [...groups];
  sorted.sort((left, right) => {
    if (state.sort === "file") return left.key.localeCompare(right.key);
    if (state.sort === "findings") {
      return (
        right.count - left.count ||
        right.worst - left.worst ||
        left.key.localeCompare(right.key)
      );
    }
    if (state.sort === "depth") {
      const leftDepth = left.worstSink?.metrics?.maximumPathDepth ?? 0;
      const rightDepth = right.worstSink?.metrics?.maximumPathDepth ?? 0;
      return (
        rightDepth - leftDepth ||
        right.worst - left.worst ||
        left.key.localeCompare(right.key)
      );
    }
    // The "Worst" column shows each file's single highest burden (g.worst), so
    // sort by that — not by summed burden, which made the column look unsorted.
    return (
      right.worst - left.worst ||
      right.sumBurden - left.sumBurden ||
      left.key.localeCompare(right.key)
    );
  });
  return sorted;
}
export function renderOverview(report, url = new URL("http://localhost/")) {
  const state = overviewState(url);
  const s = report.summary;
  const cards = [
    ["Sinks", s.sinks],
    ["Sources", s.sources],
    ["Path families", s.pathFamilies],
    ["Unknown edges", s.unknownEdges],
    ["Graph nodes", s.nodes],
  ]
    .map(
      ([label, n]) =>
        `<div class="card"><div class="n">${n}</div><div class="l">${label}</div></div>`,
    )
    .join("");

  const groups = overviewRows(report, state);
  const typeCounts = entryTypeCountsByFile(report);
  const showAll = state.all;
  const totalPages = Math.max(1, Math.ceil(groups.length / OVERVIEW_PAGE_SIZE));
  const currentPage = showAll ? 1 : Math.min(state.page, totalPages);
  const pageState = { ...state, page: currentPage };
  const pageStart = showAll ? 0 : (currentPage - 1) * OVERVIEW_PAGE_SIZE;
  const pageGroups = showAll
    ? groups
    : groups.slice(pageStart, pageStart + OVERVIEW_PAGE_SIZE);
  const typeCells = (file) => {
    const c = typeCounts.get(file) ?? {};
    return OVERVIEW_TYPE_COLUMNS.map(
      ({ key, col }) =>
        `<td class="col-${col} num">${c[key] ? c[key] : '<span class="meta">·</span>'}</td>`,
    ).join("");
  };
  const rows = pageGroups
    .map(
      (g) => `<tr>
<td><a href="/file?path=${encodeURIComponent(g.key)}">${escapeHtml(g.key)}</a></td>
<td>${g.count}</td>
<td>${g.worst.toFixed(2)}</td>
<td>${g.worstSink?.metrics?.maximumPathDepth ?? 0}</td>
${typeCells(g.key)}
<td>${escapeHtml(modalValue(g.shapes))}</td>
<td>${escapeHtml(modalValue(g.ownership))}</td>
<td>${escapeHtml(firstCutFor(g.worstSink))}</td>
</tr>`,
    )
    .join("");

  const conc = report.concentration;
  const concNote =
    conc && conc.fileCount > 0
      ? `<p class="meta">Top ${Math.min(5, conc.fileCount)} file(s) hold ${Math.round(
          conc.top5 * 100,
        )}% of ranked burden · ${conc.fileCount} file(s) with ≥1 finding, ${
          conc.hot4Plus
        } with ≥4.</p>`
      : "";

  // A sortable column header: clicking re-sorts; the active column shows a caret.
  const sortHeader = (sort, label) => {
    const active = state.sort === sort;
    // CARET-1: the caret is a flex sibling pushed to the right, never wrapping to
    // a new line or growing the header height. The label sits in its own span.
    const caret = active
      ? '<span class="caret" aria-hidden="true">▼</span>'
      : "";
    return `<th class="sortable${active ? " active" : ""}"${
      active ? ' aria-sort="descending"' : ""
    }><a href="${escapeHtml(
      overviewHref(pageState, { sort, page: 1 }),
    )}"><span class="th-label">${escapeHtml(label)}</span>${caret}</a></th>`;
  };
  // SHELL-5: filter/sort are custom popovers (no native <select>). Each option is a
  // link that navigates (state in the URL), resetting pagination to the first page.
  const filterPopover = popover({
    id: "filter",
    label: "Show",
    ariaLabel: "Filter files",
    options: [
      ["all", "All files"],
      ["findings", "Files with findings"],
      ["unknown", "Files with unknown edges"],
      ["participating", "Graph-participating files"],
    ].map(([value, label]) => ({
      label,
      href: paramHref(url, { filter: value, page: null }),
      active: state.filter === value,
    })),
  });
  const sortPopover = popover({
    id: "sort",
    label: "Sort",
    ariaLabel: "Sort files",
    options: [
      ["burden", "Burden"],
      ["findings", "Finding count"],
      ["depth", "Path depth"],
      ["file", "File path"],
    ].map(([value, label]) => ({
      label,
      href: paramHref(url, { sort: value, page: null }),
      active: state.sort === value,
    })),
  });
  // OVERVIEW-1: optional per-type columns + a control to choose which show. The
  // count columns are not sortable in this first slice (plain headers).
  const typeHeaders = OVERVIEW_TYPE_COLUMNS.map(
    ({ col, label }) => `<th class="col-${col} num">${escapeHtml(label)}</th>`,
  ).join("");
  const columnToggle = `<fieldset class="col-toggle" id="col-toggle" aria-label="Show or hide columns">
  <span class="meta">Columns:</span>
  ${OVERVIEW_TYPE_COLUMNS.map(
    ({ col, label }) =>
      `<label><input type="checkbox" data-col="${col}" checked> ${escapeHtml(label)}</label>`,
  ).join("")}
</fieldset>`;
  const rangeEnd = showAll
    ? groups.length
    : Math.min(groups.length, pageStart + pageGroups.length);
  const pageSummary =
    groups.length > 0
      ? showAll
        ? `Showing all ${groups.length} file${groups.length === 1 ? "" : "s"}`
        : `Showing ${pageStart + 1}-${rangeEnd} of ${groups.length} file${groups.length === 1 ? "" : "s"}`
      : "No matching files";
  // Show-all toggle: let the user opt out of paging and see everything at once.
  const showAllToggle =
    groups.length > OVERVIEW_PAGE_SIZE
      ? showAll
        ? `<a class="btn" href="${escapeHtml(overviewHref({ ...pageState, all: false, page: 1 }))}">Paginate</a>`
        : `<a class="btn" href="${escapeHtml(overviewHref({ ...pageState, all: true }))}">Show all ${groups.length}</a>`
      : "";
  const pagination =
    !showAll && totalPages > 1
      ? `<nav class="pager" aria-label="File result pages">
  <a class="btn${currentPage === 1 ? " disabled" : ""}" href="${escapeHtml(
    currentPage === 1
      ? overviewHref(pageState)
      : overviewHref(pageState, { page: currentPage - 1 }),
  )}">Previous</a>
  <span class="meta">Page ${currentPage} of ${totalPages}</span>
  <a class="btn${currentPage === totalPages ? " disabled" : ""}" href="${escapeHtml(
    currentPage === totalPages
      ? overviewHref(pageState)
      : overviewHref(pageState, { page: currentPage + 1 }),
  )}">Next</a>
  ${showAllToggle}
</nav>`
      : showAllToggle
        ? `<nav class="pager" aria-label="File result pages">${showAllToggle}</nav>`
        : "";

  // HOME-1 + FANOUT-LIST-1: the cross-file fan-outs live here as a selectable viewer
  // SHELL-4: the overview no longer renders the fan-out graph inline. Now that the
  // Fan-out tab hosts the same viewer (and the agent-facing markdown), an inline
  // copy on the homepage was redundant — the user clicks the Fan-out tab for it.
  const body = `<div class="toolbar">
  <h1 style="margin:0">Render-path overview</h1>
  <form action="/refresh" method="post"><button type="submit">↻ Re-analyze</button></form>
</div>
<div class="cards">${cards}</div>
<div class="toolbar">
  <form action="/" method="get">
    <input name="q" type="search" value="${escapeHtml(state.q)}" placeholder="Search files and reports">
    ${state.filter !== "all" ? `<input type="hidden" name="filter" value="${escapeHtml(state.filter)}">` : ""}
    ${state.sort !== "burden" ? `<input type="hidden" name="sort" value="${escapeHtml(state.sort)}">` : ""}
    <button type="submit">Search</button>
  </form>
  ${filterPopover}
  ${sortPopover}
  <a class="btn" href="/">Reset</a>
</div>
<h2>${escapeHtml(SORT_HEADING[state.sort] ?? "Files")}</h2>
${concNote}
<p class="meta">Each row is one file on a render path. <strong>Findings</strong> = ranked findings in it; <strong>Worst</strong> = its highest burden score; <strong>Path depth</strong> = longest source→sink chain. Click a column header to re-sort.</p>
<p class="meta">${escapeHtml(pageSummary)}</p>
${columnToggle}
<table class="overview-table" id="overview-table">
<thead><tr>${sortHeader("file", "File")}${sortHeader(
    "findings",
    "Findings",
  )}${sortHeader("burden", "Worst")}${sortHeader(
    "depth",
    "Path depth",
  )}${typeHeaders}<th>Dominant shape</th><th>Ownership</th><th>First cut</th></tr></thead>
<tbody>${rows || `<tr><td colspan="${7 + OVERVIEW_TYPE_COLUMNS.length}" class="meta">No matching files.</td></tr>`}</tbody>
</table>
${pagination}`;

  return page({
    title: "tsx-dataflow",
    body,
    tabs: reportTabs(null),
    context: report.meta.root,
  });
}

// SHELL-3: the file page is a tab strip — the code map is its own first tab, then one
// tab per file-scoped report. The active tab lives in `?view=` (empty/"codemap" = the
// code map), so a refresh restores the same tab.
function fileTabs(relPath, activeView) {
  const base = `/file?path=${encodeURIComponent(relPath)}`;
  const onMap = !activeView || activeView === "codemap";
  const tabs = [
    `<a class="report-tab${onMap ? " active" : ""}"${
      onMap ? ' aria-current="page"' : ""
    } href="${base}">Code map</a>`,
    ...FILE_VIEWS.map((view) => {
      const on = view === activeView;
      return `<a class="report-tab${on ? " active" : ""}"${
        on ? ' aria-current="page"' : ""
      } href="${base}&view=${encodeURIComponent(view)}">${escapeHtml(
        VIEW_LABELS[view] ?? view,
      )}</a>`;
    }),
  ];
  return `<nav class="report-tabs" aria-label="File sections">${tabs.join("")}</nav>`;
}

export function renderFilePage(
  report,
  relPath,
  source,
  args,
  openView,
  resolveSource,
  selectedFinding = null,
  fullReport = null,
) {
  const sinks = report.rankings.all.filter((sink) => sink.file === relPath);
  // ARCH-1/TS-1/ARCH-2: pull EVERY analysis type for this file so it appears in
  // the unified inventory — repeated forks, junction/boundary helpers, unknown
  // edges, context relays, and fan-out roots. These are also the only content on
  // a sink-less .ts waypoint.
  const forks = (report.repeatedForks ?? []).filter((f) => f.file === relPath);
  const helpers = (report.helpers ?? []).filter((h) => h.file === relPath);
  const unknownEdges = (report.unknownEdges ?? []).filter(
    (u) => u.file === relPath,
  );
  const relays = (report.contextRelay ?? []).filter(
    (r) => r.parentFile === relPath,
  );
  // Fan-out is computed over the GLOBAL sinks (true cross-file reach) but kept to
  // roots that touch this file; fall back to the file-scoped report if the global
  // one is unavailable (e.g. in tests).
  const fanOut = fanOutEntriesForFile(
    (fullReport ?? report).rankings.all,
    relPath,
  );

  const codeMap = source
    ? renderCodeMap({
        relPath,
        source,
        sinks,
        meta: report.meta,
        resolveSource,
        selectedFinding,
        forks,
        helpers,
        unknownEdges,
        relays,
        fanOut,
      })
    : `<p class="meta">Source not found on disk: ${escapeHtml(relPath)}</p>`;

  // SHELL-3: render exactly one tab's content — the code map (default), or the one
  // selected file-scoped report. No more stacked `<details>`; the tab strip in the
  // top bar switches views, with the active tab in `?view=`.
  const activeView = FILE_VIEWS.includes(openView) ? openView : null;
  const codeMapPane = `<h2 id="codemap">Code map</h2>
<p class="meta">Lines with a colored dot render a ranked finding — click to inspect. Color signals <strong>burden</strong> (severity): the hotter the line, the heavier the render path. Faintly bordered lines lie on a representative path through this file.</p>
<div class="heat-legend"><span>low burden</span><span class="bar"></span><span>high burden</span></div>
${codeMap}`;
  let pane;
  if (activeView) {
    const md = renderMarkdownView(report, {
      ...args,
      view: activeView,
      file: [relPath],
      maxItems: args.maxItems ?? 20,
    });
    // Rewrite `path:line` references into click-to-reveal source previews.
    const html = peekReferences(markdownToHtml(md), resolveSource);
    pane = `<h2>${escapeHtml(VIEW_LABELS[activeView] ?? activeView)}</h2>
<div class="body">${html}</div>`;
  } else {
    pane = codeMapPane;
  }

  const body = `<nav class="crumbs"><a href="/">← Overview</a><span>/</span><span>${escapeHtml(
    relPath,
  )}</span></nav>
<div class="toolbar">
  <h1 style="margin:0">${escapeHtml(relPath)}</h1>
  <a class="btn" href="/api/report.json?path=${encodeURIComponent(relPath)}">JSON</a>
  <form action="/refresh" method="post"><input type="hidden" name="from" value="/file?path=${escapeHtml(
    encodeURIComponent(relPath),
  )}"><button type="submit">↻ Re-analyze</button></form>
</div>
${pane}`;

  return page({
    title: relPath,
    body,
    tabs: fileTabs(relPath, activeView),
    context: relPath,
    wide: true,
  });
}
