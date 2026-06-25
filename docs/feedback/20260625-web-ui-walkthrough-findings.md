# tsx-dataflow web UI — walkthrough findings

Distilled from the 10:25 screen-recording voiceover (`transcript/transcript.txt`).
The video went black ~2s in (window moved between monitors mid-record), so this
is reconstructed from the **audio transcript only** — every frame in `frames/`
is black. Where I could map a complaint to exact code I did; a short list of
genuine unknowns is at the end.

**Surface area under review** (the server-rendered web UI):

| File | Role |
|------|------|
| `src/server.mjs` | Routes + overview page + file page assembly |
| `src/html/page.mjs` | HTML shell, all CSS, all client JS |
| `src/html/code-map.mjs` | Annotated code map + finding detail panels |
| `src/html/source-peek.mjs` | `path:line` → click-to-reveal popovers |
| `src/html/markdown-to-html.mjs` | Report-view markdown rendering |

---

## The one big theme

The loudest, most-repeated point in the whole recording (transcript lines
60–89, 107–119) is **architectural, not cosmetic**:

> "there's this real disconnectedness of all of the reports and findings, and
> the sort of main view, which is the code map and the right-hand side… if
> things are working really well, this bottom report section just does not
> exist."

Today the file page (`renderFilePage`, `server.mjs:487`) is two disconnected
worlds stacked vertically:

1. **Top:** the code map (`#codemap`) — left = source, right = sticky finding
   detail panel.
2. **Bottom:** ~17 report views (`FILE_VIEWS`, `server.mjs:24`) each dumped into
   a collapsed `<details>` (`server.mjs:494-508`). Repeated-forks, junctions,
   defensive-ledger, path-census, etc. all live here as rendered markdown.

The user's mental model wants **one** view:

- **Left:** the code.
- **Right:** a *finding explorer* that is either (a) a **list** of everything
  found in the file, or (b) the **detail** of one selected item.
- Closing the detail returns you to the list. The bottom "Reports" pile is
  folded *into* the right panel / overlaid on the code, not parked below the
  fold where "none of this stuff is rendered anywhere up on the code map"
  (transcript 71) and "I can't actually interact with it in a useful way" (72).

Everything below is either a tributary of this theme or a standalone polish item.
I've tagged each: **[ARCH]** structural, **[UX]** interaction/polish,
**[BUG]** broken/inconsistent, **[COPY]** wording.

---

## Overview page (`/`, `renderOverview` — `server.mjs:347`)

### O1 — Native `<input>`/`<select>` look terrible **[UX]**
> "these native input and select elements, good info but they look terrible, we
> should basically never render a default native element." (transcript 5–6)

`page.mjs` styles `button, .btn` (`page.mjs:83-87`) but has **no rules for
`input`, `select`, or `textarea`** (confirmed by grep). The search box and the
two dropdowns in the toolbar form (`server.mjs:435-451`) render as raw OS
widgets — visually out of place against the styled buttons/cards.
**Fix:** add `input, select { font: inherit; padding; border: 1px solid
var(--border); border-radius: 6px; background: var(--panel); color: var(--fg) }`
to the shell stylesheet.

### O2 — Sorting works but isn't where you reach for it **[UX]**
> "This sort is actually pretty nice… I really want to be able to sort by
> clicking on the headers though… There's also no indication as far as I can
> tell of how they're being sorted." (transcript 8–16)

