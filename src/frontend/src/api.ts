import type { z } from "zod";
import { SOURCE_EXCERPT_DEFAULT_CONTEXT_LINES, apiErrorSchema, filePageResponseSchema, refreshResponseSchema, reportResponseSchema, routeDataDetailResponseSchema, sourceExcerptResponseSchema, workspaceResponseSchema } from "../../api/contracts";
import type { SourceEvidenceTarget } from "./overview/source-evidence-model";

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw await responseError(response, url);
  return response.json() as Promise<T>;
}

async function fetchParsed<T extends z.ZodType>(url: string, schema: T, init?: RequestInit): Promise<z.infer<T>> {
  const response = await fetchWithDevRestartRetry(url, init);
  if (!response.ok) throw await responseError(response, url);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new ApiClientError("invalid_content_type", `${url} did not return JSON`, response.status);
  return schema.parse(await response.json());
}

async function fetchWithDevRestartRetry(url: string, init?: RequestInit) {
  const canRetry = !init?.method || init.method === "GET";
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const contentType = response.headers.get("content-type") ?? "";
      const proxyFailure = response.status >= 500 && !contentType.includes("application/json");
      if (!canRetry || !proxyFailure || attempt >= 2) return response;
    } catch (error) {
      if (init?.signal?.aborted || !canRetry || attempt >= 2) throw error;
    }
    await waitForRetry(150 * (attempt + 1), init?.signal);
  }
}

function waitForRetry(delay: number, signal?: AbortSignal | null) {
  if (!signal) return new Promise<void>((resolve) => setTimeout(resolve, delay));
  const abortReason = () => signal.reason ?? new DOMException("The request was aborted.", "AbortError");
  if (signal.aborted) return Promise.reject(abortReason());
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, delay);
    const abort = () => { clearTimeout(timer); reject(abortReason()); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export const fetchWorkspace = () => fetchParsed("/api/workspace", workspaceResponseSchema);
export const fetchFilePage = (path: string) => fetchParsed(`/api/file?path=${encodeURIComponent(path)}`, filePageResponseSchema);
export const fetchReport = (view: string, path?: string) => fetchParsed(`/api/reports/${encodeURIComponent(view)}${path ? `?path=${encodeURIComponent(path)}` : ""}`, reportResponseSchema);
export const refreshWorkspace = () => fetchParsed("/api/refresh", refreshResponseSchema, { method: "POST" });
let latestAnalysisGeneration: number | null = null;
let fallbackRouteRequestId = 0;
const ROUTE_REQUEST_ID_HEADER = "x-tsx-data-flow-route-request-id";

function createRouteRequestId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  fallbackRouteRequestId += 1;
  return `route-${Date.now().toString(36)}-${fallbackRouteRequestId.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function cancelRouteRequest(requestId: string) {
  const init: RequestInit = { method: "POST", headers: { [ROUTE_REQUEST_ID_HEADER]: requestId } };
  if (typeof Request !== "undefined" && "keepalive" in Request.prototype) init.keepalive = true;
  try {
    void fetch("/api/route-data/cancel", init).catch(() => {});
  } catch { /* ignore a synchronous fetch failure */ }
}

export const fetchRouteData = async (route: string, flow: string, generation: number, signal?: AbortSignal) => {
  latestAnalysisGeneration = generation;
  const requestId = createRouteRequestId();
  const cancel = () => cancelRouteRequest(requestId);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    return await fetchParsed(`/api/route-data?route=${encodeURIComponent(route)}&flow=${encodeURIComponent(flow)}&generation=${generation}`, routeDataDetailResponseSchema, {
      signal,
      headers: { [ROUTE_REQUEST_ID_HEADER]: requestId },
    });
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
};
export function fetchSourceExcerpt(
  target: SourceEvidenceTarget,
  generation = latestAnalysisGeneration,
  contextBefore = SOURCE_EXCERPT_DEFAULT_CONTEXT_LINES,
  contextAfter = SOURCE_EXCERPT_DEFAULT_CONTEXT_LINES,
) {
  if (generation === null) throw new ApiClientError("missing_generation", "A current analysis generation is required before loading source evidence.", 0);
  const params = new URLSearchParams({
    path: target.path,
    generation: String(generation),
    startLine: String(target.span.startLine),
    startColumn: String(target.span.startColumn),
    endLine: String(target.span.endLine),
    endColumn: String(target.span.endColumn),
    contextBefore: String(contextBefore),
    contextAfter: String(contextAfter),
  });
  return fetchParsed(`/api/route-data/source?${params.toString()}`, sourceExcerptResponseSchema);
}
export function refreshFailureMessage(error: unknown) { return `${error instanceof Error ? error.message : String(error)} Check the configured source and tsconfig paths, then try again.`; }

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw await responseError(response, url);
  return response.text();
}

async function responseError(response: Response, url: string) {
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (parsed.success) return new ApiClientError(parsed.data.error.code, parsed.data.error.message, response.status);
  } catch { /* fall through to the status error */ }
  return new ApiClientError("request_failed", `${url} returned ${response.status}`, response.status);
}
