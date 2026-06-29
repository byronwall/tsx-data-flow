// Self-contained HTML shell: all CSS/JS is inlined so a page works offline and
// makes no external requests. `page()` wraps body markup; `escapeHtml` is shared
// with the markdown converter.
import { escapeHtml } from "./markdown-to-html.mjs";

const STYLE = `
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
nav.side {
  position: sticky; top: 0; align-self: flex-start; height: 100vh; overflow: auto;
  width: 260px; min-width: 260px; padding: 18px 16px; border-right: 1px solid var(--border);
  background: var(--panel); font-size: 13px;
}
nav.side h1 { font-size: 15px; margin: 0 0 4px; }
nav.side .sub { color: var(--muted); margin-bottom: 14px; word-break: break-all; }
nav.side ul { list-style: none; margin: 0; padding: 0; }
nav.side li { margin: 2px 0; }
nav.side .side-files {
  max-height: min(44vh, 420px); overflow: auto; padding-right: 4px; margin-bottom: 14px;
  border-bottom: 1px solid var(--border);
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
.fanout-graph svg { display: block; min-width: 480px; }
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

const SCRIPT = `
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
  }
  legacyCopy(text);
  return Promise.resolve();
}
function legacyCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (err) {}
  document.body.removeChild(ta);
}

// ---- finding selection + path overlay (shared by clicks and initial load) ----
function clearPathOverlay(map) {
  map.querySelectorAll('tr.path-active').forEach(function (r) {
    r.classList.remove('path-active', 'sink-line');
    var tag = r.querySelector('.path-tag'); if (tag) tag.remove();
    var no = r.querySelector('.path-step-no'); if (no) no.remove();
  });
}
// Light up the selected finding's representative path on the source: every hop
// line in this file, with the sink line tagged. Answers "where is this coming
// from / where is it defined" without leaving the code map.
function applyPathOverlay(map, finding) {
  clearPathOverlay(map);
  if (!finding) return;
  (finding.getAttribute('data-path-lines') || '').split(',').filter(Boolean).forEach(function (n) {
    var r = map.querySelector('tr[data-line="' + n + '"]');
    if (r) r.classList.add('path-active');
  });
  var sinkLine = finding.getAttribute('data-sink-line') || '';
  if (sinkLine) {
    var sr = map.querySelector('tr[data-line="' + sinkLine + '"]');
    if (sr) {
      sr.classList.add('path-active', 'sink-line');
      var code = sr.querySelector('td.code');
      if (code && !code.querySelector('.path-tag')) {
        var tag = document.createElement('span');
        tag.className = 'path-tag'; tag.textContent = 'sink';
        code.appendChild(tag);
      }
    }
  }
  // ANNO-1: number each same-file path step in the gutter ("this is item N"),
  // click to re-center. data-path-steps = "line:ordinal[:d],…" (d = defensive).
  (finding.getAttribute('data-path-steps') || '').split(',').filter(Boolean).forEach(function (pair) {
    var bits = pair.split(':');
    var ln = bits[0], ord = bits[1], def = bits[2] === 'd';
    var r = map.querySelector('tr[data-line="' + ln + '"]');
    if (!r) return;
    var gut = r.querySelector('td.gutter');
    if (!gut || gut.querySelector('.path-step-no')) return;
    var badge = document.createElement('span');
    badge.className = 'path-step-no' + (def ? ' def' : '');
    badge.textContent = ord;
    badge.setAttribute('data-line', ln);
    badge.title = 'Path step ' + ord + (def ? ' · defensive' : '');
    gut.appendChild(badge);
  });
}
function flashLine(row) {
  if (!row) return;
  row.classList.add('flash');
  setTimeout(function () { row.classList.remove('flash'); }, 850);
}
function scrollMapToLine(map, line, block) {
  var r = map.querySelector('tr[data-line="' + line + '"]');
  if (r) r.scrollIntoView({ block: block || 'center' });
  return r;
}
// Keep all view state in the query string so a refresh restores the selection.
function syncFindingUrl(id) {
  if (!window.history || !window.history.replaceState) return;
  var url = new URL(window.location.href);
  if (id) url.searchParams.set('finding', id); else url.searchParams.delete('finding');
  window.history.replaceState({}, '', url);
}
function findHit(map, id) {
  return [].slice.call(map.querySelectorAll('.hit')).find(function (h) {
    return (h.getAttribute('data-findings') || '').split(',').indexOf(id) >= 0;
  });
}
// Reveal finding(s) in detail mode, overlay the primary one's path, center its
// source chunk, and reflect it in the URL.
function selectFindings(map, ids) {
  var panel = map.querySelector('.panel');
  if (!panel || !ids.length) return;
  panel.querySelectorAll('.finding').forEach(function (f) { f.classList.remove('active'); });
  var first = null;
  ids.forEach(function (id) {
    var t = panel.querySelector('.finding[data-finding="' + id + '"]');
    if (t) { t.classList.add('active'); if (!first) first = t; }
  });
  if (!first) return;
  panel.classList.add('show-detail');
  first.scrollIntoView({ block: 'nearest' });
  applyPathOverlay(map, first);
  map.querySelectorAll('.hit.sel').forEach(function (h) { h.classList.remove('sel'); });
  var hit = findHit(map, ids[0]);
  if (hit) { hit.classList.add('sel'); hit.scrollIntoView({ block: 'center' }); }
  else { scrollMapToLine(map, first.getAttribute('data-sink-line')); }
  syncFindingUrl(ids[0]);
}
// Return to the findings inventory: clear selection, overlay, and URL state.
function showFindingList(map) {
  var panel = map.querySelector('.panel');
  if (!panel) return;
  panel.classList.remove('show-detail');
  panel.querySelectorAll('.finding').forEach(function (f) { f.classList.remove('active'); });
  map.querySelectorAll('.hit.sel').forEach(function (h) { h.classList.remove('sel'); });
  clearPathOverlay(map);
  syncFindingUrl(null);
}

