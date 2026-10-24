# Data trajectory pipeline

How the analyzer goes from "a route file" to "this persisted value reaches these fields in these components", and how that reaches the `/trajectories` UI. This is the part of the system to keep. Product intent lives in [../data-trajectory-intent.md](../data-trajectory-intent.md); this doc covers the mechanism. Snapshot: updated after the 2026-10 dead-code cleanup stack. Originally mapped at `b4f1ba4`.

## The short version

There are **three models** in every route-data response. Only one is rendered in detail.

| Model | Built by | Still load-bearing for |
|---|---|---|
| **Legacy semantic-stage** (operations, values, shapes, evidence, terminals, one trajectory per route) | `route-data.ts` `analyzeRouteData` + `route-data-legacy-support.ts` | The `flow` key (a route with no legacy candidate gets no trajectory, so no detail). The `sources` list that feeds the source picker. `evidence`/`operations` for source-viewer targets. |
| **Exhaustive sink graph** | `route-data-trajectories.ts` `buildExhaustiveRouteGraph` | Only the atlas counts (`trajectoryCount`, `uniqueStepCount`, `substitutionStepCount`, `unknownGapCount`) in `RouteAtlas`. Its detail payload was removed. |
| **Route totality** (current) | `route-data-totality.ts` and families: program evidence, evidence slice, occurrence surface, context continuity, bridges, field proof | Everything `RouteTotalityWorkspace` draws. |

The next cleanup target: make totality stand on its own. Key the detail on route + source instead of the legacy `flow`, and build `sources` from program-evidence facts. Then the legacy model can go.

## Request lifecycle

```text
Browser (DataTrajectoriesWorkspace)
  GET /api/workspace ───────────────┐      GET /api/route-data?route&flow&source&generation
                                    ▼                       ▼
src/server/routes.ts  createRequestHandler → respond()
src/server/analysis-service.ts  one worker_threads Worker; SharedArrayBuffer cancellation;
                                route-data is abortable (disconnect or POST /api/route-data/cancel
                                with x-tsx-data-flow-route-request-id); workspace requests de-duped
src/server/analysis-worker.ts   perform(op) using src/server/cache.ts (one report per generation)
                                    │                       │
  buildWorkspaceDto                 │       buildRouteDataDetail (api/projections/route-data.ts)
  + buildRouteDataInventory ◄───────┘         ├ rebuild inventory, find legacy trajectory `flow`
    (api/projections/route-data.ts)           ├ selectedTotalitySource() → RouteTotalitySelectedSource
    reads report.routeData (eager)            ├ routeTotalityForRoute()  (lazy, cached per route+source)
    + buildExhaustiveRouteGraph per route     ├ projectRouteTotality()   → validateRouteTotality (throws)
      (WeakMap-memoised) for atlas counts     └ addSelectedSourceFieldPaths
  workspaceResponseSchema.parse               routeDataDetailTransportResponseSchema.parse (structure only)
                                    ▼                       ▼
src/frontend/src/api.ts  routeDataDetailResponseSchema.parse → routeTotalitySchema.superRefine
                         re-runs validateRouteTotality / validateRouteOccurrenceSurface in the browser
```

`GET /api/route-data/source` (`source-excerpts.ts` `buildSourceExcerpt`) only serves contained source lines for the source dialog. It does not touch analysis.

## Pipeline stages

### Eager — once per analysis generation

`report-builder.ts` `buildReport` → `route-data.ts` `analyzeRouteData` → `RouteDataAnalysis`.

