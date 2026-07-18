# Current Capability Audit

Audit date: 2026-07-12. “Current” means production code in this repository, not intent or plan documents.

## Executive assessment

The repository already contains a substantial **render-path analyzer** and the beginnings of a repository workspace. It does not yet contain a general application model. The strongest implemented primitives are JSX sink discovery, backwards expression tracing, graph evidence, compiler identity evidence, several render-path diagnostics, a file-level semantic map, a component-reference hierarchy, and linked source inspection.

The largest gaps are framework entry-point discovery, route/request modeling, canonical type-shape lineage, write-path analysis, state/reconciliation modeling, semantic hierarchy, and variants that join control flow with data trajectories.

## Capability matrix

| Desired capability | Status | What exists | What is missing |
|---|---|---|---|
| Repository-wide source-to-render map | Partial/proxy | `buildSemanticMap` rolls graph nodes and ranked sink trajectories up by file; the UI renders source/flow/render lanes. | It includes only participating render-trace facts, uses files as areas, and has no application entry-point or subsystem semantics. |
| Component hierarchy | Partial/proxy | Component definitions/usages are symbol-resolved and projected into a parent-renders-child graph with zoom and direct-family isolation. | It is capped, not route-rooted, does not include native DOM structure, contexts/data edges, conditional variants, or aggregated subsystem hierarchy. |
| Route inventory and request lifecycle | Absent | Route files can incidentally appear because they contain JSX. | No Next/SolidStart/router convention adapters, route parameters, layout nesting, loaders/actions/endpoints, SSR/hydration stages, or route-specific trajectory root. |
| Framework/application classification | Absent | Some tracing logic is Solid-aware. | No explicit detected-framework facts, confidence, package/config evidence, or capability adapters. |
| Network/database/external boundary inventory | Partial/proxy | First-party helper calls and unknown edges can appear as trace operations/boundaries. | No semantic boundary taxonomy for Prisma, `query`, `action`, `fetch`, WebSocket, filesystem, database, or external service; no inbound/outbound lifecycle. |
| Canonical type identity | Partial/proxy | Expression evidence stores checker-derived symbol/type IDs, type text, definition, usages, and trace completeness. | No canonical-domain-type selection/ranking, declared-derivation graph, mirror-type detection, or field-level provenance. |
| Type/shape transformation ledger | Planned only | Trace steps include syntactic operations and `representationSteps` count churn. `docs/plans/type-shape-transformation-tracing.md` specifies a future model. | Production code has no normalized `ValueShape`, before/after shapes, semantic/identity effects, or field provenance. |
| Backward trace from rendered values | Implemented within scope | JSX children and dynamic attributes become sinks; traces carry roots, steps, helpers, defenses, types, identities, and unknown edges. | Coverage is TS/TSX render-path-specific; root labels can be literals/operations rather than application sources; paths do not automatically join persistence and framework boundaries. |
| Conditional render analysis | Partial/proxy | Conditional trace steps and repeated-fork analysis exist; branch-gated sinks are related to repeated forks. | No unified variant model joining condition, exclusive DOM/component branch, changed fields/styles, source state, and terminal previews. |
| Event and write paths | Absent for product goal | Event handler attributes are discovered as sinks. | Event handlers are excluded from rankings in `report-builder.ts:115-118`; there is no forward trace from handler through action/API/persistence write or reconciliation. |
| Interactive state/optimistic reconciliation | Absent | Signals/resources may appear as trace steps on a render path. | No state-cell identity, transition graph, optimistic overlay, server confirmation, rollback, invalidation, or “same record before/after” relation. |
| Geometry explanation | Partial/proxy | Dynamic style objects and scalar expressions are render sinks; geometry-chain heuristics contribute to advice. | No structured geometry model, multi-contributor dependency slice, units/coordinate spaces, or joined explanation of rest versus drag geometry. |
| Hierarchical roll-up at arbitrary scale | Partial/proxy | File areas, folder scoping, component depth, zoom, selection, and isolation exist. | No stable semantic hierarchy, expandable aggregate nodes, aggregate boundary stubs, “other/unrelated” roll-up, or cross-level edge conservation. |
| Architecture coherence/coupling | Partial/proxy | Cross-file graph edges, fan-in/out, helpers, relays, file hotspots, and module sizes can be inspected separately. | No subsystem boundary inference, import graph, responsibility clustering, architecture conformance, or combined “folder structure versus behavioral structure” view. |
| Shared-cause cleanup opportunities | Implemented within render findings | `computeWorkUnits` groups file-local sinks; burden ranking, concentration, packs, relays, forks, and helper debt exist. | Groups are not yet canonical-symbol/field/entry-point centered and do not combine read and write consequences across files. |
| Evidence levels and opacity | Implemented but incomplete | Evidence uses fact/suspicious/proven/trace-incomplete labels; unknown edges and trace-completeness reasons are retained. | Coverage is not expressed per application capability or entry point, so the overview can still look more complete than the underlying model. |

## Code evidence

### The analyzer is sink-first and render-path scoped

- `src/analysis/report-builder.ts:27-88` creates one graph and analyzes source files for sinks.
- `src/analysis/source-sinks.ts:66-98` recognizes JSX child expressions and dynamic JSX attributes; event attributes receive the `event-handler` category.
- `src/analysis/report-builder.ts:115-118` explicitly excludes event-handler sinks from ranking.
- `src/types.ts` defines `Sink` around render context, roots, representative steps, representation steps, defenses, and render-path metrics. It has no write sink, route, state-transition, or persistence-record entity.

Therefore the tool can accurately claim “render-path data flow for supported TS/TSX expressions.” It cannot yet claim an end-to-end application data lifecycle.

