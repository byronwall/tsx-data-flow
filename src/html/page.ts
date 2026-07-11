// Static HTML fallback shell used for server errors and a missing SPA build.
import { escapeHtml } from "./escape.js";
import { STYLE } from "./styles.js";





// SHELL-1/2: the left sidebar is retired. A persistent, sticky top bar carries the
// brand ("tsx-dataflow", a home link) + the repo/path context, and — stuck directly
// beneath it — the tab strip (workspace report tabs on the overview/report pages, the
// code-map + file-scoped report tabs on the file page). `context` is the repo root or
// the current file path; `tabs` is the pre-rendered tab strip for this page.
interface PageOptions { title: string; body: string; tabs?: string; context?: string; wide?: boolean }

export function page({ title, body, tabs = "", context = "", wide = false }: PageOptions) {
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
</body>
</html>`;
}

export { escapeHtml };
