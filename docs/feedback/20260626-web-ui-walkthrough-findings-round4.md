# tsx-dataflow web UI — walkthrough findings, round 4 (post-fixes)

Distilled from the **06:41** screen-recording voiceover in
`~/Desktop/tsx-dataflow-0626a-context` (`transcript/transcript.txt` +
`transcript/transcript.srt`). This recording has **real, legible video** — all 40
frames in `frames/` are ~360–510 KB and readable, so every claim below is grounded
in both the audio and a specific frame. Frame timing follows the SRT (one frame
per 10 s: the comment at time `t` ≈ `frame_{floor(t/10)+1}`).

This is the fourth round, following
`docs/feedback/20260625-web-ui-walkthrough-findings.md` (round 1),
`...-round2.md` (round 2), and `...-round3.md` (round 3). **The tone is the most
positive yet** — the user opens "reviewing the latest… a number of changes here,"
repeatedly says things "feel pretty good," and closes with **"this is definitely
getting to be way better."** Almost all of round 3's items landed and were
confirmed on camera (see below).

The remaining work is mostly **refinement of things that just shipped** plus one
clear reversal: the round-3 **"Layers" sticky strip was built — and the user now
wants it removed** and its contents folded into the unified list instead. The
clusters this round:

1. **Header/toolbar tightening** — move the sort + filter pills up into one sticky
   header row, drop the redundant count, segment the sort buttons, fix the "Sort"
   label alignment, fix the overview sort caret wrapping.
2. **Finish the consolidation** (continuing) — remove the Layers strip, keep
   promoting report types (fan-out next) into the code-map list.
3. **Path/detail density** (continuing STEP-theme) — stop repeating the tall code
   snippet for consecutive same-line steps; move the Expression column left.
4. A tail of polish + two speculative feature ideas (network/graph view,
   branch-exclusive emphasis color).

**Files in play** (unchanged from prior rounds):

| File | Role |
|------|------|
| `src/server.mjs` | Routes + overview page + file-page assembly + per-file scoping |
| `src/core.mjs` | The analyzer: ranking, burden, defenses, junctions, report views |
| `src/html/code-map.mjs` | Annotated code map + finding/fork/junction detail panel + unified list + path overlay |
| `src/html/page.mjs` | HTML shell, all CSS, all client JS |
| `src/html/source-peek.mjs` | `path:line` previews + Open-file links |

Tags: **[ARCH]** structural · **[UX]** interaction/polish · **[BUG]** broken/inconsistent ·
**[MODEL]** analyzer/data-model · **[COPY]** wording.

---

## ✅ What landed well (round-3 fixes, verified on camera)

The user explicitly confirmed these — recording them guards against regression:

- **SORT-1 — sort toggle shipped.** The per-file list now has a `Sort score | type
  | line` control and the user calls the sorting "good." (transcript 5, 21) ✓
  (frames 10, 12: `Sort` + `score`/`type`/`line` pills; sort persists via `?lsort`,
  `code-map.mjs:1101-1104`, `page.mjs:525-531`.)
- **Overview column sorting works.** "These table headers clicked a sort, that's
  good… everything else about the sorting feels good. Styles look good."
  (transcript 3, 5) ✓ (frame 1: `Worst ▼` active column.)
- **ARCH-2 (partial) — boundaries promoted into the list.** "We've got findings and
  boundaries, that's good." (transcript 17) ✓ (frame 10/14: `BOUNDARY` badges
  alongside `FINDING`; push loop `code-map.mjs:1037-1059`.)
- **FORK-1 — fork sites are numbered, and the fork panel reads well.** "I'm really
  digging this… it's showing that all this stuff is relevant." (transcript 56) ✓
  (frame 32: `Fork sites — 3` as `1/2/3`, `Branch-exclusive computations — 3`,
  `Findings a split would fix — 18`.)
