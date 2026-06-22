# Plan: Cross-File Tracing & Function-Boundary Disentangling

## Goal

Turn `tsx-dataflow` from a *single-file* render-path analyzer into one that can
follow data flow **through helper functions across files**, and — more
importantly — reason about functions as **boundaries**: is a given function a
clean pipe, a leaky wrapper, a thin pass-through worth inlining, or a
**confluence** where several messy lineages fork in and re-spread out?

Two opposing refactors fall out of that question, and the tool should name both:

- **EXTRACT** — a messy inline region should become a *clean named helper* with a
  narrow typed signature. (We already mark extraction boundaries; this makes them
  actionable.)
- **INLINE** — a helper that only adds indirection (a thin pass-through, or a
  one-caller wrapper) should be folded back in so the logic lives in one place.

The connective tissue is a **cross-file trace** plus a **per-function boundary
model**. Everything below builds on those two.

---

## Where we are today (grounding)

The tracer is per-file. `analyzeSourceFile` builds a `buildFileContext` for one
`SourceFile` (its `functions`, `variables`, `accessors`, `parameters`) and traces
sink expressions against *only* that context. In `traceCallExpression`:

- If the callee is a **local** function (`context.functions.has(callee)`), we
  trace into its return expression — its body steps appear on the path, and the
  step gets a `— returns <body>` gloss.
- If the callee is **imported / unknown**, we emit a single `helper` step at the
  call site (current file) with the full call as its detail, and **stop**. We
  never open the other file.

Consequence (confirmed against the modeler corpus): every representative path is
one file, so the `F#` legend always shows just `F1`. The multi-file machinery
(`F2`/`F3`, the `Files:` legend) is wired but never lights up.

You can already *see* the boundary in the output: a local helper shows
`— returns <body>`; an imported one shows only `— <the call as written>`. That
"call as written, body unknown" step is exactly the seam we want to cut open.

Relevant primitives we'll reuse or extend:

- `traceExpression` / `addOperationTrace` / `sourceTrace` — node + step builders;
  each step already carries `{label, kind, detail, file, line}`.
- `metricsFor(trace)` — depth, `helperHops`, `representationChurn`,
  `defensiveOperationCount`, `impossibleDefenseCount`, `controlDependencyCount`,
  `mergeWidth`, `reachableSinks`, `unknownEdgeCount`.
- `classifyPathShape`, `candidateEditsFor`, `extractionBoundariesFor`,
  `computePackGroups` — shape + suggestion layer.
- `program.getTypeChecker()` — already available; project-wide, every file loaded.

---

## Shared enabler: cross-file trace expansion

This is the foundation for Approaches 1–5. It is one focused change to the tracer.

**Resolve the callee to its definition.** In `traceCallExpression`, when the
callee is not local, use the checker instead of giving up:

```js
const sym = checker.getSymbolAtLocation(calleeIdentifier);
const resolved = sym && (sym.flags & ts.SymbolFlags.Alias)
  ? checker.getAliasedSymbol(sym)   // follow `import { groupBarSeries }`
  : sym;
const decl = resolved?.declarations?.find(isTraceableFunction); // fn decl / arrow / fn-valued const
const defFile = decl?.getSourceFile();
```

**Gate it to first-party code.** Only descend when `defFile` is inside
`args.source` (or `args.root`) and not a `.d.ts` / `node_modules` file. Framework
and library calls stay opaque (current behavior) — we do not want paths diving
into Solid internals. A small allow/deny on module specifier prefixes makes this
tunable.

**Bind arguments to parameters.** This is the crux that makes the cross-file
trace a real data-flow continuation rather than two disconnected traces. When we
enter `groupBarSeries(rows(), xField(), …)`, build:

```js
paramBindings = new Map([
  ["rows",   traceExpression(arg0, callerContext)],
  ["xField", traceExpression(arg1, callerContext)],
  ...
]);
```

Then trace the helper's **return expression** under a context for `defFile`
whose `traceIdentifier` checks `paramBindings` first: a reference to the param
`rows` inside the body resolves to the *caller's* `rows()` trace. That stitches
the lineage across the boundary — the marked-`« »` flow now continues into F2.

