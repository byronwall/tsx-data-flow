# Route field proof acceptance

Use the maintained runner to check one selected source against named semantic
field-to-consumer obligations. The runner uses the analyzer's transformation
ledger and Route Totality APIs.

```sh
pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]' \
  --source source-method:h2su1z \
  --obligations scripts/route-field-proof-obligations.json
```

The source selector accepts a source key, a `file:line[:column]` locator, or a
unique source label. The runner prints one compact JSON record with the
selected origin, unique field paths, attachment and transformation counts,
consumer-terminal relation count, frontiers, obligation IDs, a deterministic
semantic result hash, elapsed time, and field-lineage payload bytes.

## Positive gate

The checked-in fixture file contains G01 through G18. Each obligation compares
the field path, canonical target record, consumer label, consumer kind, and
alias. Counts do not satisfy an obligation.

The positive gate fails when any of these conditions holds:

- attachments are zero;
- selected field paths are empty;
- a named obligation is missing;
- an unexpected or duplicate semantic record exists;
- proven consumer-terminal relations do not meet the obligation count;
- an attachment does not have exactly one occurrence-owned terminal;
- a consumer does not have exactly one proven exact terminal relation; or
- a required field path ends at a frontier.

The proof identity includes the selected source, field path, consumer target,
occurrence ID, terminal ID, and consumer-terminal relation ID. The semantic hash
therefore changes when any of those identities changes.

## Failure probes

Use in-memory probes to verify the failure gate without changing fixture data:

```sh
pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]' \
  --source source-method:h2su1z \
  --obligations scripts/route-field-proof-obligations.json \
  --simulate-missing G18
```

This command exits nonzero and reports `G18` as missing. The runner also
supports `--simulate-label G18`, `--simulate-kind G18`,
`--simulate-alias G13`, and `--simulate-duplicate G18`. Each exits nonzero.
Unknown simulation IDs are rejected before project analysis starts.

## Fresh-process rule

Run acceptance comparisons from fresh analyzer processes. Do not compare a run
from a service that another worker is changing. Record the analyzer commit,
frontend commit, port, project root, generation, and asset mode for browser
evidence. Compare deterministic hashes, not elapsed time or generated IDs.

## Runtime and fixture limits

The analyzer runtime discovers compiler-backed facts and returns proven
attachments plus explicit frontiers. The G01–G18 matrix is fixture acceptance
data. It is not generic discovery policy and does not define all supported
language transforms.

A passing soccer fixture proves the named soccer relationships. It does not
prove support for every project, route shape, resource carrier, component form,
or transformation. Add a positive example and a fail-closed negative case for
each new supported transform.
