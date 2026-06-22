# Plan: Work-Packet Variety & Coverage

## Goal

`work-packets` ranks render sinks by descending **burden** and emits the top N.
That surfaces the genuinely-worst sinks, but it **clusters**: on the modeler
corpus a `--max-items 30` run produces 30 packets from only ~9 files, and 23 of
those 30 come from **four** files:

```
  7  components/tiles/chart-bar.tsx
  6  components/tiles/chart-line.tsx
  5  components/tiles/histogram-chart.tsx
  5  components/model-viz/concept-link.tsx
  2  railway-admin/src/pages/home.tsx
  2  components/progress/circular-progress.tsx
  1  model-viz/tapestry.tsx
  1  inspector/conversation/search-hero.tsx
  1  button-new/index.tsx
```

That's great signal for "what is the single worst thing," but a poor **map** of
"where is all the work across the codebase." This plan adds *breadth* without
discarding the *depth* the burden ranking already gives.

Two root causes, and the fixes attack both:

1. **The list is a pure descending sort.** A heavy file's many sinks monopolize
   the top. Classic relevance-vs-diversity problem → diversification.
2. **Many of those sinks are the *same* problem.** chart-bar's 7 items almost
   certainly share a handful of geometry helpers / one pivot; fixing one cut
   improves several. They are inflated *count*, not 7 independent tasks →
   group by shared cause.

There is already a seed of breadth: the **Feature Clusters** table at the top of
`work-packets`/`repair-map` (`appendFeatureClusters` / `featureClusterRows`),
which rolls sinks up by feature directory. It's coarse, buried under the packets,
and not wired into selection. Several approaches below promote and extend it.

---

## Where we are today (grounding)

- `rankSinks(sinks)` returns `{ all, quickWins, centralLeverage, investigations }`.
  `all` is `enriched.sort((a,b) => b.scores.burden - a.scores.burden)` — the only
  ordering `work-packets` uses (`report.rankings.all.slice(0, maxItems)`).
- Each sink carries `file`, `scores.{burden,centrality,changeRisk,quickWin,…}`,
  `metrics`, `rootInfos`/`fanOutRootsFor(sink)` (actionable sources), `packs`
  (shared object identity), `classifyPathShape(sink)`, `sinkFamilyOf(sink)`,
  `ownershipHintFor(sink)`, and `report.helpers` (boundary records).
- `featureKeyFor(file)` maps a file to a feature-area key (first dirs under
  `src`). `featureClusterRows` already aggregates sinks → feature rows.
- Selection happens in exactly one place per view (`renderWorkPackets`,
  `renderFindings`, `renderRepairMap` each `slice(0, maxItems)` off
  `rankings.all`). A diversification/grouping layer slots in cleanly there.

Nothing below requires new analysis — it's all re-selection and roll-up over data
the report already has.

---

## Approach 1 — Per-file / per-feature diversity caps ("spread" mode)

**Blends into:** `work-packets`, `findings`, `repair-map` (selection layer).
**New flag:** `--per-file <n>` (and `--per-feature <n>`); on by default at a
sane cap, or gated behind `--spread`.

**Idea.** When selecting the top N, cap how many can come from one file (default
~2) and one feature area (default ~4). The 4th–7th chart-bar sinks are demoted
below the worst sink of the next file, so 30 packets span ~18 files instead of 9.
Crucially, **don't drop** the demoted ones silently — collapse them into a
one-line "more here" note so the concentration signal survives.

