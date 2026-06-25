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
.pager { display: flex; align-items: center; gap: 10px; margin: 12px 0 24px; }
.btn.disabled { opacity: 0.45; pointer-events: none; }

/* Code map. NOTE: no overflow on .codemap — any non-visible overflow on an
   ancestor silently disables position:sticky on the panel. align-items:start
   keeps the panel from stretching to the (tall) source height so sticky pins it. */
/* Code lines are short, so cap the source column (~800px) and let the detail
   panel absorb the rest — it packs path/reach/defense lists and benefits from
   the room. On narrow screens the source shrinks while the panel keeps a floor. */
.codemap { display: grid; grid-template-columns: minmax(0, 800px) minmax(360px, 1fr); gap: 0; border: 1px solid var(--border); border-radius: 8px; align-items: start; }
.codemap .src { overflow-x: auto; background: var(--code-bg); margin: 0; border-radius: 8px 0 0 8px; }
.codemap table.code { border: 0; margin: 0; width: 100%; display: table; font-size: 12.5px; }
.codemap table.code td { border: 0; padding: 0 8px; white-space: pre; }
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
.codemap .hit.sel { outline: 2px solid var(--accent); outline-offset: -1px; }
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
.codemap .panel .finding { display: none; }
.codemap .panel .finding.active { display: block; }
.codemap .panel h4 { margin: 0 0 2px; }
.codemap .panel .meta { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
.codemap .panel dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 8px 0; }
.codemap .panel dt { color: var(--muted); }
.codemap .panel .why { margin: 6px 0; padding-left: 18px; }
.codemap .panel ul.burden-breakdown { list-style: none; margin: 6px 0; padding: 0; }
.codemap .panel ul.burden-breakdown li {
  display: grid; grid-template-columns: 130px 1fr auto;
  align-items: center; gap: 8px; margin: 3px 0; font-size: 12px;
}
.codemap .panel .bd-label { color: var(--muted); }
.codemap .panel .bd-bar {
  height: 8px; border-radius: 4px; background: var(--border, #ddd); overflow: hidden;
}
.codemap .panel .bd-fill {
  display: block; height: 100%; border-radius: 4px;
  background: hsl(18 80% 55%);
}
.codemap .panel .bd-val { color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; }
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
.codemap .panel table.path-table { width: 100%; margin: 6px 0; font-size: 12px; table-layout: fixed; }
.codemap .panel table.path-table th,
.codemap .panel table.path-table td { padding: 4px 6px; vertical-align: top; }
.codemap .panel table.path-table th:first-child,
.codemap .panel table.path-table td.step-no { width: 28px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.codemap .panel table.path-table th:nth-child(2) { width: 70px; }
.codemap .panel table.path-table th:nth-child(3) { width: 150px; }
.codemap .panel .path-loc { overflow-wrap: anywhere; }
.codemap .panel table.path-table code { white-space: normal; overflow-wrap: anywhere; }
.codemap .panel .path-scroll { max-height: 360px; overflow: auto; border-top: 1px solid var(--border); }
.codemap .panel ul.reach ul { margin: 2px 0; padding-left: 16px; list-style: none; }
.codemap .panel ul.reach ul li { color: var(--muted); }
.codemap .panel .k {
  display: inline-block; min-width: 64px; font-size: 11px; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.03em;
}
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

  // Activate a set of finding ids in the panel: reveal every matching block
  // (multiple can show at once), scroll the first into view.
  function activate(map, ids) {
    var panel = map.querySelector('.panel');
    if (!panel) return;
    panel.querySelectorAll('.finding').forEach(function (f) { f.classList.remove('active'); });
    var empty = panel.querySelector('.empty');
    if (empty) empty.style.display = 'none';
    var first = null;
    ids.forEach(function (id) {
      var target = panel.querySelector('.finding[data-finding="' + id + '"]');
      if (target) { target.classList.add('active'); if (!first) first = target; }
    });
    if (first) first.scrollIntoView({ block: 'nearest' });
  }

  // Cross-reference link inside a panel ("same code — N more"): select that
  // finding and scroll its source line into view.
  var xref = e.target.closest('.xref');
  if (xref) {
    var map0 = xref.closest('.codemap');
    var xid = xref.getAttribute('data-finding');
    if (map0 && xid) {
      activate(map0, [xid]);
      var hit = map0.querySelector('.hit[data-findings~="' + xid + '"]')
        || [].slice.call(map0.querySelectorAll('.hit')).find(function (h) {
             return (h.getAttribute('data-findings') || '').split(',').indexOf(xid) >= 0;
           });
      if (hit) {
        map0.querySelectorAll('.hit.sel').forEach(function (h) { h.classList.remove('sel'); });
        hit.classList.add('sel');
        hit.scrollIntoView({ block: 'center' });
      }
    }
    e.preventDefault();
    return;
  }

  // Click a highlighted chunk: reveal ALL findings mapped to that chunk.
  var spot = e.target.closest('.hit');
  if (spot) {
    var map1 = spot.closest('.codemap');
    map1.querySelectorAll('.hit.sel').forEach(function (h) { h.classList.remove('sel'); });
    spot.classList.add('sel');
    activate(map1, (spot.getAttribute('data-findings') || '').split(',').filter(Boolean));
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
  map.querySelectorAll('.hit.sel').forEach(function (h) { h.classList.remove('sel'); });
  activate(map, ids);
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
