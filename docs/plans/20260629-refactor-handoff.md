---
title: Handoff: Deep Structural Refactor Progress
type: handoff
date: 2026-06-29
---

# Handoff: Deep Structural Refactor Progress

## Current Status

This branch has implemented the first major cleanup tranche from `20260629-deep-structural-refactor-audit-plan.md`, plus follow-up shrink passes. The core shrink target has now been reached: `src/core.mjs` is a 104-line facade/orchestration module. It owns only the public analyzer wrappers, JSON/markdown/compare report dispatch, `--view all` rendering, and compatibility re-exports. Render-path tracing and source-file analysis now live in `src/analysis/source-file.mjs`; markdown view rendering and recommendation prose now live in `src/reports/markdown-views.mjs`. Report assembly, component references, unknown-edge projection, helper-report boundary scoring, sink ranking, path-family grouping, sink shape classification, pack evidence, work-unit/concentration rollups, fan-out root identity, reachability grounding, trace support/cataloging, and context-relay analysis live under `src/analysis/`; compare projection and compare summary logic remain report-owned.

Validation at this checkpoint:

```sh
rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs
rtk pnpm test
```

Current focused run after the source-analysis and markdown-view extractions: 3 test files passed, 106 tests passed. Full suite after this shrink pass: 12 test files passed, 179 tests passed. VS Code diagnostics reported no errors in the touched source files checked during this pass.

Current size checkpoint:

- `src/core.mjs`: 104 lines
- `src/analysis/source-file.mjs`: 2,546 lines
- `src/reports/markdown-views.mjs`: 2,437 lines
- `src/analysis/report-builder.mjs`: 306 lines
- `src/analysis/baseline-compare.mjs`: 63 lines
- `src/analysis/collections.mjs`: 2 lines
- `src/analysis/context-relay.mjs`: 202 lines
- `src/analysis/fan-out.mjs`: 62 lines
- `src/analysis/helper-report.mjs`: 248 lines
- `src/analysis/pack-groups.mjs`: 202 lines
- `src/analysis/ranking.mjs`: 313 lines
- `src/analysis/reachability.mjs`: 86 lines
- `src/analysis/component-refs.mjs`: 62 lines
- `src/analysis/unknown-edges.mjs`: 99 lines
- `src/analysis/sink-descriptor.mjs`: 10 lines
- `src/analysis/sink-shape.mjs`: 228 lines
- `src/analysis/trace-support.mjs`: 296 lines
- `src/analysis/work-units.mjs`: 119 lines
- `src/reports/format-helpers.mjs`: 117 lines

## Completed In This Checkpoint

### Facade and CLI output ownership

- `bin/tsx-dataflow.mjs` now imports `writeReport` and `writeAllReports` directly from `src/reports/output.mjs`.
- `src/core.mjs` no longer exports report output helpers, project discovery/type-loading helpers, or scoring shape/family internals just because tests used them.
- `test/integration/facade-exports.test.mjs` now locks the narrowed intentional facade.
- `test/cli/dataflow-output.test.mjs` covers `tsx-dataflow --view all --out <dir>` for markdown and JSON outputs.

### Report/docs artifact reconciliation

- `README.md` and `docs/analyzer.md` now describe the current report surface instead of retired standalone views.
- `pnpm examples:regenerate` regenerated `examples/bad-ish-solid/reports/`.
- Retired generated reports are removed from the example directory: `dossier`, `hotspots`, `path-census`, `path-gallery`, `repair-map`, `source-boundaries`, `transformation-ledger`, and `unknown-edges`.
- Current generated reports now include `overview.md` and `component-refs.md`.

### Initial module extractions

New or extracted production modules:

- `src/analysis/finding-title.mjs`
  - Owns `findingTitle` outside the core facade.
