import { escapeHtml } from "../html/escape.mjs";
import { REPORT_VIEWS } from "../core.mjs";
import {
  fanOutGraphSvg,
  fanOutAnchor,
  boundaryGraphSvg,
  boundaryAnchor,
} from "../html/code-map.mjs";
import { viewLabel } from "./view-config.mjs";

// SHELL-5: a reusable custom popover — the on-page replacement for native <select>s
// (INTENT §8). The trigger shows `label: <current>`; the panel is a listbox of
// option links, so picking one navigates and the choice lives in the URL. Open/close,
// outside-click, Escape, and positioning are handled once in page.mjs.
export function popover({ id, label, options, ariaLabel, triggerValue }) {
  const current = options.find((option) => option.active);
  const shown = triggerValue ?? current?.label ?? options[0]?.label ?? "";
  const items = options
    .map(
      (option) =>
        `<a role="option" class="popover-opt${option.active ? " active" : ""}"${
          option.active ? ' aria-selected="true"' : ""
        } href="${escapeHtml(option.href)}">${escapeHtml(option.label)}</a>`,
    )
    .join("");
  return `<div class="popover" data-popover data-popover-id="${escapeHtml(id)}">
  <button type="button" class="popover-trigger" aria-haspopup="listbox" aria-expanded="false" data-popover-trigger>
    <span class="popover-label">${escapeHtml(label)}:</span>
    <span class="popover-value">${escapeHtml(shown)}</span>
    <span class="popover-caret" aria-hidden="true">▾</span>
  </button>
  <div class="popover-panel" role="listbox" aria-label="${escapeHtml(ariaLabel ?? label)}">${items}</div>
</div>`;
}

// ARCH-1: page-level report tab strip — the on-page replacement for opening reports
// from the left sidebar. "Overview" is first; the rest mirror the alphabetized
// report list. The active tab is highlighted; selection is just the URL, so a
// refresh restores it. `activeView` is null on the overview, or the report view id.
export function reportTabs(activeView) {
  const tabs = [
    { view: null, label: "Overview", href: "/" },
    ...REPORT_VIEWS.map((view) => ({
      view,
      label: viewLabel(view),
      href: `/report?view=${encodeURIComponent(view)}`,
    })).sort((a, b) => a.label.localeCompare(b.label)),
  ];
  return `<nav class="report-tabs" aria-label="Report sections">${tabs
    .map((tab) => {
      const on = tab.view === activeView;
      return `<a class="report-tab${on ? " active" : ""}"${
        on ? ' aria-current="page"' : ""
      } href="${escapeHtml(tab.href)}">${escapeHtml(tab.label)}</a>`;
    })
    .join("")}</nav>`;
}

// FANOUT-SORT-1: only sort keys already on the entry — no new analysis. The active
// key's value is shown on each tab so the order is never a mystery (INTENT §6).
const FANOUT_SORTS = [
  { key: "spread", label: "spread", get: (f) => f.sinkCount, dir: -1 },
  { key: "depth", label: "depth", get: (f) => f.maxDepth, dir: -1 },
  { key: "files", label: "files", get: (f) => f.fileCount, dir: -1 },
  { key: "name", label: "name", get: (f) => f.root, dir: 1 },
];
const FANOUT_TAB_LIMIT = 5;

function sortFanOuts(fanOuts, sortKey) {
  const sort = FANOUT_SORTS.find((s) => s.key === sortKey) ?? FANOUT_SORTS[0];
  const sorted = [...fanOuts].sort((a, b) => {
    const av = sort.get(a);
    const bv = sort.get(b);
    if (typeof av === "string") return sort.dir * av.localeCompare(bv);
    return sort.dir * (av - bv) || b.sinkCount - a.sinkCount;
  });
  return { sorted, sort };
}

