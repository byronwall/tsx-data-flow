# tsx-dataflow web UI — walkthrough findings, round 5 (drill-into-the-count)

Distilled from the **12:57** screen-recording voiceover in
`~/Desktop/tsx-dataflow-gitvisuals-context` (`transcript/transcript.txt` +
`transcript/transcript.srt`). The recording has **real, legible video** — all 78
frames in `frames/` are ~300–420 KB and readable, so every claim below is grounded
in both the audio and a specific frame. Frame timing follows the SRT (one frame per
10 s: the comment at time `t` ≈ `frame_{floor(t/10)+1}`).

**Important context the user gave:** *"I'm just doing it on a slightly different
repository… all of the same findings would have held on the previous one. I just
was looking at a different repository just to get a feel for how the tool handles
something different."* So the footage is from a **different repo** (`git-visual-files`,
a Solid/SolidStart app) than this one — the screenshots show that repo's components
(`DiffModal.tsx`, `CommitsTable.tsx`, `useDiffModalState.ts`, …), which this repo
doesn't contain. The **code locations below are pinned in *this* repo's source**
(the renderers are repo-agnostic); the frames are evidence of behavior, not of
this repo's files.

This is the fifth round, following
`...-findings.md` (r1), `...-round2.md` (r2), `...-round3.md` (r3), and
`...-round4.md` (r4). **Round-4's big bet paid off and is visible on camera:** the
**unified typed/filterable per-file list (ARCH-2) fully landed** — fan-out,
sources, boundaries, relays, unknown-edges are now first-class entries with filter
pills and a `sources` sort mode (frames 48 & 66). The user navigates it
naturally and never once asks "where did my reports go." With the *list* solved,
this round is almost entirely about the **next layer of depth**:

1. **The meta-theme — every count must be drillable.** "Any place we have a count,
   we need to be able to see what's inside that count… at the moment it's just a
   big scary number." (transcript 80–82) Repeated for junctions, boundaries,
   source-boundaries, fan-out, fan-in.
2. **Fan-out & fan-in need dedicated renderers — ideally a node/edge graph.** Both
   are "legitimately weak"; the aggregate count alone is "not helpful." (8–42)
3. **Fan-out semantics look wrong** — the user suspects `props.isOpen fans to 28
   sinks` is matching the *name* `isOpen` across the whole repo, not one resolved
   value. **Confirmed in code: the grouping key is a name string.** (30–35)
4. **A "where used" / references view** — the tool "is becoming more of a general
   code overview tool and not purely a refactor helper." (44–53)

…plus a tail of ordering/linkability/copy fixes.

**Files in play** (unchanged from prior rounds):

| File | Role |
|------|------|
| `src/server.mjs` | Routes + overview page + file-page assembly + per-file scoping |
| `src/core.mjs` | The analyzer: ranking, burden, defenses, junctions, fan-out/in, report views |
| `src/html/code-map.mjs` | Annotated code map + unified list + all detail panels + path overlay |
| `src/html/page.mjs` | HTML shell, all CSS, all client JS |
| `src/html/source-peek.mjs` | `path:line` previews + Open-file links + click-to-reveal popovers |
| `src/html/markdown-to-html.mjs` | report-view markdown rendering |

Tags: **[ARCH]** structural · **[UX]** interaction/polish · **[BUG]** broken/inconsistent ·
**[MODEL]** analyzer/data-model · **[COPY]** wording.

---

## ✅ What landed well (round-3/4 fixes, verified on camera)

The user explicitly confirmed or comfortably *used* these — recording them guards
against regression:

- **ARCH-2 fully landed — the unified typed list is now the backbone.** The file
  page header reads *"N items in this file — Everything the analyzer found here —
  findings, repeated forks, junctions, boundaries, sources, relays, fan-out,
  unknown edges, and plain usages."* with filter pills **`All 31 | findings 8 |
  boundaries 4 | sources 12 | fan-out 5 | usages 2`** and sort **`score | type |
  line | sources`** (frames 48, 66). Code: `ENTRY_TYPES` now has **9 types**
  (`code-map.mjs:777-788`), filter pills at `code-map.mjs:1414-1445`, sort modes
  (incl. the `sources` / merge-width mode) at `code-map.mjs:1447-1464`,
  `renderCodeMap` takes `{sinks, forks, helpers, sourceBoundaries, unknownEdges,
  relays, fanOut}` (`code-map.mjs:1131-1144`). This is INTENT §1 essentially
  delivered. ✓
- **Fan-out / source / boundary promoted into the list.** Frame 66 shows
  `FAN-OUT props.isOpen 28 sinks`, `SOURCE useDiffModalContext 3 sink(s)`,
  `BOUNDARY` rows all in one list (build loops `code-map.mjs:1309-1392`). ✓
- **The "Layers" sticky strip is gone (round-4 LAYERS-2).** No horizontal strip in
  any frame; the sidebar "On this page" nav remains (frames 11, 48). ✓
- **Overview sort works and the caret no longer wraps (round-4 CARET-1).** Frame 1:
  `Worst ▼` sits inline-right, header is one line; new `Path depth` column present;
  "Sort by burden" select. ✓
- **Usages are de-rated, not mislabeled as findings (INTENT §4).** Frame 28 panel:
  *"Not a smell — a plain use of props.isOpen. Shown so you can trace it."* ✓
- **Repeated forks confirmed genuinely useful.** *"repeated forks, that would
  actually make sense in a file… this is one where it is very useful."* (54–56) ✓
- **Context relay is "pretty good / pretty close to good."** (83–94) Frame 55:
  `InlineDiffConnector relay`, "Signal same-feature prop bundle", "All forwarded
  props — 3", "Context hooks in scope". Only minor surfacing asks remain (see
  RELAY-1). ✓
- **Unknown edges "actually pretty clear… UI doesn't really need to do much."**
  (113–114) ✓
- **Source-peek hover on locations works** — frames 25 & 28 show the inline
  reveal popover on a `path:line` (`source-peek.mjs:86-110`). ✓

> "I think at this point, this is becoming more of a general, just code overview
> tool." (transcript 52) — said approvingly; the tool has outgrown "refactor helper."

---

## 🎯 Big theme #1 — every count must be drillable ("show what's inside the number")

The single most-repeated idea this round, stated as a **general principle**:

> "Any place where we have a count, we need to be able to see what's inside that
> count. At the moment, it's just like a big scary number, and that's not helpful."
> (transcript 80–82)

It recurs on every aggregate the user touches: junctions ("8 inbound sources"),
boundaries ("5 inbound sources and a tributary"), source-boundaries ("39 sinks /
1 file"), fan-out ("28 sinks"), fan-in ("14 root sources / 25 predicates"). This is
INTENT §7 ("show, don't tell") and §4 ("summarize, cap, and let the user expand").
The fixes are per-count but share one shape: **make the number a disclosure that
reveals (a capped, expandable list of) its members, each a clickable `path:line`.**

A crucial data-availability finding from mapping the code — the underlying lists
are **not uniformly retained**, so some of these are pure UI work and some need an
analyzer change:

| Count (frame) | Render site | Full list available there? |
|---|---|---|
| Junction "8 inbound sources" | `code-map.mjs:949-951` (`junctionPanel`) | **Partial** — `helper.inRoots` is **capped at 8** and falls back to param names; full root set not retained (`core.mjs:2276-2282`) |
| Boundary "5 inbound sources + a tributary" | `code-map.mjs:949-955` (same `junctionPanel`) | **Partial** — same as above |
| Source-boundaries "39 sinks / 1 file" | `core.mjs:5680-5681` (`renderSourceBoundaries`) | **No** — `affectedSinks` is pre-capped at `REACHED_VIA_CAP = 50` (`core.mjs:3754-3758`) and only **4** shown via `affectedSinkSummary` (`core.mjs:5687`); overflow stored as `omittedSinks` |
| Defenses "— N" | `code-map.mjs:521` (`findingPanel`) | **Yes** — count and list both iterate full `sink.defenses` (already consistent) |
| Fan-in "14 root sources" | `core.mjs:5269` (`renderFanIn`) | **Yes** for roots (`sink.roots`/`sink.rootInfos`); **No** for "predicates"/"max distance" (scalar metrics, no backing array) |

### DRILL-1 — Junction/boundary "N inbound sources" must list those sources **[UX/MODEL]**
> "I see eight inbound sources. Does that mean it's using eight things from above?
> Maybe. This is one that's just lacking useful information… we say there's eight
> inbound sources, but then we don't reveal them." (transcript 77–80)

`junctionPanel` (`code-map.mjs:921`) renders `${helper.inSources ?? 0} inbound
source(s) → ${helper.callerCount ?? 0} caller(s)` at `:949-951`, and a
"Tributaries" list from `helper.inRoots` at `:923-929/:955`. **But `inRoots` is
capped at 8 labels (`core.mjs:2277-2282`) and `inSources` is the full count
(`bodyTrace.roots.length`, `core.mjs:2276`)** — so an "8 inbound sources" header can
sit above a list that's truncated or shows only param names. Frame 48 is the file
where every row is a `BOUNDARY` with `messy internals` / `clean pipe` and no obvious
way to see the lineage. **Fix:** (a) make the inbound-sources count an
expandable disclosure that lists each source as a clickable `path:line`; (b) to do
it honestly, retain the full inbound-root list on the helper object (lift the slice
in `core.mjs:2277-2282` into the *render* layer so the count and the list can't
disagree), or show "showing 8 of N". Also clarify the copy — the user literally did
not know whether "inbound sources" means "things it consumes from above" (it does).

### DRILL-2 — Source-boundaries "39 sinks / 1 file" must be expandable, and reconcile the cap **[MODEL/UX]**
> "We're saying that there's 39 sinks in one file… I don't know what that means. We
> just seem to list all 39 or show a diagram or something. This is not helpful as it
> sits." (transcript 119–121)

`renderSourceBoundaries` (`core.mjs:5668`) shows `${row.sinkCount} sinks / N files`
(`:5680`) but only 4 representative sinks (`affectedSinkSummary` `.slice(0,4)`,
`:5687`), and the backing `affectedSinks` is itself capped at 50 with the rest in
`omittedSinks` (`core.mjs:3754-3758`). Frame 71 shows the report listing a handful
of representative sinks per row. **Fix:** expose all (capped, "+N more") sinks under
the count — and surface `omittedSinks` truthfully ("showing 50 of 39"-type lies are
exactly INTENT §6). This is the same disclosure pattern as DRILL-1.

### DRILL-3 — Boundary report: let me see *why* a boundary is bad, and decode "tributary" **[UX/COPY]**
> "I want to be able to actually see why is inline-surface-style considered so bad…
> I can't make sense of this five inbound sources and a tributary. I don't know what
> that means." (transcript 105–112)

Frame 66 file `DiffModal.tsx#L30` shows `BOUNDARY` rows; the boundary report
(`renderBoundaryReport`, `core.mjs:5607`) presents an aggregate table with "inline
surface style coming in five ways", "internal churn", "messy internals" but no
drill into the contributing sinks/paths. The "tributary" term (`junctionBody`,
`core.mjs:5769`) is undefined to the user. **Fix:** (a) the boundary detail should
break down its contributing sinks/paths (reuse the finding path table); (b) rename
or gloss "tributary"/"distributary" inline (one-line "what this means" — INTENT §7).
Tie to DRILL-1 (same panel/`junctionPanel`).