// Re-sort the inventory list in place (SORT-1): score (worst first) / type / line.
function sortFindingList(fl, mode) {
  var ol = fl.querySelector('ol');
  if (!ol) return;
  var num = function (li, attr) { return parseFloat(li.getAttribute(attr)) || 0; };
  var items = [].slice.call(ol.children);
  items.sort(function (a, b) {
    if (mode === 'line') return num(a, 'data-sort-line') - num(b, 'data-sort-line');
    if (mode === 'sources') {
      return (num(b, 'data-sort-sources') - num(a, 'data-sort-sources'))
        || (num(b, 'data-sort-score') - num(a, 'data-sort-score'));
    }
    if (mode === 'type') {
      return (num(a, 'data-sort-order') - num(b, 'data-sort-order'))
        || (num(a, 'data-sort-line') - num(b, 'data-sort-line'));
    }
    return (num(b, 'data-sort-score') - num(a, 'data-sort-score'))
      || (num(a, 'data-sort-line') - num(b, 'data-sort-line'));
  });
  items.forEach(function (li) { ol.appendChild(li); });
  fl.querySelectorAll('.esort').forEach(function (b) {
    if (b.getAttribute('data-sort') === mode) b.classList.add('active');
    else b.classList.remove('active');
  });
}
function syncSortUrl(mode) {
  if (!window.history || !window.history.replaceState) return;
  var url = new URL(window.location.href);
  if (mode && mode !== 'score') url.searchParams.set('lsort', mode);
  else url.searchParams.delete('lsort');
  window.history.replaceState({}, '', url);
}

