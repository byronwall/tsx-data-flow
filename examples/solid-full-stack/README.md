# Solid full-stack records fixture

This fixture shows one small records flow across a server and a Solid client:

```text
data/records.json
  → server read
  → validation
  → public-field selection
  → JSON response
  → client GET /api/records
  → Solid resource
  → rendered record list
  → console.info side effect
```

The server handler has one exact static bridge:

```ts
request.method === "GET" && pathname === "/api/records"
```

The client also requests `https://telemetry.example.test/api/records-summary`.
This fixture has no handler for that URL. The request remains an external gap.

## Run the checks

Run these commands from the repository root. They do not run tests.

```sh
pnpm exec tsc -p examples/solid-full-stack/tsconfig.json --noEmit
pnpm exec eslint examples/solid-full-stack
pnpm tsx bin/tsx-dataflow.ts \
  --root examples/solid-full-stack \
  --source src \
  --tsconfig tsconfig.json \
  --file src/client.tsx \
  --view overview \
  --format json \
  --max-items 8
```

The file-scoped JSON run currently reports 6 sources, 8 sinks, 29 graph nodes,
21 graph edges, and 4 path families. The `--max-items 8` cap keeps the selected
report bounded.

For the broader report, use the same root and configuration with
`--file src/client.tsx --view boundary-report --format markdown --max-items 8`.

The current CLI reports the client resource and JSX render sinks. It does not
yet expose the `fetch` call, the `console.info` effect, or the server read as a
render-path sink. It also does not join the server read to the client resource
across the HTTP boundary. The evidence ledger records these limits instead of
inferring connections.
