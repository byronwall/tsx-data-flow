---
name: render-path-dataflow-work
description: Run and act on the tsx-dataflow render-path data-flow analyzer. Use when asked to analyze render data flow, inspect render-path work packets, reduce defensive render transformations, compare before/after analyzer output, fix analyzer findings, run data-flow cleanup loops, or choose high-leverage Solid UI/data-flow remediation work, including prop relay, fan-out, repeated data reshaping, grouped SVG/render-item extraction, scalar-helper noise triage, healthy helper-boundary judgment, and missing Solid context/store ownership.
---

# Render Path Dataflow Work

Use this skill to turn `tsx-dataflow` output into bounded implementation work. The analyzer builds a typed interprocedural graph from source values to JSX render sinks, then projects it into reports for findings, work packets, dossiers, paths, ledgers, helper-boundary judgment, before/after comparison, and repair planning.

`tsx-dataflow` is a global CLI. Install it with your package manager (`npm install -g tsx-data-flow`, `pnpm add -g tsx-data-flow`, or `bun add -g tsx-data-flow`), or run it on demand (`npx tsx-data-flow`, `pnpm dlx tsx-data-flow`, or `bunx tsx-data-flow`). Run it from the target project root; it auto-discovers `src/` and the nearest `tsconfig.json`. For a non-standard layout pass `--source` / `--tsconfig` explicitly (for example `--source app/src --tsconfig app/tsconfig.json`). The target project must have `typescript` installed, or pass `--typescript-from <dir>`.

Default behavior: solve the worst grounded data-flow problem that is still worth changing, not merely the numerically worst render sink. Prefer work that removes prop relay, repeated object/shape conversions across component boundaries, fan-out/fan-in pressure, broad prop bundles, cohesive repeated render-item derivation, or state that should be owned by a feature-scoped Solid store/context. Respect `Background Findings` and `Stop Recommendation`: do not spend the default iteration flattening clear scalar helpers or healthy shared layout helpers when the report says to leave them alone. Do not only produce a report unless the user asks for analysis-only output.

## Target Problem

Prioritize data-flow issues where values are repeatedly shaped and reshaped while moving through components:

- Broad prop bundles relayed through multiple components.
- Derived view models reconstructed in several siblings or descendants.
- Route/page components owning state that sibling panels, repeated items, or deep descendants consume indirectly.
- Data that fans out to many render sinks through wrapper objects, selector objects, table models, or option bags.
- Repeated normalization, filtering, grouping, pagination, or selection state that should be centralized in a feature model.
- Cases where a feature-scoped Provider/Context, store, or hook would let consumers read the needed value on demand instead of forwarding it through TSX. Treat Provider/Context advice as actionable only when the report shows provider/context, feature-hook, imported feature-boundary, or same-feature relay evidence.
- Repeated SVG or collection render sinks that share the same rendered thing, such as bar rectangles, axis ticks, labels, rows, or cards. Prefer one cohesive rendered-item shape over many local attribute edits.

Treat local parser/helper churn as lower priority unless it is reused across several render surfaces or blocks the architectural cleanup above. A small component with a compact parser next to JSX is usually not the intended "worst offender" even if `work-packets` ranks it highly. If `Background Findings` classifies a path as `already readable` or `healthy shared boundary`, leave it unless adjacent edits make it redundant.

When the selected fix introduces or extends a feature Provider/Context, the cleanup is not complete until Provider/Context-owned state/actions stop flowing through intermediate props inside that feature island. Audit children for props that simply mirror context selectors/actions (`filters`, `table`, `actions`, pending/error state, drafts, dialog state) and convert those children to the feature hook. Keep props only for row-local data, simple display values, or reusable feature-agnostic leaves.

## Protect User Work

1. Run `git status --short`.
2. Do not revert unrelated changes.
3. If there are existing local edits in files you need to touch, read them first and work with them.
4. Write generated analyzer reports to a scratch directory under `tmp/` in the repo root, for example `tmp/tsx-dataflow/` or `tmp/tsx-dataflow-before/`. Leave the artifacts for review unless the user asks to clean them up.

