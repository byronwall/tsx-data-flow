// Self-contained CSS for the HTML shell.
import { CODE_MAP_STYLE } from "./code-map-styles.mjs";

const BASE_STYLE = `
:root {
  --bg: #ffffff; --fg: #1c1f24; --muted: #6b7280; --border: #e3e6ea;
  --panel: #f6f8fa; --accent: #2563eb; --code-bg: #f2f4f7;
  --quick: #2e7d32; --central: #b8860b; --invest: #b91c1c;
  --quick-bg: #e7f4e8; --central-bg: #fbf3dd; --invest-bg: #fbe5e5;
  /* Burden heat: saturation + lightness for tints (bg) and accents (bar). */
  --heat-s: 75%; --heat-bg-l: 90%; --heat-bar-l: 42%;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1216; --fg: #d7dbe0; --muted: #8b949e; --border: #272c33;
    --panel: #161b22; --accent: #58a6ff; --code-bg: #161b22;
    --quick: #4cc05a; --central: #d9a93a; --invest: #f06a6a;
    --quick-bg: #122017; --central-bg: #211c10; --invest-bg: #251313;
    --heat-s: 45%; --heat-bg-l: 17%; --heat-bar-l: 55%;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.layout { display: flex; align-items: flex-start; }
/* SHELL-1/2: persistent sticky top bar (brand + repo/path) with the tab strip stuck
   directly beneath it — the on-page replacement for the retired left sidebar. */
.topbar {
  position: sticky; top: 0; z-index: 20; background: var(--bg);
  border-bottom: 1px solid var(--border); padding: 10px 34px 0;
}
.topbar-bar { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
.brand { font-size: 15px; font-weight: 700; color: var(--fg); }
.brand:hover { color: var(--accent); text-decoration: none; }
.topbar-context {
  color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
main { flex: 1; min-width: 0; padding: 26px 34px; max-width: 1100px; }
/* The code-map page is layout-driven (not prose), so let it use the viewport:
   cap only on ultra-wide screens to keep line lengths sane. */
main.wide { max-width: min(2200px, 100%); }
h1, h2, h3 { line-height: 1.25; }
h2 { margin-top: 1.8em; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13.5px; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: var(--panel); }
pre {
  background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px;
  padding: 12px 14px; overflow-x: auto; font-size: 13px;
}
:not(pre) > code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
blockquote {
  margin: 12px 0; padding: 8px 16px; border-left: 3px solid var(--border);
  background: var(--panel); color: var(--muted); border-radius: 0 6px 6px 0;
}
blockquote p { margin: 6px 0; }
details { border: 1px solid var(--border); border-radius: 6px; margin: 10px 0; background: var(--bg); }
details > summary {
  cursor: pointer; padding: 10px 14px; font-weight: 600; user-select: none;
  list-style: none; display: flex; justify-content: space-between; align-items: center;
}
details > summary::-webkit-details-marker { display: none; }
details[open] > summary { border-bottom: 1px solid var(--border); }
details .body { padding: 4px 16px 14px; }
.badge { font-size: 11px; padding: 1px 7px; border-radius: 10px; font-weight: 600; }
.q-peripheral-quick-win { color: var(--quick); background: var(--quick-bg); }
.q-central-leverage { color: var(--central); background: var(--central-bg); }
.q-investigation { color: var(--invest); background: var(--invest-bg); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 14px 0; }
.card { border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; background: var(--panel); }
.card .n { font-size: 22px; font-weight: 700; }
.card .l { font-size: 12px; color: var(--muted); }
.toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 18px; flex-wrap: wrap; }
.toolbar form { margin: 0; }
button, .btn {
  font: inherit; font-size: 13px; padding: 5px 12px; border: 1px solid var(--border);
  border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer;
}
button:hover { border-color: var(--accent); }
/* Form controls: never fall back to raw native widgets — match the buttons. */
input, select, textarea {
  font: inherit; font-size: 13px; padding: 5px 10px; color: var(--fg);
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
}
input:hover, select:hover { border-color: var(--accent); }
input:focus, select:focus, textarea:focus {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px hsl(var(--accent-h, 212) 90% 60% / 0.2);
}
input[type="search"] { min-width: 220px; }
/* SHELL-5: reusable custom popover (replaces native select elements). The panel is
   absolutely positioned against the trigger's relative wrapper, so positioning is
   consistent everywhere. */
.popover { position: relative; display: inline-block; }
.popover-trigger {
  display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px;
  padding: 5px 10px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg); color: var(--fg); cursor: pointer;
}
.popover-trigger:hover { border-color: var(--accent); }
.popover-label { color: var(--muted); }
.popover-value { font-weight: 600; }
.popover-caret { color: var(--muted); font-size: 10px; }
.popover-panel {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 40; min-width: 100%;
  max-height: min(60vh, 360px); overflow: auto; padding: 4px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); white-space: nowrap;
}
.popover:not(.open) .popover-panel { display: none; }
.popover-opt {
  display: block; padding: 5px 10px; border-radius: 6px; font-size: 13px;
  color: var(--fg); text-decoration: none;
}
.popover-opt:hover { background: var(--panel); text-decoration: none; }
.popover-opt.active { background: var(--accent); color: #fff; font-weight: 600; }
.pager { display: flex; align-items: center; gap: 10px; margin: 12px 0 24px; }
.btn.disabled { opacity: 0.45; pointer-events: none; }
/* Breadcrumb / back link above a page title. */
.crumbs { display: flex; gap: 6px; align-items: center; font-size: 13px; margin-bottom: 8px; color: var(--muted); }
.crumbs a { color: var(--accent); }
/* Sortable table headers: clickable, with an active-direction caret. */
th.sortable { padding: 0; }
th.sortable a { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 10px; color: inherit; white-space: nowrap; }
th.sortable a:hover { text-decoration: none; color: var(--accent); }
th.sortable.active { background: var(--code-bg); }
th.sortable .caret { color: var(--accent); flex: 0 0 auto; font-size: 0.85em; }
/* OVERVIEW-1: optional per-type count columns + the show/hide control. */
.overview-table td.num, .overview-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.col-toggle {
  display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center;
  margin: 8px 0; padding: 6px 10px; border: 1px solid var(--border);
  border-radius: 8px; font-size: 13px;
}
.col-toggle label { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
#overview-table.hide-boundaries .col-boundaries,
#overview-table.hide-fanout .col-fanout,
#overview-table.hide-relays .col-relays,
#overview-table.hide-unknown .col-unknown { display: none; }

`;

export const STYLE = `${BASE_STYLE}${CODE_MAP_STYLE}`;
