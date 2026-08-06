# Serverless records handler

This fixture shows one serverless records request.

The handler follows this story:

1. Receive an event and function context.
2. Validate the JSON request body.
3. Read rows through one records-table adapter call.
4. Keep open rows and pack three public fields.
5. Write one audit event.
6. Return a JSON response.

The source uses an AWS-Lambda-style `handler` export. It does not import an
AWS SDK or a framework package. The adapter names expose the seams without
claiming a deployed runtime.

## Files

- `src/handler.ts` contains the entry, validation, selection, field packing,
  audit effect, and response.
- `src/adapters.ts` contains local no-op adapter implementations.
- `src/smoke-run.ts` runs the handler with local adapters.
- `data/records.json` supplies four rows for the smoke run.
- `evidence-ledger.md` records exact origins, boundaries, terminals, and gaps.

## Run the smoke check

From the repository root:

```sh
pnpm exec tsx examples/serverless-handler/src/smoke-run.ts
```

The check returns two open records and one audit event. It uses local adapters.
It does not call a cloud service.

## Run the current analyzer

From the repository root:

```sh
pnpm exec tsx bin/tsx-dataflow.ts --root examples/serverless-handler --source src --tsconfig tsconfig.json --view findings --format json --max-items 5
```

The command completes with an empty render-path graph:

```json
{
  "sources": 0,
  "sinks": 0,
  "nodes": 0,
  "edges": 0,
  "unknownEdges": 0,
  "pathFamilies": 0
}
```

This result is expected for the current analyzer. It does not prove the
handler path. It does not report the event entry, adapter calls, audit effect,
or response as route-data operations. See `evidence-ledger.md` for the
source-led facts and intentional gaps.
