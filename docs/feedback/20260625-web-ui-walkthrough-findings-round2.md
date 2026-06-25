# tsx-dataflow web UI — walkthrough findings, round 2 (post-fixes)

Distilled from the 8:37 screen-recording voiceover in this folder
(`transcript/transcript.txt` + `transcript/transcript.srt`). This recording has
**real video** — all 52 frames in `frames/` are legible, so every claim below is
grounded in both the audio and a specific frame. Frame timing follows the SRT
(one frame per 10s).

This is a follow-up to `docs/feedback/20260625-web-ui-walkthrough-findings.md`
(round 1). The tone this round is markedly more positive — most of round 1's
fixes landed and the user said so repeatedly. The remaining work concentrates
around **two big themes** (report→findings consolidation, and an
expression-centric model) plus one real regression and a handful of polish items.

**Files in play** (unchanged from round 1):

| File | Role |
|------|------|
| `src/server.mjs` | Routes + overview page + file page assembly |
| `src/core.mjs` | The analyzer: ranking, burden, defenses, junctions, report views |
| `src/html/code-map.mjs` | Annotated code map + finding detail panel + path overlay |
| `src/html/page.mjs` | HTML shell, CSS, client JS |
| `src/html/source-peek.mjs` | `path:line` previews + Open-file links |

Tags: **[ARCH]** structural · **[UX]** interaction/polish · **[BUG]** broken ·
**[MODEL]** analyzer/data-model · **[COPY]** wording.

---

## ✅ What landed well (round-1 fixes, verified on camera)

The user explicitly confirmed these — worth recording so we don't regress them:

- **Click into a finding and back to overview** (transcript 1) — N2 breadcrumb. ✓
- **Sidebar title is a link on the overview *and* the file page** (transcript 2)
  — O5/N1. ✓
- **File page "much better"; findings + file columns; click scrolls** (transcript
  5–6) — F1/F3/F8. ✓ (frame 15)
- **Path section expanded by default; line + file on each step** (transcript 7) —
  F12-min. ✓ (frame 15: "Path — 12 steps", open)
- **Path overlay ("blue marks") shows the trajectory on the source** (transcript
  14–15, 21) — F9. ✓ (frame 15: gutter marks on path lines, sink tagged)
- **Cross-file jump + the "little flash"** (transcript 16) — F7 + flash. ✓
  (frame 15: `Search.ts:116 ↗`)
- **Burden breakdown is no longer full width** (transcript 25) — F5. ✓ (frame 42)
- **Per-step navigation + same-file scroll** (transcript 16, 19–20, 24) — F7. ✓

> "Overall this is feeling much better… this is actually making a ton of sense in
> terms of the flow." (transcript 20–21)

---

## 🎯 Big theme #1 — roll **every report** up into the findings list

This is now the single dominant request of the session (transcript 11–13, 35–38,
47–50). Round 1 identified it (N4/F12-full/F13); this round the user made the
target concrete and returned to it three separate times.

> "We still have this giant list of reports down at the bottom… the goal has got
> to be, by some scheme or another, all of these reports need to be reported up
> here… get everything that is in a report to be in this all-finding list… a nice
> clean list and see them all." (transcript 35–38)

> "It would be really nice if I could see that repeated fork listed as a finding
> over here on the right, and then I click in and I basically get all of the info
> associated with that fork rendered into this finding view… I've got this
> hard-coded single view of findings… I'd like a dedicated view for all of these,
> so I can make sense of every type of code smell with this code map."
> (transcript 48–50)

**Current state.** The file page still renders ~19 report views as a stack of
collapsed `<details>` below the code map (`FILE_VIEWS` in `server.mjs:24`, emitted
in `renderFilePage`). Frame 48 shows the full stack on `prose-markdown.tsx`:
Findings, Repeated forks, Work packets, Fan-out, Fan-in, Path gallery, Path
census, Path families, Transformation ledger, Defensive ledger, Prop relay,
Context relay, Repair map, Boundary report, Unknown edges, Source boundaries,
Junctions, Inline preview, Hotspots. The right-hand panel (`code-map.mjs`
`renderCodeMap`) only knows about ranked **sinks** (`report.rankings.all`).