**Tagging is free.** Nodes created while tracing inside the body call
`expression.getSourceFile()` → they already get the helper's file/line, so the
existing `F#` legend and `F1:line` column light up with no renderer changes.

**Guards.**
- `crossFileDepth` in context, capped (default 3) — a `--max-helper-depth` flag.
- A `visitedFunctions` set (by symbol) to stop recursion / mutual recursion.
- Memoize `buildFileContext` per `SourceFile` (today it's rebuilt per file; cache
  by `fileName` so descending into the same util file N times is cheap).
- Keep the per-expression `stack` cycle guard; add the function-level one.

**New per-helper record** (consumed by Approaches 2–5). While descending, capture
for each entered function:

```js
{
  name, file, line,
  arity,                       // params.length
  inSources,                   // distinct external roots reaching its return
  callerCount,                 // count of call sites across analyzed files
  internalDepth, internalChurn, internalDefenses, internalImpossible,
  returnType,                  // checker.typeToString(return type)
  paramTypes,                  // for the proposed-signature feature
  passThrough,                 // body is a single forwarding expression
  typeLeak,                    // return/params include any|unknown|wide union
}
```

Attach the list to the report as `report.helpers` (sibling of `report.packGroups`).

**Surface (Approach-independent):** a `--trace-helpers` flag (default on for the
work-packets/path views, off for the cheap table views) plus the depth cap. This
keeps the cheap views cheap and the deep views deep.

---

## Approach 1 — Expand the representative path through helpers (blend into existing)

**Blends into:** `work-packets`, `path-gallery`, `transformation-ledger`.

**Idea.** The representative path already renders beautifully; cross-file tracing
just makes it *continue* past imported helpers, with explicit enter/return
markers and the `F2:` file backlinks doing the "where am I now" work. A clean
boundary shows as a short, self-contained F2 detour that returns one value; a
messy one shows the chain sprawling deeper into F2/F3.

**What changes.** `representativePathWithBoundaries` already groups by file id.
Add two synthetic marker rows when the file changes: `↘ enter <call>` and
`↗ return`, indented to the call's depth, so the jump is legible.

**Why it disentangles.** You see, inline, whether the other side of a helper is
"one clean step then back" (good boundary — stop worrying) or "20 more steps in
two more files" (the mess just moved). It directly answers *"clean boundary or
further mess on the other side?"*

### Sample output

```
**Representative path**  (depth 22, files: F1, F2)

F1:116  11. compute  props.type === "bar" ? «barData().series» : lineSeries()
F1:115  12. memo     barData()  — = { categories, series: series.map(...) }
F1:108  13. pack     { «categories», series: series.map(...) }
F1:108      ↘ enter groupBarSeries(rows(), xField(), yField(), seriesField())   → F2
F2:42   14. read     field  — param ⟵ xField()                      (bound at F1:108)
F2:55   15. compute  rows.filter(r => r[«field»] != null)
F2:58   16. compute  «…filter(r => r[field] != null)».map(r => ...)
F2:61   17. pack     { name, «color»: colorFor(i), points: rows.map(...) }
F2:61      ↗ return  groupBarSeries → becomes `categories`           (back to F1)
F1:107  18. helper   xField()  — returns (props.xField ?? "x").toUpperCase()
            ▸ boundary: extract the defaults & normalization above into a named memo

Files:
  F1 = client/apps/modeler/src/components/tiles/chart.tsx
  F2 = client/apps/modeler/src/lib/series.ts
```

> Reads as: the `series` lineage leaves chart.tsx, spends 4 steps inside
> `series.ts` (a real transform, not a pass-through), and returns one value.
> That F2 detour being *short and single-output* is the signal it's a healthy
> boundary; if it kept forking into F3/F4 you'd see it here.

---

## Approach 2 — Boundary Report: classify every function on the render paths (new view)

**New view:** `boundary-report` (alias `helpers`). Sibling to `defensive-ledger`.

**Idea.** For each function `report.helpers` collected during cross-file tracing,
score it as a *boundary* and assign a verdict. This is the heart of the
"clean vs messy" question and the menu for inline-vs-extract decisions.

**Verdict heuristics** (all from the per-helper record):

