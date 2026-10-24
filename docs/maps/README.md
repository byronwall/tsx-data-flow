# Code maps

Durable maps of what the code does and who uses it. These docs exist to support dead-code cleanup without losing the data-trajectory logic. Each map gives the commit it describes. Re-check a map against the code when it drifts.

| Map | Covers |
|---|---|
| [trajectory-pipeline.md](trajectory-pipeline.md) | How route data flow is analyzed: from route discovery, through program evidence, occurrence surface, evidence slice, bridges, and field proof, to the `/trajectories` DTO. Which of the three route-data models is live. |
| [frontend.md](frontend.md) | Pages, endpoints, navigation, the trajectories component tree, URL state, and which `RouteDataDetail` fields the UI actually reads. |
| [dead-code.md](dead-code.md) | Files and exports that no production entry point reaches, with a cleanup order. |

Regenerate the dead-code numbers with:

```bash
pnpm audit:dead-code
```

## System at a glance

```text
                ┌──────────── bin/tsx-dataflow.ts (CLI) ───────────────┐
                │  cli/args → core.analyzeProject → reports/markdown-* │
                │                                → reports/output      │
project/* ──► analysis/report-builder.buildReport ─────────────────────┤
 (tsconfig,     │  render-path analyzer: source-file, source-sinks,    │
  program)      │  source-trace*, trace-support, graph, ranking,       │
                │  work-units, pack-groups, helper-report,             │
                │  repeated-forks, component-refs, context-relay       │
                │  + route-data.analyzeRouteData (see trajectory map)  │
                └──────────────────────────────────────────────────────┘
                ┌──────── bin/tsx-dataflow-serve.ts → src/server-cli.ts ─────────┐
                │ server/routes → analysis-service → (worker) analysis-worker    │
                │   → cache (one report per generation)                          │
                │   → api/projections/{workspace,file-page,reports,route-data,   │
                │       route-totality*,context-continuity,semantic-map}         │
                │   → api/contracts (Zod) → JSON                                 │
                └────────────────────────────────────────────────────────────────┘
                ┌──────── src/frontend/src/App.tsx (Solid SPA) ──────────────────┐
                │ / Overview · /file Code map · /report · /map World map ·       │
                │ /trajectories Data trajectories                                │
                └────────────────────────────────────────────────────────────────┘
```

What each entry point reaches, from the import graph (`C` = CLI, `S` = server, `F` = frontend bundle):

| Reach | Modules |
|---|---|
| C S F | Almost all of `src/analysis` (the analyzer is shared). The frontend bundles some analysis modules through the `src/api/*-validation.ts` validators and through type imports. |
| C S | `src/core.ts`, `cli/args.ts`, `project/{discovery,tsconfig,typescript}.ts`, all `src/reports/*` Markdown/JSON/compare projections |
| C only | `bin/tsx-dataflow.ts`, `cli/help.ts`, `reports/output.ts` |
| S only | `src/server/*`, `src/server.ts`, `src/server-cli.ts`, `cli/server-flags.ts`, `api/projections/*` |
| S F | `api/contracts.ts`, `api/report-views.ts`, all `api/route-*-contracts.ts` and `*-validation.ts` |
| F only | `src/frontend/src/**` |

The CLI always builds route data too: `buildReport` calls `analyzeRouteData`, even though no Markdown view renders it. That is a cost to keep in mind for CLI speed. It would also be an easy cut if the CLI never needs route data.

## Two analyzers in one repo

1. **Render-path findings** (the original product; see [../analyzer.md](../analyzer.md)). It traces each JSX sink expression upstream through `source-trace*`, classifies defenses, ranks findings, and feeds the CLI Markdown views, the Overview, Code map, Report, and World map pages.
2. **Route data trajectories** (the newer product; see [trajectory-pipeline.md](trajectory-pipeline.md)). It builds program-wide evidence and walks one route from persisted source to render. It feeds only the `/trajectories` page. It reuses render-path findings only to attach them to totality nodes.
