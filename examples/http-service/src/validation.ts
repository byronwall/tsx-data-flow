import type { NewRecordInput, RecordItem, RecordStatus } from "./types";

type JsonObject = { [key: string]: unknown };

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function requiredStatus(value: unknown): RecordStatus {
  if (value !== "open" && value !== "closed") {
    throw new Error("status must be open or closed");
  }

  return value;
}

function readNewRecordInput(value: unknown): NewRecordInput {
  if (!isJsonObject(value)) {
    throw new Error("request body must be a JSON object");
  }

  return {
    name: requiredString(value.name, "name"),
    status: requiredStatus(value.status),
    ownerEmail: requiredString(value.ownerEmail, "ownerEmail"),
  };
}

export type ValidationResult =
  | { ok: true; value: NewRecordInput }
  | { ok: false; message: string };

export function validateRecordInput(value: unknown): ValidationResult {
  try {
    return { ok: true, value: readNewRecordInput(value) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "invalid record",
    };
  }
}

export function validateStoredRecords(value: unknown): RecordItem[] {
  if (!Array.isArray(value)) {
    throw new Error("records file must contain an array");
  }

  return value.map((entry, index) => {
    if (!isJsonObject(entry)) {
      throw new Error(`record ${index + 1} must be an object`);
    }

    return {
      id: requiredString(entry.id, `record ${index + 1} id`),
      ...readNewRecordInput(entry),
    };
  });
}
