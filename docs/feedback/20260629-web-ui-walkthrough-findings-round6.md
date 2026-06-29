# tsx-dataflow web UI — walkthrough findings, round 6 (the fan-out graph + burden breakdown)

Distilled from the **3:59** screen-recording voiceover in
`~/Desktop/tsx-dataflow-fan-out-comments-context` (`transcript/transcript.txt` +
`transcript/transcript.srt`). The recording has **real, legible video** — all 24
frames in `frames/` are ~300–432 KB and readable, so every claim below is grounded
in both the audio and a specific frame. Frame timing follows the SRT (one frame per
10 s: the comment at time `t` ≈ `frame_{floor(t/10)+1}`).

**Same context as round 5:** the footage is again from a **different repo**
(`git-visual-files`, a Solid/SolidStart app) than this one — the frames show that
repo's components (`DiffModal.tsx`, `DiffModalComparisonView.tsx`,
`useDiffModalContext`, …), which this repo doesn't contain. The **code locations
below are pinned in *this* repo's source** (the renderers are repo-agnostic); the
frames are evidence of behavior, not of this repo's files.

This is the sixth round, following r1–r5 (`...-findings.md`, `...-round2.md` …
`...-round5.md`). It is a **tight, focused round** — the user explicitly scoped it:
*"this video is going to review the most recent round of work… focused on the fan
out feature and improvements we need to make with respect to how to access it and
the visualization of the edges and nodes"* — plus two grievances about the
**burden breakdown** ("the bird and breakdown thing").

**Round-5's two big bets are visible on camera and landed:**

1. **GRAPH-1 shipped.** The node/edge fan-out diagram the user asked for now
   exists — frame 7/13/14 show `useDiffModalContext` as a source node fanning to
   74 sinks across 5 files, edges colored by file, with a per-file legend and a
   "+34 more sinks in other files" overflow node. *"I see, I guess this is what I
   requested with nodes and edges."* (transcript 9–10) ✓
2. **OVERVIEW-1 (the per-type columns) shipped.** The overview "Files by burden"
   table now has `Boundaries | Fan-out | Relays | Unknown` columns with toggle
   checkboxes (frame 1). *"I see that we've added these columns in here. So that's
   actually good, I guess, to see a fan out."* (transcript 6–7) ✓

So the round is almost entirely about the **next layer**: the graph is right but
**in the wrong place and rendered the wrong way**, and the **burden breakdown** is
an expandable nothing.

**Files in play** (unchanged):

| File | Role |
|------|------|
| `src/server.mjs` | Routes + overview page + file-page assembly + per-file scoping |
| `src/core.mjs` | The analyzer: ranking, burden, defenses, junctions, fan-out/in, report views |
| `src/html/code-map.mjs` | Annotated code map + unified list + all detail panels + the fan-out SVG |
| `src/html/page.mjs` | HTML shell, all CSS, all client JS |
| `src/html/source-peek.mjs` | `path:line` previews + Open-file links |
| `src/html/markdown-to-html.mjs` | report-view markdown rendering |

Tags: **[ARCH]** structural · **[UX]** interaction/polish · **[BUG]** broken/inconsistent ·
**[MODEL]** analyzer/data-model · **[COPY]** wording.

---

## ✅ What landed well (round-5 fixes, verified on camera)

- **GRAPH-1 — the fan-out node/edge diagram exists.** Confirmed in code:
  `fanOutGraphSvg(row, relPath)` (`code-map.mjs:1112`) emits a real **SVG** — one
  source `<rect>` on the left (`:1160`), one cubic-Bézier edge per sink
  (`:1130-1132`), sink pills on the right (`:1138-1143`), a per-file legend
  (`:1150-1156`), all driven by `row.graphSinks` (capped at 40 in
  `core.mjs:7798-7799`). Frames 7, 13, 14. The user is happy the *thing* exists —
  the asks below are about placement and rendering, not "build a graph." ✓
- **Overview per-type columns + toggles (round-5 OVERVIEW-1).** `OVERVIEW_TYPE_COLUMNS`
  (`server.mjs:23-28`), `entryTypeCountsByFile` (`server.mjs:409-410`), column
  fieldset (`server.mjs:485-491`). Frame 1 shows `Boundaries | Fan-out | Relays |
  Unknown` columns with working checkboxes. ✓
- **Fan-out is a first-class list entry.** Frame 17/19 show `FAN-OUT
  useDiffModalContext 74 sinks` and `FAN-OUT content › props.displayMode 3 sinks`
  rows in the unified per-file list, each opening `fanOutPanel` (`code-map.mjs:1169`). ✓

---

## 🎯 Big theme #1 — the fan-out graph must live on the homepage, not inside a single file

