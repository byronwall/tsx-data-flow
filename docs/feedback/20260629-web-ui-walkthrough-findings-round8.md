# tsx-dataflow web UI — walkthrough findings, round 8 (make every markdown report crisp & self-contained, give every relationship report a network diagram, and trade the left sidebar for a sticky top nav)

Distilled from the **13:47** screen-recording voiceover in
`~/Desktop/tsx-dataflow-improve-home-context` (`transcript/transcript.txt` +
`transcript/transcript.srt`). The recording has **real, legible video** — all 83
frames in `frames/` are ~330–615 KB and readable, so every claim below is grounded
in both the audio and a specific frame. Frame timing follows the SRT (one frame per
10 s: the comment at time `t` ≈ `frame_{floor(t/10)+1}`).

**New context:** the footage is now from the **modeler repo**
(`client/apps/modeler/src/...` — `concept-context-panel.tsx`,
`property-field-context-panel.tsx`, `selection.ts`, `createSubjectStore`, …), a
**different repo** than this one, so the frames show that repo's symbols, which this
repo doesn't contain. As in rounds 5–7, the **code locations below are pinned in
*this* repo's source** (the renderers are repo-agnostic); the frames are evidence of
behavior, not of this repo's files.

This is the **eighth** round, following r1–r7. It is a **wide, walk-the-whole-app
round**: the user reviews the round-7 shell (which he likes), then walks **every
report in the tab strip one by one** and renders a keep / improve / cull verdict on
each. The brief the user gave with this footage names the three durable goals
explicitly:

> "really focus on having the crispest, best-est markdown files, and then having
> clean visualizations inside the UI for all of them, while also cleaning up the app
> shell to move toward this mode where we've got workspace analysis being done in one
> spot and file-specific analysis being done in its detailed view, and then having
> appropriate jumps between them."

Those three are the three big themes below.

**Files in play** (unchanged):

| File | Role |
|------|------|
| `src/server.mjs` | Routes + overview page + file-page assembly + per-file scoping + nav + tab strip |
| `src/core.mjs` | The analyzer: ranking, burden, fan-out/in data model, **all markdown report renderers** |
| `src/html/code-map.mjs` | Annotated code map + unified list + detail panels + the fan-out SVG |
| `src/html/page.mjs` | HTML shell, all CSS, all client JS |
| `src/html/source-peek.mjs` | `path:line` previews + Open-file links |
| `src/html/markdown-to-html.mjs` | report-view markdown rendering |

Tags: **[ARCH]** structural · **[UX]** interaction/polish · **[BUG]** broken/inconsistent ·
**[MODEL]** analyzer/data-model · **[COPY]** wording.

---

## ✅ What landed well (round-7 fixes, verified on camera)

Round 7's work shipped and the user is happy with it — he opens the review on a
string of compliments before turning to the next layer:

- **ARCH-TABS-1 — the page-level report tab strip shipped.** `reportTabs(activeView)`
  (`server.mjs:399-416`) builds an Overview tab + one tab per `REPORT_VIEWS` entry
  (alphabetized), rendered on the overview (`server.mjs:686`) and `/report`
  (`server.mjs:173`), selection in the URL. Frames 1–2 show the full strip
  (`Overview · Boundary report · Context relay · Defensive ledger · dossier · Fan-in
  · Fan-out · Findings · Hotspots · Inline preview · Junctions · Path census · Path
  families · Path gallery · Prop relay · References · Repair map · Repeated forks ·
  Transformation ledger · Unknown edges · Work packets`). The user references it as
  settled fact: *"now that we have those tabs at the top…"* (SRT 7). ✓
- **FANOUT-LIST-1 — the selectable fan-out viewer shipped.** `fanOutViewer`
  (`server.mjs:445-506`): a `.fo-tab` strip of the top 5 + a dropdown for the rest +
  exactly one `fanOutGraphSvg` (`server.mjs:504`), URL-keyed via `?fanout=`/`?fosort=`.
  Frame 19. *"I really like that the fan out includes both the graph view and the
  markdown view… the markdown view is much better. So all of this is really good."*
  (SRT 10–12) ✓
- **FANOUT-GRID-1 — the three-column graph landed exactly as asked.** *"the two
  column thing was implemented exactly the way I wanted."* (SRT 29) Frame 19 shows the
  source node on the left and consumer file bands flowed across two right-hand
  columns. ✓
- **FANOUT-DEPTH-1 — per-sink depth shows.** *"The depth looks good."* (SRT 30) Frame
  19 shows `:203 div / style · d17`, `:79 div / style · d16`, etc. ✓
- **REPORT-RECONCILE-1 — the Fan-out tab shows the network view with the raw markdown
  reachable.** Frame 13 is the fan-out markdown; frame 19 is the network view with a
  `Markdown` toggle. The user likes the pairing (it's the basis for his MD asks
  below). ✓
- **FANOUT-SORT-1 (partial) — the sort key is now a visible, styled control.** The
  `Sort: spread | depth | files | name` segmented buttons (`FANOUT_SORTS`,
  `server.mjs:420-425`, rendered `:480-485`) are no longer a mystery — *"I like the
  sorting"* (SRT 30). (What it sorts is still ambiguous — see **SORT-1**.) ✓

---