document.addEventListener('click', function (e) {
  function closePeeks() {
    document.querySelectorAll('.peek.open').forEach(function (p) { p.classList.remove('open'); });
    document.querySelectorAll('body > .peek-pop.portal').forEach(function (p) { p.remove(); });
  }

  function positionPeek(label, pop) {
    var rect = label.getBoundingClientRect();
    var margin = 10;
    var desiredWidth = Math.min(640, Math.max(360, window.innerWidth - margin * 2));
    pop.style.width = desiredWidth + 'px';
    pop.style.maxWidth = desiredWidth + 'px';
    pop.style.left = '0px';
    pop.style.top = '0px';
    pop.classList.add('open');
    var popRect = pop.getBoundingClientRect();
    var left = Math.min(Math.max(margin, rect.left), window.innerWidth - popRect.width - margin);
    var below = rect.bottom + 8;
    var above = rect.top - popRect.height - 8;
    var top = below + popRect.height + margin <= window.innerHeight
      ? below
      : Math.max(margin, above);
    top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - popRect.height - margin));
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
  }

  // "Copy debug info": dump the finding's full debug payload to the clipboard.
  var copyBtn = e.target.closest('.copy-debug');
  if (copyBtn) {
    var finding = copyBtn.closest('.finding');
    var payload = finding ? finding.querySelector('.debug-payload') : null;
    var text = payload ? payload.textContent : '';
    copyText(text).then(function () {
      var prev = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('ok');
      setTimeout(function () { copyBtn.textContent = prev; copyBtn.classList.remove('ok'); }, 1300);
    });
    e.stopPropagation();
    return;
  }

  // Inline source-peek popover toggle. Close any other open popover first.
  var label = e.target.closest('.peek-label');
  if (label) {
    var peek = label.closest('.peek');
    var pop = peek ? peek.querySelector('.peek-pop') : null;
    var wasOpen = peek && peek.classList.contains('open');
    closePeeks();
    if (peek && pop && !wasOpen) {
      peek.classList.add('open');
      var portal = pop.cloneNode(true);
      portal.classList.add('portal');
      document.body.appendChild(portal);
      positionPeek(label, portal);
    }
    e.stopPropagation();
    return;
  }
  if (!e.target.closest('.peek-pop')) closePeeks();

  // Type-filter chips on the inventory list.
  var efilter = e.target.closest('.efilter');
  if (efilter) {
    var fl = efilter.closest('.finding-list');
    if (fl) {
      fl.querySelectorAll('.efilter').forEach(function (b) { b.classList.remove('active'); });
      efilter.classList.add('active');
      var want = efilter.getAttribute('data-filter');
      fl.querySelectorAll('ol > li').forEach(function (li) {
        var show = want === 'all'
          || (want === 'defended' ? li.getAttribute('data-has-defenses') === '1'
                                  : li.getAttribute('data-type') === want);
        if (show) li.removeAttribute('data-hidden');
        else li.setAttribute('data-hidden', '1');
      });
    }
    return;
  }

  // Sort control on the inventory list (SORT-1): re-order and persist in the URL.
  var esort = e.target.closest('.esort');
  if (esort) {
    var sfl = esort.closest('.finding-list');
    if (sfl) {
      var mode = esort.getAttribute('data-sort');
      sortFindingList(sfl, mode);
      syncSortUrl(mode);
    }
    return;
  }

  // Reveal cross-file code inline (INLINE-1) without leaving the page.
  var reveal = e.target.closest('.reveal-code');
  if (reveal) {
    var peek = reveal.closest('.xfile-peek');
    var inline = peek ? peek.querySelector('.inline-code') : null;
    if (inline) {
      var show = inline.hasAttribute('hidden');
      if (show) inline.removeAttribute('hidden'); else inline.setAttribute('hidden', '');
      reveal.textContent = show ? '⌃ hide' : '⌄ code';
    }
    e.preventDefault();
    return;
  }

  // A numbered path-step badge: scroll its line to center.
  var stepNo = e.target.closest('.path-step-no');
  if (stepNo) {
    var ms = stepNo.closest('.codemap');
    if (ms) flashLine(scrollMapToLine(ms, stepNo.getAttribute('data-line')));
    return;
  }

  // Back to the findings list (close the open detail).
  if (e.target.closest('.panel-back')) {
    var mb = e.target.closest('.codemap');
    if (mb) showFindingList(mb);
    return;
  }

  // A row in the findings inventory: open its detail.
  var fr = e.target.closest('.finding-row');
  if (fr) {
    var mr = fr.closest('.codemap');
    var fid = fr.getAttribute('data-finding');
    if (mr && fid) selectFindings(mr, [fid]);
    return;
  }

  // Same-file "jump to line" link inside a path/defense row.
  var goLine = e.target.closest('.goto-line');
  if (goLine) {
    var mg = goLine.closest('.codemap');
    var gl = goLine.getAttribute('data-line');
    if (mg && gl) flashLine(scrollMapToLine(mg, gl));
    e.preventDefault();
    return;
  }

  // Cross-reference link ("same code — N more"): select that finding.
  var xref = e.target.closest('.xref');
  if (xref) {
    var map0 = xref.closest('.codemap');
    var xid = xref.getAttribute('data-finding');
    if (map0 && xid) selectFindings(map0, [xid]);
    e.preventDefault();
    return;
  }

  // Click a highlighted chunk: reveal ALL findings mapped to that chunk.
  var spot = e.target.closest('.hit');
  if (spot) {
    var map1 = spot.closest('.codemap');
    selectFindings(map1, (spot.getAttribute('data-findings') || '').split(',').filter(Boolean));
    return;
  }

  // Fallback: click anywhere on a finding row to reveal every finding on it.
  var row = e.target.closest('tr.has-sink');
  if (!row) return;
  var map = row.closest('.codemap');
  if (!map) return;
  var ids = [].slice.call(row.querySelectorAll('.hit')).reduce(function (acc, h) {
    (h.getAttribute('data-findings') || '').split(',').forEach(function (id) {
      if (id && acc.indexOf(id) < 0) acc.push(id);
    });
    return acc;
  }, []);
  selectFindings(map, ids);
});