This is **the** ask of the round, stated repeatedly:

> "When I come in here, I see, I guess this is what I requested with nodes and
> edges. But this is **not helpful, because at the moment we're inside of a single
> file, but this is describing things in multiple files.** And so really I want
> this fan out thing to be rendered back on the homepage somehow, as 'here are the
> detected fan outs', where it lists the… items that are actually fanning out."
> (transcript 9–14)

> "We need to get this fan out to live on the homepage as opposed to in the file
> view… we want to start with a **multi-file view on the homepage** that then
> motivates you to come in here and go look at the file itself. **That's the
> biggest issue in here is that we need that node edge diagram to live on the
> homepage.**" (transcript 23–28)

The complaint is a *context mismatch*, and the code confirms it exactly: the graph
is computed over **all** sinks for true cross-file reach, but it's only ever
**rendered on a per-file page**, scoped and entered through one file's list.

### HOME-1 — Surface a cross-file fan-out graph on the overview/homepage **[ARCH/UX]** (large)
> "Here are the detected fan outs, where it lists the 345… the items that are
> actually fanning out." (transcript 12–14)

**The data is already global; only the render site is per-file.**
- `fanOutEntriesForFile(allSinks, relPath)` (`core.mjs:7775`) computes reach over
  **all** sinks, then *filters to roots that touch `relPath`* (`:7818`) and builds a
  capped (≤40) cross-file `graphSinks` sample (`:7798-7799`, comment at `:7788-7790`
  literally says this exists "so the fan-out graph can show the spread colored by
  file").
- The server only ever calls it scoped to a file: `fanOutEntriesForFile(...,
  relPath)` at `server.mjs:611-614`, fed into the per-file `renderCodeMap`
  (`server.mjs:628`).
- The overview (`renderOverview`, `server.mjs:393`) renders stat cards
  (`:396-407`) + the "Files by burden" table (`:426-439`) + the report-asset list —
  **no graph section**. The standalone `renderFanOut` report (`core.mjs:5251`) is a
  **table only** (`Source | Sinks | Files | Example sink | Max depth`), no SVG.

**Fix (design pass):**
1. Add a **global** fan-out entry builder (drop the `relPath`/`inFile` filter from
   `fanOutEntriesForFile`; keep the per-root `graphSinks` sample), iterating
   `report.rankings.all` the way `fanOutRows` (`core.mjs:7737`) already does.
2. **Export/relocate `fanOutGraphSvg`** (currently un-exported in `code-map.mjs`)
   so the overview can call it. It takes `relPath` only to mark in-file sinks —
   pass a no-match value to render a purely cross-file diagram.
3. Render a **"Detected fan-outs" section inline on the overview** (decided: an
   inline section in `renderOverview`'s body, `server.mjs:524-561` — **not** a
   replacement of the `/report?view=fan-out` table page; the report page stays as
   is). A ranked list of fan-out *sources* (e.g. `useDiffModalContext · 74 sinks ·
   5 files`), each rendering its node-edge graph, **with each sink node linking into
   the relevant file page**. This is the "multi-file view that motivates you to
   drill into a file" the user wants. INTENT §7 ("prefer a real picture over a
   table") and §1 (the overview is the starting point).

### HOME-2 — Once fan-out lives on the homepage, demote/justify the per-file fan-out entry **[UX]** (small)
> "It's just not super useful to see in this list here that this component is
> consuming these things. Maybe it's useful, but it's not a useful starting point."
> (transcript 24–25)

The per-file `fanOutPanel` (`code-map.mjs:1169`) isn't *wrong*, but the user says
it's not where the story should start. This echoes round-5's "once we have
dedicated renderers, I don't think there's any utility in reporting these fan-out
values [in the per-file list]." **Decided:** once HOME-1 ships, the per-file
fan-out panel **collapses to a single line** — drop the in-file SVG entirely — and
that line **links back to the big graph on the overview** (e.g. "fans into 74 sinks
across 5 files → see fan-out graph", deep-linking to the source's section on the
overview). So the in-file graph (`fanOutGraphSvg` call at `code-map.mjs:1185`) is
removed from `fanOutPanel`; the panel keeps the one-line meta + the up-link.

---

## 🎯 Big theme #2 — the graph's node list: color-by-file must be unique, and nodes must be grouped per file

The user likes the diagram but finds the **node rendering** unreadable for two
distinct reasons.

### GRAPH-COLOR-1 — Color-by-file is a hash → near-duplicate hues; make file colors actually distinguishable **[BUG/UX]** (small–med)
> "This breakdown by file, I see they're colored, I don't know what they're colored
> by — finding type? … but then we just repeating colors… we don't want to do that.
> If we're going to use color by file, **it needs to be unique. I can't tell if
> those are different, those look to be the same color.**" (transcript 15–19)

**Confirmed in code — it's a hash, not a palette, with no perceptual spacing.**
`fileHue(file)` (`code-map.mjs:1095-1099`):
```js
function fileHue(file) {
  let h = 0;
  for (const ch of String(file)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
```
Every file's color is `hsl(${fileHue(file)} 60% 50%)` (edges `:1128`, legend swatch
`:1154`). Two consequences the user is seeing:
- **Collisions / near-collisions**: nothing spaces the hues apart, so two files can
  land on the same or near-identical hue (e.g. two of the *DiffModal* family files
  in frame 7 read as the same red/orange). At fixed 60%/50% sat/lightness, hues
  within ~15° are perceptually indistinguishable.
