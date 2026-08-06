import { parentPort, workerData } from "node:worker_threads";
import { filePageResponseSchema, refreshResponseSchema, reportResponseSchema, routeDataDetailTransportResponseSchema, sourceExcerptResponseSchema, workspaceResponseSchema } from "../api/contracts";
import { buildFilePageDto } from "../api/projections/file-page";
import { buildReportDto } from "../api/projections/reports";
import { buildWorkspaceDto } from "../api/projections/workspace";
import { buildRouteDataDetail } from "../api/projections/route-data";
import type { ReportView } from "../api/report-views";
import { renderReport } from "../core";
import { renderMarkdownView } from "../reports/markdown-views";
import type { AnalyzerArgs } from "../types";
import type { AnalyzerProgressUpdate } from "../analysis/progress";
import type { AnalysisOperation, AnalysisProgress, AnalysisWorkerRequest } from "./analysis-service";
import { createAnalysisCache } from "./cache";
import { buildSourceExcerpt } from "./source-excerpts";
import {
  createAnalysisCancellationToken,
  isAnalysisCancelledError,
  type AnalysisCancellationToken,
} from "../analysis/cancellation";

if (!parentPort) throw new Error("Analysis worker requires a parent port");
const port = parentPort;
const args = workerData as AnalyzerArgs;
let activeRequest: { requestId: number; operation: string } | null = null;
const cache = createAnalysisCache(args, (update: AnalyzerProgressUpdate) => {
  if (!activeRequest) return;
  port.postMessage({ kind: "progress", progress: { ...activeRequest, phase: "analyzing", ...update } });
});

function progress(requestId: number, operation: string, phase: AnalysisProgress["phase"], message: string) {
  port.postMessage({ kind: "progress", progress: { requestId, operation, phase, message } });
}

port.on("message", ({ requestId, operation, cancellationBuffer }: AnalysisWorkerRequest) => {
  const cancellationState = new Int32Array(cancellationBuffer);
  const cancellation = createAnalysisCancellationToken(() => Atomics.load(cancellationState, 0) !== 0);
  try {
    cancellation.throwIfCancelled();
    activeRequest = { requestId, operation: operation.kind };
    progress(requestId, operation.kind, "analyzing", "Building the TypeScript program and tracing render paths");
    const value = perform(operation, requestId, cancellation);
    cancellation.throwIfCancelled();
    progress(requestId, operation.kind, "complete", "Analysis complete");
    cancellation.throwIfCancelled();
    port.postMessage({ kind: "result", requestId, value });
  } catch (error) {
    if (isAnalysisCancelledError(error)) {
      port.postMessage({ kind: "cancelled", requestId });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    progress(requestId, operation.kind, "error", message);
    port.postMessage({ kind: "error", requestId, message });
  } finally {
    activeRequest = null;
  }
});

function perform(operation: AnalysisOperation, requestId: number, cancellation: AnalysisCancellationToken) {
  if (operation.kind === "refresh") {
    const report = cache.refresh();
    return refreshResponseSchema.parse({ apiVersion: 1, analysisVersion: report.analysisVersion, generation: cache.generation(), generatedAt: report.generatedAt, data: { refreshed: true } });
  }
  if (operation.kind === "workspace") {
    const report = cache.reviewReport();
    port.postMessage({ kind: "progress", progress: { requestId, operation: operation.kind, phase: "projecting", step: "project", message: "Preparing workspace rows and semantic map" } });
    return workspaceResponseSchema.parse({ apiVersion: 1, analysisVersion: report.analysisVersion, generation: cache.generation(), generatedAt: report.generatedAt, data: buildWorkspaceDto(report) });
  }
  if (operation.kind === "route-data") {
    cancellation.throwIfCancelled();
    const report = cache.ensureBuilt();
    cancellation.throwIfCancelled();
    if (operation.generation !== undefined && operation.generation !== cache.generation()) return null;
    const detail = buildRouteDataDetail(report, operation.route, operation.flow, cancellation);
    cancellation.throwIfCancelled();
    if (!detail) return null;
    const response = routeDataDetailTransportResponseSchema.parse({ apiVersion: 1, analysisVersion: report.analysisVersion, generation: cache.generation(), generatedAt: report.generatedAt, data: detail });
    cancellation.throwIfCancelled();
    return response;
  }
  if (operation.kind === "source-excerpt") {
    const report = cache.ensureBuilt();
    if (operation.generation !== cache.generation()) return null;
    const source = cache.sourceFor(operation.path);
    if (source === null) return null;
    const data = buildSourceExcerpt(cache.typescript(), operation, source);
    if (!data) return null;
    return sourceExcerptResponseSchema.parse({ apiVersion: 1, analysisVersion: report.analysisVersion, generation: cache.generation(), generatedAt: report.generatedAt, data });
  }
  if (operation.kind === "file") {
    const source = cache.sourceFor(operation.path);
    if (source === null) return null;
    const full = cache.ensureBuilt();
    port.postMessage({ kind: "progress", progress: { requestId, operation: operation.kind, phase: "projecting", step: "project", message: `Preparing ${operation.path}` } });
    return filePageResponseSchema.parse({ apiVersion: 1, analysisVersion: full.analysisVersion, generation: cache.generation(), generatedAt: full.generatedAt, data: buildFilePageDto(full, full, operation.path, source, cache.sourceFor, cache.identitiesForFile(operation.path)) });
  }
  if (operation.kind === "report") {
    if (operation.path && cache.sourceFor(operation.path) === null) return null;
    const report = operation.path ? cache.reportForFile(operation.path) : cache.reviewReport();
    const full = cache.ensureBuilt();
    port.postMessage({ kind: "progress", progress: { requestId, operation: operation.kind, phase: "projecting", step: "project", message: `Preparing ${operation.view} report` } });
    return reportResponseSchema.parse({ apiVersion: 1, analysisVersion: full.analysisVersion, generation: cache.generation(), generatedAt: full.generatedAt, data: buildReportDto(report, operation.view as Exclude<ReportView, "overview">) });
  }
  if (operation.path && cache.sourceFor(operation.path) === null) return null;
  const report = operation.path ? cache.reportForFile(operation.path) : cache.reviewReport();
  const reportArgs = { ...args, ...(operation.path ? { file: [operation.path] } : {}), view: operation.view, format: "markdown" as const, maxItems: args.maxItems ?? 20 };
  port.postMessage({ kind: "progress", progress: { requestId, operation: operation.kind, phase: "projecting", step: "project", message: `Rendering ${operation.view} Markdown` } });
  return operation.path ? renderMarkdownView(report, reportArgs) : renderReport(report, reportArgs);
}
