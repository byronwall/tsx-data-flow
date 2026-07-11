import type { ServerResponse } from "node:http";
import { buildWorkspaceDto } from "../api/projections/workspace";
import { workspaceResponseSchema } from "../api/contracts";
import type { AnalysisCache } from "./cache";
import { sendJson } from "./responses";

export function serveWorkspace(cache: AnalysisCache, res: ServerResponse) {
  const report = cache.ensureBuilt();
  return sendJson(res, 200, workspaceResponseSchema.parse({
    apiVersion: 1,
    analysisVersion: report.analysisVersion,
    generation: cache.generation(),
    generatedAt: report.generatedAt,
    data: buildWorkspaceDto(report),
  }));
}
