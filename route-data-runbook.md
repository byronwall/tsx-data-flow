# Route Data Trajectory Runbook

Implementation record for [`docs/product-pillars/07-first-vertical-slice-route-data-trajectory.md`](docs/product-pillars/07-first-vertical-slice-route-data-trajectory.md).

## Status legend

- `[ ]` pending
- `[~]` in progress
- `[x]` complete and verified

## Major work

### 1. Discovery and model

- [x] Inventory existing analyzer, API, server, and Solid world-map boundaries.
- [x] Inventory the `visual-notes` `/time-blocks` and Pluck `/captures/[captureId]` source paths.
- [x] Add focused SolidStart filesystem route discovery with route parameters and component evidence.
- [x] Add route-data records for values, shallow shapes, semantic operations, evidence, boundaries, terminals, and trajectory completeness.
- [x] Classify supported persistence reads, JSON/Zod boundaries, Solid query/resources, first-party collection calls, component handoffs, field projection/augmentation, grouping, geometry, and opaque gaps.
- [x] Assemble deterministic route-context and ordered source-to-render trajectories without fixture-specific frontend behavior.

### 2. API and server

- [x] Add strict route inventory, trajectory summary/detail, context, shape, evidence, terminal, and source-excerpt DTO contracts.
- [x] Include bounded route summaries in the workspace response.
- [x] Add generation-aware trajectory detail and validated contained-source excerpt endpoints.
- [x] Add projection and route tests, including invalid/stale selection recovery.

### 3. Frontend visualization

- [x] Add the **Data trajectories** launch control beside **Component structure**.
- [x] Build a standalone full-screen dialog with a stable shell, focus trap, nested Escape handling, trigger restoration, and body-scroll cleanup.
- [x] Build route context and deterministic semantic-stage evidence modes without implying call order where handoffs are unproven.
- [x] Add accent-only selection, explicit isolation with boundary stubs, hover/focus preview, keyboard-accessible controls, and in-place expansion.
- [x] Add the persistent inspector and source-evidence dialog without unmounting graph state.
- [x] Round-trip route, flow, item, expansion, isolation, optional filter, view, optional pan/zoom, and packet state through the URL.
- [x] Reconcile invalid URL descendants while retaining the nearest valid parent and showing a restoration notice.
- [x] Add a durable browser-local work packet with annotation, remove/reorder, count, and Markdown copy.

### 4. Acceptance and safety

- [x] Add analyzer tests for routes, persistence boundaries, continuation, shapes/effects, stable keys, negative matching, and partial trajectories.
- [x] Add frontend tests for URL state, selection/isolation, expansion, focus, and source-dialog preservation.
- [x] Open the URL-restored Solid UI in Chrome with a stable dialog shell and no hydration/DOM-structure failure; production build also passes.
- [x] Pass the `visual-notes` proof against the real project: `/time-blocks` yields a complete 14-operation path covering Prisma rows, `TimeBlockItem` mapping, query/resource, optimistic start/end replacement, overlap, geometry, component handoff, and JSX style.
- [x] Pass the Pluck robustness proof against the live monorepo-rooted server: `/captures/[captureId]` yields a complete 13–15 operation path with four expandable saved-JSON reads, parse/schema validation, page/summary/full resources, conditional selection, assembly, component handoff, and a render terminal.
- [x] Record analysis/projection timings for both target repositories.
- [x] Confirm no regression to the world map, component structure map, file explorer, or reports through the full test suite.

### 5. Trajectory UX stabilization

- [x] Make the detail resource depend only on route, flow, and analysis generation so selection, expansion, isolation, zoom, and view changes never refetch trajectory data.
- [x] Retain the current workspace during a genuine route/flow request and show explicit, non-blocking initial and refresh progress states.
- [x] Keep route-context card selection local to the context map, with a dedicated inspector that explains context selection does not load data.
- [x] Preserve the trajectory viewport scroll position when evidence expands or collapses.
- [x] Remove directional connectors after confirming adjacent cards were stage-ranked evidence rather than proven value handoffs; explain the ordering limitation in the toolbar.
- [x] Use uniform 18 px operation gaps, 216 px cards, compact vertical spacing, and expansion that does not move downstream cards.
- [x] Replace internal shape IDs on cards and in the inspector with human-readable compiler type names/text.
- [x] Add regression coverage proving context/operation interactions issue one detail request, preserve horizontal scroll, and render no handoff connectors without dependency evidence.

### 6. Route source ownership hardening

