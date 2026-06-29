# tsx-dataflow web UI — walkthrough findings, round 7 (the homepage fan-out section: make it a list, tame the graph, point toward tabs)

Distilled from the **6:25** screen-recording voiceover in
`~/Desktop/tsx-dataflow-fan-out-more-context` (`transcript/transcript.txt` +
`transcript/transcript.srt`). The recording has **real, legible video** — all 39
frames in `frames/` are ~260–480 KB and readable, so every claim below is grounded
in both the audio and a specific frame. Frame timing follows the SRT (one frame per
10 s: the comment at time `t` ≈ `frame_{floor(t/10)+1}`).

**Same context as rounds 5–6:** the footage is again from a **different repo**
(`git-visual-files`, a Solid/SolidStart app) than this one — the frames show that
repo's components (`DiffModal.tsx`, `useCommitsTableContext`, `RefPicker.tsx`,
`branchData()`, …), which this repo doesn't contain. The **code locations below are
pinned in *this* repo's source** (the renderers are repo-agnostic); the frames are
evidence of behavior, not of this repo's files.

This is the **seventh** round, following r1–r6 (`...-findings.md`, `...-round2.md`
… `...-round6.md`). It is a **focused, mostly-positive round** reviewing the
**round-6 fan-out work** now that it has shipped. The user opens with *"this is
after the updates from round six… first thing I see these fan outs on the home
page. This is much much better. So I like this"* (SRT 1, 4) and closes with *"this
fan out is looking much much much better"* (SRT 68). Everything below is the **next
layer**: the homepage fan-out section is **the right feature in the wrong shape** —
it stacks a dozen full graphs where it should be a selectable list driving a single
graph — plus a clear architectural heading: **move the homepage toward page-level
tabbed viewers and retire the left sidebar.**

**Files in play** (unchanged):

| File | Role |
|------|------|
| `src/server.mjs` | Routes + overview page + file-page assembly + per-file scoping + nav |
| `src/core.mjs` | The analyzer: ranking, burden, fan-out/in data model, report views |
| `src/html/code-map.mjs` | Annotated code map + unified list + detail panels + the fan-out SVG |
| `src/html/page.mjs` | HTML shell, all CSS, all client JS |
| `src/html/source-peek.mjs` | `path:line` previews + Open-file links |
| `src/html/markdown-to-html.mjs` | report-view markdown rendering |

Tags: **[ARCH]** structural · **[UX]** interaction/polish · **[BUG]** broken/inconsistent ·
**[MODEL]** analyzer/data-model · **[COPY]** wording.

---

## ✅ What landed well (round-6 fixes, verified on camera)

Round 6's five items all shipped and the user reacts positively (or stops
complaining, which is its own signal):

- **HOME-1 — the cross-file fan-out graph now lives on the overview/homepage.**
  Confirmed in code: `renderOverview` builds a "Detected fan-outs" section
  (`server.mjs:529-553`) from `fanOutEntriesGlobal(report.rankings.all)`
  (`server.mjs:534`, builder at `core.mjs:7838-7877`). Frames 2, 7, 12, 24 show it
  with the copy "Detected fan-outs / Shared sources that fan out to many render
  sinks across files…" and per-source graphs. *"First thing I see these fan outs on
  the home page. This is much much better."* (SRT 4) ✓
- **GRAPH-GROUP-1 — sinks are grouped into per-file bands, file name shown once.**
  `fanOutGraphSvg` buckets sinks into a `byFile` map and renders one labeled band
  per file (`code-map.mjs:1133-1188`). Frames 5/7/12 show `TreeRows.tsx`,
  `CommitsHeaderRow.tsx`, `CommitHoverCard.tsx`, `CommitsTable.tsx` as bands. The
  user **loves** this rendering: *"Really really like how the usage here is shown by
  the consuming component… this context is being consumed by DiffModal props… this
  is just a super clear candidate for refactor."* (SRT 16–19) ✓
- **GRAPH-COLOR-1 — distinct golden-angle per-file colors replace the hash.**
  `fanoutFileColors` (`code-map.mjs:1094-1103`) walks hues by the golden angle
  (≈137.5°) so files no longer collide on near-identical hues. The user did **not**
  re-raise the color complaint this round — it's resolved. ✓
- **HOME-2 — the per-file fan-out panel collapsed to a one-line up-link.**
  `fanOutPanel` (`code-map.mjs:1220-1239`) no longer calls `fanOutGraphSvg`; it
  shows a one-liner + *"See the full fan-out graph on the overview →"*. ✓
