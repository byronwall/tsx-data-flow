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

# structured output for scripting / baselines
tsx-dataflow --view dossier --format json --out .tsx-dataflow/dossier.json
```

For a non-standard layout, pass paths explicitly:

```bash
tsx-dataflow --source app/src --tsconfig app/tsconfig.json --view findings
```

## Options

| Option | Behavior |
| --- | --- |
| `--root <path>` | Project root. Defaults to the current working directory. |
| `--source <path>` | Source root. Defaults to `./src`, then `./app/src`, then the root. |
| `--tsconfig <path>` | TypeScript config. Defaults to the nearest `tsconfig.json`. |
| `--typescript-from <path>` | Extra directory used to resolve the `typescript` package. |
| `--format <json\|markdown>` | Output format. Defaults to `markdown`. |
| `--view <name>` | Report view (see below). Defaults to `work-packets`. |
| `--scope <text>` | Limit rows to a file, component, or symbol substring. |
| `--max-items <n>` | Bound displayed findings / graph rows. Defaults to 20. |
| `--baseline <path>` | Compare worst burden score against a prior JSON report. |
| `--fail-on-regression` | Exit non-zero only when the baseline comparison regresses. |
| `--out <path>` | Write the report to a file instead of stdout. |
| `--include-tests` | Include `*.test.*` and `*.spec.*` files. |
| `--help` | Show usage. |

## Views

| View | Purpose |
| --- | --- |
| `work-packets` | Ranked, implementation-ready items with scope, reason, representative path, candidate edits, and risk queue. |
| `findings` | Compact ranked findings for triage. |
| `repair-map` | Grouped quick-win, central-leverage, and investigation queues. |
| `prop-relay` | Prop pass-through and relay paths — best signal for broad prop bundles and missing context/store ownership. |
| `context-relay` | Same-feature children receiving shared-looking props from context-aware parents (Provider/Context completion audit). |
| `fan-out` | Sources that reach many render sinks. |
| `fan-in` | Sinks fed by many upstream inputs. |
| `defensive-ledger` | Nullish/default/logical defenses, including type-impossible ones. |
| `transformation-ledger` | Representation-only wrappers and conversions. |
| `path-gallery` | Representative source-to-sink paths. |
| `path-census` | Aggregate source/sink/path-depth counts. |
| `path-families` | Grouped path signatures. |
| `dossier` | Graph-oriented JSON (nodes, edges, traces, metrics, omitted counts). |

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
