# Frontend map

Snapshot of `src/frontend/src` as of commit `b4f1ba4` (2026-10). Routing is a hand-written `Switch` in `App.tsx`; `router.ts` only holds the `Navigate` type and `currentLocation()`. The server serves the SPA shell for `/`, `/file`, `/report`, `/map`, and `/trajectories` (`src/server/routes.ts`).

## Route table

| URL | Page | Endpoints (`api.ts`) | Schemas (`src/api/contracts.ts`) |
|---|---|---|---|
| `/` — query `q, filter, sort, page, all` (`overview-model.ts`). `/?viz=trajectory` is rewritten to `/trajectories` in `App.tsx` | `OverviewPage` → `OverviewControls`, `OverviewResults` (summary cards, sort header, `CleanupQueue`) | `GET /api/workspace`, `POST /api/refresh` | `workspaceResponseSchema` (`files`, `summary`, `comparison`, `concentration`, `semanticMap.cleanup`), `refreshResponseSchema` |
| `/file?path=&view=&finding=&expression=#Lnn` | `FilePage` → file picker, or `FileWorldContext` + `CodeMap` (`SourcePane`, `Inventory`, `FindingDetails`, `SymbolUses`), or a native report when `view` is set | `/api/workspace`, `/api/file`, `/api/reports/:view?path=`, `/api/refresh` | `filePageResponseSchema`, `reportResponseSchema` |
| `/report?view=&item=` | `ReportPage` → `GraphReport` (`reports/SemanticGraph`) or `reports/ReportTable`; links to `/api/report.<view>.md` | `/api/workspace` (repo label), `/api/reports/:view` | `reportResponseSchema` |
| `/map?area=` | `MapPage` → `WorldMap` → `FolderScopeTree`, `WorldMapGraph`, area inspector | `/api/workspace`, `/api/refresh`, `/api/file` for the area's source | `semanticMapSchema`, `filePageResponseSchema` |
| `/trajectories?…` | `TrajectoriesPage` → `DataTrajectoriesWorkspace` | `/api/workspace` (`routeData` inventory), `GET /api/route-data`, `POST /api/route-data/cancel`, `GET /api/route-data/source` | `routeDataInventorySchema`, `routeDataDetailResponseSchema` (→ `routeTotalitySchema` in `route-totality-contracts.ts`), `sourceExcerptResponseSchema` |

`LoadingStatus` (all pages) also opens an `EventSource` on `/api/progress`.

**Navigation** (`Layout.tsx` `PageNav`): Overview, Code map, World map, Data trajectories, then `BROWSER_REPORT_VIEWS` (report views whose disposition is not `merge`). With a file selected, report tabs go to `/file?path=…&view=…`; otherwise to `/report?view=`. Merged views (`overview`, `repeated-forks`, `junctions`, `inline-preview`) still answer by URL but are not linked.

## Data trajectories UI (the part to keep)

```text
TrajectoriesPage (fetchWorkspace)
└ DataTrajectoriesWorkspace            trajectory-url-state, trajectory-history; fetchRouteData + warmup cache
  ├ header: ← Routes, route <select>, TrajectorySourcePicker (inventory.sources, field picker, hover warmup)
  ├ RouteAtlas (mode=atlas)            route-atlas-model
  └ RouteTotalityWorkspace (mode=detail)  route-source-targets, source-evidence-model
    ├ RouteTotalityGraph
    │   layout:   route-totality-model → route-totality-layout(-graph/-geometry/-records/-summary),
    │             route-totality-ui-projection, route-totality-stack-projection
    │   display:  route-totality-display-model → -display-layout → -surface-layout
    │             → component-topology-layout (force engine) + component-topology-fringe-direction
    │             route-totality-display-labels (+ component-topology-labels)
    │   state:    route-totality-emphasis(-empty), -graph-state, -graph-actions, -camera,
    │             -boundary-stubs, -finding-model, -field-lineage-model, -field-inspector-model/-scope,
    │             -source-focus, route-context-continuity-state, topology-layout-debug
    │ ├ RouteTotalityControls
    │ ├ ComponentTopologyDebugControls   (overlay toggled by "d", topology-layout-debug.ts)
    │ ├ RouteTotalityViewport → RouteTotalityDisplayMarks, RouteContextContinuityOverlay
    │ │                         (route-context-continuity-index/-index-records/-visibility)
    │ └ RouteTotalityInspector           route-totality-inspector-model
    │    ├ RouteContextContinuityPanel → RouteContextContinuityInspector (-density, -index)
    │    ├ RouteTotalityOverview (no selection) → legend, RouteTotalityCoverageLedger, RouteTotalityEvidenceSection
    │    ├ selection sections: emphasis, source locations, proof records, evidence (route-totality-evidence-model), findings, neighbors, occurrences
    │    └ RouteTotalityFieldSections      route-totality-field-inspector-model
    └ TrajectorySourceDialog (fetchSourceExcerpt → /api/route-data/source)
```