## 🎯 Big theme #1 — every markdown report must be crisp, token-efficient, self-contained, and *actionable* — not an aggregate that repeats another report

This is **the dominant, most-repeated ask of the round**, stated three different ways
and underneath nearly every per-report verdict:

> "The goal on these markdown reports is that they're actually relatively token
> efficient, so it'd be better if we can avoid repeating info that's not needed."
> (SRT 19–20)

> "The table is okay, it's a nice summary… but in general the table doesn't actually
> help the agent solve anything, and that's the recurring theme on all these markdown
> files: they're good at presenting the aggregate info but then leave it to the agent
> to actually go make sense of it. We want every report to be **the full info,
> actionable.**" (SRT 67–72)

> "So many of these markdown files are just dumping the same info in another format.
> We really need **every markdown file to be on its own**, that way the agent doesn't
> get confused about what information it's supposed to be consuming." (SRT 150–153)

Two distinct failure modes are bundled here, both confirmed in code:

1. **Duplication across reports.** `path-gallery` (`renderPathGallery`,
   `core.mjs:5364`) and `transformation-ledger` (`renderTransformationLedger`,
   `core.mjs:5416`) both walk the **same single heaviest representative path** that
   `findings` (`core.mjs:4773`) and `work-packets` (`core.mjs:4891`) already emit.
   Frames 65 (path gallery, `-> this [literal]` / `-> mgr [property-read]` … for
   `concept-context-panel.tsx:180` depth 22) and 76 (transformation ledger, the
   identical path as a numbered table) are the **same content in two formats** — the
   user names this directly: *"path gallery… I'll probably go see that same line 180…
   this is the same thing"* (SRT 122–125) and *"transformation ledger… this is just a
   breakdown of that same path 180… get rid of it, whatever info is in here is
   repeated in work packets or findings"* (SRT 144–148).
2. **Aggregate-without-detail.** Many reports present a summary table and stop. The
   user wants the **representative detail materialized** so an agent can act, not a
   roll-up that points elsewhere (path-families, context-relay, boundary, fan-in).

