# Phase 2 Runbook: Whole-Project World Map

## Scope and exit gate

This runbook tracks Phase 2 of [`overall-execution-plan.md`](overall-execution-plan.md), including the carried-forward Phase 0 baseline preflight. Phase 2 stops when a reviewer can orient in an unfamiliar repository, select a meaningful source-to-TSX trajectory, and reach responsible source within one minute without redundant file analysis.

## Implementation checklist

- [x] Read the execution plan, application structure, design preferences, and Solid SSR safety guidance.
- [x] Add a four-repository evaluation manifest and current-state baseline notes.
- [x] Add a bounded analyzer-to-API semantic-map projection.
- [x] Group graph nodes and edges before serialization.
- [x] Project a linked cleanup queue from shared-cause work units.
- [x] Add progressive area, value/type, trajectory, and source selection.
- [x] Preserve Phase 1 symbol/type definition navigation and explicit line-jump semantics.
- [x] Measure cold analysis, DTO size, parse time, and initial render time.
- [x] Add focused analyzer/API/frontend tests and negative/cap tests.
- [x] Run lint, typecheck, tests, and builds.
- [x] Complete HN Offline, Logo Dodo, and Pluck Phase 2 gates and record evaluation notes.

## Progress log

### 2026-07-11 — Reconciliation and architecture audit

- Confirmed Phase 2 can reuse `AnalysisReport.graph`, ranked sinks, work units, the cached workspace report, and existing file/source navigation.
- Chose a bounded transport model: file/feature areas, aggregated inter-area edges, representative trajectories, and shared-cause cleanup rows.
- Kept layout and browser selection in the frontend; API projections contain no SVG coordinates, CSS classes, or URLs.

### 2026-07-11 — Bounded semantic map and cleanup queue

- Added strict DTOs for areas, aggregated edges, trajectories, cleanup opportunities, totals, and caps.
- Grouped project-local graph nodes by file area and enriched cross-file links with canonical Phase 1 symbol-definition evidence.
- Initially capped serialization at 80 areas, 160 links, 40 trajectories, and 40 cleanup rows while keeping uncapped totals visible; later feedback-driven retention changes are recorded below.
- Added source, flow, and TSX-terminal lanes; area connections and landmarks; value/type filters; trajectory selection; and responsible-source navigation.
- Added a linked cleanup table based on existing shared-cause work units with evidence level and sink/file blast radius.

### 2026-07-11 — Baseline and repository gates

- Added [`reference-repositories.json`](../evaluations/reference-repositories.json) and [`current-state-baseline.md`](../evaluations/current-state-baseline.md).
- Recorded cold analysis, workspace projection, DTO size, JSON parse, retained-map counts, targets, and false-positive/missing-path audits for all four repositories.
- Passed the Phase 2 gates for HN Offline, Logo Dodo, and Pluck; notes live under `docs/evaluations/phase2-*.md`.
- Pluck's 31,967-node graph projects to a 311,061-byte workspace DTO in about 110 ms without restoring the removed file-specific retrace.

### 2026-07-11 — Verification and exit gate

- Added API/server coverage for bounded map rows and frontend coverage for area → value → trajectory → source drill-down and cleanup navigation.
- Production-browser verification on HN Offline found no console warnings, errors, or hydration failures. A cached hard refresh reached the visible map in 68 ms; area selection exposed its focused detail within the viewport.
- Final verification passed: lint, server/frontend typechecks, 170 tests across 25 files, server/frontend production builds, and `git diff --check`.

Phase 2 exit gate: passed.

### 2026-07-11 — Post-gate world-map visualization correction

