import { createEffect, createResource, For, Show } from "solid-js";
import type { RecordsResponse, RemoteSummary } from "./records";

async function requestRecords(): Promise<RecordsResponse> {
  const response = await fetch("/api/records", { method: "GET" });
  if (!response.ok) throw new Error("The records request failed.");
  return (await response.json()) as RecordsResponse;
}

async function requestRemoteSummary(): Promise<RemoteSummary> {
  const response = await fetch(
    "https://telemetry.example.test/api/records-summary",
    { method: "GET" },
  );
  if (!response.ok) throw new Error("The summary request failed.");
  return (await response.json()) as RemoteSummary;
}

export function RecordsPage() {
  const [records] = createResource(requestRecords);
  const [remoteSummary] = createResource(requestRemoteSummary);

  createEffect(() => {
    const loadedCount = records()?.records.length ?? 0;
    console.info(`Rendered ${loadedCount} records.`);
  });

  return (
    <main>
      <h1>Records</h1>
      <p>Server records are validated before the client renders them.</p>
      <p>Remote active count: {remoteSummary()?.active ?? "unavailable"}</p>
      <Show when={records()} fallback={<p>Loading records…</p>}>
        {(payload) => (
          <ul>
            <For each={payload().records}>
              {(record) => (
                <li>
                  <strong>{record.name}</strong> — {record.status}
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
    </main>
  );
}