The concrete consequences are the cull/consolidate and self-contained items
(**MD-1…MD-7**) below. This is INTENT §1 (one source of truth per concern), §4 (signal
over noise), and §7 (show, don't tell) applied to the **markdown deliverable**, which
the user reminds us is the real product: *"ultimately the agent is going to be
consuming the markdown."* (round 7)

## 🎯 Big theme #2 — every relationship report deserves a clean network diagram (the way fan-out got one) plus a detailed markdown that lists everything

The fan-out network view set the bar; the user now wants the same treatment for every
report whose subject is **a relationship between sources and sinks/consumers**:

> "The boundary report… needs a similar sort of network diagram as the fan out… both
> sources and sinks, so I'd expect a two-sided, left side of sources, right side of
> sinks, and the boundaries in the middle. We need a network diagram that conveys the
> **totality** of the boundary report." (SRT 57–64)

> "Fan-in… is going to be the same sort of thing as fan out but reversed. By some
> scheme we need a network diagram for fan in, and similar to how fan out's markdown
> is much more useful because it lists out the details, we want fan in to do the same
> thing." (SRT 78–82)

> "Junctions… is a similar sort of problem, just needing a network diagram similar to
> fan in / fan out — show here's the sources, here's the callers." (SRT 108–110)

> "Prop relay I think is very helpful, but same problem — we've got this component
> boundary in this wrapper step and we're not actually giving the details. We're
> missing a nice clean network diagram here, and same as how fan out resolved this, we
> just need a detailed report in the markdown." (SRT 129–134)

The four targets — **boundary, fan-in, junctions, prop-relay** — share a data
substrate: boundary/junctions/inline-preview all read `report.helpers`
(`renderBoundaryReport` `core.mjs:5700`, `renderJunctions` `core.mjs:5815`,
`renderInlinePreview` `core.mjs:5883`); fan-in (`renderFanIn` `core.mjs:5347`) and
prop-relay (`renderPropRelay` `core.mjs:5511`) read `report.rankings.all`. So a
shared "two-sided network diagram" component (sources → boundary/junction →
sinks/consumers) can serve all of them, mirroring `fanOutGraphSvg`. INTENT §7 ("prefer
a real picture over a table where the relationships are the point").

**Decided — build ONE as a template first.** Land **VIZ-1 (boundary)** as the reusable
two-sided component and dial it in completely (graph + report-reconcile pairing), *then*
apply it to fan-in / junctions / prop-relay in a follow-up. Don't build all four at
once.

## 🎯 Big theme #3 — trade the left sidebar for a sticky top nav: workspace analysis on the overview, file analysis in the file view, with clean jumps between

The round-7 tab strip made the left "Reports" list redundant, and the user wants to
finish the move:

> "Now that all these reports are up here, this left sidebar — we can just go ahead
> and get rid of the report section. These links are now just the same thing repeated."
> (SRT 43–45)

> "If we click through on a file, it has all these reports on the bottom that are
> file-specific. We want to do the same thing on the file view — code map, then to the
> extent there's reports for the file we list them as tabs across the top. That lets us
> get rid of this left sidebar and we're left with just a top thing. We probably want to
> keep this 'tsx dataflow' and the context — the repo or the path we're in… **trade the
> left sidebar for more of a top nav, persistent and sticky.**" (SRT 45–54)

> "We should make those [top selectors] sticky and keep them in one line. It's fine if
> they run out to the side on a large viewport, and on a narrow viewport we can let them
> wrap." (SRT 2–6)

This is INTENT §1's end-state (the standalone Reports section absorbed; everything
reachable from one place) and §2/§5 (stay oriented; sticky chrome). The shell splits
cleanly into **workspace analysis** (the overview: cross-file tabs + the burden table)
and **file analysis** (the file page: code map + file-scoped report tabs), with the
title/path as the persistent anchor. Frame 55 shows the current file-page reports as a
**stacked `<details>` list at the bottom** (`renderFilePage`, `server.mjs:794-808`,
`FILE_VIEWS` `server.mjs:67-69`) — exactly what should become a top tab strip.

---

## Detailed issues

### Shell / navigation

#### SHELL-1 — Retire the left sidebar's Reports list; move to a persistent sticky top nav with title + repo/path context **[ARCH]** (medium)
> "Get rid of the report section. These links are now just the same thing repeated."
> (SRT 44) · "Keep this 'tsx dataflow' and the context — the repo or the path we're in."
> (SRT 51)

`overviewNav(report, url)` (`server.mjs:508-538`) builds the left sidebar: a "Files"
list (`:512-523`, capped at 40) **and** a "Reports" list (`:524-537`, from
`reportAssets`). The Reports list is now a duplicate of `reportTabs` (`server.mjs:399`).
Frames 1–2 show both side by side. **Fix (decided):** drop the Reports `<ul>` (`:537`)
**and the Files list entirely** (`:512-523`) — the user returns to the overview for the
big findings table, which is good enough (SRT 54–55), so `overviewNav` collapses to
nothing on the overview. Relocate the title + the repo/path string (currently the
`.brand` block) into a **persistent sticky top bar** above the tab strip
(`page.mjs:33-45` is where the sidebar CSS lives today; the top bar is the new home).
**Put nothing else in the top bar for now** — just title + repo/path (no search box, no
Re-analyze button) until asked. The `/file` page keeps its own `fileNav` "On this page"
jumps for now (see SHELL-3). INTENT §1.

#### SHELL-2 — Make the top selectors/tab strip sticky; one line on wide viewports (overflow to the side), wrap on narrow **[UX]** (small)
> "Make those sticky and keep them in one line… fine if they run out to the side on a
> large viewport, and on a narrow viewport let them wrap." (SRT 3–6)

The overview `.toolbar` (`server.mjs:691-707`) and `.report-tabs` (`page.mjs:238-242`)
are **not sticky** — `.toolbar` at `page.mjs:81` and `.report-tabs` at `:239` are both
`flex-wrap: wrap` with no `position: sticky`, so they scroll away. **Fix:** make the
top chrome (new top bar + tab strip + selectors row) `position: sticky; top: 0`. For
the "one line on wide, wrap on narrow" behavior, switch the strip to
`flex-wrap: nowrap; overflow-x: auto` above a breakpoint and `flex-wrap: wrap` below it
(or a container-query equivalent). INTENT §2/§8.

#### SHELL-3 — File page: replace the stacked `<details>` report blocks with a file-scoped tab strip across the top **[ARCH]** (medium)
> "On the file view — code map, then to the extent there's reports for the file we list
> them as tabs across the top." (SRT 47–49)

`renderFilePage` (`server.mjs:747-832`) renders each `FILE_VIEWS` entry
(`server.mjs:67-69`) as a `<details>/<summary>` block under an `<h2>Reports</h2>`
(`:794-808`, `:828`) — a stacked collapsible list (frame 55, bottom). **Fix:** render a
**tab strip of the file's report views** (the file-scoped analogue of `reportTabs`),
with the **code map as its own first tab** (decided) and the selected report in the URL
(reuse the `?view=` convention; `fileNav` `:734-745` already builds per-view anchors).
This is the file-side mirror of the workspace tab strip and completes the "workspace vs
file analysis, two clean spots" split. INTENT §1/§5.

#### SHELL-4 — Remove the inline "Detected fan-outs" section from the overview body — require clicking the Fan-out tab **[UX]** (trivial)
> "Now that we have those tabs at the top, [I'm] increasingly not liking that the fan
> outs are reported down below. So we should just get rid of the in-line render on this
> home page and require the user to click fan out." (SRT 7–10)

`renderOverview` builds `fanOutSection` (`server.mjs:671-684`, the `fanOutViewer`
call) and appends it to the body (`server.mjs:729`). Now that the Fan-out tab hosts the
same viewer (`server.mjs:157-161`), the inline copy on the homepage is redundant.
**Fix:** delete the `fanOutSection` from `renderOverview`'s body (`:677-684`, `:729`);
the homepage is just the summary cards + burden table + (post-SHELL-1) tab strip. INTENT
§1 ("a view that stacks every detail at once violates §1").

#### SHELL-5 — Replace the three native `<select>`s with styled popover/table pickers **[UX]** (small–med)
> "I don't like this native select. We should basically never use a native select…
> better to use a trigger with a popover and render something cleaner — a card, a list,
> or in this case maybe a table, and inside the table you do the sorting." (SRT 36–41)

There are exactly **three** raw `<select>`/`<option>` elements in the shell:
1. **Fan-out source picker** — `<select class="fo-more" data-nav-select>` at
   `server.mjs:466` (options `:467`, `:472-476`; JS nav at `page.mjs:496-501`). This is
   the one the user is pointing at in frame 19.
2. **Overview filter** — `<select name="filter">` at `server.mjs:693` (options
   `:694-697`, helper `filterOption` `:610-613`).
3. **Overview sort** — `<select name="sort">` at `server.mjs:699` (options `:700-703`,
   helper `sortOption` `:614-617`).

**Fix (decided) — build ONE reusable custom popover component (no dependencies).**
Replace each native select with a styled **trigger + popover** driven by a single
shared component so the logic — especially **content positioning relative to the
trigger** — is consistent everywhere. If a custom-popover pattern already exists in the
repo, factor it into this one component rather than re-implementing. The fan-out source
picker is the best candidate for the "table with sortable columns" treatment the user
describes (name · spread · files · depth, sortable in place) — it doubles as the
FANOUT-LIST-1 "what are the other 38" answer. INTENT §8 ("never render a default native
element").

#### SORT-1 — Make it explicit *what* the sort reorders (the graph's items vs the source picker) **[UX]** (small)
> "I was expecting the sort to affect the ordering of the items in the [graph]… they're
> sorted by depth, and I expected the sort to affect those. It's worthwhile we can
> control these up here… we just need to make it clear that we're either **sorting the
> graph view or sorting the picker for the item.**" (SRT 31–36)

The `Sort: spread | depth | files | name` control (`FANOUT_SORTS` `server.mjs:420-425`,
`?fosort=`) reorders **the source picker** (which fan-out is "top"), not the **sink
items within the rendered graph** (those are in discovery/depth order). The user expected
the latter. **Fix:** label the control with its scope (e.g. "Sort sources:") and — if
cheap — add a separate control (or apply the same key) to order the **leaf bullets
within each file band** of the graph. At minimum, disambiguate the two so the sort
doesn't read as "random and wrong" (INTENT §6, the same principle as round 7's
FANOUT-SORT-1).

### Markdown report quality, dedup & culls

#### MD-1 — Fan-out markdown: print the file path **once per group**, line-numbers only on rows; link code preview off the line number **[MODEL/COPY]** (small)
> "I can't tell if the markdown report actually has these really long file names on it.
> The only changing part is the line number… better to just report the line number so
> the client can do the code preview… for now it'd be nice if the markdown report did
> not just repeat the file name again and again and again." (SRT 13–18)

Confirmed in `renderFanOut` (`core.mjs:5318-5343`): the full path is printed on the
group header (`core.mjs:5336`, `- **${file}** (${n})`) **and re-printed on every sink
row** (`core.mjs:5337-5339`, `` `${file}:${sink.line}` ``). Frame 13 shows the wall of
repeated `client/apps/modeler/src/components/...` paths. **Fix:** keep the full path on
the group header only; emit sink rows as just `` `:${line}` · depth N `` (+ label). The
client code-preview link can resolve `path` from the enclosing group + the bare line.
This is the concrete first instance of theme #1's token-efficiency goal, and the same
pattern should sweep any other report that repeats a path per row.

#### MD-2 — Remove `path-gallery` and `transformation-ledger` (duplicate the heaviest-path walk already in findings/work-packets) **[ARCH]** (small)
> "Path gallery… I would just remove this markdown file, it's not useful." (SRT 128–129)
> · "Transformation ledger… just get rid of this, whatever info is in here is repeated
> in work packets or findings." (SRT 146–148)

`renderPathGallery` (`core.mjs:5364`) and `renderTransformationLedger`
(`core.mjs:5416`) both walk the single heaviest `representativeSteps` path that
`renderFindings` (`core.mjs:4773`) and `renderWorkPackets` (`core.mjs:4891`) already
emit (frames 65 & 76 = identical content). **Fix:** remove both view ids from
`REPORT_VIEWS` (`core.mjs:31-52`), their dispatch entries in `renderMarkdownView`
(`core.mjs:1064-1109`), their `VIEW_LABELS` (`server.mjs:40-60`), and the renderers.
Confirm no unique signal is lost (the per-step `[operation]` annotations exist in
findings/work-packets already).

#### MD-3 — Remove the `dossier` markdown view **[ARCH]** (trivial)
> "Dossier is just not useful — useful if it's the JSON output, but not useful as
> markdown, so honestly we should just remove it." (SRT 75–78)

`renderDossier` (`core.mjs:5266`) emits two tiny summary tables (graph counts + the top
sink). It's already absent from `VIEW_LABELS` and filtered out of `FILE_VIEWS`
(`server.mjs:67`), but it's still in `REPORT_VIEWS` and shows as a `dossier` tab (frame
1). **Fix (decided):** remove the `dossier` **view/tab** from `REPORT_VIEWS`
(`core.mjs:31-52`) and the dispatch (`core.mjs:1064-1109`), and delete its markdown
renderer — it must no longer appear anywhere in the web UI ("a giant wall of text").
**Keep the JSON form available on request:** the dossier data stays reachable via
`/api/report.json` (`server.mjs:218-235`), the form the user values; only the markdown
goes.

