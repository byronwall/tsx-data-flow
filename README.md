# tsx-data-flow

`tsx-dataflow` traces how values move through TypeScript/TSX UI code on their way
to JSX. It builds a typed graph from source expressions to render sinks, then
points at cleanup work worth inspecting: prop relay, fan-out and fan-in pressure,
repeated shape conversions, broad prop bundles, and state that may belong in a
feature-scoped store or context. It understands Solid and SolidStart patterns.

It uses the TypeScript compiler API directly, without another AST wrapper. That
lets it use the checked types—for example, to flag `value ?? "fallback"` when
TypeScript already proves that `value` cannot be nullish.

> The tool is **advisory**. A high rank means "look here first," not "make this
> edit blindly." Check the source before changing it.

## Project notes

- [TSX Data Flow project page](https://byroni.us/projects/tsx-data-flow)
- [Rebuilding TSX Data Flow around TypeScript and SolidJS](https://byroni.us/blog/typescript-solid-client-server-migration)
- [Making slow static analysis explain itself](https://byroni.us/blog/incremental-progress-for-static-analysis)

## Install

Install globally:

```bash
npm install -g tsx-data-flow
pnpm add -g tsx-data-flow
bun add -g tsx-data-flow
```

Or run without installing:

```bash
npx tsx-data-flow --help
pnpm dlx tsx-data-flow --help
bunx tsx-data-flow --help
```

Requires Node.js >= 18. The analyzer resolves `typescript` from the target project when present, and falls back to its own bundled copy otherwise. For unusual layouts you can point it at any TypeScript install with `--typescript-from <dir>`.

## Quick start

Run it from the root of the project you want to analyze. The analyzer discovers
`--source` and `--tsconfig` for the usual layouts: `./src`, then `./app/src`, and
the nearest `tsconfig.json` walking upward.

Monorepo discovery also follows project references from solution configs and
looks for referenced configs in subdirectories. The analyzer requires a valid
`tsconfig`. Falling back to non-strict compiler options would disable
`strictNullChecks` and make nullish-defense findings untrustworthy, so it fails
loudly and reports what it tried instead. For an unusual monorepo, point it at a
specific app config, such as `--tsconfig client/apps/web/tsconfig.json`, or run it
from that app's directory:

```bash
# ranked, implementation-ready work items (default view)
tsx-dataflow

# architectural triage, written to files
tsx-dataflow --view prop-relay --out .tsx-dataflow/prop-relay.md
tsx-dataflow --view fan-out    --out .tsx-dataflow/fan-out.md
tsx-dataflow --view overview   --out .tsx-dataflow/overview.md

# every view at once, one file per view in a directory
tsx-dataflow --view all --out .tsx-dataflow

# structured output for scripting / baselines
tsx-dataflow --view overview --format json --out .tsx-dataflow/overview.json
```

Every Markdown report ends with the exact command that regenerates it, so a report stays self-describing once it's detached from the shell that produced it.

For a non-standard layout, pass paths explicitly:

```bash
tsx-dataflow --source app/src --tsconfig app/tsconfig.json --view findings
```

## A small example

The checked-in [`examples/bad-ish-solid/`](examples/bad-ish-solid/) project is intentionally small but shaped like real TSX that has started to drift: a route shell packs props into route models, relays those bundles through children, rebuilds view models in rows and summaries, and keeps nullish fallbacks after the TypeScript types already prove some values are present.

Run the analyzer against it from this repo:

```bash
pnpm examples:regenerate
```

That command rewrites the representative reports in [`examples/bad-ish-solid/reports/`](examples/bad-ish-solid/reports/). A focused findings run looks like this:

```bash
pnpm tsx bin/tsx-dataflow.ts --root examples/bad-ish-solid --view findings --max-items 3
```

Sample output:

````markdown
# Render-Path Findings

## RPF-140-15 · HIGH · type-impossible defensive render path

src/DashboardShell.tsx:140

**Sink**

```
row.label ?? "Untitled"
```

**Source**

```text
props.task, props.actor, props.preferences, preferences.accentColor
```

**Metrics**

| Metric                 | Value |
| ---------------------- | ----- |
| path depth             | 14    |
| representation changes | 26    |
| defensive operations   | 16    |
| impossible defenses    | 1     |
| downstream sink count  | 31    |

**Finding**

A nullish fallback or optional access is unreachable under the checked TypeScript program.
````

For planning work, [`examples/bad-ish-solid/reports/work-packets.md`](examples/bad-ish-solid/reports/work-packets.md)
is probably the better starting point. It turns the same graph into ranked
cleanup packets with a representative source-to-sink path, candidate edits, and
a risk queue. The companion [`overview.md`](examples/bad-ish-solid/reports/overview.md),
[`prop-relay.md`](examples/bad-ish-solid/reports/prop-relay.md),
[`fan-out.md`](examples/bad-ish-solid/reports/fan-out.md), and
[`defensive-ledger.md`](examples/bad-ish-solid/reports/defensive-ledger.md) reports
show why this code may be ready for a feature-scoped store/context or thinner
component props.

## Options

| Option                      | Behavior                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--root <path>`             | Project root. Defaults to the current working directory.                                                                                                                        |
| `--source <path>`           | Source root. Defaults to `./src`, then `./app/src`, then the root.                                                                                                              |
| `--tsconfig <path>`         | TypeScript config. Auto-discovered (walk-up, solution-file expansion, monorepo scan). A valid config is required; the analyzer errors out instead of using non-strict defaults. |
| `--typescript-from <path>`  | Extra directory used to resolve the `typescript` package.                                                                                                                       |
| `--format <json\|markdown>` | Output format. Defaults to `markdown`.                                                                                                                                          |
| `--view <name>`             | Report view (see below), or `all` for every view. Defaults to `work-packets`.                                                                                                   |
| `--scope <text>`            | Limit rows to a file, component, or symbol substring.                                                                                                                           |
| `--max-items <n>`           | Bound displayed findings / graph rows. Defaults to 20.                                                                                                                          |
| `--sort <mode>`             | Selection lens for `work-packets`/`findings`: `burden` (default, worst-first), `spread` (per-file/feature caps), `coverage` (one per file, then fill), `quick-win`.             |
| `--spread`                  | Shorthand for `--sort spread`.                                                                                                                                                  |
| `--diversity <0..1>`        | MMR re-rank balancing burden against novelty (0 = pure burden, 1 = max spread). Overrides `--sort`.                                                                             |
| `--per-file <n>`            | Max items from one file in spread mode (default 2).                                                                                                                             |
| `--per-feature <n>`         | Max items from one feature area in spread mode (default 4).                                                                                                                     |
| `--units`                   | Collapse file-local sinks that share a cause into one work unit ("fix once, N sinks improve").                                                                                  |
| `--by <file\|feature>`      | Roll-up granularity for the `overview` breadth map. Defaults to `file`.                                                                                                         |
| `--baseline <path>`         | Compare worst burden score against a prior JSON report.                                                                                                                         |
| `--compare <dir>`           | Compare this run against a prior `--view all` report directory and emit a markdown before/after summary.                                                                        |
| `--fail-on-regression`      | Exit non-zero only when the baseline comparison regresses.                                                                                                                      |
| `--out <path>`              | Write the report to a file instead of stdout. With `--view all`, names a directory to fill with one file per view.                                                              |
| `--include-tests`           | Include `*.test.*` and `*.spec.*` files.                                                                                                                                        |
| `--help`                    | Show usage.                                                                                                                                                                     |

## Views

| View               | Purpose                                                                                                                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overview`         | Orientation report with the report guide, feature/file breadth map, repair buckets, unknown-edge diagnostics, concentration, and stop recommendation.                                                                                                                               |
| `work-packets`     | Ranked implementation items with grouped render recommendations, background findings, stop recommendation, scope, path, candidate edits, and risk.                                                                                                                                  |
| `findings`         | Compact ranked findings for triage.                                                                                                                                                                                                                                                 |
| `repeated-forks`   | Components that test the same discriminant across multiple sibling branch sites (ternary / `if` / `&&` / Solid `<Match>`/`<Show>`) — the "split into discriminated sub-components" smell, with fork sites, branch-exclusive eager computations, and the findings a split would fix. |
| `prop-relay`       | Prop pass-through and relay paths — best signal for broad prop bundles and missing context/store ownership.                                                                                                                                                                         |
| `context-relay`    | Same-feature children receiving shared-looking props from context-aware parents (Provider/Context completion audit).                                                                                                                                                                |
| `fan-out`          | Sources that reach many render sinks.                                                                                                                                                                                                                                               |
| `fan-in`           | Sinks fed by many upstream inputs.                                                                                                                                                                                                                                                  |
| `defensive-ledger` | Nullish/default/logical defenses, including type-impossible ones.                                                                                                                                                                                                                   |
| `path-families`    | Grouped path signatures.                                                                                                                                                                                                                                                            |
| `boundary-report`  | First-party functions on render paths, scored as data-flow boundaries (clean pipe / pass-through / leaky / junction / messy).                                                                                                                                                       |
| `junctions`        | Confluence functions where independent lineages fork in and re-spread — the load-bearing knots, with tributaries and distributaries.                                                                                                                                                |
| `inline-preview`   | Inline-vs-keep decision per helper: how the path changes if folded in, with a verdict (proposes, never rewrites).                                                                                                                                                                   |
| `component-refs`   | Where each component is used.                                                                                                                                                                                                                                                       |
| `all`              | Generate every view above in one run; pair with `--out <dir>` to write one file per view.                                                                                                                                                                                           |

### Cross-file tracing

By default the analyzer follows first-party imported helper calls into their
definition files, so render paths continue across module boundaries: the
representative path shows `↘ enter F2` / `↗ return` markers, each step carries an
`F#:line` backlink, and the `boundary-report`, `junctions`, and `inline-preview`
views light up. Hook/context accessors (`useX`) are kept opaque (they are
intentional feature boundaries). Use `--no-trace-helpers` for the fastest
single-file pass, or `--max-helper-depth <n>` (default 3) to tune how many import
boundaries are followed.

### Depth vs. breadth

`work-packets` ranks by descending burden, which surfaces the genuinely worst
sinks but **clusters**: a few heavy files can monopolize the list. To trade some
depth for breadth without losing the worst finding:

- `--units` collapses file-local sinks that share a cause (a packed object, or
  the same pivot + shape) into one packet — "fix once, N sinks improve" — so an
  inflated count of 7 sinks becomes the 2 real units behind them.
- `--spread` (or `--sort spread`) caps how many packets come from one file /
  feature; demoted siblings are not dropped but collapsed into a "still hot" note.
- `--diversity <0..1>` is the smooth version: a Maximal-Marginal-Relevance
  re-rank that defers redundant siblings (same file / shape / pivot).
- `--sort coverage` reaches one packet per file before filling by burden;
  `--sort quick-win` leads with peripheral, low-risk wins.
- `--view overview` includes the breadth **map**: one row per file (or `--by feature`),
  every place with a finding shown once, with a concentration footer. The same
  concentration summary heads `work-packets`.

The default stays `--sort burden` (today's exact ordering); everything above is
additive.

### Guidance quality

`work-packets` adds guidance so an agent does not overreact to a path that is
technically real but not worth changing:

- Feature clusters only recommend `Provider/Context audit` when the trace contains provider/context, feature-hook, or same-feature relay evidence. Local SVG/chart renderers fall back to local render-data guidance.
- Related SVG/collection sinks are grouped by rendered thing, such as `BarTick[]` or `BarRectangle[]`, so one cohesive extraction is visible above the individual findings.
- Extraction proposals use render-context names from JSX tags, attributes, and component names instead of generic analyzer names like `geometryModel` or `renderValue`.
- Optional Solid component prop defaults get Solid-specific guidance: repeated `props.foo ?? default` paths are reported as candidates for one `mergeProps(defaults, props)` boundary, while caller-precedence fallbacks remain keep-worthy API choices.
- Small named scalar helpers and healthy shared layout helpers move to `Background Findings`, with a short reason and a leave-it-alone action.
- `Stop Recommendation` says when the remaining local cleanup is likely counterproductive.

To compare a cleanup loop, keep both `--view all` directories and run:

```bash
tsx-dataflow --root . --file src/components/Chart.tsx --compare .tsx-dataflow-before --out .tsx-dataflow-compare.md
```

## Explore it in the browser

The same analysis is available as a local HTML UI. It builds the TypeScript
program once, then serves an overview of files ranked by burden and a focused
per-file page:

```bash
tsx-dataflow-serve --root . --port 4317 --open
# or, in this repo:
pnpm serve -- --root examples/bad-ish-solid --open
```

When developing the browser UI or server, pass analyzer options through the
combined dev command. The frontend runs with Vite HMR and the server restarts
when its source changes:

```bash
pnpm dev -- --root /absolute/path/to/another/project
```

Open `http://127.0.0.1:4173`. Changes in the analyzed project still require the
**↻ Re-analyze** action; dev watching applies to this package's frontend and
server source.

- **Overview** (`/`) — project summary plus searchable/sortable file rows (one
  row per file: finding count, worst burden, path depth, dominant shape,
  ownership, suggested first cut), each linking into its file. Query params are
  shareable: `q=<text>`, `filter=all|findings|unknown|participating`, and
  `sort=burden|findings|depth|file`.
- **Report assets** — accepted reports render as native Solid views at
  `/report?view=<name>` from `/api/reports/<name>` DTOs. Every view also retains
  `/api/report.<name>.md` as a raw Markdown handoff.
- **File view** (`/file?path=<rel>`) — a validated `/api/file?path=<rel>` payload
  drives the **annotated code map**: the file's source,
  line-numbered, with a colored gutter marker on each line that renders a ranked
  finding (color by queue: quick-win / central-leverage / investigation). Click a
  marked line to inspect its finding — sink, render context, burden, confidence,
  why it was selected, and its defenses. Lines on a representative path are
  faintly highlighted so the flow through the file is visible.
- `GET /api/workspace`, `GET /api/file?path=<rel>`, and
  `GET /api/reports/<name>` return versioned, Zod-validated DTOs. `POST
  /api/refresh` rebuilds after source edits while the prior result remains visible.

Accepts the same analyzer options as `tsx-dataflow` (`--root`, `--source`,
`--tsconfig`, `--scope`, `--max-items`, `--no-trace-helpers`, …) plus `--port`,
`--host`, and `--open`. The server exposes analyzer JSON, Markdown, and source
APIs to a built Solid SPA. Analyzer-domain objects are not browser contracts.
Production use requires the frontend assets produced
by `pnpm build:frontend`; `pnpm dev` runs them through Vite with HMR while
proxying analyzer requests to the server.

## Agent skill

This package ships an agent skill at [`skills/render-path-dataflow-work/`](skills/render-path-dataflow-work/SKILL.md) that turns analyzer output into bounded implementation work (triage → pick the worst grounded architectural problem → fix one ownership/relay slice → re-verify). Install it into a project's skills with the `npx skills` workflow:

```bash
npx skills add render-path-dataflow-work
```

(or copy the `skills/render-path-dataflow-work/` directory into your project's skills location.)

## How it works

A short tour: `parseArgs` → `loadTypescript` → `collectSourceFiles` → `ts.createProgram` → per-file sink discovery → upstream `traceExpression` → graph nodes/edges → metrics → ranking → report projection.

The full design — graph model, expression tracing, defense classification by the type checker, metrics, ranking/queues, and known limits — is documented in [`docs/analyzer.md`](docs/analyzer.md).

## Development

```bash
pnpm install
pnpm test        # vitest run
```

Source layout:

- `bin/tsx-dataflow.ts` — CLI entrypoint.
- `src/core.ts` — analysis facade.
- `test/**/*.test.ts` — fixture-based Vitest coverage.
- `docs/analyzer.md` — design and internals reference.
- `skills/` — installable agent skill.

## License

MIT