Sorting exists three ways today: the `<select name="sort">` dropdown
(`server.mjs:443-448`), a text "Sort: burden · finding count · …" line of links
(`sortLink`, `server.mjs:393`, emitted `:455-458`), and the `sort=` query param
(`overviewState`, `server.mjs:232`). But the table `<th>`s themselves
(`server.mjs:460`) are **plain text, not clickable**, and **carry no
active-sort indicator** (no ↑/↓ arrow, no highlight). The user found the sort by
accident via the query param ("I see it up in the query peram… better than
nothing").
**Fix:** make each sortable `<th>` an anchor using the existing `overviewHref`
machinery, and render a direction caret on the active column. Note: the current
sort has no direction toggle at all (always fixed order per mode) — clicking a
header should ideally flip asc/desc.

### O3 — "Files by burden" heading is static / rows are unlabeled **[COPY]**
> "all I see is this burden thing… I think these are just the hotspots or the
> findings, even that's not clear, so maybe some words indicating like what all
> these are." (transcript 114–116)

The `<h2>Files by burden</h2>` (`server.mjs:452`) is hard-coded and doesn't
change when you sort by depth/findings/file. More importantly the user couldn't
tell *what a row represents* (a file? a hotspot? a finding?). The columns are
File / Findings / Worst / Path depth / Dominant shape / Ownership / First cut
(`server.mjs:460`) with no explanatory caption.
**Fix:** make the heading reflect the active sort, and add a one-line "Each row
is a file on a render path; *Worst* = highest burden finding in it" caption.

### O4 — Pagination should probably be "show more" **[UX]**
> "pagination, that's pretty good, that's better than nothing… I almost wonder
> if we just need to show more instead of paginating… pagination kind of never
> works." (transcript 18–20)

`OVERVIEW_PAGE_SIZE = 25` (`server.mjs:208`); pager rendered at
`server.mjs:417-428`. Not a defect — an explicit preference to swap the
Prev/Next pager for an opt-in "show all / show more" affordance.

### O5 — Reset works; site-title should also reset **[UX/BUG]**
> "I can click reset, that's pretty good. I would have also expected this top
> left name to be selectable, click and reset, get back to the main page."
> (transcript 21–23)

The "Reset" button (`server.mjs:450`) clears filters fine. The complaint is the
**sidebar title**: on the overview, `overviewNav` emits a bare
`<h1>tsx-dataflow</h1>` (`server.mjs:339`) — **not a link**. But on the file
page, `fileNav` emits `<h1><a href="/">tsx-dataflow</a></h1>`
(`server.mjs:480`). So the title is a home link on one page and dead text on
another. See also N1.
**Fix:** make the title always `<a href="/">`.

---

## File page — code map & detail panel (`/file`, `code-map.mjs`)

### F1 — Auto-selecting the worst finding is disorienting **[ARCH/UX]**
> "I come in and I guess this is down on line 99, but I'm looking at the first
> line… it feels like that's what's wrong. I would almost expect the selected
> finding to be something that shows up after a click, so maybe we start with
> just an initial list of all of the findings." (transcript 26–35)

`renderCodeMap` force-activates the first (highest-burden) panel —
`panels[0].replace('class="finding"', 'class="finding active"')`
(`code-map.mjs:551`) — while the source column is scrolled to the top. So the
panel describes line 99 but the eye is on line 1, with no scroll linkage.
**Fix (matches F8 + the big theme):** default to **no selection** and show the
*list* of findings in the right panel; selecting one (a) reveals its detail and
(b) scrolls the source to its line.

### F2 — Selection indicator is too weak **[UX]**
> "I get this really thin indicator with the blue border there, that's not
> enough… maybe just a bigger box… the blue does not look good, ideally it would
> match the style of the coloring." (transcript 36–39)

Selection styling: `.hit.sel { outline: 2px solid var(--accent) }`
(`page.mjs:119`) and `tr.sel td { background: rgba(88,166,255,0.22) }`
(`page.mjs:132`). The user wants something heavier and **tinted to match the
burden heat palette** (`--bt` hue used by `.hit.heat`, `page.mjs:109-117`)
rather than the generic accent blue.
**Fix:** thicker outline / filled box keyed off `--bt` so selected = "hotter"
version of its own heat color.

### F3 — Selecting doesn't scroll the source; no "keep in view" **[BUG/UX]**
> "I would expect to go to click and scroll this thing to the correct spot, I
> just like keep this in view by default, click center maybe." (transcript 40–42)

Inconsistent scroll behavior in the click handler (`page.mjs`):
- Clicking a code `.hit` activates the panel but **does not scroll the source**
  (`page.mjs:344-351`).
- `activate()` scrolls the *panel* with `{block:'nearest'}` (`page.mjs:318`).
- Only the **xref** path ("same code — N more") scrolls the source line, and it
  uses `{block:'center'}` (`page.mjs:336`).

So the one place that does what the user wants (center the source line) is the
least-used path. **Fix:** on any selection, scroll the corresponding `.hit` into
view centered, mirroring the xref branch.

### F4 — Selection isn't persisted in the URL; refresh loses it **[BUG]**
> "refresh the page, yeah it does not remember what's selected, so maybe that's
> part of it is get the selection up into the query program. In general I always
> want the statefulness to be reflected in the query program." (transcript 42–45)

`/file` reads `?path` and `?view` (`server.mjs:154-164`) but there is **no
selected-finding param** (confirmed by grep). Selection lives only in client DOM
classes, so reload resets to the auto-selected worst finding (F1). This is a
stated general principle: **all view state belongs in the query string** so a
refresh restores you. Also applies to the overview (filters/sort/page already
are in the URL — good — selection on the file page is the gap).
**Fix:** add `?finding=<id>` (and honor it server-side to pre-activate + scroll).

### F5 — Detail panel is too wide / wasted right-edge space **[UX]**
> "a burden breakdown, this is fine, this thing is way too wide, it's not
> helpful that it goes all the way to the edge." (transcript 45–47)

The file page is rendered `wide` (`server.mjs:524`), so `main.wide` allows up to
`min(2200px, 100%)` (`page.mjs:49`). The code-map grid is `minmax(0,800px)
minmax(360px,1fr)` (`page.mjs:97`) — the source caps at 800px but the detail
panel (with the burden-breakdown bars, `code-map.mjs:328`) **absorbs all
remaining width to the viewport edge**. On a wide monitor that's a very wide,
sparse panel.
**Fix:** cap the panel column too (e.g. `minmax(360px, 560px)`), or center the
whole code-map block.

### F6 — Path tables: narrow content in a too-wide container **[UX]**
> "path, same thing with path, this is like weird, we've got a narrow table
> inside a wide container, this should go wider, this column here with
> location." (transcript 47–49)

Two candidates depending on which "path" was on screen:
- The **path detail** inside a finding panel (`pathSection`, `code-map.mjs:56`)
  renders a `.path-table` with fixed column widths (`page.mjs:209-217`) inside
  the wide panel — narrow table, lots of empty container.
- The bottom **path-census / path-gallery** report views render markdown tables;
  global `table { display:block; overflow-x:auto }` (`page.mjs:52`) keeps them
  from filling the wide `main`.

Either way the complaint is the same mismatch (small table, big shell) and ties
to F5. **Fix:** let path tables use the container width (relax the fixed
`table-layout` / column caps in `page.mjs:209-217`), especially the Location
column the user called out.

### F7 — Path/Location steps need cross-file navigation **[ARCH/UX]**
> "I like that I can click, if it's the same file I would also maybe want to
> just be able to zoom to it… if it's not the same file I'd really like to have
> a link… 'jump to file', but then like renders it, or maybe it gives me a
> expand, so I can see the big overlay with the code… it's a little hard at the
> moment to make sense of these hops because you're clicking and sort of losing
> track of the file." (transcript 49–60)

Per-step locations render via `stepLocationHtml` → `sourceReferenceHtml`
(`code-map.mjs:48`, `source-peek.mjs:54`), which produces a **hover/click peek
popover** of the cited lines (`inlinePeekHtml`, `source-peek.mjs:46`). Two gaps:
1. **Same-file step:** no "zoom/scroll to this line on the current code map" —
   the popover shows a detached snippet instead of moving the main view.
2. **Cross-file step:** no link to `/file?path=<other>` — you can peek but not
   *navigate*, so you "lose track of the file" while walking hops.

The user explicitly wants either a **"jump to file"** link or an **expand
overlay** that flies the target code in (transcript 84–87: "I'd really like for
that code to fly in at the top or the bottom… that way I can click and jump to
it").
**Fix:** make same-file step locations scroll/center the code map; make
cross-file ones real `/file?path=…#finding=…` links (or an overlay panel).

### F8 — No "list of everything" / can't close the detail **[ARCH]**
> "I would expect to be able to close this thing and be looking at just a giant
> list of stuff again rather than always having to have something open."
> (transcript 34–35); "I want to be able to close this thing, and then when I
> close it I want to be able to see a list of everything." (transcript 68–69)

The panel CSS hides every non-active finding: `.finding { display:none }` /
`.finding.active { display:block }` (`page.mjs:178-179`), and one is always
forced active (F1). There is **no list mode and no close/deselect control** in
the click handler (`page.mjs:243-366`). This is the right-panel half of the big
theme.
**Fix:** add a list/summary state (all findings as compact rows) + a close
button that returns to it.

### F9 — Overlay the path onto the source ("where defined / where used") **[ARCH]**
> "really it would just be nice if it overlaid onto this left side, so I could
> just see exactly where these are… 'this is where it's coming from, this is
> where itself is defined'… maybe that's what's missing — when you're in this
> overlay mode, it only shows the one that is selected, and then shows you the
> detailed info." (transcript 54–60)

Today representative-path lines are only faintly marked with the `.on-path`
border (`code-map.mjs:529`, `page.mjs:126`) for *all* findings at once. The user
wants a **focused overlay for the selected finding**: highlight its source line,
its definition line, and the hops between them directly on the left column —
turning the code map into the path visualizer rather than the bottom path-census
table.

### F10 — "Reaches N sinks" is unclear **[COPY]**
> "I don't quite understand what reaches just 31 syncs is supposed to be telling
> me." (transcript 60–61, again 88–89)

`reachSection` (`code-map.mjs:93-115`) renders `<summary>Reaches N sinks</summary>`
expanding to "via `<source>` → N sink(s)". The term "sink" (a JSX render site)
isn't explained in-context, and the collapsed summary gives no hint of *why it
matters*.
**Fix:** expand the wording ("This value flows into N places that render to the
DOM") and/or a tooltip defining sink. ("syncs" in the transcript is the
transcriber mishearing "sinks".)

### F11 — Defenses are missing location + context **[BUG]**
> "defenses feels pretty good, these are missing the like line, and just like
> the overall context of where it's being used or defined." (transcript 61–63)

The defenses list in `findingPanel` (`code-map.mjs:288-295`, rendered `:321`)
prints `expression — verdict (type)` but **omits the line number**, even though
the data is present: the debug dump includes `@ :${d.location?.line}`
(`code-map.mjs:231`). So the panel knows the location and drops it.
**Fix:** append `d.location?.line` (as a source-peek reference) to each defense
row.

### F12 — The whole "Reports" pile should fold into the panel **[ARCH]**
> "all of this other stuff is kind of like derived from or repeated in here, so
> we probably just need like one view that brings all of this together, and that
> should be the main view… this bottom report section just does not exist."
> (transcript 64–78)

`FILE_VIEWS` are emitted as ~17 collapsed `<details>` below the code map
(`server.mjs:494-508`). The path detail in particular is **collapsed by default**
(`pathSection` `<details>` with no `open`, `code-map.mjs:70`) despite being, in
the user's words, "the most important and useful thing because it shows the
trajectory." Minimum viable step: **open the path section by default**; full fix
is the big-theme consolidation.

### F13 — Repeated-fork / "status used" info isn't on the map **[ARCH]**
> "being able to see that this status variable is used… it's used as this
> repeating fork kind of thing, I'd really like for all this info to be visible
> up here on the map, but at the moment I'm down here." (transcript 71–75)

The `repeated-forks` view (README:143) lives in the bottom pile, disconnected
from the code map. Same consolidation ask, specific to fork findings: surface
"this variable drives a repeated fork" *on the line* in the map.

---

## Junctions & the finding-vs-expression data model

### J1 — Junctions should be navigable + first-class **[ARCH/UX]**
> "if we look at like the junctions… these are referring to all of the helper
> variables that are created, so it says like line 352, I would really like to
> just be able to go to line 352 and see that this is being identified as a
> junction, and then I can click on 'has extra' and get the overview information
> about that being a junction." (transcript 90–96)

The `junctions` view (README:155, "confluence functions where lineages fork in
and re-spread") renders as markdown in the bottom pile; its `path:line`
references become peek popovers (`source-peek.mjs:78`) but there's **no jump to
the line on the code map** and **no way to click the named expression (e.g.
`hasExtra`) to see a per-expression overview.**

### J2 — The model is finding-centric; the user wants expression-centric **[ARCH]**
> "I want to know that 'has extra' is an important named thing, and that
> junctions are a part of that naming, so when I click on it I can see the
> junction, I can see where used… whereas at the moment I'm clicking on these and
> it's specific to a finding, it's not 'here's what we know about this
> expression', instead it's 'this expression has some sort of finding associated
> with it'… it makes it difficult to attach multiple pieces of analysis to the
> same thing." (transcript 94–102)

This is a **data-model observation**, the second-biggest idea after the big
theme. Today the unit of navigation is a **finding/sink** (`sink.id`, panels
keyed by it throughout `code-map.mjs`). The user wants the unit to be the
**named expression/symbol** (`hasExtra`, `status`, …), with findings, junction
membership, reach, defenses, etc. all *attached to it* as facets. Clicking a
symbol would show "everything we know about this expression," of which a finding
is one tab. This likely touches the analyzer's output shape in `src/core.mjs`,
not just the HTML layer.

---

## Cross-page navigation & report pages

### N1 — Title is a link in some places, dead text in others **[BUG]**
> "I go back oh that's gross, so like if I'm in here this is a link, but if I'm
> on the home page it's not a link, but then I might want this to be a link."
> (transcript 103–105)

Same root cause as O5: `overviewNav` title is plain text (`server.mjs:339`),
`fileNav` title is a link (`server.mjs:480`). Make it consistently a home link.

### N2 — No way back to the overview from a report page **[BUG/UX]**
> "I've clicked through to a different page and its review equals findings,
> that's nice, but now I like can't get back to that overview very easily, or if
> I can I don't see it, I don't think I can." ("review equals findings" =
> `/report?view=findings`) (transcript 105–107)

The `/report` page (`server.mjs:122-140`) uses `overviewNav` for its sidebar, but
that nav's title isn't a link (N1) and there's **no breadcrumb / "← Overview"
control**. So from a report view there's no obvious path back to `/`.
**Fix:** breadcrumb in the `.toolbar` (`server.mjs:132`) and/or the linked title.

### N3 — Project-level findings are an inert markdown dump **[ARCH/UX]**
> "these findings are good, these are like project level… but these are
> basically just rendering the markdown, and I've got no real ability to go
> click through and like load the file page for these… this big dump of stuff is
> maybe useful for looking at, but it does not feel very coherent yet."
> (transcript 107–112)

`/report` renders a view's markdown via `markdownToHtml` then `peekReferences`
(`server.mjs:126-127`). Peek gives you **popovers** but **not links to
`/file?path=…`** — so you can preview a location but not navigate to its file
page. The user wants each finding row to be a real click-through.
**Fix:** in addition to (or instead of) the peek popover, linkify `path:line`
references to `/file?path=<path>&finding=…#…`.

### N4 — One finding type dominates; others are second/third-class **[ARCH]**
> "it'd be really nice if I could see the totality of the problems and findings
> in a way that's a little more explorable, as opposed to a really strong
> emphasis on one type of finding, with the others being this second or third
> class citizen, that's very hard to make sense of." (transcript 116–119)

The overview ranks/leads with **burden** (the `findings` lens), and the file
page leads with the code map + findings panel while the other ~16 views are
collapsed below (`server.mjs:494`). Repeated-forks got praise for *naming* its
issue class explicitly (transcript 113), which is the model to generalize: a
**unified, explorable finding inventory** where each analysis type is a
first-class, browsable facet rather than a buried `<details>`.

### N5 — Positive notes (keep these) **[—]**
For balance, things the user explicitly liked:
- Sorting exists and is "pretty nice" (8–9).
- Pagination "better than nothing" (18).
- Reset works (21).
- Vendor/render-path overview "feels pretty good"; clicking into top finding
  "feels pretty good" (24–25).
- Defenses section "feels pretty good" (61) — just needs the line (F11).
- Repeated-fork report calling out the issue class by name is good (113).
- The representative **path** is recognized as the single most valuable artifact
  (64–66) — argument for promoting it, not hiding it (F12).

---

## Suggested priority

| # | Item | Type | Effort |
|---|------|------|--------|
| F11 | Add line/context to defenses | BUG | trivial |
| F12 | Open path section by default | ARCH(min) | trivial |
| O1 | Style input/select | UX | trivial |
| O5/N1 | Title always a home link | BUG | trivial |
| F2 | Stronger, heat-tinted selection | UX | small |
| F3 | Scroll source to selection (center) | BUG | small |
| O2 | Clickable sort headers + indicator | UX | small |
| N2 | Breadcrumb back to overview | UX | small |
| F4 | Selection in `?finding=` query state | BUG | small-med |
| F7/J1 | Same-file zoom + cross-file jump links | ARCH | medium |
| N3 | Linkify report findings → file page | UX | medium |
| F1/F8 | List mode + close/deselect, no forced auto-select | ARCH | medium |
| F9 | Per-selection path overlay on the source | ARCH | large |
| F12/F13/N4 | Fold report views into the right panel (one unified explorer) | ARCH | large |
| J2 | Expression-centric model (findings as facets) | ARCH | large (touches core.mjs) |

---

## Open questions / things I couldn't verify (video was black)

1. **Which "path" was on screen at transcript 47–49** (F6) — the in-panel
   `.path-table`, or a bottom path-census/path-gallery markdown table? They have
   different fixes. A screenshot of that moment would disambiguate.
2. **The "31 sinks" finding (F10)** — confirm whether the confusion is purely the
   word "sink," or also that the count seemed too high/wrong for that value.
3. **"reaches sync… those are all this info, okay, nevermind" (transcript 88–89)**
   — the user trailed off mid-thought about reach + cross-file jumping. Likely
   already captured by F7/F10, but flag if there was a distinct reach idea.
4. **Auto-select line 99 vs. viewport on line 1 (F1)** — confirm the file/finding
   so I can check whether scroll-to-selection alone fixes it or whether the worst
   finding genuinely shouldn't be the landing state.
5. **"has extra" (J1/J2)** — assumed this is a `hasExtra` helper/junction symbol
   in the demoed file. Confirm the symbol + file so the expression-centric
   example is concrete.
6. **Which file was open** during the whole code-map walkthrough (transcript
   24–102)? Knowing it lets me pin every line-number reference (99, 72, 352) to
   real source and validate the path/junction behavior directly.
