# HTTP service evidence ledger

This ledger is the expected static evidence for the `/records` HTTP scope. It
uses source locations from this fixture. It does not claim runtime counts or
connections that are not present in the repository.

## Scope entry

| Evidence | Source location | Meaning |
| --- | --- | --- |
| HTTP server registration | [`src/server.ts:7`](src/server.ts#L7) | `createServer(requestHandler)` supplies the service entry callback. |
| Handler definition | [`src/routes.ts:26`](src/routes.ts#L26) | `requestHandler(request, response)` receives the request boundary and response boundary. |
| GET endpoint branch | [`src/routes.ts:35`](src/routes.ts#L35) | Discovers `GET /records`. |
| POST endpoint branch | [`src/routes.ts:42`](src/routes.ts#L42) | Discovers `POST /records`. |

The direct-run guard at [`src/server.ts:15-16`](src/server.ts#L15) starts the
registered server when the entry file is executed. Importing the module creates
the server object but does not listen.

## Origins and boundaries

| Role | Source location | Evidence |
| --- | --- | --- |
| Request method and URL origin | [`src/routes.ts:26-33`](src/routes.ts#L26) | Node supplies `request.method` and `request.url`; the handler normalizes the URL before endpoint selection. |
| Request body origin | [`src/request.ts:3-14`](src/request.ts#L3) | The handler consumes the incoming request stream and parses JSON into `unknown`; the call occurs at [`src/routes.ts:45`](src/routes.ts#L45). |
| Persisted record origin | [`src/storage.ts:8-10`](src/storage.ts#L8) | `readFile` reads the configured records file, defaulting to [`data/records.json`](data/records.json), then `validateStoredRecords` establishes the `RecordItem[]` shape. |
| Persistence path configuration | [`src/routes.ts:13`](src/routes.ts#L13) | `RECORDS_PATH` selects a disposable or configured records file; without it, the service uses tracked `data/records.json`. |
| Request validation boundary | [`src/validation.ts:41-50`](src/validation.ts#L41) | `validateRecordInput` narrows unknown JSON to `NewRecordInput` or returns an error. |
| Persistence write boundary | [`src/storage.ts:13-22`](src/storage.ts#L13) | `appendRecord` loads the current records, appends one item, and calls `writeFile`. |
| Response shaping boundary | [`src/records.ts:3-15`](src/records.ts#L3) | `selectPublicRecord` drops `ownerEmail`; `packRecordCreatedEvent` keeps only fields needed by the audit event. |
| External configuration origin | [`src/audit.ts:8`](src/audit.ts#L8) | `AUDIT_ENDPOINT` comes from the process environment, with an intentionally invalid default. |
| External consumer boundary | [`src/audit.ts:9-13`](src/audit.ts#L9) | `fetch` sends the packed event to a service that has no implementation in this repository. |

## Terminals

| Terminal | Source location | Path |
| --- | --- | --- |
| Successful GET response | [`src/routes.ts:38`](src/routes.ts#L38) and [`src/routes.ts:21-23`](src/routes.ts#L21) | Loaded records are selected into public records and end as JSON. |
| Successful POST response | [`src/routes.ts:67`](src/routes.ts#L67) and [`src/routes.ts:21-23`](src/routes.ts#L21) | The persisted record is selected into a response object and ends as JSON. |
| Persistence side effect | [`src/storage.ts:21`](src/storage.ts#L21) | The new record reaches the file write. |
| Audit side effect / external terminal | [`src/routes.ts:59-65`](src/routes.ts#L59) and [`src/audit.ts:9-13`](src/audit.ts#L9) | One packed event reaches the external `fetch`; failures are logged and do not suppress the created-record response. |
| Audit failure log terminal | [`src/routes.ts:64`](src/routes.ts#L64) | `console.error` records an external publish failure inside the handler. This is a terminal for the failed audit branch, not a successful consumer connection. |
| Invalid JSON response | [`src/routes.ts:46-49`](src/routes.ts#L46) | Malformed request input ends at a `400` JSON response. |
| Invalid record response | [`src/routes.ts:51-55`](src/routes.ts#L51) | A failed validation result ends at a `422` JSON response. |
| Unmatched request response | [`src/routes.ts:71`](src/routes.ts#L71) | Requests outside the two discovered endpoints end at a `404` JSON response. |

## Proven relations

1. [`src/server.ts:7`](src/server.ts#L7) registers `requestHandler` with the
   Node HTTP server.
2. [`src/routes.ts:35-40`](src/routes.ts#L35) connects `GET /records` to
   `RecordStore.loadRecords`, `selectPublicRecord`, and the JSON response.
3. [`src/storage.ts:8-10`](src/storage.ts#L8) connects the persisted file read
   to stored-record validation.
4. [`src/routes.ts:42-55`](src/routes.ts#L42) connects `POST /records` request
   bytes to JSON parsing and request validation.
5. [`src/routes.ts:57`](src/routes.ts#L57) connects validated input to
   `RecordStore.appendRecord`; [`src/storage.ts:14-21`](src/storage.ts#L14)
   connects that operation to a read, append, and file write.
6. [`src/routes.ts:58-59`](src/routes.ts#L58) connects the stored record to
   both the public response shape and the packed audit event.
7. [`src/routes.ts:61-67`](src/routes.ts#L61) connects the packed event to the
   external publish attempt, then connects the selected record to the `201`
   response.
8. [`src/routes.ts:71`](src/routes.ts#L71) is an explicit terminal for requests
   that do not match either `/records` branch. It is not joined to the records
   flow.

## Comparable-story field-role matrix

| Story role | Field | Evidence |
| --- | --- | --- |
| Identity | `id` | [`src/types.ts:4`](src/types.ts#L4), selected in [`src/records.ts:4-5`](src/records.ts#L4). |
| Label | `name` | [`src/types.ts:5`](src/types.ts#L5), selected in [`src/records.ts:4-5`](src/records.ts#L4). |
| Owner | `ownerEmail` | [`src/types.ts:7`](src/types.ts#L7), packed into the audit event in [`src/records.ts:13-14`](src/records.ts#L13). |
| Status | `status` | [`src/types.ts:6`](src/types.ts#L6), validated in [`src/validation.ts:17-23`](src/validation.ts#L17). |
| Measure | Absent | The fixture has no numeric or quantity field. No measure flow is claimed. |

## Static occurrence versus runtime multiplicity

| Static occurrence | Runtime interpretation |
| --- | --- |
| One `createServer` call and one `requestHandler` definition | The server can invoke the handler for any number of requests. |
| One GET branch and one POST branch | At most one branch runs for each request. |
| One `records.map(selectPublicRecord)` call | One public-record selection runs per stored record during each GET. |
| One `readJsonBody`, validation, append, and audit call site | Each call can run once per POST request that reaches that stage. Invalid JSON stops before validation; invalid fields stop before persistence. |
| One `loadRecords` call in `appendRecord` and one `writeFile` call | Each successful append reads once and writes once for that request. Concurrent requests are not modeled. |
| One `sendJson` function with one `response.end` call | One response terminal is expected for each handled request path. |
| One `fetch` call in `publishRecordCreated` | One audit request is attempted per persisted POST, but the external service may fail or be unavailable. |

These are static call-site facts and per-invocation expectations. The fixture
does not measure request volume, record counts over time, retries, or concurrent
execution.

## Intentional gaps

- The audit consumer behind [`src/audit.ts:9`](src/audit.ts#L9) is external.
  There is no in-repository declaration to connect after `fetch`. The default
  host is intentionally invalid, so the ledger stops at that boundary.
- Node's `http`, `fs/promises`, `url`, and global `fetch` implementations are
  library boundaries. This fixture records the calls, but does not invent their
  internal implementation paths.
- The existing repository CLI is a render-path analyzer. The README smoke
  command currently reports no JSX render paths for this service. It does not
  yet prove the HTTP handler, request boundary, persistence operations, JSON
  response, or external consumer as a scope-neutral slice.
- Runtime multiplicity and error rates are outside a handwritten static ledger.
