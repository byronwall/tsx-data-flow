# Solid route example

This fixture is a small records review route. It keeps two async sources
separate while they pass through one layout and several Solid components.

The flow is:

```text
records.json -> validate -> select active records -> pack summary -> render
viewer.json  -> validate ------------------------------------------> render
                                      \-> createEffect -> console.info
```

Run the existing analyzer from the repository root:

```bash
pnpm analyze \
  --root examples/solid-route \
  --source src \
  --tsconfig tsconfig.json \
  --file src/routes/records.tsx \
  --view overview \
  --format markdown \
  --max-items 12
```

The command discovers `/records` from `src/routes/records.tsx` and prints a
bounded report. The current analyzer reports `createResource` as an async
source boundary. It does not prove the JSON payload inside `fetch`, runtime
`<For>` counts, or every `Show` branch. See
[`evidence-ledger.md`](evidence-ledger.md) for the expected evidence and gaps.

This is a source fixture. It has no dev server or generated report.
