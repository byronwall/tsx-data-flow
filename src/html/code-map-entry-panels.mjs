import { escapeHtml } from "./escape.mjs";
import { fanOutAnchor } from "./code-map-graphs.mjs";

// Type metadata for the unified entry list: badge label + sort priority. Findings
// lead; usages sink to the bottom (they are "proof of use", not smells).
export const ENTRY_TYPES = {
  finding: { label: "finding", plural: "findings", order: 0 },
  fork: { label: "fork", plural: "forks", order: 1 },
  junction: { label: "junction", plural: "junctions", order: 2 },
  boundary: { label: "boundary", plural: "boundaries", order: 3 },
  // ARCH-2: report types promoted into the unified list as their own entries.
  // (source-boundaries removed round-5: the "a source feeds N sinks" signal is
  // already carried by the fan-out entry; a separate source row duplicated it.)
  relay: { label: "relay", plural: "relays", order: 5 },
  "fan-out": { label: "fan-out", plural: "fan-out", order: 6 },
  unknown: { label: "unknown", plural: "unknown edges", order: 7 },
  usage: { label: "usage", plural: "usages", order: 9 },
};

// Classify a reached helper for the unified list (ARCH-2): is it a load-bearing
// junction/leaky boundary (a problem, colored hot) or a helper that merely exists
// (benign, colored cool/muted)? Drives the entry type, hue, and score-sort weight.
export function helperSeverity(helper) {
  const verdict = (helper.verdict ?? "").toLowerCase();
  const isJunctionVerdict =
    verdict.includes("junction") || verdict.includes("confluence");
  const isProblem =
    isJunctionVerdict ||
    verdict.includes("leaky") ||
    verdict.includes("messy") ||
    ((helper.inSources ?? 0) >= 3 && (helper.callerCount ?? 0) >= 2);
  const type = isJunctionVerdict ? "junction" : "boundary";
  // Hot amber for problems so they stand out; calm blue for benign boundaries.
  return {
    type,
    hue: isProblem ? 25 : 205,
    score: isProblem ? 0.5 : 0.12,
  };
}

// One row in the unified inventory. `entry` = {id, type, line, primary, secondary,
// metric, hue}. The whole list (findings, forks, junctions, usages) shares this.
export function entryRowHtml(entry, score = 0) {
  const meta = ENTRY_TYPES[entry.type] ?? { label: entry.type };
  const hue = entry.hue ?? 150;
  const order = ENTRY_TYPES[entry.type]?.order ?? 5;
  return `<li data-type="${entry.type}" data-sort-score="${score.toFixed(
    4,
  )}" data-sort-line="${entry.line ?? 0}" data-sort-order="${order}" data-sort-sources="${
    entry.sources ?? 0
  }" data-has-defenses="${entry.hasDefenses ? 1 : 0}"><button type="button" class="finding-row" data-finding="${escapeHtml(
    entry.id,
  )}" style="--bt:${hue}">
<span class="fr-loc">:${entry.line ?? "?"}</span>
<span class="fr-expr" title="${escapeHtml(entry.primary)}"><span class="type-tag tt-${entry.type}">${escapeHtml(
    meta.label,
  )}</span> ${escapeHtml(entry.primary)}${
    entry.secondary
      ? ` <span class="meta">${escapeHtml(entry.secondary)}</span>`
      : ""
  }</span>
<span class="fr-burden">${escapeHtml(entry.metric ?? "")}</span>
</button></li>`;
}