## Run The Analyzer

From the project root, start with the architectural triage reports:

```bash
tsx-dataflow --view prop-relay --format markdown --out tmp/tsx-dataflow/prop-relay.md
tsx-dataflow --view fan-out    --format markdown --out tmp/tsx-dataflow/fan-out.md
tsx-dataflow --view repair-map --format markdown --out tmp/tsx-dataflow/repair-map.md
```

When the user asks for a broad inventory, a handoff bundle, or "all functionality",
generate every report in one analyzer pass:

```bash
tsx-dataflow --view all --format markdown --out tmp/tsx-dataflow
```

When a target already has a feature Provider/Context, or the likely fix is to add one, also run the Provider/Context completion report scoped to the feature:

```bash
tsx-dataflow --view context-relay --format markdown \
  --scope <feature-folder-or-component> \
  --out tmp/tsx-dataflow/context-relay.md
```

Use work packets as supporting detail after choosing a likely ownership/relay target:

```bash
tsx-dataflow --view work-packets --format markdown --out tmp/tsx-dataflow/work-packets.md
```

Read the report-layer guidance before choosing work:

- **Feature Clusters** now include an `Evidence` column. `Provider/Context audit` is meaningful only when evidence is present; pure renderers should usually show local render-data guidance instead.
- **Grouped Recommendations** show cohesive fixes such as `BarTick[]`, `BarRectangle[]`, or rendered rows. Prefer these over editing each attribute sink separately.
- **Extraction proposal** names should be concrete rendered nouns. Treat generic names such as `geometryModel`, `renderValue`, `selectedValue`, or `ItemModel` as stale output or a reason to rerun with the current analyzer.
- **Extraction shape check** distinguishes `cohesive repeated item` from `mirror singleton risk`. Do not create a broad singleton object when the shape check warns against it.
- **Background Findings** are true paths but not recommended cleanup work.
- **Stop Recommendation** tells you when more local cleanup is likely counterproductive.

Read the **Pack verdict** block before creating or deleting a render model:

- `normalization boundary`: keep or formalize the parser/model boundary; move defaulting/parsing there and let JSX read typed fields.
- `cohesive render model`: object packing is not the problem by itself; narrow or name the model instead of splitting solely because it is an object.
- `overpacked bag`, `mirror object`, or `relay bag`: split by render responsibility, inline mirror fields, or move ownership closer to consumers.

Use JSON when comparing baselines, scripting, or handing structured evidence to another agent:

```bash
tsx-dataflow --view dossier --format json --out tmp/tsx-dataflow/dossier.json
```

For a human-readable before/after cleanup loop, save an all-report directory before edits, another after edits, then run compare mode:

```bash
tsx-dataflow --view all --format markdown --out tmp/tsx-dataflow-before
# make the bounded cleanup
tsx-dataflow --view all --format markdown --out tmp/tsx-dataflow-after
tsx-dataflow --view work-packets --compare tmp/tsx-dataflow-before --out tmp/tsx-dataflow-compare.md
```

The compare report summarizes worst score, hotspot count, defensive entries, wrapper count, removed/remaining finding families, and whether the current result recommends stopping.

For CI-style guardrails, save a JSON dossier first, then compare later reports against it:

```bash
tsx-dataflow --view dossier --format json --out tmp/tsx-dataflow/baseline.json
tsx-dataflow --view work-packets --baseline tmp/tsx-dataflow/baseline.json --out tmp/tsx-dataflow/work-packets-after.md
tsx-dataflow --view work-packets --baseline tmp/tsx-dataflow/baseline.json --fail-on-regression
```

Baseline output reports current vs baseline worst burden and lists removed,
improved, regressed, and new-top sinks. Use `--fail-on-regression` in CI or
before a commit when the goal is "do not make render-path burden worse"; it exits
nonzero only when the comparison regresses.

## Available Views

