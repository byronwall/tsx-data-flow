import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileRequestSchema, reportRequestSchema, routeDataDetailRequestSchema, sourceExcerptRequestSchema } from "../api/contracts";
import { REPORT_VIEWS } from "../cli/args";
import type { AnalysisService } from "./analysis-service";
import { send, sendError, sendFile, sendJson } from "./responses";

export function createRequestHandler(analysis: AnalysisService, frontendDist: string) {
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
      if (route === "/api/progress" && req.method === "GET") return serveProgress(req, res, analysis);
      if (route === "/api/workspace" && req.method === "GET") return void respond(res, analysis.request({ kind: "workspace" }));
      if (route === "/api/route-data" && req.method === "GET") {
        const parsed = routeDataDetailRequestSchema.safeParse({ route: url.searchParams.get("route"), flow: url.searchParams.get("flow"), generation: url.searchParams.get("generation") ?? undefined });
        if (!parsed.success) return sendError(res, 400, "invalid_route_data_selection", "A route and trajectory key are required", parsed.error.issues);
        return void respond(res, analysis.request({ kind: "route-data", ...parsed.data }), "Route data trajectory was not found or belongs to an older analysis generation.");
      }
      if (route === "/api/route-data/source" && req.method === "GET") {
        const parsed = sourceExcerptRequestSchema.safeParse({ path: url.searchParams.get("path"), line: url.searchParams.get("line"), column: url.searchParams.get("column") ?? undefined, endLine: url.searchParams.get("endLine") ?? undefined, endColumn: url.searchParams.get("endColumn") ?? undefined });
        if (!parsed.success) return sendError(res, 400, "invalid_source_span", "A contained source path and valid focus span are required", parsed.error.issues);
        return void respond(res, analysis.request({ kind: "source-excerpt", ...parsed.data }), `File not found: ${parsed.data.path}`);
      }
      if (route === "/api/file" && req.method === "GET") {
        const parsed = fileRequestSchema.safeParse({ path: url.searchParams.get("path") });
        if (!parsed.success) return sendError(res, 400, "invalid_path", "A workspace-relative path is required", parsed.error.issues);
        return void respond(res, analysis.request({ kind: "file", path: parsed.data.path }), `File not found: ${parsed.data.path}`);
      }
      const structured = route.match(/^\/api\/reports\/([A-Za-z0-9-]+)$/);
      if (structured && req.method === "GET") {
        const parsed = reportRequestSchema.safeParse({ view: structured[1], path: url.searchParams.get("path") });
        if (!parsed.success || parsed.data.view === "overview") return sendError(res, 404, "unknown_report", `Unknown structured report: ${structured[1]}`);
        return void respond(res, analysis.request({ kind: "report", view: parsed.data.view, path: parsed.data.path ?? null }), parsed.data.path ? `File not found: ${parsed.data.path}` : undefined);
      }
      if (route === "/api/refresh" && req.method === "POST") {
        return void respond(res, analysis.request({ kind: "refresh" }));
      }
      const markdown = route.match(/^\/api\/report\.([A-Za-z0-9-]+)\.md$/);
      if (markdown) return void serveMarkdown(markdown[1], url, analysis, res);
      if (route === "/" || route === "/file" || route === "/report") return sendSpa(res);
      if (route.startsWith("/api/")) return sendError(res, 404, "not_found", `Unknown API route: ${route}`);
      return sendSpa(res);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return route.startsWith("/api/") ? sendError(res, 500, "internal_error", message) : send(res, 500, `Server error: ${message}`);
    }
  };
}

async function respond(res: ServerResponse, request: Promise<unknown>, notFound?: string) {
  try {
    const value = await request;
    if (value === null && notFound) return sendError(res, 404, "file_not_found", notFound);
    return sendJson(res, 200, value);
  } catch (error) {
    return sendError(res, 500, "internal_error", error instanceof Error ? error.message : String(error));
  }
}

async function serveMarkdown(view: string, url: URL, analysis: AnalysisService, res: ServerResponse) {
  if (!REPORT_VIEWS.includes(view)) return send(res, 404, "not found");
  const relPath = url.searchParams.get("path");
  try {
    const body = await analysis.request<string | null>({ kind: "markdown", view, path: relPath });
    return body === null ? send(res, 404, `File not found: ${relPath}`) : send(res, 200, body, "text/markdown; charset=utf-8");
  } catch (error) {
    return send(res, 500, error instanceof Error ? error.message : String(error));
  }
}

function serveProgress(req: IncomingMessage, res: ServerResponse, analysis: AnalysisService) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const write = (value: unknown) => res.write(`event: progress\ndata: ${JSON.stringify(value)}\n\n`);
  if (analysis.latest()) write(analysis.latest());
  const unsubscribe = analysis.subscribe(write);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 10_000);
  req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
}
