---
name: render-path-dataflow-work
description: Run and act on the tsx-dataflow render-path data-flow analyzer. Use when asked to analyze render data flow, inspect render-path work packets, reduce defensive render transformations, fix analyzer findings, run data-flow cleanup loops, or choose high-leverage Solid UI/data-flow remediation work, especially prop relay, fan-out, repeated data reshaping, and missing Solid context/store ownership.
---

# Render Path Dataflow Work

Use this skill to turn `tsx-dataflow` output into bounded implementation work. The analyzer builds a typed interprocedural graph from source values to JSX render sinks, then projects it into reports for findings, work packets, dossiers, paths, ledgers, and repair planning.

`tsx-dataflow` is a global CLI. Install it with your package manager (`npm install -g tsx-data-flow`, `pnpm add -g tsx-data-flow`, or `bun add -g tsx-data-flow`), or run it on demand (`npx tsx-data-flow`, `pnpm dlx tsx-data-flow`, or `bunx tsx-data-flow`). Run it from the target project root; it auto-discovers `src/` and the nearest `tsconfig.json`. For a non-standard layout pass `--source` / `--tsconfig` explicitly (for example `--source app/src --tsconfig app/tsconfig.json`). The target project must have `typescript` installed, or pass `--typescript-from <dir>`.

Default behavior: solve the worst grounded architectural data-flow problem, not merely the numerically worst render sink. Prefer work that removes prop relay, repeated object/shape conversions across component boundaries, fan-out/fan-in pressure, broad prop bundles, or state that should be owned by a feature-scoped Solid store/context. Do not only produce a report unless the user asks for analysis-only output.

## Target Problem

Prioritize data-flow issues where values are repeatedly shaped and reshaped while moving through components:

- Broad prop bundles relayed through multiple components.
- Derived view models reconstructed in several siblings or descendants.
- Route/page components owning state that sibling panels, repeated items, or deep descendants consume indirectly.
- Data that fans out to many render sinks through wrapper objects, selector objects, table models, or option bags.
- Repeated normalization, filtering, grouping, pagination, or selection state that should be centralized in a feature model.
- Cases where a feature-scoped Provider/Context, store, or hook would let consumers read the needed value on demand instead of forwarding it through TSX.

Treat local parser/helper churn as lower priority unless it is reused across several render surfaces or blocks the architectural cleanup above. A small component with a compact parser next to JSX is usually not the intended "worst offender" even if `work-packets` ranks it highly.

When the selected fix introduces or extends a feature Provider/Context, the cleanup is not complete until Provider/Context-owned state/actions stop flowing through intermediate props inside that feature island. Audit children for props that simply mirror context selectors/actions (`filters`, `table`, `actions`, pending/error state, drafts, dialog state) and convert those children to the feature hook. Keep props only for row-local data, simple display values, or reusable feature-agnostic leaves.

## Protect User Work

1. Run `git status --short`.
2. Do not revert unrelated changes.
3. If there are existing local edits in files you need to touch, read them first and work with them.
4. Write generated analyzer reports to a scratch directory (for example `.tsx-dataflow/`) and add it to `.gitignore` so reports are not committed.

## Run The Analyzer

From the project root, start with the architectural triage reports:

```bash
tsx-dataflow --view prop-relay --format markdown --out .tsx-dataflow/prop-relay.md
tsx-dataflow --view fan-out    --format markdown --out .tsx-dataflow/fan-out.md
tsx-dataflow --view repair-map --format markdown --out .tsx-dataflow/repair-map.md
```

When a target already has a feature Provider/Context, or the likely fix is to add one, also run the Provider/Context completion report scoped to the feature:

```bash
tsx-dataflow --view context-relay --format markdown \
  --scope <feature-folder-or-component> \
  --out .tsx-dataflow/context-relay.md
```

Use work packets as supporting detail after choosing a likely ownership/relay target:

```bash
tsx-dataflow --view work-packets --format markdown --out .tsx-dataflow/work-packets.md
```

Use JSON when comparing baselines, scripting, or handing structured evidence to another agent:

```bash
tsx-dataflow --view dossier --format json --out .tsx-dataflow/dossier.json
```

## Available Views

- `work-packets`: implementation-ready ranked work items. Use as supporting detail after triage; it can over-rank local parser/helper churn.
- `findings`: compact ranked findings for triage.
- `repair-map`: grouped remediation areas and likely edit strategy. Good for identifying central-leverage clusters.
- `defensive-ledger`: nullish/default/logical defenses, including type-impossible defenses.
- `transformation-ledger`: representation-only wrappers and conversions.
- `prop-relay`: prop pass-through and relay paths. Best signal for broad prop bundles and missing context/store ownership.
- `context-relay`: same-feature children receiving shared-looking props from parents that already use a local context hook. Use as the Provider/Context completion audit; expect some presentational leaf false positives and classify them explicitly.
- `fan-out`: sources that reach many render sinks. Use to find values that should be owned once and read by consumers.
- `fan-in`: sinks fed by many upstream inputs. Use to spot local render surfaces that may need a smaller typed view model.
- `path-gallery`: representative source-to-sink paths.
- `path-census`: counts and distributions.
- `path-families`: related path groups.
- `dossier`: graph-oriented JSON with nodes, edges, traces, metrics, and omitted counts.

Common options:

- `--source <path>` / `--tsconfig <path>` override layout auto-discovery.
- `--scope <text>` narrows report rows by file/component/sink text.
- `--max-items <n>` limits output.
- `--include-tests` includes test files.
- `--baseline <json>` compares against a prior JSON report.
- `--fail-on-regression` exits nonzero when a baseline comparison regresses.
- `--typescript-from <path>` overrides TypeScript resolution when needed.

## Work Modes

If the user does not specify a mode, use **Fix Worst Architectural One**.

### Fix Worst Architectural One

Use for ordinary requests like "run this", "fix a data-flow finding", or "start cleaning this up".

1. Run `prop-relay`, `fan-out`, and `repair-map`.
2. Pick the first grounded target that shows real architectural pressure: many component boundaries, repeated wrappers/shape conversions, broad prop bundles, sibling/deep consumers, or a plausible Provider/Context or store extraction.
3. Use `work-packets`, `path-gallery`, or scoped reports only to inspect the chosen target in detail.
4. Skip tiny local helpers, style object sinks, parser-only findings, unchecked-array-index false positives, and isolated JSX formatting unless no architectural targets are present.
5. Inspect source code and confirm the data is being pushed through components or repeatedly reshaped instead of owned near its consumers.
6. Fix one bounded ownership/relay slice. Prefer a feature-scoped Provider/Context, `createStore`/feature model, typed selector hook, or colocated normalized view model over broad prop forwarding.
7. If a Provider/Context was added or reused, run `context-relay` scoped to the feature and perform a Provider/Context completion audit: no Provider/Context-owned model state/actions should be relayed through props to same-feature children. For every remaining row, classify it as converted, intentionally presentational leaf, or deferred follow-up.
8. Add or update focused tests when the change touches parsing, normalization, state transitions, URL state, selection, pagination, or shared helpers.
9. Run the project's checks (lint, typecheck, and tests).
10. Re-run the relevant analyzer views and report architectural delta: component boundaries, wrapper counts, fan-out/fan-in, moved/removed packets, and any remaining target in the same area.

### Fix 10 In Parallel

Use only when the user asks for parallel cleanup, bulk remediation, or a larger campaign.

1. Generate `prop-relay`, `fan-out`, `repair-map`, and `work-packets`.
2. Group the top findings by owning feature, Provider/Context candidate, route model, component family, or domain.
3. Split only independent groups. Do not assign overlapping files to concurrent workers.
4. Give each worker one bounded group plus the relevant report excerpt.
5. Main thread owns reconciliation, conflicts, final checks, analyzer refresh, and commits.
6. Stop after one validated batch unless the user asks to continue looping.

### Solve A Related Large Chunk

Use when top findings cluster around one route model, helper, component family, Provider/Context candidate, parser, or render surface.

