# tsx-dataflow web UI — walkthrough findings, round 10 (extend network viewers, restore overflow pickers, and make inline-preview evidence visible)

Distilled from the **prompt transcript** supplied on 2026-07-01 plus three attached
legible screenshots. There was no context-package folder, SRT, audio, or cadenced
frame set in this round, so timestamps are not available; quotes below are from the
prompt transcript. The screenshots are usable and show:

- Inline preview markdown for `formatInstanceDate`, where the report names the
  helper and its call sites but does not show code samples.
- The Fan-out tab with the network diagram and markdown affordance restored.
- The file page for `client/apps/modeler/src/components/inspector/concept-context-panel/concept-context-panel.tsx`, showing the current repeated file-path hierarchy.

This is the **tenth** round, following r1-r9. It is a dictated follow-up after the
round-9 implementation pass: the user confirms several fixes landed, then asks for
the same interaction model to be applied consistently to the remaining relationship
reports and to the file-page shell.

**Files in play:**

| File                                      | Role                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/frontend/src/App.tsx`                | Active SPA frontend: shell, report tabs, file page, Fan-out/Boundary viewers                 |
| `src/server/network-viewers.mjs`          | Older modular network-viewer helpers; verify whether still used; delete if vestigial         |
| `src/html/code-map-graphs.mjs`            | Shared Fan-out and Boundary SVG graph primitives                                             |
| `src/reports/markdown-boundary-views.mjs` | Boundary, Junctions, and Inline preview markdown renderers                                   |
| `src/analysis/helper-report.mjs`          | Helper report data model: caller counting and helper metadata for inline-preview evidence    |
| `INTENT.md`                               | Durable product direction: relationship diagrams, drillable counts, code evidence, URL state |

Tags: **[ARCH]** structural · **[UX]** interaction/polish · **[BUG]** broken/inconsistent ·
**[MODEL]** analyzer/data-model · **[COPY]** wording.

---

## ✅ What landed well

- **Fan-out is back in the intended shape.** The user says, "The changes to fan out
  look really good. It's nice to see the markdown at the bottom. That's all working
  as expected." The active report page now computes a `fanOutHtml` branch
  (`src/frontend/src/App.tsx:694`) and renders any network view with a markdown mirror
  underneath (`src/frontend/src/App.tsx:702`, `src/frontend/src/App.tsx:725`). This
  directly satisfies round 9's graph + markdown pairing.
- **Boundary report now has the diagram.** The user says, "I can see on the boundary
  report that we've got the diagram now. That feels good. I like being able to click
  through and see everything." The active SPA computes `boundaryHtml`
  (`src/frontend/src/App.tsx:698`) and composes it into the same `networkHtml` branch
  as Fan-out (`src/frontend/src/App.tsx:702`).
- **The top-tab SPA shell is the active surface.** The screenshots show the report
  tabs and file tabs in the SPA, not the old server-rendered report page. That means
  the next work should land in `src/frontend/src/App.tsx` or a frontend-safe shared
  module, not only in `src/server/network-viewers.mjs`.

---

## 🎯 Big theme #1 — apply the Fan-out/Boundary relationship-view pattern to the remaining full-file network reports

> "Let's go ahead and extend that to the remaining full file network things. So I
> think we should do it on prop relay since it's got the idea of boundaries and
> wrapper steps. We should do it on the junction view as well, and we should do it
> on fan in also."

The user is now explicitly moving beyond Fan-out and Boundary. The shape is no
longer speculative: a report whose point is a network should show a selectable
network visualization first, then the markdown report beneath it. Fan-in, Junctions,
and Prop relay all satisfy that criterion: they are about sources, sinks, wrappers,
callers, and convergence rather than isolated rows.

This is `INTENT.md` §7 in its strongest form: "Prefer a real picture over a table
where the relationships are the point." It also repeats §5: the selected item and
sort/picker state should live in the URL, as Fan-out and Boundary already do.

## 🎯 Big theme #2 — the inline-preview markdown needs evidence, not just a verdict

> "What would help a lot more is if it gave a sample of the code that's being
> proposed to be inlined... I can't actually tell if it would be a good candidate,
> and I can't tell what the callers look like either."

The Inline preview report currently makes a recommendation, but the reader has to
open files manually to verify it. That undercuts the report's purpose: a markdown
artifact should be actionable by itself. For `INLINE` verdicts, the report should
show the helper body and representative call-site snippets so the recommendation can
be accepted, rejected, or queued for a codemod with eyes open.

This is `INTENT.md` §7 again: "Render the actual code, path, and snippets — don't
just name a `file:line`." The user is not asking for more prose; they are asking
for the evidence that justifies the prose.

## 🎯 Big theme #3 — restore capped pill lists with an overflow picker wherever this selector pattern appears

> "It's supposed to show substantially more items and then have like a drop down
> picker thing... Basically, any place where we're showing that list of pills, we
> should have a final one if there's more items, which says plus 12 more or whatever,
> and then it drops down and gives you a picker."

The current active Fan-out and Boundary viewers cap the visible tabs and silently
drop the rest from the selector surface. That violates `INTENT.md` §7's drillability
rule: a count or capped set should reveal the hidden members, not imply the visible
set is complete. The old server-side viewer code already has a popover-based version;
the next implementation should recover that behavior in the SPA.

## 🎯 Big theme #4 — reshape the file page hierarchy so the file identity appears once

> "We've got this kind of weird inverted hierarchy thing... a giant header with the
> file name. That should realistically be up in the page header somehow, and then
> the breadcrumb should be up there as well and we're basically repeating the file
> name like in three places and so we should stop doing that."

The file page currently puts the path in the sticky topbar context, the breadcrumb,
and a large `<h1>`. The screenshot makes the hierarchy feel upside-down: the report
tabs are the real mode switch, while the huge path title consumes the visual center.
The desired shape is simpler: topbar owns file identity and the Overview breadcrumb;
the page body starts with the selected report/code-map content.

---

## Detailed issues

### NETWORK-REMAINING-1 — Fan-in, Junctions, and Prop relay still need network viewers plus markdown mirrors **[ARCH/UX]**

> "We should do it on prop relay... the junction view as well, and... fan in also."

**Current behavior:** `REPORT_VIEWS` includes `fan-in`, `prop-relay`, `boundary-report`,
`junctions`, and `inline-preview` (`src/frontend/src/App.tsx:149-164`), but the active
network branch only computes Fan-out and Boundary (`src/frontend/src/App.tsx:694-702`).
Every other report falls through to markdown-only rendering.

**Frame:** the Fan-out and Boundary screenshots show the intended pattern: diagram
first, markdown underneath or reachable beside it.

**Decision:** ship Fan-in, Junctions, and Prop relay together in one implementation
pass. The already-landed Fan-out/Boundary shape is stable enough that the remaining
relationship viewers should be completed as a coherent set, not split into another
planning/template round.

**Suggested fix:** Add frontend-safe viewers in this order inside the single pass:

1. **Fan-in:** reverse the Fan-out mental model: many sources flowing into one sink
   or expression. Use a capped selector for the heaviest sinks and a `+N more`
   picker for the rest.
2. **Junctions:** reuse the two-sided Boundary diagram shape: inbound lineages on
   the left, junction/helper in the center, callers or redistributed consumers on
   the right.
3. **Prop relay:** show wrapper/boundary steps between incoming props and downstream
   consumers. This should make the "wrapper step" concept visible instead of leaving
   it buried in markdown text.

All three should render the markdown mirror beneath the rich viewer, following the
existing `networkHtml` + `.md-mirror` composition in `ReportPage`
(`src/frontend/src/App.tsx:702`, `src/frontend/src/App.tsx:725`).

### PICKER-1 — Active Fan-out selector caps at 8 items without the overflow picker **[BUG/UX]**

> "At the moment we just have these pills that can select one, but there was
> supposed to be like a drop-down that would show you all of them."

**Current behavior:** The active SPA Fan-out renderer lives locally in
`src/frontend/src/App.tsx:897`. It builds `tabs` from `entries.slice(0, 8)`
(`src/frontend/src/App.tsx:916`) and renders only those pills. If the active source is
outside the first 8, it can still be selected through the URL, but there is no visible
way to discover or choose it from the page.

**Existing code to recover:** `src/server/network-viewers.mjs:86` has a richer
`fanOutViewer`, and its overflow branch calls the shared `popover` helper
(`src/server/network-viewers.mjs:107`) to render the remaining sources. The SPA also
already has a popover-style `SelectLink` component (`src/frontend/src/App.tsx:594`),
so this can be implemented without introducing a new interaction style.

**Frame:** the Fan-out screenshot shows only the visible source pills (`id`,
`TokenView › props.token`, etc.) and no final `+N more` picker.

**Suggested fix:** In the active SPA renderer, split sorted entries into visible and
overflow sets. Render the first N as pills, then render a final pill/popover labeled
`+${rest.length} more` when overflow exists. The popover options should include the
same summary needed to choose intelligently, e.g. root label, sink count, max depth,
and file count. Selection remains URL-backed via `?fanout=`.

### PICKER-2 — Boundary selector has the same capped-list regression **[BUG/UX]**

> "It should also exist on the boundary report, also. Basically, any place where
> we're showing that list of pills..."

**Current behavior:** The active Boundary renderer lives in `src/frontend/src/App.tsx:957`.
It builds pills from `helpers.slice(0, 8)` (`src/frontend/src/App.tsx:975`) and does
not render a `+N more` picker. This is the same class of issue as Fan-out, just over
helper boundaries.

**Existing code to recover:** `src/server/network-viewers.mjs:157` has a modular
`boundaryViewer`, and its overflow branch calls `popover` at
`src/server/network-viewers.mjs:175`.

**Frame:** the Boundary screenshot confirms the diagram is present; the dictated
feedback says the missing picker is still lost in the shuffle.

**Suggested fix:** Apply the same selector helper used for Fan-out to Boundary. The
overflow option labels should include helper name, caller count, and verdict. Keep
selection in `?boundary=`.

### PICKER-3 — Viewer code is still split between active SPA renderers and older modular server renderers **[ARCH]**

> "That was existing before, so it should be a matter of just recovering that code."

**Current behavior:** The active UI uses local string renderers in
`src/frontend/src/App.tsx` (`renderFanOutViewer` at `src/frontend/src/App.tsx:897`,
`renderBoundaryViewer` at `src/frontend/src/App.tsx:957`). The older
`src/server/network-viewers.mjs` implementations are not the active `/report` path,
but they contain the richer picker behavior (`src/server/network-viewers.mjs:15`,
`src/server/network-viewers.mjs:86`, `src/server/network-viewers.mjs:157`).

**Decision:** first verify whether `src/server/network-viewers.mjs` is imported or
reachable on any active path. If it is vestigial, delete it after porting any still-
useful picker behavior. If it is still used, keep it and avoid churn. The goal is not
deletion for its own sake; the goal is to remove dead MJS-era viewer code if the SPA
has superseded it.

**Suggested fix:** Pick one active owner before adding Fan-in/Junctions/Prop relay.
Best short-term path: create a small frontend-safe viewer helper in or near
`src/frontend/src/App.tsx` that handles visible pills + overflow popover, then use it
for Fan-out, Boundary, and the new viewers. If `src/server/network-viewers.mjs` has no
remaining imports or route coverage, delete it as part of the cleanup. If it is still
used, leave it in place and only factor shared code when there is a real reuse path.

### INLINE-EVIDENCE-1 — Inline preview lacks the helper body and call-site snippets needed to judge an INLINE verdict **[MODEL/UX]**

> "We should just include the code samples, both the function that's being proposed
> as inlined and the call sites."

**Current behavior:** `renderInlinePreview` starts at
`src/reports/markdown-boundary-views.mjs:173`. For each helper it prints a fenced
summary with the depth/churn/defense delta and verdict, then lists consumers as
plain `file:line` bullets (`src/reports/markdown-boundary-views.mjs:222-233`). The
report does not include the helper implementation or caller snippets. The screenshot
of `formatInstanceDate` shows the exact result: the user sees `INLINE` and five call
sites, but not the code being proposed for inline expansion.

**Data-model constraint:** helper caller collection currently stores only file and
line for up to 8 callers (`src/analysis/helper-report.mjs:183-184`). It does not
store source text, call expression text, or a line-window snippet. The markdown
renderer therefore cannot satisfy this request with formatting alone.

**Suggested fix:** Add evidence fields to helper-report records, preferably without
inflating every report:

- Store a helper definition snippet: the full helper function body, capped at 10
  lines. This is the code proposed for inlining, so it deserves more context than a
  fixed ±2-line window.
- Store caller snippets for the first 5 call sites: the call line plus two lines
  before and after.
- Keep the existing full caller count, and print `+N more call sites without snippets`
  when applicable.

Render these snippets only for helpers whose inline-preview decision is `INLINE`.
That keeps KEEP/formalize sections compact and makes the extra tokens justify the
recommendation.

### INLINE-EVIDENCE-2 — The snippet policy should be small, bounded, and verdict-gated **[COPY/UX]**

> "Maybe if it's got a ton of call sites, we only show code snippets for the first
> five, and we show basically the line in question plus two lines before and after."

**Current behavior:** caller storage caps at 8 (`src/analysis/helper-report.mjs:183`),
while the user asked for snippets for the first 5. The current markdown prints every
stored caller line reference (`src/reports/markdown-boundary-views.mjs:229-233`),
which is cheap but not enough evidence.

**Suggested fix:** Use two caps with explicit copy:

- `CALLER_LOCATION_LIMIT = 8` can remain for terse call-site lists.
- `INLINE_HELPER_BODY_LINE_LIMIT = 10` should govern the helper body shown for the
  function being proposed for inlining.
- `INLINE_SNIPPET_LIMIT = 5` should govern expanded code snippets.
- Caller snippets should use the call line plus two lines before and after.

In markdown, use headings like `Helper body` and `Call-site samples`. Avoid implying
all callers have snippets when only the first 5 do. For non-INLINE verdicts, keep the
current compact consumer list unless a later round asks for evidence on KEEP cases.

### FILE-SHELL-1 — File page repeats the file path in the topbar, breadcrumb, and giant page heading **[UX]**

> "That should realistically be up in the page header somehow, and then the
> breadcrumb should be up there as well... just show it once show the breadcrumb to
> get back to overview show the pills to change the report view and then show the
> report."

**Current behavior:** `FilePage` passes the path into the sticky shell context
(`src/frontend/src/App.tsx:770`), then renders a breadcrumb that repeats the path
(`src/frontend/src/App.tsx:775`), then renders a large `<h1>` with the same path
(`src/frontend/src/App.tsx:781`). The screenshot shows the resulting hierarchy: the
file path dominates the page body even though it is already in the header.

**Suggested fix:** Move the Overview breadcrumb into the topbar/header area, next to
or just before the file context, and remove the body-level file-path `<h1>`. The file
page body should start with the selected mode content:

- Code map mode: code map title/legend + code map.
- Report mode: selected report title + markdown body.

Move the JSON and Re-analyze controls into a quiet right-side header action section.
They are low-frequency controls, so they should be visually tucked away rather than
competing with the file identity or report tabs.

### FILE-SHELL-2 — Report title hierarchy should describe the selected view, not re-announce the file **[COPY/UX]**

> "Show the pills to change the report view and then show the report."

**Current behavior:** When a file-scoped report tab is active, `FilePage` renders a
body-level `<h2>{labelFor(activeView())}</h2>` after the large file `<h1>`
(`src/frontend/src/App.tsx:812-817`). That is directionally right, but it is visually
subordinate to the repeated file path.

**Suggested fix:** After removing the large path heading, promote the selected view
label to the first content heading. This restores the hierarchy: file identity in
the header, selected analysis in the body.

---

## Priority table

| Item                | Type     | Effort       | Suggested sequence                                                                 |
| ------------------- | -------- | ------------ | ---------------------------------------------------------------------------------- |
| PICKER-1            | BUG/UX   | small        | 1 — restore Fan-out `+N more` picker on the active SPA path                        |
| PICKER-2            | BUG/UX   | small        | 2 — apply the same picker to Boundary                                              |
| PICKER-3            | ARCH     | small-medium | 3 — factor the selector helper before adding more network viewers                  |
| INLINE-EVIDENCE-1   | MODEL/UX | medium       | 4 — add helper/caller snippet data and render it for INLINE verdicts               |
| INLINE-EVIDENCE-2   | COPY/UX  | small        | 5 — cap snippet output at first 5 call sites and make the cap explicit             |
| NETWORK-REMAINING-1 | ARCH/UX  | large        | 6 — ship Fan-in, Junctions, and Prop relay network viewers together with mirrors   |
| FILE-SHELL-1        | UX       | small-medium | 7 — move file identity/breadcrumb into the topbar and remove repeated path heading |
| FILE-SHELL-2        | COPY/UX  | small        | 8 — make selected report/code-map title the body heading                           |

Recommended implementation slice: **restore the shared overflow picker first**
because it affects both already-working network viewers and gives the new viewers a
finished selector pattern. Then do **Inline preview evidence** as a bounded
MODEL/UX slice. Finally ship **Fan-in/Junctions/Prop relay together** and do the
**file page hierarchy** pass with JSON/Re-analyze tucked into a right-side header
action section.

---

## Decisions from follow-up

1. **Viewer extraction:** verify `src/server/network-viewers.mjs` before changing it.
   If it is vestigial, delete it after recovering any useful picker behavior. If it is
   still used, keep it. The cleanup goal is to remove dead MJS-era viewer code, not to
   delete an active module.
2. **Inline helper snippet shape:** show the full helper function body capped at 10
   lines. Caller samples remain the call line plus two lines before and after, capped
   to the first 5 call sites.
3. **Network-view scope:** ship Fan-in, Junctions, and Prop relay in one pass.
4. **File page controls:** move JSON and Re-analyze into a quiet right-side action
   section in the header.