**Shared mechanism for DRILL-1/2/3:** a small reusable "count → reveal list"
disclosure (cap + "+N more" + each member a `path:line` link). The data-retention
note above decides which need an analyzer tweak (junction roots, source-boundary
sinks) vs. pure UI (defenses, fan-in roots already in scope).

---

## 🎯 Big theme #2 — fan-out & fan-in need dedicated renderers (a node/edge graph)

> "The one that stands out the most is probably the fan out… it doesn't really help
> to see one of 78 things… There's got to be a much better way of showing this.
> Something that renders as an actual edge and node diagram… If we could render the
> 78 sinks, show the paths — that's going to be a really messy graph, but then offer
> some ability to filter by file, or show representative/max depth… I want to be
> able to see circles with connections showing the full series of links… especially
> if we color by file." (transcript 8–25)

> "Fan-in has the exact same problem… it's just an aggregate thing, and there's no
> meaningful way for me to interrogate or look at the totality of this. So both
> fan-out and fan-in need dedicated renderers." (transcript 37–40)

> "Once we have dedicated renderers, I don't think there's any utility in reporting
> these fan-out values [in the list]." (transcript 41–42)

This is round-4's **GRAPH-1**, now promoted from "speculative idea" to a headline
ask, and applied to *both* fan analyses.

