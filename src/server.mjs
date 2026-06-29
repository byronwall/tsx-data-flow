// Local HTML server for tsx-dataflow. Builds the TypeScript program once, then
// serves an overview page (ranked file hotspots) and a focused per-file page
// (every report view as HTML + an annotated code map). Zero runtime deps beyond
// node:http and the analyzer itself.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  createAnalyzer,
  renderReport,
  renderMarkdownView,
  REPORT_VIEWS,
} from "./core.mjs";
import {
  entryTypeCountsByFile,
  fanOutEntriesForFile,
  fanOutEntriesGlobal,
  firstCutFor,
  hotspotGroups,
  modalValue,
} from "./reports/overview-selectors.mjs";
import { markdownToHtml } from "./html/markdown-to-html.mjs";
import { escapeHtml } from "./html/escape.mjs";
import { page } from "./html/page.mjs";
import {
  renderCodeMap,
  fanOutGraphSvg,
  fanOutAnchor,
  boundaryGraphSvg,
  boundaryAnchor,
} from "./html/code-map.mjs";
import { peekReferences } from "./html/source-peek.mjs";
import { FILE_VIEWS, VIEW_LABELS, viewLabel } from "./server/view-config.mjs";
import {
  OVERVIEW_PAGE_SIZE,
  OVERVIEW_TYPE_COLUMNS,
  SORT_HEADING,
} from "./server/overview-config.mjs";
import {
  overviewHref,
  overviewState,
  paramHref,
} from "./server/url-helpers.mjs";

function send(res, status, body, type = "text/html; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

// One server instance owns an analyzer + caches. Exported (not just started) so
// tests can drive it on an ephemeral port without a child process.
export function createServer(args) {
  const cache = {
    analyzer: null,
    full: null,
    byFile: new Map(),
    source: new Map(),
  };

  const ensureBuilt = () => {
    if (!cache.analyzer) {
      cache.analyzer = createAnalyzer({ ...args, file: [], scope: null });
      cache.full = cache.analyzer.report();
    }
    return cache.full;
  };

  const reportForFile = (relPath) => {
    if (cache.byFile.has(relPath)) return cache.byFile.get(relPath);
    const report = cache.analyzer.report({ file: [relPath], scope: null });
    cache.byFile.set(relPath, report);
    return report;
  };

  const sourceFor = (relPath) => {
    if (cache.source.has(relPath)) return cache.source.get(relPath);
    const root = cache.full.meta.root;
    let text = "";
    try {
      text = fs.readFileSync(path.join(root, relPath), "utf8");
    } catch {
      text = "";
    }
    cache.source.set(relPath, text);
    return text;
  };

  const refresh = () => {
    cache.analyzer = null;
    cache.full = null;
    cache.byFile.clear();
    cache.source.clear();
    ensureBuilt();
  };

  const handler = (req, res) => {
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return send(res, 400, "bad request", "text/plain");
    }
    const route = url.pathname;

    try {
      if (route === "/healthz") return send(res, 200, "ok", "text/plain");

      if (route === "/refresh" || url.searchParams.get("refresh") === "1") {
        refresh();
        res.writeHead(302, { Location: url.searchParams.get("from") || "/" });
        return res.end();
      }

      ensureBuilt();

      if (route === "/") return send(res, 200, renderOverview(cache.full, url));

      if (route === "/report") {
        const view = url.searchParams.get("view");
        if (!isReportView(view)) return send(res, 404, notFoundPage());
        const md = renderReport(cache.full, reportArgs(args, view));
        const mdHtml = peekReferences(markdownToHtml(md), sourceFor);
        let main;
        if (view === "fan-out") {
          // REPORT-RECONCILE-1: the fan-out report IS the network view; the raw
          // markdown (what the agent consumes) is shown beneath it so any quality
          // gap between the two is visible side by side.
          const fanOuts = fanOutEntriesGlobal(
            cache.full.rankings?.all ?? cache.full.sinks ?? [],
          );
          const viewer = fanOutViewer(fanOuts, {
            selected: url.searchParams.get("fanout"),
            sortKey: url.searchParams.get("fosort"),
            hrefFor: (overrides) => paramHref(url, overrides),
          });
          main = `${viewer}
<h2>Markdown report <span class="meta">— what the agent consumes; compare it with the view above</span></h2>
<div class="body md-mirror">${mdHtml}</div>`;
        } else if (view === "boundary-report") {
          // VIZ-1: the boundary report IS the two-sided network view (the template
          // for fan-in/junctions/prop-relay), with the raw markdown beneath it
          // (REPORT-RECONCILE pattern), so the web view and the agent's deliverable
          // stay inspectable side by side.
          const viewer = boundaryViewer(cache.full.helpers ?? [], {
            selected: url.searchParams.get("boundary"),
            hrefFor: (overrides) => paramHref(url, overrides),
          });
          main = `${viewer}
<h2>Markdown report <span class="meta">— what the agent consumes; compare it with the view above</span></h2>
<div class="body md-mirror">${mdHtml}</div>`;
        } else {
          main = `<div class="body">${mdHtml}</div>`;
        }
        return send(
          res,
          200,
          page({
            title: `${VIEW_LABELS[view] ?? view} · tsx-dataflow`,
            body: `<div class="toolbar"><h1 style="margin:0">${escapeHtml(
              VIEW_LABELS[view] ?? view,
            )}</h1><a class="btn" href="/api/report.${encodeURIComponent(
              view,
            )}.md">Markdown</a></div>${main}`,
            tabs: reportTabs(view),
            context: cache.full.meta.root,
          }),
        );
      }

      const markdownMatch = route.match(/^\/api\/report\.([A-Za-z0-9-]+)\.md$/);
      if (markdownMatch) {
        const view = markdownMatch[1];
        if (!isReportView(view))
          return send(res, 404, "not found", "text/plain");
        return send(
          res,
          200,
          renderReport(cache.full, reportArgs(args, view)),
          "text/markdown; charset=utf-8",
        );
      }

      if (route === "/file") {
        const relPath = url.searchParams.get("path");
        if (!relPath) return send(res, 400, "missing ?path", "text/plain");
        const report = reportForFile(relPath);
        const source = sourceFor(relPath);
        const openView = url.searchParams.get("view");
        const selectedFinding = url.searchParams.get("finding");
        return send(
          res,
          200,
          renderFilePage(
            report,
            relPath,
            source,
            args,
            openView,
            sourceFor,
            selectedFinding,
            cache.full,
          ),
        );
      }

      if (route === "/api/report.json") {
        const relPath = url.searchParams.get("path");
        const report = relPath ? reportForFile(relPath) : cache.full;
        const payload = {
          meta: report.meta,
          summary: report.summary,
          concentration: report.concentration,
          sinks: report.rankings.all,
          helpers: report.helpers,
          packGroups: report.packGroups,
        };
        return send(
          res,
          200,
          JSON.stringify(payload, null, 2),
          "application/json; charset=utf-8",
        );
      }

      return send(res, 404, notFoundPage());
    } catch (error) {
      const message = error instanceof Error ? error.stack : String(error);
      return send(
        res,
        500,
        page({
          title: "Error",
          body: `<h1>Server error</h1><pre>${escapeHtml(message)}</pre>`,
        }),
      );
    }
  };

  const server = http.createServer(handler);
  return { server, handler, refresh, ensureBuilt };
}

