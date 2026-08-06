import { readFile } from "node:fs/promises";

export interface SalesRecord {
  id: string;
  customer: string;
  total: number;
  status: "open" | "paid";
}

export interface ReportRow {
  id: string;
  customer: string;
  total: number;
}

export interface Report {
  minimumTotal: number;
  recordCount: number;
  total: number;
  rows: ReportRow[];
}

export async function loadRecords(recordsPath: string): Promise<unknown> {
  const contents = await readFile(recordsPath, "utf8");
  return JSON.parse(contents) as unknown;
}

export function validateRecords(value: unknown): SalesRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("The records file must contain an array.");
  }

  return value.map((entry, index) => validateRecord(entry, index));
}

function validateRecord(value: unknown, index: number): SalesRecord {
  if (!isObjectRecord(value)) {
    throw new Error(`Record ${index + 1} must be an object.`);
  }

  const id = readText(value.id, "id", index);
  const customer = readText(value.customer, "customer", index);
  const total = value.total;
  const status = value.status;

  if (typeof total !== "number" || !Number.isFinite(total)) {
    throw new Error(`Record ${index + 1} has an invalid total.`);
  }
  if (status !== "open" && status !== "paid") {
    throw new Error(`Record ${index + 1} has an invalid status.`);
  }

  return { id, customer, total, status };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, field: string, index: number): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Record ${index + 1} has an invalid ${field}.`);
  }
  return value;
}

export function selectReportRows(
  records: SalesRecord[],
  minimumTotal: number,
): ReportRow[] {
  return records
    .filter((record) => record.total >= minimumTotal)
    .map((record) => ({
      id: record.id,
      customer: record.customer,
      total: record.total,
    }));
}

export function packReport(
  rows: ReportRow[],
  minimumTotal: number,
): Report {
  return {
    minimumTotal,
    recordCount: rows.length,
    total: rows.reduce((sum, row) => sum + row.total, 0),
    rows,
  };
}
