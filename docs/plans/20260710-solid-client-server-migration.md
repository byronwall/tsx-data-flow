# Solid client/server migration plan

## Objective

Replace the remaining string-based HTML generation with a conventional architecture:

- the Node server owns analysis, caching, filesystem access, validation, and typed JSON/markdown APIs;
- the SolidJS application owns all browser-visible markup, state, navigation, and interaction;
- shared modules contain Zod-defined transport contracts, serializable domain/view-model types, and pure selectors, never HTML strings or DOM access;
- `src/html` is deleted when the Solid implementation reaches parity.

This is a migration, not a redesign. Preserve the current routes, URLs, report downloads, code-map behavior, and visual language unless a phase explicitly changes a contract.

## Current state

The app already serves a Vite-built Solid SPA for `/`, `/file`, and `/report`, but the conversion is incomplete:

- `src/frontend/src/App.tsx` is a 2,032-line component that mixes routing, fetching, selectors, view models, SVG string generation, and DOM event delegation.
- The frontend imports `STYLE`, `renderCodeMap`, graph renderers, and `markdownToHtml` from `src/html`.
- Code maps, network viewers, and markdown reports are inserted through `innerHTML`; Solid is acting as a shell around generated HTML.
- `/api/report.json` returns an ad hoc projection but the frontend types it as a full `AnalysisReport`, so the transport contract is not explicit or type-safe.
- Overview and fan-out selectors are duplicated between the frontend, reports, and the older server-rendering modules.
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

Recommended source layout:

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

Do not introduce SolidStart or server-side rendering for this migration. The existing Node HTTP server plus a client-rendered Vite/Solid app is the smallest conventional client/server architecture for this product.

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
3. **Browser state types** describe selection, filters, sort choice, pagination, open popovers, URL state, and responsive layout. They are not serialized by the server.

The current `/api/report.json` violates this boundary: it sends an ad hoc subset of `AnalysisReport`, while the frontend asserts the response is the full inferred `AnalysisReport`. Replace that endpoint rather than formalizing its accidental shape.

Apply these rules to every transport schema:

- use strict Zod objects so analyzer additions do not leak into responses;
- use finite enums and discriminated unions for categorical fields instead of broad `string` values;
- make fields required when components require them, even if the adapter must translate an analyzer `undefined` into a deliberate value or `null`;
- use `null` for known absence and omission only when a field is inapplicable to a discriminated-union variant;
- do not expose index signatures such as `[key: string]: unknown`;
- call workspace-relative filenames `path` consistently; reserve `file` for analyzer-internal compatibility;
- treat IDs as opaque and stable within one cache generation;
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
- focus, scroll, measurement, clipboard behavior, and responsive graph geometry;
- rendering semantic DTOs as DOM and SVG.

Create explicit pure builders such as `buildWorkspaceDto`, `buildFilePageDto`, `buildFindingsReportDto`, `buildFanInReportDto`, and `buildPropRelayReportDto` under `src/api/projections` or `src/reports/view-models`. The API adapters invoke these builders and validate the result. Shared report/markdown code may reuse genuinely presentation-independent selectors, but the frontend must not reconstruct these projections from sinks.

### Workspace endpoint

`GET /api/workspace`

Returns the summary cards, concentration, file rows, per-file entry counts, graph-participation flags, and workspace metadata. Filtering, sorting, and pagination can remain client-side initially because the full report is already loaded and expected project sizes are local-tool scale. The response should contain prepared rows, not require the client to recreate analyzer/report selectors.

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

This replaces the current three-request combination of file report, full report, and source. Validate that the resolved path remains under the analyzed root and return structured 400/404 errors.

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

Each selectable report item includes a stable ID, label, picker label/metric, and semantic graph or row data. It does not include `active`, `href`, CSS classes, or SVG coordinates: those depend on browser state or responsive presentation.

### Refresh endpoint

`POST /api/refresh`

Return JSON with a cache generation/version after rebuilding. The client invalidates active resources and shows progress/errors without a server redirect. Keep the legacy `/refresh` redirect temporarily for bookmarked/form compatibility, then remove it after the SPA no longer posts forms to it.

### Error shape

All JSON endpoints return a common `{ error: { code, message, details? } }` shape. Add a small client wrapper that checks status and content type instead of assuming every response succeeds.

## Migration phases

