---
title: HTML server source peek popovers and pagination
date: 2026-06-24
category: docs/solutions/ui-bugs
module: tsx-dataflow HTML server
problem_type: ui_bug
component: tooling
symptoms:
  - Source peek popovers were clipped inside scrollable path tables and report containers
  - Overview and sidebar lists became too long to scan comfortably
  - "Overview rendering briefly failed with TypeError: page is not a function after pagination introduced a local name collision"
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - html-server
  - source-peek
  - overview-pagination
  - playwright-verification
tags:
  - tsx-dataflow
  - html-server
  - source-peek
  - popover
  - pagination
  - playwright
---

# HTML server source peek popovers and pagination

## Problem

The `tsx-dataflow` HTML server had two related UX issues in report views: source peek popovers were rendered inside scrollable table/container DOM and got clipped, while overview, sidebar, and path lists could grow long enough to make pages hard to scan. During the fix, one pagination patch also introduced a server runtime error by shadowing the imported `page()` HTML renderer with a local variable named `page`.

## Symptoms

- Source peek popovers opened from path tables but were visibly clipped by scrollable or overflow-constrained ancestors.
- Long path tables pushed dense content far down the page and made a single report finding feel heavier than necessary.
- Overview file rows and sidebar file links produced very long lists with no progressive disclosure.
- Visiting the server root could fail with `TypeError: page is not a function` from `renderOverview`.
- Adding `?refresh=1` requested fresh report data from the running server but did not reload changed server-side modules.

## What Didn't Work

- Raising `z-index` or restyling the popover inside the existing table structure did not solve clipping. The popover still lived under scrollable/table ancestors, so overflow and stacking context rules could clip it.
- Using `?refresh=1` did not verify changed server modules. That route refreshed analyzer/server state inside the current Node process; it did not restart Node or reload the ES module graph.
- The first pagination patch used a local variable named `page`, which shadowed the imported renderer:

```js
import { page } from "./html/page.mjs";

function renderOverview(url) {
  const page = Number(url.searchParams.get("page") || "1");

  return page({
    title: "tsx-dataflow",
    body,
  });
}
```

Inside `renderOverview`, `page` was now a number, so the later call attempted to invoke a number as a function.

## Solution

Render source peek popovers as body-level fixed portals instead of children of the triggering table or panel. The triggering element can still live inside a scrollable report table, but the visible overlay should be appended to `document.body`, positioned from the trigger's viewport rectangle, and clamped to stay visible.

```js
function closePeeks() {
  document
    .querySelectorAll(".peek.open")
    .forEach((peek) => peek.classList.remove("open"));
  document
    .querySelectorAll("body > .peek-pop.portal")
    .forEach((portal) => portal.remove());
}

function positionPeek(label, pop) {
  const rect = label.getBoundingClientRect();
  const margin = 10;
  const desiredWidth = Math.min(
    640,
    Math.max(360, window.innerWidth - margin * 2),
  );

  pop.style.width = `${desiredWidth}px`;
  pop.style.maxWidth = `${desiredWidth}px`;
  pop.style.left = "0px";
  pop.style.top = "0px";
  pop.classList.add("open");

  const popRect = pop.getBoundingClientRect();
  const left = Math.min(
    Math.max(margin, rect.left),
    window.innerWidth - popRect.width - margin,
  );
  const below = rect.bottom + 8;
  const above = rect.top - popRect.height - 8;
  let top =
    below + popRect.height + margin <= window.innerHeight
      ? below
      : Math.max(margin, above);
  top = Math.min(
    Math.max(margin, top),
    Math.max(margin, window.innerHeight - popRect.height - margin),
  );

  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}
```

The click handler clones the inline `.peek-pop`, appends the clone to `body`, and positions that portal. The original inline markup stays in place so report HTML remains self-contained and the body-level copy can be removed on the next click.

```js
const label = event.target.closest(".peek-label");
if (label) {
  const peek = label.closest(".peek");
  const pop = peek ? peek.querySelector(".peek-pop") : null;
  const wasOpen = peek && peek.classList.contains("open");
  closePeeks();

  if (peek && pop && !wasOpen) {
    peek.classList.add("open");
    const portal = pop.cloneNode(true);
    portal.classList.add("portal");
    document.body.appendChild(portal);
    positionPeek(label, portal);
  }
}
```

Use fixed positioning and a high stacking layer for the portal:

```css
.peek-pop {
  display: none;
  position: fixed;
  z-index: 1000;
  min-width: 360px;
  max-width: 640px;
}

.peek-pop.open {
  display: block;
}
```

For long path tables, keep the diagnostic detail but bound its footprint with an internal scroll container:

```html
<details class="path-detail">
  <summary>Path - 23 steps (source -> sink)</summary>
  <div class="path-scroll">
    <table class="path-table">
      <!-- source-to-sink rows -->
    </table>
  </div>
</details>
```

```css
.codemap .panel .path-scroll {
  max-height: 360px;
  overflow: auto;
  border-top: 1px solid var(--border);
}
```

For overview file results, paginate the rows and keep variable names distinct from imported render helpers:

```js
const OVERVIEW_PAGE_SIZE = 25;

function overviewState(url) {
  const pageNumber = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  );
  return { page: pageNumber };
}

function renderOverview(report, url) {
  const state = overviewState(url);
  const totalPages = Math.max(1, Math.ceil(groups.length / OVERVIEW_PAGE_SIZE));
  const currentPage = Math.min(state.page, totalPages);
  const pageStart = (currentPage - 1) * OVERVIEW_PAGE_SIZE;
  const pageGroups = groups.slice(pageStart, pageStart + OVERVIEW_PAGE_SIZE);

  return page({
    title: "tsx-dataflow",
    body: renderOverviewBody(pageGroups),
  });
}
```

For the sidebar, cap the file list with an internal scroll region so report links remain reachable:

```css
nav.side .side-files {
  max-height: min(44vh, 420px);
  overflow: auto;
  padding-right: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
```

The final verification combined automated tests and browser checks:

```bash
pnpm test
git diff --check
```

Playwright verified the patched server rendered 25 overview rows, capped the sidebar file list, mounted the popover as `body > .peek-pop.portal.open`, used `position: fixed`, kept the popover within viewport bounds, and constrained long path tables with a 360px internal scroll region.

## Why This Works

The clipping problem was a DOM containment problem, not just a visual styling problem. A popover rendered inside an ancestor with `overflow: auto`, `overflow: hidden`, table layout constraints, or a stacking context can be clipped even with a high `z-index`. Moving the visible popover to `document.body` removes it from those local layout constraints.

Using `position: fixed` lets the popover be placed in viewport coordinates derived from `getBoundingClientRect()`. Clamping the computed `left` and `top` values keeps the overlay visible near viewport edges, after scrolling, and when the trigger is inside an independently scrolled panel.

Path-table scrolling, overview pagination, and sidebar scroll caps solve the long-list problem at three different levels:

- Path-table scrolling preserves dense diagnostic detail while bounding the vertical footprint of an individual finding.
- Overview pagination keeps the root page fast to scan and prevents hundreds of file rows from dominating the screen.
- Sidebar scroll caps keep navigation usable when there are many files and reports.

Renaming the local pagination variable to `currentPage`, or aliasing the imported renderer to `renderPage`, prevents the runtime error because the render helper remains callable inside `renderOverview`.

## Prevention

- Avoid rendering overlays inside containers that are likely to scroll or clip. For hover/click previews, menus, and popovers in report UIs, prefer body-level portals with fixed positioning and viewport clamping.
- Alias generic imports or avoid reusing their names for local values:

```js
import { page as renderPage } from "./html/page.mjs";

const currentPage = getPageNumber(searchParams);

return renderPage({ title, body });
```

- Add regression tests around the behaviors that failed:

```js
it("paginates long overview file lists", async () => {
  const home = await call(handler, "/?sort=file");
  expect(home.body).toContain("Showing 1-25 of 60 files");
  expect(home.body).toContain("Page 1 of 3");
});
```

- Use Playwright for layout assertions that unit tests cannot see:

```js
const pop = document.querySelector("body > .peek-pop.portal.open");
const rect = pop.getBoundingClientRect();

expect(getComputedStyle(pop).position).toBe("fixed");
expect(rect.left).toBeGreaterThanOrEqual(0);
expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
```

- Restart the local Node server after server-side module edits. A browser reload or `?refresh=1` can prove the current process behavior, but it cannot prove the process loaded changed server modules.

## Related Issues

- No existing `docs/solutions/` entries overlapped with this learning; this is the first solution doc in the repository.
- No matching GitHub issues were found by the related-doc search.