### ARCH-1 — Unified, typed entry list in the right panel **[ARCH]**
Make the right panel's list the home for **every** analysis item, not just
sinks. Each report view (repeated-fork, junction, boundary, fan-out, transform,
defense, …) contributes entries that:
1. appear in the findings list with a **type badge** (e.g. `fork`, `junction`,
   `boundary`) and the existing burden/line affordances;
2. when selected, render that item's full detail into the same detail panel and
   drive the same code-map overlay (the fork's branch sites, the junction's
   tributaries/distributaries, etc.);
3. are **filterable by type** so the list can be "all" or narrowed to one smell.

When this works, the bottom `<details>` stack disappears (or becomes the raw data
source). This is a real redesign: it needs (a) a normalized "panel item" shape
the analyzer can emit per report type, and (b) a generalized detail renderer in
`code-map.mjs` that isn't hard-coded to sink fields. **Suggested first slice:**
do it for **repeated-forks** end-to-end (the user's worked example) — list entry
+ detail + overlay — then template the rest.

---

## 🎯 Big theme #2 — expressions as first-class, not "findings that involve X"

The second-most-repeated idea (transcript 17–20, 26–30), and a direct echo of
round-1 J2. The 31-render-outputs reach list is the trigger.

> "If I'm trying to trace `props.step`… really what I want is, clicking should get
> me to it… I want to click on `props.step` and see a 'where used' or something.
> It's not helpful to be on this finding that involves step… we're joining
> together things that are related. The fact that `props.step` is used is useful —
> maybe I click and go see `props.step`. But I don't need to see all 31 of these
> just because they're related to this same variable." (transcript 26–30)

**Current state.** A finding is keyed to a sink expression (e.g.
`expanded && hasExtra`, frame 30). Its "Flows into 31 render outputs" section
(`reachSection`, `code-map.mjs`) lists all 31 sinks the underlying source feeds —
correct, but overwhelming when the user only wants to trace one variable.

### MODEL-1 — Clickable expressions with "where used" / "jump to definition" **[ARCH/MODEL]**
Let the user click a *symbol* (`props.step`, `props.search`, `getAskedBy`) and get
a symbol-scoped view: where it's defined, where it's used, what flows through it —
instead of (or alongside) a sink-finding that happens to involve it. This is the
same data the reach/path machinery already computes, re-pivoted around the symbol.
Touches the analyzer output shape (`core.mjs`) and the panel renderer
(`code-map.mjs`). Large; shares infrastructure with ARCH-1.

### MODEL-2 — Don't dump all 31 reached sinks by default **[UX]**
Even before the full re-pivot: collapse the reach list to a count + top few, with
"where used" as the expansion, rather than 31 rows inline (frame 30).

---

## 🐛 Regression / correctness

### BUG-1 — "Worst" column sorts by **total** burden, not worst **[BUG]**
> "I'm confused by this sort order. When I sort by worst, they're clearly not
> sorted. If I sort by findings, that one seems correct. File name seems
> believable. Path depth works. But worst is definitely not sorted by that."
> (transcript 3–4)

Confirmed in code. The overview "Worst" column displays `group.worst` — the file's
**maximum** burden (`server.mjs:398`, `g.worst.toFixed(2)`). But the header sorts
via the `burden` key (`sortHeader("burden", "Worst")`, `server.mjs:506`), whose
comparator orders by **sum** of burden first:
`right.sumBurden - left.sumBurden || right.worst - left.worst` (`server.mjs:319`).
So clicking "Worst" sorts by total file burden while the eye reads the per-file
max → it looks unsorted. (`group.worst`/`group.sumBurden` defined in
`core.mjs:5510,5521`.)
**Fix options:** (a) sort the column by `g.worst` so the visible values are
ordered (simplest, matches the label); or (b) keep the total-burden ranking but
add a separate "Total burden" column and label it. Recommend (a). This is a
correctness bug in a just-shipped feature — high priority, low effort.

---

## `.ts` waypoints, inline code, annotations, defenses, thresholds

### TS-1 — Cross-file hops dead-end in untraced `.ts` files **[ARCH/MODEL]**
> "Here we hop into a `.ts` file, which are just not being traced or generated…
> we come to this file and we see nothing. But my guess is, if I'm in this file, I
> do have… junctions referencing here… `getAskedBy` is the junction… so this gets
> back to the original idea that there's a whole bunch of info down in this report
> that's not strictly a sink but is something along the way." (transcript 8–13)

Frame 9 proves it: navigating to `Search.ts` (a cross-file `↗` hop) shows
**"0 ranked finding(s)"** and an empty code map — because the tool ranks only TSX
render **sinks** — yet the **Junctions** report on that same page lists
`getAskedBy ( …/Search.ts:114 ) — 3 lineages → User | undefined`. The information
exists; it's just not surfaced where the user landed.
**Fix:** when a file has no sinks but *is* referenced by junction/boundary/etc.
analysis, populate its findings list from those (a direct payoff of ARCH-1).
Open question on whether to also fully trace `.ts` helpers — see Open Questions.

### INLINE-1 — Show the jumped-to code inline, don't lose the code map **[UX]**
> "What would be really nice is if that code snippet just showed up somewhere on
> here… I don't want to lose all this code-map stuff on the left just to go see
> what this thing is. This might be a case where the code overlay was actually
> pretty good." (transcript 17–20)

When a path step jumps cross-file — especially into an untraced `.ts` where there
are "no reliable markers" (transcript 20) — the user wants the target code to
appear **inline** (a panel/overlay) rather than navigating away. This revisits the
round-1 "expand overlay" idea (old F7) the user keeps gravitating toward. The peek
popover (`source-peek.mjs`) is the seed; the ask is a larger, pinned inline view
of the target snippet alongside the current code map. Code: `code-map.mjs`
path-step rendering + a new inline reveal in `page.mjs`.

### ANNO-1 — Number the path steps on the code map **[UX]**
> "If there's some way to get this like number 1,2,3,4,5,6,7 annotated on here — a
> little overlay that says 'this is item number seven' — that may be a good way to
> link these things… and then I could click the number and it would jump to that
> line." (transcript 22–23)

The path overlay (F9) currently tints the path lines and tags the sink, but
doesn't show each step's **ordinal**. Add a small step-number badge in the gutter
of each path-active line, mirroring the "#" column already in the path table
(`pathSection`, `code-map.mjs`), and make it click-to-scroll (reuse the
`goto-line` handler in `page.mjs`). Closes the loop between the path table and the
source overlay.

### DEF-1 — Defenses: prefer an inline icon over a separate section **[UX]**
> "This defenses is helpful — being able to see that it's in the path and links
> with this fallback. But I'm not sure we need them called out specifically like
> that; it might be good enough to throw in a little icon that says 'hey this is a
> defensive thing'." (transcript 31–32)

The dedicated "Defenses — N" list (`findingPanel`, `code-map.mjs`) is useful but
heavy. Consider marking defensive spots with a small inline icon on the path
row/source line, with details on hover/click, instead of (or in addition to) the
standalone list.

### DEF-2 — Two fallbacks, only one flagged defensive — why? **[BUG/MODEL]**
> "352 is defensive as well — it's a fallback. It'd be nice to see both called out
> as defensive. It's not actually clear to me why only one of those is considered
> defensive." (transcript 33–34)

Frame 30 shows "Defenses — 1" (`props.step.getTask()?.failureMessage — possible
@ :351`) while the path also has a `FALLBACK` step at `:352` that the user reads
as equally defensive. Either the analyzer's defense classifier
(`core.mjs`) is missing the second site, or the two are genuinely different and
the UI doesn't explain why. Needs an analyzer investigation — see Open Questions.

### THRESH-1 — Trivial expressions shouldn't be "findings" **[UX/MODEL]**
> "Seeing every expression with these super-low burdens is just not helpful…
> 0.05 based on what? The fact that it's a single variable being used… there's
> some threshold missing. Calling this a finding is not helpful — it's not a
> finding, it's just proof that it's being used; the simplest usage possible…
> This should not appear as a finding. It should appear as a clickable expression
> that lets me jump to where it's defined. There's nothing wrong with that code."
> (transcript 39–43)

Frame 42 is the exhibit: finding `RPF-540-38`, expression `props.search`, **burden
0.054**, whose entire path is 2 steps (SOURCE `props` → READ `search`) and whose
breakdown is "path depth · 100%". It's flagged as a finding purely for being used.
**Fix:** a burden/complexity **threshold** below which an expression is not ranked
as a finding (`core.mjs` ranking). Sub-threshold expressions still belong in the
unified list (ARCH-1) as **browsable usages** ("clickable expression → jump to
definition", MODEL-1), just not as "findings." This is the cleanest place where
themes ARCH-1 + MODEL-1 + THRESH-1 converge: findings = real smells; everything
else = navigable usages.

---

## Suggested priority

| # | Item | Type | Effort |
|---|------|------|--------|
| BUG-1 | "Worst" column sorts by total burden | BUG | trivial |
| MODEL-2 | Collapse the 31-sink reach list by default | UX | small |
| ANNO-1 | Number path steps on the code-map overlay | UX | small–med |
| DEF-2 | Investigate why only one fallback is "defensive" | BUG/MODEL | small–med |
| DEF-1 | Defenses as inline icon | UX | medium |
| THRESH-1 | Burden threshold; demote trivial usages | UX/MODEL | medium |
| INLINE-1 | Inline cross-file code reveal (don't lose the map) | UX | medium |
| TS-1 | Surface junction/boundary info on sink-less `.ts` files | ARCH | medium (rides ARCH-1) |
| MODEL-1 | Expression-centric "where used" / jump-to-def | ARCH/MODEL | large |
| ARCH-1 | Unify all report types into the findings list | ARCH | large |

A sensible sequence: ship **BUG-1** immediately; do **ARCH-1** as the backbone
(starting with repeated-forks), because **TS-1, THRESH-1, MODEL-1, MODEL-2** all
become natural consequences of a unified, typed, threshold-aware entry list.

---

## Open questions (worth your input before building)

1. **ARCH-1 scheme.** How should unified entries be organized — a single flat
   "all findings" list with type badges + a type filter, or grouped sections per
   smell within the one panel? The user said "a nice clean list" *and* "a
   dedicated view for all of these" — those pull slightly differently. Which wins?
2. **THRESH-1 cutoff.** What burden (or path-depth/step-count) threshold separates
   a real finding from a trivial usage? And below it — hide entirely, or show in a
   separate "usages" group that's collapsed by default?
3. **TS-1 scope.** For `.ts` waypoints: just surface the junction/boundary info
   that already exists (cheap, rides ARCH-1), or actually extend tracing into
   `.ts` helpers (much bigger)? The user leaned toward "get these to show up in
   the analysis" — likely the former is enough.
4. **DEF-2.** Confirm the file/lines: frame 30 is `search-view.tsx` finding
   `RPF-385-13`, defense at `:351`, with a `FALLBACK` path step at `:352`. Are
   `:351` and `:352` genuinely different defense kinds, or is `:352` a missed
   classification? This determines whether DEF-2 is a UI explanation or an
   analyzer fix.
5. **INLINE-1 vs navigation.** Should the inline code reveal *replace* the
   cross-file navigation, or supplement it (peek inline, click again to navigate)?
   The user wants to "not lose the code map" but also navigated happily several
   times — so likely supplement, not replace.
6. **MODEL-1 surface.** When clicking a symbol like `props.step`, is the desired
   result an in-panel "where used" list, or a dedicated symbol page
   (`/symbol?name=…`)? Affects how much of ARCH-1 it shares.