// On load, restore selection from ?finding= (or a server-marked active finding)
// and honor a #L<line> hash from a cross-file jump.
document.addEventListener('DOMContentLoaded', function () {
  var map = document.querySelector('.codemap');
  if (map) {
    var panel = map.querySelector('.panel');
    var active = panel && panel.querySelector('.finding.active');
    if (active) {
      applyPathOverlay(map, active);
      var hit = findHit(map, active.getAttribute('data-finding'));
      if (hit) { hit.classList.add('sel'); hit.scrollIntoView({ block: 'center' }); }
      else { scrollMapToLine(map, active.getAttribute('data-sink-line')); }
    } else {
      var fid = new URLSearchParams(window.location.search).get('finding');
      if (fid) selectFindings(map, [fid]);
    }
    var hashLine = (window.location.hash || '').match(/^#L(\\d+)$/);
    if (hashLine) flashLine(scrollMapToLine(map, hashLine[1]));
    // Restore a non-default list sort from the URL (SORT-1); default is by score,
    // already applied server-side, so only re-sort when ?lsort= says otherwise.
    var lsort = new URLSearchParams(window.location.search).get('lsort');
    if (lsort) {
      var sfl = map.querySelector('.finding-list');
      if (sfl) sortFindingList(sfl, lsort);
    }
  }

  // OVERVIEW-1: column-visibility toggle. Hiding a column adds a class to the
  // table; the choice is remembered in localStorage so a refresh restores it.
  var colToggle = document.getElementById('col-toggle');
  var ovTable = document.getElementById('overview-table');
  if (colToggle && ovTable) {
    var COLS_KEY = 'tsxdf.overviewHiddenCols';
    var hidden = {};
    try { hidden = JSON.parse(localStorage.getItem(COLS_KEY) || '{}') || {}; }
    catch (e) { hidden = {}; }
    var boxes = colToggle.querySelectorAll('input[data-col]');
    var applyCols = function () {
      boxes.forEach(function (box) {
        ovTable.classList.toggle('hide-' + box.getAttribute('data-col'), !box.checked);
      });
    };
    boxes.forEach(function (box) {
      var col = box.getAttribute('data-col');
      if (hidden[col]) box.checked = false;
      box.addEventListener('change', function () {
        hidden[col] = !box.checked;
        try { localStorage.setItem(COLS_KEY, JSON.stringify(hidden)); } catch (e) {}
        applyCols();
      });
    });
    applyCols();
  }
});
`;

export function page({ title, body, nav, wide = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="layout">
${nav ? `<nav class="side">${nav}</nav>` : ""}
<main${wide ? ' class="wide"' : ""}>${body}</main>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}

export { escapeHtml };