### GRAPH-1 — A node/edge graph view of fan-out / fan-in connectivity **[MODEL/UX]** (large)
**Confirmed: no graph rendering exists anywhere** — zero `<svg>`/`<canvas>`/graph
libs in `src/`; the analyzer's `nodes`/`edges` (`core.mjs:3627-3673`) surface only
as integer counts in a summary table (`core.mjs:5222-5226`). All visual output is
HTML tables + gutter heat-dots. Today fan-out is:
- a **report** `renderFanOut` (`core.mjs:5254`) → table `Source | Sinks | Files |
  Example sink | Max depth` via `fanOutRows` (`core.mjs:7710`); frame 7.
- a **list entry + panel** `fanOutPanel` (`code-map.mjs:1081-1103`): "feeds 28
  sink(s) across 5 files · max depth 18", "Fans into 28 render output(s)…", a
  "Sinks in this file" jump list (`affectedSinkList`); frame 19. Score is synthetic
  (`Math.min(0.5, 0.12 + sinkCount*0.02)`, `code-map.mjs:1378`).
- fan-in is *only* a report `renderFanIn` (`core.mjs:5264`) — note it doesn't even
  compute a real fan-in grouping; it just maps each sink to
  `[mergeWidth, controlDependencyCount, maximumPathDepth]` (`core.mjs:5267-5272`);
  frame 25.

**Fix (design pass):** alongside the linear path table, render a real
**node/edge diagram** of the reachable connectivity for a selected source (fan-out)
or sink (fan-in): nodes = source/intermediate/sink, edges = transformation hops,
**colored by file**, with **filter-by-file** and a **max-depth / representative-depth
toggle** (the user explicitly asked for both, and noted the "example sink" shown
today isn't the max-depth one — transcript 21–22). This is large and net-new
(SVG/canvas, layout); scope as its own milestone. INTENT §7. **It also subsumes
the per-list fan-out values** the user wants to retire once the renderer exists —
but don't remove those until the renderer ships (they're the only fan-out surface
today).

### FANOUT-1 — Fan-out grouping is keyed by a *name string*, not a resolved symbol — likely wrong **[BUG/MODEL]**
> "This is open prop… I feel like it's searching across the repo for is-open… it's
> not like that is a single is-open value being fed down a whole chain… When we say
> `props.isOpen` fans out — is that this one prop right here? I guess maybe it
> could be." (transcript 30–35)

**The user's suspicion is correct.** Both fan-out aggregators key their map by
`info.label`, a **plain syntactic string** with no checker/symbol identity:
- `fanOutRows`: `let entry = map.get(info.label)` (`core.mjs:7714`)
- `fanOutEntriesForFile`: `let entry = map.get(info.label)` (`core.mjs:7751`)

