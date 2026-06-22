# tsx-data-flow

`tsx-dataflow` is a static **render-path data-flow analyzer** for TypeScript/TSX UI code, with first-class awareness of Solid / SolidStart patterns. It builds a typed interprocedural graph from source expressions to JSX render sinks and ranks the highest-leverage cleanup work: prop relay, fan-out/fan-in pressure, repeated object/shape conversions, broad prop bundles, and state that should be owned by a feature-scoped store/context.

It uses the TypeScript compiler API directly (no extra AST wrapper) so it can reason about types — for example flagging a `?? "fallback"` defense on a value the compiler already proves is non-nullable.

> The tool is **advisory**. Every high-ranked item is candidate evidence; spot-check against source before editing.

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

Run it from the root of the project you want to analyze. `--source` and `--tsconfig` are auto-discovered (`./src` then `./app/src`; nearest `tsconfig.json`):

```bash
# ranked, implementation-ready work items (default view)
tsx-dataflow

# architectural triage, written to files
tsx-dataflow --view prop-relay --out .tsx-dataflow/prop-relay.md
tsx-dataflow --view fan-out    --out .tsx-dataflow/fan-out.md
tsx-dataflow --view repair-map --out .tsx-dataflow/repair-map.md

# every view at once, one file per view in a directory
tsx-dataflow --view all --out .tsx-dataflow

# structured output for scripting / baselines
tsx-dataflow --view dossier --format json --out .tsx-dataflow/dossier.json
```

Every Markdown report ends with the exact command that regenerates it, so a report stays self-describing once it's detached from the shell that produced it.

For a non-standard layout, pass paths explicitly:

```bash
tsx-dataflow --source app/src --tsconfig app/tsconfig.json --view findings
```

## Toy Example

The checked-in [`examples/bad-ish-solid/`](examples/bad-ish-solid/) project is intentionally small but shaped like real TSX that has started to drift: a route shell packs props into route models, relays those bundles through children, rebuilds view models in rows and summaries, and keeps nullish fallbacks after the TypeScript types already prove some values are present.

Run the analyzer against it from this repo:

```bash
pnpm examples:regenerate
```

That command rewrites the representative reports in [`examples/bad-ish-solid/reports/`](examples/bad-ish-solid/reports/). A focused findings run looks like this:

```bash
node bin/tsx-dataflow.mjs --root examples/bad-ish-solid --view findings --max-items 3
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

The more useful view for planning work is [`examples/bad-ish-solid/reports/work-packets.md`](examples/bad-ish-solid/reports/work-packets.md): it turns the same graph into ranked cleanup packets with a representative source-to-sink path, candidate edits, and risk queue. The companion [`prop-relay.md`](examples/bad-ish-solid/reports/prop-relay.md), [`fan-out.md`](examples/bad-ish-solid/reports/fan-out.md), [`defensive-ledger.md`](examples/bad-ish-solid/reports/defensive-ledger.md), and [`repair-map.md`](examples/bad-ish-solid/reports/repair-map.md) reports show why that code would be a good target for introducing a feature-scoped store/context or thinner component props.

## Options

| Option                      | Behavior                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--root <path>`             | Project root. Defaults to the current working directory.                                                           |
| `--source <path>`           | Source root. Defaults to `./src`, then `./app/src`, then the root.                                                 |
| `--tsconfig <path>`         | TypeScript config. Defaults to the nearest `tsconfig.json`.                                                        |
| `--typescript-from <path>`  | Extra directory used to resolve the `typescript` package.                                                          |
| `--format <json\|markdown>` | Output format. Defaults to `markdown`.                                                                             |
| `--view <name>`             | Report view (see below), or `all` for every view. Defaults to `work-packets`.                                      |
| `--scope <text>`            | Limit rows to a file, component, or symbol substring.                                                              |
| `--max-items <n>`           | Bound displayed findings / graph rows. Defaults to 20.                                                             |
| `--sort <mode>`             | Selection lens for `work-packets`/`findings`: `burden` (default, worst-first), `spread` (per-file/feature caps), `coverage` (one per file, then fill), `quick-win`. |
| `--spread`                  | Shorthand for `--sort spread`.                                                                                     |
| `--diversity <0..1>`        | MMR re-rank balancing burden against novelty (0 = pure burden, 1 = max spread). Overrides `--sort`.               |
| `--per-file <n>`            | Max items from one file in spread mode (default 2).                                                                |
| `--per-feature <n>`         | Max items from one feature area in spread mode (default 4).                                                        |
| `--units`                   | Collapse file-local sinks that share a cause into one work unit ("fix once, N sinks improve").                     |
| `--by <file\|feature>`      | Roll-up granularity for the `hotspots` view. Defaults to `file`.                                                   |
| `--baseline <path>`         | Compare worst burden score against a prior JSON report.                                                            |
| `--fail-on-regression`      | Exit non-zero only when the baseline comparison regresses.                                                         |
| `--out <path>`              | Write the report to a file instead of stdout. With `--view all`, names a directory to fill with one file per view. |
| `--include-tests`           | Include `*.test.*` and `*.spec.*` files.                                                                           |
| `--help`                    | Show usage.                                                                                                        |

## Views

| View                    | Purpose                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `work-packets`          | Ranked, implementation-ready items with scope, reason, representative path, candidate edits, and risk queue.         |
| `findings`              | Compact ranked findings for triage.                                                                                  |
| `repair-map`            | Grouped quick-win, central-leverage, and investigation queues.                                                       |
| `prop-relay`            | Prop pass-through and relay paths — best signal for broad prop bundles and missing context/store ownership.          |
| `context-relay`         | Same-feature children receiving shared-looking props from context-aware parents (Provider/Context completion audit). |
| `fan-out`               | Sources that reach many render sinks.                                                                                |
| `fan-in`                | Sinks fed by many upstream inputs.                                                                                   |
| `defensive-ledger`      | Nullish/default/logical defenses, including type-impossible ones.                                                    |
| `transformation-ledger` | Representation-only wrappers and conversions.                                                                        |
| `path-gallery`          | Representative source-to-sink paths.                                                                                 |
| `path-census`           | Aggregate source/sink/path-depth counts.                                                                             |
| `path-families`         | Grouped path signatures.                                                                                             |
| `boundary-report`       | First-party functions on render paths, scored as data-flow boundaries (clean pipe / pass-through / leaky / junction / messy). |
| `junctions`             | Confluence functions where independent lineages fork in and re-spread — the load-bearing knots, with tributaries and distributaries. |
| `inline-preview`        | Inline-vs-keep decision per helper: how the path changes if folded in, with a verdict (proposes, never rewrites).    |
| `dossier`               | Graph-oriented JSON (nodes, edges, traces, metrics, omitted counts).                                                 |
| `hotspots` (`coverage`) | Breadth map: one row per file (or `--by feature`) with finding count, worst burden, dominant shape/ownership, and a suggested first cut, plus a concentration footer. |
| `all`                   | Generate every view above in one run; pair with `--out <dir>` to write one file per view.                            |

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
- `--view hotspots` is the breadth **map**: one row per file (or `--by feature`),
  every place with a finding shown once, with a concentration footer. The same
  concentration summary heads `work-packets` and `repair-map`.

The default stays `--sort burden` (today's exact ordering); everything above is
additive.

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

- `bin/tsx-dataflow.mjs` — CLI entrypoint.
- `src/core.mjs` — all analysis behavior.
- `test/core.test.mjs` — fixture-based Vitest coverage.
- `docs/analyzer.md` — design and internals reference.
- `skills/` — installable agent skill.

## License

MIT