#### MD-4 — Remove `path-census` **[ARCH]** (trivial)
> "Path census… this one is just dumb and useless, just get rid of it. I can't imagine
> somebody comes in here and is glad this info is available." (SRT 110–112)

`renderPathCensus` (`core.mjs:5378`) emits aggregate count/percentile tables with no
per-item actionability. **Fix:** remove the view (registry `core.mjs:31-52`, dispatch
`:1064-1109`, renderer, label).

#### MD-5 — Consolidate the aggregators (hotspots, repair-map, unknown-edges) into a single "overview" markdown document **[ARCH]** (medium)
> "Hotspots is close to useless… repair map was kind of that [single summarizing
> thing]… it's honestly repeating stuff in hotspots. We've got repair map, hotspots,
> unknown edges… it feels like all of those should just live in a single document —
> a markdown document called like 'overview'. We've got a couple things that are just
> aggregating all the other reports and we really just need a single document for that."
> (SRT 84–95, 137–142)

Three reports are aggregators over the same `report.rankings.all`/file grouping:
`renderHotspots` (`core.mjs:5650`, per-file rollup), `renderRepairMap`
(`core.mjs:5546`, clusters + quick-wins/leverage/investigate buckets), and
`renderUnknownEdges` (`core.mjs:5743`, diagnostic edge table).

