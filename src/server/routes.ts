import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { refreshResponseSchema } from "../api/contracts";
import { REPORT_VIEWS } from "../cli/args";
import { renderReport } from "../core";
import { renderMarkdownView } from "../reports/markdown-views";
import type { AnalyzerArgs } from "../types";
import { serveFile } from "./api-file";
import { serveReport } from "./api-report";
import { serveWorkspace } from "./api-workspace";
import type { AnalysisCache } from "./cache";
import { send, sendError, sendFile, sendJson } from "./responses";

export function createRequestHandler(args: AnalyzerArgs, cache: AnalysisCache, frontendDist: string) {
  const frontendIndex = path.join(frontendDist, "index.html");
  const sendSpa = (res: ServerResponse) => fs.existsSync(frontendIndex) ? sendFile(res, frontendIndex) : send(res, 500, "Frontend not built. Run pnpm build:frontend before starting the server.");
  const sendStatic = (route: string, res: ServerResponse) => {
    const assetPath = path.normalize(route.replace(/^\/assets\//, "assets/")); const absolute = path.join(frontendDist, assetPath);
    return absolute.startsWith(frontendDist + path.sep) ? sendFile(res, absolute) : send(res, 400, "bad request");
  };
  return (req: IncomingMessage, res: ServerResponse) => {
    let url: URL; try { url = new URL(req.url ?? "/", "http://localhost"); } catch { return send(res, 400, "bad request"); }
    const route = url.pathname;
    try {
      if (route.startsWith("/assets/")) return sendStatic(route, res);
      if (route === "/healthz") return send(res, 200, "ok");
      if (route === "/api/workspace" && req.method === "GET") return serveWorkspace(cache, res);
      if (route === "/api/file" && req.method === "GET") return serveFile(cache, url, res);
      const structured = route.match(/^\/api\/reports\/([A-Za-z0-9-]+)$/);
      if (structured && req.method === "GET") return serveReport(cache, structured[1], url, res);
      if (route === "/api/refresh" && req.method === "POST") {
        const report = cache.refresh(); return sendJson(res, 200, refreshResponseSchema.parse({ apiVersion: 1, analysisVersion: report.analysisVersion, generation: cache.generation(), generatedAt: report.generatedAt, data: { refreshed: true } }));
      }
      const markdown = route.match(/^\/api\/report\.([A-Za-z0-9-]+)\.md$/);
      if (markdown) return serveMarkdown(markdown[1], url, args, cache, res);
      if (route === "/" || route === "/file" || route === "/report") return sendSpa(res);
      if (route.startsWith("/api/")) return sendError(res, 404, "not_found", `Unknown API route: ${route}`);
      return sendSpa(res);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return route.startsWith("/api/") ? sendError(res, 500, "internal_error", message) : send(res, 500, `Server error: ${message}`);
    }
  };
}

function serveMarkdown(view: string, url: URL, args: AnalyzerArgs, cache: AnalysisCache, res: ServerResponse) {
  if (!REPORT_VIEWS.includes(view)) return send(res, 404, "not found");
  const relPath = url.searchParams.get("path");
  if (relPath && cache.sourceFor(relPath) === null) return send(res, 404, `File not found: ${relPath}`);
  const report = relPath ? cache.reportForFile(relPath) : cache.reviewReport();
  const reportArgs = { ...args, ...(relPath ? { file: [relPath] } : {}), view, format: "markdown" as const, maxItems: args.maxItems ?? 20 };
  const body = relPath ? renderMarkdownView(report, reportArgs) : renderReport(report, reportArgs);
  return send(res, 200, body, "text/markdown; charset=utf-8");
}
