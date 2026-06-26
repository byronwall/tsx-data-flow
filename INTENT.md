# INTENT — product direction for the tsx-dataflow explorer

This document distills the **durable intents** behind two rounds of hands-on user
feedback (see `docs/feedback/20260625-web-ui-walkthrough-findings*.md`). The
feedback arrived as line-item issues; this is the layer underneath them — the
principles that should decide future design calls, especially when a specific
ticket is ambiguous. When in doubt, optimize for these.

The product is a static render-path data-flow analyzer for TS/TSX. The web UI's
job is to turn that analysis into something a developer can **explore and act on**.

---

## 1. One workspace: code on the left, an explorer on the right

The center of the product is a single screen — annotated **source on the left, a
detail/list explorer on the right** — and (almost) everything should happen
there. The user returned to this every session:

> "If things are working really well, this bottom report section just does not
> exist… left side is the code, right side is the finding explorer." (round 1)
> "All of these reports need to be reported up here… a nice clean list and see
> them all." (round 2)

**Implications**
- Every analysis type — findings, repeated forks, junctions, boundaries, plain
  usages, fan-in/out, … — is an entry in **one unified, typed, filterable list**,
  not a separate page or a stack of collapsed report blocks.
- Selecting any entry renders its full detail in the same panel **and** overlays
  it on the code map. The list ⇄ detail toggle is the core interaction.
- The standalone "Reports" section is a transitional artifact. Its long-term fate
  is to be *absorbed* into the unified list, not to live below the fold.
- _Status: findings, usages, forks, junctions, boundaries, fan-out, relays, and
  unknown edges are unified into the per-file list today. `source-boundaries` was
  retired (round 5) — its "a source feeds N sinks" signal is the fan-out entry, so
  a separate row only duplicated it. The standalone Reports section now also
  alphabetizes. Remaining tail: a network/graph view and a code-map "where used"
  overlay (both started as first slices, see §3/§7)._

## 2. Never make the user leave the code map

Context-switching away from the source is the cardinal sin. The user wants to
stay oriented on the code while pulling information toward them.

> "I don't want to lose all this code-map stuff on the left just to go see what
> this thing is. But I do want to see what this thing is." (round 2)

**Implications**
- Prefer **overlays, inline reveals, and scroll-to-line** over navigation.
  Cross-file hops should be previewable inline before (or instead of) a full page
  change. Same-file references scroll/center; they never open a popover that
  hides the code.
- The path/trajectory is drawn **on the source** (highlighted lines, the sink
  tagged, numbered steps), not just described in a side table.
- Any navigation that does happen must be reversible and must land you oriented
  (e.g. `#L<line>` deep-links, breadcrumbs, "back to list").

## 3. The unit of interest is the expression, not the "finding"

A "finding" is one fact *about* a piece of code. The user thinks in terms of the
code itself — a symbol, where it's defined, where it's used.

> "I want to click on `props.step` and see a 'where used'… it's not helpful to be
> on this finding that involves step." (round 2)

**Implications**
- Expressions/symbols should be **first-class and clickable**: click one to see
  its definition and its uses, with findings attached as facets — not the other
  way around.
- Multiple analyses can attach to the same expression; the data model should let
  them, rather than forcing one finding per fact.
- "Where used" / "jump to definition" are primary verbs, not buried features.
- Reference identity is by **symbol, not name**. `props.isOpen` in two components
  are different values; a renamed import is the same component. Any "where used" /
  fan-out / reference grouping resolves through the checker, never by matching
  text (a name-keyed fan-out roll-up was the round-5 correctness bug). When a
  grouping must stay name-based, say so in the UI rather than imply identity.
- _Status: usage entries lead with define + where-used; fan-out is now scoped to
  the owning component (`Component › props.x`); a symbol-accurate **component**
  reference index ("References" view) shipped as the first XREF slice. Full
  symbol-indexed "click any token" navigation and a code-map "lit up" overlay are
  the larger remaining pieces._

## 4. Earn the label "finding" — signal over noise

Not everything detected is a problem. Flooding the list with trivia destroys
trust and buries the real smells. One finding type must not crowd out the rest.

> "Calling this a finding is not helpful — it's just proof that it's being used,
> the simplest usage possible." (round 2)
> "A really strong emphasis on one type of finding, with the others being
> second- or third-class." (round 1)

**Implications**
- A **significance threshold** separates real findings from trivial usages.
  Sub-threshold items remain *browsable* (you can still trace them) but are
  **demoted**, not presented as problems.
- Don't dump exhaustive lists (e.g. "31 reached sinks") inline; summarize, cap,
  and let the user expand.
- Every smell type is first-class. Breadth (all the things) and ranking (the
  worst things) are both real needs — support both, don't pick one.

## 5. State lives in the URL; a refresh restores you

> "I always want the statefulness to be reflected in the query param — page
> refresh gets you back to where you were." (round 1)

**Implications**
- Selection, sort, filter, open view, scroll target — all encoded in the URL.
  Reload reproduces the exact screen. Deep links are shareable.

## 6. Be truthful and consistent

Small inconsistencies and lies read as bugs and erode confidence fast.

> "When I sort by worst, they're clearly not sorted." · "This is a link on one
> page but not the other — that's gross." (both rounds)

**Implications**
- A control labeled "Worst" sorts by worst. Indicators reflect actual state.
- The same affordance behaves the same everywhere (the title is always a home
  link; locations are always clickable; etc.).
- Defensive/derived classifications should be explainable — if two fallbacks look
  identical but only one is flagged, either flag both or show why.

## 7. Show, don't tell — and keep me oriented

> "Show, don't tell" was already the codebase's stated principle; the feedback
> doubled down on it.

**Implications**
- Render the actual code, path, and snippets — don't just name a `file:line`.
- Constantly answer "where am I, which file, which step?": numbered steps, the
  sink tagged, file basenames on hops, flashes on jump.
- **Every count is drillable.** A bare aggregate ("8 inbound sources", "28 sinks")
  is a "big scary number" until you can see what's inside it. Any count should be a
  disclosure that reveals its (capped, "+N more") members, each a clickable
  location — and it must reveal **without shifting the layout** (a floating
  popover, not an inline expansion). The count and the revealed list must agree
  (don't cap the data behind a larger count and imply you showed it all).
- Prefer a real picture over a table where the relationships are the point: a
  fan-out/connectivity diagram (nodes + edges, colored by file) shows spread a
  ranked table cannot. A first fan-out graph slice shipped (round 5).

## 8. It must look designed

> "These native input and select elements look terrible — we should basically
> never render a default native element." (round 1)

**Implications**
- No raw/unstyled browser widgets. Everything matches the design system, light
  and dark. Polish is part of trust.

---

## How to use this doc

- When a ticket conflicts with one of these, surface the conflict — the intent
  usually wins.
- When a ticket is underspecified, resolve it in the direction these point.
- New analysis types should arrive **as entries in the unified explorer** (§1),
  attached to expressions (§3), thresholded for significance (§4), and viewable
  without leaving the code map (§2). That is the default shape of any new feature
  here.
