// Local server for tsx-dataflow. Builds the TypeScript program once, exposes the
// analyzer data/markdown APIs, and serves the Solid single-page frontend.
import fs from "node:fs";
import type { AnalyzerArgs } from "./types";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderReport } from "./core";
import { REPORT_VIEWS } from "./cli/args";
import { renderMarkdownView } from "./reports/markdown-views";
import { fileRequestSchema, refreshResponseSchema } from "./api/contracts";
import { createAnalysisCache } from "./server/cache";
import { serveWorkspace } from "./server/api-workspace";
import { send, sendError, sendFile, sendJson } from "./server/responses";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceFrontendDist = path.join(here, "frontend", "dist");
const builtFrontendDist = path.resolve(
  process.cwd(),
  "dist/src/frontend/dist",
);
const frontendDist = fs.existsSync(sourceFrontendDist)
  ? sourceFrontendDist
  : builtFrontendDist;
const frontendIndex = path.join(frontendDist, "index.html");

function sendSpa(res: ServerResponse) {
  if (fs.existsSync(frontendIndex)) return sendFile(res, frontendIndex);
  return send(res, 500, "Frontend not built. Run pnpm build:frontend before starting the server.");
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
  const cache = createAnalysisCache(args);

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

      if (route === "/healthz") return send(res, 200, "ok");

      if (route === "/api/workspace" && req.method === "GET") {
        return serveWorkspace(cache, res);
      }

      if (route === "/api/refresh" && req.method === "POST") {
        const report = cache.refresh();
        return sendJson(res, 200, refreshResponseSchema.parse({
          apiVersion: 1, analysisVersion: report.analysisVersion,
          generation: cache.generation(), generatedAt: report.generatedAt,
          data: { refreshed: true },
        }));
      }

      if (route === "/refresh" || url.searchParams.get("refresh") === "1") {
        cache.refresh();
        res.writeHead(302, { Location: url.searchParams.get("from") || "/" });
        return res.end();
      }

      const fullReport = cache.ensureBuilt();

      const markdownMatch = route.match(/^\/api\/report\.([A-Za-z0-9-]+)\.md$/);
      if (markdownMatch) {
        const view = markdownMatch[1];
        if (!isReportView(view)) {
          return send(res, 404, "not found", "text/plain");
        }
        const relPath = url.searchParams.get("path");
        const report = relPath ? cache.reportForFile(relPath) : fullReport;
        const markdown = relPath
          ? renderMarkdownView(
              report,
              reportArgs({ ...args, file: [relPath] }, view),
            )
          : renderReport(report, reportArgs(args, view));
        return send(res, 200, markdown, "text/markdown; charset=utf-8");
      }

      if (route === "/api/source") {
        const parsed = fileRequestSchema.safeParse({ path: url.searchParams.get("path") });
        if (!parsed.success) return sendError(res, 400, "invalid_path", "A workspace-relative path is required", parsed.error.issues);
        const source = cache.sourceFor(parsed.data.path);
        if (source === null) return sendError(res, 404, "file_not_found", `File not found: ${parsed.data.path}`);
        return send(res, 200, source, "text/plain; charset=utf-8");
      }

      if (route === "/api/report.json") {
        const relPath = url.searchParams.get("path");
        const report = relPath ? cache.reportForFile(relPath) : fullReport;
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
      const message = error instanceof Error ? error.message : String(error);
      return route.startsWith("/api/")
        ? sendError(res, 500, "internal_error", message)
        : send(res, 500, `Server error: ${message}`);
    }
  };

  const server = http.createServer(handler);
  return { server, handler, refresh: cache.refresh, ensureBuilt: cache.ensureBuilt };
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
