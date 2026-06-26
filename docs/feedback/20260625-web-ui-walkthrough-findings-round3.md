# tsx-dataflow web UI — walkthrough findings, round 3 (post-fixes)

Distilled from the **12:18** screen-recording voiceover in
`~/Desktop/tsx-dataflow-rnd3-context` (`transcript/transcript.txt` +
`transcript/transcript.srt`). This recording has **real, legible video** — all 74
frames in `frames/` are ~300–410 KB and readable, so every claim below is grounded
in both the audio and a specific frame. Frame timing follows the SRT (one frame
per 10 s: the comment at time `t` ≈ `frame_{floor(t/10)+1}`).

This is the third round, following
`docs/feedback/20260625-web-ui-walkthrough-findings.md` (round 1) and
`...-round2.md` (round 2). **The tone is the most positive yet** — the user opens
with "reviewing after the most recent changes" and repeatedly says things "feel
pretty good," "much better than before," and "starting to feel a lot more
coherent." Most of round 2's items landed and were confirmed on camera.

The remaining work clusters into **one dominant new theme** (number &
range-collapse the steps / fork sites), **two continuing themes** (finish the
report→findings consolidation; surface "layers" navigation), and a tail of polish.

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

## ✅ What landed well (round-2 fixes, verified on camera)

The user explicitly confirmed these — recording them guards against regression:

- **BUG-1 — "Worst" column now sorts by worst.** "Worst seems to actually start
  by the worst things, that's good — that was a previous annoyance." (transcript
  1–3) ✓
- **THRESH-1 / finding-vs-usage split.** "We're differentiating between a finding
  and a usage where we're just saying that this is being used — that must be based
  off of that threshold." (transcript 4–6) ✓ — the per-file panel now has
  `All 32 | findings 25 | forks 1 | usages 6` tabs (frame 37).
- **ARCH-1 first slice — unified, typed, filterable list.** Findings, repeated
  forks, and usages now appear in one right-panel list with type badges; "I like
  that I can filter by forks, I can see the fork." (transcript 76) ✓ (frames 34,
  37: `FINDING` / `FORK` / `USAGE` badges; frame 48: a `FORK-88-20` detail panel
  with "Fork sites — 11" and "Findings a split would fix — 24").
- **MODEL-2 — reach list collapsed.** The 31-sink dump is now a one-line "Flows
  into 27 render outputs" count. ✓ (frame 54).
- **ANNO-1 — numbered path-step gutter markers.** The source overlay now shows the
  ordinal step number in the gutter and lets you scan the full chain: "now I can
  just scan up through here and I can see this full chain… it's nice to see this
  full chain here." (transcript 100–104) ✓ (frame 15: 16-step finding).
- **Defenses called out.** "Those are defensive — that feels pretty good, I like
  that those are called out like that." (transcript 43–44) ✓ (frame 26: `FALLBACK`
  step tinted green).
- **Repeated-fork-as-finding.** "That's actually kind of nice that the repeated
  fork shows up up here, I'm taking that." (transcript 53–54) ✓

> "Okay, I'm liking this so far… this is starting to feel a lot more coherent."
> (transcript 75, 98)

---

## 🎯 Big theme #1 (new, dominant) — number the sites and **collapse consecutive steps into ranges**

This is the single most-repeated new ask of the session — the user returns to it
**four separate times**, for path steps, for the repeated-step block, for the
`props.metadata.relationship` chain, and for fork sites.

> "What's probably missing here is just the repeated steps being in here — maybe
> you could say like **9 through 12**, that might work. Or render all the dots side
> by side… if there's like six of them it'd be super messy." (transcript 32–35)

> "Maybe if it said **one through three** that would be pretty good, because all of
> these are basically the same thing… combining those into just a row here:
> `props.metadata.relationship`, and just indicate this is operations one through
> three rather than calling them out as distinct things." (transcript 69–74)

> "It's just the same thing where I can't see two — so it'd be really nice if
> **one through two** was put right there." (transcript 84–85)

> "I'd really like these fork sites to be labeled same as the way the path was
> before — you know, **one two three four eleven** — and then go number them out
> there. I think that would help finding the split." (transcript 79–81)

