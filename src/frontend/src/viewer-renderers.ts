import type { AnalysisReport } from "../../types";
import { boundaryAnchor, boundaryGraphSvg, fanOutAnchor, fanOutGraphSvg } from "../../html/code-map-graphs";
import {
  escapeAttr,
  escapeHtml,
  fanInEntries,
  fanOutEntriesGlobal,
  propRelayEntries,
  relationshipGraphSvg,
  sortFanOutEntries,
} from "./viewer-data";
import type { FanOutEntry } from "./viewer-data";

type Report = AnalysisReport;

interface PickerItem {
  key: string;
  href: string;
  label: string;
  value: string;
  optionLabel: string;
  active: boolean;
}

export function renderFanOutViewer(report: Report | undefined, location: URL): string {
  const entries = sortFanOutEntries(
    fanOutEntriesGlobal(report?.sinks ?? []),
    location.searchParams.get("fosort") ?? "spread",
  );
  if (!entries.length) {
    return '<p class="meta">No shared source fans out to >=2 render sinks.</p>';
  }
  const selected = location.searchParams.get("fanout");
  const active =
    entries.find((entry) => fanOutAnchor(entry.root) === selected) ??
    entries[0];
  const hrefFor = (changes: Record<string, string>) => {
    const params = new URLSearchParams(location.searchParams);
    params.set("view", "fan-out");
    for (const [key, value] of Object.entries(changes)) params.set(key, value);
    return `/report?${params.toString()}`;
  };
  const sortKey = location.searchParams.get("fosort") ?? "spread";
  const tabs = renderPickerTabs(
    entries.map((entry) => ({
      key: fanOutAnchor(entry.root),
      href: hrefFor({ fanout: fanOutAnchor(entry.root) }),
      label: entry.root,
      value: String(fanOutValue(entry, sortKey)),
      optionLabel: `${entry.root} · ${entry.sinkCount} sinks · depth ${entry.maxDepth} · ${entry.fileCount} file(s)`,
      active: entry === active,
    })),
    { id: "fanout-src", ariaLabel: "Other fan-out sources" },
  );
  const sortLinks = [
    ["spread", "spread"],
    ["depth", "depth"],
    ["files", "files"],
    ["name", "name"],
  ]
    .map(
      ([key, label]) =>
        `<a class="fo-sort-btn${key === sortKey ? " active" : ""}" href="${escapeAttr(
          hrefFor({ fosort: key, fanout: fanOutAnchor(active.root) }),
        )}">${label}</a>`,
    )
    .join("");
  const tag =
    active.fileCount === 1
      ? '<span class="fo-tag fo-tag-single">single-file · candidate split</span>'
      : `<span class="fo-tag fo-tag-cross">${active.fileCount} files · cross-file usage</span>`;
  const defLine = active.def
    ? ` · defined at <a class="xfile" href="/file?path=${encodeURIComponent(
        active.def.file,
      )}#L${active.def.line}">${escapeHtml(active.def.file)}:${active.def.line}</a>`
    : "";
  return `<p class="meta fo-explain">A <strong>fan-out</strong> is a single source whose value is consumed by many render sinks; changing it touches every one. Pick a source to see where it spreads.</p>
<div class="fo-controls"><div class="fo-tabs">${tabs}</div><span class="fo-sort"><span class="meta">Sort sources:</span> ${sortLinks}</span></div>
<section class="fanout-entry" id="${fanOutAnchor(active.root)}">
  <h3>${escapeHtml(active.root)} ${tag} <span class="meta">· ${active.sinkCount} sinks · max depth ${active.maxDepth}${defLine}</span></h3>
  ${fanOutGraphSvg(active, null)}
</section>`;
}

