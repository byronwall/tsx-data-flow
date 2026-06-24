// Local HTML server for tsx-dataflow. Builds the TypeScript program once, then
// serves an overview page (ranked file hotspots) and a focused per-file page
// (every report view as HTML + an annotated code map). Zero runtime deps beyond
// node:http and the analyzer itself.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  createAnalyzer,
  renderMarkdownView,
  hotspotGroups,
  modalValue,
  firstCutFor,
  REPORT_VIEWS,
} from "./core.mjs";
import { markdownToHtml } from "./html/markdown-to-html.mjs";
import { page, escapeHtml } from "./html/page.mjs";
import { renderCodeMap } from "./html/code-map.mjs";
import { peekReferences } from "./html/source-peek.mjs";

// Views worth rendering on the per-file page, in display order. `dossier` is a
// JSON-oriented view (offered via /api instead) and is omitted here.
const FILE_VIEWS = REPORT_VIEWS.filter((view) => view !== "dossier");

// Short human labels for the per-file view sections.
const VIEW_LABELS = {
  findings: "Findings",
  "work-packets": "Work packets",
  "fan-out": "Fan-out",
  "fan-in": "Fan-in",
  "path-gallery": "Path gallery",
  "path-census": "Path census",
  "path-families": "Path families",
  "transformation-ledger": "Transformation ledger",
  "defensive-ledger": "Defensive ledger",
  "prop-relay": "Prop relay",
  "context-relay": "Context relay",
  "repair-map": "Repair map",
  "boundary-report": "Boundary report",
  junctions: "Junctions",
  "inline-preview": "Inline preview",
  hotspots: "Hotspots",
};

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

      if (route === "/") return send(res, 200, renderOverview(cache.full));

      if (route === "/file") {
        const relPath = url.searchParams.get("path");
        if (!relPath) return send(res, 400, "missing ?path", "text/plain");
        const report = reportForFile(relPath);
        const source = sourceFor(relPath);
        const openView = url.searchParams.get("view");
        return send(
          res,
          200,
          renderFilePage(report, relPath, source, args, openView, sourceFor),
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

      return send(res, 404, page({ title: "Not found", body: "<h1>404</h1>" }));
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

function overviewNav(report) {
  const groups = hotspotGroups(report, "file");
  const items = groups
    .map(
      (g) =>
        `<li><a href="/file?path=${encodeURIComponent(g.key)}">${escapeHtml(
          g.key,
        )}</a> <span class="meta">(${g.count})</span></li>`,
    )
    .join("");
  return `<h1>tsx-dataflow</h1>
<div class="sub">${escapeHtml(report.meta.root)}</div>
<strong>Files</strong>
<ul>${items || '<li class="meta">no findings</li>'}</ul>`;
}

function renderOverview(report) {
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

  const groups = hotspotGroups(report, "file");
  const rows = groups
    .map(
      (g) => `<tr>
<td><a href="/file?path=${encodeURIComponent(g.key)}">${escapeHtml(g.key)}</a></td>
<td>${g.count}</td>
<td>${g.worst.toFixed(2)}</td>
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

  const body = `<div class="toolbar">
  <h1 style="margin:0">Render-path overview</h1>
  <form action="/refresh" method="post"><button type="submit">↻ Re-analyze</button></form>
</div>
<div class="cards">${cards}</div>
<h2>Files by burden</h2>
${concNote}
<table>
<thead><tr><th>File</th><th>Findings</th><th>Worst</th><th>Dominant shape</th><th>Ownership</th><th>First cut</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6" class="meta">No findings.</td></tr>'}</tbody>
</table>`;

  return page({ title: "tsx-dataflow", body, nav: overviewNav(report) });
}

function fileNav(relPath, report) {
  const sinkCount = report.rankings.all.length;
  const views = FILE_VIEWS.map(
    (view) =>
      `<li><a href="#view-${view}">${escapeHtml(VIEW_LABELS[view] ?? view)}</a></li>`,
  ).join("");
  return `<h1><a href="/">tsx-dataflow</a></h1>
<div class="sub">${escapeHtml(relPath)}</div>
<p class="meta">${sinkCount} ranked finding(s)</p>
<strong>On this page</strong>
<ul><li><a href="#codemap">Code map</a></li>${views}</ul>`;
}

function renderFilePage(report, relPath, source, args, openView, resolveSource) {
  const sinks = report.rankings.all.filter((sink) => sink.file === relPath);

  const codeMap = source
    ? renderCodeMap({ relPath, source, sinks, meta: report.meta })
    : `<p class="meta">Source not found on disk: ${escapeHtml(relPath)}</p>`;

  const sections = FILE_VIEWS.map((view) => {
    const md = renderMarkdownView(report, {
      ...args,
      view,
      file: [relPath],
      maxItems: args.maxItems ?? 20,
    });
    // Rewrite `path:line` references into click-to-reveal source previews.
    const html = peekReferences(markdownToHtml(md), resolveSource);
    const open = view === openView ? " open" : "";
    return `<details id="view-${view}"${open}>
<summary>${escapeHtml(VIEW_LABELS[view] ?? view)}</summary>
<div class="body">${html}</div>
</details>`;
  }).join("\n");

  const body = `<div class="toolbar">
  <h1 style="margin:0">${escapeHtml(relPath)}</h1>
  <a class="btn" href="/api/report.json?path=${encodeURIComponent(relPath)}">JSON</a>
  <form action="/refresh" method="post"><input type="hidden" name="from" value="/file?path=${escapeHtml(
    encodeURIComponent(relPath),
  )}"><button type="submit">↻ Re-analyze</button></form>
</div>
<h2 id="codemap">Code map</h2>
<p class="meta">Lines with a colored dot render a ranked finding — click to inspect. Color signals <strong>burden</strong> (severity): the hotter the line, the heavier the render path. Faintly bordered lines lie on a representative path through this file.</p>
<div class="heat-legend"><span>low burden</span><span class="bar"></span><span>high burden</span></div>
${codeMap}
<h2>Reports</h2>
${sections}`;

  return page({ title: relPath, body, nav: fileNav(relPath, report), wide: true });
}