| Verdict | Signal |
| --- | --- |
| `clean pipe` | arity ≤ 2, `inSources` ≤ 2, low internal depth/churn, concrete return type — leave it. |
| `thin pass-through` (inline) | `passThrough` true (body forwards/renames one input), internalDepth ≤ 1 — the helper earns nothing. |
| `leaky boundary` | `typeLeak` (return or a param is `any`/`unknown`/wide union) — the boundary exists but doesn't *contain* anything. |
| `confluence / junction` | `inSources` ≥ 3 **and** `callerCount` ≥ 2 — many lineages meet and the result re-spreads (Approach 5 drills in). |
| `messy internals` | high internal depth/churn/defenses but narrow signature — mess is hidden behind a fine façade (often fine, sometimes a god-helper). |

A function can carry a primary verdict plus flags. Sort by a "boundary debt"
score so the worst offenders surface first.

### Sample output

```
# Boundary Report

> Functions reached while tracing render paths, scored as data-flow boundaries.
> _In-sources_ = distinct external values reaching the return; _Callers_ = call
> sites across analyzed files; _Internal_ = depth/churn inside the body.

| Function          | Where             | Arity | In-src | Callers | Internal d/churn | Return type                    | Verdict                  |
| ----------------- | ----------------- | ----: | -----: | ------: | ---------------- | ------------------------------ | ------------------------ |
| groupBarSeries    | lib/series.ts:40  |     4 |      6 |       3 | 9 / 5            | `ColoredBarSeries[]`           | confluence / junction    |
| toLabelParts      | chart.tsx:140     |     1 |      7 |       1 | 11 / 8           | `{ id?: string; parts } \| undefined` | leaky boundary    |
| xField            | chart.tsx:107     |     0 |      1 |       5 | 2 / 0            | `string`                       | clean pipe               |
| identity          | lib/util.ts:3     |     1 |      1 |      12 | 1 / 0            | `T`                            | thin pass-through (inline) |
| colorFor          | theme.ts:22       |     1 |      2 |       8 | 3 / 1            | `string`                       | clean pipe               |

## Worst boundary debt
- **toLabelParts** — 7 sources collapse into a nullable wide-union return that 18
  downstream sinks then re-guard. Tighten the return type or split it (see repair).
- **groupBarSeries** — junction (6 in × 3 out). Candidate for a formal typed
  module boundary; see Junctions view.
```

**Tactical:** `callerCount` needs a project-wide pass — count call expressions per
resolved symbol while walking all source files (cheap; we already visit them in
`buildReport`). `passThrough` = body is one `return <expr>` where `<expr>` is an
identifier/property-access of a param with no calls/operators. `typeLeak` = reuse
`getNullishStatus`-style flag checks (`Any|Unknown`) on the return type and a
union-arity threshold.

---

## Approach 3 — Inline simulation: "what if we inlined this helper?" (new view + blend)

**New view:** `inline-preview` (and a `--simulate-inline <fn>` mode); also feeds a
candidate edit in `work-packets`.

**Idea.** Decide inline-vs-keep *quantitatively*. We can trace a path two ways:
with the helper as one `helper` step (current), and with its body **spliced
inline** (the cross-file trace already computes the body steps). Compare metrics.

**Decision rule.**
- If inlining **lowers or barely changes** total complexity *and* `callerCount` is
  low (1–2) → **INLINE**: the helper is pure indirection (a hop + a file jump).
- If inlining **raises** local depth/churn *or* `callerCount` is high → **KEEP**:
  the helper genuinely consolidates; instead *clean the boundary* (Approach 4).

This is "could we inline a function and bring it into one file?" answered with a
before/after, plus an honest note that multi-caller inlining is a codemod the
tool flags but doesn't perform.

### Sample output

```
# Inline Preview

## identity  (lib/util.ts:3 · 12 callers · pass-through)
                depth   files   churn   defenses
  as-is           22       2       6          3
  inlined         21       1       6          3     Δ depth −1, files −1
  Verdict: INLINE at this site — a pure forwarding hop across a file boundary.
  Note: 12 callers project-wide; removing the export is a codemod, not done here.

## toLabelParts  (chart.tsx:140 · 1 caller · leaky boundary)
                depth   files   churn   defenses
  as-is           22       1       6          3
  inlined         30       1      14          6     Δ depth +8, churn +8, defenses +3
  Verdict: KEEP — inlining dumps an 11-step transform into the render leaf.
  This helper SHOULD exist; it's just leaky. Fix the boundary (clean its
  signature / split its return), don't inline. See Repair Map.

## groupBarSeries  (lib/series.ts:40 · 3 callers · junction)
                depth   files   churn
  as-is           22       2       6
  inlined         29       1      11     Δ depth +7, churn +5
  Verdict: KEEP & FORMALIZE — 3 callers + real internal work. Inlining would
  triplicate logic. Make it a typed module boundary instead (Junctions).
```