- `work-packets`: implementation-ready ranked work items plus Feature Clusters, Grouped Recommendations, Extraction shape checks, Stop Recommendation, and Background Findings. Use as supporting detail after triage; actionable packets exclude paths classified as low-value background.
- `findings`: compact ranked findings for triage.
- `repair-map`: grouped remediation areas and likely edit strategy. Good for identifying central-leverage clusters.
- `prop-relay`: prop pass-through and relay paths. Best signal for broad prop bundles and missing context/store ownership.
- `context-relay`: same-feature children receiving shared-looking props from parents that already use a local context hook. Use as the Provider/Context completion audit; expect some presentational leaf false positives and classify them explicitly.
- `fan-out`: sources that reach many render sinks. Use to find values that should be owned once and read by consumers.
- `fan-in`: sinks fed by many upstream inputs. Use to spot local render surfaces that may need a smaller typed view model.
- `defensive-ledger`: nullish/default/logical defenses, including type-impossible defenses. Recent output deduplicates a defense across reachable sinks and shows sink count, so one row may represent a repeated cleanup.
- `transformation-ledger`: representation-only wrappers and conversions on the heaviest path.
- `path-gallery`: representative source-to-sink paths.
- `path-census`: counts and distributions.
- `path-families`: related path groups.
- `boundary-report`: first-party functions on render paths, scored as boundaries such as clean pipe, pass-through, leaky, junction, or messy. Use it to decide whether a helper should stay as a typed boundary or be simplified.
- `junctions`: helper functions where independent source lineages converge and re-spread to multiple callers. Use for high-leverage helper formalization or splitting work.
- `inline-preview`: per-helper inline-vs-keep verdict. It proposes whether folding a helper would shorten a path; it never rewrites code.
- `hotspots`: breadth map by file, or by feature with `--by feature`, showing finding count, worst burden, dominant shape/ownership hint, first-cut suggestion, and concentration. `coverage` is an alias.
- `dossier`: graph-oriented JSON with nodes, edges, traces, metrics, and omitted counts.
- `all`: meta-view that writes every concrete report in one run when paired with `--out <dir>`.
- `--compare <dir>` is not a view; it compares the current analysis with a prior `--view all` directory and emits one markdown compare report.

Common options:

- `--source <path>` / `--tsconfig <path>` override layout auto-discovery.
- `--scope <text>` narrows report rows by file/component/sink text.
- `--max-items <n>` limits output.
- `--sort burden|spread|coverage|quick-win` changes the selection lens for `work-packets` and `findings`.
- `--spread` is shorthand for `--sort spread`; pair with `--per-file <n>` and `--per-feature <n>` when one hot file dominates the top rows.
- `--diversity <0..1>` re-ranks by burden plus novelty; use it when a report is too clustered but you still want the worst item preserved.
- `--units` collapses file-local sinks sharing a cause into "fix once, N sinks improve" work units. Use for planning a larger slice; spot-check before editing because units are heuristic.
- `--by file|feature` controls `hotspots` rollup granularity.
- `--include-tests` includes test files.
- `--baseline <json>` compares against a prior JSON report.
- `--compare <dir>` compares the current run against a prior all-report directory.
- `--fail-on-regression` exits nonzero when a baseline comparison regresses.
- `--no-trace-helpers` keeps analysis single-file and disables cross-file helper evidence; `boundary-report`, `junctions`, and `inline-preview` become less useful or empty.
- `--max-helper-depth <n>` controls how many import boundaries helper tracing follows.
- `--typescript-from <path>` overrides TypeScript resolution when needed.

## Work Modes

If the user does not specify a mode, use **Fix Worst Architectural One**.

### Fix Worst Architectural One

Use for ordinary requests like "run this", "fix a data-flow finding", or "start cleaning this up".