| # | Stage | Files · key functions | Produces |
|---|---|---|---|
| 1 | Route discovery (two implementations that must agree) | `route-discovery.ts` `discoverRoute`, `routePatternFromFile`, `collectReachableFiles` (TS AST, `/routes/` convention). `scope-adapters/solid-route.ts` `discoverSolidRouteCandidates` (regex over `readFileSync`, needs Solid framework proof) and `buildSolidRouteSeed` → `scope-seam.ts` `scopeSeedFor` | `RouteRecord`; `ScopeCandidate[]` / `ScopeSeed`. Totality requires `selectCandidate` in `route-data-totality.ts` to match the label `Solid route ${pathPattern}` and the span. |
| 2 | Rendered component walk | `route-data.ts` `collectRenderedComponents`, `routeSinkKey` | `route.renderedComponents`, `renderedComponentEdges`, route sinks |
| 3 | Resource ownership, consumers, HTTP bridges | `route-data-consumers.ts` `collectCalledDeclarations`. `route-data-resource.ts` `resolveResourceFetcher`, `isCanonicalCreateResourceCall`, `returnedConsumerFieldPaths`, `resourceBoundaryIdentity`. `route-data-http.ts` `collectResourceHttpBridges` (`createResource` → `/api/*`) | declarations, resource outputs, consumer fields, `RouteDataHttpBridgeResolution` |
| 4 | Persisted-source detection (legacy) | `route-data-legacy-support.ts` `collectLegacyCandidates` → `chooseLegacyCandidates`, `buildLegacyTerminals` (cap 4) | `DataOperation`, `RouteDataValue`, `ValueShapeSummary`, `RouteDataEvidence`, `RouteDataTerminal`, one `RouteDataTrajectory` per route. `exactFileInputElementId` links a read to a program `file-input` fact, but only for `node:fs/promises` `readFile`. |
| 5 | Program evidence provider (shared fact substrate) | `evidence-relation-provider.ts` `createLazyProgramEvidenceProvider`: `ProgramEvidenceCollector.collectFactsOnly()` (`program-evidence-collector*.ts`, `program-evidence-*.ts`, `http-bridge-evidence.ts`) → compact facts; `program-fact-index.ts` `ProgramFactIndex` (lazy hydration); `program-evidence-relation-loading.ts` (frontier-loaded relations); `evidence-relation-provider-lazy.ts` | `EvidenceRelationProvider { facts, getRelations, getGaps }` |
| 6 | Session registration | `route-data-session.ts` `createRouteDataTotalitySession`, `registerRouteDataTotalitySession` (WeakMap keyed by the analysis) | Lazy per-route totality builder |

### Lazy — per route + selected source, on `/api/route-data`

`route-data-session.ts` `routeTotalityForRoute` → `RouteDataTotalitySession.get` → `route-data-totality.ts` `buildRouteTotalityRecords` → `RouteTotalityRecord`.

| # | Stage | Files · key functions | Produces / purpose |
|---|---|---|---|
| 7 | Occurrence surface | `route-occurrence-surface.ts` `buildRouteOccurrenceSurface` using `RouteOccurrenceSurfaceBuilder` (`route-occurrence-surface-{builder,scanner,entry,accounting,finalize,graph,policy}.ts`, `route-occurrence-condition-evaluation.ts`, `-declaration-index.ts`, `-support.ts`) | `RouteOccurrenceSurface`: definitions, occurrences, edges, boundaries, terminals, omissions, totals. The component-instance tree and its render terminals. |
| 8 | Context continuity | `solid-route-context-continuity.ts` `buildSolidRouteContextContinuity` (`SolidRouteContextCompiler` + `-hook/-read/-record/-relay/-route/-support`), uses `program-value-summary.ts` `ProgramValueSummaryAnalyzer` | `RouteContextContinuity` (`context-continuity.ts`): provider → read links |
| 9 | Evidence slice | `evidence-slice.ts` `queryEvidenceSlice(provider, { seed })` + `-support`, `-normalization`, `-coverage` | `EvidenceSlice`: a bounded relation walk from the route entry (elements, relations, origins, terminals, gaps, coverage) |
| 10 | Selected-source merge | `route-totality-selected-source.ts` `mergeSelectedRouteSource` | Connects the chosen file input to the slice, or records a gap |
| 11 | Bridges | `route-totality-bridge.ts` `buildRouteTotalityBridges`, `route-totality-anchor-index.ts` `buildRouteTotalityAnchorIndex` | `RouteTotalityBridge[]`: origin→render and render-terminal→origin links between the slice and the surface |
| 12 | Field proof / lineage (only with a selected source) | `route-totality-field-proof.ts` `buildSelectedRouteTotalityFieldProof` → `route-totality-field-proof-query.ts` `queryRouteTotalityFieldProof`; helpers `-index`, `-candidate`, `-carrier`, `-consumers`, `-component*`, `-transformations`, `-result`, `-policy`, `-ast`; verifiers `route-totality-field-transfer-{verifier,component-verifier,carrier-verifier}.ts`, `route-totality-field-target-consumer.ts` | `RouteTotalityFieldLineage` (attachments, frontiers, transformations; `route-totality-field-lineage.ts`). Without a source: `unavailableRouteTotalityFieldLineage(NO_SELECTED_SOURCE_FIELD_LINEAGE_REASON)`. |
| 13 | Finding attachments | `route-totality-finding-attachments.ts` `attachRouteTotalityFindings` (called from the session) | `findingAttachments`, `findingIndex`: render-path findings pinned onto totality nodes |
| 14 | Projection + validation | `api/projections/route-totality.ts` `projectRouteTotality` with `route-totality-{evidence,surface}-projection.ts`, `route-totality-field-lineage.ts`, `context-continuity.ts`, `cancellable-projection.ts`; validators `api/route-occurrence-validation*.ts`, `route-totality-bridge-validation.ts`, `route-totality-finding-validation.ts`, `route-totality-field-lineage-validation*.ts`, `route-context-continuity-validation.ts` | `RouteTotality` DTO (`api/route-totality-contracts.ts`) |

