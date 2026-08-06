import type { RecordItem } from "./types";

export async function loadRecords(): Promise<RecordItem[]> {
  const response = await fetch("/records.json");
  if (!response.ok) throw new Error(`Records request failed: ${response.status}`);
  return validateRecords(await response.json());
}

export function validateRecords(payload: unknown): RecordItem[] {
  if (!Array.isArray(payload)) throw new Error("Records payload must be an array");

  return (payload as unknown[]).map((value, index) => {
    if (!isRecordItem(value)) throw new Error(`Invalid record at index ${index}`);
    return value;
  });
}

function isRecordItem(value: unknown): value is RecordItem {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.owner === "string" &&
    (record.status === "active" || record.status === "archived") &&
    typeof record.score === "number"
  );
}