- **STEP-1 (partial) — consecutive path steps already collapse.** `groupPathSteps`
  (`code-map.mjs:103-129`) does run-length collapsing with `1–3` range ordinals and
  a `×N` badge — but only when the step *label* also matches, which is why the
  snippet still repeats (see STEP-2 below). The numbered-step chain itself the user
  still likes.
- **LAYERS-1 — the "Layers" sticky strip was built.** "The sticky layers thing at
  the top is new — I really like that this is up here." (transcript 11–12) ✓ — but
  see the reversal in **LAYERS-2**: the user concluded it isn't pulling its weight
  and wants it removed (frame 10/14: the `Layers | Code map | Findings | …` strip).
- **Defenses called out.** "These defenses… I guess that's okay, leave those there
  for now." (transcript 43–45) ✓ (frame 19: green `FALLBACK` step.)

> "Yeah, so I think this is definitely getting to be way better." (transcript 69)

---

## 🎯 Big theme #1 — tighten the per-file header: one sticky row, segmented sort, no redundancy

The single most-repeated cluster this round. The user wants the count, the filter
pills, and the sort control consolidated into **one header row that stays sticky**
while scrolling the code map — and several small alignment/dupe fixes on the way.

> "These pills just need to move up to this top header row, and then make this
> header row sticky." (transcript 63)

> "I'm not sure it's useful to say **36 items in this file** when we have a pill
> that says 36." (transcript 64)

> "Sorting would be better as a **segmented button group** as opposed to three
> independent pills." (transcript 66)

> "That should be **center aligned** where it says Sort and then the pills are next
> to it. Sort is elevated — there's probably some flex alignment problem there."
> (transcript 22–23)