- **No legend ↔ node tie the eye trusts**: the legend caps at **6 files**
  (`.slice(0, 6)`, `code-map.mjs:1151`) but a graph can show sinks from many more,
  so unlisted files get an unexplained color.

**Fix (decided): assign random, unique colors per file.** Replace `fileHue`'s raw
hash with a per-graph assignment that gives every file a **distinct** color —
deterministically shuffle/space a generated set so no two files in the same graph
collide perceptually (a seeded permutation of evenly-spaced hues works and stays
stable per render). **Show all files in the legend — no "+N more" cap** (see
GRAPH-NODES-1). The goal is purely "every file is visibly its own color," not a
designed palette. INTENT §6 — colors the user can't tell apart are a trust problem.
Note: the user wasn't even sure the coloring was *by file* — GRAPH-GROUP-1's
per-file SVG bands remove that ambiguity by labeling each file once.

### GRAPH-GROUP-1 — Group sink nodes into per-file containers instead of repeating the file name on every node **[UX]** (medium)
> "We need to get them grouped by the file that they're in… I think what would be
> better here is to **group the files into their own kind of container, and then to
> list the items. That way we only have to repeat the file name once,** and then we
> can render the line number and the rest of it as bullets or something. That'd look
> much better than seeing the file name repeated 60 times." (transcript 16–23)

**Confirmed:** each sink node's label is built as
`${file.split("/").pop()}:${line} ${label}` (`code-map.mjs:1139-1143`) and laid out
as one flat vertical column of pills (frames 7, 13). So `DiffModalComparisonView.tsx`
is printed on ~15 separate nodes — exactly the "file name repeated 60 times" the
user is reacting to.

**Fix (decided): group inside the SVG.** Restructure `fanOutGraphSvg`
(`code-map.mjs:1112`) so sink nodes are **clustered by file into labeled bands** —
each file gets one band with its basename + file color shown **once** as a band
header, and each sink within it is a bullet/leaf node showing just `:line — tag /
attribute` (drop the per-node filename prefix at `code-map.mjs:1139`). Edges route
to the band, colored to match. Layout becomes: source node on the left → per-file
bands stacked on the right, each band labeled once. This keeps it a single picture
(no separate HTML list), and directly reinforces GRAPH-COLOR-1: with one labeled
header per file, the color is a redundant cue rather than the *only* (failing) one.

---

## 🎯 Big theme #3 — the burden breakdown: kill the expandable bars, render the metrics inline as pills ("the bird and breakdown thing")

> "This burden breakdown — I finally decided why it frustrates me so much, which is
> that **we're expanding to reveal useful information, but these bars are not
> useful. They're just super wide for no reason.** We should instead just take these
> pills with their information — path depth, representation churn, helper hops, etc.
> — and **just render them in the white space here.** After the 'blah blah… from
> five metrics', we should just list the five metrics with their contribution and
> then **get rid of this expandable thing.** It's just not helping and it's like you
> have to click to see what's in there." (transcript 29–36)

### BURDEN-1 — Replace the `<details>` bar chart with always-visible inline metric pills **[UX]** (small)

**Confirmed in code.** `burdenBreakdownHtml(sink)` (`code-map.mjs:546`) wraps the
metrics in a native **`<details class="burden-detail">`** (`:584-589`) — so it's
collapsed by default and the user must click "burden breakdown — 0.556 from 5
metrics" to see anything (frame 24 collapsed, frame 22 expanded). Each metric row
(`:561-567`) is a 3-column grid `label | bar | value`:
```js
<li>
  <span class="bd-label">${label}</span>
  <span class="bd-bar"><span class="bd-fill" style="width:${width}%"></span></span>
  <span class="bd-val">${contribution} · ${pct}%</span>
</li>
```
- **Why the bars are "super wide":** `width` is normalized to the *largest* term
  (`width = (term.contribution / max) * 100`, `:559`), so the top metric is always
  100%, and the middle `1fr` grid column (`page.mjs:240-243`) stretches the track
  across the whole panel. The bar carries no information the `· N%` value doesn't.