The acceptance runner for field-flow proofs (`scripts/accept-route-field-proof.ts`, see [../route-field-proof-acceptance.md](../route-field-proof-acceptance.md)) drives stages 7–12 directly.

## Types to know

| Type | Defined in |
|---|---|
| `RouteRecord`, `DataOperation`, `RouteDataTrajectory`, `RouteDataEvidence`, `ValueShapeSummary`, `RouteDataAnalysis` | `src/analysis/route-data.ts` |
| `LegacyRouteCandidate` | `route-data-legacy-support.ts` |
| `RouteDataHttpBridge(Resolution)` | `route-data-http.ts` |
| `ExhaustiveRouteGraph` | `route-data-trajectories.ts` |
| `RouteTotalityRecord`, `RouteTotalityGap`, `RouteTotalityFindingAttachment` | `route-data-totality.ts` |
| `RouteDataTotalitySession` | `route-data-session.ts` |
| `RouteTotalitySelectedSource` | `route-totality-selected-source.ts` |
| `ScopeCandidate`, `ScopeSeed`, `ScopePolicy`, `EvidenceProof`, `SourceLocation` | `scope-seam.ts` |
| `EvidenceSlice`, `SliceQuery` | `evidence-slice.ts` (`scope-seam.ts` also has an `EvidenceSlice`) |
| `ProgramElement`, `ProgramRelation`, `ProgramRelationKind` | `program-evidence.ts` (duplicated in `scope-seam.ts`) |
| `EvidenceRelationProvider` | `evidence-relation-provider.ts` |
| `ProgramFactIndex` | `program-fact-index.ts` |
| `RouteOccurrenceSurface` | `route-occurrence-surface.ts` |
| `RouteContextContinuity` | `context-continuity.ts` |
| `RouteTotalityBridge` | `route-totality-bridge.ts` |
| `RouteTotalityFieldLineage` (+ Attachment/Frontier/Transformation) | `route-totality-field-lineage.ts` |
| DTOs `RouteDataInventory`, `RouteDataDetail` | `src/api/contracts.ts` |
| DTO `RouteTotality` | `src/api/route-totality-contracts.ts` |

## Removed dead branches

The 2026-10 cleanup removed these from the live pipeline. See [dead-code.md](dead-code.md).

- **Shadow evidence.** It was hardcoded to one Pluck route and never sent to the client. The `route-shadow-evidence*`, `component-occurrence-identity*`, and `transparent-wrapper-occurrence-projection` files are gone, and so are the schemas and UI props.
- **Eager program evidence.** `collectProgramEvidence`, `ProgramEvidenceCollector.collect()`, the array relation provider, and the `ProgramEvidence` input to `queryEvidenceSlice` are gone. Only the lazy provider remains.
- **Always-empty or never-read fields.** Removed `RouteDataAnalysis.routeTotality`, `RouteTotalityRecord.counts`, and `FieldProofInput.route`. Also removed the constant trajectory fields `terminalSelectionLimit`, `ordering`, and `handoffsProven`.
- **Unread detail payload.** Removed `RouteDataDetail.exhaustiveGraph`, `context`, `values`, `shapes`, and `terminals`.
- **Legacy field-traversal remnants** in `route-totality-field-lineage-*`.

## Remaining oddities

- **Constant `completeness`.** The legacy trajectory's `completeness` is always `"partial"`, so the frontend check `completeness === "complete-for-supported-scope"` in `trajectory-url-state.ts` never passes.
- **Duplicates.**
  - `stableHash` exists twice (`route-discovery.ts`, `scope-seam.ts`).
  - Route discovery exists twice: AST and regex.
  - The `ProgramElement`/`ProgramRelation` types exist twice (`scope-seam.ts`, `program-evidence.ts`).
- **Ignored argument.** `discoverSolidRouteCandidates` receives `relations: []` and ignores it.

## Known limits worth knowing before refactoring

- Selected-source field proof resolves only for `node:fs/promises` `readFile` sources (`exactFileInputElementId`). Any other persistence source (Prisma, fetch, …) ends in `SELECTED_ORIGIN_UNAVAILABLE_REASON`.
- `buildRouteDataDetail` rebuilds the whole route inventory on every detail request.
- The detail payload is validated twice, once on the server and once in the browser. The browser pass is the full semantic validation.