// --- Page renderers --------------------------------------------------------

function isReportView(view) {
  return REPORT_VIEWS.includes(view);
}

function notFoundPage() {
  return page({ title: "Not found", body: "<h1>404</h1>" });
}

function reportArgs(args, view) {
  return {
    ...args,
    view,
    format: "markdown",
    maxItems: args.maxItems ?? 20,
  };
}

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

// SHELL-5: a reusable custom popover — the on-page replacement for native <select>s
// (INTENT §8). The trigger shows `label: <current>`; the panel is a listbox of
// option links, so picking one navigates and the choice lives in the URL. Open/close,
// outside-click, Escape, and positioning are handled once in page.mjs.
function popover({ id, label, options, ariaLabel, triggerValue }) {
  const current = options.find((option) => option.active);
  const shown = triggerValue ?? current?.label ?? options[0]?.label ?? "";
  const items = options
    .map(
      (option) =>
        `<a role="option" class="popover-opt${option.active ? " active" : ""}"${
          option.active ? ' aria-selected="true"' : ""
        } href="${escapeHtml(option.href)}">${escapeHtml(option.label)}</a>`,
    )
    .join("");
  return `<div class="popover" data-popover data-popover-id="${escapeHtml(id)}">
  <button type="button" class="popover-trigger" aria-haspopup="listbox" aria-expanded="false" data-popover-trigger>
    <span class="popover-label">${escapeHtml(label)}:</span>
    <span class="popover-value">${escapeHtml(shown)}</span>
    <span class="popover-caret" aria-hidden="true">▾</span>
  </button>
  <div class="popover-panel" role="listbox" aria-label="${escapeHtml(ariaLabel ?? label)}">${items}</div>
</div>`;
}

