import type { z } from "zod";
import { apiErrorSchema, refreshResponseSchema, workspaceResponseSchema } from "../../api/contracts";

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw await responseError(response, url);
  return response.json() as Promise<T>;
}

async function fetchParsed<T extends z.ZodType>(url: string, schema: T, init?: RequestInit): Promise<z.infer<T>> {
  const response = await fetch(url, init);
  if (!response.ok) throw await responseError(response, url);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new ApiClientError("invalid_content_type", `${url} did not return JSON`, response.status);
  return schema.parse(await response.json());
}

export const fetchWorkspace = () => fetchParsed("/api/workspace", workspaceResponseSchema);
export const refreshWorkspace = () => fetchParsed("/api/refresh", refreshResponseSchema, { method: "POST" });

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
