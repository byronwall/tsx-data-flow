import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { apiErrorSchema } from "../api/contracts";

const STATIC_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8", ".svg": "image/svg+xml",
};

export function send(res: ServerResponse, status: number, body: string | Buffer, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}
export function sendJson(res: ServerResponse, status: number, value: unknown) {
  return send(res, status, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}
export function sendError(res: ServerResponse, status: number, code: string, message: string, details?: unknown) {
  return sendJson(res, status, apiErrorSchema.parse({ error: { code, message, ...(details === undefined ? {} : { details }) } }));
}
export function sendFile(res: ServerResponse, filePath: string) {
  try {
    return send(res, 200, fs.readFileSync(filePath), STATIC_TYPES[path.extname(filePath)] ?? "application/octet-stream");
  } catch {
    return send(res, 404, "not found");
  }
}
