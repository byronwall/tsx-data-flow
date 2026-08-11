# Route field proof acceptance

Use the maintained runner to check one selected source against named semantic
field-to-consumer obligations. The runner uses the existing analyzer and Route
Totality APIs.

```sh
pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]' \
  --source source-method:h2su1z \
  --obligations scripts/route-field-proof-obligations.json
```

The source selector accepts a source key, a `file:line[:column]` locator, or a
unique source label. The runner prints one compact JSON record. It includes the
selected origin, unique field paths, attachment and transformation counts,
consumer-terminal relation count, frontiers, missing and unexpected obligation
IDs, a deterministic semantic result hash, elapsed time, and field-lineage
payload bytes.

The checked-in fixture file names G01 through G18. Each obligation compares the
field path, canonical target record, consumer label, kind, and alias. Counts
alone do not satisfy an obligation.

To verify the failure gate without changing fixture data, simulate one missing
record in memory:

```sh
pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]' \
  --source source-method:h2su1z \
  --obligations scripts/route-field-proof-obligations.json \
  --simulate-missing G18
```

This command exits nonzero and reports `G18` as missing.
