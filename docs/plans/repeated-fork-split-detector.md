# Proposal: Detecting "Repeated Fork → Split Into Sub-Components"

> **Status: implemented.** Built as Option A (per-component branch inventory) +
> trimmed Option B (branch-exclusive eager computation as the severity signal) +
> Option C-style sink relation. Lives in `detectRepeatedForks` (`src/core.mjs`),
> surfaced through the new `repeated-forks` report view and the per-file HTML
> page. See `examples/bad-ish-solid/src/Chart.tsx` and
> `examples/bad-ish-solid/reports/repeated-forks.md` for the worked example.
> D and E remain deferred.

**Motivating finding:** `RPF-148-15` — `categories={barData().categories}` in
`client/apps/modeler/src/components/tiles/chart.tsx:148`.

## 1. The pattern the analyzer is missing

`Chart` discriminates on the same value, `props.type`, in two sibling places:

```tsx
// (1) a ternary that picks one of two pre-computed series sets
const activeSeries = () => props.type === "bar" ? barSeries() : lineSeries();

// (2) a Switch/Match that picks one of two child components
<Switch>
  <Match when={props.type === "bar"}>  <BarChart categories={barData().categories} .../> </Match>
  <Match when={props.type === "line"}> <LineChart series={lineSeries()} .../> </Match>
</Switch>
```

And it computes **both** branches' data eagerly at the top of the component
(`barData`, `barSeries`, `lineSeries`), then **prop-drills** the slices into the
children. The healthier shape is a single top-level split into `BarChart` /
`LineChart`, with each child computing its own series in place. The user's words:

> across this whole file you're making the same forks/splits in different
> places… consider a top-level split → sub-comps.

### Why the current engine does not catch it

This is the important diagnostic. Look at `RPF-148-15`'s own metrics:

```
controlDependencyCount: 0      mergeWidth: 2      helperHops: 3
```

`controlDependencyCount` is **zero** — even though the value is rendered inside a
`<Match when={props.type === "bar"}>`. The reason is structural: the analyzer
traces each sink **backward along its own data slice**. `barData().categories`
flows `literal → fill → alias → groupBarSeries → memo → property-read`. The
`props.type` discriminant lives in a **sibling** position (the `Match` guard and
the `activeSeries` ternary), not on this value's path, so it never becomes a
`conditional` edge for this finding.

Consequences for every existing mechanism:

| Mechanism | File | Why it misses this |
|---|---|---|
| `controlDependencyCount` / `repeatedNormalization` | `metricsFor` `core.mjs:2443` | Per-path. A discriminant guarding a *sibling* sink is invisible. |
| `cross-component-relay` shape | `classifyPathShape` `core.mjs:4428` | Keys on multi-root prop merges, not on a repeated condition. |
| Pack groups (`relay-bag` / `overpacked-bag`) | `computePackGroups` `core.mjs:4799` | Group sinks that share a packed **object**, not sinks that share a **guard**. |
| Work units | `computeWorkUnits` `core.mjs:2950` | Group by file + shared pack OR pivot+shape. A discriminant is neither. |

**There is no component-level reasoning about branch conditions anywhere.** All
forks are seen only when they sit directly on a single value's slice. The
"same discriminant tested in N sibling places" signal — the textbook trigger for
a discriminated split — has no representation in the model.

## 2. Options

All five target the same gap; they differ in *where* in the pipeline the signal
is computed and how broad a claim they make.

### Option A — Repeated-Discriminant Detector (component-scoped AST pass)
A new pass that, per component function, collects every branch construct
(ternary, `&&`/`||`, `if`, `Switch`/`Match`, conditional JSX) and normalizes its
discriminant to a symbol/identity key (`props.type`, the `===` operand, etc.).
When **one discriminant is tested in ≥2 sibling locations**, emit a
component-level finding: "discriminant `props.type` forked in N places → consider
a discriminated split." `Switch`/`Match` on a literal union is a near-zero-FP
anchor; bare repeated ternaries need a count threshold.

### Option B — Eager-cross-branch-computation metric (per-finding extension)
Extend `metricsFor` with a metric that fires when a value is computed
**unconditionally** at component scope but **consumed only under one branch** of a
sibling discriminant (e.g. `barData()` is always evaluated but only read inside
the `bar` Match). Surfaces the "you computed both, used one" waste directly on the
existing findings, adds a `BURDEN_TERMS` weight.

### Option C — Discriminant-keyed aggregation (extend work-units)
Reuse the `computeWorkUnits` file-grouping plumbing but add a **guard key**: tag
each sink with the discriminant value gating it, then roll up sinks that live
under the same component but distinct discriminant values into a single
"discriminated subtree" work unit. Slots into the existing "fix once, N sinks
improve" output.