// ARCH-1: page-level report tab strip — the on-page replacement for opening reports
// from the left sidebar. "Overview" is first; the rest mirror the alphabetized
// report list. The active tab is highlighted; selection is just the URL, so a
// refresh restores it. `activeView` is null on the overview, or the report view id.
function reportTabs(activeView) {
  const tabs = [
    { view: null, label: "Overview", href: "/" },
    ...REPORT_VIEWS.map((view) => ({
      view,
      label: viewLabel(view),
      href: `/report?view=${encodeURIComponent(view)}`,
    })).sort((a, b) => a.label.localeCompare(b.label)),
  ];
  return `<nav class="report-tabs" aria-label="Report sections">${tabs
    .map((tab) => {
      const on = tab.view === activeView;
      return `<a class="report-tab${on ? " active" : ""}"${
        on ? ' aria-current="page"' : ""
      } href="${escapeHtml(tab.href)}">${escapeHtml(tab.label)}</a>`;
    })
    .join("")}</nav>`;
}

// FANOUT-SORT-1: only sort keys already on the entry — no new analysis. The active
// key's value is shown on each tab so the order is never a mystery (INTENT §6).
const FANOUT_SORTS = [
  { key: "spread", label: "spread", get: (f) => f.sinkCount, dir: -1 },
  { key: "depth", label: "depth", get: (f) => f.maxDepth, dir: -1 },
  { key: "files", label: "files", get: (f) => f.fileCount, dir: -1 },
  { key: "name", label: "name", get: (f) => f.root, dir: 1 },
];
const FANOUT_TAB_LIMIT = 5;

function sortFanOuts(fanOuts, sortKey) {
  const sort = FANOUT_SORTS.find((s) => s.key === sortKey) ?? FANOUT_SORTS[0];
  const sorted = [...fanOuts].sort((a, b) => {
    const av = sort.get(a);
    const bv = sort.get(b);
    if (typeof av === "string") return sort.dir * av.localeCompare(bv);
    return sort.dir * (av - bv) || b.sinkCount - a.sinkCount;
  });
  return { sorted, sort };
}

// FANOUT-LIST-1 (+ COUNT-1, COPY-1, SORT-1): the on-page fan-out "network view". A
// tab strip of the heaviest sources + a dropdown holding the rest selects ONE
// source; only that source's graph renders. Every detected fan-out is reachable
// (the dropdown answers "what are the other N?"), the sort key + value are visible
// and controllable, and a single-file vs cross-file tag explains the kind. Selection
// and sort live in the URL via `hrefFor`.
function fanOutViewer(fanOuts, { selected, sortKey, hrefFor }) {
  if (!fanOuts.length)
    return `<p class="meta">No shared source fans out to ≥2 render sinks.</p>`;
  const { sorted, sort } = sortFanOuts(fanOuts, sortKey);
  const active =
    sorted.find((f) => fanOutAnchor(f.root) === selected) ?? sorted[0];
  const tabsList = sorted.slice(0, FANOUT_TAB_LIMIT);
  const rest = sorted.slice(FANOUT_TAB_LIMIT);
  const valueOf = (f) =>
    sort.key === "name" ? `${f.fileCount}f` : String(sort.get(f));
  const tabs = tabsList
    .map((f) => {
      const on = f === active;
      return `<a class="fo-tab${on ? " active" : ""}"${
        on ? ' aria-current="true"' : ""
      } href="${escapeHtml(hrefFor({ fanout: fanOutAnchor(f.root) }))}">${escapeHtml(
        f.root,
      )} <span class="fo-tab-val">${escapeHtml(valueOf(f))}</span></a>`;
    })
    .join("");
  const dropdown = rest.length
    ? popover({
        id: "fanout-src",
        label: "More",
        ariaLabel: "Other fan-out sources",
        triggerValue: rest.includes(active)
          ? undefined
          : `+${rest.length} more…`,
        options: rest.map((f) => ({
          label: `${f.root} · ${f.sinkCount} sinks · depth ${f.maxDepth}`,
          href: hrefFor({ fanout: fanOutAnchor(f.root) }),
          active: f === active,
        })),
      })
    : "";
  // SORT-1: name what the control orders — the *source picker* (which fan-out is
  // shown first), not the sinks inside the rendered graph (which are depth-ordered).
  const sortControl = `<span class="fo-sort" title="Orders the source picker (the tabs + list), not the sinks inside the graph."><span class="meta">Sort sources:</span> ${FANOUT_SORTS.map(
    (s) =>
      `<a class="fo-sort-btn${s.key === sort.key ? " active" : ""}" href="${escapeHtml(
        hrefFor({ fosort: s.key, fanout: fanOutAnchor(active.root) }),
      )}">${escapeHtml(s.label)}</a>`,
  ).join("")}</span>`;
  const tag =
    active.fileCount === 1
      ? `<span class="fo-tag fo-tag-single" title="One source consumed many times within a single file — usually a prop-drilling pattern that wants to be split.">single-file · candidate split</span>`
      : `<span class="fo-tag fo-tag-cross" title="One source consumed across many files — real cross-file usage; centralizing it touches them all.">${active.fileCount} files · cross-file usage</span>`;
  const defLine = active.def
    ? ` · defined at <a class="xfile" href="/file?path=${encodeURIComponent(
        active.def.file,
      )}#L${active.def.line}">${escapeHtml(active.def.file)}:${active.def.line}</a>`
    : "";
  return `<p class="meta fo-explain">A <strong>fan-out</strong> is a single source whose value is consumed by many render sinks; changing it touches every one. Pick a source to see where it spreads — the source node links to its definition, each sink to its file.</p>
<div class="fo-controls">
  <div class="fo-tabs">${tabs}${dropdown}</div>
  ${sortControl}
</div>
<section class="fanout-entry" id="${fanOutAnchor(active.root)}">
  <h3>${escapeHtml(active.root)} ${tag} <span class="meta">· ${
    active.sinkCount
  } sinks · max depth ${active.maxDepth}${defLine}</span></h3>
  ${fanOutGraphSvg(active, null)}
</section>`;
}