For a property read, `info.label` is built purely from AST text —
`` `${expression.expression.text}.${expression.name.text}` `` (`core.mjs:3064-3066`)
— so **every `props.isOpen` anywhere in the repo collapses into one fan-out entry**,
regardless of which component's `props` it is. The "28 sinks" / "78 sinks" total is
a **repo-wide name-keyed count** (`core.mjs:7764, 7788`), even though it's shown on
one file's row. That's why the number feels untrustworthy (INTENT §6).
**Fix:** key the grouping by a resolved declaration/symbol identity (or at minimum
scope the label by its defining file/component and say so in the UI), or — if the
name-keyed roll-up is intentional — **state it explicitly** ("all `props.isOpen`
across the repo"). Either way the current silent name-merge reads as a bug. Verify
against the checker; this is in the analyzer, so tread carefully (skill guidance).

---

## 🎯 Big theme #3 — a "where used" / references view (the tool is now a code-overview tool)

> "If I'm looking at diff modal here, it would be really nice to be able to click on
> this and see who is using diff modal — like a 'where used' kind of thing. And
> that's probably true of both the declaration line and other places where it's
> called… It'd be very nice to switch over to a reference-type view, see all the
> references lit up, click, and then either jump to it or see information about that
> reference. At the moment we're very expression-oriented, which is good for
> refactoring. But this is becoming more of a general code-overview tool… since we
> have the full data-flow call graph, it'd be very helpful to expose that." (44–53)

This restates **INTENT §3** ("the unit is the expression… 'where used'/'jump to
definition' are primary verbs") and extends it from expressions to **components /
symbols**.

### XREF-1 — No symbol/component-level references index exists; add one **[ARCH/MODEL]** (large)
Today the only reference-like data is, in order of completeness:
- per-sink **origin** ("Defined :15 props") = the first `source`-kind step of *that
  sink's own* `representativeSteps` (`code-map.mjs:464-474`) — a jump to the value's
  origin, **not** a where-used index.
- **"Same code — N more"** groups other ranked sinks with an identical *expression
  string* (`byExpr`, `code-map.mjs:1158-1164, 267-283`) — text equality, not symbol
  references.
- **helper `callers` / `callerCount`** ("Distributaries (callers)",
  `code-map.mjs:930-937`) computed by `countCallers` (`core.mjs:2370-2401`) — but
  **only for reached helper functions**, capped at 8, and **JSX component usages and
  ordinary symbols are not indexed at all.**

So you cannot click `DiffModal` (a component) and get its use sites. **Fix:** build a
symbol/component reference index (definition + all references) and a "references"
mode that lights up uses on the code map and lets you jump/preview each (INTENT §2:
same-file references scroll/center, cross-file preview inline). Large and net-new;
scope as a milestone alongside or after GRAPH-1. The analyzer already walks the
graph, so the data is reachable — this is about indexing by symbol and exposing it.

---

## Detailed issues — ordering, linkability, and copy

### LEDGER-1 — Defensive ledger: order by verdict with **impossible first**, cap to the worst N **[MODEL/UX]**
> "It really needs to report the verdict with impossible first. Impossible verdicts
> are way more important than possible. And if we're only going to report five, we
> should report the worst five if they're present." (transcript 64–66)

`renderDefensiveLedger` (`core.mjs:5370`) has **no sort** — rows are `Map` insertion
order, then `.slice(0, args.maxItems)` (`core.mjs:5384-5385`). Verdict values are
`impossible | possible | unknown` (`core.mjs:4129-4134`). Frame 42 shows five rows
**all `possible`** — exactly the failure mode: the cap took the first-encountered
five, not the worst five. **Fix:** sort `[...byKey.values()]` by a verdict rank
(`impossible(0) < possible(1) < unknown(2)`, tie-break on count/burden desc)
**before** the `.slice` at `core.mjs:5385`. (Same as DEF-* lineage from prior
rounds, now with a concrete ordering ask.)

### LEDGER-2 — Inline preview: surface non-**KEEP** verdicts first; show what's worth inlining **[MODEL/UX]**
> "If all the verdicts are going to be 'keep', I'm not quite sure what we're gaining…
> If there's verdicts that are not keep, we should report those first… it should
> surface the ones that are actually worth inlining." (transcript 122–127)

`renderInlinePreview` (`core.mjs:5784`) does `report.helpers.slice(0, args.maxItems)`
with **no sort** (`core.mjs:5785`); the verdict (`KEEP | INLINE | KEEP & FORMALIZE |
KEEP (fix boundary)`) is computed per-helper by `inlineDecision` (`core.mjs:5814`).
Frame 75 shows five rows **all `KEEP`** — no signal. **Fix:** compute the verdict on
the full helper list, sort `INLINE` / non-`KEEP` first, *then* cap. If after sorting
everything is still `KEEP`, consider hiding the report or collapsing it to a one-line
"nothing worth inlining" (don't spend a whole report restating "keep" 5×).

### ORDER-1 — Reports aren't alphabetical **[UX]** (trivial)
> "Why aren't these reports alphabetical? That's kind of silly. I'll have to order
> them." (transcript 95)

The sidebar nav, the per-file nav, and the "Report assets · Markdown" list all
inherit the hand-curated `REPORT_VIEWS` array (`core.mjs:31-52`: findings,
repeated-forks, work-packets, dossier, fan-out, fan-in, …) — propagated via
`FILE_VIEWS` (`server.mjs:25`), `reportAssets()` (`server.mjs:328-338`, sidebar
`:356-363`), `reportLinks` (`server.mjs:441-449`), `fileNav` (`server.mjs:531-534`).
Frame 5 shows the non-alphabetical sidebar + Report-assets list. **Fix:** sort by
label in the *list renderers* (`reportAssets` and the `FILE_VIEWS` maps) — keep
`REPORT_VIEWS` itself ordered for the CLI `--view` help text (`core.mjs:595`). Open
Q: alphabetical, or grouped-then-alphabetical-within-group? (Open Q1.)

### LINK-1 — File names and `line N` references must be clickable everywhere **[UX/BUG]**
> "I come in here, I click through them at line 30. I see line 30, but I can't click
> on that, so I have to come over here and try and find it… we just need to make
> that thing discoverable on click." (transcript 107–111)
> "In general, in a place where we have a file name, we should just make it
> linkable. That way I don't have to go try and find it somewhere." (transcript 129–131)

`peekReferences` (`source-peek.mjs:86-110`) *does* linkify `path:line` tokens, and
report tables get it automatically (`server.mjs:127, 601`). But two gaps produce the
"line 30 isn't clickable" experience: (a) the `REF` regex (`source-peek.mjs:80`)
only matches `path.ext:digits` — bare prose like **"line 30"** (no path) is never a
link; (b) `peekReferences` **skips anything inside `<pre>…</pre>`** (`:87-91`), so
locations emitted inside fenced code blocks (junction tributaries `core.mjs:5769`,
inline-preview bodies) stay plain text. **Fix:** (a) always emit locations as
`path:line` (not "line N") so the existing linkifier catches them; (b) decide whether
to linkify inside fenced blocks too, or move those locations out of the fence; (c)
audit report tables to ensure the *file-name* column (not just `file:line`) is a
link. Trivial-to-small, high-trust (INTENT §6).

### OVERVIEW-1 — Make the overview "Files by burden" table filterable by type **[ARCH]**
> "We really just need a universal table that's reporting everything at once with
> maybe some filters… the same way that I can filter by findings, boundaries,
> sources, fan-out — it might be nice to be able to filter this main table to show
> specific types of things where it's then aggregating across these other items… we
> say this [file] has 10 findings, which is true, but then it also has all of this
> other stuff." (transcript 56–62)

The per-*file* list got the filterable treatment; the **overview** table did not.
`renderOverview` rows (`server.mjs:397-409`) show only `Findings | Worst | Path
depth | Dominant shape | Ownership | First cut`, built from `hotspotGroups(report,
"file")`; the only overview controls are search `q`, a 4-option `filter` select, and
a `sort` select (`server.mjs:487-503`). There is **no per-type (boundary/source/
fan-out) aggregation at the overview level** — those counts only exist per-file
inside `renderCodeMap`. **Fix:** aggregate the other entry types per file and show
them as columns/badges + a type filter on the overview, mirroring the per-file pills.
Medium–large (needs a per-file type roll-up at the overview layer). *Also a real
bug:* the `findings` value in the overview `filter` select (`server.mjs:489-494`) has
**no handler** in `overviewRows` (`server.mjs:304-309`) — it silently behaves like
"all". Fix that regardless (INTENT §6).

### SRCB-1 — Source-boundaries vs junctions: say what's unique or stop duplicating **[MODEL/COPY]**
> "It's not clear to me how this is different than junctions or the other boundary.
> To the extent this is just repeating the same info, we should stop doing that. If
> it's something new or unique, we need to indicate why it's new or unique."
> (transcript 115–118)

Source-boundaries (`core.mjs:5668`, frame 71: "symbol used 39 / 1 representative
sink"), junctions, and the boundary report all surface similar "this symbol reaches
N sinks" framing, and to the user they blur together. **Fix:** either differentiate
them in copy (a one-line "what makes a *source boundary* distinct from a *junction*")
or consolidate. Resolve DRILL-2 here too (expandable sink list). Decide whether
source-boundaries should remain a separate entry type or fold into boundaries
(Open Q2).

### RELAY-1 — Context relay is close; surface the in-scope context + colorize props **[UX]** (polish)
> "This one's actually pretty good… It might be nice if it called out that this
> `useCommitsTableContext` is part of it — if that was blue and highlighted, that'd
> be good… Maybe it'll help if the props were made colorful. Probably just a touch
> of better surfacing on that info would be worthwhile." (transcript 83–94)

`relayPanel`/`junctionPanel` already lists "Context hooks in scope:
useCommitsTableContext" and "All forwarded props — 3" (frame 55,
`code-map.mjs:1035`). The ask is purely visual: make the context-hook name a
highlighted/linked token and color the forwarded-prop list. Small, and the section
is already "pretty close to good." (Open Q3: which accent — and does the context
hook become a clickable jump to its definition?)

### COPY-1 — "Show, don't tell" what each aggregate report actually includes **[COPY/UX]**
> "Hotspots… I don't think that's useful. That's a count of findings — I don't know
> if it's filtering on the useful findings or not. I have all this uncertainty around
> what did it actually run. This is where we need to show not tell — just say, here
> is what this filter includes." (transcript 99–103)
> "We just have too many aggregate tables that are — it's not clear exactly what
> they're telling you." (transcript 128–129)

Hotspots (`hotspotGroups`, `core.mjs:5521`) and repair-map (an aggregation of other
views) read as opaque restatements. **Fix:** each aggregate report should lead with a
one-line, explicit "what's in this table" definition (what's counted, what's filtered
in/out), per INTENT §7. Cheap, high-trust, and partially overlaps the existing
report preambles — make them say the *selection criteria*, not just the column gloss.

### MD-1 — Markdown reports are losing their value as the UI surfaces more **[ARCH]** (theme, not a discrete fix)
> "This markdown file is not very useful… as I'm starting to surface more and more
> of this information in the actual UI, it's becoming clearer that a lot of this
> information is just not useful in its current format. So we either need to make the
> markdown more useful or just reveal this information where it is useful." (70–74)

A meta-observation, not a single ticket: as the unified list absorbs the reports
(ARCH-2), the standalone markdown views increasingly duplicate it less usefully.
This is the INTENT §1 endgame ("the standalone Reports section is a transitional
artifact"). No discrete fix beyond continuing to (a) fold report content into the
list/detail and (b) keep the markdown as an export/share artifact rather than the
primary surface. Captured as direction; flag for INTENT update (Open Q5).

---

## Suggested priority

| # | Item | Type | Effort |
|---|------|------|--------|
| ORDER-1 | Alphabetize the report lists | UX | trivial |
| LINK-1 | Clickable `file:line` everywhere (no bare "line N"; fenced gaps) | UX/BUG | small |
| OVERVIEW-1 (bug part) | Fix the no-op `findings` overview filter | BUG | trivial |
| LEDGER-1 | Defensive ledger: impossible-first, worst-N | MODEL/UX | small |
| LEDGER-2 | Inline preview: non-KEEP first / collapse if all keep | MODEL/UX | small |
| RELAY-1 | Highlight in-scope context hook + colorize relay props | UX | small |
| COPY-1 | "What this report includes" one-liners (hotspots/repair/etc.) | COPY/UX | small |
| DRILL-1 | Junction/boundary "N inbound sources" → expandable list | UX/MODEL | medium |
| DRILL-3 | Boundary detail: show *why* it's bad; gloss "tributary" | UX/COPY | medium |
| DRILL-2 | Source-boundaries "N sinks" → expandable + reconcile cap | MODEL/UX | medium |
| SRCB-1 | Differentiate source-boundaries vs junctions (or merge) | MODEL/COPY | small–med |
| FANOUT-1 | Fix/clarify fan-out name-keyed grouping (correctness) | BUG/MODEL | medium |
| OVERVIEW-1 | Overview table filterable/aggregated by type | ARCH | medium–large |
| GRAPH-1 | Node/edge graph view for fan-out **and** fan-in | MODEL/UX | large |
| XREF-1 | Symbol/component "where used" references index + view | ARCH/MODEL | large |
| MD-1 | Markdown reports → fold into list / demote to export | ARCH | (direction) |

**Suggested sequence:** clear the trivial trust-wins (**ORDER-1, LINK-1, the
OVERVIEW-1 filter bug**), then the verdict-ordering pair (**LEDGER-1/2**) and the
relay/copy polish (**RELAY-1, COPY-1**). Then tackle the meta-theme with one reusable
"count → reveal list" disclosure across **DRILL-1 → DRILL-3 → DRILL-2** (+ **SRCB-1**
rides along). **FANOUT-1** is a correctness fix worth doing before investing in the
fan-out graph. Then the two large milestones — **GRAPH-1** and **XREF-1** — each get
its own design pass. **OVERVIEW-1**'s aggregation slots in whenever the per-file
type roll-up is generalized.

---

## Open questions (worth your input before building)

1. **ORDER-1 sort.** Pure alphabetical by label, or grouped (findings/forks first,
   then alphabetical within groups)? The user just said "alphabetical," so the plan
   is plain A–Z unless you prefer grouping.
2. **SRCB-1 fate.** Keep `source-boundaries` as a distinct entry type with a
   "why it's different from a junction" note, or **fold it into boundaries**? They
   blur together for the user.
3. **RELAY-1 treatment.** Which accent for the in-scope context hook (blue link?),
   and should clicking it jump to the hook's definition (XREF-1 territory) or just
   highlight? Colorize all forwarded props, or only the "blamed" one?
4. **DRILL disclosure shape.** One shared "count → expandable list" component for
   junction sources / source-boundary sinks / fan-in roots — inline accordion under
   the number, or a detail-panel section? And the cap before "+N more" (8? 25?).
5. **FANOUT-1 intent.** Is the repo-wide name-keyed fan-out roll-up (`props.isOpen`
   merged across all components) **intentional** (and just needs to *say* so), or a
   bug to fix by resolving to a symbol/declaration identity? This changes whether
   it's a copy fix or an analyzer change.
6. **GRAPH-1 scope.** Confirm it's its own milestone (SVG/canvas, file-coloring,
   file filter, max-depth toggle) and that fan-out's per-list values stay until the
   renderer ships. Fan-out only, or fan-out + fan-in in the same pass?
7. **XREF-1 scope.** Confirm the symbol/component references index is a separate
   large milestone (vs. expression-only today), and whether the first slice is
   "components" (JSX usages) or "any symbol."
8. **OVERVIEW-1 columns.** Which per-type counts belong on the overview row
   (boundaries/sources/fan-out/relays?), and do you want them as extra columns, as
   a single "types present" chip cluster, or only as a filter?
9. **MD-1 / INTENT.** Should I add a round-5 distillation to `INTENT.md` — the
   "every count is drillable" principle (sharpens §7) and "references are
   first-class beyond expressions" (extends §3)?