### HEAD-1 — Drop the redundant "N items in this file" sentence **[COPY/UX]**
The count sentence `<strong>${entries.length} item(s) in this file</strong>` is
rendered at `code-map.mjs:1108`, directly above the filter pills whose **"All N"**
button (`code-map.mjs:1089`) already states the same number (frame 14: "34 items
in this file" sitting right above `All 34 | findings 20 | boundaries 4 | usages
10`). **Fix:** remove the count sentence (or fold its descriptive `<p class="meta">`
at `:1109` into a tooltip), letting the `All` pill carry the count.

### HEAD-2 — Make the sort buttons a real segmented group **[UX]**
The three sort buttons are independent `.esort` pills in `.entry-sort`
(`code-map.mjs:1101-1104`; CSS `page.mjs:345-350`), each with its own border +
`padding:2px 9px`. **Fix:** wrap `score|type|line` in a single segmented control
(shared border, internal dividers, one rounded outer radius, the active segment
filled) — matching INTENT §8 "it must look designed." This is the same treatment
the filter pills could share.

### HEAD-3 — Fix the "Sort" label vertical alignment **[UX/BUG]**
The `<span class="meta">Sort</span>` precedes the pills in a `display:flex;
align-items:center` row (`page.mjs:345`), but the bare text span has a smaller box
height than the bordered/padded pills, so the word reads as sitting high ("Sort is
elevated," transcript 23; frame 12). **Fix:** give the label a matching line-height
/ vertical padding (or `align-self:center` with consistent box metrics) so the
baseline lines up with the segmented group.

### HEAD-4 — Make the consolidated header row sticky **[UX]**
Once HEAD-1/2/3 land, the count+filter+sort row should `position:sticky` to the top
of the panel so it stays visible while the long list scrolls (transcript 63). The
panel/list container lives in `renderCodeMap` (`code-map.mjs:~1087-1111`); add a
sticky header wrapper around the filter + sort block.

---

## 🎯 Big theme #2 — finish the consolidation: remove the Layers strip, keep promoting report types

Round 3 added the Layers strip and promoted boundaries; the user now states the end
goal more bluntly than ever and **reverses** the Layers-strip decision.

> "I don't like that it just links me down to these reports. What I **really really
> really** want is for these reports to be integrated into the code map. So **code
> map should really be the only thing that exists.**" (transcript 12–14)

> "Now that I look at it, this Layers thing is just **not helpful**. These layers
> should really just be **moved down into this listing** here… I want the rest of
> these things to have views down in here." (transcript 15–18)

> "I don't like the sticky layers thing. I want to be able to click this **back to
> list** more easily. So… just get rid of the sticky Layers thing. It's not
> helpful." (transcript 52–54)

This is a direct restatement of **INTENT §1** ("one unified, typed, filterable
list… the standalone Reports section is a transitional artifact").

### LAYERS-2 — Remove the sticky "Layers" jump-strip **[ARCH/UX]** — *reverses round-3 LAYERS-1*
The strip is built in `renderFilePage` at `server.mjs:583-588` (the literal word
"Layers" is `server.mjs:585`) and injected at `server.mjs:600`; its sticky CSS is
`page.mjs:370-384` (`.layer-strip { position:sticky; top:0; z-index:50 }`). **Fix:**
delete the strip definition + injection + the `.layer-strip*` CSS block. Leave
`FILE_VIEWS`/`VIEW_LABELS` (`server.mjs:24-47`) and the sidebar "On this page" nav
(`fileNav`, `server.mjs:525-536`) in place — the user only objected to the *sticky
horizontal strip*, and still wants an easy "back to list." Confirm whether the
sidebar nav should also go (Open Q1).

### ARCH-2 (cont.) — Promote **every** report type into the list **[ARCH]**
> "I know Forks does [appear]… but some of these other ones I don't think they
> exist in the code map. Like **fan out** — [it should] exist in the code map, if
> not it should… We just need to **get the rest of these things in here.**"
> (transcript 19–20, 61)

This is the INTENT §1 backbone and the natural payoff once the Layers strip is
gone. The full promotion plan is large enough that it gets its own section below
(**"ARCH-2 expanded"**) — read that for the per-report design. The one-line
summary: the list gains **4 new entry types**, and the rest of the views fold in as
**facets** (sort modes, filter chips, detail-panel sections) rather than duplicate
rows, because most "reports" are re-cuts of the *same* sink objects already shown
as findings.

---

## 🧭 ARCH-2 expanded — a promotion plan for **all 19 report views**

The file page renders 19 views (`FILE_VIEWS` = `REPORT_VIEWS` minus `dossier`,
`server.mjs:24`; labels `server.mjs:27-47`). Today only **3 data sources** reach the
unified list, producing 5 badges:

| Source field | `renderCodeMap` param | Badge(s) | Built at |
|---|---|---|---|
| `report.rankings.all` (sinks) | `sinks` | `finding` / `usage` | `code-map.mjs:987-1015` |
| `report.repeatedForks` | `forks` | `fork` | `code-map.mjs:1016-1035` |
| `report.helpers` | `helpers` | `junction` / `boundary` | `code-map.mjs:1037-1059` |

`renderCodeMap` only accepts `{sinks, forks, helpers}` (`code-map.mjs:894-903`);
`server.mjs:547-553` feeds it three inline `.filter(x => x.file === relPath)`
slices. `ENTRY_TYPES` (`code-map.mjs:740-746`) has 5 types. The entry contract is
`{id, type, line, sortLine, score, row:{primary, secondary, metric, hue}, panelHtml}`
(documented `code-map.mjs:769-770`), and the helper push loop
(`code-map.mjs:1037-1059`) is the exact template every new type should mirror.

**The crucial structural fact (drives the whole plan):** of the 19 views, only a
handful are *new entities*. The rest — fan-in, prop-relay, work-packets,
repair-map, path-gallery, transformation-ledger, defensive-ledger, inline-preview —
are **render-time re-projections of `report.rankings.all`/`report.helpers`**, i.e.
the *same sink/helper objects already in the list*, re-sorted or re-grouped. Adding
them as new rows would list the same finding six times — a direct violation of
INTENT §3 ("the unit is the expression, not the finding") and §4 ("signal over
noise; don't crowd the list"). So they fold in as **facets of existing entries**,
not new rows.

That gives a three-tier taxonomy:

### Tier 1 — NEW entry types (genuinely distinct entities → new rows + badges)
Each already carries its own per-file `{file, line}` and a usable severity, so each
becomes a new `ENTRY_TYPES` entry + a per-file extractor mirroring the helper loop.

| View | Source field (real top-level array) | Row unit | `primary` | `score` source | New badge |
|---|---|---|---|---|---|
| **source-boundaries** | `report.sourceBoundaries` (`core.mjs:1350`, rows `:3740-3749`) | a source root / entry symbol | `row.symbol` | `sinkCount` / `sinkFiles.size` | `source` |
| **unknown-edges** | `report.unknownEdges` (`core.mjs:1349`, rows `:3653-3693`) | an unresolved edge/opaque call | `row.label` | `occurrences` + `affectedSinks.length` | `unknown` |
| **context-relay** | `report.contextRelay` (`core.mjs:1321-1326`, finds `:7846-7864`) | a parent→child prop-bundle relay | `childComponent` | `row.score` (already numeric, `:7861`) | `relay` |
| **fan-out** | recomputed from in-file sinks (`fanOutRows`, `core.mjs:7710`) | a source root that fans to many sinks | `root` label | `sinks` count / `maxDepth` | `fan-out` |

- **source-boundaries** and **unknown-edges** are the cleanest wins: real arrays,
  real `file`+`line`, already surfaced as overview counts (frame 1: "16 Unknown
  edges", "Source boundaries" report). Do these first.
- **context-relay** has an explicit numeric `score` already — straightforward, but
  its row is a *parent* JSX site (`parentFile`+`line`), so scope on `parentFile`.
- **fan-out** is the one the user named, but its natural unit is a *cross-file*
  source root (`fanOutRows` returns `[root, sinks, files, example, maxDepth]`,
  `core.mjs:7731-7737`) with **no single file/line**. Per-file approach: recompute
  `fanOutRows` over this file's sinks and anchor each row to the root's
  **definition line if it lives in this file** (else show it under its `example`
  sink or omit). This needs a small recompute, hence it lands *after* the two easy
  arrays despite being the user's headline example — note that ordering to them.

### Tier 2 — FACETS of entries already in the list (no new rows; enrich/sort/filter)
These are projections of `report.rankings.all` (sinks = findings) or
`report.helpers` (junctions/boundaries). They do **not** become rows — they become
ways to *sort, filter, badge, or detail* the rows that already exist.

| View | What it really is | How to fold it in (no duplicate row) |
|---|---|---|
| **fan-in** (`renderFanIn`, `core.mjs:5264`) | per-sink `mergeWidth` / predicate count | a **sort mode** ("by sources / merge width") on the existing finding rows + show `mergeWidth` in the detail panel |
| **prop-relay** (`renderPropRelay`, `core.mjs:5418`) | sinks classified pure vs transformed relay | a **filter chip** ("relay") + a one-word tag in the finding detail |
| **work-packets** (`renderWorkPackets`, `core.mjs:4841`) | prioritized subset of sinks (`report.workUnits`) | a **filter chip** ("actionable" / "quick wins"); the packet grouping becomes a detail note |
| **repair-map** (`renderRepairMap`, `core.mjs:5453`) | sinks bucketed quick-win / central / investigate | a **filter / group-by** (repair category) over the same finding rows |
| **path-gallery** (`renderPathGallery`, `core.mjs:5281`) | a sink + its representative path | **already the finding detail panel's path table** — nothing new; it *is* the detail |
| **transformation-ledger** (`renderTransformationLedger`, `core.mjs:5333`) | the worst sink's path steps | **already the detail path**; a file-level "churn ledger" can be a detail-panel tab, not a row |
| **defensive-ledger** (`renderDefensiveLedger`, `core.mjs:5370`) | aggregate of `sink.defenses[]` | **already the "Defenses" section** in the finding detail (`code-map.mjs:502`); optionally a "has defenses" filter chip |
| **inline-preview** (`renderInlinePreview`, `core.mjs:5784`) | keep-vs-inline recommendation per helper | a **line in the junction/boundary detail panel** (the helper is already a row) |

The payoff: instead of ~8 redundant badge types, the user gets a richer **sort
menu** (score, line, type, **merge width**), a richer **filter set** (findings,
usages, forks, junctions, boundaries, + relay, source, unknown, fan-out, "has
defenses", repair category), and fuller **detail panels** — all over one
non-duplicated list. This is exactly INTENT §1+§3+§4.

### Tier 3 — FILE-LEVEL AGGREGATES (header/summary, not list rows)
No per-item row unit; on a single-file page they describe *this file as a whole*.

| View | What it is | Where it belongs on the file page |
|---|---|---|
| **hotspots** (`hotspotGroups`, `core.mjs:5521`) | a per-**file** roll-up (count, worst, sumBurden) | the panel header / page summary — for one file it's just this file's totals (the count pill already shows part of it) |
| **path-census** (`renderPathCensus`, `core.mjs:5295`) | corpus path-depth percentiles (no rows) | a small stat line in the header ("path depth median/p90/max for this file") |
| **path-families** (`familyRows`, `core.mjs:7994`) | cross-file path-shape classes (no file/line) | a **chip/tag** on each finding showing its path signature, + an optional "families present" summary; not standalone rows |

### Mechanism / refactor to support all tiers
1. **Normalize extraction.** Replace the three inline filters (`server.mjs:547-553`)
   with one `entriesForFile(report, relPath)` that runs a per-type extractor list,
   each returning the `{id, type, line, sortLine, score, row, panelHtml}` contract.
   The helper loop (`code-map.mjs:1037-1059`) is the template; `helperSeverity`
   (`code-map.mjs:751-767`) is the template for deriving a `{type, hue, score}` from
   categorical fields (e.g. `unknownEdges.occurrences`, `sourceBoundaries.sinkCount`).
2. **Extend `ENTRY_TYPES`** (`code-map.mjs:740-746`) with `source`, `unknown`,
   `relay`, `fan-out` (label/plural/order + a badge color in `page.mjs`).
3. **Generalize `renderCodeMap`** to take a single `entries`/`items` array (or
   per-type params) instead of the fixed `{sinks, forks, helpers}`
   (`code-map.mjs:894-903`).
4. **Tier-2/3 are UI-only** — new sort options + filter chips
   (`code-map.mjs:1087-1104`, `page.mjs:505-531`) and detail-panel additions; no
   analyzer change. Prefer these over new analyzer fields (skill guidance: favor
   additive/UI-layer changes in `core.mjs`).

### Suggested ARCH-2 sequencing
- **A (new rows, low risk):** `source` + `unknown` — real arrays, real file/line,
  already overview-counted. Land the `entriesForFile` normalization here.
- **B (new rows):** `relay` (has a numeric score), then **fan-out** (needs the
  recompute-and-anchor step — this is the user's named example, so call out that
  it lands here, not first).
- **C (facets):** add the `merge width` sort mode (fan-in), then the `relay` /
  `has-defenses` / repair-category filter chips; surface `inline-preview` verdict
  in the junction detail.
- **D (header aggregates):** fold hotspots / path-census / path-families into the
  panel header + path-signature chips.

After A+B the user's literal ask ("get the rest of these things in here", "fan out
should exist") is satisfied with real rows; C+D complete the INTENT §1 vision
without flooding the list.

### LAYERS-3 — Sort-order: boundary nested "inside findings" feels arbitrary **[UX]**
> "The sort order is okay, although it's a little arbitrary that **boundary shows
> up inside the findings**." (transcript 61)

The default sort is score-desc then type then line (`code-map.mjs:1064-1069`), so a
high-score boundary interleaves among findings (frame 14). Low priority and the
user "doesn't know what to do with that" — but worth a deliberate decision: keep
score-primary (current), or group-by-type with score within group. Tie to the sort
control (Open Q2).

---

## 🎯 Big theme #3 — stop repeating the tall code snippet for consecutive same-line steps

The other repeated ask, hitting the finding-detail path table. STEP-1's run-length
collapsing shipped, but it only merges steps whose **label** is also identical, so
consecutive steps on the *same line* with *different kinds* still each render the
same multi-line snippet — making the panel very tall.

> "I don't like that we're **repeating the code sample for the same line multiple
> times**… we just need to report these lines one time and then somehow say one,
> two, three. Somehow merge these tables together so we're not repeating the code
> sample — the code sample is really tall and it just doesn't help to repeat it."
> (transcript 27–30)

> "If there's any way to just bring in a couple lines of code and then indicate
> that **items 14, 13, 12** — all of these for the relationship — are like the same
> code, it would be very helpful." (transcript 33–35)

### STEP-2 — Collapse the snippet by location, not by (location + label) **[UX]**
The path table renders one row + one `context:2` snippet per step via
`stepLocationHtml` (`code-map.mjs:55-77`, snippet at `:71/:76`). `groupPathSteps`
(`code-map.mjs:103-129`) *does* collapse runs, but its match key (`:107-111`)
requires `prev.step.line === step.line && (prev.step.label ?? "") === (step.label
?? "") && prev.step.file === step.file` — the **label equality** is what blocks the
merge. Frames 14 & 19 are the exhibits: steps 1/2/3 all `Task.ts:72`, steps 11/12
both `Relationship.ts:293`, each repeating the identical 5-line block.
**Fix:** when consecutive steps share `file`+`line`, render the snippet **once** and
list the step ordinals/kinds against it (e.g. "steps 1–3 · LITERAL, READ, CALL").
Either relax the grouping key to drop the label requirement, or keep distinct
labels visible inside one snippet-bearing row. Apply the same to the
"Representation-only hops" list (`code-map.mjs:188-217`; frame 21 shows ~14 ALIAS
rows on `Relationship.ts:253-295`).

### STEP-3 — Move the Expression column out of the far-right narrow slot **[UX]**
> "I don't like that this **expression is way over on the right hand side** — I
> didn't even think to go look for it. Expression should move over probably to the
> **second column**… I don't like that we've got this narrow thing that's making the
> row tall for no good reason." (transcript 36–41)

The path table columns are `# | Kind | Location | Expression` (header
`code-map.mjs:168`, expression cell `:157`). CSS widths (`page.mjs:238-249`): `#`
28px, `Kind` 64px, `Location` auto-wrapping, **`Expression` has no width** so it's
squeezed into whatever's left on the right and wraps tall (frame 14/21). **Fix:**
reorder to put Expression earlier (e.g. `# | Kind | Expression | Location`) and/or
give it a sensible min-width so it isn't the narrow tail column. Reconcile with
STEP-2 (a collapsed snippet row changes this layout).

