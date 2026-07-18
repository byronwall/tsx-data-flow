# Delivery Sequence

The sequence prioritizes one usable route-to-render trajectory before broad horizontal coverage. The executable first-slice plan is [07-first-vertical-slice-route-data-trajectory.md](07-first-vertical-slice-route-data-trajectory.md). Each later phase must add a visible capability to that workflow, not only internal types.

## Phase 0: Freeze truthful baselines

Deliverables:

- save machine-readable current analyzer outputs for the focused `visual-notes` time-block scope and Pluck capture-viewer scope; retain the existing `wall-portfolio` baseline for the later atlas work;
- record analysis duration, sink coverage, unknown edges, and representative false/missing paths;
- add a capability-coverage section to analysis metadata: render reads, routes, framework boundaries, state, events, writes, persistence, and type shapes;
- label unsupported capabilities instead of leaving them implicit.

Exit criteria:

- the current world map cannot be mistaken for a complete application map;
- fixture commands and expected summaries are reproducible.

## Phase 1: Implement the minimum semantic evidence for one trajectory

Implement only the focused modules required by the first route-scoped read trajectory:

1. `CodeIdentity` adapters over the existing identity index;
2. normalized shallow `ValueShape` extraction;
3. route, persistence source, semantic operation, rendered terminal, and typed data-edge records;
4. evidence/confidence and capability coverage;
5. deterministic serialization with caps and truthful totals.

Adapt existing trace facts into these records without attempting the full general entity/edge ontology and without removing old reports.

Tests:

- symbol identity across aliases/imports;
- object, array, tuple, union, nullish, generic, recursive, `any`, and unknown shapes;
- deterministic IDs within a generation;
- unknown calls stay unknown;
- performance benchmark.

Exit criteria:

- the `visual-notes` time-block route can produce one persistence-to-render trajectory containing the operations required by the first-slice plan;
- no UI-specific coordinates/classes enter analysis or API projections.

## Phase 2: Add the two adapters required by the first slice

Start with only:

- SolidStart filesystem routes plus route parameters and rendered route shell/component roots;
- SolidStart `query` and `createResource` reads;
- Prisma read operations and returned/mapped values;
- file/JSON reads and parsing needed by Pluck's saved capture detail path.

Adapters emit semantic facts with evidence and confidence. They do not own the graph.

Tests:

- focused fixtures for static/dynamic SolidStart routes and route shells;
- aliased imports and wrapper functions;
- negative cases for same-named user functions;
- unsupported framework/config warning.

Fixture gates:

- recognize the `visual-notes` `/time-blocks` route, its resource/query read, Prisma read, and route render root;
- recognize Pluck's `/captures/[captureId]` route, saved capture read/parse path, `CaptureDetail`, and viewer route shell.

## Phase 3: Ship the route data-trajectory visualization

Build the standalone full-screen/modal visualization specified in the first-slice plan. Launch it beside the current world map in the same experimental manner as Component Structure, rather than rewriting the current world map.

Features:

- route selector and route-context strip;
- representative types/values intersecting the route;
- left-to-right ordered semantic operations;
- selection fading with explicit isolation;
- in-place operation expansion into source-expression evidence;
- persistent inspector and hover/focus previews;
- URL restoration for all exploration state;
- modal/drawer source viewer that does not replace the visualization;
- explicit trace coverage and opacity.

Do not attempt automatic feature clustering, a general repository atlas, write paths, a state machine, or arbitrary edge-family overlays.

Fixture gate:

- a developer can select the `visual-notes` time-block route and, within five minutes, explain how persisted time data becomes the resting block's `left`, `top`, `width`, and `height`;
- the same UI can show a coherent Pluck saved-capture trajectory without fixture-specific rendering code.

## Phase 4: Deepen type-shape transformations and provenance

Implement the existing type-shape plan on the new kernel:

- before/after shapes for high-confidence operations;
- field provenance for property access, object literals/spreads, mapped values, destructuring, and typed projections;
- declared derivation graph for aliases/interfaces/utilities;
- mirror candidates as low-confidence comparison facts;
- drop/recover, repeated normalization, and typed/opaque/typed detectors.