- `src/analysis/report-builder.mjs`
  - Owns `buildReport`, report-level file/scope filtering, repeated-fork relation, constant-sink suppression, and summary assembly.
  - Imports component references, unknown-edge projection, ranking, path-family grouping, pack evidence, work-unit/concentration rollups, reachability grounding, shared collection helpers, and context-relay analysis directly from sibling analysis modules.
  - Imports `analyzeSourceFile` and `buildHelperReport` directly from `src/analysis/source-file.mjs`; the old core dependency adapter is gone.
- `src/analysis/collections.mjs`
  - Owns the shared `unique` collection helper so report-builder no longer receives it through the core adapter.
- `src/analysis/component-refs.mjs`
  - Owns symbol-accurate JSX component reference indexing for the component-refs report field.
- `src/analysis/unknown-edges.mjs`
  - Owns deduped unknown-edge row projection and affected-sink mapping.
- `src/analysis/sink-descriptor.mjs`
  - Owns the compact reached-sink descriptor shared by unknown-edge projection and core reachability grounding.
- `src/analysis/sink-shape.mjs`
  - Owns the shared sink attribute/family vocabulary, path-shape classification, and primary advice shape selection.
- `src/analysis/fan-out.mjs`
  - Owns fan-out root filtering and prop-scoped fan-out identity.
- `src/analysis/pack-groups.mjs`
  - Owns packed object grouping, pack verdict/evidence scoring, pack risk, and per-sink pack evidence application.
- `src/analysis/work-units.mjs`
  - Owns shared-cause work-unit grouping and burden concentration rollups for report assembly.
- `src/analysis/context-relay.mjs`
  - Owns same-feature context relay detection and JSX/import helpers for the context relay report field.
- `src/analysis/helper-report.mjs`
  - Owns helper report shaping, caller counting, helper-boundary classification, and boundary debt ranking.
  - Still uses dependency injection for tracing/enrichment, but the injection now comes from `src/analysis/source-file.mjs`, not `src/core.mjs`.
- `src/analysis/source-file.mjs`
  - Owns source-file sink detection, repeated-fork detection, render-path tracing, cross-file helper descent, trace metrics, defense classification, sink-record shaping, and the helper-report adapter.
  - Exports `analyzeSourceFile`, `buildHelperReport`, and `isCertaintyBoundaryDefense`.
- `src/analysis/ranking.mjs`
  - Owns sink ranking, burden/centrality/change-risk scoring, background classification, and path-family row grouping.
- `src/analysis/reachability.mjs`
  - Owns sink reachability grounding, `reachedVia` population, and queue classification (`investigation`, `central-leverage`, `peripheral-quick-win`).
- `src/analysis/trace-support.mjs`
  - Owns per-file trace context construction/caching, import/variable/function indexing, symbol-to-helper catalog resolution, first-party helper catalog records, call-name extraction, and function return-expression extraction.
- `src/analysis/baseline-compare.mjs`
  - Owns JSON baseline comparison and per-sink baseline diffing. `src/core.mjs` no longer imports `node:fs` for this path.
- `src/html/styles.mjs`
  - Owns the HTML shell CSS formerly embedded in `src/html/page.mjs`.
- `src/html/client-script.mjs`
  - Owns the browser script formerly embedded in `src/html/page.mjs`.
- `src/server/view-config.mjs`
  - Owns report view labels and file-tab view ordering.
- `src/server/overview-config.mjs`
  - Owns overview table/filter/sort configuration constants.
- `src/server/url-helpers.mjs`
  - Owns overview and generic query-string helper functions.
- `src/reports/markdown-format.mjs`
  - Owns markdown table/code/fence formatting, report intros, view blurbs, and command path formatting.
- `src/reports/format-helpers.mjs`
  - Owns pure prose/string helpers used by report rendering and recommendations: identifier word splitting, case conversion, parameter naming, step verbs, expression truncation, whitespace collapse, and focused snippets.
- `src/reports/regen-footer.mjs`
  - Owns regenerate command/footer rendering.
- `src/reports/baseline-parser.mjs`
  - Owns baseline report-directory parsing and compare delta formatting helpers.
- `src/reports/json.mjs`
  - Owns JSON payload projection and bounded graph projection.