Despite the `component-topology-*` names, only these are live: `component-topology-layout.ts` (the force layout engine behind `route-totality-surface-layout.ts`), `component-topology-fringe-direction.ts`, `component-topology-labels.ts` (`sourceLocationPriority`, `selectVisibleTopologyLabelIds`), and `ComponentTopologyDebugControls.tsx`. `component-topology-model.ts` is imported only for its types. See [dead-code.md](dead-code.md).

### URL state

`TrajectoryUrlState` (`trajectory-url-state.ts`): `route`, `flow`, `isolate=1`, `trajectoryMode=atlas|detail`, `routeKind=pages|api|all`, `routeSort=steps|paths|unique|substitutions|gaps`, `sourceMethod`, `filter`, `genericUi=hidden|all`, `totalitySelection=kind:graphId` (node, edge, context, context-edge), `graphCamera=x,y,scale`, `contextFocus`, `totalityField`, `totalityConsumer`.

Changes to only the camera or context focus replace the URL silently (`isTrajectoryHistoryNoiseOnlyChange`). Every other change goes through `commitBrowserUrl`, which fires `BROWSER_URL_CHANGE_EVENT`. `viz` and `trajectoryRenderer` are legacy parameters that get stripped. The `open` field is always forced to `true`.

### User flow

1. **Route.** With no `route`, `reconcileTrajectoryUrlState` chooses atlas mode. Picking an atlas row or the header select calls `selectRoute`. That picks the cheapest trajectory (`selectCheapestTrajectoryForRoute`) and clears the downstream state.
2. **Detail load.** The resource key is `[route, flow, generation, source]`. `fetchRouteData` runs under an `AbortController` and posts `/api/route-data/cancel` if aborted. `reconcileTrajectoryDetailState` then drops any selection or focus that no longer exists.
3. **Source.** `TrajectorySourcePicker` calls `selectSource` or `selectSourceField`. The source key goes to the server, which returns field lineage for that source. The header marks a field unproven when `fieldLineage.attachments` has no entry for it.
4. **Graph and inspector.** `RouteTotalityGraph` lays out the totality, projects the display model, and lays that out too. Selection, isolation, and camera write back through `onInvestigationStateChange`; field and consumer focus write back through `onFieldFocusChange`. Source links open `TrajectorySourceDialog`.

### `RouteDataDetail` fields the live UI reads

Read: `evidence`, `operations` (`route-source-targets.ts`), `sources`, `totality`, `shadowEvidence`, `hiddenComponentPolicy`.

Not read by any live UI: `exhaustiveGraph`, `context`, `shapes`, `values`, `terminals`. Only the dead component-topology, route-flow, and `RouteContextMap` code reads them. They are candidates to drop from the DTO once the backend confirms no other consumer (CLI Markdown does not use the DTO).

## Known rough edges (not dead, but worth fixing)

- `code-map/FileWorldContext.tsx` links to `/?area=…`, but only `/map` reads `area`. The link should be `/map?area=`.
- `trajectory-url-state.ts` runs `buildRouteTotalityLayout(detail.totality)` on every detail load, without the hidden-component policy, just to validate the selection. `RouteTotalityGraph` then builds its own layout with the policy, so the work is duplicated and "hidden" mode validates against a different node set.
- Back/forward navigation calls `applyUrlState` twice. App's `location` changes `initialSearch` (a reactive prop despite the name), and the workspace also listens for `popstate` and `BROWSER_URL_CHANGE_EVENT`.
- The layout wrappers form three layers (geometry → layout → model) and import each other in a cycle. Several pass-throughs have no callers (see dead-code.md).
- `component-topology-labels.ts` (`topologyLabelBudget`) and `route-totality-display-labels.ts` (`routeTotalityDisplayLabelBudget`) duplicate the same label-budget constants.
- A local `lexical` comparator is redefined in about 15 overview modules.
- The frontend bundle pulls in some `src/analysis` modules (cancellation, field-lineage binding, transition) through the shared `src/api/*-validation.ts` modules. That is allowed today because the validation lives in `src/api`, but it widens what the browser bundles.
