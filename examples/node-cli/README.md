# Node CLI records example

This fixture is a small `record-report` command. It reads a JSON array of
sales records, validates each record, keeps records above a total threshold,
packs the selected fields into a report, prints the report, and writes the
same report to a file.

The local [`package.json`](package.json) registers `src/cli.ts` as the command
entry. The repository's `tsx` runner provides the development runtime for the
TypeScript entry file.

## Run it

From the repository root:

```sh
pnpm exec tsx examples/node-cli/src/cli.ts \
  --records examples/node-cli/data/records.json \
  --output /tmp/tsx-data-flow-node-cli-report.json \
  --min-total 100
```

The command prints two selected records (`Aster Labs` and `Cedar Works`) and
writes the same JSON report to `/tmp/tsx-data-flow-node-cli-report.json`.

The same values can come from the environment. Command arguments take
precedence over environment values, then the command uses its defaults.

```sh
RECORDS_PATH=examples/node-cli/data/records.json \
REPORT_PATH=/tmp/tsx-data-flow-node-cli-report.json \
MIN_TOTAL=100 \
pnpm exec tsx examples/node-cli/src/cli.ts
```

## Analyze it

Run the existing repository CLI against the selected `run` scope. The output
is bounded JSON and goes to `/tmp`, so the fixture remains unchanged.

```sh
pnpm tsx bin/tsx-dataflow.ts \
  --root examples/node-cli \
  --source src \
  --tsconfig tsconfig.json \
  --scope run \
  --view overview \
  --format json \
  --max-items 20 \
  --out /tmp/tsx-data-flow-node-cli-overview.json
```

The analyzer's current reports are render-path reports. The handwritten
[`evidence-ledger.md`](evidence-ledger.md) is the expected scope-neutral CLI
evidence for this fixture; it does not claim analyzer output that the current
render-only surface cannot provide.