---

## Polish, correctness & copy

### CARET-1 — Overview sort arrow wraps to its own line / grows row height **[BUG/UX]**
> "This arrow shows up as a new line — that's bad. We want the arrow to be on the
> **right-hand side** and to **not extend the height** of those." (transcript 3–4)

The overview "Files by burden" header caret is an inline `<span class="caret">▼` at
the end of the label inside a `display:block` anchor (`server.mjs:422-427`; CSS
`page.mjs:103-108`, `.caret { margin-left:4px }`). Nothing keeps it on one line, so
in a narrow column it wraps below the label and grows the header height (frame 1:
`Worst` with `▼` on the next line). **Fix:** make the header anchor a `flex`
row (`justify-content: space-between; white-space: nowrap`) or float the caret
right with `white-space:nowrap` on the label, so the arrow sits inline-right and
never adds a line. Trivial, high-trust (INTENT §6/§8).

### FORK-2 — Emphasize branch-exclusive computations with a distinct (yellow) color **[UX]**
> "The branch-exclusive computations — it might actually be nice if that was kind of
> **emphasized somehow**… if we had just sort of like a **yellow color**, maybe, in
> addition to this blue color, that might be helpful. Just get something on there."
> (transcript 57–59)

In `forkPanel` (`code-map.mjs:794-852`), all three lists (Fork sites, Branch-
exclusive computations `:813-820`, Findings-a-split-would-fix) use the same blue
`--accent` link color (`goto-line`/`xref`, `page.mjs:300/29`). Frame 32 shows the
three branch-exclusive entries (`xDataType`, `lineSeries`, `barData`) visually
indistinct from everything else. **Fix:** give the branch-exclusive list its own
accent (a yellow/amber token, distinct from the fork-gold `#b8860b` at
`page.mjs:305` and the burden-green) — a colored left-border, badge, or link color.
Pick the exact token (Open Q3).

