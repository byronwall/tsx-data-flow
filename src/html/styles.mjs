// Self-contained CSS for the HTML shell.
export const STYLE = `
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

/* Code map. NOTE: no overflow on .codemap — any non-visible overflow on an
   ancestor silently disables position:sticky on the panel. align-items:start
   keeps the panel from stretching to the (tall) source height so sticky pins it. */
/* Code lines are short, so cap the source column (~800px) and let the detail
   panel absorb the rest — it packs path/reach/defense lists and benefits from
   the room. On narrow screens the source shrinks while the panel keeps a floor. */
.codemap { display: grid; grid-template-columns: minmax(0, 820px) minmax(420px, 760px); gap: 0; border: 1px solid var(--border); border-radius: 8px; align-items: start; max-width: 1600px; }
.codemap .src { overflow-x: auto; background: var(--code-bg); margin: 0; border-radius: 8px 0 0 8px; }
.codemap table.code { border: 0; margin: 0; width: 100%; display: table; font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.codemap table.code td { border: 0; padding: 0 8px; white-space: pre; }
/* COMMENT-1: comments dimmed (italic + muted) — the "thinnest of highlighting". */
.codemap table.code .cmt { color: var(--muted); font-style: italic; }
.codemap td.ln { color: var(--muted); text-align: right; user-select: none; width: 1%; border-right: 2px solid var(--border); }
.codemap td.gutter { width: 1%; padding: 0 4px; text-align: center; }
.codemap tr.has-sink { cursor: pointer; }
/* Findings map to their chunk of code, not the whole line: each finding is a
   clickable .hit span tinted by BURDEN (severity). The hue (--bt) is set inline;
   saturation/lightness come from theme vars so hot = worse in light and dark.
   The line-number border picks up the line's worst burden for quick scanning. */
.codemap tr.has-sink.heat td.ln { border-right-color: hsl(var(--bt) var(--heat-s) var(--heat-bar-l)); }
.codemap .hit {
  background: hsl(var(--bt) var(--heat-s) var(--heat-bg-l));
  box-shadow: inset 0 -2px 0 hsl(var(--bt) var(--heat-s) var(--heat-bar-l));
  border-radius: 3px; cursor: pointer;
}
.codemap .hit.span-start { border-radius: 3px 3px 2px 2px; box-shadow: inset 0 -2px 0 hsl(var(--bt) var(--heat-s) var(--heat-bar-l)), inset 3px 0 0 hsl(var(--bt) var(--heat-s) var(--heat-bar-l)); }
.codemap .hit.span-middle { border-radius: 2px; box-shadow: inset 3px 0 0 hsl(var(--bt) var(--heat-s) var(--heat-bar-l)); }
.codemap .hit.span-end { border-radius: 2px 2px 3px 3px; box-shadow: inset 0 -2px 0 hsl(var(--bt) var(--heat-s) var(--heat-bar-l)), inset 3px 0 0 hsl(var(--bt) var(--heat-s) var(--heat-bar-l)); }
.codemap .hit.span-single { border-radius: 3px; }
.codemap .hit:hover { filter: brightness(0.94); }
/* Selection reads as a heavier, hotter version of the chunk's own burden color
   rather than a generic thin blue outline. */
.codemap .hit.sel {
  outline: 2.5px solid hsl(var(--bt) var(--heat-s) var(--heat-bar-l));
  outline-offset: 1px; border-radius: 3px;
  background: hsl(var(--bt) var(--heat-s) calc(var(--heat-bg-l) - 8%));
  box-shadow: 0 0 0 1px hsl(var(--bt) var(--heat-s) var(--heat-bar-l)), 0 2px 8px hsl(var(--bt) var(--heat-s) var(--heat-bar-l) / 0.45);
}
.codemap .panel .xref { cursor: pointer; }
.codemap .panel ul.xref-list { margin: 6px 0; padding-left: 18px; }
.codemap .panel .finding-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.codemap .panel .finding-head h4 { margin: 8px 0; }
.codemap .panel .copy-debug { font-size: 12px; padding: 3px 9px; white-space: nowrap; }
.codemap .panel .copy-debug.ok { border-color: var(--quick); color: var(--quick); }
.codemap tr.on-path td.code { box-shadow: inset 3px 0 0 var(--border); }
.codemap tr.span-start td.gutter, .codemap tr.span-middle td.gutter, .codemap tr.span-end td.gutter {
  background: linear-gradient(to right, transparent calc(50% - 1px), hsl(var(--bt) var(--heat-s) var(--heat-bar-l)) calc(50% - 1px), hsl(var(--bt) var(--heat-s) var(--heat-bar-l)) calc(50% + 1px), transparent calc(50% + 1px));
}
.codemap tr.span-start td.gutter { background-position-y: 50%; background-size: 100% 50%; background-repeat: no-repeat; }
.codemap tr.span-end td.gutter { background-position-y: 0; background-size: 100% 50%; background-repeat: no-repeat; }
.codemap tr.sel td { background: rgba(88,166,255,0.22) !important; }
.codemap tr.sel td.ln { border-right-color: var(--accent) !important; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
.dot.heat { background: hsl(var(--bt) var(--heat-s) var(--heat-bar-l)); }
.dot.q-peripheral-quick-win { background: var(--quick); }
.dot.q-central-leverage { background: var(--central); }
.dot.q-investigation { background: var(--invest); }
/* Burden heat legend: a gradient swatch with low/high anchors. */
.heat-legend { display: flex; align-items: center; gap: 8px; margin: 6px 0 14px; font-size: 12px; color: var(--muted); }
.heat-legend .bar { width: 160px; height: 10px; border-radius: 5px;
  background: linear-gradient(to right,
    hsl(140 var(--heat-s) var(--heat-bar-l)),
    hsl(70 var(--heat-s) var(--heat-bar-l)),
    hsl(35 var(--heat-s) var(--heat-bar-l)),
    hsl(0 var(--heat-s) var(--heat-bar-l))); }
.codemap .panel {
  position: sticky; top: 0; align-self: start; max-height: 100vh; overflow-y: auto;
  border-left: 1px solid var(--border); padding: 14px 16px; font-size: 13px;
}
.codemap .panel .empty { color: var(--muted); }

/* Source snippets + inline peek popovers. .snip is span-only (phrasing-safe). */
.snip {
  display: block; white-space: pre; overflow-x: auto; margin: 8px 0; padding: 8px 10px;
  background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px; line-height: 1.5;
}
.snip-row { display: block; }
.snip-hit { background: rgba(88,166,255,0.18); border-radius: 3px; }
.snip-ln { color: var(--muted); user-select: none; margin-right: 10px; }
.peek { display: inline-block; }
.peek-label {
  font: inherit; padding: 0; border: 0; background: none; cursor: pointer;
  border-bottom: 1px dotted var(--accent);
}
.peek-label code { background: var(--code-bg); }
.peek-label:hover code { color: var(--accent); }
.peek-pop {
  display: none; position: fixed; z-index: 1000;
  min-width: 360px; max-width: 640px; background: var(--bg);
  border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.28); padding: 4px 8px;
}
.peek-pop.open { display: block; }
.peek-pop .snip { margin: 4px 0; max-height: 320px; overflow: auto; }
/* DRILL-1: count-reveal popovers carry lists, not just code snippets. The popup
   is cloned to a body-level portal, so it needs styling outside .codemap. */
.peek-pop .why { margin: 4px 0 2px; padding-left: 18px; max-height: 320px; overflow: auto; }
.peek-pop .why li { margin: 2px 0; }
.peek-pop .peek-gloss { margin: 2px 0 6px; max-width: 380px; line-height: 1.4; }
/* GRAPH-1: fan-out node/edge diagram (source → sinks, colored by file). */
.fanout-graph { margin: 8px 0; border: 1px solid var(--border); border-radius: 8px; padding: 6px; overflow-x: auto; }
.fanout-graph svg { display: block; width: 100%; height: auto; min-width: 480px; }
.fanout-graph .fg-node { cursor: pointer; }
.fanout-graph .fg-hit { fill: transparent; }
.fanout-graph a:hover .fg-node .fg-hit { fill: rgba(127,127,127,0.14); }
.fanout-graph a:hover .fg-node text { text-decoration: underline; }
.fg-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; font-size: 11px; color: var(--muted); }
.fg-key { display: inline-flex; align-items: center; gap: 5px; }
.fg-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
/* HOME-1: a fan-out source's graph as an overview section. */
.fanout-entry { margin: 14px 0; scroll-margin-top: 16px; }
.fanout-entry h3 { margin: 0 0 4px; font-size: 14px; }
.fanout-entry .meta { font-weight: 400; }
/* ARCH-1/SHELL-2: page-level tab strip, stuck in the top bar. One line on a wide
   viewport (it scrolls off to the side); wraps on a narrow viewport. */
.report-tabs { display: flex; flex-wrap: nowrap; overflow-x: auto; gap: 4px; padding-bottom: 8px; scrollbar-width: thin; }
.report-tab { font-size: 12.5px; padding: 4px 10px; border-radius: 6px; color: var(--muted); text-decoration: none; white-space: nowrap; }
.report-tab:hover { background: var(--panel); color: var(--fg); }
.report-tab.active { background: var(--accent); color: #fff; font-weight: 600; }
@media (max-width: 720px) { .report-tabs { flex-wrap: wrap; overflow-x: visible; } }
/* FANOUT-LIST-1: the fan-out source selector (tab strip + dropdown) + sort + tags. */
.fo-explain { margin: 4px 0 10px; max-width: 72ch; }
.fo-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.fo-tabs { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.fo-tab { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; color: var(--fg); text-decoration: none; background: var(--panel); }
.fo-tab:hover { border-color: var(--accent); }
.fo-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.fo-tab-val { font-size: 11px; font-variant-numeric: tabular-nums; opacity: 0.8; }
.fo-tab.active .fo-tab-val { opacity: 0.95; }
.fo-more { font-size: 12.5px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel); color: var(--fg); }
.fo-sort { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
.fo-sort-btn { font-size: 12px; padding: 2px 8px; border-radius: 6px; color: var(--muted); text-decoration: none; }
.fo-sort-btn:hover { background: var(--panel); color: var(--fg); }
.fo-sort-btn.active { background: var(--accent); color: #fff; font-weight: 600; }
.fo-tag { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; vertical-align: middle; }
.fo-tag-single { background: var(--central-bg); color: var(--central); }
.fo-tag-cross { background: var(--quick-bg); color: var(--quick); }
/* REPORT-RECONCILE-1: the raw markdown shown beneath the network view. */
.md-mirror { border: 1px solid var(--border); border-radius: 8px; background: var(--panel); padding: 0 14px; margin-top: 6px; }
.codemap .panel .finding { display: none; }
.codemap .panel .finding.active { display: block; }
.codemap .panel h4 { margin: 0 0 2px; }
.codemap .panel .meta { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
.codemap .panel dl { display: grid; grid-template-columns: auto auto; gap: 2px 10px; margin: 8px 0; align-content: start; }
.codemap .panel dt { color: var(--muted); }
.codemap .panel .why { margin: 6px 0; padding-left: 18px; }
/* BURDEN-1: burden/confidence/risk on the left, metric-contribution pills filling
   the whitespace to the right (no click-to-expand, no full-width bars). */
.codemap .panel .burden-row { display: flex; flex-wrap: wrap; gap: 6px 20px; align-items: flex-start; margin: 8px 0; }
.codemap .panel .burden-row dl { margin: 0; flex: 0 0 auto; }
.codemap .panel .burden-breakdown { flex: 1 1 240px; min-width: 0; }
.codemap .panel .bd-lead { margin: 0 0 4px; }
.codemap .panel ul.bd-pills { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; }
.codemap .panel ul.bd-pills li.bd-pill {
  font-size: 11px; padding: 2px 9px; border: 1px solid var(--border);
  border-radius: 999px; color: var(--text); white-space: nowrap;
}
.codemap .panel .bd-pct { color: var(--muted); font-variant-numeric: tabular-nums; }
/* Detailed "show, don't tell" sections: path, representation hops, reach. */
.codemap .panel details { margin: 8px 0; }
.codemap .panel details > summary {
  cursor: pointer; font-weight: 600; color: var(--text);
  list-style: revert; margin: 4px 0;
}
.codemap .panel ol.path, .codemap .panel ul.reach {
  margin: 6px 0; padding-left: 20px;
}
.codemap .panel ol.path li, .codemap .panel ul.reach li { margin: 3px 0; }
.codemap .panel table.path-table { width: 100%; margin: 6px 0; font-size: 12px; table-layout: auto; }
.codemap .panel table.path-table th,
.codemap .panel table.path-table td { padding: 4px 6px; vertical-align: top; }
.codemap .panel table.path-table th:first-child,
.codemap .panel table.path-table td.step-no { width: 28px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.codemap .panel table.path-table th:nth-child(2) { width: 64px; }
/* STEP-3: Expression moved out of the far-right narrow slot into the 3rd column
   with real width, ahead of the (taller) Location column; it no longer gets
   squeezed into a tall narrow strip. */
.codemap .panel table.path-table td.path-expr { overflow-wrap: anywhere; min-width: 160px; }
.codemap .panel table.path-table td.path-expr code { white-space: normal; overflow-wrap: anywhere; }
/* OVERFLOW-1: let the location wrap instead of forcing a horizontal scroll, and
   show the path at full height (no inner max-height) so the whole chain is
   visible without scrolling inside the panel. */
.codemap .panel table.path-table td.path-loc { white-space: normal; overflow-wrap: anywhere; }
.codemap .panel .path-loc { overflow-wrap: anywhere; }
.codemap .panel table.path-table code { white-space: normal; overflow-wrap: anywhere; }
.codemap .panel .path-scroll { overflow-x: auto; border-top: 1px solid var(--border); }
.codemap .panel ul.reach ul { margin: 2px 0; padding-left: 16px; list-style: none; }
.codemap .panel ul.reach ul li { color: var(--muted); }
.codemap .panel .k {
  display: inline-block; min-width: 64px; font-size: 11px; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.03em;
}

/* Right-panel list vs. detail modes. The panel shows the findings INVENTORY by
   default (no finding force-opened); selecting one swaps to its detail. */
.codemap .panel .finding-list { margin: 4px 0; }
.codemap .panel .finding-list ol { list-style: none; margin: 0; padding: 0; }
.codemap .panel .finding-list li { margin: 0; }
.codemap .panel .finding-row {
  display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: baseline;
  width: 100%; text-align: left; padding: 7px 9px; margin: 4px 0; cursor: pointer;
  border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg);
  border-left: 4px solid hsl(var(--bt) var(--heat-s) var(--heat-bar-l));
}
.codemap .panel .finding-row:hover { border-color: var(--accent); }
.codemap .panel .finding-row .fr-loc { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; }
.codemap .panel .finding-row .fr-expr {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.codemap .panel .finding-row .fr-burden { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; }
/* In detail mode the list is hidden and the active finding shows; a back link
   returns to the list. JS toggles .show-detail on the panel. */
.codemap .panel.show-detail .finding-list { display: none; }
.codemap .panel:not(.show-detail) .finding { display: none !important; }
.codemap .panel .panel-back {
  display: none; align-items: center; gap: 6px; margin: 2px 0 10px; padding: 4px 8px;
  font-size: 12px; cursor: pointer; background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
}
.codemap .panel.show-detail .panel-back { display: inline-flex; }
.codemap .panel .empty { color: var(--muted); }

/* Path overlay: the selected finding lights up its own representative-path lines
   on the source — the sink line, the source/definition line, and the hops. */
.codemap tr.path-active td.code { box-shadow: inset 3px 0 0 var(--accent); background: hsl(212 90% 60% / 0.07); }
.codemap tr.path-active.sink-line td.code { box-shadow: inset 3px 0 0 var(--accent); background: hsl(212 90% 60% / 0.14); }
.codemap tr.path-active td.ln { color: var(--accent); font-weight: 600; }
.codemap tr.path-active .path-tag {
  float: right; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--accent); margin-left: 8px; user-select: none;
}
.codemap tr.flash td.code { animation: codeflash 0.85s ease-out; }
@keyframes codeflash { from { background: hsl(212 90% 60% / 0.35); } to { background: transparent; } }

/* Jump-to-line (same file) and open-file (cross file) links inside path/defense rows. */
.codemap .goto-line { cursor: pointer; border-bottom: 1px dotted var(--accent); }
.peek-pop .peek-open { display: inline-block; margin: 4px 2px 2px; font-size: 12px; }

/* Unified inventory: type badges + filter chips + per-type tinting. */
.badge.q-usage { color: var(--muted); background: var(--code-bg); }
.badge.q-fork { color: #b8860b; background: var(--central-bg); }
.badge.q-junction, .badge.q-boundary { color: #2563eb; background: hsl(212 90% 60% / 0.12); }
.type-tag {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 0 5px; border-radius: 8px; font-weight: 600; margin-right: 2px;
}
.tt-finding { color: var(--invest); background: var(--invest-bg); }
.tt-usage { color: var(--muted); background: var(--code-bg); }
.tt-fork { color: var(--central); background: var(--central-bg); }
.tt-junction, .tt-boundary { color: var(--accent); background: hsl(212 90% 60% / 0.12); }
/* ARCH-2: promoted report types get their own badge colors so they read as
   distinct facets in the unified list and filter chips. */
.badge.q-relay, .tt-relay { color: #0d9488; background: hsl(175 60% 42% / 0.16); }
.badge.q-fan-out, .tt-fan-out { color: #1d6fa5; background: hsl(205 70% 50% / 0.14); }
.badge.q-unknown, .tt-unknown { color: #be185d; background: hsl(330 70% 55% / 0.14); }
.codemap .panel .finding-row[data-hidden] { display: none; }
.codemap .panel li[data-hidden] { display: none; }
.codemap .panel .finding-list li[data-type="usage"] .finding-row { opacity: 0.72; }
.entry-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.entry-filters .efilter {
  font-size: 11px; padding: 2px 9px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--bg); color: var(--muted); cursor: pointer;
}
.entry-filters .efilter.active { color: var(--fg); border-color: var(--accent); background: var(--code-bg); }
/* Cross-cutting facet chips (e.g. "defended") read with a dashed border so they
   are distinct from the type chips they coexist with. */
.entry-filters .efilter-facet { border-style: dashed; }

/* Defensive markers (DEF-1/DEF-2/DEF-3): any fallback step reads as defensive.
   DEF-3: mark the row with a left-border accent rather than a green fill (which
   collided with the low-burden green), and give the Defenses list an icon column
   so each entry stays on one line. */
.def-icon { cursor: help; }
.codemap .panel tr.defensive-step td.step-no { box-shadow: inset 3px 0 0 hsl(140 45% 45%); }
.codemap .panel ul.def-list { list-style: none; padding-left: 0; }
.codemap .panel ul.def-list li.def-row { display: flex; gap: 6px; align-items: baseline; margin: 3px 0; }
.codemap .panel ul.def-list .def-mark { flex: 0 0 auto; }
.codemap .panel ul.def-list .def-body { min-width: 0; overflow-wrap: anywhere; }
/* FORK-2: emphasize branch-exclusive computations with an amber accent (a left
   border + amber links) so they stand out from the blue jump-links elsewhere. */
.codemap .panel ul.branch-exclusive { list-style: none; padding-left: 0; }
.codemap .panel ul.branch-exclusive li {
  margin: 3px 0; padding: 2px 8px; border-left: 3px solid var(--central);
  background: var(--central-bg); border-radius: 0 4px 4px 0;
}
.codemap .panel ul.branch-exclusive .goto-line { color: var(--central); border-bottom-color: var(--central); }
/* RELAY-1: surface the relay's in-scope context hook (the shared-state target)
   in the relay teal, and render forwarded props as inline chips so the bundle
   reads as a set rather than a plain bulleted list. */
.codemap .panel ul.relay-context { list-style: none; padding-left: 0; }
.codemap .panel ul.relay-context li {
  margin: 3px 0; padding: 2px 8px; border-left: 3px solid #0d9488;
  background: hsl(175 60% 42% / 0.12); border-radius: 0 4px 4px 0;
}
.codemap .panel ul.relay-context code { color: #0d9488; font-weight: 600; }
.codemap .panel ul.relay-prop { list-style: none; padding-left: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.codemap .panel ul.relay-prop li { margin: 0; }
.codemap .panel ul.relay-prop code {
  padding: 1px 7px; border-radius: 10px;
  color: #1d6fa5; background: hsl(205 70% 50% / 0.14);
}
/* Numbered fork sites (FORK-1), matching the path-table step ordinals. */
.codemap .panel ul.site-list { list-style: none; padding-left: 0; }
.codemap .panel ul.site-list li { margin: 3px 0; }
.codemap .panel .site-no {
  display: inline-block; min-width: 16px; text-align: right; margin-right: 4px;
  color: var(--muted); font-variant-numeric: tabular-nums; font-size: 11px;
}
/* Human-readable alias under the finding id (TITLE-1). */
.codemap .panel .finding-alias { color: var(--muted); font-size: 12px; margin: 0 0 6px; }
/* Sort control on the inventory list (SORT-1). HEAD-2: a single segmented button
   group (shared border, internal dividers, one rounded outer radius), not three
   loose pills. HEAD-3: the "Sort" label is centered against the group, not raised. */
.entry-sort { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; font-size: 11px; }
.entry-sort .entry-sort-label { color: var(--muted); font-size: 11px; line-height: 1; align-self: center; }
.entry-sort .seg { display: inline-flex; align-items: stretch; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.entry-sort .seg .esort {
  font-size: 11px; padding: 3px 11px; line-height: 1.4; border: 0; border-right: 1px solid var(--border);
  background: var(--bg); color: var(--muted); cursor: pointer;
}
.entry-sort .seg .esort:last-child { border-right: 0; }
.entry-sort .seg .esort:hover { color: var(--fg); }
.entry-sort .seg .esort.active { color: var(--fg); background: var(--code-bg); }
/* HEAD-4: pin the count/description/filter/sort header to the top of the panel's
   own scroll so it stays visible while the (long) list scrolls underneath. The
   negative margins let it span the panel's full width and cover the padding gap. */
.codemap .panel .finding-list-head {
  position: sticky; top: 0; z-index: 3; background: var(--bg);
  margin: -14px -16px 8px; padding: 12px 16px 8px; border-bottom: 1px solid var(--border);
}
.codemap .panel .finding-list-head p.meta { margin: 4px 0; }
.codemap .panel .finding-list-head .file-stats { margin: 2px 0 4px; font-variant-numeric: tabular-nums; }
.codemap .panel .finding-list-head .entry-filters,
.codemap .panel .finding-list-head .entry-sort { margin: 6px 0 0; }
.codemap .panel .def-jump { margin: 6px 0; }
.codemap .panel .usage-note { margin: 6px 0; padding: 6px 9px; border-radius: 6px; background: var(--code-bg); color: var(--muted); font-size: 12px; }

/* Inline cross-file code reveal (INLINE-1): keep the code map, show the target. */
.codemap .panel .xfile-peek { display: inline; }
.codemap .panel .reveal-code {
  font-size: 11px; padding: 0 6px; margin-left: 2px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--panel); color: var(--muted); cursor: pointer;
}
.codemap .panel .inline-code { display: block; margin: 4px 0; }

/* Numbered path-step badges on the overlay (ANNO-1). */
.codemap td.gutter .path-step-no {
  display: inline-block; min-width: 14px; height: 14px; line-height: 14px;
  font-size: 9px; text-align: center; border-radius: 7px; cursor: pointer;
  background: var(--accent); color: #fff; font-variant-numeric: tabular-nums;
}
.codemap td.gutter .path-step-no.def { background: hsl(140 60% 38%); }

`;
