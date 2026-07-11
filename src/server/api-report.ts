import type { ServerResponse } from "node:http";
import { reportRequestSchema, reportResponseSchema } from "../api/contracts";
import type { ReportView } from "../api/report-views";
import { buildReportDto } from "../api/projections/reports";
import type { AnalysisCache } from "./cache";
import { sendError, sendJson } from "./responses";

export function serveReport(cache: AnalysisCache, viewValue: string, url: URL, res: ServerResponse) {
  const request = reportRequestSchema.safeParse({ view: viewValue, path: url.searchParams.get("path") });
  if (!request.success || request.data.view === "overview") return sendError(res, 404, "unknown_report", `Unknown structured report: ${viewValue}`);
  const path = request.data.path;
  if (path && cache.sourceFor(path) === null) return sendError(res, 404, "file_not_found", `File not found: ${path}`);
  const report = path ? cache.reportForFile(path) : cache.reviewReport();
  const full = cache.ensureBuilt();
  return sendJson(res, 200, reportResponseSchema.parse({ apiVersion: 1, analysisVersion: full.analysisVersion, generation: cache.generation(), generatedAt: full.generatedAt, data: buildReportDto(report, request.data.view as Exclude<ReportView, "overview">) }));
}