This is a direct echo of INTENT §7 ("numbered steps… keep me oriented") and §4
(summarize, don't dump). The path table already numbers steps, but it renders one
row per step with no consolidation, and the fork-site list isn't numbered at all.

### STEP-1 — Collapse consecutive equivalent path steps into a range row **[UX]**
The path table (`pathSection`, `code-map.mjs:98-118`) does a flat
`steps.map((step, index) => <tr>… <td class="step-no">${index+1}</td> …)` — one
`<tr>` per step, no grouping (confirmed: no run-length logic anywhere). Frames 15
(16 steps) and 26 (15 steps, with three consecutive `COMPUTE @ :134` rows) are the
exhibits — long runs of near-identical hops on the same line/expression.
**Fix:** group runs of adjacent steps that share a line (or expression) into a
single row labeled "operations N through M", showing the shared expression once.
Keep the gutter overlay consistent: the markers are driven by
`pathStepsAttr()` (`code-map.mjs:124-134`) → `data-path-steps="line:ordinal"`
consumed in `page.mjs:391-404`, so a collapsed range still needs one ordinal per
source line. Apply the same treatment to the "Representation-only hops" list
(`representationSection`, `code-map.mjs:137-150`), which is the worst offender
(frame 15: 14 mostly-identical `ALIAS` rows).

### FORK-1 — Number the fork sites like path steps **[UX]**
The repeated-fork panel renders each site as
`<li><a class="goto-line">:${line}</a> <span class="k">KIND</span> <code>expr</code></li>`
in a plain `<ul class="why">` (`code-map.mjs:626-633`, heading `:669`) — **no
ordinal**. Frame 48 shows "Fork sites — 11" as an unnumbered list of
`:88 SWITCH-MATCH t().type === "paragraph"` rows. **Fix:** add a `1,2,3…` ordinal
column mirroring the path table's `.step-no`, and (stretch) reflect those ordinals
in the source gutter the way path steps already do. Same applies to the sibling
"Branch-exclusive computations" and "Findings a split would fix" lists
(`code-map.mjs:634-651`).

---

## 🎯 Big theme #2 (continuing) — finish the consolidation, and add a "layers" jump-nav

Round 2's ARCH-1 is half-done: findings, usages, forks, and **some** junctions are
unified, but the user caught a concrete gap and re-stated the end goal.

> "I still see node position is considered a junction up at 175 — if I go to 175 I
> don't see it listed at all. So we're still not actually bringing all of these
> items from below up into the finding list — that seems to be the biggest gap
> here." (transcript 48–51)

> "There's a whole lot of information down below — it'd be nice to make it trivial
> to jump into that info up here… maybe show the **layers across the top**: here's
> the declaration layer, this layer, this layer, here's the findings, you can go
> click through." (transcript 93–98)

### ARCH-2 — Promote the rest of the report items (junctions reliably, then boundaries…) **[ARCH]**
The unified list is built in `renderCodeMap` (`code-map.mjs:805-870`) from exactly
three sources: findings/usages (`:806-833`), forks (`:834-851`), and junctions
(`:852-870`). **Junctions are gated by a strict threshold** —
`inSources >= 3 && callerCount >= 2` (`code-map.mjs:800-802`) — while the bottom
**Junctions report** uses a broader definition. That mismatch is exactly why
"node position" shows in the report but **not** the list. **Boundaries are never
promoted at all**: `"boundary"` exists in `ENTRY_TYPES` (`:591`), the badge switch
(`:696`), and the filter allow-list (`:891`), but **no loop ever pushes a boundary
entry**, so its chip never renders.
**Fix:** (a) reconcile the panel's junction threshold with the report's so every
reported junction is promotable (or surface sub-threshold ones as a demoted
"usage"-style tier per INTENT §4); (b) add the boundary push loop to light up the
already-built scaffolding; (c) template the remaining report types (fan-out,
fan-in, path census/families, transformation/defensive ledger, prop/context relay,
repair map) into the same list. This is the backbone INTENT §1 keeps pointing at.

### LAYERS-1 — A "layers" jump-nav across the top of the file page **[UX/ARCH]**
The left sidebar already lists the report views ("On this page": Findings,
Repeated forks, Work packets, Fan-out, …, frames 10/15/26), but the user wants a
horizontal **layer strip** at the top of the workspace to jump between
declaration/usage/finding layers while scrolling, rather than hunting the
bottom-of-page report stack. This is a navigation affordance over the same
consolidated data as ARCH-2 — best built once that data is unified. Code:
file-page assembly in `server.mjs` (`renderFilePage`) + a sticky strip in
`page.mjs`.

### FAM-1 — Show path families (with examples) up top, not just in the bottom report **[UX]**
> "It would be really nice to see these like path families actually shown
> somewhere — get a feel, or see some examples." (transcript 91–93)

Path families currently live only in the "Path families" report view below the
code map. Surface a compact representative-example view in the workspace (rides
ARCH-2 / LAYERS-1).

---

## Polish, correctness & copy

### SORT-1 — Offer a sort toggle on the per-file list (default: by score) **[UX]**
> "I don't like how all of these are sorted — I would expect the finding list…
> maybe we just need to offer a sort toggle here, like sort by line number…
> findings should probably **start by rating**, give that an option to sort by the
> actual score, or the type — because it would be better to come in here and see
> the worst ones." (transcript 55–60)

The list is sorted **type-order first, then line ascending**
(`code-map.mjs:872-876`: `ENTRY_TYPES[a.type].order - …order || a.sortLine -
b.sortLine`). There is **no score-based sort and no UI toggle** — in a
findings-dominated file it reads as "just line number." **Fix:** add a styled sort
control (segmented, not a native `<select>` — INTENT §8) offering **score/rating
(default), type, line**, with the choice encoded in the URL query param so a
refresh restores it (INTENT §5). The burden value is already on each row
(`entry.row.metric`) so score-sort is cheap.

### MONO-1 — Source-code lines render in a proportional font, not monospace **[BUG/UX]**
> "This text should really be monospace since it's code — it's kind of gross that
> it's not monospace." (transcript 89–91)

Confirmed: `.codemap table.code` / `td.code` set **no `font-family`**
(`page.mjs:118-119`) and the source text isn't wrapped in `<code>`/`<pre>`, so it
inherits the body **sans-serif** (`page.mjs:27`); the global monospace rule
(`page.mjs:31`) never reaches it. (The Path-table Expression cell *is* monospace —
it's wrapped in `<code>` — so this is specifically the left code-map source
lines.) **Fix:** add `font-family: ui-monospace, …` to `.codemap table.code` (or
class the cells `.mono`). Trivial, high-trust win (INTENT §6/§8).

### COMMENT-1 — Subdue comments in the rendered source **[UX]**
> "Just the thinnest of code highlighting would be really nice — if these comments
> were made a little more subtle… we don't need a full syntax highlighter yet, but
> showing comments as subdued would really help parse this." (transcript 85–89)

There is **no tokenization or comment detection today**: `renderCodeLine`
(`code-map.mjs:532-574`) only segments by burden-finding ranges, otherwise emits
raw `escapeHtml(text)`. **Fix (deliberately minimal):** detect `//…` and `/* … */`
spans in `renderCodeLine` and wrap them in a dimmed-color span — comments only, no
keyword/string highlighting. Frames 26 (lines 158–161 comments) and 48 are good
test cases.

### DEF-3 — Defenses row: one line + icon column; drop the heavy green background **[UX]**
Two round-2 echoes the user repeated:
> "I don't like that this goes onto a second line — figure out how to make it show
> up as one line. I want this table to be as compact as possible — maybe just
> rendering the icon in an additional column would be enough." (transcript 40–43)

> "I'm not sure we need the green background — that feels like a little bit too
> much, since green's being used elsewhere for burden kind of stuff." (transcript
> 44–46)