- `src/reports/overview-selectors.mjs`
  - Owns the server-facing/report overview selectors: `firstCutFor`, `modalValue`, `hotspotGroups`, `fanOutEntriesForFile`, `fanOutEntriesGlobal`, and `entryTypeCountsByFile`.
  - `src/core.mjs` re-exports these selectors for facade compatibility; `src/server.mjs` imports them directly from this module.
- `src/reports/compare.mjs`
  - Owns `renderCompareReport` and compare markdown projection.
  - Uses injected current-run helpers from core, `reportSummaryForCompare` and `stopRecommendationFor`; it must not import `src/core.mjs`.
- `src/reports/compare-summary.mjs`
  - Owns `reportSummaryForCompare`, `findingFamiliesFor`, `uniqueDefenseEntries`, `uniqueActionableDefenseEntries`, and `stopRecommendationFor`.
- `src/reports/markdown-views.mjs`
  - Owns `renderMarkdownView`, all markdown view renderers, selection/diversity helpers, recommendation prose, extraction proposal prose, baseline markdown rendering, and the thin compare-summary wrappers that inject report-owned recommendation helpers.
  - `src/core.mjs` imports and re-exports `renderMarkdownView` for facade compatibility.

### Test split progress

New test files:

- `test/html/markdown-to-html.test.mjs`
- `test/html/source-peek.test.mjs`
- `test/server/view-config.test.mjs`
- `test/server/url-helpers.test.mjs`
- `test/reports/json.test.mjs`
- `test/cli/dataflow-output.test.mjs`
- `test/html/fan-out-graph.test.mjs`

`test/server.test.mjs` is smaller, but still owns the large server route suite and the large `renderCodeMap` suite.

## Current Public Facade

At this checkpoint, `src/core.mjs` intentionally exports:

- `REPORT_VIEWS`
- `parseArgs`
- `helpText`
- `analyzeProject`
- `createAnalyzer`
- `analyzeProgram`
- `renderReport`
- `renderMarkdownView`
- `renderAllReports`
- `firstCutFor`
- `modalValue`
- `hotspotGroups`
- `fanOutEntriesForFile`
- `fanOutEntriesGlobal`
- `entryTypeCountsByFile`

The last six are compatibility facade re-exports from `src/reports/overview-selectors.mjs`; server code imports them directly from the owning module. They are not ideal public API and can be demoted from the facade once downstream compatibility allows it.

## Important Constraints and Gotchas

- `buildReport` has moved to `src/analysis/report-builder.mjs`, so the old blocker for moving `analyzeProject`, `createAnalyzer`, and `analyzeProgram` is gone. The remaining blocker is the dependency adapter: moving wrappers is reasonable once the wrapper module can depend directly on report-builder plus non-core owners for tracing/scoring helpers, or once the adapter is intentionally carried with the analyzer module.
- `src/core.mjs` is now intentionally tiny. Future work should avoid rebuilding core by convenience imports; new analysis/report code should import owning modules directly.
- `buildReport` has moved to `src/analysis/report-builder.mjs`, and the old report-builder dependency adapter is gone. Moving `analyzeProject`, `createAnalyzer`, and `analyzeProgram` into `src/analysis/analyzer.mjs` is now straightforward if desired, but it is no longer required for shrinking core.
- `src/reports/json.mjs` uses selectors from `src/reports/overview-selectors.mjs`; keep report projection modules from importing `src/core.mjs`.
- `src/reports/compare.mjs`, `src/reports/compare-summary.mjs`, and `src/reports/markdown-views.mjs` do not import `src/core.mjs`; keep report modules core-free.
- `src/analysis/report-builder.mjs` imports `compareBaseline` directly from `src/analysis/baseline-compare.mjs` and imports `shouldAnalyzeFile` directly from `src/project/files.mjs`; keep this direction so core does not regain file-system or project-file filtering ownership.
- `src/analysis/report-builder.mjs` now also imports `buildComponentRefs`, `buildUnknownEdgeRows`, `rankSinks`, `familyRows`, `computePackGroups`, `applyPackEvidence`, `computeWorkUnits`, `computeConcentration`, `groundReachability`, `unique`, and `analyzeContextRelay` directly. Do not reintroduce those through the core adapter.
- `src/analysis/sink-shape.mjs` is now the owner for sink family/path shape classification. Recommendation prose can import from it, but new analysis modules should prefer this owner instead of duplicating shape constants in core.
- `src/analysis/fan-out.mjs` is the fan-out root/identity owner. `src/reports/markdown-views.mjs` and `src/analysis/source-file.mjs` import it directly.
- `src/analysis/source-file.mjs` is intentionally large after this tranche. The next meaningful quality pass is splitting it into smaller tracing, sink detection, repeated-fork, and defense/metrics modules without routing anything through core.
- `src/reports/markdown-views.mjs` is also intentionally large after this tranche. It is now the markdown renderer owner; split it by view family only after tests lock the current behavior.
- `src/reports/baseline-parser.mjs` deliberately keeps old `dossier.md` and `transformation-ledger.md` parsing as optional compatibility for old baseline directories.
- Temporary refactor scripts were written under `tmp/` per workspace instructions. They are review artifacts and were not cleaned up.
- The working tree includes an untracked copy of the original plan: `docs/plans/20260629-deep-structural-refactor-audit-plan.md`. It came from the user attachment/session context and should be reviewed before commit.