**Fix (decided) — create a real, distinct `overview` markdown view.** It is **its own
thing**, not a renamed repair-map and **not a mirror of the web overview page** — a
**summarizing, agent- *and* human-facing** document. Contents:
- Move `repair-map`'s contents into it (clusters + the quick-wins/central-leverage/
  investigate buckets + the stop recommendation).
- The aggregate tables live here: concentration/hotspots, and an "Unknown edges
  (diagnostic)" section. The user keeps the unknown-edges *signal* (*"diagnostic…
  helpful to see there was an unknown edge issue; if the whole file is unknown that's a
  problem"* SRT 153–156) — as a **section**, not a separate file.
- **A manifest of every other markdown report and what each is for** — so an agent
  landing in the dumped markdown has **one spot to orient** before consuming the rest.
  *"We're dumping all this markdown out; we want to give the agent one spot to go to,
  then go make sense of it."*

Remove the three standalone views (`renderHotspots`/`renderRepairMap`/
`renderUnknownEdges`); add the new consolidated `overview` view (`REPORT_VIEWS`
`core.mjs:31-52`, dispatch `:1064-1109`, `VIEW_LABELS` `server.mjs:40-60`). Keep the
manifest in lockstep with **SKILL-1** so the skill and the doc never drift.

#### MD-6 — Make `context-relay` self-contained: show *why* the example is redundant, not just a summary table **[MODEL/UX]** (medium)
> "Context relay — same thing. We're trying to communicate 'hey this example is just
> repeating information that's available in the context' and we need a view that conveys
> **why we believe that to be true.** The table is a nice summary but it doesn't help the
> agent solve anything." (SRT 64–72)

`renderContextRelay` (`core.mjs:5528`) emits a single `parent | child | context hooks |
passed props | signal` table from `report.contextRelay` (`:5529`). **Fix:** for each
relay, materialize the **evidence** — the context value, the prop being passed that
duplicates it, and the line(s) where both are visible — so the "this prop just relays
context" claim is shown, not asserted. (Pairs with the network-diagram theme: context
relay is itself a parent→child edge.)

#### MD-7 — Make `path-families` actionable: show representative examples of the big/gnarly families, not just stats **[MODEL/UX]** (medium)
> "Path families could be really useful but it's the same problem — aggregating and not
> showing any details. We want to see **representative examples**, especially the ones
> that seem big and gnarly, because then maybe there's a common pattern to apply to clean
> it up. As an aggregate it's just stats for no purpose." (SRT 113–122)

`renderPathFamilies` (`core.mjs:5404`) emits a `signature | paths | sinks | max depth`
table via `familyRows(report.sinks)` (`:5405`). **Fix:** under each family (or at least
the largest N), show one **representative path** + its sink locations so the shared
shape is visible and a common fix is suggestable. The user notes this is also where the
**UI** can help (click-to-expand a family) — a candidate for a unified-list entry type
later. INTENT §7.

### Network diagrams (visualizations)

#### VIZ-1 — Boundary report: a two-sided network diagram (sources ← boundary → sinks) + fix the "callers" copy **[UX/COPY]** (medium)
> "The boundary report needs a network diagram like fan out… both sources and sinks, so
> two-sided: left side sources, right side sinks, boundaries in the middle… **'in source
> and callers' — callers is surely wrong.** We need a network diagram that conveys the
> totality of the boundary report." (SRT 57–63)

`renderBoundaryReport` (`core.mjs:5700`, over `report.helpers`) is a helper table + a
"worst boundary debt" bullet list — no diagram, and the user spotted a likely **copy
bug** ("callers" mislabeled). **Fix:** build a two-sided SVG (sources column → boundary
node → sinks column, colored by file like `fanOutGraphSvg` `code-map.mjs:1133`), shown
in the boundary tab with the markdown beneath (the REPORT-RECONCILE pattern from round
7). Audit the "callers"/"in source" labels for correctness. *(Frame note: the boundary
tab content wasn't captured mid-scroll — frame 31 shows the user hovering the tab;
behavior is pinned from code.)*

