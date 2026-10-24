# Dead-code inventory

Definition used here: code is **dead** when no production entry point reaches it. A test import does not keep code alive.

Production entry points are `bin/tsx-dataflow.ts`, `bin/tsx-dataflow-serve.ts`, `bin/analysis-worker.ts`, `src/server-cli.ts`, `src/server/analysis-worker.ts` (loaded by URL from `analysis-service.ts`), and `src/frontend/src/App.tsx` (from `index.html`). Package scripts (`scripts/*.ts`, `examples/regenerate.ts`) count as tooling. They keep their imports alive, but they are listed separately.

Regenerate the numbers with:

```bash
pnpm audit:dead-code
```

`scripts/dead-code-audit.ts` builds one TypeScript program over `src`, `bin`, `scripts`, and `test`. It walks the import graph from the entry points and counts which files reference each exported symbol. Run it again after each deletion: removing a dead caller often exposes more dead callees.

Snapshot below: commit `b4f1ba4`.

## 1. Unreachable files — delete outright

**Status: removed.** All of section 1, including the runtime-dead files and the broken tests, was deleted in the stacked cleanup PR. The tables stay as a record of what went. The live layout types now live in `component-topology-types.ts`. The live layout-engine tests moved to `test/frontend/component-topology-layout.test.ts`. About 220 dead CSS rules were pruned along with the files.

25 files, 3,953 lines. No production entry point imports them.

| Group | Files | Lines | Why it is dead | Tests that must go with it |
|---|---|---:|---|---|
| Evidence-slice CLI + planned scope adapters | `src/analysis/evidence-slice-cli.ts`, `scope-adapters/{http-service,node-cli,serverless-handler,serverless-handler-support,solid-full-stack}.ts` | 1,864 | A standalone `tsx src/analysis/evidence-slice-cli.ts` entry, never wired to a package script. It loads adapters by string path. Only `scope-adapters/solid-route.ts` is live, imported by `route-data-totality.ts`. | none |
| Stale declaration | `src/analysis/fan-out.d.mts` | 16 | A hand-written `.d.mts` sitting next to the real `fan-out.ts`. Nothing imports it. | none |
| Pre-worker API adapters | `src/server/api-{file,report,workspace}.ts` | 58 | Superseded by `routes.ts` → `analysis-service.ts` → `analysis-worker.ts`. | none |
| Old component-topology graph | `overview/ComponentTopologyGraph.tsx`, `ComponentTopologyChrome.tsx`, `ComponentTopologyInspector.tsx`, `HiddenComponentsPane.tsx`, `hidden-components-pane-model.ts`, `hidden-component-projection.ts`, `component-topology-isolation.ts`, `component-topology-manual-layout.ts`, `component-topology-selection.ts`, `component-topology-policy.ts`, `topology-source-lens.ts`, `route-flow-path-model.ts` | 1,823 | Replaced by `RouteTotalityGraph` in commit `276227a` ("Cut over route details to Route Totality"). Nothing in `App.tsx`'s tree imports it. | `test/frontend/topology-source-lens.test.ts`, `trajectory-source-controls.test.tsx` (the inspector half), `trajectory-ui.test.tsx`, `route-flow-path-model.test.ts` |
| Old route context map | `overview/RouteContextMap.tsx`, `route-context-model.ts` | 69 | Superseded by the `RouteContextContinuity*` components. | none |
| Old totality marks | `overview/RouteTotalityGraphMarks.tsx` | 123 | Replaced by `RouteTotalityDisplayMarks.tsx`. | none |

### Runtime-dead (only `import type` keeps them)

| File | Lines | Notes |
|---|---:|---|
| `src/frontend/src/overview/component-topology-model.ts` | 467 | Live code imports only its types (`ComponentTopologyLayoutNode/Edge`, …) from `component-topology-layout.ts`, `-labels.ts`, and `route-totality-surface-layout.ts`. Move those types next to the layout engine and delete the rest. Its runtime functions (`buildComponentTopology`, `summarizeSharedComponentHubs`, `projectVisibleComponentTopology`, `componentTopologySelectionFocus`, `rebuildComponentTopology`) are used only by the dead graph and `test/frontend/component-topology-model.test.ts`. |
| `src/frontend/src/overview/component-topology-normalization.ts` | 94 | Reached only through the model's runtime imports. |
| `src/frontend/src/overview/component-topology-resource-proof.ts` | 69 | Same. |