### DEF-4 — "Defenses — 6" but only a couple listed: explain the count **[MODEL/COPY]**
> "It says **six**, even though there's only a couple listed up here. I assume that
> means there's multiple paths through this thing… we're rendering the worst path."
> (transcript 45–46)

The header count and the list both derive from `sink.defenses` (`code-map.mjs:502`
count, `:422-431` list — no slicing). So a 6-vs-2 mismatch is **upstream in the
data**: the count likely aggregates defenses across *all* paths while the rendered
detail shows the single worst path (the analyzer comment at `code-map.mjs:92-94`
notes only `??`/`?.` get recorded even when more guard sites exist). **Fix:** either
make the count match what's shown ("Defenses on this path — 2"), or add a one-line
note ("6 across N paths; showing the worst path"). The user is fine leaving it for
now but flagged the inconsistency (INTENT §6). Low priority; verify in `core.mjs`
how `defenses` is populated vs. counted.

### VIEWER-1 — A first-class viewer for the reports **[ARCH]** (continuing, exploratory)
> "It's nice to see [the reports], it's nice that they're interactive. But something
> is just **missing here in terms of there being a first-class viewer** for these
> things. I'll have to think about what to do with that." (transcript 7–9)

The reports currently render as standalone report pages (frame 6: the "Repeated
forks" markdown-ish report). This is the same pull as ARCH-2 / INTENT §1 — the
long-term answer is *absorb them into the unified list/detail panel* rather than
build a separate viewer. Captured as the umbrella the user is circling; no discrete
fix beyond continuing ARCH-2. The user explicitly deferred it.

---

## IDEAS — speculative features the user floated (low priority, captured)

### GRAPH-1 — A network/graph view of the call chain, not just the worst linear path **[MODEL/UX]**
> "At the moment we're rendering the worst path. But there really is something of a
> **large call chain** here — we're showing one linear path through this thing. If
> we had like **edges and nodes** and we rendered kind of the whole connectivity,
> that sort of view would actually be pretty nice. Almost like a **network diagram**
> showing the call stack, the call chain through here. Pretty helpful, I think."
> (transcript 47–51)

A genuinely new direction: alongside the linear path table, offer a node/edge graph
of the full reachable connectivity (the analyzer already builds a graph — overview
header says "23,261 Graph nodes," frame 1). Large; defer to a design pass. Tie to
INTENT §7 "show, don't tell."

---

## Suggested priority

| # | Item | Type | Effort |
|---|------|------|--------|
| CARET-1 | Overview sort arrow inline-right, no extra line | BUG/UX | trivial |
| HEAD-1 | Drop redundant "N items in this file" | COPY/UX | trivial |
| HEAD-3 | Fix "Sort" label vertical alignment | UX | trivial |
| HEAD-2 | Sort buttons → segmented group | UX | small |
| FORK-2 | Yellow emphasis on branch-exclusive computations | UX | small |
| STEP-3 | Move Expression out of far-right narrow column | UX | small |
| LAYERS-2 | Remove the sticky "Layers" strip | ARCH/UX | small |
| HEAD-4 | Make the consolidated header row sticky | UX | small–med |
| STEP-2 | Collapse repeated snippet by location (not label) | UX | medium |
| DEF-4 | Reconcile/explain the Defenses count | MODEL/COPY | small–med |
| ARCH-2 | Promote all report views into the list (see "ARCH-2 expanded") | ARCH | large (phased A→D) |
| ↳ A | New rows: `source` + `unknown` + `entriesForFile` normalization | ARCH | medium |
| ↳ B | New rows: `relay`, then `fan-out` (recompute+anchor) | ARCH | medium |
| ↳ C | Facets: merge-width sort, relay/has-defenses/repair filters, inline-preview in detail | UX | medium |
| ↳ D | Header aggregates: hotspots / path-census / path-family chips | UX | small–med |
| LAYERS-3 | Decide boundary-in-findings sort order | UX | small (rides ARCH-2) |
| VIEWER-1 | First-class report viewer (= continue ARCH-2) | ARCH | large |
| GRAPH-1 | Network/graph call-chain view | MODEL/UX | large |

Suggested sequence: clear the trivial trust-wins (**CARET-1, HEAD-1, HEAD-3**),
then the header consolidation pair (**HEAD-2 → HEAD-4**) and the removal it enables
(**LAYERS-2**), then the detail-density fixes (**STEP-3 → STEP-2**), the quick
polish (**FORK-2, DEF-4**), then resume the backbone (**ARCH-2** fan-out and on).
Defer **GRAPH-1** / **VIEWER-1** to a design pass.

---

## Open questions (worth your input before building)

1. **LAYERS-2 scope.** Remove only the sticky *horizontal* strip
   (`server.mjs:583-588`), or also the sidebar "On this page" nav
   (`fileNav`, `server.mjs:525-536`)? The transcript only objects to the sticky
   strip and still wants an easy "back to list," so the plan is: remove the strip,
   keep the sidebar — confirm.
2. **Sort default & grouping (LAYERS-3).** Keep score-desc primary (boundaries
   interleave among findings), or group-by-type with score *within* type so
   boundaries don't "show up inside the findings"? The user flagged it as arbitrary
   but had no strong preference.
3. **FORK-2 color.** Which token for branch-exclusive emphasis — an amber/yellow
   link color, a left-border accent, or a badge? Constraint: distinct from the
   fork-gold (`#b8860b`) and the burden-green already in use.
4. **HEAD-2 segmented group.** Apply the segmented treatment to *just* the sort
   buttons, or also to the filter pills (All/findings/boundaries/usages) so the
   whole header reads as one designed control row?
5. **STEP-2 collapse key & labels.** When collapsing consecutive same-line steps,
   show the distinct kinds inside the single snippet row ("steps 1–3 · LITERAL,
   READ, CALL"), or just the range ("steps 1–3")? And collapse purely on
   `file`+`line`, or also require same kind?
6. **STEP-3 column order.** Reorder the path table to `# | Kind | Expression |
   Location`, or `# | Expression | Kind | Location`? (Expression earlier, Location —
   with its reveal snippet — last.)
7. **GRAPH-1 / VIEWER-1.** Both are deferred design items — confirm they're parked
   for a later dedicated pass rather than this round.
8. **ARCH-2 taxonomy buy-in.** The expanded plan promotes only 4 views as *new
   rows* (`source`, `unknown`, `relay`, `fan-out`) and folds the other ~8
   sink-derived views in as **facets** (sort/filter/detail), not rows, to avoid
   listing the same finding many times (INTENT §3/§4). Confirm that's the right call
   vs. literally one badge per report view. (If you want every view as its own row,
   say so — it's more work *and* noisier.)
9. **ARCH-2 fan-out expectation.** Fan-out is your named example but its unit is a
   cross-file source root with no single file/line, so it lands in phase **B** (after
   the two easy arrays) and is anchored to the root's in-file definition. OK to
   sequence it there rather than first?
10. **Tier-2 facets — sort vs. filter.** For fan-in / prop-relay / work-packets /
    repair-map, do you want them as **filter chips**, **sort modes**, or a
    **group-by** toggle? (They can be more than one, but pick the primary.)