#### VIZ-2 — Fan-in: a reverse-of-fan-out network diagram + a detail-listing markdown **[UX/MODEL]** (medium)
> "Fan in is the same sort of thing as fan out but reversed… we need a network diagram
> for fan in, and the markdown should list out the details like fan out's does." (SRT
> 78–82)

`renderFanIn` (`core.mjs:5347`) is a single `sink | root sources | predicates | max
distance` table over `report.rankings.all`. **Fix:** mirror the fan-out viewer with the
arrows reversed — many sources converging on one sink — reusing `fanOutGraphSvg`'s
banding/coloring, and upgrade the markdown to per-sink per-source breakdowns with
distance (the textual mirror, same as REPORT-RECONCILE did for fan-out).

#### VIZ-3 — Junctions: a sources → junction → callers network diagram **[UX]** (medium)
> "Junctions is a similar problem, just needing a network diagram similar to fan in /
> fan out — show here's the sources, here's the callers." (SRT 108–110)

`renderJunctions` (`core.mjs:5815`, `report.helpers` filtered) emits fenced
tributaries/distributaries prose + a heavy-confluences list. **Fix:** the same
two-sided diagram (tributaries → junction → distributaries), which is the literal shape
of a junction. Shares the VIZ-1 component.

#### VIZ-4 — Prop-relay: a component-boundary network diagram + detailed markdown **[UX/MODEL]** (medium)
> "Prop relay is very helpful, but same problem — we've got this component boundary in a
> wrapper step and we're not giving the details. We're missing a clean network diagram
> here, and like fan out, we just need a detailed report in the markdown." (SRT 129–134)