- **BURDEN-1 — burden breakdown is always-visible inline pills.**
  `burdenBreakdownHtml` (`code-map.mjs:551-588`) renders `<ul class="bd-pills">`, no
  `<details>`, no full-width bars. Not mentioned this round — the frustration is
  gone. ✓

---

## 🎯 Big theme #1 — the fan-out section must be a *selectable list* driving a *single* graph, not a dozen full graphs stacked

This is **the** ask of the round, stated up front and repeated:

> "I would prefer to see these as a **list of the items with a single graph being
> rendered. It's not helpful to render all of these like this.** So let's have a
> list of selectable things. And then when you pick one it renders that specific…
> network diagram." (SRT 6–9)

> "Again, this is another one that would benefit from two columns and then I can
> very quickly make sense of what's going on." (SRT 67)

The code confirms exactly what he's reacting to: the overview renders **up to 12
full SVG graphs stacked vertically**, each its own `<section class="fanout-entry">`,
joined end to end (`server.mjs:543-552`, cap `FANOUT_GRAPH_LIMIT = 12` at `:533`).
That's why the page is a mile of node-edge diagrams (frames 2, 7, 12, 24, 37) — the
user has to scroll through every fan-out's full spread whether or not he cares about
it. This is also a direct restatement of **INTENT §1** (one unified, *selectable*
list; selecting an entry renders its detail) — the section currently violates §1 by
materializing every detail at once.

### FANOUT-LIST-1 — Overview fan-out: a selectable list + one rendered graph **[ARCH/UX]** (large)
> "Let's have a list of selectable things. And then when you pick one it renders
> that specific network diagram." (SRT 7–9)

**Fix (decided — tab strip + dropdown, single rendered graph).** Replace the
stacked-sections render (`server.mjs:543-552`) with a **selector that renders one
graph at a time**:
- A **tab strip of the 5 heavy-hitter sources** (the top entries by the active sort),
  each tab labeled with its source + sort value (e.g. `useDiffModalContext · 74`).
- A **dropdown** holding **all the other** sources (the remaining 38 of 43), so every
  detected fan-out is reachable without scrolling a wall of graphs.
- **Exactly one** `fanOutGraphSvg` rendered — for the selected source.
- **Selection lives in the URL** (decided — e.g. `?fanout=<source>`), so a refresh
  re-renders the same graph (INTENT §5). The existing anchor helper
  `fanOutAnchor(fo.root)` (`server.mjs:545`) gives a stable id to key on.

All the data is already on each `fanOutEntriesGlobal` entry (`root`, `sinkCount`,
`fileCount`, `maxDepth`, `graphSinks` — `core.mjs:7866-7875`), so building the tab
strip + dropdown over all 43 is free; only the selected entry costs a graph render.
This is the natural home for the "12 of 43" fix (FANOUT-COUNT-1) — the dropdown *is*
the answer to "what are the other 31" — and for the depth/sort affordances
(FANOUT-DEPTH-1, FANOUT-SORT-1). Note this viewer is itself the **fan-out tab**
inside the page-level report tab strip (ARCH-TABS-1).

---

## 🎯 Big theme #2 — tame the graph itself: one line per file, not per sink; two columns; reclaim the whitespace

The user likes the *grouped* picture but says it draws far too much, and wastes
vertical space.

### FANOUT-EDGE-1 — Aggregate edges to one line per file band, not one per sink **[UX]** (medium)
> "Really at this point we're going from the item over to the file. **I don't think
> we need to render every single edge. It's just noise. It's good enough to just
> render a line over to the file.**" (SRT 11–13)

**Confirmed in code.** `fanOutGraphSvg` pushes an edge **inside the per-sink loop**
(`code-map.mjs:1189-1191`) — one cubic-Bézier curve from the source to *each* sink's
own `cy`. A band of 60 sinks draws 60 near-parallel curves into the same box (frames
5, 7, 12, 37 — the dense fans into `CommitsTable.tsx`/`DiffModalComparisonView.tsx`).
**Fix:** draw **one edge from the source to each file band** (route to the band's
left-center, colored by the file's hue), not one per leaf. The per-sink rows stay as
bullets *inside* the band; only the connecting line collapses. This is both less
noise and faster to render — and it makes the "what fans where" story read at a
glance.

### FANOUT-GRID-1 — Lay the *network diagram itself* out in three columns (source · consumers · consumers) **[UX]** (medium)
> "We've got a bit of **excess height here and white space**… if we could render
> these as **two columns**." (SRT 14–15) · "would benefit from two columns." (SRT 67)

**Clarified (decided).** "Columns" refers specifically to the **node-edge diagram**,
not the page sections. The desired layout is **three columns**:
1. **Column 1** — the single source node that's fanning out (`useCommitsTableContext`,
   etc.), vertically centered.
