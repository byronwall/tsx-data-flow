// Local server for tsx-dataflow. Builds the TypeScript program once, exposes the
// analyzer data/markdown APIs, and serves the Solid single-page frontend.
import fs from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAnalyzer,
  renderMarkdownView,
  renderReport,
  REPORT_VIEWS,
} from "./core.mjs";
import { escapeHtml } from "./html/escape.mjs";
import { page } from "./html/page.mjs";

type AnalyzerArgs = {
  compare?: string | null;
  file?: string[];
  format?: string;
  maxItems?: number | null;
  root: string;
  scope?: string | null;
  view?: string;
  [key: string]: unknown;
};

type Report = {
  concentration?: unknown;
  contextRelay?: unknown;
  helpers?: unknown;
  meta: { root: string; [key: string]: unknown };
  packGroups?: unknown;
  rankings: { all: unknown };
  repeatedForks?: unknown;
  summary?: unknown;
  unknownEdges?: unknown;
};

type Analyzer = {
  report(overrides?: Partial<AnalyzerArgs>): Report;
};

type ServerCache = {
  analyzer: Analyzer | null;
  full: Report | null;
  byFile: Map<string, Report>;
  source: Map<string, string>;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.join(here, "frontend", "dist");
const frontendIndex = path.join(frontendDist, "index.html");

const STATIC_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  type = "text/html; charset=utf-8",
) {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function sendFile(res: ServerResponse, filePath: string) {
  let body: Buffer;
  try {
    body = fs.readFileSync(filePath);
  } catch {
    return send(res, 404, "not found", "text/plain");
  }
  const type = STATIC_TYPES[path.extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  return res.end(body);
}

function sendSpa(res: ServerResponse) {
  if (fs.existsSync(frontendIndex)) return sendFile(res, frontendIndex);
  return send(
    res,
    500,
    page({
      title: "Frontend not built",
      body: '<h1>Frontend not built</h1><p class="meta">Run <code>pnpm build:frontend</code> before starting the server.</p>',
    }),
  );
}

function sendStaticAsset(route: string, res: ServerResponse) {
  const assetPath = path.normalize(route.replace(/^\/assets\//, "assets/"));
  const absolute = path.join(frontendDist, assetPath);
  if (!absolute.startsWith(frontendDist + path.sep)) {
    return send(res, 400, "bad request", "text/plain");
  }
  return sendFile(res, absolute);
}

// One server instance owns an analyzer + caches. Exported (not just started) so
// tests can drive it on an ephemeral port without a child process.
export function createServer(args: AnalyzerArgs) {
  const cache: ServerCache = {
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

  const reportForFile = (relPath: string) => {
    if (cache.byFile.has(relPath)) return cache.byFile.get(relPath);
    if (!cache.analyzer) ensureBuilt();
    const report = cache.analyzer?.report({ file: [relPath], scope: null });
    if (!report) throw new Error("Analyzer was not initialized");
    cache.byFile.set(relPath, report);
    return report;
  };

  const sourceFor = (relPath: string) => {
    if (cache.source.has(relPath)) return cache.source.get(relPath) ?? "";
    if (!cache.full) ensureBuilt();
    const root = cache.full?.meta.root;
    if (!root) throw new Error("Analyzer report was not initialized");
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

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      return send(res, 400, "bad request", "text/plain");
    }
    const route = url.pathname;

    try {
      if (route.startsWith("/assets/")) return sendStaticAsset(route, res);

      if (route === "/healthz") return send(res, 200, "ok", "text/plain");

      if (route === "/refresh" || url.searchParams.get("refresh") === "1") {
        refresh();
        res.writeHead(302, { Location: url.searchParams.get("from") || "/" });
        return res.end();
      }

      ensureBuilt();

      const markdownMatch = route.match(/^\/api\/report\.([A-Za-z0-9-]+)\.md$/);
      if (markdownMatch) {
        const view = markdownMatch[1];
        if (!isReportView(view)) {
          return send(res, 404, "not found", "text/plain");
        }
        const relPath = url.searchParams.get("path");
        const report = relPath ? reportForFile(relPath) : cache.full;
        if (!report) throw new Error("Analyzer report was not initialized");
        const markdown = relPath
          ? renderMarkdownView(
              report,
              reportArgs({ ...args, file: [relPath] }, view),
            )
          : renderReport(report, reportArgs(args, view));
        return send(res, 200, markdown, "text/markdown; charset=utf-8");
      }

      if (route === "/api/source") {
        const relPath = url.searchParams.get("path");
        if (!relPath) return send(res, 400, "missing ?path", "text/plain");
        return send(res, 200, sourceFor(relPath), "text/plain; charset=utf-8");
      }

      if (route === "/api/report.json") {
        const relPath = url.searchParams.get("path");
        const report = relPath ? reportForFile(relPath) : cache.full;
        if (!report) throw new Error("Analyzer report was not initialized");
        const payload = {
          meta: report.meta,
          summary: report.summary,
          concentration: report.concentration,
          sinks: report.rankings.all,
          helpers: report.helpers,
          repeatedForks: report.repeatedForks,
          unknownEdges: report.unknownEdges,
          contextRelay: report.contextRelay,
          packGroups: report.packGroups,
        };
        return send(
          res,
          200,
          JSON.stringify(payload, null, 2),
          "application/json; charset=utf-8",
        );
      }

      if (route === "/" || route === "/file" || route === "/report") {
        return sendSpa(res);
      }

      return sendSpa(res);
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

function isReportView(view: string) {
  return REPORT_VIEWS.includes(view);
}

function reportArgs(args: AnalyzerArgs, view: string): AnalyzerArgs {
  return {
    ...args,
    view,
    format: "markdown",
    maxItems: args.maxItems ?? 20,
  };
}