1. Run `prop-relay`, `fan-out`, and `repair-map`.
2. Pick the first grounded target that shows real architectural pressure: many component boundaries, repeated wrappers/shape conversions, broad prop bundles, sibling/deep consumers, or a plausible Provider/Context or store extraction.
3. Use `work-packets`, `path-gallery`, or scoped reports only to inspect the chosen target in detail. If `work-packets` has a Grouped Recommendation, inspect that cohesive fix before individual member findings.
4. Skip tiny local helpers, style object sinks, parser-only findings, unchecked-array-index false positives, healthy shared helper reads, and isolated JSX formatting unless no architectural targets are present.
5. Inspect source code and confirm the data is being pushed through components or repeatedly reshaped instead of owned near its consumers.
6. Fix one bounded ownership/relay slice. Prefer a feature-scoped Provider/Context, `createStore`/feature model, typed selector hook, or colocated normalized view model over broad prop forwarding. If the packet is a control-flow gate, prefer scalar predicates/selected values before packing a broad `ready` object.
7. If a Provider/Context was added or reused, run `context-relay` scoped to the feature and perform a Provider/Context completion audit: no Provider/Context-owned model state/actions should be relayed through props to same-feature children. For every remaining row, classify it as converted, intentionally presentational leaf, or deferred follow-up.
8. Add or update focused tests when the change touches parsing, normalization, state transitions, URL state, selection, pagination, or shared helpers.
9. Run the project's checks (lint, typecheck, and tests).
10. Re-run the relevant analyzer views and report architectural delta: component boundaries, wrapper counts, fan-out/fan-in, moved/removed packets, and any remaining target in the same area.
11. If the refreshed report says `Stop recommendation: yes`, stop local cleanup and report that further work would be broader architecture/product work rather than more render-path flattening.

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

### Full Inventory Or Handoff

Use when the user asks for all reports, a current capability sweep, or a bundle another agent/person can inspect.

1. Run `tsx-dataflow --view all --format markdown --out tmp/tsx-dataflow`.
2. Start the summary with `hotspots`/`coverage` for breadth, then `repair-map` for strategy, then `work-packets` for concrete grouped recommendations, stop signal, and background findings.
3. Mention helper-boundary evidence from `boundary-report`, `junctions`, and `inline-preview` only when helper tracing was enabled and those views contain rows.
4. Use `prop-relay`, `context-relay`, `fan-out`, and `fan-in` to explain ownership pressure. Use ledgers and path views as supporting evidence.
5. Do not paste every report. Link report files, summarize the highest-confidence themes, and call out false-positive classes.

### Baseline And Regression Check

Use when the user asks to establish a baseline, compare before/after work, or guard against regressions.

1. For human cleanup loops, before edits save `tsx-dataflow --view all --format markdown --out tmp/tsx-dataflow-before`.
2. After edits, save `tsx-dataflow --view all --format markdown --out tmp/tsx-dataflow-after`.
3. Run `tsx-dataflow --view work-packets --compare tmp/tsx-dataflow-before --out tmp/tsx-dataflow-compare.md`.
4. Read the compare report: worst score, hotspots, defensive entries, wrappers, removed/remaining finding families, and stop verdict.
5. For CI-style pass/fail, also save `tsx-dataflow --view dossier --format json --out tmp/tsx-dataflow/baseline.json` and run the selected human report with `--baseline tmp/tsx-dataflow/baseline.json` or `--fail-on-regression`.
6. In the final report, state both qualitative changes (ownership/relay/helper boundary/render-item extraction) and compare/baseline delta. If a new top appears, inspect it before claiming the cleanup improved the overall project.

### Loop Until Clean

Use only when the user explicitly asks to run in a loop and solve all findings.

1. Start with Fix Worst Architectural One or Solve A Related Large Chunk.
2. After every successful round, re-run `work-packets`, and run `--compare` if a before directory exists.
3. Commit each validated round before starting the next when the user has asked for commits or the current workflow already uses commits.
4. Stop when `Stop recommendation: yes`, or when remaining findings are low-confidence, intentionally defensive, blocked by missing product intent, or no longer worth changing.
5. Keep a short progress log: finding id, files changed, validation, analyzer delta, next candidate.

