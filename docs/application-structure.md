# Application structure

The repository is a TypeScript render-path analyzer, CLI/Markdown reporting layer, local Node API, and client-rendered Solid workspace. Data flows in one direction:

```text
project loading -> analysis domain -> server projections -> Zod DTOs -> Solid DOM/SVG
                                \-> Markdown/CLI
```

## Boundaries

- `src/project` owns discovery, tsconfig resolution, and TypeScript programs.
- `src/analysis` owns tracing, graphs, findings, comparison, and analyzer-domain objects.
- `src/reports` owns Markdown/CLI projections and reusable server-side selectors.
- `src/api/contracts.ts` is the transport source of truth. DTO types are inferred from strict Zod schemas.
- `src/api/projections` converts analyzer objects into semantic workspace, file, and report DTOs. It never emits HTML, CSS classes, URLs, or SVG coordinates.
- `src/server` owns cache generations, source containment, API adapters, and HTTP responses. `src/server.ts` is the public composition facade.
- `src/frontend/src` owns all browser-visible DOM/SVG, navigation, selection, filtering, sorting, focus, scrolling, and clipboard behavior.

The analyzer model, transport model, and browser state are separate type families. Frontend code may import API schemas/types and browser modules, but never `src/types`, `src/analysis`, `src/server`, or HTML-string renderers. ESLint enforces this boundary and rejects `innerHTML`.

## API surface

- `GET /api/workspace` — scoped overview, comparison summary, prepared file rows.
- `GET /api/file?path=<relative>` — source lines/annotations, unified inventory, finding details, snippets, and debug payloads.
- `GET /api/reports/:view?path=<relative?>` — one concrete structured report DTO per accepted view; merged views point users to the file explorer.
- `POST /api/refresh` — atomic cache rebuild and generation response.
- `GET /api/report.:view.md` — Markdown handoff for humans and agents.
- `/`, `/file`, `/report`, `/assets/*`, and `/healthz` — SPA/static/health routes.

Legacy `/api/report.json`, `/api/source`, `/refresh`, server page renderers, and `src/html` are intentionally removed.

## Frontend ownership

- `App.tsx` — history-aware router/bootstrap.
- `Layout.tsx` — persistent shell and tabs.
- `OverviewPage.tsx` — thin workspace resource/orchestration root; controls and results live under `overview/`.
- `FilePage.tsx` — file/report resources and atomic refresh.
- `CodeMap.tsx` — selection and source navigation; source, inventory, and details live under `code-map/`.
- `ReportPage.tsx` — structured report selection; semantic SVG lives under `reports/`.
- `api.ts` — status/content-type checking and client-side schema parsing.
- `style.css` — all browser styling.

Browser-only effects are created in lifecycle scopes and cleaned up by their owner. Initial structure must be deterministic; viewport, time, randomness, and DOM availability do not choose render branches.

## Change checklist

- Keep routes thin and pure shaping outside JSX.
- Keep timers, listeners, observers, and subscriptions with explicit cleanup ownership.
- Treat 300 lines as a review signal and 400 as a strong extraction signal.
- Use direct imports; do not add barrels.
- Validate every server response and every client response with its Zod schema.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