**Why it helps.** Directly converts a concentrated list into a map. Cheap,
predictable, and reversible (`--per-file 99` restores today's behavior).

**Tactical.** A `selectDiverse(sinks, {maxItems, perFile, perFeature})` that walks
the burden-sorted list, admitting a sink only if its file/feature quota isn't
full, tracking overflow counts per file. Append an overflow tally.

### Sample output

```
# Render-Path Data-Flow Work Packets

_Spread mode: ≤2 per file, ≤4 per feature. 30 packets across 17 files._
_Suppressed (still hot, shown collapsed): chart-bar.tsx +5, chart-line.tsx +4,
 histogram-chart.tsx +3, concept-link.tsx +3 — see Hotspots for the full count._

## WORK ITEM DF-001  ·  chart-bar.tsx
...
## WORK ITEM DF-002  ·  chart-bar.tsx   (file cap reached; 5 more below the fold)
...
## WORK ITEM DF-003  ·  chart-line.tsx
...
## WORK ITEM DF-004  ·  concept-link.tsx
...        (now reaching files that the pure sort buried at rank 24+)
## WORK ITEM DF-014  ·  inspector/context-panel/field-row.tsx
## WORK ITEM DF-015  ·  explorers/ecs-system/system-row.tsx
```

---

## Approach 2 — MMR re-ranking (relevance × novelty)

**Blends into:** the same selection layer; supersedes Approach 1's hard caps with
a smooth knob. **New flag:** `--diversity <0..1>` (0 = pure burden, today's
behavior; 1 = maximize spread).

**Idea.** Maximal-Marginal-Relevance: greedily pick the sink maximizing

```
score(s) = burden(s) − λ · redundancy(s, alreadySelected)
```

where `redundancy` rises when `s` shares a **file**, **path-shape**, **pivot
source**, or **pack object** with something already picked. A second chart-bar
geometry sink scores low (high redundancy) until genuinely-different work has been
admitted; a lone sink in a fresh file scores high (zero redundancy).

**Why it helps over hard caps.** Soft and tunable: a file with two *different
kinds* of problems (a geometry chain and a leaky relay) can still place both,
while a file with seven copies of the same geometry chain places one. Redundancy
keys on *cause*, not just file.

**Tactical.**
```js
redundancy(s, picked) =
  0.5 * sameFileFrac + 0.25 * sameShapeFrac + 0.25 * sharedPivotFrac
```
computed against the already-selected set; `λ = diversity * maxBurden`. Pivot =
`fanOutRootsFor(s)` labels; shape = `classifyPathShape(s)[0]`. O(N·k) greedy, k =
maxItems — negligible.

### Sample output

```
_Ranked by burden, diversified (--diversity 0.6). Redundant siblings deferred._

DF-001  0.82  chart-bar.tsx        geometry-chain   pivot props.width
DF-002  0.71  concept-link.tsx     control-flow     pivot props.meta      ← jumped 9 ranks up
DF-003  0.79  chart-line.tsx       geometry-chain   pivot props.points
DF-004  0.55  field-row.tsx        domain-normaliz. pivot props.field     ← new file, modest burden, high novelty
…
(chart-bar's 2nd geometry sink, burden 0.80, deferred to DF-019 — same file+shape+pivot as DF-001)
```

---

## Approach 3 — Group sinks into "work units" by shared cause ⭐

**Blends into:** `work-packets` (changes the *unit* from sink → work unit).
**New flag:** `--units` (or default-on with `--sinks` to opt out).

**Idea.** The deepest reason chart-bar yields 7 packets is that 7 sinks descend
from the **same few helpers / the same pivot / the same packed object**. They are
one *unit of work*: extract the geometry model once and all 7 sinks simplify.
Group sinks within a file by shared cause and emit **one packet per unit**, listing
the sinks it covers. 30 sinks-from-9-files becomes ~12 units-from-9-files — and
because each file now contributes fewer units, the per-file cap (Approach 1) or
MMR (Approach 2) then naturally reaches *more* files within the same budget.

**Grouping key.** Two sinks share a unit when they share any of: a `packs[].key`
(same packed object — we already compute this for the sink-family split), the
same primary pivot (`fanOutRootsFor` top source), or the same dominant cross-file
helper (`report.helpers` reached from both). File-local.

**Why it helps.** Removes *artificial* concentration (the count was inflated by
one shared cause) so the remaining variety is real. It also makes each packet a
truer task: "fix once, N sinks improve" with an impact number.

### Sample output

```
## WORK UNIT DF-001 · chart-bar.tsx · geometry  (covers 5 sinks)
Extract the bar geometry from props.width / props.height once.

**Impact**
| sinks improved | shared pivot                 | shared cause            |
| -------------- | ---------------------------- | ----------------------- |
| 5              | props.width, props.height    | barWidth(), innerWidth()|

covers: width={…} (L88), x={…} (L91), transform={…} (L104), rect width (L97), height={…} (L72)

**Representative path** (the deepest of the 5)
F1:88  1. source  props
...
**Extraction proposal**
  function barGeometry(width, height, count): { x, width, height } …  → fixes all 5

## WORK UNIT DF-002 · chart-bar.tsx · legend control-flow  (covers 2 sinks)
   (the *other*, genuinely different problem in the same file — still surfaced)
```

> chart-bar's "7 items" collapse to **2 real units**; the freed budget reaches
> files the flat list never got to.

---

## Approach 4 — Hotspots: a file / feature roll-up view (the breadth map) ⭐

**New view:** `hotspots` (alias `coverage`). Promotes and deepens the existing
Feature Clusters table into a first-class "where is the work" view, at two
granularities (`--by file` default, `--by feature`).

**Idea.** One row per **file** (or feature), not per sink. This is the map the
user actually wants: 30 rows = 30 *places*, each summarizing its hotspots — count,
worst burden, dominant shape, dominant ownership, suggested first cut. Sorted by
total (or worst) burden, but every file appears once, so breadth is guaranteed.

**Why it helps.** Answers "where is all the work?" in one screen, and makes the
concentration explicit and *useful* (a file with 7 hotspots is a louder signal
than one with 1 — you just don't want 7 *packets* burying everything else).

**Tactical.** Aggregate `rankings.all` by `file` (or `featureKeyFor(file)`):
count, max/sum burden, modal `classifyPathShape`, modal `ownershipHintFor`,
`reachableSinks` max, and the single worst sink as a drill-in pointer. Reuses
`featureClusterRows` machinery.

### Sample output

```
# Hotspots  (by file)

> One row per file with render-path findings, so the spread of work is visible at
> a glance. Open work-packets --scope <file> to drill into one.

| File                                    | Hotspots | Worst | Dominant shape    | Ownership            | First cut                |
| --------------------------------------- | -------: | ----: | ----------------- | -------------------- | ------------------------ |
| components/tiles/chart-bar.tsx          |       12 |  0.82 | geometry-chain    | architectural fan-in | extract geometry model   |
| components/tiles/chart-line.tsx         |       10 |  0.79 | geometry-chain    | architectural fan-in | extract geometry model   |
| model-viz/concept-link.tsx              |        9 |  0.77 | control-flow-gate | local cleanup        | name the predicates      |
| tiles/histogram-chart.tsx               |        8 |  0.99 | geometry-chain    | architectural fan-in | extract null-bar geometry|
| inspector/context-panel/field-row.tsx  |        4 |  0.51 | domain-normaliz.  | feature hook         | normalize at the boundary|
| explorers/ecs-system/system-row.tsx     |        3 |  0.44 | cross-comp relay  | prop relay           | move state behind context|
| …42 files total, 7 with ≥4 hotspots …                                                                             |

## Concentration
- Top 5 files hold 71% of total ranked burden.
- 42 files have ≥1 finding; 7 have ≥4.
```

---

## Approach 5 — Concentration summary & coverage framing

**Blends into:** the header of `work-packets` / `repair-map` (and the Hotspots
view above).

**Idea.** Quantify the concentration the user noticed, so it's a *reported fact*
rather than a surprise: how much of the total burden lives in the top few files,
how many files have findings at all, and a one-line read. A Gini-ish
concentration ratio turns "feels stuck on 5 files" into "78% of burden is in 5 of
42 files — that's real, here's the long tail."

**Why it helps.** Sometimes concentration is the right answer (a few files really
are the problem); the user just needs to *see* that it's deliberate, plus a
pointer to the tail. Cheap situational awareness.

### Sample output

```
**Coverage**

_30 packets shown. Ranked burden is concentrated: top 5 files = 71%, top 9 = 90%.
42 files carry ≥1 finding. Use --spread / --diversity to widen, or `hotspots` for
the full per-file map._
```

---

## Approach 6 — Selection lenses (one knob to choose the trade)

**Blends into:** all packet/finding views. **New flag:** `--sort
burden|spread|coverage|quick-win`.

**Idea.** Make the depth-vs-breadth choice explicit instead of baking one in:

- `burden` — today's pure worst-first (depth).
- `spread` — Approach 1/2 diversified (breadth, still ranked).
- `coverage` — one per file then fill (maximum breadth; like Hotspots but as
  packets).
- `quick-win` — `rankings.quickWins` first (peripheral, high-confidence, low
  change-risk — naturally more spread out than the central-leverage giants).

**Why it helps.** Different goals on different days: "fix the single worst thing"
vs "scope a sprint across the codebase" vs "rack up safe wins." One flag, no new
analysis. `quick-win` is notable because the quick-win queue already de-prioritizes
the central-leverage monoliths that cause the clustering.

### Sample output

```
_Sort: coverage — at most one packet per file until every file is represented,
then fill remaining slots by burden._

DF-001 chart-bar.tsx · DF-002 concept-link.tsx · DF-003 field-row.tsx ·
DF-004 system-row.tsx · DF-005 search-hero.tsx · … (17 distinct files) …
then: DF-018 chart-bar.tsx (2nd) · DF-019 chart-line.tsx (2nd) …
```

---

## How they fit together

```
   pure burden sort (today)  ──►  feels "stuck on 5 files"
                                   │
        ┌──────────────┬──────────┴───────┬─────────────────┐
        ▼              ▼                   ▼                 ▼
  (3) work-units   (1/2) diversify    (4) Hotspots     (5) concentration
  collapse the     spread the         the per-file/     report the fact +
  *inflated* count selection          feature MAP       point at the tail
        │              │                   │                 │
        └──────────────┴─── (6) one --sort lens to choose ───┘
```

- **3** fixes *artificial* concentration (count inflated by one shared cause).
- **1/2** fix *selection* concentration (sort monopolized by heavy files).
- **4** gives the breadth map directly (the headline ask).
- **5** makes concentration legible when it's genuine.
- **6** lets the user pick depth vs breadth per run.

A natural default: ship **3 + 4 + 5** (truer units, a map, and honest framing) and
make **1/2** the behavior of a `--spread` / `--diversity` flag, with **6** as the
umbrella selector. Today's exact output stays available via `--sort burden`.

---

## Suggested sequencing

1. **Approach 4 (Hotspots view)** — highest answer-to-effort for "where is the
   work"; pure roll-up over `rankings.all`, reuses `featureClusterRows`. No risk
   to existing views.
2. **Approach 5 (concentration summary)** — a few lines; makes the issue legible
   immediately.
3. **Approach 3 (work-units)** — the most *correct* fix (de-inflates counts);
   moderate effort (grouping by `packs`/pivot/helper).
4. **Approach 1 then 2 (diversify / MMR)** — the selection knob; 1 is trivial, 2
   subsumes it with a smooth `--diversity`.
5. **Approach 6 (--sort lens)** — the umbrella once the modes exist.

## Risks & open questions

- **Don't hide the worst.** Diversification must never drop the single highest-
  burden sink, and suppressed siblings must remain visible (collapsed counts /
  Hotspots), or we trade a real signal for cosmetics.
- **Work-unit grouping fidelity.** Shared-pivot/pack/helper is a heuristic; two
  sinks sharing a pivot but needing different fixes shouldn't be force-merged.
  Group only when shape *and* pivot (or pack identity) match; list members so a
  human can split. Keep it file-local.
- **Stable IDs across modes.** `DF-00N` numbering currently tracks the burden
  sort; under diversify/units the same sink gets a different number run-to-run.
  Consider a stable per-sink id (`RPF-line-col`, already computed) shown alongside
  so baselines and references survive a sort change.
- **Default vs flag.** Changing the default selection reshapes everybody's output
  and baselines. Safer: keep `burden` the default, ship Hotspots + concentration
  as additive, and put spread/units/diversity behind flags until validated — then
  reconsider the default.
- **Feature-key coarseness.** `featureKeyFor` buckets by the first dirs under
  `src`; monorepos with multiple apps (modeler + railway-admin) may want the app
  segment included so `--by feature` doesn't merge unrelated apps.
```