2. **Columns 2 & 3** — the **consumer file bands split across two columns** instead
   of one tall vertical list.

Today `fanOutGraphSvg` stacks every band in a single vertical run on the right
(`code-map.mjs:1160-1188`), so a source with many files runs off the bottom of the
screen (frames 2, 5, 7, 12, 24 — the bands march straight down). **Fix:** flow the
per-file bands into **two side-by-side columns** to the right of the source, halving
the height and filling the wide empty right margin. Edges fan from the source to
bands in **both** columns (and, per FANOUT-EDGE-1, one edge per band). This is a
layout change inside `fanOutGraphSvg`'s SVG geometry (band `x`/`y` placement), not a
page-section change.

---

## 🎯 Big theme #3 — point the homepage at page-level tabs and retire the left sidebar; reconcile the flat fan-out report into the network view

The user is explicit about direction, even while saying "for now" keep it simple:

> "I do think it would help to have something at the top just indicating the
> sections… basically where I'm headed with this is **I want to move away from this
> left sidebar that has things to open and basically have everything be selectable
> tabs on the page itself**… the left sidebar probably goes away." (SRT 71–77)

> "This fan out page access from the left sidebar is basically useless… **the
> network view is way way better than this view, which means this view can probably
> just go away.** … A much better version of the fan-out report would be something
> that displays the info that's available in this network diagram… **we want the
> fan-out report to look more like a network view where it lists everything and
> shows the depth and the usage.**" (SRT 79–88)

> "For now… kind of **set this home page up so that we can start to add more
> items**. Because basically everything over here that is a report **needs to be its
> own sort of holistic viewer.**" (SRT 90–92)

This is INTENT §1 restated as an architecture: the standalone report pages and the
left "Reports" sidebar are transitional; each analysis type should become a
first-class, on-page, selectable viewer.

### ARCH-TABS-1 — Build the page-level report tab strip; fan-out tab shows the new viewer, the rest show their current report **[ARCH]** (large)
The left sidebar's Files + Reports lists come from `overviewNav(report, url)`
(`server.mjs:366-396`), shared by the overview and the `/report` pages. **Decided —
build the tab strip this round, not just a scaffold:** *"convert things over so that
we have the tab strip and the reports as they currently sit, and at this point the
fan-out one will just show the new thing. The other ones will show their current
thing."* (SRT, Q6 answer)

So this round delivers:
- A **tab strip across the report views** (Fan-out, Fan-in, Boundary, Junctions, …,
  sourced from the same `REPORT_VIEWS` / `reportAssets` list the sidebar uses,
  `server.mjs:352-389`), with **section headers at the top** (SRT 71) and the active
  tab in the URL.
- The **Fan-out tab renders the new list+graph viewer** (FANOUT-LIST-1).
- **Every other tab renders its current report content** on-page, unchanged — the
  existing `renderReport` output, just hosted in the tab instead of behind a sidebar
  link.
- The left sidebar's **Reports** list is now redundant with the tab strip; the user
  will drive its retirement (and per-report improvement/retirement) in a **later
  round** after reviewing each tab. *"Then I'll go through and provide feedback on how
  we should improve or retire the other reports."* Don't remove the sidebar yet.

### REPORT-RECONCILE-1 — Fan-out report → the network view, with the raw markdown shown beneath it; then improve the markdown **[ARCH/MODEL]** (medium–large)
> "The network view is way way better than this view… we want the fan-out report to
> look more like a network view where it lists everything and shows the depth and the
> usage." (SRT 81, 88)

The standalone `/report?view=fan-out` (frame 33) is a **flat markdown table** —
`renderFanOut` (`core.mjs:5251-5259`) emits `Source | Sinks | Files | Example sink |
Max depth` via `tableReport`, built from the **legacy `fanOutRows`** shape
(`core.mjs:7737-7767`), *not* the richer `fanOutEntriesGlobal` objects that feed the
web pages. **Decided — swap the fan-out view over to the network view (the new
viewer), AND show the actual markdown beneath it:**
- The fan-out **tab/report shows the network view** (the FANOUT-LIST-1 viewer) as the
  primary content.
