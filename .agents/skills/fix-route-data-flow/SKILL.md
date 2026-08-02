---
name: fix-route-data-flow
description: Diagnose and repair incomplete, truncated, missing, stale, or overbroad source-specific route trajectories in tsx-data-flow. Use when a selected persisted source stops before expected Solid components or render terminals, highlights unrelated consumers, reports an unproven resource handoff, differs between API data and the component-topology UI, or when the user says to fix a data-flow path and continue until the correct downstream flow appears.
---

# Fix Route Data Flow

Repair the selected source trajectory end to end. Treat the copied topology
selection as a locator, then prove each analyzer layer independently. Do not stop
after finding or fixing the first missing boundary.

## Protect Existing Work

1. Run `git status --short`.
2. Preserve unrelated and pre-existing edits.
3. Read `docs/application-structure.md` before changing analyzer, projection,
   server, or frontend boundaries.
4. Read `docs/design-preferences.md` only when changing the topology UI.
5. Do not create, update, or run tests unless the user explicitly approves test
   work. Use lint and typecheck during the implementation phase.

## Capture The Baseline

Save the pasted `component-topology-selection` JSON to a scratch file when
needed. Run the bundled snapshot script from the tsx-data-flow repository:

```bash
pnpm exec tsx .agents/skills/fix-route-data-flow/scripts/flow-snapshot.ts \
  --selection <selection.json> \
  --root <analyzed-project-root> \
  --project-source <source-directory> \
  --expect-component <expected-downstream-component> \
  --reject-component <known-unrelated-component> \
  --out tmp/flow-diagnostics/before.json
```

`--selection` may contain the copied JSON payload or a file containing only the
topology URL. When no payload is available, pass `--route-path`,
`--source-label`, `--source-file`, and `--source-line`.

Then classify the first failed layer:

```bash
pnpm exec tsx .agents/skills/fix-route-data-flow/scripts/flow-diagnose.ts \
  --snapshot tmp/flow-diagnostics/before.json
```

Read [references/failure-classes.md](references/failure-classes.md) after the
classifier runs. Inspect only the owning layer first.

## Repair Loop

1. Confirm the selected source exists in the source project and identify the
   exact syntax between the persisted call and its returned consumer value.
2. Confirm whether the raw analyzer graph already reaches the expected sinks.
3. Fix the earliest failed invariant:
   source discovery, return handoff, source projection, prop stitching, context
   stitching, member narrowing, or frontend projection.
4. Add a bounded compiler-backed adapter for the observed syntax. Do not make
   arbitrary calls, same-named properties, import reachability, or semantic
   stage order imply data flow.
5. Re-run the snapshot as `after.json`, adding
   `--source-snapshot tmp/flow-diagnostics/before.json`. This preserves the
   source file, label, expectations, and rejections if generated keys or source
   lines changed during the fix.
6. Compare semantic outcomes:

```bash
pnpm exec tsx .agents/skills/fix-route-data-flow/scripts/flow-diff.ts \
  --before tmp/flow-diagnostics/before.json \
  --after tmp/flow-diagnostics/after.json
```

7. Repeat from the new first failed layer until all expected components are
   present and all rejected components are absent.

An increased path count is not sufficient proof. A repaired bridge may expose
an overbroad context or prop match. Require both positive reach and negative
precision evidence.

## Verification

Run:

```bash
pnpm lint
pnpm typecheck
```

Then verify the live route detail:

1. Refresh or restart the existing analyzer server only when necessary.
2. Confirm the selected source has exact source trajectories, not only a
   resource fallback match.
3. Confirm expected downstream components and terminals.
4. Confirm unrelated consumers remain unselected.
5. Use the in-app browser to verify topology highlighting and a clean console.

When using `curl` against localhost, run it outside the sandbox as required by
the repository instructions.

## Completion Report

Report:

- the first failed layer and unsupported syntax;
- each analyzer error repaired;
- before/after exact path, terminal, and component counts;
- expected components reached;
- rejected false-positive components absent;
- truncation, cycle, and unknown-path state;
- lint, typecheck, and live UI results;
- whether test work remains awaiting approval.

Do not claim completion from `handoffProven` alone or from a large downstream
path count.
