# Solid client/server migration plan

## Objective

Replace the remaining string-based HTML generation with a conventional architecture:

- the Node server owns analysis, caching, filesystem access, validation, and typed JSON/markdown APIs;
- the SolidJS application owns all browser-visible markup, state, navigation, and interaction;
- shared modules contain Zod-defined transport contracts, serializable domain/view-model types, and pure selectors, never HTML strings or DOM access;
- `src/html` is deleted when the Solid implementation reaches parity.

This is a migration, not a redesign. Preserve the current routes, URLs, report downloads, code-map behavior, and visual language unless a phase explicitly changes a contract.

## Product intent and success criterion

This migration serves the durable direction in [`../../INTENT.md`](../../INTENT.md). The product is a local, disposable code-review instrument for understanding unfamiliar code, especially one file or a set of files changed in a PR. Its central questions are:

- Did the latest change make the code worse?
- Does this code introduce unnecessary fallbacks, conditional paths, transformations, object packing, relay hops, or other avoidable complexity?
- Where is the most important problem, how does data reach it, and what source evidence supports that conclusion?

The code map is the primary working surface and the overview is the primary triage surface. Context/prop-relay analysis is the next-highest-value workflow. The remaining reports are supporting lenses and do not automatically merit equal migration investment.

Product acceptance criterion:

> Given an unfamiliar changed file, a user can identify the most consequential newly introduced complexity, understand its path through the code, and locate the responsible source within one minute.

Deleting `src/html` is an implementation milestone, not the product outcome.

### Explicit non-goals

- durable entity identity across refreshes, analyses, commits, or machines;
- mobile layouts or mobile-specific behavior and tests;
- exact visual parity with the current implementation;
- compact localhost payloads unless measurement shows client parsing, memory, or rendering harm;
- preserving accidental JSON response compatibility without an identified external consumer;
- migrating every existing report before its product value is established.

## Current state

The app already serves a Vite-built Solid SPA for `/`, `/file`, and `/report`, but the conversion is incomplete:

- The first structural split is complete: `App.tsx` is now a small routing/composition root, with `OverviewPage`, `FilePage`, `ReportPage`, `CodeMap`, shared layout/tabs, API fetch helpers, view configuration, overview selectors, and viewer data/renderers extracted into named modules.
- The split exposes rather than resolves the client/server seam: `OverviewPage`, `CodeMap`, `viewer-data`, and `viewer-renderers` still import analyzer/domain types or analysis helpers directly, while `api.ts` still trusts generic unvalidated responses.
- The frontend still imports `STYLE`, `renderCodeMap`, graph renderers, and `markdownToHtml` from `src/html`.
- Code maps, network viewers, and markdown reports are inserted through `innerHTML`; Solid is acting as a shell around generated HTML.
- `/api/report.json` returns an ad hoc projection but the frontend types it as a full `AnalysisReport`, so the transport contract is not explicit or type-safe.
- Overview and graph/report selectors are now easier to locate in `overview-model.ts`, `viewer-data.ts`, and `viewer-renderers.ts`, but remain duplicated across frontend, reports, and older server-rendering modules.
- `src/server/render-pages.ts` and `src/server/network-viewers.ts` are not on the active page route and appear vestigial.
- `src/html/page.ts` remains only for missing-build and error responses.
- Most UI behavior is tested as generated string fragments under `test/html`, while Solid itself has only small state-helper coverage.

## Target architecture

```text
TypeScript project
      |
      v
analysis/core --------------------------> CLI markdown/JSON output
      |
      v
server cache + API adapters
      |
      +-- GET /api/workspace
      +-- GET /api/file?path=<relative-path>
      +-- GET /api/reports/:view
      +-- POST /api/refresh
      +-- GET /api/report.:view.md       (download/agent compatibility)
      |
      v
typed JSON contracts
      |
      v
Solid resources/stores -> Solid components -> DOM/SVG
```

Recommended end-state source layout (evolve the current split into this; do not recombine it first):