- [x] Trace the Pluck `live-smoke.ts` leak through the broad `queries.server.ts` import graph and the route candidate-selection heuristic.
- [x] Exclude conventionally named test, smoke, fixture, benchmark, eval, and script support modules from product route-data operations while retaining them in ordinary project analysis.
- [x] Prefer persistence reads with positive route/file/parameter relevance whenever a route-relevant read exists, instead of filling the source cap with unrelated reachable reads.
- [x] Remove the unconditional manifest relevance bonus that incorrectly attached capture-annotation persistence to the board route.
- [x] Scope operation keys to their owning route so shared modules cannot cause cross-route operation/value collisions.
- [x] Resolve context source location through the source value's owning operation and deduplicate shared evidence IDs in the detail projection.
- [x] Add a two-route regression with a reachable smoke module proving dev reads are absent, operation keys remain unique, and the board context source belongs to the board store.
- [x] Validate the real Pluck `/boards/[boardId]` route: the only persisted source is `app/src/lib/pluck/store/boards.ts:40`, labeled `board`, with no smoke or capture-annotation evidence.

### 7. Human-readable operation outputs

- [x] Identify the apparent `import(...)` line as TypeScript's raw module-qualified output type, not source code or operation evidence.
- [x] Add a pure formatter that removes absolute compiler import qualifiers and separates the concrete output type from nullability and useful shape metadata.
- [x] Label the card field explicitly as **Output**, render summaries such as `CaptureDetail` / `may be empty`, and relabel completeness as **Evidence complete/partial/opaque**.
- [x] Apply the same cleaned shape language to operation cards, tooltips, hover previews, and the inspector so internal paths and shape IDs do not reappear on secondary surfaces.
- [x] Add formatter and rendered-UI regressions covering absolute imported types, nullability, field counts, and removal of `/Users/...` paths.
- [x] Confirm the real Pluck capture payload contains the exact `import("/Users/.../capture-detail").CaptureDetail | null | undefined` form handled by the formatter.

### 8. Selection emphasis

- [x] Remove opacity fading from non-selected route-context and trajectory cards.
- [x] Use the blue accent border alone to identify the selected card, without changing card backgrounds.
- [x] Add interaction regressions proving selection does not add dimming classes in either view.

### 9. Honest route scope and hierarchy

- [x] Replace the flat route/component inventory with the actual bounded JSX hierarchy discovered in the route module, including parent relationships and subdued framework boundaries.
- [x] Stop fabricating a linear context chain between unrelated components and render terminals.
- [x] Group retained render sites by owning component instead of presenting them as one undifferentiated terminal list.
- [x] Expose both the retained terminal count and the total route-reachable render-site count, including the four-site selection cap.
- [x] State explicitly that context terminals are ranked structural samples, not an exhaustive or proven list of consumers of the persisted value.
- [x] Replace trajectory labels based on one arbitrary first terminal with a neutral retained-render-site summary.
- [x] Add analysis and UI regressions for hierarchy parentage, grouped coverage, and hidden-site disclosure.

### 10. Honest trajectory ordering and handoffs

- [x] Identify that the analyzer was stage-sorting independently discovered expressions and assigning each card the previous card's output, creating synthetic data dependencies.
- [x] Remove synthetic `inputValueIds` and `inputShapeIds`; no operation now claims an input handoff without dependency evidence.
- [x] Remove all directional arrows and replace the toolbar explanation with explicit semantic-stage, non-call-order language.
- [x] Exclude generic component JSX from trajectory candidates so framework wrappers such as `Suspense` cannot masquerade as data boundaries because of a `fallback` expression.
- [x] Name query boundaries from their declarations so the capture route retains `getCaptureDetail` rather than the unrelated `pluck-bootstrap` query.
- [x] Build the render evidence card from the actual ranked sink span instead of selecting an arbitrary route-file `style` attribute.
- [x] Mark current trajectories partial with `ordering: semantic-stage` and `handoffsProven: false` until argument, return-value, prop, or context edges are proven.
- [x] Relabel isolation stubs as earlier/later evidence and the inspector shape section as an observed output with an unproven input handoff.
- [x] Add regressions proving framework boundaries are excluded, inputs remain unlinked, arrows are absent, and ordering limitations remain visible.

## Verification log

