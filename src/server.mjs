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
  REPORT_VIEWS,
} from "./core.mjs";
import {
  fanOutEntriesGlobal,
} from "./reports/overview-selectors.mjs";
import { markdownToHtml } from "./html/markdown-to-html.mjs";
import { escapeHtml } from "./html/escape.mjs";
import { page } from "./html/page.mjs";
import { peekReferences } from "./html/source-peek.mjs";
import { VIEW_LABELS } from "./server/view-config.mjs";
import { paramHref } from "./server/url-helpers.mjs";
import {
  boundaryViewer,
  fanOutViewer,
  renderFilePage,
  renderOverview,
  reportTabs,
} from "./server/render-pages.mjs";

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
