# Evidence ledger

This ledger is the expected proof map for the fixture. Locations use the
repository-relative paths and current source lines.

## Selected scope

| Entry | Exact origin or seed | Boundary | Terminal | Static occurrence | Runtime multiplicity |
| --- | --- | --- | --- | --- | --- |
| `RecordsPage` | `src/client.tsx:19`, exported Solid component | Browser/client entry | `src/client.tsx:23-26`, `console.info` inside `createEffect`; JSX list at `src/client.tsx:36-40` | One component occurrence | One page instance may run the effect once initially and again when the resource changes |
| `handleRecords` | `src/server.ts:24`, handler called by the HTTP branch | Server/HTTP entry | `src/server.ts:30`, `response.end(body)` | One handler definition | Once per matching request |

## Comparable record field roles

| Story role | Field | Evidence |
| --- | --- | --- |
| Identity | `id` | Stored and publicly packed at `src/records.ts:1-3`, `src/records.ts:32-34`. |
| Label | `name` | Stored and publicly packed at `src/records.ts:3`, `src/records.ts:32-34`. |
| Owner | `owner` | Stored and validated at `src/records.ts:5`, `src/records.ts:44`; excluded from public packing. |
| Status | `status` | Stored, validated, and publicly packed at `src/records.ts:4`, `src/records.ts:32-34`. |
| Measure | Absent | No measure field exists in `StoredRecord`, the fixture data, or `RecordsResponse`. |

`internalNote` is stored and validated, but it is excluded during public
packing at `src/records.ts:32-34`.

## Occurrence versus runtime multiplicity

- `requestRecords` has one static function and one `createResource` call. A page
  instance starts one request, with more requests possible after a refetch.
- The `For` callback has one static occurrence. The initial fixture data creates
  three rendered list items. Static occurrence count is not three.
- `handleRecords` has one static definition and one route branch. Runtime
  multiplicity follows matching `GET /api/records` requests.
- `createEffect` has one static effect occurrence. Solid can run it initially
  and again when `records()` changes.
- `requestRemoteSummary` has one static unmatched request occurrence. It stays
  external because no local handler matches its method and URL.

## Proven server flow

| Step | Location | Evidence |
| --- | --- | --- |
| File origin | `data/records.json:1-23` | The server reads this local JSON file through `recordsFile` at `src/server.ts:10`. |
| Server read | `src/server.ts:13` | `readFile(recordsFile, "utf8")` is the persistence read. |
| Parse and validation | `src/server.ts:14`, `src/records.ts:19-30` | JSON is parsed, then each stored record is checked for the expected fields. |
| Field selection | `src/server.ts:15`, `src/records.ts:32-34` | `owner` and `internalNote` are removed before transport. |
| Response packing | `src/server.ts:19-20` | The selected records are packed under the `records` response field. |
| Serialization | `src/server.ts:21` | `JSON.stringify(payload)` creates the response body. |
| HTTP terminal | `src/server.ts:30` | `response.end(body)` returns the serialized records. |

## Proven client flow

| Step | Location | Evidence |
| --- | --- | --- |
| Exact client request | `src/client.tsx:5` | `fetch("/api/records", { method: "GET" })`. |
| Client response parse | `src/client.tsx:7` | The response is parsed as `RecordsResponse`. |
| Solid resource | `src/client.tsx:20` | `createResource(requestRecords)` owns the request result. |
| Loading terminal | `src/client.tsx:33` | `<Show when={records()} fallback={<p>Loading records…</p>}>` renders the loading fallback while the resource is unresolved. One static fallback occurrence can appear once per resource loading phase at runtime, not once per record. |
| Render terminal | `src/client.tsx:36-40` | `For` renders each selected record's name and status. |
| Side effect | `src/client.tsx:23-26` | `createEffect` reports the rendered count with `console.info`. |

## Network bridge and gap

The exact static bridge is the pair below:

```text
src/server.ts:40  request.method === "GET" && pathname === "/api/records"
src/client.tsx:5  fetch("/api/records", { method: "GET" })
```

The method and URL match exactly. This is static evidence. It does not prove
that a process started both modules or that a proxy routes the request.

The unmatched request is `src/client.tsx:11`:

```text
fetch("https://telemetry.example.test/api/records-summary", { method: "GET" })
```

No handler in this fixture has that static method-and-URL pair. Keep it as an
external/network gap. Do not connect it to `/api/records` by path similarity.

## Analyzer boundary

The existing CLI can report the Solid resource and JSX records when scoped to
`src/client.tsx`. It does not currently expose the `fetch` call or `console.info`
effect as render-path sinks. It also does not join the server read, handler,
serialized response, and client resource across the HTTP boundary. The expected
limitation is therefore:

```text
server origin → validation → selection → serialization → response terminal
                                                          │
                                             HTTP bridge not joined by CLI
                                                          │
client fetch → resource → JSX records → effect
```

The ledger keeps both sides and the bridge fact visible. It does not claim a
cross-process edge that the current analyzer has not proven.
