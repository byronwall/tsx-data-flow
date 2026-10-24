# Dead-code inventory

Definition used here: code is **dead** when no production entry point reaches it. A test import does not keep code alive.

Production entry points are `bin/tsx-dataflow.ts`, `bin/tsx-dataflow-serve.ts`, `bin/analysis-worker.ts`, `src/server-cli.ts`, `src/server/analysis-worker.ts` (loaded by URL from `analysis-service.ts`), and `src/frontend/src/App.tsx` (from `index.html`). Package scripts (`scripts/*.ts`, `examples/regenerate.ts`) count as tooling. They keep their imports alive, but they are listed separately.

```bash
pnpm audit:dead-code
```

`scripts/dead-code-audit.ts` builds one TypeScript program over `src`, `bin`, `scripts`, and `test`. It walks the import graph from the entry points and counts which files reference each exported symbol. A declaration's own name does not count as a use, and neither do its overload signatures. It reports:

- unreachable files
- files reached only through `import type`
- unused exports
- test-only exports
- exports used only inside their own file

Pair it with `tsc -p <config> --noUnusedLocals` to catch helpers that a deletion orphans. Repeat the two until neither finds anything new.

## Current state

After the 2026-10 cleanup stack:

| Measure | Result |
|---|---|
| Unreachable files | 0 |
| Unused value exports | 1: Vite's config `default`, which Vite needs |
| Unused type exports | 0 |
| Test-only exports | 0 |
| Exports used only in their own file | 15. Tests import each of them, so they are test seams. |
| Type-only modules | `src/types.ts`, `program-value-summary-types.ts`, `route-totality-field-proof-types.ts`, `progress.ts`, `component-topology-types.ts`. Expected: they hold only types. |

## What was removed

| PR | Removed |
|---|---|
| Unreachable files | 25 files (about 3,950 lines): the evidence-slice CLI and five planned scope adapters, the pre-worker `src/server/api-*` adapters, the stale `fan-out.d.mts`, the old `ComponentTopologyGraph` view and its 11 helpers, `RouteContextMap`, and `RouteTotalityGraphMarks`. Also the runtime-dead topology model, normalization, and resource-proof modules (the live types moved to `component-topology-types.ts`), 219 dead CSS rules, and tests that covered only removed code or imported missing files. |
| Unused exports | About 1,500 lines of unused exports and the helpers they orphaned. That includes the legacy field-traversal remnants in `route-totality-field-lineage-*`, alias exports, the uncalled `program-value-summary.ts` wrappers, frontend layout pass-throughs, and the test-only `analyzeProgram`. |
| Shadow evidence and eager evidence | About 2,600 lines. This covers the Pluck-hardcoded shadow-evidence chain, from analysis through schema and validator to UI props, plus `component-occurrence-identity*` and `transparent-wrapper-occurrence-projection`. It also covers the eager `ProgramEvidence` path (`collectProgramEvidence`, `ProgramEvidenceCollector.collect`, the array relation provider) and the always-empty `RouteDataAnalysis.routeTotality`, `RouteTotalityRecord.counts`, and `FieldProofInput.route`. |
| Route detail fields | `RouteDataDetail.values/shapes/terminals/context/exhaustiveGraph`, plus their projection code and schemas. Also the constant trajectory fields `terminalSelectionLimit`, `ordering`, and `handoffsProven`. |
| Leftovers | Four unwired scripts, the duplicated CLI `REPORT_VIEWS`, and the always-true `TrajectoryUrlState.open`. Also fixed the code map's area link (`/?area=` → `/map?area=`). |
| Needless exports | Dropped `export` from 260 symbols used only in their own file. Removed two recursion-only helpers (`route-occurrence-support.ts` `visit`, `project/files.ts` `walkFiles`) and the now-unreachable `program-evidence-loading.ts`. |

## Still open (not dead, but worth doing)

- **Make totality stand on its own.** The legacy semantic-stage model (`route-data-legacy-support.ts`, operations/values/shapes in `route-data.ts`) is still load-bearing for the `flow` key and the source picker. Key detail requests on route + source and build `sources` from program-evidence facts. Then the legacy model can go. See [trajectory-pipeline.md](trajectory-pipeline.md).
- **Atlas counts.** `buildExhaustiveRouteGraph` runs per route only to fill the atlas counts.
- **Constant `completeness`.** The trajectory `completeness` is always `"partial"`, so the frontend's `"complete-for-supported-scope"` checks never pass.
- **Naming.** The `component-topology-*` layout engine still carries the old view's name.
- **Duplicates.** `stableHash` is defined twice (`route-discovery.ts`, `scope-seam.ts`). Route discovery is implemented twice (AST and regex). A local `lexical` comparator is copied into about 15 frontend modules.
- **Duplicate layout work.** `trajectory-url-state.ts` builds a totality layout just to validate the selection.
- **Test memory.** `test/route-totality-field-proof.test.ts` peaks at about 1.9 GB of heap per worker. Run the suite with `--pool=forks --poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1`. The suite analyzes a pinned `soccer-schedule` snapshot and skips when that repo is absent.
- **Field proof on the live soccer app.** Against the current `soccer-schedule` checkout, `/games/[gameId]` proves none of the 20 obligations. It stops at one `ambiguous-target` frontier. `readStore` now passes the parsed store through `migrateSoccerStore` and several `ensure*` mutators. The pinned snapshot still proves all 20.
