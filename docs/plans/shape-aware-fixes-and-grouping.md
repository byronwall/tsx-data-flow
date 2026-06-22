# Plan: Shape-Aware Fix Suggestions, Sink-Family Grouping, and Better Explainability

## Source

Distilled from the agent cleanup write-up at
`modeler/tmp/data-flow/tsx-dataflow-cleanup-process.md`, which drove a real
histogram-chart refactor with `tsx-dataflow` and rated the tool 8/10.

## Guiding constraints (what this plan deliberately excludes)

The agent's most repeated weakness was that the tool **diagnoses expensive paths
well but prescribes tasteful fixes poorly** — it leans on generic
Provider/Context advice even for a local geometry component.

This plan goes after that, but with two hard rules pulled from the request:

1. **Stay standalone and file-local.** Every feature here derives only from data
   the analyzer already computes for the files it was given: the per-sink trace
   (`representativeSteps`, `metrics`, `defenses`, `rootInfos`), the sink category,
   and the set of sinks in the same file. **No feature may scan the wider repo for
   "similar code" or mirror nearby-file conventions.** That explicitly drops the
   write-up's Taste Improvement #5 ("Include local style-pattern examples from
   nearby files") and any cross-file pattern mining.
2. **Suggestions name app concepts, never analyzer concepts.** Words like `pivot`,
   `sink`, `fan-in`, `reachable sinks`, and `representation-only transformation`
   are fine in the *report prose* but must never appear as suggested **code
   identifiers**. (Write-up Taste Improvement #4.)

Everything below is implementable inside `src/core.mjs` against the existing
report object. No new traversal of the program is required except where noted in
Phase 6 (fallback origin), which reuses AST nodes the analyzer already visits.

---

## What we already have to build on

Knowing the existing shape keeps each item small. Relevant primitives in
`src/core.mjs`:

- `sink.representativeSteps`: `[{ label, kind }]` for the longest path. `kind` is
  one of `source`, `property-read`, `optional-read`, `fallback`, `conditional`,
  `call`, `object-pack`, `alias`, `template`, `solid-accessor`, `literal`,
  `jsx-sink`, plus `unknown`.
- `sink.category`: `rendered-value` | `style` | `render-control` | `attribute`
  (from `getSinkExpression` / `classifyAttribute`).
- `sink.label`: e.g. `transform={...}`, `when={...}`, `each={...}`.
- `sink.metrics`: depth, helperHops, representationChurn, defensiveOperationCount,
  impossibleDefenseCount, controlDependencyCount, mergeWidth, reachableSinks,
  unknownEdgeCount.
- `sink.defenses`: `[{ operation, expression, guardedExpression, type, verdict,
  location }]` with `verdict ∈ impossible | possible | unknown`.
- `candidateEditsFor(sink)`: the current generic suggestion cascade (the main
  thing we are replacing).
- `addOperationTrace` already mints a graph node per operation with a stable
  `id`; object-pack operations go through `traceObjectLiteral`. Phase 3 leans on
  this.

---

## Phase 1 — Path-shape classification (foundation)

**Goal.** Give every sink one or more *shape tags* derived from its trace, so the
rest of the plan (fixes, summaries, boundaries) can key off the shape instead of
a one-size cascade. (Write-up §"Suggestions to bring ratings to 10" #1.)

**Add** `classifyPathShape(sink) -> string[]` returning a subset of:

| Tag | Detection signal (file-local only) |
| --- | --- |
| `geometry-chain` | sink category `attribute`/`style` **and** attribute name in a geometry set (`transform`, `x`, `y`, `cx`, `cy`, `width`, `height`, `d`, `points`, `viewBox`, `r`, `dx`, `dy`), or path has a `template` step plus arithmetic (`conditional`-kind binary) steps over numeric labels. |
| `collection-render-model` | sink category `render-control` with `each={...}` label, or path labels include `.map(`/`.filter(`/`.sort(`. |
| `control-flow-gate` | sink category `render-control` with `when={...}`/`fallback`, or path dominated by `conditional` + `fallback` kinds feeding a boolean-ish sink. |
| `presentation-pack` | sink category `style`, or an `object-pack` step directly feeding a `class`/`style`/attribute sink. |
| `domain-normalization` | `defensiveOperationCount > 0` (optional-read/fallback) or `conditional` narrowing steps over a `prop-read` root (e.g. numeric-vs-categorical branch). |
| `cross-component-relay` | `mergeWidth > 1` and `helperHops === 0` and roots are mostly `prop-read`/parameter pass-through (the existing prop-relay shape). |

Tags are **non-exclusive** — the histogram `transform` is legitimately
`geometry-chain` + `domain-normalization`. Order them by a fixed priority so the
primary tag is deterministic.

**Tests.** Extend `test/core.test.mjs` with small fixtures (the test file already
inlines TSX snippets) asserting tag sets for: an SVG `transform` template, a
`<For each={rows()}>`, a `<Show when={x()}>`, a `class={...}` object, and a
prop-only relay. Use the `bad-ish-solid` example dir as a realistic smoke check.

**Why first.** Phases 2, 5, and 6 all consume these tags. Nothing renders yet.

---

## Phase 2 — Shape-aware fix suggestions (the headline fix)

**Goal.** Replace the generic Provider/Context-first cascade in
`candidateEditsFor` with suggestions matched to the Phase 1 tags. (Write-up
§ratings "Suggested fixes: 6", Taste #1/#3/#4.)

**Rewrite** `candidateEditsFor(sink)` to dispatch on the primary shape tag:

- `geometry-chain` → "Extract a `createMemo` that returns the render-ready
  geometry (`{ x, y, width, height }`); keep the SVG attribute reading named
  fields." Suggest a domain noun (`barSizing`, `nullBar`), never `layout`.
- `collection-render-model` → "Extract the item models into a `createMemo`
  returning the array; feed `<For each={...}>` and render one component per item."
  Name it a **plural noun** for what is rendered (`realBars`, `visibleRows`).
- `control-flow-gate` → "Name the predicate / the shown thing in a memo so the
  `when={...}` reads as a sentence; resolve fallbacks before the gate."
- `presentation-pack` → "Build the class/style object in a small memo split by
  responsibility; avoid packing unrelated attributes together."
- `domain-normalization` → "Resolve defaults, optional reads, and union narrowing
  at a named boundary memo (e.g. `profileData`) before any JSX reads it."
- `cross-component-relay` → **this is the only branch that keeps the
  Provider/Context advice** (preserves the existing `hasContextHookRoot` /
  `isProviderContextCandidate` behavior, now correctly scoped).

Each branch ends with a fixed taste reminder pulled from the write-up:
"Keep JSX scannable — attributes should read named values, not derive them."

**Naming guidance baked into output (Taste #1, #4):**
- memo feeding `each` → plural noun; memo feeding `when` → the shown thing or a
  predicate; never emit `transformedProps`, `sinkData`, `fanInResult`, `layout`,
  `viewModel`.

**Tests.** Snapshot the candidate-edits block per shape; assert no banned
identifier (`pivot`, `sinkData`, `fanInResult`, bare `layout`) appears in any
suggested code.

---

## Phase 3 — Sink-family grouping & overpacked-object detection ⭐

> Explicitly requested: "I like the ideas about grouping certain properties."
> Write-up §"Suggestions" #2 and Taste #2; ratings "False-positive management: 7".

**Goal.** When several sinks in a file pull from **one packed object** (a
`createMemo`/object literal returning `{ a, b, c, … }`), decide whether that
object is a *helpful render model* or an *overpacked bag*, and if it's a bag,
recommend a split by **sink family**.

This directly addresses the write-up's "Important Lesson" — the first refactor
bundled everything into one `layout` memo, and a simple `width={layout().width}`
then appeared to depend on all the bar geometry.

### 3a. Attribute → sink family

Add `sinkFamilyOf(sink) -> string`:

- `svg-shell`: `width`, `height`, `viewBox` on the root element
- `geometry`: `transform`, `x`/`y`/`cx`/`cy`, `d`, `points`, `r`
- `control-flow`: `when`, `each`, `fallback`
- `style`: `class`, `className`, `style`
- `text`: `rendered-value` (JSX text/children)
- `other`: anything else

(Reuses the geometry set from Phase 1 — factor it into one shared constant.)

### 3b. Attribute multiple sinks to a shared packed object

Today a trace records edge **kinds** but the sink record doesn't expose *which
object-pack node* it flowed through. Add it:

- In `addOperationTrace`, when `kind === "object-pack"` (and for memo accessors
  whose body is an object literal), tag the returned trace with the operation
  **node id**.
- Thread that id onto `sink` as `sink.packNodeIds: string[]` (the object-pack
  node ids on the longest path). This is a small additive field; nothing existing
  reads it.

Then group `report.sinks` by shared `packNodeId`.

### 3c. Overpacked verdict

For each pack node feeding ≥2 sinks, compute the set of **distinct sink families**
it feeds. Verdict:

- **render model (OK):** all consuming sinks share one family (e.g. one pack feeds
  only `geometry`). Reported as "shape noise" — *not* a real responsibility
  problem, so the tool stops penalizing it as if it were. (Fixes the
  false-positive complaint where wrapper-object propagation looked like risk.)
- **overpacked bag (split me):** the pack feeds ≥2 families (e.g. `svg-shell` +
  `geometry` + `control-flow`). Emit a split recommendation:

  ```text
  Object `layout()` feeds 3 sink families — split it:
    SVG shell: width, height, viewBox
    Geometry:  transform, rect width/height
    Null bar:  when, transform
  ```

### 3d. Surface it

- New section in the **work-packets** view for any sink whose pack is "overpacked
  bag": the split block above.
- Label the distinction in the **defensive/path** prose as "shape noise (benign
  wrapper)" vs "mixed-responsibility object" so users can tell them apart.

**Tests.** Two fixtures: (1) a single geometry memo feeding only geometry sinks →
verdict `render model`, no split suggested; (2) a `layout` memo feeding width +
transform + `when` → verdict `overpacked bag` with a 3-family split. Assert the
family lists are correct.

**Note on effort.** 3b is the only structural change in the whole plan (adding
`packNodeIds`). Keep it additive and behind the new grouping code so existing
views are untouched until 3d wires it in.

---

## Phase 4 — Human-readable confidence (reason + risk)

**Goal.** Turn the opaque `confidence: 99%` into a sentence. (Write-up #5.)

**Change** `confidenceFor(metrics, defenses)` to return
`{ score, reason, risk }` (keep `score` so existing numeric uses keep working;
update call sites). Map the existing branches to prose:

| Condition | reason | risk |
| --- | --- | --- |
| `unknownEdgeCount > 0` | "Path contains unresolved (dynamic/external) hops." | "medium; verify the unknown edge before editing." |
| a defense verdict `unknown` | "A guard's type is too loose to evaluate statically." | "low–medium." |
| `impossibleDefenseCount > 0` | "Single file, direct JSX sink, all hops statically resolved." | "low; behavior-preserving extraction likely." |
| default | "All hops statically resolved within one file." | "low." |

Render in **findings** and **work-packets** under the confidence row:

```text
Confidence: 99%
Reason: single file, direct JSX sink, all hops statically resolved.
Risk: low; behavior-preserving extraction likely.
```

**Tests.** Assert each branch's reason string renders; assert numeric score
unchanged from current behavior (regression guard on the existing assertions).

---

## Phase 5 — Nearest extraction boundary + suggested render-model shape

**Goal.** Turn the path into an implementation hint without rewriting the file.
(Write-up §"Suggestions" #4; ratings "Representative paths: 9 → collapse repeated
arithmetic into named concepts".)

**Add** `extractionHintsFor(sink)` that walks `representativeSteps` and marks:

- The boundary **after the last `domain-normalization` step** (last
  `fallback`/`optional-read`/narrowing before geometry/template begins):
  "Recommended boundary after: defaults & profile normalization (step N)."
- The boundary **after a contiguous geometry sub-chain**:
  "Recommended boundary after: horizontal bar sizing (steps N–M)."
- The **suggested sink model shape**, inferred from the sink family (Phase 3a):
  geometry → `{ x, y, width, height }`; collection → `Array<ItemModel>`.

Render as a short "Recommended boundaries" block in **work-packets**, beneath the
representative path:

```text
Recommended boundary after: profile normalization (step 4)
Recommended boundary after: horizontal bar sizing (step 7)
Recommended sink model: { x, y, width, height }
```

**Tests.** Fixture mirroring the histogram path; assert the two boundary lines
land on the normalization and sizing steps, and the model shape matches geometry.

---

## Phase 6 — Reviewer-facing PR summary per work packet

**Goal.** A compact, paste-into-PR framing for each work item. (Write-up #7.)

**Add** `reviewerSummaryFor(sink)` composing 2–3 sentences from Phase 1 tags +
Phase 3 verdict + metrics:

```text
This sink mixes profile normalization, missing-value handling, and SVG geometry.
A behavior-preserving fix is to compute a render model before JSX.
Watch for overpacking width/height into the same object as bar geometry.
```

Sentence 1 lists the active shape tags in plain words. Sentence 2 is the headline
fix from Phase 2. Sentence 3 appears only when Phase 3 flagged an overpacked bag
(or warns against creating one).

Render at the top of each **work item** block, before "Scope".

**Tests.** Assert the summary mentions every active shape tag and never leaks an
analyzer term.

---

## Phase 7 — Ownership hint per sink

**Goal.** Tell the reader the *kind* of change this is. (Ratings "Locality of
action: 8 → add ownership hints".)

**Add** `ownershipHintFor(sink)` returning one of:

- `local component cleanup` — single file, low reach, no context root.
- `feature hook extraction` — `hasContextHookRoot` or high reach within feature.
- `cross-component prop relay` — `cross-component-relay` shape.
- `architectural fan-in` — `mergeWidth` and `reachableSinks` both high.

Show in **work-packets** "Risk" block and as a column in **repair-map**. This
mostly relabels signals `isProviderContextCandidate` already computes, but as a
ladder of four honest categories instead of a binary Provider/Context flag.

**Tests.** One fixture per category.

---

## Phase 8 — Metric contribution detail (explainability)

**Goal.** "Show which exact operations contributed to each count." (Ratings
"Metric explainability: 7".)

The trace already knows each step's kind and label. **Add** an optional
contributions map so a count like "defensive operations: 2" can name them:

```text
defensive operations: 2
  - profile.quality?.missingCount   [optional-read]
  - ... ?? 0                        [fallback]
```

Render under the metrics table in **findings** (the most detailed view) only, to
avoid bloating tables. Drive it from `representativeSteps` filtered by kind.

**Tests.** Assert the two defensive steps from a fixture are itemized with kinds.

---

## Phase 9 (optional / lower priority) — Type-impossible vs compatibility fallbacks

**Goal.** Distinguish stale defensive code from intentional compatibility guards.
(Write-up #6.) Still file-local: uses the guarded expression's type + optionality
+ **leading comments on the AST node** the analyzer already visits — *not* repo
scanning.

In `defenseRecord`, when `verdict === "possible"`, sub-classify:

- guarded type comes from an **optional field** (`?`) → `compatibility (optional)`
- a leading comment near the guard mentions persist/legacy/back-compat →
  `compatibility (documented)`
- otherwise → `defensive (review)`

`verdict === "impossible"` stays `stale (type-impossible)`.

Surface as an extra column in the **defensive-ledger** view.

**Tests.** Fixtures for an optional-field guard, a commented guard, and a plain
guard.

---

## Phase 10 (optional / lower priority) — Richer before/after comparison

**Goal.** Prove a cleanup worked. (Write-up #3; ratings "End-to-end workflow:
7".) The current `--baseline` only compares the single worst burden score.

- Key sinks by `file:line` + `signatureFor(sink)` so they survive line shifts
  reasonably.
- Report **Removed / Improved / Regressed / New top** instead of one number:

  ```text
  Removed:   histogram-chart.tsx transform path (depth 20)
  Improved:  components/tiles wrappers 224 -> 89
  Regressed: none
  New top:   chart.tsx when path (depth 19)
  ```

- Optionally add a `--save-baseline <path>` convenience that writes the JSON view
  (today you'd use `--format json --out`), keeping `--compare` symmetric.

This is standalone (it compares two runs over the same given files), but it is
the largest net-new surface and the least tied to the "tasteful fixes" core
complaint, so it's last.

---

## Suggested sequencing

1. **Phase 1** (classification) — unblocks everything.
2. **Phase 2** (shape-aware fixes) — the headline win, directly raises the "6/10
   suggested fixes" rating.
3. **Phase 3** (sink-family grouping) — explicitly requested; the one structural
   change (`packNodeIds`).
4. **Phases 4–8** — independent, small, additive polish; do in any order.
5. **Phases 9–10** — optional, larger, lower payoff.

## Explicitly out of scope (per request)

- Scanning the repo / nearby files for similar code or mirroring conventions
  (write-up Taste #5).
- Auto-rewriting files. Every output stays a *hint*, as the write-up itself
  recommends ("turn a diagnostic into an implementation hint without trying to
  rewrite the file automatically").
- Separating runtime/review/architectural complexity into three distinct scores
  (ratings #1) — interesting but a metrics-model change with unclear payoff;
  revisit only if Phases 1–8 land well.

## Risks & notes

- **`packNodeIds` (Phase 3b)** is the only change touching the trace builder.
  Keep it strictly additive; guard new grouping behind its own functions so the
  existing twelve views are byte-stable until Phase 3d wires it in.
- The geometry attribute set, banned-identifier list, and family map should each
  live in **one shared constant** reused across phases to avoid drift.
- `confidenceFor` returning an object (Phase 4) touches several call sites
  (`buildSinkRecord`, `rankSinks` reads `sink.confidence`) — keep `sink.confidence`
  the numeric score and add `sink.confidenceReason`/`confidenceRisk` alongside.
- Every phase ships with fixtures in `test/core.test.mjs`; run `test/regenerate.mjs`
  to refresh the `bad-ish-solid` example output after each phase.