```text
src/
  api/                    # Zod transport schemas and inferred DTOs shared by server/client
  analysis/               # existing analyzer facts
  reports/                # CLI/markdown projections and shared pure selectors
  server/
    cache.ts
    routes.ts
    responses.ts
    api-workspace.ts
    api-file.ts
    api-report.ts
  frontend/src/
    app/
      App.tsx
      router.ts
      api-client.ts
    components/
      shell/
      overview/
      reports/
      code-map/
      graphs/
      source-peek/
    state/
    styles/
```

The current flat modules are valid migration seams, not throwaway work:

- `Layout.tsx` maps to shell/tab components;
- `overview-model.ts` should shrink toward browser-only filtering, sorting, pagination, and URL state as semantic aggregation moves to server projections;
- `viewer-data.ts` should split between server-owned qualification/projection and browser-owned graph geometry;
- `viewer-renderers.ts` is a temporary HTML-string boundary to replace with Solid graph/report components;
- `api.ts` should become the schema-parsing `api-client.ts` rather than adding a second fetch layer;
- `CodeMap.tsx`, `OverviewPage.tsx`, `FilePage.tsx`, and `ReportPage.tsx` are the existing route/component shells to migrate in place.

Do not introduce SolidStart or server-side rendering for this migration. The existing Node HTTP server plus a client-rendered Vite/Solid app is the smallest conventional client/server architecture for this product.

Treat review scope as a first-class input throughout this architecture. The supported scopes are one file, a supplied set of changed files, and the whole project. Scoped results should retain enough project-wide context to explain downstream reach.

Baseline-versus-current comparison is a core product capability, not merely a CLI compatibility concern. When a baseline is supplied, the transport and UI must be able to distinguish new, worsened, resolved, and unchanged findings and summarize changes in fallbacks, hops, transformations, packing, and conditionals. Reuse the existing baseline/compare analysis where possible, but do not design snapshot-only DTOs that make comparison awkward later.

## API contracts

Define DTOs before moving UI so the client cannot accidentally depend on analyzer internals. Use Zod as the single source of truth for each transport contract: export the schema and derive its TypeScript type with `z.infer`, rather than maintaining a handwritten interface beside a validator.

Validate at both sides of the boundary:

- server adapters parse their assembled response through the relevant Zod schema before serialization, catching projection mistakes close to their source;
- the frontend API client parses every JSON response before exposing data to Solid resources;
- request parameters and structured error responses use schemas too;
- analyzer-internal objects remain ordinary TypeScript types and are converted into explicit transport DTOs at the server adapter boundary.

Production parsing errors should become the common structured error shape without exposing stack traces. Development and tests should retain Zod issue paths so contract drift is easy to diagnose.

### Contract ownership and durability

Treat the analyzer model, transport model, and browser state as three separate type families:

1. **Analyzer domain types** remain internal. `AnalysisReport`, `Sink`, compiler objects, trace contexts, and analysis graphs may change as the analyzer evolves and are never API response types.
2. **Transport primitives and page/report DTOs** are strict Zod schemas under `src/api`. Server projection builders deliberately convert analyzer data into these stable, serializable shapes.
3. **Browser state types** describe selection, filters, sort choice, pagination, open popovers, URL state, and viewport-dependent presentation. They are not serialized by the server.

The current `/api/report.json` violates this boundary: it sends an ad hoc subset of `AnalysisReport`, while the frontend asserts the response is the full inferred `AnalysisReport`. Replace that endpoint rather than formalizing its accidental shape.

Apply these rules to every transport schema:

- use strict Zod objects so analyzer additions do not leak into responses;
- use finite enums and discriminated unions for categorical fields instead of broad `string` values;
- make fields required when components require them, even if the adapter must translate an analyzer `undefined` into a deliberate value or `null`;
- use `null` for known absence and omission only when a field is inapplicable to a discriminated-union variant;
- do not expose index signatures such as `[key: string]: unknown`;
- call workspace-relative filenames `path` consistently; reserve `file` for analyzer-internal compatibility;
- treat IDs as opaque and stable only within one cache generation; cross-generation identity is unnecessary;
- include `apiVersion`, `analysisVersion`, `generation`, and `generatedAt` in a common success envelope;
- prefer small duplicated nested references over normalized entity tables that force the client to perform joins;
- return semantic data, never HTML, CSS classes, SVG strings, or prebuilt URLs.

The common primitives should begin with shapes equivalent to:

```ts
type SourcePointDto = {
  path: string;
  line: number;
  column?: number;
};

type SourceRangeDto = {
  start: SourcePointDto;
  end: { line: number; column?: number };
};

type EntityRefDto = {
  id: string;
  label: string;
  location: SourcePointDto | null;
};

type ApiEnvelope<T> = {
  apiVersion: 1;
  analysisVersion: number;
  generation: number;
  generatedAt: string;
  data: T;
};
```

These examples describe the intended wire shape; the implementation source of truth remains the Zod schema and its `z.infer` type.

### Projection ownership

Server-side projection builders own domain interpretation and aggregation:

- workspace grouping, summary counts, dominant shape/ownership, first-cut advice, graph participation, and default ordering;
- fan-in, fan-out, prop-relay, boundary, and junction qualification;
- finding severity, burden display values, inventory ordering keys, path grouping, and source annotations;
- cross-file source snippet selection and stable entity labels;
- picker labels and picker metrics for report items.

The browser owns only interaction and presentation concerns:

- current selection, filter, search, sort choice, pagination, and URL construction;
- applying a chosen sort to server-provided sort keys;
- focus, scroll, measurement, clipboard behavior, and viewport-dependent graph geometry;
- rendering semantic DTOs as DOM and SVG.

Create explicit pure builders such as `buildWorkspaceDto`, `buildFilePageDto`, `buildFindingsReportDto`, `buildFanInReportDto`, and `buildPropRelayReportDto` under `src/api/projections` or `src/reports/view-models`. The API adapters invoke these builders and validate the result. Shared report/markdown code may reuse genuinely presentation-independent selectors, but the frontend must not reconstruct these projections from sinks.

### Workspace endpoint

`GET /api/workspace`

Returns the summary cards, concentration, file rows, per-file entry counts, graph-participation flags, and workspace metadata. When comparison data exists, it also returns enough prepared data to distinguish new, worsened, resolved, and unchanged problems inside the active review scope. Filtering, sorting, and pagination can remain client-side initially because transport is normally localhost. Measure parsing, memory, and rendering against the performance budgets before introducing server pagination. The response should contain prepared rows, not require the client to recreate analyzer/report selectors.

The principal response shape is:

```ts
type WorkspaceDto = {
  workspace: {
    displayRoot: string;
    source: string;
    typescriptVersion: string | null;
    configPaths: string[];
    warnings: string[];
  };
  summary: WorkspaceSummaryDto;
  concentration: ConcentrationDto;
  files: WorkspaceFileRowDto[];
};

type WorkspaceFileRowDto = {
  path: string;
  findings: { count: number; worstBurden: number; maxDepth: number };
  entries: {
    boundaries: number;
    relays: number;
    unknownEdges: number;
    fanOutSources: number;
  };
  classification: {
    primaryShape: string;
    ownership: string;
    firstCut: string;
  };
  flags: { graphParticipant: boolean };
  worstFinding: {
    id: string;
    label: string;
    line: number;
    burden: number;
  } | null;
  searchText: string;
};
```

Do not send complete sinks in workspace rows. The row is the UI unit and should already contain every displayed value and filter/sort input.

### File endpoint

`GET /api/file?path=<relative-path>`

Returns one finished file-page payload with:

- validated relative path and source lines;
- source annotations already associated with their lines and entity IDs;
- a discriminated, unified inventory of findings, forks, helpers, unknown edges, relays, and fan-outs;
- full finding details indexed by ID, including grouped paths, defenses, representation steps, advice, reach, and snippets;
- explicit sort keys, severity, labels, and flags needed by the inventory UI;
- the minimal metadata needed for debug payloads and cross-file links;
- source snippets needed by visible path steps, or stable references that can be fetched lazily.

This replaces the current three-request combination of file report, full report, and source. An initially large payload is acceptable on localhost; do not fragment it preemptively. Split or lazily fetch heavy details only when representative 50K–200K LOC projects show measurable parsing, memory, or rendering harm. Validate that the resolved path remains under the analyzed root and return structured 400/404 errors.

Use a discriminated inventory rather than parallel collections that the browser must filter and merge:

```ts
type FilePageDto = {
  file: {
    path: string;
    language: "tsx" | "ts" | "jsx" | "js" | "other";
    lines: SourceLineDto[];
  };
  inventory: InventoryEntryDto[];
  findingsById: Record<string, FindingDetailDto>;
  reportAvailability: ReportViewDto[];
  debug: FileDebugDto;
};

type SourceLineDto = {
  number: number;
  text: string;
  annotations: SourceAnnotationDto[];
};

type SourceAnnotationDto = {
  kind: "finding" | "fork" | "boundary" | "relay" | "unknown-edge" | "fan-out";
  entityId: string;
  startColumn: number | null;
  endColumn: number | null;
  burden: number | null;
};

type InventoryBaseDto = {
  id: string;
  kind: string;
  line: number | null;
  label: string;
  secondaryLabel: string | null;
  sort: { score: number; line: number; sources: number; kindOrder: number };
  flags: { hasDetails: boolean; hasDefenses: boolean };
};
```

`InventoryEntryDto` must be a union with concrete variants such as `finding`, `fork`, `boundary`, `relay`, `unknown-edge`, and `fan-out`; `kind` in the base sketch is narrowed by each variant. Avoid making the client join normalized entity tables merely to render a row or detail panel.

### Report endpoint

`GET /api/reports/:view?path=<optional-relative-path>`

Return a discriminated union keyed by `view`. Network reports should return graph nodes/edges and picker metadata; list/table reports should return structured rows/sections. Keep `/api/report.:view.md` as a separate download and agent-facing projection, but do not use markdown as the browser's UI data source.

Define one concrete schema per view and combine them into an exhaustive union. Do not introduce a universal JSON-section or JSON-markup format. For example, `FanInReportDto` contains already-qualified fan-in items with sink references, roots, root count, predicate count, and maximum depth; `JunctionsReportDto` contains only helpers already classified and ordered as junctions.

Do not assume every current view deserves an equally rich native implementation. Before implementing a report DTO/component, classify the view as **migrate**, **merge into the unified code-map explorer**, **defer**, or **delete**. Code-map findings and paths come first; context/prop-relay comes next. Existing Markdown may remain the temporary surface for lower-value views.

Each selectable report item includes a generation-local ID, label, picker label/metric, and semantic graph or row data. It does not include `active`, `href`, CSS classes, or SVG coordinates: those depend on browser state or desktop presentation.

### Refresh endpoint

`POST /api/refresh`

Return JSON with a cache generation/version after rebuilding. Keep the prior analysis visible with a clear analyzing indicator, then replace it atomically on success. Preserve the current page and URL-backed file/report/selection when it still exists; otherwise fall back to the containing file or overview. Do not preserve popovers, disclosures, scroll position, or other incidental state. On failure, retain the prior result and show the exact failure and likely configuration action. Keep the legacy `/refresh` redirect temporarily for bookmarked/form compatibility, then remove it after the SPA no longer posts forms to it.

### Error shape

All JSON endpoints return a common `{ error: { code, message, details? } }` shape. Add a small client wrapper that checks status and content type instead of assuming every response succeeds.

## Migration phases

### Phase 0: freeze the valuable behavior and establish product baselines

