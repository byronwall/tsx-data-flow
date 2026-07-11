# Application structure

This repository contains a static TypeScript/TSX render-path analyzer, its report projections, a local HTTP server, and a Solid frontend for browsing the results. The architecture follows a pipeline: project loading feeds analysis, analysis produces a shared report model, and report/HTML/frontend layers project that model without owning analyzer behavior.

## Top-level flow

1. `bin/` and `src/cli/` parse commands and select CLI or server behavior.
2. `src/project/` discovers source files and TypeScript configuration.
3. `src/analysis/` traces render paths and constructs the analysis graph and findings.
4. `src/reports/` projects the shared report into Markdown, JSON, comparisons, and overview data.
5. `src/server.ts` and `src/server/` expose report, source, refresh, and frontend routes.
6. `src/html/` renders reusable HTML fragments used by the browser experience.
7. `src/frontend/src/` composes the Solid application and adds client-side interaction.

`src/types.ts` is the shared report contract. `src/core.ts` is the programmatic analyzer entry point. Keep projection-specific concerns out of both.

## Backend boundaries

### Project loading: `src/project/`

This layer owns discovery, tsconfig resolution, source inclusion, and TypeScript program creation. It should return compiler/project context without deciding how findings are ranked or displayed.

### Analysis: `src/analysis/`

This layer owns sink discovery, source tracing, graph construction, shape classification, defenses, repeated forks, ranking, and final report assembly.

Split analysis modules by algorithm or domain concept. A classifier may contain substantial branching, but it should not also format Markdown or HTML. Shared trace mechanics belong in focused support modules rather than accumulating in one catch-all analyzer file.

### Reports: `src/reports/`

This layer converts `AnalysisReport` into Markdown, JSON, comparisons, and overview summaries. Keep selection and aggregation separate from prose formatting when either becomes substantial. View routers should delegate to view-specific renderers.

### Server: `src/server.ts` and `src/server/`

The server entry owns request coordination and delegates page rendering, URL parsing, view configuration, and network-view data to focused modules. Route handlers should remain orchestration code; analyzer execution and large renderers belong elsewhere.

### HTML: `src/html/`

These modules create escaped HTML/SVG fragments for code maps and report viewers. Split by visible panel or rendering responsibility: source lines, entry panels, finding panels, graph rendering, paths, and styles. Keep escaping at serialization boundaries and do not move browser lifecycle state into these server-safe renderers.

## Solid frontend boundaries

The frontend is intentionally split by responsibility:

- `App.tsx`: application bootstrap, history navigation, delegated link handling, and stable route selection only.
- `Layout.tsx`: shared top bar, tabs, resize observation, and layout cleanup.
- `OverviewPage.tsx`: overview route UI and controls.
- `overview-model.ts`: pure overview query parsing, filtering, sorting, aggregation, and presentation labels.
- `ReportPage.tsx`: report resource loading and report/network-view composition.
- `FilePage.tsx`: focused-file resource loading and route composition.
- `CodeMap.tsx`: code-map DOM interaction, selection state, listeners, overlays, and cleanup.
- `code-map-interactions.ts`: focused DOM overlay operations used by `CodeMap`.
- `viewer-renderers.ts`: report-network HTML serialization and picker markup.
- `viewer-data.ts`: pure fan-out, fan-in, relay, and relationship-graph shaping.
- `view-config.ts`: report view names, labels, and view guards.
- `api.ts`: small checked fetch helpers.
- `client-state.ts`: browser persistence helpers.
- `popover-controller.ts`: popover event ownership and cleanup.

Route components may compose these pieces, but should not absorb their implementations. For example, a new report graph should place graph shaping in a pure data module, serialization in a renderer, and DOM interaction in a component/controller.

## When to split a file

Use responsibility, not line count alone, to choose boundaries. Split when any of these are true:

- A component loads data, transforms it, renders a large tree, and manages DOM interactions.
- A file contains multiple feature islands that could be tested or changed independently.
- Pure filtering, sorting, parsing, graph shaping, or formatting is embedded inside a component.
- Event math, timers, global listeners, observers, or storage synchronization live in a route component.
- A renderer contains several distinct panels or output formats.
- A file crosses roughly 300 lines and continues growing.

Prefer these extraction shapes:

- Thin route or router component for selection and composition.
- Feature component for a cohesive visible UI island.
- Behavior component/controller for state, events, and lifecycle cleanup.
- Pure model/selector module for deterministic transformations.
- Presentational renderer for HTML, Markdown, SVG, or small JSX controls.
- Configuration module for stable names, labels, and type guards.

Do not split into arbitrary numbered files or one-function modules merely to satisfy a line limit. Each extracted module should have a clear name and ownership boundary.

## Solid rendering constraints

The frontend can be served through server-generated application HTML, so structural changes must remain hydration-safe:

- Keep server output and the first client render structurally identical.
- Avoid render-time branching based on browser-only state.
- Keep route and shell wrappers stable across extraction boundaries.
- Prefer serializable data props or render callbacks over conditionally passing already-created JSX nodes through generic shells.
- Add browser-only enhancement in `onMount` and clean it up with `onCleanup`.

## Review checklist

Before completing a feature or refactor:

- Does every changed file have one clear primary responsibility?
- Did pure transformations stay outside components and route handlers?
- Did listeners, observers, timers, and subscriptions retain explicit cleanup ownership?
- Could a growing component be split at a named feature or behavior boundary?
- Are HTML and Markdown values escaped at their serialization boundary?
- Are direct imports used instead of barrel re-exports?
- Does the Solid initial tree remain deterministic?
- Do `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass?