- Replaced the three independently scrolling file lists with a deterministic SVG node-link network.
- Reserved graph capacity for source-bearing, mixed flow/TSX, and local TSX-output roles; areas are no longer forced into misleading mutually exclusive source/terminal counts.
- Changed retained-area selection to preserve every area participating in the top representative trajectories before filling the 80-area cap.
- Changed trajectory aggregation from sibling-source chains to contributor → terminal relationships.
- Added directional curves, incomplete-edge styling, selection focus/dimming, keyboard-selectable nodes, and a visual role legend.
- Made every cap explicit: visible graph nodes versus retained/analyzed areas, visible versus retained connections, representative landmarks, per-area trajectories, and cleanup rows.
- Added the representative `file:line` to each cleanup opportunity and removed the unhelpful all-ones Files column.
- Re-ran Pluck: 76 source-bearing retained areas, 63 mixed areas, 67 terminal-bearing areas, and 67 retained connections. Production browser verification rendered 28 nodes and 24 connections by default with no console warnings or errors; selecting the inventory model focused six connections and exposed 11 representative trajectories.

### 2026-07-11 — Split inspector, deselection, and folder indexing

- Moved the selection inspector into a persistent right-hand pane beside the graph and widened the overview workspace for desktop use.
- Added deselection by clicking empty graph space, clicking the selected node again, or using the inspector close control.
- Reworked inspector hierarchy into compact facts, aligned connection rows, truncated single-line identifiers, representative landmark rows, trace-input filters, and narrow trajectory rows.
- Raised the lightweight file-area index cap to 400. Pluck now indexes all 369 areas while keeping graph rendering bounded to 36 nodes.
- Added hierarchical ancestor folder scopes. Selecting a folder shows its file areas plus directly connected external context.
- Replaced ambiguous retention language with exact indexed/available/visible counts at the repository, folder, graph, connection, landmark, trajectory, and cleanup levels.
- At this checkpoint Pluck remained bounded at a 688,173-byte DTO, 103.14 ms projection, 1.45 ms JSON parse, 160 of 586 indexed connections, and 40 representative trajectories. The later connection-coverage correction supersedes these retention figures.
- At a 1,212px desktop workspace the production layout measured 801px for the graph and 401px for the inspector, aligned at the same top edge.
- Production interaction verification passed: node selection, empty-space deselection, selected-node toggle, and inspector close all clear/set the same selection state; long filenames truncate without wrapping.
- Selecting `app/src/components/pluck/inventory` narrowed 369 indexed areas to 12 folder areas plus six directly connected context areas, rendering all 18 available scoped areas and 12 connections.

### 2026-07-12 — Stable map ordering and source-oriented detail

- Replaced the flat folder menu with an expandable folder-tree popover. Every ancestor remains selectable and reports its indexed-area count.
- Made map ordering explicit and selection-independent: lanes sort once by connection volume, then finding burden, then path. Filtering and selection now de-emphasize nodes in place instead of rearranging them.
- Renamed and defined the three lanes as source-only, transform-and-render, and render-only, and defined dashed edges as traces crossing an unresolved or opaque boundary.
- Turned representative landmarks into source links with hover context, full labels, and exact file/line evidence.
- Limited trajectory input filters to actionable identifiers, described their effect, and documented why a trajectory enters the representative set.
- Production verification against Pluck confirmed the folder tree, stable node transforms across selection, literal-free input filters, and the aligned graph/inspector layout.

### 2026-07-12 — Preserve repository orientation in source

- Carried the selected file's semantic-map area into the code workspace as a persistent, expandable repository-context header.
- Added direct upstream/downstream area counts and links, incomplete-flow disclosure, and representative render paths for the current file without launching another analysis.
- Added rendered destinations to symbol inspection so project-local references are distinct from the TSX terminals a value actually reaches.
- Treat `index.ts`/`index.tsx` references as barrel pass-through hops when direct uses exist; the UI collapses and counts them instead of presenting the barrel as a destination.
- Added a round trip from the file workspace back to the same selected area in the repository map.
- This closes the Phase 2 selection-continuity gap. It does not pull Phase 3 type-shape or field-provenance work forward.

### 2026-07-12 — Preserve relationships under folder scope