**Tactical:** run the trace with `traceHelpers` on; for the chosen function,
build the "inlined" variant by *not* collapsing its body into one step (we
already have both forms mid-trace), recompute `metricsFor` on each, diff. The
`files` delta = distinct files in the step set before/after.

---

## Approach 4 — Extraction proposal: "cut this mess into a clean helper" (blend)

**Blends into:** `work-packets` (extends `extractionBoundariesFor`), `repair-map`.

**Idea.** We already mark *where* to cut (`▸ boundary`). Make it *actionable* by
synthesizing the **clean helper signature** the cut implies: the inputs are the
source lineages crossing the boundary, the output is the value at the cut, and we
can name it from the sink/shape. This is "take a messy boundary and put it into a
CLEAN helper func" — the inverse of Approach 3.

**Deriving the signature.** At a cut after step *k*:
- **Inputs** = the distinct roots (`rootInfos`, with their types from the checker)
  whose lineage feeds steps `≤ k` and are still referenced below the cut. Each
  becomes a typed parameter; reuse the marked-`« »` source labels.
- **Output** = the value/type at step *k* (`checker.getTypeAtLocation`), or the
  Phase-5 `suggested sink model` (`{ x, y, width, height }`) when it's geometry.
- **Name** = domain noun from `classifyPathShape` + sink family (`nullBarGeometry`,
  `visibleRows`, `legendEntries`) — never `layout`/`viewModel` (existing banned
  list).
- **Lines to move** = min..max source line among the steps in the cut region
  (from the `F#:line` data we now carry).

### Sample output

```
**Extraction proposal**  (WORK ITEM DF-001)

Cut steps 2–13 into a clean helper:

  function nullBarGeometry(
    width: number,                 // ⟵ props.width ?? 340        (F1:89)
    profile: Profile,              // ⟵ props.profile             (F1:91)
  ): { x: number; width: number }  // ⟶ value at the cut          (F1:108)

  moves ~F1:95–108 (14 lines) out of the component body.
  After: JSX reads `nullBarGeometry(width(), props.profile).x`
         → a 2-step render path instead of 20.

  Why: this region mixes defaulting (step 3) + geometry math (steps 5–13) with
  no reuse — a textbook clean-boundary extraction.
```

**Tactical:** mostly assembly of data we already have — `rootInfos` (inputs),
checker types (signatures), `extractionBoundariesFor` (cut points), `F#:line`
(line range), shape/family (name + output shape). The honest limit: parameter set
is an *approximation* (we list the roots crossing the cut; a human confirms). Mark
it "proposed," like the rest of the tool's hints.

---

## Approach 5 — Junctions: map where lineages fork in and re-spread (new view)

**New view:** `junctions` (alias `confluence-map`). Complements `fan-in`/`fan-out`,
which today are per-*sink* and per-*source*; this is per-*function*.

**Idea.** Build a cross-file call graph of the first-party functions on render
paths. A **junction** is a function where multiple **independent source lineages**
enter (tributaries) **and** whose result feeds multiple sinks/callers
(distributaries). These are the load-bearing knots — "places where messy stuff
meets and comes back together." For each, show what flows in (and from where) and
where the result flows out, so you can decide: formalize it as the official typed
boundary, or split it by distributary.

**Junction score** = `inSources × callerCount`, with a depth/churn tiebreak. Rank
descending; these are the highest-leverage disentangling targets in the codebase.

### Sample output