1. Record route/API behavior for `/`, `/file`, `/report`, Markdown downloads, refresh, assets, and unknown SPA routes.
2. Add browser/component tests around the primary journey: scoped overview → file → ambient code map → selected finding/path → source peek → refresh.
3. Cover URL restoration only for page, file/report, selection, filters, and sort. Do not preserve incidental disclosure, popover, scroll, or mobile state.
4. Record representative analysis and interaction timings at approximately 10K, 50K, and the largest available 100K–200K LOC fixture/project.
5. Inventory report views and classify each as migrate, merge, defer, or delete. Do not begin native implementations for unclassified reports.
6. Add a dependency rule: frontend code may import transport schemas/types from `src/api` and explicitly designated browser-state/URL modules, but not analyzer/domain types from `src/types`, server projection builders, `src/html`, or `src/server`.
7. Mark `src/server/render-pages.ts` and `src/server/network-viewers.ts` as deletion candidates; verify no package export or identified external consumer relies on them.

Exit criterion: the high-value review journey has behavioral coverage, report priorities are explicit, and performance baselines exist. Exhaustive parity with incidental behavior is not required.

### Phase 1: establish contracts for the first vertical slice

1. Add Zod as a runtime dependency and define shared schemas under `src/api`. Export DTO types with `z.infer`; do not duplicate schema shapes as handwritten interfaces.
2. Define review-scope and comparison primitives before page DTOs.
3. Implement projection builders for the workspace overview, one finished file/code-map payload, refresh, and their comparison summaries. Do not block this phase on schemas for every report.
4. Split `src/server.ts` into cache, route, response, and API adapter modules while keeping `createServer` as the public facade.
5. Add `/api/workspace`, `/api/file`, and JSON refresh for the vertical slice. Add `/api/reports/:view` variants only as their views are accepted for migration.
6. Keep existing endpoints as temporary compatibility adapters until their Solid consumers switch; do not promise compatibility for the accidental JSON shape.
7. Parse outgoing DTOs with their Zod schemas and incoming request parameters with dedicated request schemas.
8. Add contract tests for schemas, review scoping, comparison states, invalid paths, cache invalidation, and actionable error shapes.

Exit criterion: the primary overview → file → code-map journey can be rebuilt using JSON alone, including comparison data when a baseline is supplied.

### Phase 2: ship the primary Solid vertical slice

1. Preserve the completed `App.tsx` split and migrate the extracted route/layout/code-map modules in place. Further subdivision should follow product responsibilities discovered during conversion, not recreate a directory diagram mechanically.
2. Evolve the existing `api.ts` into the schema-parsing API client; add resource factories and working/empty/error states. During refresh, retain the old result until the new generation succeeds.
3. Move URL parsing/building to pure modules and preserve only useful orientation state.
4. Move CSS into frontend assets. Optimize for a desktop code-review workspace and remove mobile-specific layout code and tests.
5. Port the overview with scoped and comparison-aware prioritization: new, worsened, resolved, unchanged, and the most consequential current problems.
6. Port the code map incrementally:
   - server projections for touched lines, spans, burden inputs, comments, grouping, severity, ordering, and snippets;
   - native JSX source pane, gutter, hit spans, heat, and multi-line spans;
   - unified typed inventory and selected detail;
   - paths, defenses, representation changes, reach, same-code evidence, and concise copy payloads;
   - cross-file source peeks without leaving the code map;
   - keyed selection/filter/sort state instead of delegated DOM mutation.
7. Keep imperative DOM only for focus, measurement, scroll, and clipboard fallbacks.

Exit criterion: a user can complete the one-minute unfamiliar-file review journey on native Solid markup; `CodeMap` has no `innerHTML` or DOM-driven source of truth.

### Phase 3: migrate context/prop-relay and reusable graphs

1. Implement context/prop-relay DTOs and native Solid views, emphasizing values pulled from context and then unnecessarily passed as props.
2. Extract reusable semantic graph DTOs and Solid SVG components only as this workflow or the code map requires them.
3. Reuse graph components in file details and accepted report views.
4. Keep layout deterministic, desktop-oriented, and fast; do not add responsive/mobile geometry that the product does not need.