- **Wrapping:** the Defenses list reuses the plain bulleted `ul.why`
  (`code-map.mjs:351-362`, `:432`; CSS `page.mjs:210`) — expression + verdict +
  type + `@loc` concatenated inline, so it wraps. Give it a `display:flex;
  flex-wrap:nowrap` row with the shield in its own column.
- **Green background:** the green tint is the **path-table** rule
  `tr.defensive-step td { background: hsl(140 …) }` (`page.mjs:321`, hue 140),
  which collides with the low-burden / quick-win green (`--quick #2e7d32`,
  `page.mjs:10`/`19-20`). Frame 26 shows it. **Fix:** replace the green row
  background with a subtle left-border or a small inline 🛡 marker instead of a
  fill (revisits round-2 DEF-1).
- **Tooltip delay (minor):** the shield is a **native `title`** attribute
  (`code-map.mjs:105`), so the ~0.5–1 s hover delay is the browser default and
  isn't tunable without a custom tooltip. "I hover — it gives me anything? Okay,
  over long enough I see that." (transcript 38–39) Note, low priority.

### OVERFLOW-1 — Path table scrolls sideways while the panel leaves whitespace **[UX]**
> "Not a huge fan of having this overflow here while still having all this white
> space… reconcile these widths. Realistically this path thing should just not
> overflow — it should always show its full height so we can see the whole thing.
> Code, less is more. But horizontal overflow with white space is no good. Maybe
> the table does a bleed/overflow — but if so, the *code* is the thing bleeding, we
> don't want this thing on the right to bleed as well." (transcript 11–21)