export function renderBoundaryViewer(
  report: Report | undefined,
  location: URL,
): string {
  const helpers = report?.helpers ?? [];
  if (!helpers.length) {
    return '<p class="meta">No first-party helper functions were reached on a render path. (Imported library calls stay opaque; try --max-helper-depth.)</p>';
  }
  const selected = location.searchParams.get("boundary");
  const active =
    helpers.find((helper) => boundaryAnchor(helper) === selected) ?? helpers[0];
  const hrefFor = (changes: Record<string, string>) => {
    const params = new URLSearchParams(location.searchParams);
    params.set("view", "boundary-report");
    for (const [key, value] of Object.entries(changes)) params.set(key, value);
    return `/report?${params.toString()}`;
  };
  const tabs = renderPickerTabs(
    helpers.map((helper) => ({
      key: boundaryAnchor(helper),
      href: hrefFor({ boundary: boundaryAnchor(helper) }),
      label: helper.name,
      value: helper.verdict ?? "",
      optionLabel: `${helper.name} · ${helper.callerCount ?? 0} caller(s) · ${helper.verdict ?? "boundary"}`,
      active: helper === active,
    })),
    { id: "boundary-src", ariaLabel: "Other boundaries" },
  );
  const definedAt = `${active.file}:${active.line}`;
  return `<p class="meta fo-explain">A <strong>boundary</strong> is a first-party function on a render path. The diagram shows inbound source lineages on the left, the function in the middle, and the call sites it re-spreads to on the right.</p>
<div class="fo-controls"><div class="fo-tabs">${tabs}</div></div>
<section class="fanout-entry" id="${boundaryAnchor(active)}">
  <h3>${escapeHtml(active.name)}() <span class="fo-tag fo-tag-cross">${escapeHtml(
    active.verdict ?? "boundary",
  )}</span> <span class="meta">· ${active.inSources ?? 0} inbound source(s) · ${
    active.callerCount ?? 0
  } caller(s) · defined at <a class="xfile" href="/file?path=${encodeURIComponent(
    active.file,
  )}#L${active.line}">${escapeHtml(definedAt)}</a></span></h3>
  ${boundaryGraphSvg(active)}
</section>`;
}

export function renderFanInViewer(report: Report | undefined, location: URL): string {
  const entries = fanInEntries(report?.sinks ?? []);
  if (!entries.length) {
    return '<p class="meta">No render sink has multiple traced root sources.</p>';
  }
  const selected = location.searchParams.get("fanin");
  const active = entries.find((entry) => entry.key === selected) ?? entries[0];
  const hrefFor = (key: string) => {
    const params = new URLSearchParams(location.searchParams);
    params.set("view", "fan-in");
    params.set("fanin", key);
    return `/report?${params.toString()}`;
  };
  const tabs = renderPickerTabs(
    entries.map((entry) => ({
      key: entry.key,
      href: hrefFor(entry.key),
      label: entry.label,
      value: String(entry.rootCount),
      optionLabel: `${entry.label} · ${entry.rootCount} roots · depth ${entry.depth}`,
      active: entry === active,
    })),
    { id: "fanin-src", ariaLabel: "Other fan-in sinks" },
  );
  return `<p class="meta fo-explain">A <strong>fan-in</strong> is one render sink fed by many source lineages. Pick a sink to see the inputs converging into it.</p>
<div class="fo-controls"><div class="fo-tabs">${tabs}</div></div>
<section class="fanout-entry" id="${escapeAttr(active.key)}">
  <h3>${escapeHtml(active.label)} <span class="fo-tag fo-tag-cross">${active.rootCount} roots</span> <span class="meta">· max depth ${active.depth} · predicates ${active.predicates}</span></h3>
  ${relationshipGraphSvg({
    ariaLabel: `Fan-in graph for ${active.label}`,
    leftTitle: `root sources (${active.roots.length})`,
    left: active.roots,
    middleLabel: active.label,
    middleSub: `depth ${active.depth}`,
    middleHref: active.file
      ? `/file?path=${encodeURIComponent(active.file)}#L${active.line}`
      : null,
    rightTitle: "render sink",
    right: [
      {
        label: `${active.file}:${active.line}`,
        file: active.file,
        line: active.line,
      },
    ],
  })}
</section>`;
}

export function renderJunctionViewer(
  report: Report | undefined,
  location: URL,
): string {
  const entries = (report?.helpers ?? [])
    .filter(
      (helper) =>
        (helper.inSources ?? 0) >= 3 && (helper.callerCount ?? 0) >= 2,
    )
    .sort(
      (left, right) =>
        (right.inSources ?? 0) * Math.max(1, right.callerCount ?? 0) -
        (left.inSources ?? 0) * Math.max(1, left.callerCount ?? 0),
    );
  if (!entries.length) {
    return '<p class="meta">No junction helpers merge >=3 source lineages and re-spread to >=2 callers.</p>';
  }
  const selected = location.searchParams.get("junction");
  const active =
    entries.find((helper) => boundaryAnchor(helper) === selected) ?? entries[0];
  const hrefFor = (key: string) => {
    const params = new URLSearchParams(location.searchParams);
    params.set("view", "junctions");
    params.set("junction", key);
    return `/report?${params.toString()}`;
  };
  const tabs = renderPickerTabs(
    entries.map((helper) => ({
      key: boundaryAnchor(helper),
      href: hrefFor(boundaryAnchor(helper)),
      label: helper.name,
      value: `${helper.inSources ?? 0}×${helper.callerCount ?? 0}`,
      optionLabel: `${helper.name} · ${helper.inSources ?? 0} in · ${helper.callerCount ?? 0} out`,
      active: helper === active,
    })),
    { id: "junction-src", ariaLabel: "Other junctions" },
  );
  return `<p class="meta fo-explain">A <strong>junction</strong> is a helper where independent source lineages converge and then re-spread to multiple callers.</p>
