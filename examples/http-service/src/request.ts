import type { IncomingMessage } from "node:http";

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let body = "";

  for await (const chunk of request) {
    body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  }

  if (body.trim() === "") {
    return {};
  }

  return JSON.parse(body) as unknown;
}