Confirmed in CSS. The right detail panel is capped at **620 px**
(`.codemap { grid-template-columns: minmax(0,820px) minmax(360px,620px) }`,
`page.mjs:116`) — that cap is the source of the empty whitespace on wide viewports.
Inside it, `td.path-loc { white-space: nowrap }` (`page.mjs:241`) forces the
Location column wide and overrides its own `overflow-wrap:anywhere` (`:242`), while
`.path-scroll { max-height:360px; overflow:auto }` (`page.mjs:244`) scrolls in
*both* axes and clips the height (frame 10: the `sink` tag is cut off at the right
edge). **Fix:** let the Location column wrap (drop the `nowrap`), remove/raise the
`max-height` so the path shows its full height (the user explicitly wants this),
and let the panel consume the available width before any horizontal scroll.

### LABEL-1 — Burden-metric naming churn (same metric, three names) **[COPY/MODEL]**
> "We're saying `label.href` is bad — why is it bad? Path depth, representation
> churn… so we're calling things different things." (transcript 60–61)

Confirmed: the canonical `BURDEN_TERMS` (`core.mjs:8401-8446`) is duplicated by two
hand-written label lists that drift:

| metric | `BURDEN_TERMS` (8401+) | Metrics table (4750+) | "Why selected" bullets (4908+) |
|---|---|---|---|
| `representationChurn` | **representation churn** | **representation changes** | **representation-only transformations** |
| `impossibleDefenseCount` | impossible defenses | impossible defenses | **type-impossible fallbacks** |
| `reachableSinks` | — | **downstream sink count** | **reachable sinks** |

**Fix:** have the Metrics table (`core.mjs:4749-4758`) and the Why-selected bullets
(`core.mjs:4908-4919`) read `term.label` from `BURDEN_TERMS` instead of
re-stringifying, so there is exactly one name per metric (INTENT §6).

### TITLE-1 — Finding row label wraps to two lines; give it a one-line alias **[UX]**
> "It really would be good to get this down to something that fits in one line —
> even just coming up with an alias… rather than having that drop to two lines."
> (transcript 62–64)

