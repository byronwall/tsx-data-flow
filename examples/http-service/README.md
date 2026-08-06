# HTTP service example

This small Node service uses one records story:

1. `GET /records` reads persisted records.
2. `POST /records` reads and validates JSON request input.
3. The service selects public fields for its response.
4. A successful create packs an audit event and attempts one external publish.

The endpoint entry is [`src/server.ts`](src/server.ts). The request flow is in
[`src/routes.ts`](src/routes.ts). The file-backed store is in
[`src/storage.ts`](src/storage.ts), and the external boundary is in
[`src/audit.ts`](src/audit.ts).

## Run the service

From the repository root:

```bash
pnpm tsx examples/http-service/src/server.ts
```

The default server is safe for a read-only smoke request:

```bash
curl http://127.0.0.1:4340/records
```

`POST /records` writes to the file configured by `RECORDS_PATH`. If that
variable is not set, the service mutates the tracked
[`data/records.json`](data/records.json) file. Use a copied file for any POST
smoke flow. Stop the default server before starting this safe POST flow:

```bash
cp examples/http-service/data/records.json /tmp/tsx-data-flow-http-service-records.json
AUDIT_ENDPOINT=http://127.0.0.1:9/audit \
RECORDS_PATH=/tmp/tsx-data-flow-http-service-records.json \
PORT=4342 \
  pnpm tsx examples/http-service/src/server.ts
```

In another terminal:

```bash
curl \
  -X POST http://127.0.0.1:4342/records \
  -H 'content-type: application/json' \
  -d '{"name":"Westlake","status":"open","ownerEmail":"team@example.test"}'
```

The default audit URL is deliberately invalid. Set `AUDIT_ENDPOINT` when a
local consumer exists, or expect the service to log the failed publish and
still return the created record. The copied file is disposable; do not point a
POST smoke flow at the default tracked file.

## Run the repository analyzer

From the repository root:

```bash
pnpm tsx bin/tsx-dataflow.ts \
  --root examples/http-service \
  --source src \
  --tsconfig tsconfig.json \
  --view overview \
  --max-items 20
```

This is a repeatable smoke run through the existing CLI. The current analyzer
is a render-path analyzer. It does not yet discover HTTP request handlers,
`response.end` terminals, file persistence, or `fetch` consumers as one
scope-neutral service slice. Use [`evidence-ledger.md`](evidence-ledger.md) for
the expected HTTP evidence, and treat an empty render-path report as a current
tool limit rather than proof that this service has no data flow.
