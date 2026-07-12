import type { ServerResponse } from "node:http";
import { filePageResponseSchema, fileRequestSchema } from "../api/contracts";
import { buildFilePageDto } from "../api/projections/file-page";
import type { AnalysisCache } from "./cache";
import { sendError, sendJson } from "./responses";

export function serveFile(cache: AnalysisCache, url: URL, res: ServerResponse) {
  const parsed = fileRequestSchema.safeParse({ path: url.searchParams.get("path") });
  if (!parsed.success) return sendError(res, 400, "invalid_path", "A workspace-relative path is required", parsed.error.issues);
  const source = cache.sourceFor(parsed.data.path);
  if (source === null) return sendError(res, 404, "file_not_found", `File not found: ${parsed.data.path}`);
  const full = cache.ensureBuilt();
  // buildFilePageDto performs its own file filtering. Re-tracing the selected
  // file here rebuilt deep helper paths immediately after the workspace build
  // (7.5s on the pluck-ui fixture) without adding evidence to the file page.
  // Keep workspace-relative burden/reach values and project directly from the
  // generation report; explicitly scoped report/Markdown routes still use
  // reportForFile when their semantics require a separately ranked report.
  return sendJson(res, 200, filePageResponseSchema.parse({
    apiVersion: 1, analysisVersion: full.analysisVersion, generation: cache.generation(), generatedAt: full.generatedAt,
    data: buildFilePageDto(full, full, parsed.data.path, source, cache.sourceFor, cache.identitiesForFile(parsed.data.path)),
  }));
}