The row label is the raw expression with no shortening: `entry.primary =
sink.expression ?? sink.label` (`code-map.mjs:819`), rendered verbatim in
`.fr-expr` (`code-map.mjs:604-608`; CSS `page.mjs:265-268`). Frame 37 shows
`label().href textPath/href` wrapping. There is already a human-readable
`findingTitle(sink)` (`core.mjs:8504-8512`, e.g. "representation-heavy render
path") used **only** in the report markdown. **Fix:** either single-line-clamp
`.fr-expr` with ellipsis (the full text is already in the `title=`), or surface a
short alias; keep the full expression in the detail panel.

### MINOR — usages-in-findings unease, and a step-ordinal oddity **[UX/COPY]**
- "It still feels weird that we're calling that — it's like it's in the list of
  findings. I guess it's okay, certainly better than saying 'this is a finding.'"
  (transcript 6–8) Mostly resolved by the tabs/badges; a clearer list label
  ("Items" vs "Findings", or a usages divider) might fully settle it.
- "There's something a little weird about the ordering of these — how that's
  considered four but then seven is there… maybe it's okay if it's a ternary."
  (transcript 66–68) Possible step-ordinal gap around ternaries; worth a quick
  look but the user wasn't sure it's wrong.

### IDEAS — speculative analyzer flags the user floated **[MODEL]**
Low priority, captured so they aren't lost:
- **Plural/singular naming mismatch as its own flag.** "For each line gives a
  random width… that variable name's not very good — if you're gonna do it plural
  there, you may as well name it the same. That might be its own good flag."
  (transcript 105–109)
- **Repeated-variable → suggest extraction.** "Seeing this button is linked — the
  variable's being repeated, might be nice to extract that out." (transcript
  113–118) Possibly a fan-out / repeated-usage surfacing.

---

## Suggested priority

| # | Item | Type | Effort |
|---|------|------|--------|
| MONO-1 | Make source-code lines monospace | BUG/UX | trivial |
| LABEL-1 | One canonical name per burden metric | COPY | trivial |
| TITLE-1 | One-line (clamp/alias) finding row label | UX | trivial–small |
| SORT-1 | Sort toggle (score default / type / line), URL-encoded | UX | small |
| FORK-1 | Number the fork sites | UX | small |
| OVERFLOW-1 | Path table: wrap location, full height, use panel width | UX | small–med |
| DEF-3 | Defenses one-line + icon column; drop green fill | UX | small–med |
| COMMENT-1 | Subdue comments (comments-only, no full highlighter) | UX | medium |
| STEP-1 | Collapse consecutive equivalent steps into ranges | UX | medium |
| FAM-1 | Surface path families with examples up top | UX | medium (rides ARCH-2) |
| ARCH-2 | Promote remaining report items (junctions reliably, boundaries, …) | ARCH | large |
| LAYERS-1 | "Layers" jump-nav across the top | UX/ARCH | large (rides ARCH-2) |

Suggested sequence: clear the trivial trust-wins first (**MONO-1, LABEL-1,
TITLE-1**), then the dominant theme-1 pair (**FORK-1** then **STEP-1**), then the
list/layout polish (**SORT-1, OVERFLOW-1, DEF-3, COMMENT-1**), then resume the
consolidation backbone (**ARCH-2** → **LAYERS-1/FAM-1**).

---

## Open questions (worth your input before building)

1. **STEP-1 grouping key.** Collapse a run when consecutive steps share the *same
   line*, the *same expression*, or the *same kind*? The user's examples ("1
   through 3", "9 through 12") read as "same line / same expression." And: render
   the collapsed run as one row labeled "ops N–M", or as side-by-side dots (the
   user floated both, then worried dots get "super messy" past ~six)?
2. **ARCH-2 junction threshold.** Should the panel promote *every* reported
   junction (drop the strict `inSources>=3 && callerCount>=2`), or keep the
   threshold but show sub-threshold junctions as a demoted "usage"-style tier? The
   "node position" case argues for full parity with the report.
3. **ARCH-2 ordering.** After junctions/boundaries, which report types matter most
   to fold in next — fan-out/fan-in, path families, or the ledgers? Pick the next
   one or two rather than all at once.
4. **SORT-1 default.** Confirm the default sort is **by score (worst first)** —
   the user said findings "should probably start by rating." Keep type as a
   secondary toggle, or also a grouped view?
5. **DEF-3 green.** Replace the defensive green fill with (a) a left-border accent,
   (b) an inline 🛡 marker only, or (c) a different non-green tint? The constraint
   is "don't reuse burden-green."
6. **COMMENT-1 scope.** Comments-only dimming now, with full lightweight
   highlighting (strings/keywords) deferred — confirm that's the right line to
   hold ("we don't need a full syntax highlighter yet").
7. **LAYERS-1 shape.** Is the "layers across the top" a sticky strip of section
   anchors (jump to declaration/usage/finding layers), or a more structured
   layer-by-layer scrollable view? The transcript suggests the former as a first
   step.