### The world map is a file projection, not a discovered application architecture

- `src/api/projections/semantic-map.ts:10-19` groups every participating graph node by `node.file`.
- `src/api/projections/semantic-map.ts:21-46` adds ranked sinks and identity definitions to those file areas.
- `src/api/projections/semantic-map.ts:84-91` builds map edges from cross-file graph edges and sink trajectories.
- `src/api/projections/semantic-map.ts:132-157` builds the component map separately from component references.
- `src/frontend/src/overview/WorldMapGraph.tsx` labels lanes “SOURCE ONLY,” “TRANSFORM + RENDER,” and “RENDER ONLY.” Those labels describe participation in the render graph, not server/client/application roles.

This is useful orientation evidence, but a file with a render root is not necessarily an application entry point, and a “source-only” file is not necessarily a database/network source.

### Component navigation exists and is a reusable interaction foundation

- `src/frontend/src/overview/ComponentStructureMap.tsx` supports node selection, panning, zooming, fit, and direct-family isolation.
- The component projection is capped at 120 nodes and 240 edges in `src/api/projections/semantic-map.ts`.
- Its edges mean “component renders component”; they do not mean data flow.

The interactions can be reused, but the product must keep render hierarchy edges visually and semantically distinct from data-flow edges.

### Type identity exists; type-shape evolution does not

`ExpressionIdentityEvidence` in `src/types.ts` retains symbol ID/name, type ID/text/definition, definition/usages, upstream/downstream paths, terminal sinks, representation steps, unknown boundaries, graph IDs, and boundary IDs. This is a strong identity spine.

However, there is no production `ValueShape` or `TransformationStep` model. Those names appear in `docs/plans/type-shape-transformation-tracing.md`, which is design evidence, not runtime capability. Current `representationSteps` identify operations such as object packing but do not prove which fields were preserved, lost, derived, or restored.

## Real-repository checks

### `wall-portfolio`

Repository facts:

- It is a Next.js App Router project (`app/layout.tsx`, multiple `page.tsx` files, dynamic `[slug]` routes, and `app/og/route.tsx`).
- Route-like entry files include home, blog index/detail, projects index/detail, experience index/detail, about, and the OpenGraph route.
- `app/blog/utils.ts:69-94` discovers and reads MDX files from the filesystem.
- `app/components/mdx.tsx:57-156` defines a large MDX component registry, including interactive custom components.
- Blog and project detail pages pass discovered MDX content to `CustomMDX`.

Analyzer check:

```text
summary: 341 sources, 484 sinks, 3,186 nodes, 2,847 edges, 24 unknown edges
bounded JSON payload inspected: 100 sinks across 14 TSX files
```

What this proves:

- the analyzer sees substantial JSX expression flow in the project;
- route components, MDX wrapper code, and interactive blog components participate as ordinary TSX files.

What it does not prove or expose as first-class facts:

- the route inventory, `[slug]` parameter, layout nesting, request/SSR lifecycle, static parameter generation, filesystem content boundary, MDX tag-to-component registry, or which MDX documents may instantiate which components;
- the portfolio's application purpose or its content families;
- the OpenGraph route as an HTTP image endpoint rather than merely a TSX-containing file.

This is the clearest example of “repository render map” being a useful proxy but not yet an application viewer.

### `visual-notes` time blocks

Repository facts:

- `time-blocks.queries.ts:48-83` maps Prisma rows into the canonical UI-facing `TimeBlockItem`.
- `WeeklyTimeBlocksCalendar.tsx:152-188` loads blocks through a Solid resource and overlays optimistic start/end times.
- `overlap.ts:16-45` copies each block into `TimeBlockWithPosition`, adding `index` and `totalOverlaps`.
- `WeeklyTimeBlocksCalendar.tsx:340-357` groups blocks by day, then overlap group, then flattens them again.
- `WeeklyTimeBlocksCalendar.tsx:764-795` computes drag-ghost geometry from drag state.
- `WeeklyTimeBlocksCalendar.tsx:1329-1394` computes resting block geometry and renders `left`, `width`, `top`, `height`, and drag opacity.
- `WeeklyTimeBlocksCalendar.tsx:1495-1516` renders a distinct drag ghost.

Analyzer check over the route, service, and time-block component files:

```text
summary: 212 sources, 245 sinks, 25,111 nodes, 21,266 edges, 8 unknown edges
bounded JSON payload inspected: 125 sinks across 6 TSX files
```

The output did identify dynamic style sinks and trace operations such as accessor reads, conditionals, iteration, templates, property reads, calls, and object packing. It did **not** present a single trajectory equivalent to:

```text
Prisma TimeBlock
  -> mapTimeBlock / TimeBlockItem
  -> resource
  -> optimistic time overlay
  -> day grouping
  -> overlap augmentation
  -> rest geometry or drag geometry
  -> rendered block/ghost style
  -> update action
  -> Prisma update
  -> reconciliation
```

This gap is not merely UI presentation. The underlying model lacks persistence boundaries, write trajectories, state transitions, canonical field provenance, and variant joins.

## Important correctness cautions

1. **Counts are not coverage.** Thousands of graph nodes do not mean routes, persistence, or writes were understood.
2. **A root label is not necessarily a business source.** Current roots include literals, imports, parameters, and operations.
3. **A type string is not lineage.** Structural similarity and formatted checker text cannot prove canonical derivation.
4. **A component edge is not a data edge.** The UI must never visually conflate them.
5. **A long trace is not a smell.** Geometry and serialization can be legitimate semantic work.
6. **A plan is not a feature.** Existing type-shape and repository-evolution plans accurately anticipate several gaps, but acceptance must be based on runtime models and fixture results.

