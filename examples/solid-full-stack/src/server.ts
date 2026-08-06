import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import {
  selectPublicFields,
  validateStoredRecords,
  type RecordsResponse,
} from "./records";

const recordsFile = fileURLToPath(new URL("../data/records.json", import.meta.url));

export async function loadRecords(): Promise<RecordsResponse["records"]> {
  const source = await readFile(recordsFile, "utf8");
  const storedRecords = validateStoredRecords(JSON.parse(source) as unknown);
  return selectPublicFields(storedRecords);
}

export async function serializeRecordsResponse(): Promise<string> {
  const records = await loadRecords();
  const payload: RecordsResponse = { records };
  return JSON.stringify(payload);
}

export async function handleRecords(
  _request: IncomingMessage,
  response: ServerResponse,
) {
  const body = await serializeRecordsResponse();
  response.writeHead(200, { "content-type": "application/json" });
  response.end(body);
}

export function createRecordsServer() {
  return createServer(async (request, response) => {
    const pathname = new URL(
      request.url ?? "/",
      "http://records.local",
    ).pathname;

    if (request.method === "GET" && pathname === "/api/records") {
      await handleRecords(request, response);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
  });
}
