import { Worker } from "node:worker_threads";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SourceExcerptRequest } from "../api/contracts";
import type { AnalyzerArgs } from "../types";
import { AnalysisCancelledError } from "../analysis/cancellation";

export type AnalysisProgress = {
  requestId: number;
  operation: string;
  phase: "queued" | "analyzing" | "projecting" | "complete" | "error" | "cancelled";
  message: string;
  step?: "program" | "identity" | "trace" | "summarize" | "project";
  completed?: number;
  total?: number;
  file?: string;
};

type WorkerReply =
  | { kind: "progress"; progress: AnalysisProgress }
  | { kind: "result"; requestId: number; value: unknown }
  | { kind: "error"; requestId: number; message: string }
  | { kind: "cancelled"; requestId: number };

export type AnalysisWorkerRequest = {
  requestId: number;
  operation: AnalysisOperation;
  cancellationBuffer: SharedArrayBuffer;
};

type PendingRequest = {
  requestId: number;
  operation: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cleanupAbort: () => void;
  routeRequestId: string | null;
  cancel: () => void;
};

export class RouteRequestConflictError extends Error {
  constructor(readonly routeRequestId: string) {
    super(`Route request id is already active: ${routeRequestId}`);
    this.name = "RouteRequestConflictError";
  }
}

export type AnalysisOperation =
  | { kind: "workspace" }
  | { kind: "file"; path: string }
  | { kind: "report"; view: string; path: string | null }
  | { kind: "refresh" }
  | { kind: "route-data"; route: string; flow: string; source?: string; generation?: number }
  | ({ kind: "source-excerpt" } & SourceExcerptRequest)
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
  let workspaceEpoch = 0;
  const pending = new Map<number, PendingRequest>();
  const inFlightWorkspace = new Map<number, Promise<unknown>>();
  const routeRequests = new Map<string, { requestId: number; cancel: () => void }>();
  const listeners = new Set<(progress: AnalysisProgress) => void>();
  let latest: AnalysisProgress | null = null;
  let shutdownError: Error | null = null;
  let closePromise: Promise<number> | null = null;

  const publish = (progress: AnalysisProgress) => {
    latest = progress;
    for (const listener of listeners) listener(progress);
  };

  const shutdown = (error: Error) => {
    if (shutdownError) return;
    shutdownError = error;
    const retained = [...pending.values()];
    pending.clear();
    inFlightWorkspace.clear();
    routeRequests.clear();
    latest = null;
    listeners.clear();
    for (const request of retained) {
      request.cleanupAbort();
      request.reject(error);
    }
  };

  worker.on("message", (reply: WorkerReply) => {
    if (reply.kind === "progress") {
      if (pending.has(reply.progress.requestId)) publish(reply.progress);
      return;
    }
    const request = pending.get(reply.requestId);
    if (!request) return;
    pending.delete(reply.requestId);
    if (request.routeRequestId && routeRequests.get(request.routeRequestId)?.requestId === request.requestId) routeRequests.delete(request.routeRequestId);
    request.cleanupAbort();
    if (reply.kind === "result") request.resolve(reply.value);
    else if (reply.kind === "cancelled") request.reject(new AnalysisCancelledError());
    else request.reject(new Error(reply.message));
  });
  worker.on("error", shutdown);
  worker.on("exit", (code) => {
    if (!shutdownError) shutdown(new Error(`Analysis worker exited with code ${code}`));
  });

  const clearWorkspaceFlight = (epoch: number, promise: Promise<unknown>) => {
    if (inFlightWorkspace.get(epoch) === promise) inFlightWorkspace.delete(epoch);
  };

  const request = <T>(operation: AnalysisOperation, signal?: AbortSignal, routeRequestId?: string) => {
    if (shutdownError) return Promise.reject(shutdownError) as Promise<T>;
    if (routeRequestId && routeRequests.has(routeRequestId)) return Promise.reject(new RouteRequestConflictError(routeRequestId)) as Promise<T>;
    if (operation.kind === "refresh") workspaceEpoch += 1;
    const requestWorkspaceEpoch = operation.kind === "workspace" ? workspaceEpoch : null;
    if (requestWorkspaceEpoch !== null) {
      const existing = inFlightWorkspace.get(requestWorkspaceEpoch);
      if (existing) return existing as Promise<T>;
    }
    const requestId = nextRequestId++;
    const cancellationBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const cancellation = new Int32Array(cancellationBuffer);
    publish({ requestId, operation: operation.kind, phase: "queued", message: `Queued ${operation.kind} analysis` });
    const requestPromise = new Promise<T>((resolve, reject) => {
      let cleanupAbort = () => {};
      const cancel = () => {
        const retained = pending.get(requestId);
        if (!retained) return;
        Atomics.store(cancellation, 0, 1);
        Atomics.notify(cancellation, 0);
        pending.delete(requestId);
        if (retained.routeRequestId && routeRequests.get(retained.routeRequestId)?.requestId === requestId) routeRequests.delete(retained.routeRequestId);
        retained.cleanupAbort();
        publish({ requestId, operation: retained.operation, phase: "cancelled", message: `Cancelled ${retained.operation} analysis` });
        retained.reject(new AnalysisCancelledError());
      };
      if (operation.kind === "route-data" && signal) {
        signal.addEventListener("abort", cancel, { once: true });
        cleanupAbort = () => signal.removeEventListener("abort", cancel);
      }
      pending.set(requestId, {
        requestId,
        operation: operation.kind,
        resolve: resolve as (value: unknown) => void,
        reject,
        cleanupAbort,
        routeRequestId: operation.kind === "route-data" ? routeRequestId ?? null : null,
        cancel,
      });
      if (operation.kind === "route-data" && routeRequestId) routeRequests.set(routeRequestId, { requestId, cancel });
      if (operation.kind === "route-data" && signal?.aborted) {
        cancel();
        return;
      }
      const message: AnalysisWorkerRequest = { requestId, operation, cancellationBuffer };
      try {
        worker.postMessage(message);
      } catch (error) {
        shutdown(error instanceof Error ? error : new Error(String(error)));
      }
    });
    if (requestWorkspaceEpoch !== null) {
      const sharedPromise = requestPromise as Promise<unknown>;
      inFlightWorkspace.set(requestWorkspaceEpoch, sharedPromise);
      void sharedPromise.then(
        () => clearWorkspaceFlight(requestWorkspaceEpoch, sharedPromise),
        () => clearWorkspaceFlight(requestWorkspaceEpoch, sharedPromise),
      );
    }
    return requestPromise;
  };

  const close = () => {
    if (closePromise) return closePromise;
    shutdown(new Error("Analysis service closed"));
    closePromise = worker.terminate();
    return closePromise;
  };

  const cancelRouteRequest = (routeRequestId: string) => {
    const retained = routeRequests.get(routeRequestId);
    if (!retained) return false;
    retained.cancel();
    return true;
  };

  return {
    request,
    cancelRouteRequest,
    latest: () => latest,
    subscribe(listener: (progress: AnalysisProgress) => void) {
      if (shutdownError) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close,
  };
}

export type AnalysisService = ReturnType<typeof createAnalysisService>;