```
# Junctions — where independent lineages meet and re-spread

## groupBarSeries   lib/series.ts:40   score 18  (6 in × 3 out)

  tributaries (independent source lineages flowing in)
    rows()            ← useTableData()        data/table-store.ts
    xField / yField   ← props.xField ?? "x"   chart.tsx:89
    colorFor(i)       ← theme palette          theme.ts:22
    seriesField()     ← props.seriesField      chart.tsx:93

  distributaries (where the single result re-spreads)
    barData().series  → <For each> bars        chart.tsx:150
    legendEntries()   → <Show> legend          chart.tsx:163
    exportRows()      → CSV download handler    chart.tsx:201

  Read: 4 source families converge here; the one result then feeds 3 unrelated
  sinks (bars, legend, export). This is THE knot for this feature.
  Options:
    • Formalize: give it a typed input struct + named output — the canonical
      boundary. (See Boundary Report: currently a healthy `ColoredBarSeries[]`.)
    • Split by distributary: if bars/legend/export need different shapes, three
      narrow selectors beat one wide junction.

## toLabelParts   chart.tsx:140   score 7  (7 in × 1 out)
  Not a true junction (single distributary) but a heavy confluence:
  7 lineages collapse into one nullable return that 18 sinks re-guard.
  → Treat as a leaky boundary to tighten, not a junction to split.
```

**Tactical:** the call graph nodes come from `report.helpers`; edges come from the
cross-file trace (caller → callee) plus the per-sink `rootInfos` for tributaries
and `reachableSinks`/caller sites for distributaries. "Independent lineages" =
roots with disjoint upstream source sets (dedupe by root label, as
`groundReachability` already does for reach). This view is where the tool stops
describing single paths and starts describing **structure**.

---

## How the five fit together

```
              cross-file trace (shared enabler)
                        │
   ┌────────────┬───────┴────────┬─────────────┬──────────────┐
   ▼            ▼                ▼             ▼              ▼
 (1) deeper   (2) Boundary    (3) Inline    (4) Extraction (5) Junctions
 path         Report          Preview       Proposal       map
 "what's on   "is each fn a   "fold it      "cut mess into "where do
  the other    clean/leaky/    back in?"     a clean fn"    lineages knot?"
  side?"       junction?"      INLINE↩       EXTRACT↪
```

- **1** makes the existing path honest across files.
- **2** is the catalog of boundaries and their health.
- **3 + 4** are the two refactor verbs (inline vs extract), each quantified.
- **5** is the structural map that tells you *which* boundary is worth the effort.

A natural user loop: run **5** to find the worst knot → open **2** for its verdict
→ use **3** or **4** to decide and shape the fix → re-run and watch the path in
**1** get shorter (and the baseline diff confirm it).

---

## Suggested sequencing

1. **Cross-file trace enabler** + Approach 1 rendering (enter/return markers).
   Nothing else works without this; Approach 1 is almost free once it lands.
2. **Approach 2 (Boundary Report)** — pure read over `report.helpers`; high value,
   low risk; defines the vocabulary the others reuse.
3. **Approach 4 (Extraction proposal)** — mostly assembly of existing data onto
   the boundaries we already mark.
4. **Approach 5 (Junctions)** — needs the call graph; biggest conceptual payoff.
5. **Approach 3 (Inline preview)** — relies on the dual-form trace; nice-to-have
   once 1–2 are solid.

## Risks & open questions

- **Param binding fidelity.** Destructured params, rest/spread args, default
  param values, and overloads complicate the `paramBindings` map. Start with
  positional identifier params; degrade gracefully (treat unbindable params as
  fresh sources) and `log` the degradation rather than silently mis-tracing.
- **Cost.** Cross-file descent multiplies work. Mitigate: memoized per-file
  contexts, first-party-only gate, `--max-helper-depth` cap, and keep
  `--trace-helpers` off for the cheap table views.
- **Re-export / barrel files.** `getAliasedSymbol` must chain through
  `index.ts` re-exports; test against a barrel-heavy package.
- **"Independent lineage" definition (Approach 5).** Disjoint upstream source
  sets is a heuristic; two lineages sharing one deep source aren't fully
  independent. Good enough to rank; document it.
- **Boundary between flag and default.** Decide per-view defaults for
  `--trace-helpers` so existing outputs don't silently change depth/metrics; gate
  baseline comparisons so a tracing-on run isn't read as a regression vs a
  tracing-off baseline.
- **Codemod boundary.** Approaches 3/4 *propose*; they must not rewrite. Keep the
  tool's "diagnosis + hint, never auto-edit" stance (consistent with the rest).
```