const BOUNDARY_TAB_LIMIT = 5;

// VIZ-1: the boundary viewer — the two-sided-diagram analogue of the fan-out viewer
// and the template for fan-in/junctions/prop-relay. A tab strip of the heaviest-debt
// boundaries + a popover for the rest selects ONE helper (selection in the URL via
// `?boundary=`), and only that helper's sources → boundary → callers diagram renders.
function boundaryViewer(helpers, { selected, hrefFor }) {
  if (!helpers.length)
    return `<p class="meta">No first-party helper functions were reached on a render path. (Imported library calls stay opaque; try --max-helper-depth.)</p>`;
  const active =
    helpers.find((h) => boundaryAnchor(h) === selected) ?? helpers[0];
  const tabsList = helpers.slice(0, BOUNDARY_TAB_LIMIT);
  const rest = helpers.slice(BOUNDARY_TAB_LIMIT);
  const tabs = tabsList
    .map((h) => {
      const on = h === active;
      return `<a class="fo-tab${on ? " active" : ""}"${
        on ? ' aria-current="true"' : ""
      } href="${escapeHtml(hrefFor({ boundary: boundaryAnchor(h) }))}">${escapeHtml(
        h.name,
      )} <span class="fo-tab-val">${escapeHtml(h.verdict ?? "")}</span></a>`;
    })
    .join("");
  const dropdown = rest.length
    ? popover({
        id: "boundary-src",
        label: "More",
        ariaLabel: "Other boundaries",
        triggerValue: rest.includes(active)
          ? undefined
          : `+${rest.length} more…`,
        options: rest.map((h) => ({
          label: `${h.name} · ${h.callerCount} caller(s) · ${h.verdict}`,
          href: hrefFor({ boundary: boundaryAnchor(h) }),
          active: h === active,
        })),
      })
    : "";
  return `<p class="meta fo-explain">A <strong>boundary</strong> is a first-party function on a render path. The diagram shows its inbound source lineages on the left, the function in the middle (click to jump to its definition), and the call sites it re-spreads to on the right — pick one to inspect where it sits between sources and consumers.</p>
<div class="fo-controls">
  <div class="fo-tabs">${tabs}${dropdown}</div>
</div>
<section class="fanout-entry" id="${boundaryAnchor(active)}">
  <h3>${escapeHtml(active.name)}() <span class="fo-tag fo-tag-cross">${escapeHtml(
    active.verdict,
  )}</span> <span class="meta">· ${active.inSources} inbound source(s) · ${
    active.callerCount
  } caller(s) · defined at <a class="xfile" href="/file?path=${encodeURIComponent(
    active.file,
  )}#L${active.line}">${escapeHtml(active.file)}:${active.line}</a></span></h3>
  ${boundaryGraphSvg(active)}
</section>`;
}

function renderOverview(report, url = new URL("http://localhost/")) {
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

function renderFilePage(
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