// A repeated-fork panel: the discriminant, the fork sites (click to jump), the
// branch-exclusive eager computations, and the findings a split would fix. This
// is the worked example the user asked for — a fork shown AS a finding, with all
// its info in the detail panel and its sites overlaid on the source (ARCH-1).
export function forkPanel(fork) {
  const siteLines = (fork.sites ?? []).map((s) => s.line).filter(Boolean);
  const branchLines = [];
  for (const range of fork.branchRanges ?? []) {
    for (let n = range.startLine; n <= range.endLine; n += 1)
      branchLines.push(n);
  }
  const pathLines = [
    ...new Set([fork.line, ...siteLines, ...branchLines]),
  ].filter(Boolean);
  // FORK-1: number the fork sites (1,2,3…) the way path steps are numbered, so
  // the user can refer to "split 1–4" and find them on the source.
  const sites = (fork.sites ?? [])
    .map(
      (s, i) =>
        `<li><span class="site-no">${i + 1}</span> <a class="goto-line" data-line="${s.line}">:${s.line}</a> <span class="k">${escapeHtml(
          s.kind ?? "site",
        )}</span> <code>${escapeHtml(s.snippet ?? s.value ?? "")}</code></li>`,
    )
    .join("");
  // FORK-2: branch-exclusive computations are the eager work done under only one
  // branch — the user wanted these emphasized beyond the generic blue links, so
  // give the list an amber accent (distinct from the blue goto-links elsewhere).
  const exclusive = (fork.branchExclusive ?? [])
    .map(
      (b) =>
        `<li><a class="goto-line" data-line="${b.line}">:${b.line}</a> <code>${escapeHtml(
          b.name ?? "",
        )}</code>${b.branch ? ` <span class="meta">${escapeHtml(b.branch)}</span>` : ""}</li>`,
    )
    .join("");
  const gated = (fork.branchGatedSinks ?? [])
    .map(
      (s) =>
        `<li><a class="xref" data-finding="${escapeHtml(s.id)}">${escapeHtml(
          s.id,
        )}</a> <span class="meta">line ${s.line}</span> <code>${escapeHtml(
          s.label ?? "",
        )}</code></li>`,
    )
    .join("");
  return `<div class="finding" data-finding="${escapeHtml(
    fork.id,
  )}" data-entry-type="fork" data-path-lines="${pathLines.join(",")}" data-sink-line="${
    fork.line ?? ""
  }">
  <button class="panel-back" type="button" title="Back to the list">← Back to list</button>
  <div class="finding-head"><h4>${escapeHtml(
    fork.id,
  )} <span class="badge q-fork">repeated fork</span></h4></div>
  <div class="meta">${escapeHtml(fork.file)}:${fork.line} · ${escapeHtml(
    fork.component ?? "(anonymous render scope)",
  )} · ${escapeHtml(fork.confidence ?? "")} confidence</div>
  <div class="def-jump"><strong>Discriminant</strong> <code>${escapeHtml(
    fork.discriminant ?? "",
  )}</code> over ${(fork.branchValues ?? []).length} branch value(s)${
    fork.namedValues?.length
      ? `: ${escapeHtml(fork.namedValues.join(", "))}`
      : ""
  }</div>
  ${sites ? `<strong>Fork sites — ${fork.siteCount ?? (fork.sites ?? []).length}</strong><ul class="why site-list">${sites}</ul>` : ""}
  ${exclusive ? `<strong>Branch-exclusive computations — ${(fork.branchExclusive ?? []).length}</strong><ul class="why branch-exclusive">${exclusive}</ul>` : ""}
  ${gated ? `<strong>Findings a split would fix — ${(fork.branchGatedSinks ?? []).length}</strong><ul class="why xref-list">${gated}</ul>` : ""}
</div>`;
}

// A junction / boundary panel built from a helper record: the confluence
// function, its verdict, tributaries (inbound lineages) and distributaries
// (callers, click to open). Surfaces the "info down in the report" the user
// wanted promoted into the finding view — and is the ONLY content on sink-less
// .ts files (TS-1).
// ARCH-2 C: fold the inline-preview view into the junction/boundary detail — a
// keep-vs-inline recommendation. Mirrors core's inlineDecision (kept compact;
// the helper is already a row, so this is a detail facet, not a new entry).
function helperInlineHint(helper) {
  if ((helper.inSources ?? 0) >= 3 && (helper.callerCount ?? 0) >= 2)
    return {
      verdict: "Keep & formalize",
      why: "multiple callers + real internal work — make it a typed boundary.",
    };
  if (helper.passThrough && (helper.internalDepth ?? 0) <= 1)
    return {
      verdict: "Inline",
      why: "pure forwarding hop — the indirection adds nothing.",
    };
  if (
    (helper.callerCount ?? 0) <= 2 &&
    (helper.internalDepth ?? 0) <= 2 &&
    !helper.typeLeak
  )
    return {
      verdict: "Inline",
      why: "shallow body, few callers — indirection without consolidation.",
    };
  if (helper.typeLeak)
    return {
      verdict: "Keep (fix boundary)",
      why: "the helper should exist but its type leaks — tighten it.",
    };
  return {
    verdict: "Keep",
    why: "genuine transformation — inlining would relocate the mess, not remove it.",
  };
}

// DRILL-1: a "count → reveal" popover. The count is the trigger; clicking it
// floats the members in a popover (reusing the source-peek portal machinery in
// page.mjs — position:fixed, cloned to a body portal), so seeing what is inside a
// count never shifts the layout. `summary` is the count text; `bodyHtml` the
// popover content. Falls back to plain text when there is nothing to reveal.
function countPeek(summary, bodyHtml) {
  if (!bodyHtml) return escapeHtml(summary);
  return `<span class="peek"><button type="button" class="peek-label">${escapeHtml(
    summary,
  )}</button><span class="peek-pop">${bodyHtml}</span></span>`;
}

// A capped <ul> with a "+N more" tail when the list runs longer than `cap`.
function cappedList(items, cap = 14, cls = "why") {
  if (!(items ?? []).length) return "";
  const shown = items.slice(0, cap).join("");
  const more =
    items.length > cap
      ? `<li class="meta">+${items.length - cap} more</li>`
      : "";
  return `<ul class="${cls}">${shown}${more}</ul>`;
}

