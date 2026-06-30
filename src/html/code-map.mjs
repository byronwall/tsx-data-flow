// The annotated code map: render one source file as line-numbered code with the
// render sinks that land in it overlaid in the gutter, plus a commentary panel
// describing each finding. This is the one HTML view the Markdown reports cannot
// express — it ties the analyzer's findings back to the literal source lines.
import { escapeHtml } from "./escape.mjs";
import { pathStepsAttr } from "./code-map-paths.mjs";
export {
  boundaryAnchor,
  boundaryGraphSvg,
  fanOutAnchor,
  fanOutGraphSvg,
} from "./code-map-graphs.mjs";
import { fanOutAnchor } from "./code-map-graphs.mjs";
import { findingPanel } from "./code-map-finding-panel.mjs";
import {
  ENTRY_TYPES,
  entryRowHtml,
  fanOutPanel,
  fileStatsHtml,
  forkPanel,
  helperSeverity,
  junctionPanel,
  relayPanel,
  unknownEdgePanel,
} from "./code-map-entry-panels.mjs";
import {
  burdenHue,
  dominantSink,
  renderCodeLine,
  renderCommentLine,
  spanPart,
  touchedLines,
} from "./code-map-source-lines.mjs";

export function renderCodeMap({
  relPath,
  source,
  sinks,
  meta,
  resolveSource,
  selectedFinding = null,
  forks = [],
  helpers = [],
  unknownEdges = [],
  relays = [],
  fanOut = [],
}) {
  const lines = source.split("\n");

  // line number -> sinks whose highlighted span touches that line.
  const byLine = new Map();
  for (const sink of sinks) {
    for (const lineNo of touchedLines(sink, lines.length)) {
      if (!byLine.has(lineNo)) byLine.set(lineNo, []);
      byLine.get(lineNo).push(sink);
    }
  }

  // Group sinks by identical rendered expression, so each finding panel can list
  // the other places the same code recurs.
  const byExpr = new Map();
  for (const sink of sinks) {
    const key = (sink.expression ?? "").trim();
    if (!key) continue;
    if (!byExpr.has(key)) byExpr.set(key, []);
    byExpr.get(key).push(sink);
  }

  // lines this file contributes to any representative path (the trace threading
  // through the file, not just the sink endpoints).
  const pathLines = new Set();
  for (const sink of sinks) {
    for (const step of sink.representativeSteps ?? []) {
      if (step.file === relPath && step.line) pathLines.add(step.line);
    }
  }

  // Carries open block-comment state across lines for comment dimming (COMMENT-1).
  const commentState = { inBlock: false };
  const rows = lines.map((text, index) => {
    const lineNo = index + 1;
    const lineSinks = byLine.get(lineNo);
    const onPath = pathLines.has(lineNo);
    let gutter = "";
    let cls = [];
    let style = "";
    // Always scan to advance comment state; use the dimmed render unless the line
    // carries findings (then the burden-tinted hit spans take precedence).
    let code = renderCommentLine(text, commentState);
    if (lineSinks && lineSinks.length) {
      const worst = dominantSink(lineSinks);
      const burden = worst.scores?.burden ?? 0;
      const parts = new Set(lineSinks.map((sink) => spanPart(sink, lineNo)));
      const title =
        lineSinks.length > 1
          ? `${lineSinks.length} findings on this line (burden ${burden.toFixed(2)})`
          : `${worst.id} · burden ${burden.toFixed(2)}`;
      // The gutter dot + line-number border tint by the line's worst burden for
      // scanning; the per-chunk hit spans carry the precise, clickable mapping.
      gutter = `<span class="dot heat span-dot" title="${escapeHtml(title)}"></span>`;
      cls.push("has-sink", "heat");
      for (const part of parts) cls.push(`span-${part}`);
      style = ` style="--bt:${burdenHue(burden)}"`;
      code = renderCodeLine(text, lineNo, lineSinks);
    }
    if (onPath) cls.push("on-path");
    return `<tr class="${cls.join(" ")}"${style} data-line="${lineNo}">
<td class="ln">${lineNo}</td><td class="gutter">${gutter}</td><td class="code">${code}</td></tr>`;
  });

  // Panel: a UNIFIED INVENTORY (default) of everything the analyzer found in this
  // file — findings, repeated forks, junctions, and trivial usages — each opening
  // into a detail block in the same panel and overlaying the source (ARCH-1).
  // Nothing is force-opened; selecting an entry (or loading ?finding=<id>) opens
  // it, and closing returns to the list.
  const seen = new Set();
  const uniqueSinks = [];
  for (const sink of sinks) {
    if (seen.has(sink.id)) continue;
    seen.add(sink.id);
    uniqueSinks.push(sink);
  }

  // ARCH-2: promote EVERY reached helper on this file — not just the strict
  // junctions (≥3 in-sources, ≥2 callers) — and color by severity so the user can
  // tell the load-bearing knots from the helpers that merely exist. This is the
  // report info the user wanted promoted, and on a sink-less .ts file it is the
  // only content here (TS-1). The verdict (classifyBoundary) drives both the
  // type (junction vs boundary) and whether it reads as a problem.
  const entries = [];
  for (const sink of uniqueSinks) {
    const type = sink.tier === "usage" ? "usage" : "finding";
    const burden = sink.scores?.burden ?? 0;
    const ctx = sink.renderContext ?? {};
    entries.push({
      id: sink.id,
      type,
      line: sink.line,
      sortLine: sink.line ?? 0,
      score: burden,
      sortSources: sink.metrics?.mergeWidth ?? 0,
      row: {
        id: sink.id,
        type,
        line: sink.line,
        primary: sink.expression ?? sink.label ?? "",
        secondary: [ctx.tag, ctx.attribute].filter(Boolean).join("/"),
        metric: burden.toFixed(2),
        hue: burdenHue(burden),
        sources: sink.metrics?.mergeWidth ?? 0,
        hasDefenses: (sink.defenses ?? []).length > 0,
      },
      panelHtml: findingPanel(
        sink,
        source,
        byExpr.get((sink.expression ?? "").trim()),
        relPath,
        meta,
        resolveSource,
      ),
    });
  }
  for (const fork of forks ?? []) {
    entries.push({
      id: fork.id,
      type: "fork",
      line: fork.line,
      sortLine: fork.line ?? 0,
      // Repeated forks are real smells; rank them among the heavier findings.
      score: 0.6,
      row: {
        id: fork.id,
        type: "fork",
        line: fork.line,
        primary: fork.discriminant ?? "fork",
        secondary: `${fork.siteCount ?? (fork.sites ?? []).length} sites`,
        metric: fork.confidence ?? "",
        hue: 28,
      },
      panelHtml: forkPanel(fork),
    });
  }
  const seenHelperIds = new Set();
  (helpers ?? []).forEach((helper, index) => {
    const sev = helperSeverity(helper);
    const id = `${sev.type === "junction" ? "JCT" : "BND"}-${helper.line ?? index}`;
    const uid = seenHelperIds.has(id) ? `${id}-${index}` : id;
    seenHelperIds.add(uid);
    entries.push({
      id: uid,
      type: sev.type,
      line: helper.line,
      sortLine: helper.line ?? 0,
      score: sev.score,
      row: {
        id: uid,
        type: sev.type,
        line: helper.line,
        primary: helper.name ?? "(helper)",
        secondary:
          helper.verdict ??
          `${helper.inSources ?? 0}→${helper.callerCount ?? 0}`,
        metric: "",
        hue: sev.hue,
      },
      panelHtml: junctionPanel(helper, uid, sev.type),
    });
  });

  // ARCH-2: promote the remaining report types into the same list. Each carries
  // its own per-file {line} and a severity proxy derived from its counts, mirroring
  // the helper pattern above. Unknown edges (unresolved flow), context relays
  // (prop bundles), and fan-out (shared sources).
  (unknownEdges ?? []).forEach((row, index) => {
    const id = `UNK-${row.line ?? index}-${index}`;
    entries.push({
      id,
      type: "unknown",
      line: row.line,
      sortLine: row.line ?? 0,
      score: Math.min(0.4, 0.15 + (row.occurrences ?? 1) * 0.03),
      row: {
        id,
        type: "unknown",
        line: row.line,
        primary: row.label ?? "(unknown)",
        secondary: row.kind ?? "unknown",
        metric: "",
        hue: 320,
      },
      panelHtml: unknownEdgePanel(row, id, relPath),
    });
  });
  (relays ?? []).forEach((row, index) => {
    const id = `REL-${row.line ?? index}-${index}`;
    entries.push({
      id,
      type: "relay",
      line: row.line,
      sortLine: row.line ?? 0,
      score: Math.min(0.5, 0.1 + (row.score ?? 0) * 0.03),
      row: {
        id,
        type: "relay",
        line: row.line,
        primary: row.childComponent ?? "(relay)",
        secondary: `${(row.props ?? []).length} props`,
        metric: "",
        hue: 175,
      },
      panelHtml: relayPanel(row, id),
    });
  });
  (fanOut ?? []).forEach((row, index) => {
    const id = `FANOUT-${row.line ?? index}-${index}`;
    entries.push({
      id,
      type: "fan-out",
      line: row.line,
      sortLine: row.line ?? 0,
      score: Math.min(0.5, 0.12 + (row.sinkCount ?? 0) * 0.02),
      sortSources: row.sinkCount ?? 0,
      row: {
        id,
        type: "fan-out",
        line: row.line,
        primary: row.root ?? "(source)",
        secondary: `${row.sinkCount ?? 0} sinks`,
        metric: "",
        hue: 205,
        sources: row.sinkCount ?? 0,
      },
      panelHtml: fanOutPanel(row, id),
    });
  });

  // Default order is by SCORE (worst first) — the user wanted to "come in and see
  // the worst ones", not a line-number list (SORT-1). The client can re-sort by
  // type or line; data-sort-* on each row carries the keys.
  entries.sort(
    (a, b) =>
      (b.score ?? 0) - (a.score ?? 0) ||
      (ENTRY_TYPES[a.type]?.order ?? 5) - (ENTRY_TYPES[b.type]?.order ?? 5) ||
      a.sortLine - b.sortLine,
  );

  const selected =
    selectedFinding && entries.some((e) => e.id === selectedFinding)
      ? selectedFinding
      : null;
  const panels = entries.map((e) =>
    e.id === selected
      ? e.panelHtml.replace('class="finding"', 'class="finding active"')
      : e.panelHtml,
  );

  // Type-filter chips, only for types actually present.
  const counts = {};
  for (const e of entries) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const filterTypes = [
    "finding",
    "fork",
    "junction",
    "boundary",
    "relay",
    "fan-out",
    "unknown",
    "usage",
  ].filter((t) => counts[t]);
  // A cross-cutting "defended" facet (ARCH-2 C, the defensive-ledger as a filter):
  // findings that carry one or more guard sites, regardless of their type.
  const defendedCount = entries.filter((e) => e.row?.hasDefenses).length;
  const defendedChip =
    defendedCount > 0
      ? `<button type="button" class="efilter efilter-facet" data-filter="defended" title="Findings with defensive guards (??/?.)">defended ${defendedCount}</button>`
      : "";
  const filterChips =
    entries.length && (filterTypes.length > 1 || defendedChip)
      ? `<div class="entry-filters"><button type="button" class="efilter active" data-filter="all">All ${entries.length}</button>${filterTypes
          .map(
            (t) =>
              `<button type="button" class="efilter" data-filter="${t}">${
                ENTRY_TYPES[t]?.plural ?? `${t}s`
              } ${counts[t]}</button>`,
          )
          .join("")}${defendedChip}</div>`
      : "";

  // Sort control (SORT-1): score (default) / type / line / sources. Rendered as a
  // single segmented button group (HEAD-2) with the label vertically centered
  // against it (HEAD-3). Client re-sorts the list and persists the choice in the
  // URL so a refresh restores it. "sources" sorts by merge width (the fan-in
  // facet, ARCH-2 C) — only offered when some entry carries that metric.
  const hasMergeWidth = entries.some((e) => (e.sortSources ?? 0) > 0);
  const sortButtons = [
    `<button type="button" class="esort active" data-sort="score">score</button>`,
    `<button type="button" class="esort" data-sort="type">type</button>`,
    `<button type="button" class="esort" data-sort="line">line</button>`,
    hasMergeWidth
      ? `<button type="button" class="esort" data-sort="sources" title="Sort by merge width — how many sources fan in (fan-in)">sources</button>`
      : "",
  ].join("");
  const sortControl =
    entries.length > 1
      ? `<div class="entry-sort"><span class="entry-sort-label">Sort</span><div class="seg" role="group" aria-label="Sort findings">${sortButtons}</div></div>`
      : "";

  // HEAD-1: the "All N" filter pill already states the count, so the standalone
  // "N items in this file" line is redundant — only show a count when there are no
  // filter chips (a single-type file, where nothing else carries the total).
  const countLine = filterChips
    ? ""
    : `<strong>${entries.length} item${entries.length === 1 ? "" : "s"} in this file</strong>`;

  // ARCH-2 D: a per-file aggregate line in the header — the hotspots roll-up (worst
  // + total burden) and the path-census (depth percentiles), scoped to this file.
  // These views have no per-row unit, so they belong here, not in the list.
  const statsHtml = fileStatsHtml(sinks);
  const listHtml = entries.length
    ? `<div class="finding-list">
<div class="finding-list-head">
${countLine}
${statsHtml}
<p class="meta">Everything the analyzer found here — findings, repeated forks, junctions, boundaries, sources, relays, fan-out, unknown edges, and plain usages. Click any to inspect it; selecting one highlights its path on the source.</p>
${filterChips}
${sortControl}
</div>
<ol>${entries.map((e) => entryRowHtml(e.row, e.score ?? 0)).join("")}</ol>
</div>`
    : '<p class="empty">Nothing analyzed in this file.</p>';

  const panelClass = selected ? "panel show-detail" : "panel";
  return `<div class="codemap">
  <div class="src"><table class="code"><tbody>${rows.join("")}</tbody></table></div>
  <div class="${panelClass}">
    ${listHtml}
    ${panels.join("\n")}
  </div>
</div>`;
}
