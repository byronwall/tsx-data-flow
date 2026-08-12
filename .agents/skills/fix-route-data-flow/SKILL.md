---
name: fix-route-data-flow
description: Diagnose and repair incomplete, truncated, missing, stale, or overbroad route data flow in tsx-data-flow. Use for selected-source field proof, broad route trajectories, false-positive consumers, missing resource or prop handoffs, API/UI disagreement, or a data-flow path that stops before its expected downstream result.
---

# Fix Route Data Flow

Repair the earliest failed evidence boundary. Preserve unrelated work. Do not
claim completion from path counts, `handoffProven`, or a clean rendered shell.

## Protect the checkout

1. Run `git status --short` and preserve all existing changes.
2. Read `docs/application-structure.md` before changing analyzer, API, server,
   or frontend boundaries.
3. Read `docs/design-preferences.md` only when changing topology UI.
4. Use `pnpm`. Do not change tests unless the user approves test work.

## Choose one mode

### Selected-source field proof

Use this mode when the issue names a selected source, field, consumer,
component occurrence, render terminal, field lineage, or exact obligation.

1. Start with the maintained acceptance runner:

   ```bash
   pnpm accept:route-field-proof \
     --root <analyzed-project-root> \
     --route <route-path-or-key> \
     --source <source-key-or-file:line[:column]> \
     --obligations scripts/route-field-proof-obligations.json
   ```

2. Read the compact JSON result. Check selected origin, nonzero attachments,
   nonempty field paths, named obligation IDs, exact targets, occurrence-owned
   terminals, proven consumer-terminal relations, frontiers, hash, and payload.
3. Use `--simulate-missing`, `--simulate-label`, `--simulate-kind`,
   `--simulate-alias`, or `--simulate-duplicate` to check the failure gate.
4. Repair the earliest compiler-backed seam. Keep fixture obligations in the
   acceptance file; do not add fixture names to generic analyzer discovery.
5. Re-run the runner from a fresh process. Compare semantic hashes and inspect
   every missing, unexpected, duplicate, or required-frontier result.

The positive case must have real attachments. A required field path that stops
at a frontier fails acceptance. Exact identity must cover the source, field,
consumer, occurrence, terminal, and consumer-terminal relation.

### Broad route trajectory diagnosis

Use this mode for route discovery, source handoff, prop/context continuity,
trajectory truncation, or broad API/UI trajectory disagreement.

1. Capture a baseline with `flow-snapshot.ts`:

   ```bash
   pnpm exec tsx .agents/skills/fix-route-data-flow/scripts/flow-snapshot.ts \
     --selection <selection.json> \
     --root <analyzed-project-root> \
     --project-source <source-directory> \
     --out tmp/flow-diagnostics/before.json
   ```

   Without a selection payload, pass route and source locator flags.
2. Classify it with `flow-diagnose.ts` and read
   [references/failure-classes.md](references/failure-classes.md).
3. Fix only the owning layer, then capture `after.json` with
   `--source-snapshot tmp/flow-diagnostics/before.json`.
4. Compare broad trajectory semantics with `flow-diff.ts`.
5. Require positive reach and negative precision evidence before completion.

The flow tools diagnose broad trajectories. They do not replace the field-proof
runner.

## Verification

Run `pnpm lint` and `pnpm typecheck`. For a user-visible field-flow repair,
also use one real positive fixture, one negative fixture, and the normal user
control. Record fresh-service metadata for browser checks: commit, port,
project root, generation, and asset mode. Use the in-app browser when UI
behavior is in scope. Follow the repository rule for localhost `curl`.

## Completion report

Report the selected mode, first failed layer, repaired evidence boundary,
positive and negative fixture results, exact counts or obligation IDs, terminal
and relation checks, frontiers, semantic hash, fresh-service metadata, lint,
typecheck, and browser results. State any deferred test work.