Exit criterion: the second-highest-value workflow is fully explorable without leaving the code map or relying on generated HTML.

### Phase 4: migrate, merge, or retire supporting reports

For each report classified in Phase 0:

1. **Migrate:** define its concrete schema and structured Solid component.
2. **Merge:** surface its semantic entries and detail inside the unified code-map explorer rather than preserving a separate report page.
3. **Defer:** retain its direct Markdown download and current compatibility view temporarily.
4. **Delete:** remove the browser view or duplicate projection once verified unused.

Retain Markdown as a first-class human/agent handoff, but make it concise and evidence-heavy. Remove generic suggested fixes and repetitive prose. JSON remains the browser/automation transport and need not preserve accidental legacy structure.

Exit criterion: every report has an intentional product disposition; no report remains merely because parity was interpreted as permanent preservation.

### Phase 5: delete compatibility HTML code

Use the following disposition for every current `src/html` module:

| Current module | Destination/disposition |
|---|---|
| `code-map-source-lines.ts` | Semantic calculations to server DTO projections; viewport/presentation calculations and JSX to source-line components |
| `code-map-paths.ts` | Grouping, labels, and snippets to server DTO projections; markup to finding-detail components |
| `code-map-finding-panel.ts` | Solid finding-detail components |
| `code-map-entry-panels.ts` | Server inventory/severity projections plus Solid inventory/detail components |
| `code-map-graphs.ts` | Solid SVG graph components plus pure graph layout/anchor helpers |
| `code-map.ts` | Delete after `CodeMap` composition is native JSX |
| `source-peek.ts` | Server snippet selector + Solid popover component |
| `markdown-to-html.ts` | Delete from browser path; markdown files remain direct downloads |
| `styles.ts`, `code-map-styles.ts` | Frontend CSS assets |
| `page.ts`, `escape.ts` | Delete; server errors use plain text/JSON and the static SPA shell handles pages |
| `*.d.mts` shims | Delete once TypeScript imports point at real modules |

Then:

1. Delete `src/server/render-pages.ts`, `src/server/network-viewers.ts`, and obsolete server view/url config after their pure constants/selectors have moved.
2. Remove the compatibility endpoints no longer used by the SPA, except documented markdown/JSON downloads.
3. Add lint/CI checks rejecting `innerHTML`, imports from deleted HTML modules, and HTML-string renderer names in frontend code.
4. Update README architecture and development commands.

Exit criterion: `src/html` no longer exists, server compilation excludes no browser-owned UI code, and the frontend bundle owns all rendered markup.

## Testing strategy

- **Pure unit tests:** Zod schemas and error paths, span ranges, comment classification, path grouping, view-model selectors, graph layout, and URL state.
- **API contract tests:** review scope, comparison states, workspace/file payloads, accepted report payloads, invalid inputs, caching, refresh, source-root containment, and Markdown availability.
- **Solid component tests:** comparison-aware overview, inventory/detail switching, working/error/empty states, graph nodes/links, and source peeks.
- **Browser tests:** the primary one-minute review journey, history/query orientation, code-map clicks, scrolling, copy, source peek placement, atomic refresh, and desktop layout.
- **Visual regression:** scoped/comparison overview, dense code map, multi-line finding, context/prop-relay, and graph families actually accepted for migration.
- **Performance checks:** representative 10K and 50K LOC projects in routine development; periodic 100K–200K LOC verification. Target 1–5 seconds for scoped analysis, under 10 seconds for a normal whole-project analysis, and immediate loaded interactions.
- **Build gates per phase:** `pnpm lint`, `pnpm typecheck`, focused tests, full `pnpm test`, and `pnpm build`.

Prefer semantic assertions over snapshots of whole HTML strings. Keep a small set of visual snapshots for layout-sensitive SVG and code-map behavior.

## Sequencing and pull requests

Keep each change deployable and validate the architecture through product-complete vertical slices:

1. PR 1: primary-journey coverage, performance baseline, report disposition, review-scope/comparison primitives.
2. PR 2: server split plus workspace/file/refresh contracts for the first vertical slice.
3. PR 3: Solid shell, scoped/comparison overview, data layer, CSS ownership, and atomic refresh.
4. PR 4: code-map source pane, ambient annotations, and unified inventory.
5. PR 5: code-map details, paths, peeks, selection state, and interaction cleanup.
6. PR 6: context/prop-relay workflow and only the reusable graph primitives it requires.
7. Later PRs: accepted supporting reports, ordered by product value; merge or retire the rest.
8. Final cleanup PR: delete `src/html`, dead server renderers, and obsolete compatibility code; update docs.

Temporary adapters are acceptable between PRs, but each one should be named `legacy` or carry a removal issue/phase so the intermediate architecture does not become permanent.

## Important decisions and risks

- **Do not send the raw full `AnalysisReport` by default.** It is an internal model, can be large, and makes the client tightly coupled. Use purpose-built DTOs.
- **Do not use Zod to bless raw analyzer objects as API payloads.** Schemas describe intentionally smaller transport DTOs assembled by server adapters.
- **Avoid double-maintained types.** Transport types come from `z.infer`; domain types remain independent where their shape or lifecycle differs.
- **Do not replace HTML strings with JSON fields containing HTML.** That preserves the same architecture under a different content type.
- **Do not keep markdown as the browser rendering protocol.** Markdown downloads are valuable; browser pages need structured data for interaction and type safety.
- **Keep graph layout deterministic.** Extract current layout math before porting SVG markup so visual changes are isolated.
- **Treat code-map state as the hard part.** Selection, multi-hit lines, filters, sort, path overlays, and peeks need high-value behavior tests before conversion. Scroll position and incidental disclosure state do not need restoration.
- **Make comparison a first-class product path.** Snapshot-only DTOs can render today's page but cannot answer whether a PR made the code worse.
- **Watch client cost, not byte count in isolation.** If workspace/file DTOs become large, add conditional fields or per-panel lazy endpoints only after representative measurements show parsing, memory, or rendering harm.
- **Preserve valuable CLI behavior.** Markdown is a human/agent handoff and should remain concise and evidence-heavy. JSON supports the browser and automation, but accidental legacy shapes are not compatibility promises without an identified consumer.
- **Do not confuse parity with value.** Reproducing every low-use report or incidental interaction can delay the code map while still satisfying architectural checklists.
- **Worktree caution.** The repository currently contains many uncommitted changes, including the server, frontend, and HTML modules. Implement the phases on top of a known checkpoint and avoid mixing this migration with unrelated analyzer edits.

## Definition of done

- `src/html` is deleted.
- No frontend component uses `innerHTML` or imports an HTML-string renderer.
- The Node server returns static assets, typed JSON, markdown downloads, health, and structured errors; it does not assemble application pages.
- Every browser-visible element and SVG is rendered by Solid components.
- The scoped/comparison overview answers whether the analyzed change introduced or worsened unnecessary complexity.
- The code map provides ambient prioritization and lets a user understand the path and source evidence without leaving the primary surface.
- Context/prop-relay analysis is fully explorable, especially context-derived values unnecessarily passed through props.
- Refresh preserves useful page/file/selection orientation when valid, keeps old results visible while working, and fails with actionable diagnostics.
- File scoping, source peeks, code-map interactions, and accepted Markdown report downloads retain valuable behavior.
- API DTOs are defined by Zod schemas, parsed on both server and client, tested, and smaller/stabler than `AnalysisReport`.
- `App.tsx` remains a small composition root, and the extracted route/component modules have clear product responsibilities rather than becoming new monoliths.
- Mobile-specific implementation and test baggage is removed.
- A scoped/unfamiliar-file review can identify, explain, and locate the most consequential problem within one minute.
- Lint, typecheck, unit/API/component/browser tests, and production build pass.
