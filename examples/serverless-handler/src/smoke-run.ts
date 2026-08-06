import { readFile } from "node:fs/promises";
import { createRecordsHandler, type AuditStream, type StoredRecord } from "./handler";

const records = JSON.parse(
  await readFile(new URL("../data/records.json", import.meta.url), "utf8"),
) as StoredRecord[];
const auditEvents: Array<Parameters<AuditStream["put"]>[0]> = [];

const run = createRecordsHandler({
  recordsTable: {
    async query({ ownerId }) {
      return records.filter((record) => record.ownerId === ownerId);
    },
  },
  auditStream: {
    async put(event) {
      auditEvents.push(event);
    },
  },
});

const response = await run(
  {
    body: JSON.stringify({ ownerId: "owner-7", limit: 2 }),
    requestContext: { requestId: "request-1" },
  },
  { functionName: "records" },
);

if (response.statusCode !== 200) throw new Error(`Expected 200, got ${response.statusCode}.`);
const payload = JSON.parse(response.body) as { records: PublicRecord[] };
if (payload.records.length !== 2 || auditEvents.length !== 1) {
  throw new Error("The handler did not select two records and publish one audit event.");
}

console.log(JSON.stringify({ response, auditEvents }, null, 2));

interface PublicRecord {
  id: string;
  title: string;
  updatedAt: string;
}