### Phase 0: freeze behavior and expose the seam

1. Record route/API behavior for `/`, `/file`, `/report`, markdown downloads, refresh, assets, and unknown SPA routes.
2. Add browser/component tests for the current overview, report tabs, file tabs, code-map selection, URL restoration, filters/sorts, source peeks, graph selection, and refresh.
3. Add a dependency rule: frontend code may import transport schemas/types from `src/api` and explicitly designated browser-state/URL modules, but not analyzer/domain types from `src/types`, server projection builders, `src/html`, or `src/server`.
4. Mark `src/server/render-pages.ts` and `src/server/network-viewers.ts` as deletion candidates; verify no package export or external consumer relies on them.

Exit criterion: behavior is covered well enough that generated HTML can be replaced without visual/string snapshots being the only oracle.

### Phase 1: establish typed server contracts

1. Add Zod as a runtime dependency and define shared schemas under `src/api`. Export DTO types with `z.infer`; do not duplicate schema shapes as handwritten interfaces.
2. Implement server-side projection builders for workspace rows, file inventory/details, and every report union variant; test them independently from HTTP routing.
3. Split `src/server.ts` into cache, route, response, and API adapter modules while keeping `createServer` as the public facade.
4. Add `/api/workspace`, `/api/file`, `/api/reports/:view`, and JSON refresh.
5. Keep existing endpoints as compatibility adapters until the Solid pages have switched.
6. Parse outgoing DTOs with their Zod schemas and parse incoming request parameters with dedicated request schemas.
7. Add contract tests that assert successful schema parsing, rejected malformed payloads/parameters, status, content type, required fields, file scoping, invalid view handling, invalid paths, cache invalidation, and error shapes.

Exit criterion: the UI can be rebuilt using JSON alone; no new endpoint returns HTML fragments.

### Phase 2: split the Solid shell and data layer

1. Break `App.tsx` into route components (`OverviewPage`, `ReportPage`, `FilePage`) and reusable shell/tab/popover components.
2. Move URL parsing/building to shared pure modules. Preserve query parameters and back/forward behavior.
3. Add an `api-client.ts` that accepts a Zod schema per request and returns only parsed data, plus resource factories, loading/empty/error components, and refresh invalidation.
4. Move CSS from `src/html/styles.ts` and `src/html/code-map-styles.ts` into frontend CSS files imported by Vite. Remove runtime `<style>` injection.
5. Keep navigation client-side; use normal anchors so open-in-new-tab and fallback semantics still work.

Exit criterion: shell, overview, tabs, loading, errors, and refresh are ordinary Solid components and the frontend no longer imports HTML shell/style modules.

### Phase 3: replace markdown-driven browser reports

1. Build a `ReportView` dispatcher over the discriminated report DTO.
2. Implement structured Solid components for findings, repeated forks, work packets, path families, defensive ledger, context relay, inline preview, and component references.
3. Implement the five network views (fan-out, fan-in, boundary, junctions, prop relay) from graph DTOs using Solid `<svg>` elements.
4. Retain the Markdown button and markdown endpoints, but remove `markdownToHtml` and all report `innerHTML` use from the SPA.
5. Give duplicated concerns one explicit owner: server projections own semantic labels, stable IDs, qualification, and default ordering; browser modules own URL parameters, selected IDs, and user-selected sort application.

Exit criterion: `/report` and file report tabs render solely from structured JSON and JSX.

### Phase 4: convert the code map

Convert the code map incrementally because it contains the most behavior and carries the highest regression risk.

1. **Server projection model:** move `touchedLines`, span slicing, burden hue inputs, comment classification, path grouping, severity, inventory ordering keys, and snippet selection into pure server-side DTO builders. They return schema-validated semantic data, never escaped HTML. Keep only responsive geometry and DOM-specific presentation calculations in the frontend.
2. **Source pane:** implement line, gutter, hit-span, heat, multi-line span, and comment components in JSX.
3. **Inventory:** implement finding/fork/boundary/junction/relay/unknown/fan-out rows with Solid signals for filter, sort, and selection.
4. **Details:** port finding details, path tables, defenses, representation/reach/same-code sections, debug payload, and copy behavior into components.
5. **Cross-file source peeks:** return snippet data from the server and render accessible popovers in Solid; remove cloned portal markup and manual string substitution.
6. **Selection and URL state:** replace delegated DOM querying/class mutation with keyed state (`selectedFindingIds`, `sort`, `filter`, `line`) and derived `classList`/`Show` rendering. Keep imperative DOM only for focus, measurement, scroll, and clipboard fallbacks.
7. **Graphs:** reuse the graph DTO/components from Phase 3 inside file inventory/detail views.