### Option D — Prop-drilled compute-in-place lint
Detect derived props (memo/helper output) passed to a child that is the **sole
consumer**, where the derivation depends only on inputs the child already
receives — i.e. the computation should move into the child. Targets the
"feed data as props instead of computing in place" half of the smell.

### Option E — Component-cohesion "split score" (synthesis rollup)
A higher rollup combining A's repeated-discriminant count, B's branch-gated-memo
count, and D's prop-drill count into one "this component wants to be N components"
score that names the split axis. Broadest claim, most moving parts.

## 3. Evaluation (0–10 per dimension)

| Dimension | A | B | C | D | E |
|---|---|---|---|---|---|
| Matches user's mental model ("same fork, many places → split") | 10 | 6 | 8 | 5 | 9 |
| Precision (low false positives) | 8 | 7 | 7 | 6 | 6 |
| Recall / generality | 7 | 6 | 7 | 6 | 9 |
| Implementation effort (10 = easy) | 6 | 5 | 7 | 4 | 3 |
| Fit with existing architecture | 6 | 7 | 9 | 5 | 5 |
| Actionability of output | 8 | 6 | 8 | 7 | 9 |
| Explainability / confidence | 9 | 7 | 7 | 6 | 5 |
| **Total** | **54** | **44** | **53** | **39** | **46** |

## 4. Compare & contrast

- **A vs everything:** A is the only option that models the smell *as the user
  framed it* — a condition repeated across sibling positions — and `Switch`/`Match`
  on a string-literal union gives it an exceptionally clean, explainable anchor.
  Its cost is that it's a genuinely new capability: the engine has no
  component-level branch inventory today, so A introduces one.

- **C vs A:** C scores nearly as high and has the **best architectural fit** —
  it rides the existing `computeWorkUnits` grouping. But C can't actually group by
  discriminant until *something* tags each sink with its gating condition, and
  nothing does that today. So C is really "A's plumbing," not an independent
  alternative: it needs A's branch-collection to exist first. They compose.

- **B** is the right *evidence*, wrong *spine*. The fact that `barData` and
  `lineSeries` are both computed eagerly is what turns "you forked twice" from a
  style nit into real burden — but on its own B flags one prop at a time and never
  sees the whole-component shape, so it under-claims.

- **D** is the most FP-prone (plenty of legitimate derived props) and the hardest
  to build (cross-component-boundary consumer + dependency analysis), for a
  partial view of the smell. Lowest value-per-effort. Defer.

- **E** makes the most compelling *output* but is a synthesis layer: it's only
  worth building once A/B/C produce the signals it would combine, and its
  composite score is the hardest to justify to a skeptical reader. Premature.

The two leaders (A, C) are complementary, not competing; B is the severity signal
that makes either one worth a burden weight.

## 5. Recommendation — build next

**Build Option A as the detection spine, emit through Option C's aggregation, and
fold in a trimmed Option B as the severity signal. Defer D and E.**

Concretely, the next unit of work:

1. **Component branch inventory (A).** Add a per-component pass that walks each
   component function body and collects `{ discriminant, kind, location }` for
   every ternary, `&&`/`||`, `if`, and `Switch`/`Match`/conditional-JSX. Normalize
   the discriminant to an identity key (prefer the resolved symbol; fall back to
   normalized text). This is the one new primitive everything else needs.

2. **Repeated-discriminant finding (A).** When a single key appears in ≥2 sibling
   branch locations within one component, emit a component-scoped finding. Anchor
   confidence on construct type: `Switch`/`Match` on a literal union → high; bare
   repeated ternary → gate behind a higher count threshold. Output names the
   discriminant and every fork site (here: the `activeSeries` ternary at
   `chart.tsx:119` and the `Switch` at `chart.tsx:145`).

3. **Severity from branch-gated eager computation (trimmed B).** For each
   discriminant value, count the memos/props computed at component scope but read
   only under that branch (`barData`, `barSeries` under `bar`; `lineSeries` under
   `line`). More branch-exclusive eager computation = stronger "split me" signal.
   Use this as the finding's score, not a global `BURDEN_TERMS` term yet.

4. **Surface via work units (C).** Attach the per-sink findings whose guard
   matches each discriminant value to the component finding using the existing
   `computeWorkUnits` file-grouping, so the output reads "split `Chart` on
   `props.type` → fixes RPF-148-15 and N siblings in one move."

This sequence delivers the user's exact ask first (step 2 alone would have caught
`RPF-148-15`), keeps every step independently shippable, reuses the aggregation
layer instead of inventing a parallel one, and leaves D/E as clearly-scoped later
extensions rather than prerequisites.