## Recommended Next Tranches

### 1. Split `src/analysis/source-file.mjs`

Completed: `analyzeSourceFile`, render-path tracing, repeated-fork detection, sink-record shaping, defense classification, metrics, and the helper-report adapter moved out of `src/core.mjs`. `src/analysis/report-builder.mjs` imports the source analysis functions directly.

Next slice:

- Split `src/analysis/source-file.mjs` by cohesive concern: sink detection/JSX context, repeated-fork detection, trace engine/cross-file descent, defense classification, and trace metrics/sink-record shaping.
- Keep the first split behavior-preserving; validate with `test/core.test.mjs` and `test/integration/golden.test.mjs`.
- Keep `src/analysis/report-builder.mjs` free of `src/core.mjs` imports. Prefer direct imports from `src/analysis/*`, `src/reports/*`, and `src/project/*`.

### 2. Split `src/reports/markdown-views.mjs`

Completed: `renderMarkdownView`, markdown view renderers, recommendation prose, extraction proposal prose, baseline markdown section rendering, and compare-summary dependency wrappers moved out of `src/core.mjs`.

Suggested route:

1. Split pure recommendation/prose helpers from view renderers, or split by view family (`overview/work-packets`, helper-boundary views, relay/fan reports).
2. Keep `src/core.mjs` as facade re-exports and dispatch only.
3. Validate with `test/core.test.mjs`, `test/integration/golden.test.mjs`, and `test/integration/facade-exports.test.mjs`.

### 3. Optional analyzer wrapper move

`buildReport` no longer lives in core and no longer needs a core-owned adapter, so `analyzeProject`, `createAnalyzer`, and `analyzeProgram` can move to `src/analysis/analyzer.mjs` whenever desired. This is now a facade tidying step, not a core-shrink blocker.

Next slice:

- Create `src/analysis/analyzer.mjs` importing `buildReport` from `src/analysis/report-builder.mjs` and `buildProgram` from `src/project/typescript.mjs`.
- Keep `src/core.mjs` as compatibility re-exports plus report dispatch.
- Validate with `test/core.test.mjs` and `test/integration/golden.test.mjs`.

### 4. Split more HTML tests

Completed low-risk test move: `fanOutGraphSvg` tests now live in `test/html/fan-out-graph.test.mjs`.

Next caution: do not move the whole `renderCodeMap` describe block in one piece unless you are ready to split fixtures and helper setup carefully.

Validation:

```sh
rtk pnpm exec vitest run test/html/fan-out-graph.test.mjs test/server.test.mjs
```