`renderPropRelay` (`core.mjs:5511`, `report.rankings.all`) is a `sink | component
boundaries | wrapper steps | classification` table. **Fix:** draw the relay chain
(component → wrapper → … → sink) as a diagram and materialize the per-hop detail in the
markdown. Shares the VIZ-1/VIZ-2 component (it's a directed chain rather than a fan).

### Bugs

#### BUG-1 — Inline/empty object literals are mis-classified as render sinks **and** as a global fan-out source **[BUG/MODEL]** (medium)
> "Back in the modeler repo it is reporting a sink on this just empty object… we're
> passing in an object to the style attribute, seems pretty common. Whatever this is,
> it's not a sink… there's some bug allowing this object to be considered a global fan
> out." (SRT 21–25)

Confirmed. Frames 13 & 19 literally show **`()` / `{}`** as a fan-out *source* fanning
to 45 sinks across 14 files. Mechanism:
- `getSinkExpression` (`core.mjs:2563`) accepts JSX attribute expressions like
  `style={{...}}` (`:2576-2592`); the object literal becomes a sink record via
  `buildSinkRecord` (`core.mjs:3610`) with **no guard** excluding inert object
  literals.
- `isConstantSink` (`core.mjs:8004-8017`) fails to filter it: an **empty `{}`** traces
  to a synthetic root of kind `"operation"` (`traceObjectLiteral` `core.mjs:3390`,
  `:3515`) — not `"literal"` — so the literal check at `:8008` is false; a **literal-only
  object** pushes an `object-pack` representation step (`:3505-3513`) so
  `representationChurn ≥ 1` and the check at `:8013` is false.
- It becomes a **global fan-out source** because `fanOutRootsFor` (`core.mjs:8019-8029`)
  only excludes `"literal"`/`"parameter"`/`NON_FAN_OUT_GLOBALS` roots (`:8023-8025`); a
  kind-`"operation"` root with label `"{}"` survives, and `fanOutEntriesGlobal`
  (`core.mjs:7892`) collapses **every** `{}` repo-wide into one `"{}"` key
  (`fanOutIdentity` `:8040-8050`, bare-label branch `:8049`), so `total ≥ 2` surfaces it.

**Fix (decided — apply BOTH guards; take the safer, more robust option):** (1) in
`fanOutRootsFor` (`core.mjs:8023-8027`) also exclude `info.kind === "operation"` — kills
the bogus `"{}"` global entry; **and** (2) extend `isConstantSink` (`core.mjs:8004`) to
treat an object-pack whose children are all literal (or which has no non-literal roots)
as constant — demotes inert `style={{...}}`/empty objects out of the ranked sink set
entirely. Both together (not just the fan-out guard). (The `runtime settings` object the
user *agreed* was correct — SRT 26–27 — is genuinely used, so the guard must key on "no
non-literal sub-expressions," not "is an object literal.")

#### BUG-2 — Inline-preview shows "zero callers" for an exported, used symbol **[BUG/MODEL]** (medium)
> "This createSubjectStore could be inlined… I really need to see the consumers of it.
> It's saying zero callers, but that can't be true if it's exported and we're trying to
> inline it." (SRT 102–107)

Confirmed. `renderInlinePreview` (`core.mjs:5883`) prints `helper.callerCount` verbatim
(`core.mjs:5916`). `callerCount` is only incremented in `countCallers`
(`core.mjs:2436-2467`) when `bySymbol.has(record.symbol)` (`:2452`) — a match by
**TypeScript `Symbol` object identity**. For a path-alias tsconfig, the helper's
`record.symbol` is minted by the **owner** program's checker
(`resolveCatalogFn`/`traceFile` `core.mjs:1296-1304`, `:2323-2342`) while `countCallers`
resolves call sites with the **primary** checker (`core.mjs:1252-1257`). Symbols aren't
shared across programs, so the match always fails and the count stays 0. (`createSubjectStore`
in `selection.ts` — frame 55 — is exactly this cross-config case.) **Fix (decided —
robust option):** in `countCallers`, match by a **program-independent identity** —
`defFile:defLine:name` (the scheme already used in `buildComponentRefs` `core.mjs:2415`),
not the raw `Symbol` object. (Resolving call sites with the record's own stored
`record.checker` at `core.mjs:2341` is an alternative; prefer whichever proves more
robust across configs — the user asked for "a nice good robust fix.")
This is also the data the user wants surfaced (INLINE-1).

#### INLINE-1 — Inline-preview should show the consumers (and ideally the inlined-code preview) **[UX]** (medium)
> "This view is not super actionable for making sense of 'what does this look like if I
> inline it'… it would be good if it could render what the code would look like inline…
> I really need to see the consumers of it." (SRT 98–107)

Once BUG-2 makes caller counts truthful, `renderInlinePreview` (`core.mjs:5883`) should
**list the consumers** (the call sites, as clickable locations) and, where feasible,
show a **preview of the inlined result** (the helper body spliced at a call site). This
is the report-level expression of INTENT §3 (where-used is a primary verb) and §7 (show
the code, not a verdict). Lower priority than the bug fix.

### Leave alone (explicitly, this round)

- **Defensive ledger** (`renderDefensiveLedger` `core.mjs:5453`) — *"feels pretty good…
  may actually be okay, let's leave this alone for now."* (SRT 72–75) The "impossible
  line 79" is accepted as-is.
- **Findings** (`core.mjs:4773`) — *"good for now, feeling a bit verbose but leave it
  alone, we've done a ton of work on it."* (SRT 82–84)
- **Repeated forks** (`core.mjs:4621`) — *"I like this one, just leave it alone."* (SRT
  142)
- **References / component-refs** (`core.mjs:5764`) — *"I kind of like this… leave this
  one alone for now, I'll dig into it more."* (SRT 134–137)
- **Work packets** (`core.mjs:4891`) — *"leave this one alone for now, I don't want to
  edit it yet."* (SRT 156–158) (Note: MD-2's dedup must not strip the path detail work
  packets rely on.)

---

## Suggested priority

| # | Item | Type | Effort |
|---|------|------|--------|
| SHELL-4 | Drop the inline fan-out section from the overview body | UX | trivial |
| MD-3 | Remove `dossier` markdown view | ARCH | trivial |
| MD-4 | Remove `path-census` | ARCH | trivial |
| MD-2 | Remove `path-gallery` + `transformation-ledger` (dup the heaviest path) | ARCH | small |
| MD-1 | Fan-out markdown: path once per group, line-numbers on rows | MODEL/COPY | small |
| BUG-1 | Empty/inline object literal mis-flagged as sink + global fan-out | BUG/MODEL | medium |
| BUG-2 | Inline-preview "zero callers" (cross-program symbol identity) | BUG/MODEL | medium |
| SHELL-2 | Sticky top chrome; one line wide / wrap narrow | UX | small |
| SHELL-5 | Replace the three native `<select>`s with styled popover pickers | UX | small–med |
| SORT-1 | Clarify what the fan-out sort reorders (graph vs picker) | UX | small |
| SHELL-1 | Retire the left sidebar; persistent sticky top nav + title/path | ARCH | medium |
| SHELL-3 | File page: file-scoped report tab strip (not stacked `<details>`) | ARCH | medium |
| MD-5 | New `overview` doc (repair-map + aggregates + report manifest) | ARCH | medium |
| SKILL-1 | Update the report-documenting skill to match the new report set | ARCH | small |
| MD-6 | `context-relay`: show the evidence, not just a summary table | MODEL/UX | medium |
| MD-7 | `path-families`: representative examples of big families | MODEL/UX | medium |
| VIZ-1 | Boundary: two-sided network diagram + fix "callers" copy **(template)** | UX/COPY | medium |
| VIZ-2 | Fan-in: reverse-fan-out diagram + detailed markdown *(follow-up)* | UX/MODEL | medium |
| VIZ-3 | Junctions: sources → junction → callers diagram *(follow-up)* | UX | medium |
| VIZ-4 | Prop-relay: component-boundary chain diagram + detail *(follow-up)* | UX/MODEL | medium |
| INLINE-1 | Inline-preview: list consumers + inlined-code preview | UX | medium |

**Suggested sequence.**
1. **Quick wins / culls first** (immediate de-noise, all low-risk): SHELL-4, MD-3, MD-4,
   MD-2, MD-1. These shrink the surface before the structural work and directly serve
   theme #1.
2. **The two correctness bugs** (BUG-1, BUG-2) — they're polluting the fan-out source
   list and the inline-preview verdicts the user is actively reading; fix before
   investing in the visualizations that render that data.
3. **Shell restructure** (SHELL-2 → SHELL-5 → SORT-1 → SHELL-1 → SHELL-3) — sticky chrome
   and the picker swaps are small and self-contained; the sidebar retirement + file-tab
   strip are the bigger structural moves that complete theme #3.
4. **Consolidation + self-containment** (MD-5 → SKILL-1, then MD-6, MD-7) — theme #1's
   deeper half. SKILL-1 rides MD-5: update the skill's report manifest the moment the
   `overview` doc's manifest lands so they stay in lockstep.
5. **Network diagrams** — **VIZ-1 (boundary) only this stretch**, built as the reusable
   two-sided component and fully dialed in; **VIZ-2/3/4 are an explicit follow-up** once
   the template is proven (decided). INLINE-1 rides alongside BUG-2.

A pragmatic first execution slice: **the culls + MD-1 + BUG-1/BUG-2** (high-value,
bounded), then **VIZ-1 as the network-diagram template**, then the shell restructure.

---

## Decisions (resolved — these are now part of the plan)

1. **Culls (MD-2/3/4) — confirmed.** Remove `path-census`, `path-gallery`,
   `transformation-ledger` outright. Remove the **markdown** `dossier` from the web UI
   (it's "a giant wall of text") — **but keep the JSON form available on request**: the
   dossier data stays reachable via `/api/report.json` (`server.mjs:218-235`); only the
   `dossier` *view/tab* and its markdown renderer go. Breaking the removed `?view=` URLs
   and `/api/report.<view>.md` endpoints for the three culled reports is fine — no
   redirect/stub needed.
2. **Consolidated `overview` markdown (MD-5) — make it a real, distinct document.**
   Create an **actual new `overview` markdown view** (not a renamed repair-map, not a
   mirror of the web overview page). It is **its own thing**: a summarizing, **agent-
   *and* human-facing** document. Move `repair-map`'s contents into it; aggregate tables
   (hotspots, repair buckets, unknown-edges-as-diagnostic) live here. Critically, it
   must include a **manifest of every other markdown report and what each is for** — so
   an agent landing in the dumped markdown has **one spot to orient** before making
   sense of the rest. **Also update the skill** that documents/consumes these reports so
   the report set stays consistent (see SKILL-1).
3. **Network diagrams (VIZ) — one template first.** Build **VIZ-1 (boundary) as the
   reusable two-sided diagram component** and get it fully dialed in (with the
   report-reconcile pairing), *then* apply it to fan-in / junctions / prop-relay in a
   follow-up. Don't build all four at once.
4. **Native-select replacement (SHELL-5) — custom popover, no dependencies.** Build it
   as a **reusable popover component** so the logic (esp. content positioning relative
   to the trigger) is consistent everywhere. If a custom-popover pattern already exists
   in the repo, factor it into the one shared component rather than re-implementing.
5. **File-page tabs (SHELL-3) — code map is its own first tab.** The code map is the
   first tab in the file-page strip; each file-scoped report is a subsequent tab.
6. **Top nav (SHELL-1) — drop the Files list entirely; nothing extra in the top bar.**
   No sidebar Files jumper — the user returns to the overview for the big findings
   table, which is good enough. The top nav holds **only** the title + repo/path for now
   (no search box, no Re-analyze, until asked).
7. **Bug fixes (BUG-1/BUG-2) — take the safer, more robust option.** BUG-1: apply
   **both** guards (exclude kind-`"operation"` roots in `fanOutRootsFor` **and** extend
   `isConstantSink` so inert object-literal sinks are demoted out of the ranked set).
   BUG-2: match call sites by **program-independent identity** (`defFile:defLine:name`),
   not raw `Symbol` object. Robustness over minimalism in both.
8. **INTENT updates — approved.** Apply all three (below) as part of this work.

### SKILL-1 — Update the report-documenting skill to match the new report set **[ARCH]** (small)
Per decision 2: as the culls (MD-2/3/4), the dossier removal (MD-3), and the new
consolidated `overview` doc (MD-5) land, **update the skill** that lists/describes
tsx-dataflow's markdown reports so it stays consistent (no references to removed
reports; the `overview` doc documented as the orientation entry point). Locate the
exact skill during execution; keep its report manifest in lockstep with the
`overview` doc's manifest so the two never drift.

---

## INTENT updates (approved — to be applied)

- **§1 / new — every markdown report is a single, self-contained, token-efficient
  deliverable.** No report repeats another's content; each carries the full *actionable*
  detail for its concern rather than an aggregate that points elsewhere. Aggregator
  reports collapse into one `overview`, which also carries a **manifest of every other
  report and its purpose** — the agent's single orientation point.
- **§7 / extend — the network diagram is the default visualization for any
  source↔sink/consumer relationship**, not just fan-out: boundary, fan-in, junctions,
  and prop-relay each get the same two-sided picture + a detail-listing markdown beneath
  (the round-7 reconcile pattern, generalized). Build one reusable component, template
  the rest.
- **§1 / §8 — the shell is two clean surfaces with a sticky top nav.** Workspace
  analysis lives on the overview (cross-file report tabs + burden table); file analysis
  lives on the file page (**code map as the first tab** + file-scoped report tabs); the
  left sidebar (Reports *and* Files lists) is retired; the title + repo/path is the only
  persistent sticky anchor; top chrome is sticky and stays one line on wide viewports.