1. Run `prop-relay`, `fan-out`, `repair-map`, `path-families`, and then `defensive-ledger` only if defensive logic is central to the issue.
2. Identify the shared ownership problem or invariant causing repeated work, such as broad prop relay, missing context/store, repeated view-model construction, nullable draft state, repeated resource fallback, or repeated string-to-domain conversion.
3. Fix the boundary once instead of editing every sink.
4. Keep the helper feature-scoped unless there is proven cross-feature use.
5. Update docs when introducing a new durable helper or convention.
6. Verify with the project's checks and a refreshed analyzer report.

### Analyze Only

Use when the user explicitly asks for a report, summary, ranking, or spot check without edits.

1. Run the requested view.
2. Spot-check at least one high-ranked item against source.
3. Explain confidence, likely false positives, and the best next work mode.

### Loop Until Clean

Use only when the user explicitly asks to run in a loop and solve all findings.

1. Start with Fix Worst Architectural One or Solve A Related Large Chunk.
2. After every successful round, re-run `work-packets`.
3. Commit each validated round before starting the next when the user has asked for commits or the current workflow already uses commits.
4. Stop when remaining findings are low-confidence, intentionally defensive, blocked by missing product intent, or no longer worth changing.
5. Keep a short progress log: finding id, files changed, validation, analyzer delta, next candidate.

## Spot-Check Rules

Before editing, verify a finding by reading the source path:

- The source value named by the report actually exists.
- The path reaches the reported JSX sink.
- Defensive operations are truly redundant or can be moved to a better boundary.
- The finding is not just a compact local parser or style object near JSX.
- Prop relay/fan-out evidence corresponds to real component ownership pressure in source code.
- The existing behavior has an observable purpose, such as incomplete drafts, external JSON, missing capture data, SSR first render, or user-entered text.

Treat reports as candidate evidence, not truth. If a finding is noisy, skip it and choose the next grounded item.

## Preferred Fixes

Prefer these fixes when the source supports them:

- Own shared feature data in a feature-scoped Provider/Context, store, or hook when sibling panels, repeated items, toolbar/list/detail layouts, or deep descendants need it.
- Replace broad prop bundles with narrow ids/selectors plus context reads when the same model is already shared across a feature island.
- After adding a feature Provider/Context, replace same-feature pass-through props with hook reads in the consuming children; do not stop at moving the top-level bundle into context.
- Parse/normalize once at the data boundary or feature-model boundary instead of repeatedly inside render code.
- Replace repeated nullish defaults with a typed non-null domain or view object.
- Remove type-impossible fallbacks after confirming TypeScript and runtime invariants.
- Collapse representation-only wrappers that do not express product behavior.
- Replace prop relays with a feature-scoped Provider/Context or nearer ownership boundary when siblings/descendants share the same model.
- Move pure parsing/formatting helpers out of TSX when that reduces render-path churn.
- Add Zod or focused runtime parsing at JSON, persisted-data, action, or extension-capture boundaries when the render code is defending against untrusted shapes.

Avoid broad rewrites, generic `utils.ts`, visual changes unrelated to the finding, or deleting defensive code that protects real external input. Also avoid spending the default iteration on a small local helper merely because it has a high `work-packets` score; use that only when the user explicitly asks for render-sink micro-cleanup.

## Verification

For implementation work, normally run the project's own checks (lint, typecheck, tests), then refresh work packets:

```bash
tsx-dataflow --view work-packets --format markdown --out .tsx-dataflow/work-packets-after.md
```

For architectural data-flow work, also rerun the views that selected the target:

```bash
tsx-dataflow --view prop-relay    --format markdown --out .tsx-dataflow/prop-relay-after.md
tsx-dataflow --view fan-out       --format markdown --out .tsx-dataflow/fan-out-after.md
tsx-dataflow --view repair-map    --format markdown --out .tsx-dataflow/repair-map-after.md
tsx-dataflow --view context-relay --format markdown --scope <feature-folder-or-component> --out .tsx-dataflow/context-relay-after.md
```

Run targeted tests when available. For visual/capture surfaces, follow repo visual verification rules and confirm the exact relevant route/data state before claiming visual behavior is verified.