Exit criterion: `CodeMap` contains no `innerHTML`, generated markup, DOM-driven source of truth, or imports from `src/html`.

### Phase 5: delete compatibility HTML code

Use the following disposition for every current `src/html` module:

| Current module | Destination/disposition |
|---|---|
| `code-map-source-lines.ts` | Semantic calculations to server DTO projections; responsive/presentation calculations and JSX to source-line components |
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
- **API contract tests:** workspace/file/report payloads, invalid inputs, caching, refresh, source-root containment, markdown compatibility.
- **Solid component tests:** report tables, inventory/detail switching, loading/error/empty states, graph nodes/links, accessible popovers.
- **Browser tests:** deep links, history navigation, query state, code-map clicks, scrolling, copy, source peek placement, refresh, desktop/mobile layout.
- **Visual regression:** overview, representative markdown-replacement reports, dense code map, multi-line finding, and each graph family.
- **Build gates per phase:** `pnpm lint`, `pnpm typecheck`, focused tests, full `pnpm test`, and `pnpm build`.

Prefer semantic assertions over snapshots of whole HTML strings. Keep a small set of visual snapshots for layout-sensitive SVG and code-map behavior.

## Sequencing and pull requests

Keep each change deployable and avoid a flag day:

1. PR 1: behavior coverage, DTO definitions, and API contracts.
2. PR 2: server module split and new JSON endpoints.
3. PR 3: Solid shell/overview/data layer and CSS ownership.
4. PR 4: structured report components.
5. PR 5: Solid network graph components.
6. PR 6: code-map source pane and inventory.
7. PR 7: code-map details, peeks, and interaction cleanup.
8. PR 8: delete `src/html`, dead server renderers, and compatibility code; update docs.

Temporary adapters are acceptable between PRs, but each one should be named `legacy` or carry a removal issue/phase so the intermediate architecture does not become permanent.

## Important decisions and risks

- **Do not send the raw full `AnalysisReport` by default.** It is an internal model, can be large, and makes the client tightly coupled. Use purpose-built DTOs.
- **Do not use Zod to bless raw analyzer objects as API payloads.** Schemas describe intentionally smaller transport DTOs assembled by server adapters.
- **Avoid double-maintained types.** Transport types come from `z.infer`; domain types remain independent where their shape or lifecycle differs.
- **Do not replace HTML strings with JSON fields containing HTML.** That preserves the same architecture under a different content type.
- **Do not keep markdown as the browser rendering protocol.** Markdown downloads are valuable; browser pages need structured data for interaction and type safety.
- **Keep graph layout deterministic.** Extract current layout math before porting SVG markup so visual changes are isolated.
- **Treat code-map state as the hard part.** Selection, multi-hit lines, filters, sort, path overlays, peeks, and scroll restoration need parity tests before conversion.
- **Watch payload size.** If workspace/file DTOs become large, add conditional fields or per-panel lazy endpoints based on measurements, not preemptive fragmentation.
- **Preserve CLI behavior.** `src/reports` markdown and JSON output are separate product surfaces and should not become dependent on Solid or browser DTOs.
- **Worktree caution.** The repository currently contains many uncommitted changes, including the server, frontend, and HTML modules. Implement the phases on top of a known checkpoint and avoid mixing this migration with unrelated analyzer edits.

## Definition of done

- `src/html` is deleted.
- No frontend component uses `innerHTML` or imports an HTML-string renderer.
- The Node server returns static assets, typed JSON, markdown downloads, health, and structured errors; it does not assemble application pages.
- Every browser-visible element and SVG is rendered by Solid components.
- Refresh, deep links, query state, browser history, file scoping, source peeks, code-map interactions, and report downloads retain behavior.
- API DTOs are defined by Zod schemas, parsed on both server and client, tested, and smaller/stabler than `AnalysisReport`.
- `App.tsx` is a small composition root rather than the owner of the entire UI.
- Lint, typecheck, unit/API/component/browser tests, and production build pass.
