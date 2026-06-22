# Handoff: Improve reporting & analysis quality of `tsx-dataflow`

**Goal for the next agent:** raise the *signal quality* of the analyzer's reports — fewer noisy/non-actionable rows, more trustworthy ranking, better-grounded metrics. This is a quality pass on an existing, working tool, **not** a rewrite.

## Orientation

`tsx-dataflow` is a static render-path data-flow analyzer for TS/TSX (Solid/SolidStart-aware). It builds a typed graph from source expressions to JSX render sinks and projects it into ranked reports.

- `bin/tsx-dataflow.mjs` — CLI entrypoint (thin; delegates to core).
- `src/core.mjs` — **all logic lives here** (~1600 lines): arg parsing, TS loading, tracing, metrics, ranking, and every view renderer.
- `test/core.test.mjs` — Vitest, fixture-based (`pnpm test`). 13 tests today.
- `docs/analyzer.md` — design reference. Read "Metrics", "Ranking And Queues", "Known Limits", and "Extension Points" before starting.
- `skills/render-path-dataflow-work/SKILL.md` — agent skill that consumes the output; its notion of a "good finding" is the spec for what reports *should* surface (prop relay, fan-out, missing context/store ownership; **not** tiny local parser/style churn).

Use **pnpm** for all dev commands. The tool is **advisory** — keep it low-dependency (TS compiler API only) and explainable; do not turn it into a full data-flow interpreter.

## Evidence: a real run against a foreign repo

We ran the full view matrix against `/Users/byronwall/repos/modeler/client/apps/modeler` (3,381 sinks, 1,592 sources, 2,186 unknown edges). Reports are reproducible into `tmp/evals/` (gitignored) — see "Validation" below. What that run exposed:

**Strong / trustworthy today** — preserve these:
- `prop-relay`, `fan-in`, `repair-map` consistently point at the same real hotspots (`model-viz/concept-link.tsx`, `tiles/histogram-chart.tsx` + `chart.tsx`, `inspector/*`).
- `context-relay` is the standout: only 3 hits repo-wide, all genuine same-feature prop bundles. Low-noise, high-signal. Use it as the quality bar.

**Weak / noisy today** — the work:
1. **`fan-out` ranks literal "sources".** Top rows were `props` (1350), then `0`, `false`, `""`, `[]`, `1`, `null` — none actionable. See `fanOutRows` (`src/core.mjs:1282`): it aggregates over `sink.roots` with no filtering of literal/primitive roots, and `props` is too coarse to be one "source."
2. **`path-families` is not discriminating.** 2,032 of ~3,300 paths collapse into a bare `jsx-sink` signature. See `signatureFor` (`src/core.mjs:1506`) — the signature alphabet is too small to separate trivial from architectural paths.
3. **Ranking rests on approximate metrics.** In `metricsFor` (`src/core.mjs:720`), `sourceDispersion === mergeWidth === roots.length` (lines 739-740) — they are the same number wearing two hats, yet both feed scoring independently. `centralityScore` (`src/core.mjs:1565`) uses a **constant base sink-reach** because true downstream reachability is never computed. `buildSinkRecord` hardcodes `reachable sinks: 1` (`src/core.mjs:856`).
4. **Queue thresholds are unvalidated magic numbers.** `queueFor` (`src/core.mjs:1545`): `sourceDispersion > 2 || maximumPathDepth > 10` → central-leverage. No grounding that these cutoffs match what the skill calls "worth fixing."

## Prioritized tasks

Do these as independent, separately-validated slices. After each, re-run the modeler eval and diff the relevant report.

**P1 — De-noise `fan-out` (highest leverage, lowest risk).**
- In `fanOutRows`, exclude roots that are literals/primitives (`0`, `false`, `""`, `[]`, `null`, numeric/string/boolean literal labels). The trace already distinguishes `source` vs `literal` node kinds — prefer filtering by node kind over string-matching labels.
- Decide what `props` should mean: a bare `props` root is too coarse. Consider keying fan-out on the *first concrete property read* (`props.meta`, `props.item`) rather than the parameter itself, or drop bare-parameter roots from the ranking.
- Acceptance: top `fan-out` rows on modeler are named domain values, not literals.

**P2 — Make `path-families` discriminating.**
- Enrich `signatureFor` so the dominant `jsx-sink` bucket splits by something meaningful (depth band, presence of defenses, component-boundary count). A family report where 60% of paths share one signature isn't telling anyone anything.
- Acceptance: no single family is >~35% of paths on modeler, and families map to recognizable shapes.

**P3 — Ground centrality in real reachability (biggest analysis win).**
- This is Extension Point #4 in `docs/analyzer.md`. Compute actual downstream sink reach per source from the graph instead of the constant in `centralityScore` and the hardcoded `reachable sinks: 1` in `buildSinkRecord`.
- Then separate `sourceDispersion` from `mergeWidth` so they stop being the same value (`metricsFor:739`).
- Acceptance: `reachable sinks` varies across work packets; a source feeding many sinks outranks an equally-deep but isolated one.

**P4 — Validate / calibrate queue thresholds.**
- Once P3 lands, revisit `queueFor` cutoffs against the skill's definition of high-leverage work. Document *why* each threshold is what it is, or make them relative (percentile) rather than absolute.

## Validation protocol

For every change:

```bash
pnpm test                       # must stay green; add tests for new behavior

# Re-run the foreign-repo eval and eyeball the diff
ROOT=/Users/byronwall/repos/modeler/client/apps/modeler
node bin/tsx-dataflow.mjs --root "$ROOT" --view fan-out       --out tmp/evals/fan-out.md
node bin/tsx-dataflow.mjs --root "$ROOT" --view path-families --out tmp/evals/path-families.md
node bin/tsx-dataflow.mjs --root "$ROOT" --view work-packets  --out tmp/evals/work-packets.md
node bin/tsx-dataflow.mjs --root "$ROOT" --view repair-map    --out tmp/evals/repair-map.md
```

- **Add a test per change** in `test/core.test.mjs`. The existing fixtures show the pattern (`createFixtureProject`). For fan-out de-noising, add a fixture with a literal-heavy component and assert literals don't appear as top sources.
- The `--baseline <json>` / `--fail-on-regression` flags exist for burden-score regression checks — capture a JSON baseline before a ranking change and compare after.
- Spot-check at least one changed ranking against the actual modeler source to confirm the new order is *more* right, not just different.

## Constraints / guardrails

- Keep it **advisory and low-dependency** — TypeScript compiler API only, no new runtime deps.
- Don't break the views that already work well (`prop-relay`, `context-relay`, `fan-in`).
- Don't over-fit to modeler; it's one sample. Use the fixture tests as the correctness anchor and modeler as a smell test.
- Output must stay valid Markdown / JSON (`tableReport` escaping already handles multi-line/pipe content).
- The `ts` unused-binding warnings at `src/core.mjs:~647,~697` are pre-existing and harmless; fix only if you touch those functions.
