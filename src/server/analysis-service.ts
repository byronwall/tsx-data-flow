import { Worker } from "node:worker_threads";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AnalyzerArgs } from "../types";

export type AnalysisProgress = {
  requestId: number;
  operation: string;
  phase: "queued" | "analyzing" | "projecting" | "complete" | "error";
  message: string;
  step?: "program" | "identity" | "trace" | "summarize" | "project";
  completed?: number;
  total?: number;
  file?: string;
};

type WorkerReply =
  | { kind: "progress"; progress: AnalysisProgress }
  | { kind: "result"; requestId: number; value: unknown }
  | { kind: "error"; requestId: number; message: string };

export type AnalysisOperation =
  | { kind: "workspace" }
  | { kind: "file"; path: string }
  | { kind: "report"; view: string; path: string | null }
  | { kind: "refresh" }
  | { kind: "markdown"; view: string; path: string | null };

export function createAnalysisService(args: AnalyzerArgs) {
  let workerUrl = import.meta.url.endsWith(".ts")
    ? new URL("./analysis-worker.ts", import.meta.url)
    : new URL("./analysis-worker.js", import.meta.url);
  if (workerUrl.protocol !== "file:") workerUrl = pathToFileURL(path.resolve(process.cwd(), "src/server/analysis-worker.ts"));
  const worker = workerUrl.pathname.endsWith(".ts")
    ? new Worker(`import("tsx/esm/api").then(({ tsImport }) => tsImport(${JSON.stringify(workerUrl.href)}, ${JSON.stringify(workerUrl.href)}))`, { eval: true, workerData: args })
    : new Worker(workerUrl, { workerData: args });
  worker.unref();
  let nextRequestId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const listeners = new Set<(progress: AnalysisProgress) => void>();
  let latest: AnalysisProgress | null = null;

  const publish = (progress: AnalysisProgress) => {
    latest = progress;
    for (const listener of listeners) listener(progress);
  };

  worker.on("message", (reply: WorkerReply) => {
    if (reply.kind === "progress") return publish(reply.progress);
    const request = pending.get(reply.requestId);
    if (!request) return;
    pending.delete(reply.requestId);
    if (reply.kind === "result") request.resolve(reply.value);
    else request.reject(new Error(reply.message));
  });
  worker.on("error", (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  });

  const request = <T>(operation: AnalysisOperation) => {
    const requestId = nextRequestId++;
    publish({ requestId, operation: operation.kind, phase: "queued", message: `Queued ${operation.kind} analysis` });
    return new Promise<T>((resolve, reject) => {
      pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage({ requestId, operation });
    });
  };

  return {
    request,
    latest: () => latest,
    subscribe(listener: (progress: AnalysisProgress) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    close: () => worker.terminate(),
  };
}

export type AnalysisService = ReturnType<typeof createAnalysisService>;