- **Below it, render the actual `.md`** (what `/api/report.fan-out.md` serves) so any
  **quality gap between the web view and the markdown is visible side by side.**
  Rationale (user): *"ultimately the agent is going to be consuming the markdown
  view"* — the markdown is the real deliverable, so its quality must be inspectable
  next to the rich web view.
- **Then improve the markdown view itself** so it carries the same "lists everything,
  shows depth and usage" content as the graph — i.e. re-point `renderFanOut` off the
  legacy `fanOutRows` and onto `fanOutEntriesGlobal`, emitting per-source per-file
  sink breakdowns + depth (a textual mirror of the network view), not a 5-column
  summary table. The `.md` export must keep working for `/api/report.fan-out.md`.

This pattern (rich web view + raw markdown beneath + keep them in sync) is the model
for reconciling the *other* report views too, once the user reviews them.

---

## Detailed issues (the polish asks within the fan-out viewer)

These all live inside the fan-out section and are largely *enabled* by
FANOUT-LIST-1, but each stands on its own.

### FANOUT-DEPTH-1 — Show per-item depth ("steps removed") so derived sinks read as derived **[MODEL/UX]** (medium)
> "From the top, it's not obvious that these are **derived**. Maybe that's what's
> missing… next to these we should show the **depth or the number of steps removed**
> — just something that indicates that as you're walking through this we're seeing
> various levels of derived items." (SRT 35–40)

**Confirmed gap in the data model.** Each graph sink is a `reachedSinkDescriptor`
(`core.mjs:3681-3690`) carrying only `{ id, file, line, label }` — **no per-sink
depth**. The only depth is the **entry-level `maxDepth`** (`Math.max` over sinks'
`metrics.maximumPathDepth`, `core.mjs:7858-7861`). The raw `maximumPathDepth` is in
scope at the accumulation loop (`core.mjs:7857`) but **discarded**. **Fix (decided —
use the cheap, already-computed value, keep it simple):** propagate the sink's own
`metrics.maximumPathDepth` onto each `reachedSinkDescriptor` (`core.mjs:3681`) and
render it next to each leaf bullet in the band (e.g. `:512 DiffModal / isOpen · d3`).
**Do not** build true "steps-from-this-root" distance tracking yet — ship the simple
thing and revisit only if it proves insufficient.

### FANOUT-SORT-1 — Make the sort key visible and controllable; an invisible sort reads as "random and wrong" **[UX/BUG]** (small–med)
> "I can't tell how these are sorted. I'm seeing like random… appears to be random
> by line. I don't know if it's depth or something… let's just indicate the sort
> order. And probably want to allow the user to control that — by line order, depth,
> whatever. **General rule: if we're sorting by something, we need that value to be
> visible, that way the user can tell how things are being sorted. Otherwise it looks
> random and wrong.**" (SRT 41–52)

The overview fan-outs **are** sorted — by `sinkCount` descending (`core.mjs:7876`),
and the copy says "by spread" (`server.mjs:540`) — but the **sort key isn't called
out** and **depth is never a sort option** (`core.mjs` sorts only by sink count;
depth is display-only). Within a single graph, leaf bullets appear in sink-discovery
order, which reads as "random by line." **Fix:** (1) in the FANOUT-LIST-1 list,
**show the value being sorted on** for each source (badge the active key:
`spread 74` / `depth 16`) and **indicate the active sort**; (2) offer a small sort
control (spread / depth / name) — the per-file list already has exactly this pattern
(`code-map.mjs:1564-1576`, segmented `score | type | line | sources` buttons with an
`active` class) to mirror. This is INTENT §6 (a control labeled X sorts by X; show
the value). **Decided — only offer sort keys already available or within reach**
(spread/sink-count, which is the current sort; depth, now exposed by FANOUT-DEPTH-1;
file count and name are free off the entry). **Add nothing new**; revisit if it
needs improving.

### FANOUT-DEF-1 — The source node needs a jump-to-definition link **[UX]** (small–med)
> "I would also like to see this item on the left. **I need some way to go find its
> definition.** … I would like to be able to click and jump to the definition of
> something like `useCommitsTableContext`. At the moment I don't actually see that —
> **I had to click through and then go find an import, which is not what I want to
> do.**" (SRT 22–26)

