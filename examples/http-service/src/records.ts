import type { PublicRecord, RecordCreatedEvent, RecordItem } from "./types";

export function selectPublicRecord(record: RecordItem): PublicRecord {
  const { id, name, status } = record;
  return { id, name, status };
}

export function packRecordCreatedEvent(
  record: RecordItem,
): RecordCreatedEvent {
  return {
    type: "record.created",
    recordId: record.id,
    ownerEmail: record.ownerEmail,
  };
}