### 5. Continue docs/examples after major renderer movement settles

Docs and examples currently match the report surface. Regenerate examples again only after another renderer/projection behavior change:

```sh
rtk pnpm examples:regenerate
rtk pnpm test
```

## Suggested Validation Ladder

For future tranches, keep this order:

1. Focused unit test for the new module, if added.
2. Behavior-scoped suite for touched surface:
   - reports: `test/core.test.mjs`, `test/integration/golden.test.mjs`, `test/cli/dataflow-output.test.mjs`
   - server/html: `test/server.test.mjs`, `test/html/*.test.mjs`, `test/server/*.test.mjs`
   - facade: `test/integration/facade-exports.test.mjs`
3. Full suite:

```sh
rtk pnpm test
```

## Current Validation Snapshot

- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs test/integration/facade-exports.test.mjs` passed after moving source analysis and markdown views out of `src/core.mjs`: 3 files, 106 tests.
- `rtk pnpm test` passed after this core-shrink tranche: 12 test files passed, 179 tests passed.
- VS Code diagnostics reported no errors in `src/core.mjs`, `src/analysis/report-builder.mjs`, `src/analysis/source-file.mjs`, and `src/reports/markdown-views.mjs` after this pass.
- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs` passed after moving reachability grounding, trace support/cataloging, and the shared `unique` helper out of `src/core.mjs`: 2 files, 105 tests.
- `rtk pnpm test` passed after this shrink pass: 12 test files passed, 179 tests passed.
- VS Code diagnostics reported no errors in `src/core.mjs`, `src/analysis/report-builder.mjs`, `src/analysis/reachability.mjs`, `src/analysis/trace-support.mjs`, and `src/analysis/collections.mjs` after this pass.
- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs` passed after moving sink-shape, fan-out, pack grouping/evidence, work-unit/concentration, and context-relay analysis out of `src/core.mjs`: 2 files, 105 tests.
- `rtk pnpm test` passed after this shrink pass: 12 test files passed, 179 tests passed.
- VS Code diagnostics reported no errors in `src/core.mjs`, `src/analysis/report-builder.mjs`, `src/analysis/sink-shape.mjs`, `src/analysis/fan-out.mjs`, `src/analysis/pack-groups.mjs`, `src/analysis/work-units.mjs`, and `src/analysis/context-relay.mjs` after this pass.
- `rtk pnpm exec vitest run test/server.test.mjs test/reports/json.test.mjs test/core.test.mjs` passed after the overview selector extraction.
- `rtk pnpm exec vitest run test/html/fan-out-graph.test.mjs test/server.test.mjs` passed after the `fanOutGraphSvg` test split.
- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs` passed after the compare renderer move.
- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs` passed after the compare-summary extraction: 2 files, 105 tests.
- `rtk pnpm test` passed after these chunks: 12 test files passed, 179 tests passed.
- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs` passed after moving `buildReport` to `src/analysis/report-builder.mjs`: 2 files, 105 tests.
- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs` passed after moving pure format helpers to `src/reports/format-helpers.mjs`: 2 files, 105 tests.
- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs` passed after moving baseline comparison to `src/analysis/baseline-compare.mjs`: 2 files, 105 tests.
- `rtk pnpm test` passed after the latest shrink pass: 12 test files passed, 179 tests passed.
- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs` passed after moving component refs and unknown-edge projection: 2 files, 105 tests.
- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs` passed after moving helper-report shaping and boundary scoring: 2 files, 105 tests.
- `rtk pnpm exec vitest run test/core.test.mjs test/integration/golden.test.mjs` passed after moving ranking and path-family grouping: 2 files, 105 tests.
- VS Code diagnostics reported no errors in `src/core.mjs`, `src/analysis/report-builder.mjs`, `src/analysis/helper-report.mjs`, `src/analysis/ranking.mjs`, `src/analysis/component-refs.mjs`, `src/analysis/unknown-edges.mjs`, and `src/analysis/sink-descriptor.mjs` after this pass.