(`src/types.ts`, `program-value-summary-types.ts`, `route-totality-field-proof-types.ts`, and `progress.ts` also show up as type-only. That is expected: they are type modules.)

### Broken tests (they import files that no longer exist)

These already fail and test nothing live. Per `AGENTS.md`, deleting them needs approval for test work.

- `test/frontend/trajectory-ui.test.tsx` imports `DataTrajectoryDialog`, `RouteFlowGraph`, `RouteTrajectoryWorkspace`
- `test/frontend/trajectory-shape-label.test.ts` imports `trajectory-shape-label`
- `test/frontend/route-flow-path-model.test.ts` imports `route-flow-graph-model`

## 2. Unused exports in live files

65 value exports and 16 type exports have no reference from any live file, test, or their own file. Highlights by area:

- **Alias exports nobody calls** (`export const A = B`):
  - `program-evidence.ts` `buildProgramEvidence` (only the dead CLI used it)
  - `evidence-relation-provider.ts` `createProgramEvidenceProvider`
  - `evidence-slice.ts` `buildEvidenceSlice`; `route-data-totality.ts` has its own private `buildEvidenceSlice`
  - `route-occurrence-surface.ts` `buildRouteWideOccurrenceSurface`
  - `route-totality-display-model.ts` `projectRouteTotalityDisplay`
  - `route-totality-display-layout.ts` `layoutRouteTotalityDisplayModel`
- **Program-value summary API surface:** `program-value-summary.ts` `createProgramValueSummaryAnalyzerForRoot`, `resolveProgramValueExpression`, `summarizeProgramValueExpression`, `summarizeProgramValueCall`, `enumerateProgramValueMembers`, `traceProgramValueSource`. These are public-looking wrappers with no callers; the live path goes through the analyzer object.
- **Evidence provider extras:** `evidence-relation-provider.ts` `createLazyProgramEvidenceProviderForRoot`, `factIndexForProgramEvidence`, `RelationRecipeStore`, `SUPPORTED_/UNSUPPORTED_LAZY_RELATION_KINDS`; `program-evidence.ts` `forwardRelations`, `backwardRelations`; `evidence-slice-support.ts` `relationsFor`, `dequeuePriorityQueue`; `evidence-slice.ts` `normalizeProgramEvidence`.
- **Field-lineage helpers:**
  - `route-totality-field-lineage-support.ts`: `appendField`, `nextState`, `traversalKey`, `compareTraversal`, `compareOrigin`
  - `route-totality-field-lineage-component-binding.ts`: `componentPropBindingReadiness`, `lastFieldSegment`, `provenComponentPropBoundaries`
  - `route-totality-field-lineage-truncation.ts`: `recordRouteTotalityFieldTruncations`, `emitRouteTotalityFieldTruncationFrontiers`
  - Check each one: some may be live under another name.
- **Frontend layout pass-throughs:**
  - `route-totality-model.ts`: `assignParallelIndices`, `layoutRouteTotalityNodes`, `routeTotalityEdgePath`, `routeTotalityZoomLevel`, `routeTotalityProofKindsForNode`, `ROUTE_TOTALITY_MIN_VIEW`
  - `route-totality-layout.ts`: `routeTotalityEdgePathForLayout`
- **Frontend odds and ends:**
  - `api.ts`: `fetchJson`, `fetchText`
  - `view-config.ts`: `BROWSER_FILE_VIEWS`
  - `trajectory-url-state.ts`: `isTrajectoryCameraOnlyChange`
  - `route-totality-graph-state.ts`: `sameCamera`
  - `route-totality-display-labels.ts`: `routeTotalityDisplayShowsExactEvidence`
  - `RouteTotalityDisplayMarks.tsx`: `DisplayTotalityAnnotation`
  - `route-context-continuity-density.ts`: `contextDisplayModeLabel`, `contextDisplayModeDescription`
  - `component-topology-labels.ts`: `topologyLabelBudget`
  - `component-topology-resource-proof.ts`: `componentTopologyDownstreamProofEdgeIds`
