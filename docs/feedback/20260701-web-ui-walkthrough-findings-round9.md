# tsx-dataflow web UI — walkthrough findings, round 9 (restore fan-out markdown under the graph, then wire relationship diagrams)

Distilled from the **prompt transcript** supplied on 2026-07-01 plus one attached
legible screenshot of the Fan-out tab. There was no context-package folder, SRT, or
cadenced frame set in this round, so timestamps are not available; quotes below are
from the prompt transcript. The attached frame is usable and shows the global
Fan-out report in the React/Solid frontend for `examples/bad-ish-solid`, selected on
`DashboardShell › props.user`, with the network diagram visible and a `Markdown`
button beside the page title.

This is the **ninth** round, following r1-r8. The user frames this as a recovery
check after refactoring: most behavior is back, but the Fan-out report regressed from
"network view + raw markdown underneath" to "network view only", and the next desired
step is to finish the same network-diagram treatment for the other multi-file /
relationship reports.

**Files in play:**

| File                                      | Role                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/frontend/src/App.tsx`                | Active SPA frontend: report tabs, report-page data fetching, Fan-out special-case viewer                                     |
| `src/server.mjs`                          | API routes; now serves the SPA for `/`, `/file`, and `/report`                                                               |
| `src/server/network-viewers.mjs`          | Modular server-side network viewers; contains Fan-out and Boundary viewers, including the orphaned two-sided boundary viewer |
| `src/server/render-pages.mjs`             | Modular server-side page renderers; currently not the active `/report` surface                                               |
| `src/html/code-map-graphs.mjs`            | Shared SVG graph primitives: `fanOutGraphSvg`, `boundaryGraphSvg`, anchors                                                   |
| `src/reports/markdown-views.mjs`          | Markdown report dispatch for all report views                                                                                |
| `src/reports/markdown-boundary-views.mjs` | Boundary, junction, inline-preview markdown renderers                                                                        |
| `INTENT.md`                               | Durable product direction: rich view plus raw markdown; relationship diagrams where relationships are the point              |

Tags: **[ARCH]** structural · **[UX]** interaction/polish · **[BUG]** broken/inconsistent ·
**[MODEL]** analyzer/data-model · **[COPY]** wording.

---

## ✅ What landed well

- **The architecture/refactor recovery is mostly real.** The active UI is now the
  SPA path: `src/server.mjs:181-184` serves the SPA for `/`, `/file`, and `/report`,
  while `src/frontend/src/App.tsx` owns the report-page rendering. The screenshot
  confirms the top tab strip, shell, and Fan-out graph are back in a coherent shape.
- **The global Fan-out network diagram still works.** `ReportPage` special-cases
  `view() === "fan-out"` (`src/frontend/src/App.tsx:681-706`) and calls
  `renderFanOutViewer` (`src/frontend/src/App.tsx:875-934`), which renders the source
  selector, sort controls, source metadata, and `fanOutGraphSvg(active, null)`.
  The attached frame shows exactly that graph for `DashboardShell › props.user`.
- **The graph primitives survived the refactor.** `fanOutGraphSvg` and
  `boundaryGraphSvg` both live in `src/html/code-map-graphs.mjs:47-263`, and
  `src/html/code-map.mjs:6-11` re-exports them for frontend reuse. This is a good
  base for applying the Fan-out pattern elsewhere.
- **The earlier boundary-graph implementation was not imaginary.**
  `boundaryViewer` exists in `src/server/network-viewers.mjs:157-207` and uses
  `boundaryGraphSvg(active)` at `src/server/network-viewers.mjs:201`. That matches
  the user's memory that one of the other report diagrams had been implemented or
  was very close.

---

## 🎯 Big theme #1 — Fan-out must show the network diagram _and_ the markdown report on the same page

> "The fan out view, the global fan out view, is not rendering the Markdown report
> underneath. So I want both the network diagram and the markdown report. At the
> moment I'm just getting the network diagram."

This is a direct regression against round 8 and `INTENT.md` §7: the rich view is for
human orientation, but the raw markdown is still the agent-facing deliverable and must
be inspectable beside the rich view. The screenshot shows the current failure mode:
the Fan-out tab has a `Markdown` button, but the page body is only the network graph.

The code confirms this is a rendering composition bug, not a markdown-generation bug.
`ReportPage` fetches `/api/report.fan-out.md` through the `report` resource
(`src/frontend/src/App.tsx:673-676`), but when Fan-out has HTML it renders only
`fanOutHtml()` (`src/frontend/src/App.tsx:701-706`). The fallback markdown body at
`src/frontend/src/App.tsx:703` is skipped for Fan-out. Meanwhile `/api/report.<view>.md`
is still implemented in `src/server.mjs:136-151`, so the markdown is available.

## 🎯 Big theme #2 — Dust off the existing network-viewer work and finish relationship reports end-to-end

> "Now we want to keep implementing the network diagrams in the other places. And I
> feel like this was even committed at one point. Maybe it was the boundary report or
> the junctions or something."

Round 8 already set this direction: relationship reports should pair a clean network
diagram with detailed markdown below it. The current codebase has a partial
implementation split across two surfaces: the active SPA has only a Fan-out viewer,
while `src/server/network-viewers.mjs` contains a more complete modular viewer layer,
including a Boundary viewer. The next implementation should not start from scratch;
it should reconcile those two surfaces and promote the reusable viewer code into the
active report page.

This is also `INTENT.md` §7 again: "Prefer a real picture over a table where the
relationships are the point." Boundary report, Junctions, Fan-in, and Prop relay all
describe sources, intermediate boundaries, consumers, or convergence; markdown-only
tables leave the relationship structure implicit.

## 🎯 Big theme #3 — Keep the network view and markdown synchronized, not as separate destinations

> "Network diagrams rendered and then under the network diagram, we need the
> markdown as well."

The `Markdown` button in the screenshot links to the raw `.md` endpoint, but that is
not the desired primary UX. It is still useful as a download/open-raw affordance, but
the report tab itself should be the single workspace: interactive diagram first,
markdown mirror underneath. This preserves the round-7/round-8 "report reconcile"
pattern and keeps visual inspection and agent deliverable inspection together.

---

## Detailed Issues

### FANOUT-MD-1 — Fan-out report renders the graph instead of graph + markdown mirror **[BUG/UX]**

> "The fan out view, the global fan out view, is not rendering the Markdown report
> underneath... At the moment I'm just getting the network diagram."

**Current behavior:** In `ReportPage`, the markdown resource is fetched for the active
view (`src/frontend/src/App.tsx:673-676`). For every non-Fan-out report, the fallback
renders `<div class="body" innerHTML={markdownToHtml(report() ?? "")} />`
(`src/frontend/src/App.tsx:701-704`). But when `view() === "fan-out" && fanOutHtml()`
is true, the Fan-out branch renders only `<div class="body" innerHTML={fanOutHtml()} />`
(`src/frontend/src/App.tsx:701-706`). `renderFanOutViewer` itself ends immediately
after `${fanOutGraphSvg(active, null)}` (`src/frontend/src/App.tsx:927-932`), so there
is no place where the fetched markdown is appended.

**Frame:** attached Fan-out screenshot, visible graph only, with `Markdown` button in
the toolbar.

**Suggested fix:** Keep the raw endpoint button, but change the Fan-out branch to
render both pieces in order:

1. `renderFanOutViewer(meta(), props.location)` for the diagram and controls.
2. A styled markdown mirror below it, using the existing `.md-mirror` class from
   `src/html/code-map-styles.mjs:142-143`, e.g. `markdownToHtml(report() ?? "")` inside
   a mirror container.

This is small and low risk because the markdown fetch already exists; the fix is
composition, not analyzer work.

### VIEWER-WIRE-1 — Boundary graph viewer exists but is not wired into the active SPA report page **[ARCH/UX]**

> "Maybe it was the boundary report or the junctions or something. Somewhere in here
> we had rendered network diagrams for the other multi-file type reports."

**Current behavior:** The reusable graph primitive and the boundary viewer exist:

- `boundaryGraphSvg(helper)` draws the two-sided sources -> boundary -> callers SVG
  in `src/html/code-map-graphs.mjs:185-263`.
- `boundaryViewer(helpers, { selected, hrefFor })` selects one boundary helper,
  renders tabs/popover, and calls `boundaryGraphSvg(active)` in
  `src/server/network-viewers.mjs:157-207`.

But the active `/report` page is the SPA. `src/server.mjs:181-184` sends the SPA for
`/report`; it does not call `render-pages.mjs`. In the SPA, `src/frontend/src/App.tsx`
imports only `fanOutAnchor`, `fanOutGraphSvg`, and `renderCodeMap` from
`../../html/code-map.mjs` (`src/frontend/src/App.tsx:11-16`). `ReportPage` only
special-cases `view() === "fan-out"` (`src/frontend/src/App.tsx:681-706`), so
`boundary-report` falls through to markdown-only rendering.

**Frame:** attached screenshot does not show Boundary, but it shows the active SPA
Fan-out branch and confirms the report-page surface under discussion.

**Suggested fix:** Port or import the `boundaryViewer` implementation into the active
frontend path and special-case `view() === "boundary-report"` the same way Fan-out is
handled, with the markdown mirror underneath. The quickest path is probably to move
shared viewer builders out of `src/server/network-viewers.mjs` into a neutral module
that both the SPA and any server-rendered fallback can import. If that is too much for
the first slice, copy the boundary viewer into `App.tsx` as a working slice, then
extract once Fan-in/Junctions/Prop relay are ready.

### VIEWER-WIRE-2 — Fan-in, Junctions, and Prop relay remain markdown-only despite being relationship reports **[ARCH/UX]**

> "Keep implementing the network diagrams in the other places... other multi-file
> type reports."

**Current behavior:** `REPORT_VIEWS` includes `fan-in`, `prop-relay`,
`boundary-report`, and `junctions` (`src/frontend/src/App.tsx:149-164`), but the only
network-view condition in `ReportPage` is Fan-out (`src/frontend/src/App.tsx:681-706`).
The markdown dispatch for these views exists in `src/reports/markdown-views.mjs:70-103`,
and Boundary/Junction markdown is implemented in
`src/reports/markdown-boundary-views.mjs:6-124`, but there is no active SPA diagram
viewer for them.

**Frame:** attached screenshot confirms the report-tab shell where these viewers need
to appear.

**Suggested fix:** Implement in priority order, using Boundary as the template:

1. **Boundary report:** wire the already-built `boundaryViewer` and render markdown
   underneath.
2. **Fan-in:** build a reverse Fan-out viewer around sinks with many roots; diagram
   sources on the left, selected sink on the right or center, markdown underneath.
3. **Junctions:** reuse the two-sided Boundary shape: inbound lineages -> junction ->
   callers/redistribution sites.
4. **Prop relay:** use parent/component boundary -> forwarded prop -> child/consumer
   shape, and keep the detailed markdown below.

### VIEWER-DRIFT-1 — There are now two Fan-out viewer implementations, and the richer modular one is not the active one **[ARCH]**

> "I'm pretty confident that was actually implemented before, so it may just be a
> quick matter of uncovering the code that's missing."

**Current behavior:** `src/frontend/src/App.tsx:875-934` contains a local
`renderFanOutViewer`. `src/server/network-viewers.mjs:86-154` contains another
`fanOutViewer`, with a smaller top-tab limit, a reusable `popover`, clearer sort-copy,
and the same network-view framing. The active app uses the local SPA implementation;
the modular server implementation is not reached by `/report` because the server
sends the SPA.

This split is probably a refactor artifact. It explains why some work feels
"committed at one point" but missing in the UI: the code exists, just not on the
active rendering path.

**Suggested fix:** Choose one owner for report network viewers. Preferred: extract the
viewer functions into a shared frontend-safe module, e.g. `src/frontend/src/report-viewers.ts`
or `src/html/report-viewers.mjs`, and have `App.tsx` import Fan-out and Boundary from
there. Then remove or thin the orphaned server-side viewer code so future work lands
on the active path.

### REPORT-MIRROR-1 — The `Markdown` button is useful but insufficient as the markdown affordance **[UX]**

> "Under the network diagram, we need the markdown as well."

**Current behavior:** `ReportPage` always renders a toolbar link to
`/api/report.<view>.md` (`src/frontend/src/App.tsx:688-694`). That gives access to raw
markdown, but it sends the user away from the visual context and does not satisfy the
round-7/round-8 report-reconcile pattern. The existing `.md-mirror` style
(`src/html/code-map-styles.mjs:142-143`) is currently unused in the SPA Fan-out report.

**Suggested fix:** Keep the button as a raw/export affordance, but make the inline
markdown mirror the primary report-page content underneath any network diagram. Use a
consistent heading such as `Markdown report` or a visually quiet divider so the page
reads as one report, not two unrelated panels.

---

## Priority Table

| Item            | Type    | Effort        | Suggested sequence                                                                |
| --------------- | ------- | ------------- | --------------------------------------------------------------------------------- |
| FANOUT-MD-1     | BUG/UX  | trivial-small | 1 — restore graph + markdown beneath Fan-out immediately                          |
| VIEWER-DRIFT-1  | ARCH    | small-medium  | 2 — choose the active owner for viewer helpers before adding more diagrams        |
| VIEWER-WIRE-1   | ARCH/UX | medium        | 3 — wire Boundary report using the existing `boundaryViewer` / `boundaryGraphSvg` |
| REPORT-MIRROR-1 | UX      | small         | 4 — standardize the inline markdown mirror pattern for all network reports        |
| VIEWER-WIRE-2   | ARCH/UX | medium-large  | 5 — add Fan-in, Junctions, then Prop relay viewers as follow-up slices            |

Recommended implementation slice: **Fan-out markdown mirror + Boundary viewer first**.
That fixes the visible regression and proves the reuse path for the already-existing
two-sided graph. Then Fan-in/Junctions/Prop relay can follow using the same pattern
without expanding the first change too far.

---

## Open Questions

1. **Viewer ownership:** Should `src/server/network-viewers.mjs` be moved into a
   shared frontend-safe module, or should the SPA own report viewers outright and the
   server-side files be retired as refactor leftovers?
2. **Boundary first vs all-at-once:** The code strongly supports Boundary as the first
   follow-up because the viewer already exists. Do we want one polished Boundary slice
   before Fan-in/Junctions/Prop relay, or should the next pass attempt all relationship
   diagrams together?
3. **Markdown mirror heading:** Should the inline mirror have an explicit heading
   (`Markdown report`) or simply render as a quiet bordered block under the graph?
4. **Raw Markdown button:** Keep it as-is for direct `.md` access, or rename it to
   `Raw Markdown` once the inline mirror exists so the distinction is clear?

---

## Stop Point

Per the feedback-walkthrough workflow, this document is **plan-only**. No source code
was changed in this pass. The next step is review/approval, then execution against the
items above.