Keep ordinary transformations below the finding threshold.

Fixture gates:

- show `Prisma TimeBlock` row → `TimeBlockItem` mapping field by field;
- show `TimeBlockItem` → `TimeBlockWithPosition` as identity-preserving augmentation where evidence supports it;
- label casts or opaque library boundaries honestly;
- choose one `wall-portfolio` content metadata trajectory and show its filesystem-to-page projection.

## Phase 5: Add conditional render variants horizontally

Unify:

- conditional trace operations;
- repeated fork sites;
- branch ranges and terminal membership;
- conditional style/object fields;
- same-subject terminal clustering.

Produce variants that state whether terminals are exclusive, simultaneous, or unknown.

Fixture gate:

- for a time block, distinguish the resting block (dimmed while dragged), drag ghost, creation preview, resize handles, and time indicators;
- show the predicates and state fields selecting each variant;
- retain common upstream data once rather than duplicating full paths.

## Phase 6: Add event, mutation, and reconciliation trajectories horizontally

Implement state cells and transitions for:

- Solid signals/stores/resources/context;
- resource source/fetcher dependencies;
- setters and store writes;
- event-handler forward call/data flow;
- actions/API calls and persistence writes;
- explicit refresh/invalidation and optimistic reconciliation.

Treat lifecycle order conservatively and attach framework evidence.

Fixture gate:

- trace `TimeBlockItem` from Prisma read to rendered geometry;
- trace drag/resize event state to `updateTimeBlock` and Prisma update;
- show `optimisticTimes` overlay and the condition that removes or retains entries when server data returns;
- identify mutation payload fields and canonical provenance.

## Phase 7: Add semantic hierarchy and architecture coherence

Only after routes, boundaries, types, and trajectories exist, add derived grouping:

- package/workspace and runtime grouping;
- route/feature neighborhoods;
- domain-type-centered neighborhoods;
- graph-community suggestions with confidence;
- folder-versus-behavior mismatch metrics;
- cross-group coupling and diffuse dependency diagnostics;
- size/complexity overlays from source metrics.

Fixture gates:

- `wall-portfolio` separates content pipeline, interactive MDX components, experience data, project data, and OG rendering without relying solely on folders;
- `visual-notes` time-block service, calendar interaction, dialogs, and persistence appear as related but separately owned regions.

## Phase 8: Consolidate cleanup work and comparison

Rebase work units on shared semantic causes:

- canonical identity/field;
- state cell;
- predicate;
- boundary;
- entry point;
- operation sequence.

Add comparison over stable fingerprints where safe:

- routes/boundaries added or removed;
- shape lineage improved/regressed;
- unknown boundaries changed;
- affected terminal/write reach;
- repeated variants/forks changed.

Exit criteria:

- a work packet can be generated from any pillar and reanalysis can verify its invariant;
- legacy report pages that duplicate the unified workspace are retired or demoted only after parity is measured.

## Dependency table

| Feature | Required primitives |
|---|---|
| Route map | entity, entry point, boundary, containment edge, trajectory |
| MDX registry view | filesystem boundary, registry operation, possible-runtime edge, component terminal |
| Type lineage | code identity, value shape, field provenance, operation |
| Geometry explainer | terminal, operation, control predicate, state cell, trajectory |
| Drag variants | predicate, variant, terminal clustering, state cell |
| Optimistic lifecycle | state transition, event entry, write terminal, canonical identity, reconciliation relation |
| Architecture coherence | hierarchy, semantic edges, coverage, source metrics |
| Cleanup advisor | all evidence above plus finding invariant and shared-cause reachability |

## Implementation boundaries

Follow the repository's established architecture:

- `src/project`: config/framework discovery inputs;
- `src/analysis`: semantic entities, identities, shapes, operations, trajectories, findings;
- `src/reports`: server-side selectors and Markdown work packets;
- `src/api/contracts.ts`: strict DTO schemas;
- `src/api/projections`: bounded semantic projections only;
- `src/server`: caching and API orchestration;
- `src/frontend`: interaction and DOM/SVG layout.

Do not add graph coordinates, UI colors, CSS classes, or route URLs to analysis-domain objects.
