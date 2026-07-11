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
  const scoped = cache.reportForFile(parsed.data.path);
  return sendJson(res, 200, filePageResponseSchema.parse({
    apiVersion: 1, analysisVersion: full.analysisVersion, generation: cache.generation(), generatedAt: full.generatedAt,
    data: buildFilePageDto(scoped, full, parsed.data.path, source, cache.sourceFor),
  }));
}
