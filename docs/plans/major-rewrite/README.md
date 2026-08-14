# Major rewrite outstanding work

Keep only work that is not complete in this file. Remove an item after its
implementation commit lands.

## Active slice

### Direct top-level scalar proof

Prove direct `snapshot()?.field` reads that reach render terminals.

Positive examples:

- `teamDisplayName` reaches the team heading in `AppShell`.
- `seasonName` reaches the season label in `AppShell`.

Negative and regression examples:

- `schemaVersion` stays available without route proof.
- An unrelated equal-name field stays absent.
- Existing `games[*]` attachments stay unchanged.
- `projects[*].code` stays an `unsupported-transform` frontier.

Reuse the current carrier, identity, attachment, and UI paths.

Change `Available · not proven` to `Available · no proven route use`.

Stop after direct scalar reads work. Do not add collection operations in this
slice.

## Next decision

Choose one option after the active slice. Do not start both.

### Add one collection operation

Prove `availability[*].status` through one real `.filter` path and one exact
consumer.

Keep `map`, aggregation, destructuring, spread, and rename outside this slice.

### Plan route cutover

Audit the remaining Current workspace renderer and legacy analysis support.
Record which product questions still require them.

Plan removal only after Route Totality preserves source selection, field focus,
findings, code navigation, refresh state, and honest gaps.

## Deferred candidates

These items require a separate product decision:

- collection proof for `players[*]`, `schedules[*]`, and `liveGames[*]`;
- destructuring, object construction, spread, rename, and derived scalar proof;
- a broader type-and-transform view;
- finding shared-cause grouping, blast radius, and semantic reanalysis;
- read, interaction, write, and reconciliation flow;
- a repository atlas across routes, commands, endpoints, and handlers;
- evidence-backed agent investigation packets;
- representative Pluck-scale performance proof; and
- focused module cleanup required by a current change.

Do not convert this list into one implementation program.

## Verification

Use the maintained field-proof runner for selected-source work:

```bash
pnpm accept:route-field-proof \
  --root <analyzed-project-root> \
  --route <route-path-or-key> \
  --source <source-key-or-file:line[:column]> \
  --obligations scripts/route-field-proof-obligations.json
```

Follow `AGENTS.md` for the current lint, typecheck, browser, test, and build
rules.