<div class="fo-controls"><div class="fo-tabs">${tabs}</div></div>
<section class="fanout-entry" id="${boundaryAnchor(active)}">
  <h3>${escapeHtml(active.name)}() <span class="fo-tag fo-tag-cross">junction</span> <span class="meta">· ${active.inSources ?? 0} in · ${active.callerCount ?? 0} out</span></h3>
  ${boundaryGraphSvg(active)}
</section>`;
}

export function renderPropRelayViewer(
  report: Report | undefined,
  location: URL,
): string {
  const entries = propRelayEntries(report?.sinks ?? []);
  if (!entries.length) {
    return '<p class="meta">No sinks show prop-relay style wrapper steps.</p>';
  }
  const selected = location.searchParams.get("relay");
  const active = entries.find((entry) => entry.key === selected) ?? entries[0];
  const hrefFor = (key: string) => {
    const params = new URLSearchParams(location.searchParams);
    params.set("view", "prop-relay");
    params.set("relay", key);
    return `/report?${params.toString()}`;
  };
  const tabs = renderPickerTabs(
    entries.map((entry) => ({
      key: entry.key,
      href: hrefFor(entry.key),
      label: entry.label,
      value: String(entry.wrapperSteps),
      optionLabel: `${entry.label} · ${entry.wrapperSteps} wrapper steps · ${entry.boundaries} boundaries`,
      active: entry === active,
    })),
    { id: "relay-src", ariaLabel: "Other prop relays" },
  );
  return `<p class="meta fo-explain">A <strong>prop relay</strong> is a value carried through component boundaries or wrapper steps before it renders.</p>
<div class="fo-controls"><div class="fo-tabs">${tabs}</div></div>
<section class="fanout-entry" id="${escapeAttr(active.key)}">
  <h3>${escapeHtml(active.label)} <span class="fo-tag fo-tag-cross">${active.wrapperSteps} wrapper step(s)</span> <span class="meta">· ${active.boundaries} component boundary step(s)</span></h3>
  ${relationshipGraphSvg({
    ariaLabel: `Prop relay graph for ${active.label}`,
    leftTitle: `source lineages (${active.roots.length})`,
    left: active.roots,
    middleLabel: `${active.wrapperSteps} wrapper step(s)`,
    middleSub: `${active.boundaries} boundary step(s)`,
    middleHref: null,
    rightTitle: "render sink",
    right: [
      {
        label: `${active.file}:${active.line}`,
        file: active.file,
        line: active.line,
      },
    ],
  })}
</section>`;
}

function renderPickerTabs(
  items: PickerItem[],
  options: { id: string; ariaLabel: string; limit?: number },
): string {
  const limit = options.limit ?? 8;
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const tabs = shown.map((item) => renderPickerTab(item)).join("");
  const dropdown = rest.length
    ? renderOverflowPicker(rest, options.id, options.ariaLabel)
    : "";
  return `${tabs}${dropdown}`;
}

function renderPickerTab(item: PickerItem): string {
  return `<a class="fo-tab${item.active ? " active" : ""}"${
    item.active ? ' aria-current="true"' : ""
  } href="${escapeAttr(item.href)}">${escapeHtml(item.label)} <span class="fo-tab-val">${escapeHtml(
    item.value,
  )}</span></a>`;
}

function renderOverflowPicker(
  items: PickerItem[],
  id: string,
  ariaLabel: string,
): string {
  const active = items.find((item) => item.active);
  const label = active?.label ?? `+${items.length} more`;
  const options = items
    .map(
      (item) =>
        `<a role="option" class="popover-opt${item.active ? " active" : ""}"${
          item.active ? ' aria-selected="true"' : ""
        } href="${escapeAttr(item.href)}">${escapeHtml(item.optionLabel)}</a>`,
    )
    .join("");
  return `<div class="popover" data-popover data-popover-id="${escapeAttr(id)}">
  <button type="button" class="fo-tab popover-trigger${active ? " active" : ""}" data-popover-trigger aria-haspopup="listbox" aria-expanded="false">
    ${escapeHtml(label)} <span class="fo-tab-val">▾</span>
  </button>
  <div class="popover-panel" role="listbox" aria-label="${escapeAttr(ariaLabel)}">${options}</div>
</div>`;
}

function fanOutValue(entry: FanOutEntry, sortKey: string): string {
  if (sortKey === "depth") return String(entry.maxDepth);
  if (sortKey === "files") return `${entry.fileCount}f`;
  if (sortKey === "name") return `${entry.sinkCount}`;
  return String(entry.sinkCount);
}
