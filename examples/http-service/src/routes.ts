import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { publishRecordCreated } from "./audit";
import { readJsonBody } from "./request";
import {
  packRecordCreatedEvent,
  selectPublicRecord,
} from "./records";
import { RecordStore } from "./storage";
import { validateRecordInput } from "./validation";

const store = new RecordStore(
  process.env.RECORDS_PATH ?? fileURLToPath(new URL("../data/records.json", import.meta.url)),
);

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(payload);
}

export async function requestHandler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const pathname = new URL(
    request.url ?? "/",
    "http://127.0.0.1",
  ).pathname;

  if (request.method === "GET" && pathname === "/records") {
    const records = await store.loadRecords();
    const publicRecords = records.map(selectPublicRecord);
    sendJson(response, 200, { records: publicRecords });
    return;
  }

  if (request.method === "POST" && pathname === "/records") {
    let input: unknown;
    try {
      input = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { error: "request body must be valid JSON" });
      return;
    }

    const validation = validateRecordInput(input);
    if (!validation.ok) {
      sendJson(response, 422, { error: validation.message });
      return;
    }

    const record = await store.appendRecord(validation.value);
    const publicRecord = selectPublicRecord(record);
    const event = packRecordCreatedEvent(record);

    try {
      await publishRecordCreated(event);
    } catch (error) {
      console.error("record audit publish failed", error);
    }

    sendJson(response, 201, { record: publicRecord });
    return;
  }

  sendJson(response, 404, { error: "not found" });
}