- Fixed a retention failure where an indexed area could survive the area cap after all of its incident edges and representative trajectories were discarded by independent global caps.
- Connection selection now reserves each indexed area's strongest incident relationship before filling by global flow volume. Trajectory selection likewise reserves a strongest crossing path for every represented area before filling by burden.
- Raised Pluck's bounded semantic-map payload to all 586 aggregated connections and 400 representative trajectories. The SVG still renders at most 36 areas and only their visible edges.
- Selected-map disclosure now reports visible versus total selected connections. If none fit the current 36-node layout, unrelated nodes remain legible instead of all turning gray; the inspector still lists retained connections.
- Exact Pluck verification in `app/src/components/pluck/board` now shows `BoardArrangeStage.tsx` connected to `board-capture-model.ts` and `boards.ts`, with two of two selected connections visible and one retained representative trajectory.
- Re-measured Pluck: 21.74 s cold analysis, 200.32 ms projection, 1,036,337-byte DTO, and 5.25 ms JSON parse.

### 2026-07-12 — Reconcile inspector evidence with the drawn map

- Split selected-area connections into `on map` and `off map` counts based on the actual 36-node SVG layout.
- On-map rows continue selection inside the diagram. Off-map rows are explicitly labeled and open the connected file instead of selecting an invisible node.
- Replaced type-only landmark rows and single-line hover cards with expandable evidence rows: identifier, semantic purpose, exact source link, and a line-numbered ±2-line source window.
- Source context loads from the cached file API only after an area is selected; it does not rerun project analysis.
- Production verification on `createCaptureCandidateAdminModel.ts` reported five on-map and three off-map connections and rendered five source lines around each of eight representative landmarks.

### 2026-07-12 — Stop presenting data-flow contributors as imports

- Replaced file-context `Arrives from`, `Continues to`, and `directly connected` wording with upstream trace contributors, downstream trace destinations, and related areas.
- Added connection provenance to the file DTO: trajectory contributor, direct analyzer data-flow edge, or mixed evidence.
- Trajectory summaries show retained intermediary areas and a retained-area hop count when available; otherwise they say the intermediary route was not retained.
- Direct analyzer graph edges explicitly state `not an import claim`. The analyzer does not currently project an import-dependency route for these relationships.
- Exact Pluck verification showed that `avatar.tsx` and `loader.tsx` on `CaptureColorDistributionSection.tsx` are analyzer data-flow edges, while the other upstream rows are multi-area trajectory contributors with visible `via` chains.

### 2026-07-12 — Move file context out of inspector flow

- Replaced the expandable repository-context block inside the sticky code-map inspector with a compact popover trigger beside the filename in the persistent top header.
- The trigger summarizes upstream, downstream, and representative-path counts without consuming inspector height.
- The popover is independently bounded to the viewport and scrolls its own relationship/path content; opening it no longer reduces the right-hand inspector to a narrow scroll sliver.
- Production verification confirmed the trigger exists in the topbar, no repository-context block remains inside `codemap-panel-shell`, and the underlying inspector retains its normal scrolling body.

### 2026-07-12 — Make popover candidates navigational

- Repository-context links now close the popover before the application router handles navigation.
- The mounted code map observes route hash changes, so a same-file trajectory link selects its finding and actively scrolls to/pulses the target source line instead of only changing detail state.
- Regression coverage verifies both popover closure and reactive same-file `#L…` navigation.
- Production verification on `CaptureCandidateTableRow.tsx` clicked `JSX formatDate(attempt().attemptedAt)`, closed the popover, selected `RPF-120-39`, and jumped to highlighted line 120.

### 2026-07-12 — Tighten map-inspector navigation and landmarks

- Made the selected inspector filename a direct link to that file's code workspace.
- Normalized on-map buttons and off-map file links to the same typography and row geometry while retaining their status labels.
- Replaced expandable landmark details with hover/focus source cards containing the existing line-numbered ±2-line preview. Clicking the compact type/identifier row opens the exact source line.
- Removed the repeated per-row semantic sentence; the section header now explains the mixed landmark sample once.
- Production verification on `avatar.tsx` confirmed the direct file link, matching connection-row typography, compact `boundary props` landmark identity, and absence of repeated boundary prose.
