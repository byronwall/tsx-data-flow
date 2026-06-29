// Self-contained HTML shell: all CSS/JS is inlined so a page works offline and
// makes no external requests. `page()` wraps body markup.
import { escapeHtml } from "./escape.mjs";
import { STYLE } from "./styles.mjs";
import { SCRIPT } from "./client-script.mjs";





// SHELL-1/2: the left sidebar is retired. A persistent, sticky top bar carries the
// brand ("tsx-dataflow", a home link) + the repo/path context, and — stuck directly
// beneath it — the tab strip (workspace report tabs on the overview/report pages, the
// code-map + file-scoped report tabs on the file page). `context` is the repo root or
// the current file path; `tabs` is the pre-rendered tab strip for this page.
export function page({ title, body, tabs = "", context = "", wide = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-bar">
    <a class="brand" href="/">tsx-dataflow</a>
    ${context ? `<span class="topbar-context" title="${escapeHtml(context)}">${escapeHtml(context)}</span>` : ""}
  </div>
  ${tabs}
</header>
<div class="layout">
<main${wide ? ' class="wide"' : ""}>${body}</main>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}

export { escapeHtml };
