import type { z } from "zod";
import { apiErrorSchema, filePageResponseSchema, refreshResponseSchema, reportResponseSchema, routeDataDetailResponseSchema, sourceExcerptResponseSchema, workspaceResponseSchema } from "../../api/contracts";
import type { RouteDataDetail } from "../../api/contracts";

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
      if (!canRetry || attempt >= 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
}

export const fetchWorkspace = () => fetchParsed("/api/workspace", workspaceResponseSchema);
export const fetchFilePage = (path: string) => fetchParsed(`/api/file?path=${encodeURIComponent(path)}`, filePageResponseSchema);
export const fetchReport = (view: string, path?: string) => fetchParsed(`/api/reports/${encodeURIComponent(view)}${path ? `?path=${encodeURIComponent(path)}` : ""}`, reportResponseSchema);
export const refreshWorkspace = () => fetchParsed("/api/refresh", refreshResponseSchema, { method: "POST" });
export const fetchRouteData = (route: string, flow: string, generation: number) => fetchParsed(`/api/route-data?route=${encodeURIComponent(route)}&flow=${encodeURIComponent(flow)}&generation=${generation}`, routeDataDetailResponseSchema);
export const fetchSourceExcerpt = (evidence: RouteDataDetail["evidence"][number]) => fetchParsed(`/api/route-data/source?path=${encodeURIComponent(evidence.file)}&line=${evidence.line}&column=${evidence.column}&endLine=${evidence.span.endLine}&endColumn=${evidence.span.endColumn}`, sourceExcerptResponseSchema);
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