export function junctionPanel(helper, id, type) {
  const inline = helperInlineHint(helper);
  const what = type === "boundary" ? "boundary" : "junction";
  const tribLabels = (
    helper.inRoots && helper.inRoots.length
      ? helper.inRoots
      : (helper.params ?? []).map((p) => p.name ?? p)
  ).filter(Boolean);
  const tribItems = tribLabels.map(
    (t) => `<li><code>${escapeHtml(String(t))}</code></li>`,
  );
  const callerItems = (helper.callers ?? []).map(
    (c) =>
      `<li><a class="xfile" href="/file?path=${encodeURIComponent(
        c.file,
      )}#L${c.line}">${escapeHtml(c.file.split("/").pop())}:${c.line} ↗</a></li>`,
  );
  // DRILL-3: gloss the terms inline so the count's meaning is not implied.
  const inSources = helper.inSources ?? 0;
  const named = tribItems.length;
  const tribGloss =
    `<div class="meta peek-gloss"><strong>Tributaries</strong> — independent source ` +
    `lineages flowing into this ${what}.` +
    (named && named < inSources
      ? ` ${named} are named below; the rest are literals or bare parameters.`
      : "") +
    `</div>`;
  const distGloss =
    `<div class="meta peek-gloss"><strong>Distributaries</strong> — the call sites ` +
    `the result re-spreads to.</div>`;
  const tribPop = tribItems.length
    ? `${tribGloss}${cappedList(tribItems)}`
    : "";
  const distPop = callerItems.length
    ? `${distGloss}${cappedList(callerItems)}`
    : "";
  return `<div class="finding" data-finding="${escapeHtml(
    id,
  )}" data-entry-type="${type}" data-path-lines="${helper.line ?? ""}" data-sink-line="${
    helper.line ?? ""
  }">
  <button class="panel-back" type="button" title="Back to the list">← Back to list</button>
  <div class="finding-head"><h4>${escapeHtml(helper.name ?? "(helper)")} <span class="badge q-${type}">${what}</span></h4></div>
  <div class="meta">${escapeHtml(helper.file ?? "")}:${helper.line ?? "?"}${
    helper.returnType ? ` · returns ${escapeHtml(helper.returnType)}` : ""
  }</div>
  <div class="def-jump"><strong>Verdict</strong> ${escapeHtml(helper.verdict ?? "—")} · ${countPeek(
    `${inSources} inbound source(s)`,
    tribPop,
  )} → ${countPeek(`${helper.callerCount ?? 0} caller(s)`, distPop)}</div>
  <div class="def-jump meta">Click a count to see what is inside it.</div>
  <div class="def-jump"><strong>Inline?</strong> ${escapeHtml(
    inline.verdict,
  )} <span class="meta">— ${escapeHtml(inline.why)}</span></div>
</div>`;
}

// A list of sinks affected by a promoted report entry (source boundary, unknown
// edge, fan-out root). Same-file sinks become in-panel jump links (.xref selects
// the finding); cross-file sinks open their own page.
function affectedSinkList(sinks, relPath, omitted = 0) {
  if (!(sinks ?? []).length) return "";
  const items = sinks
    .map((s) => {
      const where =
        s.file === relPath
          ? `<a class="xref" data-finding="${escapeHtml(s.id)}">:${s.line}</a>`
          : `<a class="xfile" href="/file?path=${encodeURIComponent(
              s.file,
            )}#L${s.line}">${escapeHtml(s.file.split("/").pop())}:${s.line} ↗</a>`;
      return `<li>${where}${
        s.label ? ` <code>${escapeHtml(s.label)}</code>` : ""
      }</li>`;
    })
    .join("");
  const more = omitted > 0 ? `<li class="meta">+${omitted} more</li>` : "";
  return `<ul class="why xref-list">${items}${more}</ul>`;
}

// ARCH-2: an unknown-edge panel — an unresolved call/identifier the analyzer
// could not follow, and the findings whose paths cross it.
export function unknownEdgePanel(row, id, relPath) {
  return `<div class="finding" data-finding="${escapeHtml(
    id,
  )}" data-entry-type="unknown" data-path-lines="${row.line ?? ""}" data-sink-line="${
    row.line ?? ""
  }">
  <button class="panel-back" type="button" title="Back to the list">← Back to list</button>
  <div class="finding-head"><h4>${escapeHtml(row.label ?? "(unknown)")} <span class="badge q-unknown">unknown edge</span></h4></div>
  <div class="meta">${escapeHtml(row.file ?? "")}:${row.line ?? "?"} · ${escapeHtml(
    row.kind ?? "unknown",
  )}</div>
  <div class="def-jump"><strong>Crosses</strong> ${
    row.occurrences ?? 1
  } render path(s) — an edge the analyzer could not resolve, so flow past it is unknown.</div>
  ${
    affectedSinkList(row.affectedSinks, relPath)
      ? `<strong>Affected findings</strong>${affectedSinkList(row.affectedSinks, relPath)}`
      : ""
  }
</div>`;
}