The source pill on the left of the graph (frames 5, 7, 12 — `useCommitsTableContext`
in a rounded rect) is **not a link**. In `fanOutGraphSvg` the source is drawn as a
plain `<rect>`+`<text>` with no anchor, and the entry's `line` is `null` for the
global variant (`core.mjs:7874`) so there's nothing to link to today. **Fix:** carry
the source's definition `file:line` on the global entry (it's available where the
root is identified) and wrap the source node in a link to that location (scroll-to /
source-peek, consistent with how locations link elsewhere — INTENT §2/§7). The
sinks already link to their files; the **source** is the missing one.

### FANOUT-COPY-1 — Add copy defining a fan-out, and flag single-file vs cross-file **[COPY]** (small)
> "It would help to just provide a little bit of **copy indicating these are how
> we've defined a fan out**. The ones up above it's clear — oh, they're in multiple
> files, that seems like a problem. But… `props.isOpen` is another one of these like
> **fan out inside of a single file**, and so it'd be good to just get some text that
> indicates that's what's going on here." (SRT 29–55)

The distinction the user wants is **already in the data**: `fileCount === 1` is a
single-file fan-out, `>= 2` is cross-file (`core.mjs:7870`; frame 24 literally shows
`RefPicker › props.isOpen · 23 sinks across 1 file · max depth 18`). But nothing
*explains* it. The user sharpened **why** the distinction matters: *"the single-file
scenario is pointing at some sort of split that needs to be done, whereas the
multi-file is conveying actual usage across files."* **Fix (decided):** (1) a
one-line definition at the top of the section ("A fan-out is a single source whose
value is consumed by many render sinks; changing it touches them all"); (2) a small
**"single-file" vs "cross-file" tag** on each entry keyed off `fileCount` — single-
file framed as *a candidate split*, cross-file as *real cross-file usage*.
**Decided — tag in place for now** (no separate list/section); keep an eye on whether
it should become a meaningful split later. This satisfies INTENT §6 (classifications
should be explainable).

### FANOUT-COUNT-1 — Reconcile "showing 12 of 43" with what's actually on screen; list the rest **[UX/BUG]** (small)
> "I can't tell if this is the **end of the fan-outs or the end of the reported
> fan-outs**. Up at the top it said it was showing 12 of 43… but this thing stops at
> five. Either being able to see more than 12 if that's easy, or just give a hint as
> to what the other 31 are — maybe just list their name and their depth even if we're
> not going to render the full tree. … It's hard to know if **this data is already
> available** or if we're actually doing a bunch of work for each of these." (SRT
> 58–66)

Two real problems: (1) the header says "Showing the top 12 of 43 by spread"
(`server.mjs:538-542`) but tall graphs mean only ~5 are visible before the user
gives up scrolling — the count and the felt experience disagree; (2) there's no way
to see the other 31. **Answer to his data question:** `fanOutEntriesGlobal` already
returns **all 43 entries** (`server.mjs:534` slices to 12 only for *rendering* —
`:535`); listing every name + depth is **free**, no extra analysis.
**Fix (subsumed by FANOUT-LIST-1):** the selectable list shows **all 43** sources
(name · spread · files · depth) up front; only the *selected* one renders a graph.
That makes "is this the end?" unambiguous and answers "what are the other 31" at
zero extra cost.

---

## Suggested priority

| # | Item | Type | Effort |
|---|------|------|--------|
| ARCH-TABS-1 | Page-level report tab strip; fan-out tab = new viewer, rest = current | ARCH | large |
| FANOUT-LIST-1 | Fan-out tab → 5-tab + dropdown selector, single URL-keyed graph | ARCH/UX | large |
| FANOUT-EDGE-1 | One edge per file band, not per sink (kill the noise) | UX | medium |
| FANOUT-GRID-1 | Three-column diagram: source · consumers · consumers | UX | medium |
| FANOUT-COPY-1 | Define "fan-out"; tag single-file (split) vs cross-file (usage) | COPY | small |
| FANOUT-SORT-1 | Show + control the sort key; existing keys only | UX/BUG | small–med |
| FANOUT-DEPTH-1 | Per-sink `maximumPathDepth` on descriptors + render at leaves | MODEL/UX | medium |
| FANOUT-DEF-1 | Jump-to-definition link on the source node | UX | small–med |
| FANOUT-COUNT-1 | All sources in the dropdown; fix "12 of 43 / stops at 5" | UX/BUG | small (rides FANOUT-LIST-1) |
| REPORT-RECONCILE-1 | Fan-out report → network view + raw markdown beneath; improve `.md` | ARCH/MODEL | medium–large |

