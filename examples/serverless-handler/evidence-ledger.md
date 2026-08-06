# Evidence ledger: serverless records handler

## Scope

The fixture root is `examples/serverless-handler/`.

The selected handler-entry is `src/handler.ts:65-92`, the nested
`recordsHandler` function returned by `createRecordsHandler`. The factory body
is `src/handler.ts:64-93`. The exported `handler` assignment/call at
`src/handler.ts:95` is factory/registration proof, not the selected entry.

The smoke-only path is `src/smoke-run.ts:1-36`. It supplies local adapters and
reads `data/records.json:1-34`. It is not a deployed handler path.

This ledger uses source inspection. It does not use runtime telemetry.

## Story and exact origins

| Stage | Exact origin | Proven relation | Static occurrence | Runtime multiplicity |
| --- | --- | --- | --- | --- |
| Event entry | `src/handler.ts:65-68` | The selected nested `recordsHandler` function accepts `event: ServerlessRecordsEvent` and `context: ServerlessContext`. `createRecordsHandler` returns it, and the exported `handler` assignment at `src/handler.ts:95` invokes that factory. | One nested handler-entry function, one factory call, and one exported assignment. | The module creates one handler value per module evaluation. Invocation count is external. |
| Validate input | `src/handler.ts:69-70`, `src/handler.ts:97-123` | The event body goes to JSON parsing and checks for an object, owner ID, and integer limit. | One validation call and one validation function. | One validation attempt per invocation. Invalid input stops before the external read. |
| External read | `src/handler.ts:72-75`, `src/handler.ts:23-25` | The validated owner ID and limit go to `recordsTable.query`. | One lexical `query` call. | Zero calls for invalid input. One call for each valid invocation. Retries are not modeled. |
| Select and pack | `src/handler.ts:76-79`, `src/handler.ts:125-131` | Read rows are filtered to `open`, limited, and packed into `id`, `title`, and `updatedAt`. | One filter, slice, map chain and one field-packing function. | The chain runs once per valid invocation. The mapper runs once per selected row. `internalTag` is not returned. |
| External effect | `src/handler.ts:81-86`, `src/handler.ts:27-33` | The request and selection count go to `auditStream.put`. | One lexical `put` call. | Zero calls for invalid input. One call after selection for each valid invocation. Retries are not modeled. |
| Success response | `src/handler.ts:88-91`, `src/handler.ts:133-139` | The request ID and packed records form a JSON response with status `200`. | One success return branch. | One success response for each invocation that reaches the effect. |
| Invalid response | `src/handler.ts:70`, `src/handler.ts:133-139` | Validation failure forms a JSON response with status `400`. | One invalid return branch. | One invalid response for each rejected invocation. |

## Comparable-story field roles

| Role | Field | Exact origin | Surface |
| --- | --- | --- | --- |
| Identity | `id` | `src/handler.ts:15`, `src/handler.ts:127` | Presented |
| Label | `title` | `src/handler.ts:17`, `src/handler.ts:128` | Presented |
| Owner | `ownerId` | `src/handler.ts:16`, `src/handler.ts:73`, `src/handler.ts:84` | Read and audit key; not public output |
| Status | `state` | `src/handler.ts:18`, `src/handler.ts:77` | Selection only; not public output |
| Measure | Absent | No measure field in `src/handler.ts:14-21` or `src/handler.ts:125-131` | Absent |
| Presented field | `updatedAt` | `src/handler.ts:19`, `src/handler.ts:129` | Presented |
| Excluded field | `internalTag` | `src/handler.ts:20`; no selector mapping | Excluded |

## Boundaries

- The selected handler-entry is the nested `recordsHandler` function at
  `src/handler.ts:65-92`. Its event and context parameters are at
  `src/handler.ts:66-67`. `ServerlessRecordsEvent` and `ServerlessContext`
  define those local shapes at `src/handler.ts:3-12`. The exported `handler`
  assignment/call at `src/handler.ts:95` is factory/registration proof, not the
  entry.
- The records read boundary is the `RecordsTable.query` contract at
  `src/handler.ts:23-25`. The handler crosses it at `src/handler.ts:72`.
- The audit write boundary is the `AuditStream.put` contract at
  `src/handler.ts:27-33`. The handler crosses it at `src/handler.ts:81`.
- The default adapter objects at `src/adapters.ts:3-13` are no-op local
  implementations. They do not establish a cloud service or database.
- The smoke adapters at `src/smoke-run.ts:9-20` are local execution
  support. They are not part of the deployed handler contract.

## Terminals

The fixture has three source-level terminals:

1. `src/handler.ts:70` returns the `400` validation response.
2. `src/handler.ts:81-86` completes one audit write before success.
3. `src/handler.ts:88-91` returns the `200` response.

The source does not prove that a framework sends the returned object to an
HTTP client. It only proves that the selected handler-entry function returns
this shape.

## Static occurrence versus runtime multiplicity

- The `query` call appears once. A valid request reaches it once. The source
  has no loop, retry, batch, or parallel branch around the call.
- The `put` call appears once. A valid request reaches it once after selection.
  The default adapter completes without an external write.
- The `filter`, `slice`, and `map` operations appear once. They execute once
  per valid invocation. `selectPublicFields` executes once per selected row.
- `JSON.parse` appears once at `src/handler.ts:102`. It runs only after a
  non-null body check. Parse failure returns the `400` terminal.
- `data/records.json` is read only by `src/smoke-run.ts:4-6`. It is fixture
  input, not the handler's external read.

## Adapter discovery evidence

The source provides convention evidence, not framework proof:

- The exported name `handler` is assigned by a `createRecordsHandler` call at
  `src/handler.ts:95`. That assignment/call is factory/registration proof; the
  selected `handler-entry` is the nested `recordsHandler` function at
  `src/handler.ts:65-92`.
- The `event` and `context` parameters appear at `src/handler.ts:66-67`. Their
  local types appear at `src/handler.ts:3-12`.
- The read and effect seams are named `RecordsTable` and `AuditStream` at
  `src/handler.ts:23-33`.
- No framework package, runtime SDK, deployment manifest, or platform adapter
  exists in this fixture.
- The current analyzer command is the one in `README.md`. Its JSON summary is
  `sources: 0`, `sinks: 0`, `nodes: 0`, `edges: 0`, `unknownEdges: 0`, and
  `pathFamilies: 0`. The analyzer therefore supplies no adapter discovery or
  route-data proof for this handler.

## Intentional gaps

- The fixture does not claim AWS Lambda, API Gateway, or another deployed
  serverless runtime. The event shape is only a local convention.
- The default records adapter returns an empty list. The default audit adapter
  performs no write. The smoke run replaces both with local implementations.
- The ledger does not claim database consistency, network delivery, retries,
  timeouts, authentication, authorization, or error mapping for adapter
  failures.
- The current analyzer is render-path focused. It does not recognize this
  handler as a render route and returns an empty graph. No analyzer evidence
  is invented for the read, effect, selection, or response relations.
