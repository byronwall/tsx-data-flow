import type { RecordCreatedEvent } from "./types";

const defaultAuditEndpoint = "https://audit.example.invalid/records";

export async function publishRecordCreated(
  event: RecordCreatedEvent,
): Promise<void> {
  const endpoint = process.env.AUDIT_ENDPOINT ?? defaultAuditEndpoint;
  const result = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });

  if (!result.ok) {
    throw new Error(`audit request failed with status ${result.status}`);
  }
}