- **The white space the user means:** the `burden / confidence / risk` trio above
  it is a `<dl>` with `grid-template-columns: auto 1fr` (`page.mjs:236`) — the `1fr`
  value column leaves a large empty area to the right of the three short values
  (frame 22). That's where the metrics should go.

**Fix:**
1. **Remove the `<details>`/`<summary>` wrapper** (`code-map.mjs:584-589`) — show the
   breakdown unconditionally; no click.
2. **Drop the `.bd-bar`/`.bd-fill` bars.** Render each metric as an inline **pill**:
   `path depth 25%`, `representation churn 23%`, `helper hops 22%`, `control
   dependencies 18%`, `pack risk 12%` (values per frame 22) — a wrap-flow of small
   pills, each showing the metric name + its `· N%` contribution (keep the existing
   `title` tooltip with the `weight × normalized(raw)` math).
3. **Place them inline to the right** of the `burden·confidence·risk` `<dl>`
   (decided) — fill the empty `1fr` whitespace beside the trio (`page.mjs:236`)
   rather than stacking full-width bars below it.
4. Keep the "X from N metrics" total as a small lead-in label (not a clickable
   summary). INTENT §7 (show, don't tell — no click to reveal) and §8 (looks
   designed). Retire the now-unused `.bd-bar/.bd-fill` CSS (`page.mjs:245-251`).

---

## Suggested priority

| # | Item | Type | Effort |
|---|------|------|--------|
| BURDEN-1 | Burden breakdown → always-visible inline pills, kill bars + `<details>` | UX | small |
| GRAPH-COLOR-1 | Distinguishable per-file colors (replace raw hash) + honest legend | BUG/UX | small–med |
| GRAPH-GROUP-1 | Group sink nodes into per-file containers (file name once, bullets) | UX | medium |
| HOME-2 | Demote/justify the per-file fan-out entry once homepage view exists | UX | small |
| HOME-1 | Cross-file fan-out graph on the overview/homepage | ARCH/UX | large |

**Suggested sequence:** land **BURDEN-1** first (self-contained, pure UI, immediate
relief on a stated frustration). Then the two graph-rendering fixes
(**GRAPH-COLOR-1** → **GRAPH-GROUP-1**) — they improve the diagram *wherever* it
renders, so doing them before HOME-1 means the homepage view inherits a good
renderer. Then the headline **HOME-1** (its own design pass: global fan-out builder
+ export `fanOutGraphSvg` + overview section), with **HOME-2** as its natural
follow-on once the homepage view is the starting point.

---

## Decisions (resolved — these are now part of the plan)

1. **HOME-1 surface** → **inline section on the overview homepage.** Add a
   "Detected fan-outs" section in `renderOverview`'s body; **keep** the
   `/report?view=fan-out` table page as is (no replacement).
2. **HOME-2 / in-file graph** → the per-file `fanOutPanel` **collapses to one line**
   (drop the in-file SVG) and **links back to the big graph** on the overview.
3. **GRAPH-GROUP-1 shape** → **group inside the SVG** (clustered, file-labeled
   bands). No separate HTML list.
4. **GRAPH-COLOR-1 scheme** → **random, unique colors per file**; every file is
   visibly distinct. **No "+N more" — show all files in the legend.**
5. **BURDEN-1 placement** → **inline pills to the right** of the
   burden/confidence/risk `<dl>` (fill the empty `1fr` whitespace).
6. **Graph caps** → **render them all; do not apply caps for now.** Remove the
   per-source `graphSinks` cap (`core.mjs:7798-7799`, currently 40) and the legend
   cap (`code-map.mjs:1151`, currently 6) so every reached sink and every file
   shows. (Revisit if a pathological fan-out makes a section unwieldy.) This also
   retires the "+N more sinks" node (`code-map.mjs:1145-1149`).
7. **INTENT update** → **yes.** Sharpen §7 to record: the fan-out graph's home is
   the **overview** (a cross-file starting point); the per-file panel is a one-line
   up-link; color-by-file must be **perceptually distinct (unique per file)**; and
   **grouped-by-file (one label per file) beats per-node file labels**. Add the
   BURDEN-1 principle: **a disclosure shouldn't hide its payload behind a click when
   there's room to just show it.** (Applied below.)

### One detail to confirm during execution (not blocking)
- **BURDEN-1 metrics shown:** the code already filters to contributing metrics
  (`contribution > 0`, `code-map.mjs:549-560`) — frame 22 shows 5. Plan keeps that
  (show all *contributing* metrics as pills). Flag if you'd rather always show the
  full `BURDEN_TERMS` set including zero-contribution ones.