// FANOUT-LIST-1 (+ COUNT-1, COPY-1, SORT-1): the on-page fan-out "network view". A
// tab strip of the heaviest sources + a dropdown holding the rest selects ONE
// source; only that source's graph renders. Every detected fan-out is reachable
// (the dropdown answers "what are the other N?"), the sort key + value are visible
// and controllable, and a single-file vs cross-file tag explains the kind. Selection
// and sort live in the URL via `hrefFor`.
export function fanOutViewer(fanOuts, { selected, sortKey, hrefFor }) {
  if (!fanOuts.length)
    return `<p class="meta">No shared source fans out to ≥2 render sinks.</p>`;
  const { sorted, sort } = sortFanOuts(fanOuts, sortKey);
  const active =
    sorted.find((f) => fanOutAnchor(f.root) === selected) ?? sorted[0];
  const tabsList = sorted.slice(0, FANOUT_TAB_LIMIT);
  const rest = sorted.slice(FANOUT_TAB_LIMIT);
  const valueOf = (f) =>
    sort.key === "name" ? `${f.fileCount}f` : String(sort.get(f));
  const tabs = tabsList
    .map((f) => {
      const on = f === active;
      return `<a class="fo-tab${on ? " active" : ""}"${
        on ? ' aria-current="true"' : ""
      } href="${escapeHtml(hrefFor({ fanout: fanOutAnchor(f.root) }))}">${escapeHtml(
        f.root,
      )} <span class="fo-tab-val">${escapeHtml(valueOf(f))}</span></a>`;
    })
    .join("");
  const dropdown = rest.length
    ? popover({
        id: "fanout-src",
        label: "More",
        ariaLabel: "Other fan-out sources",
        triggerValue: rest.includes(active)
          ? undefined
          : `+${rest.length} more…`,
        options: rest.map((f) => ({
          label: `${f.root} · ${f.sinkCount} sinks · depth ${f.maxDepth}`,
          href: hrefFor({ fanout: fanOutAnchor(f.root) }),
          active: f === active,
        })),
      })
    : "";
  // SORT-1: name what the control orders — the *source picker* (which fan-out is
  // shown first), not the sinks inside the rendered graph (which are depth-ordered).
  const sortControl = `<span class="fo-sort" title="Orders the source picker (the tabs + list), not the sinks inside the graph."><span class="meta">Sort sources:</span> ${FANOUT_SORTS.map(
    (s) =>
      `<a class="fo-sort-btn${s.key === sort.key ? " active" : ""}" href="${escapeHtml(
        hrefFor({ fosort: s.key, fanout: fanOutAnchor(active.root) }),
      )}">${escapeHtml(s.label)}</a>`,
  ).join("")}</span>`;
  const tag =
    active.fileCount === 1
      ? `<span class="fo-tag fo-tag-single" title="One source consumed many times within a single file — usually a prop-drilling pattern that wants to be split.">single-file · candidate split</span>`
      : `<span class="fo-tag fo-tag-cross" title="One source consumed across many files — real cross-file usage; centralizing it touches them all.">${active.fileCount} files · cross-file usage</span>`;
  const defLine = active.def
    ? ` · defined at <a class="xfile" href="/file?path=${encodeURIComponent(
        active.def.file,
      )}#L${active.def.line}">${escapeHtml(active.def.file)}:${active.def.line}</a>`
    : "";
  return `<p class="meta fo-explain">A <strong>fan-out</strong> is a single source whose value is consumed by many render sinks; changing it touches every one. Pick a source to see where it spreads — the source node links to its definition, each sink to its file.</p>
<div class="fo-controls">
  <div class="fo-tabs">${tabs}${dropdown}</div>
  ${sortControl}
</div>
<section class="fanout-entry" id="${fanOutAnchor(active.root)}">
  <h3>${escapeHtml(active.root)} ${tag} <span class="meta">· ${
    active.sinkCount
  } sinks · max depth ${active.maxDepth}${defLine}</span></h3>
  ${fanOutGraphSvg(active, null)}
</section>`;
}

const BOUNDARY_TAB_LIMIT = 5;

// VIZ-1: the boundary viewer — the two-sided-diagram analogue of the fan-out viewer
// and the template for fan-in/junctions/prop-relay. A tab strip of the heaviest-debt
// boundaries + a popover for the rest selects ONE helper (selection in the URL via
// `?boundary=`), and only that helper's sources → boundary → callers diagram renders.
export function boundaryViewer(helpers, { selected, hrefFor }) {
  if (!helpers.length)
    return `<p class="meta">No first-party helper functions were reached on a render path. (Imported library calls stay opaque; try --max-helper-depth.)</p>`;
  const active =
    helpers.find((h) => boundaryAnchor(h) === selected) ?? helpers[0];
  const tabsList = helpers.slice(0, BOUNDARY_TAB_LIMIT);
  const rest = helpers.slice(BOUNDARY_TAB_LIMIT);
  const tabs = tabsList
    .map((h) => {
      const on = h === active;
      return `<a class="fo-tab${on ? " active" : ""}"${
        on ? ' aria-current="true"' : ""
      } href="${escapeHtml(hrefFor({ boundary: boundaryAnchor(h) }))}">${escapeHtml(
        h.name,
      )} <span class="fo-tab-val">${escapeHtml(h.verdict ?? "")}</span></a>`;
    })
    .join("");
  const dropdown = rest.length
    ? popover({
        id: "boundary-src",
        label: "More",
        ariaLabel: "Other boundaries",
        triggerValue: rest.includes(active)
          ? undefined
          : `+${rest.length} more…`,
        options: rest.map((h) => ({
          label: `${h.name} · ${h.callerCount} caller(s) · ${h.verdict}`,
          href: hrefFor({ boundary: boundaryAnchor(h) }),
          active: h === active,
        })),
      })
    : "";
  return `<p class="meta fo-explain">A <strong>boundary</strong> is a first-party function on a render path. The diagram shows its inbound source lineages on the left, the function in the middle (click to jump to its definition), and the call sites it re-spreads to on the right — pick one to inspect where it sits between sources and consumers.</p>
<div class="fo-controls">
  <div class="fo-tabs">${tabs}${dropdown}</div>
</div>
<section class="fanout-entry" id="${boundaryAnchor(active)}">
  <h3>${escapeHtml(active.name)}() <span class="fo-tag fo-tag-cross">${escapeHtml(
    active.verdict,
  )}</span> <span class="meta">· ${active.inSources} inbound source(s) · ${
    active.callerCount
  } caller(s) · defined at <a class="xfile" href="/file?path=${encodeURIComponent(
    active.file,
  )}#L${active.line}">${escapeHtml(active.file)}:${active.line}</a></span></h3>
  ${boundaryGraphSvg(active)}
</section>`;
}