- **Misc analysis:**
  - `sink-shape.ts`: `GEOMETRY_ATTRIBUTES`
  - `solid-symbols.ts`: `declarationIdentity`; `route-data-resource.ts` exports a different live `declarationIdentity`
  - `semantic-context.ts`: `lineageForTrace`
  - `route-shadow-evidence-support.ts`: `locationForTraceStep`
  - `scope-seam.ts`: `sourceElementId`
  - `program-evidence-collector-instrumentation.ts`: `emptyProgramEvidenceRelationStats`
  - `route-occurrence-support.ts`: `isSlotExpression`, `functionDeclarationFromCall`
  - `route-totality-field-transfer-verifier.ts`: `COMPONENT_FIELD_TRANSFER_KINDS`
  - `scope-adapters/solid-route.ts`: `evidenceSliceAdapter` (used only by the dead CLI)
  - `project/typescript.ts`: `collectSourceFiles`
  - `api/route-occurrence-validation-totality.ts`: `validateEvidenceSliceTotals`
  - `api/route-totality-field-lineage-validation-index.ts`: `endpointOccurrenceAnchorId`

Run `pnpm audit:dead-code` for the full table, including the 16 unused types. Most of those are response-type aliases in `api/contracts.ts` and are harmless.

### Test-only exports

- `src/core.ts` `analyzeProgram`, used only by `test/integration/facade-exports.test.ts`
- ~~the four `component-topology-model.ts` builders listed above~~ (removed)

### Needless exports (used only inside their own file)

There are 306 of these. Removing `export` from them is low-value cleanup, but it shrinks the apparent API and makes the next audit sharper. Do it last.

## 3. Dead branches inside live files

The audit cannot see these. The code runs, but its output is discarded or a value never varies. Details are in [trajectory-pipeline.md](trajectory-pipeline.md#dead-branches-inside-the-live-pipeline).

- **Shadow evidence.** `buildRouteShadowEvidence` runs on every analysis, is hardcoded to the Pluck `/captures/[captureId]` route, and never reaches the DTO. It covers `route-shadow-evidence{,-compiler,-support}.ts`, the Pluck parts of `component-occurrence-identity*.ts`, and `transparent-wrapper-occurrence-projection.ts`. These files total about 1.7k lines, some of which may still serve live occurrence identity. Check each one before deleting it. Removing this also lets the `routeShadowEvidenceSchema` and the UI's `shadowEvidence` props go.
- **Eager program evidence.** `ProgramEvidenceCollector.collect()`, `collectProgramEvidence`, and the `ProgramEvidence` input branch of `queryEvidenceSlice` are reachable only from the dead evidence-slice CLI.
- **Always-empty and constant fields:**
  - `RouteDataAnalysis.routeTotality` (always `[]`)
  - `RouteTotalityRecord.counts`
  - `FieldProofInput.route`
  - the legacy trajectory's `handoffsProven`, `ordering`, and `completeness` (always `"partial"`)
- **DTO fields no live UI reads:** `RouteDataDetail.exhaustiveGraph`, `context`, `values`, `shapes`, `terminals`.

## 4. Unwired scripts and leftovers

- `scripts/probe-source-excerpts.ts`: no package script or doc points to it.
- `scripts/analyze-parameter-types.mjs`, `scripts/normalize-type-imports.mjs`, `scripts/remove-explicit-param-any.mjs`: one-time codemods from the 2026-08 type cleanup, referenced nowhere.
- `src/frontend/src/style.css`: about 72 classes appear only in dead TSX. The largest block is `component-topology-*`, about lines 176–365, plus `route-context-*` around 1849–1873 and the `route-totality-edge-label`/`node-kind-label`/`node-location` classes. About 30 more classes are referenced by no TS at all: old world-map grid, old `ReportTabs` topbar, `route-totality-gap*`, `route-totality-ledger-*`, and others. Delete them together with the TSX.
- `DataTrajectoriesWorkspace`: the `open` URL field is always forced to `true`, and the `viz`/`trajectoryRenderer` parameters are only stripped.
- Report view lists are defined twice: `src/cli/args.ts` `REPORT_VIEWS` and `src/api/report-views.ts` `REPORT_VIEWS`. They should share one source.

## Suggested cleanup order

1. ~~Delete the section 1 file groups one at a time, together with their CSS and their (approved) tests, and re-run `pnpm audit:dead-code` after each.~~ Done.
2. ~~Move the component-topology layout types and delete `component-topology-model/-normalization/-resource-proof`.~~ Done. Still to do: rename the surviving layout engine so it no longer reads as the old topology view.
3. Remove the unused value exports and collapse the alias and pass-through layers.
4. Remove the section 3 dead branches, starting with shadow evidence. Then prune the `RouteDataDetail` fields that no consumer reads (see [trajectory-pipeline.md](trajectory-pipeline.md)).
5. Strip needless `export` keywords.
