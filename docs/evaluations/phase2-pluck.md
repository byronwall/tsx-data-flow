# Phase 2 Evaluation: Pluck

## Run

```sh
pnpm benchmark:workspace --root /Users/byronwall/Projects/pluck-ui
```

The latest post-review run took 21.74 seconds for cold analysis. Workspace projection took 200.32 ms, produced a 1,036,337-byte DTO, and parsed in 5.25 ms. The index includes all 369 Pluck file areas and all 586 aggregated connections, plus 400 coverage-first representative trajectories and 40 of 2,224 cleanup opportunities. Of the indexed areas, 312 contain upstream inputs, 187 both receive/define inputs and render TSX, and 244 contain TSX outputs; these roles intentionally overlap.

The previous redundant file-specific retrace (about 7.5 seconds) remains removed: map and file drill-down reuse the cached workspace report and identity index.

## Trajectory and scale audit

`CaptureStructureInventoryRouteShell.tsx` owns the three highest-ranked representative trajectories, so the capture/inventory region is present in the default graph. The top representatives are line 240 (0.701 burden), `crops` at line 474 (0.666), and `placementKey` at line 482 (0.640). Area/value/trajectory selection bounds the rendered detail to one focused slice; the browser does not receive 31,967 raw graph nodes.

## Evidence audit

The top rows are suspicious, not proven. The recent Phase 1 review established that `props.candidate` and inventory values must remain the actionable roots while helper-local fields remain internal derivations.

Missing-path audit: the network reports only canonical definition and retained-trajectory relationships and makes incomplete/opaque counts visible; it does not fabricate import-level flow. The default Pluck graph renders 36 of 369 available areas at once, with the exact subset stated above the graph. Hierarchical folder scopes expose every indexed file area without attempting to draw all 369 simultaneously. Phase 3 field provenance is still required for the complete capture-shape story.

Desktop interaction audit: at a 1,212px workspace the graph and inspector measured 801px and 401px respectively. Empty-space click, selected-node click, and the inspector close control all deselect. Node transforms remain fixed across selection because lane order is connection volume, then finding burden, then path. The folder-tree popover exposes the complete hierarchy; the inventory scope contains 12 direct areas plus six connected context areas, and all 18 fit with 12 visible connections. Landmark rows link to exact source lines and expose fuller hover context. Trace-input controls omit inert string literals and filter only the inspector's trajectory list. No browser warnings or errors were observed.

File-continuity audit: opening `app/src/components/ui/loader.tsx` preserves its map role (`Transforms + renders`) and exposes 56 directly connected downstream areas plus 10 focused representative render paths in the same code workspace. The panel links to connected files, exact terminal findings, and the selected map area. Representative path labels suppress literal and collection noise. Symbol detail separates direct TypeScript references from rendered destinations and collapses barrel-index hops when a direct use is available.

Folder-scope coverage audit: selecting `app/src/components/pluck/board` and then `BoardArrangeStage.tsx` renders both retained incoming curves and reports `2 of 2 selected connections visible`. The inspector identifies `board-capture-model.ts` and `boards.ts`, and includes a crossing representative trajectory. The retention policy guarantees each connected indexed area its strongest incident edge before global volume filling, preventing an area card from being stranded solely by the serialization cap.

Inspector reconciliation audit: selecting `app/src/components/pluck/settings/createCaptureCandidateAdminModel.ts` reports five connections present in the current SVG and three outside its 36-node drawing. The latter are labeled `off map` and navigate to source rather than changing selection to an invisible area. Each representative landmark exposes its identifier and semantic role without hover; expanding it shows source lines `location - 2` through `location + 2` with the target line highlighted and linked to the file workspace.

File-relationship provenance audit: `CaptureColorDistributionSection.tsx` has no direct imports of `avatar.tsx` or `loader.tsx`. The file context now correctly labels those rows as direct analyzer data-flow edges and explicitly says this is not an import claim. Other upstream contributors expose retained area routes such as `CaptureViewer.context.tsx → capture.ts → capture-selection-model.ts → visual-palette-colors.ts`; these are trajectory-area hops, not asserted module-import hops.

Header-popover audit: repository context is opened from a compact control immediately beside the current filename. At desktop width the popover overlays the code workspace, is bounded by viewport height, and owns its overflow. It is absent from the sticky inspector column, so inventory and selected-expression details keep the full available scroll height.

Popover-navigation audit: selecting the representative candidate `JSX formatDate(attempt().attemptedAt)` from `CaptureCandidateTableRow.tsx` closes repository context before routing, selects finding `RPF-120-39`, updates the location to `#L120`, centers line 120 in the source pane, and applies the standard jump pulse.

Map-inspector polish audit: the selected `avatar.tsx` heading links directly to `/file?path=app/src/components/ui/avatar.tsx`. On-map controls and off-map links use identical font sizing and alignment. Representative landmarks show only type and identifier in the list; hover/focus exposes the five-line source card, and shared semantic guidance appears once in the section introduction.

## Exit gate

Passed with the documented completeness limitation. A reviewer can select the capture/inventory area immediately, inspect a bounded trajectory, and reach responsible source without rendering the full graph or triggering a second analysis.