| Check | Result | Notes |
| --- | --- | --- |
| `pnpm lint` | pass | ESLint clean. |
| `pnpm typecheck` | pass | Server and frontend TypeScript projects pass. |
| `pnpm test` | pass | 29 files, 192 tests, including interaction/refetch/scroll, dev-source ownership, and human-readable output-shape regressions. |
| `pnpm build` | pass | Server bundles and Vite production frontend build. |
| running server | pass | Existing Pluck-rooted dev server responds `200` at `/` and `/healthz` on `http://localhost:4173/`. |
| `visual-notes` walkthrough | pass with limitation | Real project analysis retains the intended `/time-blocks` semantic evidence; cross-operation handoffs are now explicitly partial/unproven rather than presented as a complete path. Latest measured full analysis 17.97 s. Earlier projection-only measurement: 82.9 ms. |
| Pluck walkthrough | pass with limitation | Live monorepo-rooted server retains the capture evidence sequence but marks it partial and stage-ordered. `Suspense` and synthetic arrows are absent; render evidence resolves to `CaptureStatsPanel.tsx:156`. Full analysis previously measured 21.32 s and workspace projection 106.2 ms. |

## Decisions and deviations

- The slice remains a semantic projection over compiler/source evidence. It does not claim runtime execution order.
- URL parsing and the dialog shell must be deterministic before interaction; browser-only enhancements and persistence attach after mount.
- Work packets use `localStorage`, which satisfies the slice's durable local-workspace option without adding a mutating server endpoint.
- Route discovery and dependency traversal were extracted into `src/analysis/route-discovery.ts` after the initial analyzer module crossed the repository's 400-line extraction signal.
- `~/` imports resolve from the importing file's nearest `src` directory so solution/monorepo roots such as Pluck's `/app/src` remain supported.
- The route selector intentionally exposes honest partial trajectories alongside complete ones; complete paths are chosen first on launch.

## Work notes

- 2026-07-13: Started implementation. Read repository architecture, design preferences, the complete product-pillar plan, and Solid SSR change-safety guidance.
- 2026-07-13: Added compiler-backed route discovery, semantic operation/shape/evidence records, strict summary/detail/source DTOs, and generation-aware server operations.
- 2026-07-13: Added the full-screen route-context/trajectory workspace, URL reconciliation, selection/isolation/expansion, inspector, nested source viewer, and durable local packets.
- 2026-07-13: Corrected ambient TypeScript-lib identity indexing discovered by the expanded regression suite.
- 2026-07-13: Validated `visual-notes` directly and Pluck both directly and through the running `http://localhost:4173/` API; corrected monorepo `~/` traversal from the live result.
- 2026-07-13: Final gates passed (`lint`, `typecheck`, 188 tests, production build).
- 2026-07-13: Stabilized the trajectory UX after hands-on feedback: removed interaction-driven refetches/remounts, made context selection local, retained scroll through selection/expansion, tightened the layout, replaced the ambiguous blue rule with real arrows, exposed readable types, and added visible request status.
- 2026-07-13: Re-ran final gates after the UX pass (`lint`, `typecheck`, 189 tests, production build) and confirmed the existing Pluck-rooted server remains healthy on port 4173.
- 2026-07-13: Corrected route source ownership after `live-smoke.ts` appeared on the board route. Dev-support modules no longer contribute route operations, relevant persistence reads outrank merely reachable reads, operation identities are route-scoped, and context sources resolve through their actual source value/operation.
- 2026-07-13: Re-ran final gates after source-ownership hardening (`lint`, `typecheck`, 190 tests, production build) and verified the regenerated live Pluck board detail contains only the board JSON read as persistence evidence.
- 2026-07-13: Replaced compiler-qualified output types and internal shape IDs with explicit human-readable output summaries across cards, previews, tooltips, and inspector views.
- 2026-07-13: Re-ran final gates after output-label cleanup (`lint`, `typecheck`, 192 tests, production build). The full test run was performed sequentially after confirming that concurrent build/test asset replacement can transiently invalidate server shell assertions.
- 2026-07-13: Replaced selection fading and selected-card background fills with an accent-only border in both route context and ordered trajectory views; re-ran `lint`, `typecheck`, all 192 tests, and the production build.
- 2026-07-13: Reframed route context as a bounded structural scope view: route-module JSX is hierarchical, retained render sites are grouped by component, the four-site cap and total route-reachable count are visible, and the UI no longer implies exhaustive persisted-value consumers or a fabricated linear flow. Re-ran `lint`, `typecheck`, all 192 tests, and the production build; live Pluck verification reports 4 retained samples from 1,248 render sites in route-reachable code.
- 2026-07-13: Removed the trajectory's synthetic linear dependencies after confirming that stage-ranked candidates had been chained as if they were argument/prop handoffs. Current cards are explicitly partial semantic evidence: no arrows, no `Suspense` pseudo-boundary, no claimed inputs, a relevant named query, and render evidence sourced from the ranked sink. Live Pluck verification and final gates pass (`lint`, `typecheck`, 192 tests, production build).