**Suggested sequence.** Build **ARCH-TABS-1** as the frame first — the page-level
report tab strip (URL-driven), every existing report hosted in its tab unchanged, so
there's a place for the new fan-out viewer to live. Then the headline
**FANOUT-LIST-1** as the **Fan-out tab** (tab strip of 5 heavy hitters + dropdown,
single rendered graph, URL-keyed) — it **subsumes FANOUT-COUNT-1** (the dropdown is
"what are the other 31") and is where depth (**FANOUT-DEPTH-1**), sort transparency
(**FANOUT-SORT-1**), the single/cross-file tag + copy (**FANOUT-COPY-1**), and the
source jump-link (**FANOUT-DEF-1**) all surface. The two graph-rendering fixes —
**FANOUT-EDGE-1** (one edge per band) and **FANOUT-GRID-1** (three-column source ·
consumers · consumers) — improve the SVG *wherever* it renders and can land in
parallel; doing them alongside the viewer means it ships with a good graph.
**REPORT-RECONCILE-1** is the close-out: point the Fan-out tab at the network view,
show the raw `.md` beneath it, then upgrade `renderFanOut` to the richer entry shape.
The cheap, self-contained wins (**FANOUT-EDGE-1**, **FANOUT-COPY-1**,
**FANOUT-SORT-1**) are fine to land first for immediate relief if you want quick
progress before the larger tab/viewer work.

---

## Decisions (resolved — these are now part of the plan)

1. **FANOUT-LIST-1 selection UX** → a **tab strip of the 5 heavy-hitter sources** +
   a **dropdown** for all the rest; **exactly one graph** rendered for the selected
   source; **selection in the URL** so a refresh restores it.
2. **FANOUT-GRID-1 "columns"** → refers to the **network diagram**, not page
   sections. **Three columns:** col 1 = the fanning-out source; cols 2 & 3 = the
   consumer file bands split across two columns instead of one vertical list.
3. **FANOUT-DEPTH-1 depth metric** → render the **cheap, already-computed**
   `metrics.maximumPathDepth`; keep it simple, enhance later only if needed. No
   from-root distance tracking yet.
4. **FANOUT-SORT-1 keys** → offer **only what's already available or within reach**
   (spread/sink-count, depth, file count, name). Add nothing new; revisit later.
5. **FANOUT-COPY-1 single vs multi-file** → **tag in place** for now (single-file =
   candidate split; multi-file = real cross-file usage). Keep an eye on whether it
   should become a meaningful split/section later — not yet.
6. **ARCH-TABS-1 scope** → **build the tab strip this round.** Fan-out tab = new
   viewer; **all other tabs = their current report content**, unchanged. Don't remove
   the left sidebar yet — the user will review each tab and drive
   improve/retire decisions in a later round.
7. **REPORT-RECONCILE-1** → fan-out **swaps over to the network view**; **show the
   actual markdown beneath it** (so any web-vs-markdown quality gap is visible — the
   agent consumes the markdown); **then improve the markdown view** (re-point
   `renderFanOut` onto `fanOutEntriesGlobal` with per-file sink + depth breakdowns).
   The `.md` export must keep working. This rich-view-plus-raw-markdown pattern is
   the template for reconciling the other report views later.
8. **INTENT updates** → **approved** — fold the three below into `INTENT.md` as part
   of this work.

---

## INTENT updates (approved — to be applied)

- **§1 / §7 — the fan-out *picture* is governed by selection, not by materializing
  every detail.** The overview/fan-out tab shows a **tab strip + dropdown of detected
  fan-outs**; only the selected source renders its graph (selection in the URL). A
  section that stacks every detail at once violates §1 even when each detail is good.
- **New principle (under §6/§7) — collapse redundant visual signal.** In a
  relationship picture, draw **one connector per group (file), not one per leaf**;
  the grouped bands carry membership, the edge only needs to say "source → this
  file." (And lay a wide fan across **multiple columns**, not one tall list.)
- **§8 / direction — the homepage is moving to page-level tabbed report viewers**,
  each analysis type a holistic on-page viewer (rich view + raw markdown beneath, kept
  in sync because the markdown is the agent's deliverable), with the left "Reports"
  sidebar slated for retirement once enough viewers are on-page.