// ARCH-2: a context-relay panel — a parent JSX site forwarding a same-feature prop
// bundle to a child, a candidate for moving the data into context.
export function relayPanel(row, id) {
  const propList = (props, cls) =>
    (props ?? []).length
      ? `<ul class="why ${cls}">${props
          .map((p) => `<li><code>${escapeHtml(String(p))}</code></li>`)
          .join("")}</ul>`
      : "";
  const childOpen = row.childFile
    ? ` → <a class="xfile" href="/file?path=${encodeURIComponent(
        row.childFile,
      )}">${escapeHtml(row.childFile.split("/").pop())} ↗</a>`
    : "";
  return `<div class="finding" data-finding="${escapeHtml(
    id,
  )}" data-entry-type="relay" data-path-lines="${row.line ?? ""}" data-sink-line="${
    row.line ?? ""
  }">
  <button class="panel-back" type="button" title="Back to the list">← Back to list</button>
  <div class="finding-head"><h4>${escapeHtml(row.childComponent ?? "(child)")} <span class="badge q-relay">relay</span></h4></div>
  <div class="meta">${escapeHtml(row.parentFile ?? "")}:${row.line ?? "?"}${childOpen}</div>
  <div class="def-jump"><strong>Signal</strong> ${escapeHtml(
    row.signal ?? `${(row.props ?? []).length} props forwarded`,
  )}</div>
  ${
    (row.sharedProps ?? []).length
      ? `<strong>Shared-context props — ${row.sharedProps.length}</strong>${propList(
          row.sharedProps,
          "branch-exclusive",
        )}`
      : ""
  }
  ${
    (row.props ?? []).length
      ? `<strong>All forwarded props — ${row.props.length}</strong>${propList(row.props, "relay-prop")}`
      : ""
  }
  ${
    (row.contextHooks ?? []).length
      ? `<strong>Context hooks in scope</strong>${propList(row.contextHooks, "relay-context")}`
      : ""
  }
</div>`;
}

// HOME-2: the per-file fan-out panel collapses to a single headline + an up-link to
// the full node/edge graph, which now lives on the overview (HOME-1). The in-file
// SVG was removed: a fan-out is a cross-file story, so its picture belongs on the
// cross-file page, not scoped to one file.
export function fanOutPanel(row, id) {
  return `<div class="finding" data-finding="${escapeHtml(
    id,
  )}" data-entry-type="fan-out" data-path-lines="${row.line ?? ""}" data-sink-line="${
    row.line ?? ""
  }">
  <button class="panel-back" type="button" title="Back to the list">← Back to list</button>
  <div class="finding-head"><h4>${escapeHtml(row.root ?? "(source)")} <span class="badge q-fan-out">fan-out</span></h4></div>
  <div class="meta">${escapeHtml(row.kind ?? "source")} · feeds ${
    row.sinkCount ?? 0
  } sink(s)${row.fileCount > 1 ? ` across ${row.fileCount} files` : ""} · max depth ${
    row.maxDepth ?? 0
  }</div>
  <div class="def-jump"><strong>Fans into</strong> ${
    row.sinkCount ?? 0
  } render output(s) — a shared source; centralizing it would touch them all. <a href="/#${fanOutAnchor(
    row.root,
  )}">See the full fan-out graph on the overview →</a></div>
</div>`;
}

// ARCH-2 D: the hotspots roll-up + path-census for ONE file, folded into the
// panel header. Hotspots/census have no per-row unit (they describe the file as a
// whole), so they live here rather than as list entries. Computed directly from
// the file's ranked sinks.
export function fileStatsHtml(sinks) {
  const ranked = (sinks ?? []).filter((s) => s.tier !== "usage");
  if (ranked.length === 0) return "";
  const burdens = ranked.map((s) => s.scores?.burden ?? 0);
  const worst = burdens.reduce((m, b) => Math.max(m, b), 0);
  const total = burdens.reduce((a, b) => a + b, 0);
  const depths = ranked
    .map((s) => s.metrics?.maximumPathDepth ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const pct = (p) =>
    depths.length
      ? depths[Math.min(depths.length - 1, Math.floor(p * depths.length))]
      : 0;
  const depthBit = depths.length
    ? ` · path depth max ${depths[depths.length - 1]} <span class="meta">(p90 ${pct(
        0.9,
      )}, median ${pct(0.5)})</span>`
    : "";
  return `<div class="file-stats meta">worst ${worst.toFixed(2)} · total burden ${total.toFixed(
    1,
  )}${depthBit}</div>`;
}
