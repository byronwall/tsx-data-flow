export type StoredRecord = {
  id: string;
  name: string;
  status: "ready" | "paused";
  owner: string;
  internalNote: string;
};

export type PublicRecord = Pick<StoredRecord, "id" | "name" | "status">;

export type RecordsResponse = {
  records: PublicRecord[];
};

export type RemoteSummary = {
  active: number;
};

export function validateStoredRecords(value: unknown): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("The records file must contain an array.");
  }

  return value.map((entry) => {
    if (!isStoredRecord(entry)) {
      throw new Error("The records file contains an invalid record.");
    }
    return entry;
  });
}

export function selectPublicFields(records: StoredRecord[]): PublicRecord[] {
  return records.map(({ id, name, status }) => ({ id, name, status }));
}

function isStoredRecord(value: unknown): value is StoredRecord {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<StoredRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    (candidate.status === "ready" || candidate.status === "paused") &&
    typeof candidate.owner === "string" &&
    typeof candidate.internalNote === "string"
  );
}
