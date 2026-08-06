export type RecordStatus = "open" | "closed";

export type RecordItem = {
  id: string;
  name: string;
  status: RecordStatus;
  ownerEmail: string;
};

export type NewRecordInput = Pick<RecordItem, "name" | "status" | "ownerEmail">;

export type PublicRecord = Pick<RecordItem, "id" | "name" | "status">;

export type RecordCreatedEvent = {
  type: "record.created";
  recordId: string;
  ownerEmail: string;
};