## Spot-Check Rules

Before editing, verify a finding by reading the source path:

- The source value named by the report actually exists.
- The path reaches the reported JSX sink.
- Defensive operations are truly redundant or can be moved to a better boundary.
- The finding is not just a compact local parser or style object near JSX.
- Prop relay/fan-out evidence corresponds to real component ownership pressure in source code.
- The existing behavior has an observable purpose, such as incomplete drafts, external JSON, missing capture data, SSR first render, or user-entered text.
- A proposed object pack is supported by the packet's pack verdict. Do not create a broad `view`, `ready`, or `itemView` object when the evidence points to overpacked/mirror/relay behavior.
- A proposed extraction is supported by the **Extraction shape check**. Prefer cohesive repeated item shapes; avoid mirror singleton objects.
- A Provider/Context recommendation has concrete evidence in Feature Clusters or the path. Do not infer provider work from depth or hotspot count alone.

Treat reports as candidate evidence, not truth. If a finding is noisy, skip it and choose the next grounded item.

## Preferred Fixes

Prefer these fixes when the source supports them:

- Own shared feature data in a feature-scoped Provider/Context, store, or hook when sibling panels, repeated items, toolbar/list/detail layouts, or deep descendants need it.
- Replace broad prop bundles with narrow ids/selectors plus context reads when the same model is already shared across a feature island.
- After adding a feature Provider/Context, replace same-feature pass-through props with hook reads in the consuming children; do not stop at moving the top-level bundle into context.
- Parse/normalize once at the data boundary or feature-model boundary instead of repeatedly inside render code.
- Replace repeated nullish defaults with a typed non-null domain or view object.
- Extract cohesive repeated render items when Grouped Recommendations identify a shared rendered thing, such as `BarRect[]`, `BarTick[]`, path labels, visible rows, or cards.
- Keep object packs when they are `normalization boundary` or `cohesive render model`; those usually want clearer names/tests, not automatic splitting.
- Split object packs when they are `overpacked bag`, `mirror object`, or `relay bag`; prefer scalar gates and family-specific values such as `selectedSize`, `swatchStyle`, `buttonShadow`, or `spacingLabel`.
- Keep clear scalar helpers and healthy shared layout helpers when they appear in `Background Findings`; do not flatten them simply to reduce a path count.
- Remove type-impossible fallbacks after confirming TypeScript and runtime invariants.
- Collapse representation-only wrappers that do not express product behavior.
- Replace prop relays with a feature-scoped Provider/Context or nearer ownership boundary when siblings/descendants share the same model.
- Move pure parsing/formatting helpers out of TSX when that reduces render-path churn.
- Add Zod or focused runtime parsing at JSON, persisted-data, action, or extension-capture boundaries when the render code is defending against untrusted shapes.

Avoid broad rewrites, generic `utils.ts`, visual changes unrelated to the finding, or deleting defensive code that protects real external input. Also avoid spending the default iteration on a small local helper merely because it has a high `work-packets` score; use that only when the user explicitly asks for render-sink micro-cleanup.

## Verification

For implementation work, normally run the project's own checks (lint, typecheck, tests), then refresh work packets:

```bash
tsx-dataflow --view work-packets --format markdown --out tmp/tsx-dataflow/work-packets-after.md
```

For architectural data-flow work, also rerun the views that selected the target:

```bash
tsx-dataflow --view prop-relay    --format markdown --out tmp/tsx-dataflow/prop-relay-after.md
tsx-dataflow --view fan-out       --format markdown --out tmp/tsx-dataflow/fan-out-after.md
tsx-dataflow --view repair-map    --format markdown --out tmp/tsx-dataflow/repair-map-after.md
tsx-dataflow --view context-relay --format markdown --scope <feature-folder-or-component> --out tmp/tsx-dataflow/context-relay-after.md
```

Run targeted tests when available. For visual/capture surfaces, follow repo visual verification rules and confirm the exact relevant route/data state before claiming visual behavior is verified.
