import { auditStream, recordsTable } from "./adapters";

export interface ServerlessRecordsEvent {
  body: string | null;
  requestContext: {
    requestId: string;
  };
}

export interface ServerlessContext {
  functionName: string;
}

export interface StoredRecord {
  id: string;
  ownerId: string;
  title: string;
  state: "open" | "closed";
  updatedAt: string;
  internalTag: string;
}

export interface RecordsTable {
  query(input: { ownerId: string; limit: number }): Promise<readonly StoredRecord[]>;
}

export interface AuditStream {
  put(event: {
    requestId: string;
    functionName: string;
    ownerId: string;
    selectedCount: number;
  }): Promise<void>;
}

export interface RecordsDependencies {
  recordsTable: RecordsTable;
  auditStream: AuditStream;
}

export interface PublicRecord {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ServerlessRecordsResponse {
  statusCode: 200 | 400;
  headers: {
    "content-type": "application/json";
  };
  body: string;
}

interface RecordsRequest {
  ownerId: string;
  limit: number;
}

type ValidationResult =
  | { ok: true; value: RecordsRequest }
  | { ok: false; message: string };

export function createRecordsHandler(dependencies: RecordsDependencies) {
  return async function recordsHandler(
    event: ServerlessRecordsEvent,
    context: ServerlessContext,
  ): Promise<ServerlessRecordsResponse> {
    const validation = validateInput(event);
    if (!validation.ok) return jsonResponse(400, { error: validation.message });

    const rows = await dependencies.recordsTable.query({
      ownerId: validation.value.ownerId,
      limit: validation.value.limit,
    });
    const records = rows
      .filter((row) => row.state === "open")
      .slice(0, validation.value.limit)
      .map(selectPublicFields);

    await dependencies.auditStream.put({
      requestId: event.requestContext.requestId,
      functionName: context.functionName,
      ownerId: validation.value.ownerId,
      selectedCount: records.length,
    });

    return jsonResponse(200, {
      requestId: event.requestContext.requestId,
      records,
    });
  };
}

export const handler = createRecordsHandler({ recordsTable, auditStream });

function validateInput(event: ServerlessRecordsEvent): ValidationResult {
  if (event.body === null) return { ok: false, message: "Request body is required." };

  let decoded: unknown;
  try {
    decoded = JSON.parse(event.body) as unknown;
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }

  if (!isRecord(decoded)) return { ok: false, message: "Request body must be an object." };

  const ownerId = decoded.ownerId;
  const limit = decoded.limit;
  if (
    typeof ownerId !== "string"
    || ownerId.trim() === ""
    || typeof limit !== "number"
    || !Number.isInteger(limit)
    || limit < 1
    || limit > 50
  ) {
    return { ok: false, message: "ownerId and a limit from 1 to 50 are required." };
  }

  return { ok: true, value: { ownerId, limit } };
}

function selectPublicFields(row: StoredRecord): PublicRecord {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt,
  };
}

function jsonResponse(statusCode: 200 | 400, payload: unknown): ServerlessRecordsResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
