// The annotated code map: render one source file as line-numbered code with the
// render sinks that land in it overlaid in the gutter, plus a commentary panel
// describing each finding. This is the one HTML view the Markdown reports cannot
// express — it ties the analyzer's findings back to the literal source lines.
import { escapeHtml } from "./page.mjs";
import { snippetBlockHtml, sourceReferenceHtml } from "./source-peek.mjs";

const QUEUE_LABEL = {
  "peripheral-quick-win": "quick win",
  "central-leverage": "central leverage",
  investigation: "investigation",
};

// "Why selected" bullets, mirroring the work-packets rationale but compact.
// Path depth, representation hops, and reach are surfaced as their own detailed
// sections (see findingPanel) rather than bare counts, so they are omitted here.
function whyBullets(sink) {
  const m = sink.metrics;
  const bullets = [];
  if (m.actionableDefensiveOperationCount)
    bullets.push(`${m.actionableDefensiveOperationCount} defensive operations`);
  if (m.impossibleDefenseCount)
    bullets.push(`${m.impossibleDefenseCount} type-impossible fallbacks`);
  if (m.unknownEdgeCount) bullets.push(`${m.unknownEdgeCount} unknown edges`);
  return bullets;
}

const STEP_KIND_LABEL = {
  source: "source",
  parameter: "param",
  "property-read": "read",
  "prop-read": "read",
  fallback: "fallback",
  conditional: "compute",
  call: "call",
  "object-pack": "pack",
  "object-spread": "spread",
  alias: "alias",
  template: "template",
};

function stepLocationText(step, { basename = false } = {}) {
  if (!step.line) return "";
  const file = step.file ? (basename ? step.file.split("/").pop() : step.file) : "";
  return file ? `${file}:${step.line}` : `:${step.line}`;
}

function stepLocationHtml(step, resolveSource) {
  if (!step.line) return '<span class="meta">-</span>';
  if (!step.file) return `<span class="meta">:${step.line}</span>`;
  return sourceReferenceHtml(step.file, step.line, resolveSource);
}

// The representative (deepest) path as compact table rows. "Show, don't tell":
// instead of "path depth 18", lay out the hops with kind/location/expression.
function pathSection(sink, resolveSource) {
  const steps = sink.representativeSteps ?? [];
  if (steps.length < 2) return "";
  const rows = steps
    .map((step, index) => {
      const kind = STEP_KIND_LABEL[step.kind] ?? step.kind ?? "step";
      return `<tr>
<td class="step-no">${index + 1}</td>
<td><span class="k">${escapeHtml(kind)}</span></td>
<td class="path-loc">${stepLocationHtml(step, resolveSource)}</td>
<td><code>${escapeHtml(step.label ?? "")}</code></td>
</tr>`;
    })
    .join("");
  return `<details class="path-detail"><summary>Path — ${steps.length} steps (source → sink)</summary><div class="path-scroll"><table class="path-table"><thead><tr><th>#</th><th>Kind</th><th>Location</th><th>Expression</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

// The distinct representation-only hops (alias/pack/spread) on this slice.
function representationSection(sink) {
  const steps = sink.representationSteps ?? [];
  if (steps.length === 0) return "";
  const items = steps
    .map((step) => {
      const kind = STEP_KIND_LABEL[step.kind] ?? step.kind;
      const loc = stepLocationText(step, { basename: true });
      return `<li><span class="k">${escapeHtml(kind)}</span> <code>${escapeHtml(
        step.label ?? "",
      )}</code>${loc ? ` <span class="meta">${escapeHtml(loc)}</span>` : ""}</li>`;
    })
    .join("");
  return `<strong>Representation-only hops — ${steps.length}</strong><ul class="why">${items}</ul>`;
}

const REACH_PER_SOURCE_CAP = 25;

// "Reaches N sinks" expanded into the actual sinks, grouped by the shared source
// that feeds them (a nested chain: source → each render sink it drives).
function reachSection(sink) {
  const reach = sink.metrics?.reachableSinks ?? 1;
  const groups = sink.reachedVia ?? [];
  if (reach <= 1 || groups.length === 0) return "";
  const groupHtml = groups
    .map((group) => {
      const total = group.total ?? group.sinks.length;
      const shown = group.sinks.slice(0, REACH_PER_SOURCE_CAP);
      const extra = total - shown.length;
      const leaves = shown
        .map(
          (s) =>
            `<li><code>${escapeHtml(s.file.split("/").pop())}:${s.line}</code>${
              s.label ? ` <span class="meta">${escapeHtml(s.label)}</span>` : ""
            }</li>`,
        )
        .join("");
      const more = extra > 0 ? `<li class="meta">+${extra} more</li>` : "";
      return `<li>via <code>${escapeHtml(group.source)}</code> → ${total} sink(s)<ul>${leaves}${more}</ul></li>`;
    })
    .join("");
  return `<details class="reach-detail"><summary>Reaches ${reach} sinks</summary><ul class="reach">${groupHtml}</ul></details>`;
}

// Other findings whose rendered expression is identical to this one — so a
// click reveals every place the same code recurs, not just the one clicked.
function sameCodeSection(sink, peers) {
  const others = (peers ?? []).filter((other) => other.id !== sink.id);
  if (others.length === 0) return "";
  const items = others
    .map(
      (other) =>
        `<li><a class="xref" data-finding="${escapeHtml(other.id)}">line ${
          other.line
        }</a>${
          other.renderContext?.attribute
            ? ` <span class="meta">${escapeHtml(other.renderContext.attribute)}</span>`
            : ""
        }</li>`,
    )
    .join("");
  return `<strong>Same code — ${others.length} more</strong><ul class="why xref-list">${items}</ul>`;
}

// A self-contained, paste-ready dump of everything needed to trace a finding:
// where it lives, its full source→sink path with per-step locations (and the
// source line at each step, when same-file), defenses, reach, metrics — plus a
// JSON blob for tooling. Built for debugging mis-traces like a value resolving
// to the wrong definition.
// Join an absolute root with a relative file path (posix-style) for a debug
// dump — best-effort, good enough to click/open the real source.
function joinPath(root, rel) {
  if (!root) return rel;
  return `${String(root).replace(/[/\\]+$/, "")}/${rel}`;
}

function debugInfo(sink, relPath, source, meta) {
  const srcLines = source ? source.split("\n") : [];
  const lineText = (n) =>
    n && srcLines[n - 1] != null ? srcLines[n - 1].trim() : null;
  const ctx = sink.renderContext ?? {};
  const span = sink.span;
  const out = [];
  out.push(`tsx-dataflow finding ${sink.id}`);
  if (meta) {
    out.push(`analysis root (cwd): ${meta.root ?? "?"}`);
    if (meta.source) out.push(`source root: ${meta.source}`);
    if (meta.tsconfig) out.push(`tsconfig: ${meta.tsconfig}`);
    if (meta.tsconfigs && meta.tsconfigs.length > 1)
      out.push(`tsconfigs: ${meta.tsconfigs.join(", ")}`);
    if (meta.typescript) out.push(`typescript: ${meta.typescript}`);
    if (meta.generatedAt) out.push(`generated: ${meta.generatedAt}`);
  }
  out.push(
    `abs path: ${joinPath(meta?.root, sink.file)}:${sink.line}:${sink.column}`,
  );
  out.push(
    `location: ${sink.file}:${sink.line}:${sink.column}` +
      (span
        ? `  (span ${span.startLine}:${span.startColumn}–${span.endLine}:${span.endColumn})`
        : ""),
  );
  out.push(`expression: ${sink.expression ?? sink.label ?? ""}`);
  out.push(
    `context: ${[ctx.component, ctx.tag, ctx.attribute].filter(Boolean).join(" / ") || "—"}`,
  );
  out.push(`category: ${sink.category}   queue: ${sink.queue}`);
  out.push(`type: ${sink.type ?? "—"}`);
  out.push(
    `burden: ${(sink.scores?.burden ?? 0).toFixed(3)}   confidence: ${sink.confidence}% (${sink.confidenceRisk ?? "—"})`,
  );
  const breakdown = sink.scores?.burdenBreakdown;
  const contributing = (breakdown?.terms ?? []).filter(
    (term) => term.contribution > 0,
  );
  if (contributing.length) {
    out.push(
      `burden breakdown: ${contributing
        .map((term) => `${term.label} ${term.contribution.toFixed(3)}`)
        .join(", ")}`,
    );
  }
  if (sink.confidenceReason) out.push(`confidence: ${sink.confidenceReason}`);
  out.push("");
  out.push(
    `roots: ${
      (sink.rootInfos ?? [])
        .map((r) => `${r.label} [${r.kind}]`)
        .join(", ") || (sink.roots ?? []).join(", ") || "—"
    }`,
  );
  out.push("");
  const steps = sink.representativeSteps ?? [];
  out.push(`representative path — ${steps.length} steps (source → sink):`);
  steps.forEach((s, i) => {
    const loc = s.file
      ? `${joinPath(meta?.root, s.file)}:${s.line}`
      : s.line
        ? `:${s.line}`
        : "?";
    out.push(
      `  ${String(i + 1).padStart(2)}. ${(s.kind ?? "step").padEnd(13)} ${s.label ?? ""}    @ ${loc}`,
    );
    const src = s.file === relPath ? lineText(s.line) : null;
    if (src) out.push(`        ↳ ${src}`);
  });
  const reps = sink.representationSteps ?? [];
  if (reps.length) {
    out.push("");
    out.push(`representation-only hops — ${reps.length}:`);
    reps.forEach((s) => out.push(`  - ${s.kind} ${s.label} @ ${s.file}:${s.line}`));
  }
  const defs = sink.defenses ?? [];
  if (defs.length) {
    out.push("");
    out.push(`defenses — ${defs.length}:`);
    defs.forEach((d) =>
      out.push(
        `  - ${d.expression} → ${d.verdict} (${d.type ?? "?"}) [${d.origin ?? "—"}] @ :${d.location?.line}`,
      ),
    );
  }
  if ((sink.reachedVia ?? []).length) {
    out.push("");
    out.push("reaches:");
    for (const g of sink.reachedVia)
      out.push(`  via ${g.source} → ${g.total ?? g.sinks.length} sinks`);
  }
  out.push("");
  out.push("metrics: " + JSON.stringify(sink.metrics ?? {}));
  out.push("");
  out.push("--- JSON ---");
  out.push(
    JSON.stringify(
      {
        id: sink.id,
        root: meta?.root ?? null,
        tsconfig: meta?.tsconfig ?? null,
        absPath: joinPath(meta?.root, sink.file),
        file: sink.file,
        line: sink.line,
        column: sink.column,
        span: sink.span,
        expression: sink.expression,
        label: sink.label,
        category: sink.category,
        renderContext: sink.renderContext,
        type: sink.type,
        queue: sink.queue,
        roots: sink.roots,
        rootInfos: sink.rootInfos,
        representativeSteps: sink.representativeSteps,
        representationSteps: sink.representationSteps,
        defenses: sink.defenses,
        reachedVia: sink.reachedVia,
        metrics: sink.metrics,
        scores: sink.scores,
        confidence: sink.confidence,
      },
      null,
      2,
    ),
  );
  return out.join("\n");
}

function findingPanel(sink, source, peers, relPath, meta, resolveSource) {
  const ctx = sink.renderContext ?? {};
  const excerpt = source
    ? snippetBlockHtml(source, sink.line, { context: 3 })
    : "";
  const ctxParts = [ctx.component, ctx.tag, ctx.attribute].filter(Boolean);
  const why = whyBullets(sink)
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join("");
  const defenses = (sink.defenses ?? [])
    .map(
      (d) =>
        `<li><code>${escapeHtml(d.expression ?? d.guarded ?? "")}</code> — ${escapeHtml(
          d.verdict ?? "?",
        )}${d.type ? ` <span class="meta">(${escapeHtml(d.type)})</span>` : ""}</li>`,
    )
    .join("");
  return `<div class="finding" data-finding="${escapeHtml(sink.id)}">
  <div class="finding-head">
    <h4>${escapeHtml(sink.id)} <span class="badge q-${sink.queue}">${escapeHtml(
      QUEUE_LABEL[sink.queue] ?? sink.queue,
    )}</span></h4>
    <button class="copy-debug" type="button" title="Copy a full debug dump of this finding">Copy debug info</button>
  </div>
  <pre class="debug-payload" hidden>${escapeHtml(debugInfo(sink, relPath, source, meta))}</pre>
  <div class="meta">${escapeHtml(sink.file)}:${sink.line}${
    ctxParts.length ? ` · ${escapeHtml(ctxParts.join(" / "))}` : ""
  }</div>
  <pre><code>${escapeHtml(sink.expression ?? sink.label ?? "")}</code></pre>
  ${excerpt ? `<strong>Source</strong>${excerpt}` : ""}
  <dl>
    <dt>burden</dt><dd>${(sink.scores?.burden ?? 0).toFixed(3)}</dd>
    <dt>confidence</dt><dd>${sink.confidence}%</dd>
    <dt>risk</dt><dd>${escapeHtml(sink.confidenceRisk ?? "—")}</dd>
  </dl>
  ${burdenBreakdownHtml(sink)}
  ${sink.confidenceReason ? `<div class="meta">${escapeHtml(sink.confidenceReason)}</div>` : ""}
  ${why ? `<strong>Why selected</strong><ul class="why">${why}</ul>` : ""}
  ${sameCodeSection(sink, peers)}
  ${pathSection(sink, resolveSource)}
  ${representationSection(sink)}
  ${reachSection(sink)}
  ${defenses ? `<strong>Defenses — ${(sink.defenses ?? []).length}</strong><ul class="why">${defenses}</ul>` : ""}
</div>`;
}

// Collapsible breakdown of how the burden score was computed: one bar per
// weighted metric term, widest contribution first. Only terms that actually
// contribute are listed, so a clean path shows an empty (zero-burden) note.
function burdenBreakdownHtml(sink) {
  const breakdown = sink.scores?.burdenBreakdown;
  if (!breakdown) return "";
  const total = breakdown.total ?? 0;
  const contributing = (breakdown.terms ?? []).filter(
    (term) => term.contribution > 0,
  );
  const max = contributing.reduce(
    (m, term) => Math.max(m, term.contribution),
    0,
  );
  const rows = contributing
    .map((term) => {
      const pct = total > 0 ? Math.round((term.contribution / total) * 100) : 0;
      const width = max > 0 ? Math.round((term.contribution / max) * 100) : 0;
      return `<li>
      <span class="bd-label">${escapeHtml(term.label)}</span>
      <span class="bd-bar"><span class="bd-fill" style="width:${width}%"></span></span>
      <span class="bd-val" title="weight ${term.weight} × normalized(${term.raw}) = ${term.contribution.toFixed(
        3,
      )}">${term.contribution.toFixed(3)} · ${pct}%</span>
    </li>`;
    })
    .join("");
  const penalty = breakdown.backgroundPenalty ?? 1;
  const penaltyNote =
    penalty !== 1
      ? `<div class="meta">× ${penalty.toFixed(2)} background discount → ${(
          (breakdown.total ?? 0) * penalty
        ).toFixed(3)} final burden</div>`
      : "";
  const clampNote =
    (breakdown.rawSum ?? 0) > 1
      ? `<div class="meta">raw sum ${breakdown.rawSum.toFixed(3)} clamped to 1.000</div>`
      : "";
  const body = contributing.length
    ? `<ul class="burden-breakdown">${rows}</ul>${penaltyNote}${clampNote}`
    : `<div class="meta">No weighted metrics contribute — burden is 0.</div>`;
  return `<details class="burden-detail">
    <summary>burden breakdown — ${total.toFixed(3)} from ${contributing.length} metric${
      contributing.length === 1 ? "" : "s"
    }</summary>
    ${body}
  </details>`;
}

// Pick the highest-burden sink on a line to drive the gutter color.
function dominantSink(sinks) {
  return sinks.reduce((worst, sink) =>
    (sink.scores?.burden ?? 0) > (worst.scores?.burden ?? 0) ? sink : worst,
  );
}

// Map a burden score (0..1, but typically 0..~0.8) to a heat hue: calm green
// for low burden through amber to red for the worst. Saturation/lightness are
// applied in CSS (theme-aware), so this only chooses the hue.
const BURDEN_HUE_SCALE = 0.7;
function burdenHue(burden) {
  const t = Math.max(0, Math.min(1, (burden ?? 0) / BURDEN_HUE_SCALE));
  // 140 (green) -> 0 (red), passing through yellow/orange.
  return Math.round(140 - 140 * t);
}

// Char range [a, b) (0-based) that a sink's span occupies on `lineNo`, or null
// if it does not touch this line. Multi-line spans clamp to the line's extent.
function spanPart(sink, lineNo) {
  const span = sink.span;
  if (!span || span.startLine === span.endLine) return "single";
  if (lineNo === span.startLine) return "start";
  if (lineNo === span.endLine) return "end";
  return "middle";
}

function rangeOnLine(sink, lineNo, lineLength) {
  const span = sink.span;
  if (!span) {
    return sink.line === lineNo ? { a: 0, b: lineLength, part: "single" } : null;
  }
  if (lineNo < span.startLine || lineNo > span.endLine) return null;
  const a = lineNo === span.startLine ? span.startColumn - 1 : 0;
  const b = lineNo === span.endLine ? span.endColumn - 1 : lineLength;
  const start = Math.max(0, Math.min(a, lineLength));
  const end = Math.max(start, Math.min(b, lineLength));
  return {
    a: start,
    b: end === start ? Math.min(start + 1, lineLength) : end,
    part: spanPart(sink, lineNo),
  };
}

// Split one source line into plain + clickable "hit" segments. Overlapping
// findings on the same characters merge into one hit that carries ALL their ids,
// so a single click can reveal every finding at that spot.
function renderCodeLine(text, lineNo, lineSinks) {
  const ranges = [];
  for (const sink of lineSinks) {
    const r = rangeOnLine(sink, lineNo, text.length);
    if (r && r.b > r.a) ranges.push({ ...r, sink });
  }
  if (ranges.length === 0) return escapeHtml(text);

  // Sweep over unique boundaries; each segment owns whichever ranges cover it.
  const bounds = new Set([0, text.length]);
  for (const r of ranges) {
    bounds.add(r.a);
    bounds.add(r.b);
  }
  const points = [...bounds].sort((x, y) => x - y);
  let html = "";
  for (let i = 0; i < points.length - 1; i += 1) {
    const p = points[i];
    const q = points[i + 1];
    if (q <= p) continue;
    const slice = escapeHtml(text.slice(p, q));
    const covering = ranges.filter((r) => r.a <= p && r.b >= q);
    if (covering.length === 0) {
      html += slice;
      continue;
    }
    const ids = covering.map((r) => r.sink.id);
    const burden = Math.max(...covering.map((r) => r.sink.scores?.burden ?? 0));
    const parts = new Set(covering.map((r) => r.part));
    const spanClasses = [...parts].map((part) => `span-${part}`).join(" ");
    const part = parts.size === 1 ? [...parts][0] : "mixed";
    const title =
      covering.length > 1
        ? `${covering.length} findings: ${ids.join(", ")} · burden ${burden.toFixed(2)}`
        : `${ids[0]} · burden ${burden.toFixed(2)}`;
    html += `<span class="hit heat ${spanClasses}" data-findings="${escapeHtml(
      ids.join(","),
    )}" data-span-part="${escapeHtml(part)}" style="--bt:${burdenHue(
      burden,
    )}" title="${escapeHtml(title)}">${slice}</span>`;
  }
  return html;
}

function touchedLines(sink, maxLine) {
  const span = sink.span;
  const start = Math.max(1, span?.startLine ?? sink.line ?? 1);
  const end = Math.min(maxLine, Math.max(start, span?.endLine ?? sink.line ?? start));
  const lines = [];
  for (let lineNo = start; lineNo <= end; lineNo += 1) lines.push(lineNo);
  return lines;
}

export function renderCodeMap({ relPath, source, sinks, meta, resolveSource }) {
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

  const rows = lines.map((text, index) => {
    const lineNo = index + 1;
    const lineSinks = byLine.get(lineNo);
    const onPath = pathLines.has(lineNo);
    let gutter = "";
    let cls = [];
    let style = "";
    let code = escapeHtml(text);
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
    return `<tr class="${cls.join(" ")}"${style}>
<td class="ln">${lineNo}</td><td class="gutter">${gutter}</td><td class="code">${code}</td></tr>`;
  });

  // Panel: one finding block per sink (deduped by id), first one active.
  const seen = new Set();
  const panels = [];
  for (const sink of sinks) {
    if (seen.has(sink.id)) continue;
    seen.add(sink.id);
    panels.push(
      findingPanel(
        sink,
        source,
        byExpr.get((sink.expression ?? "").trim()),
        relPath,
        meta,
        resolveSource,
      ),
    );
  }
  const firstActive = panels.length
    ? panels[0].replace('class="finding"', 'class="finding active"')
    : "";
  const restPanels = panels.slice(1).join("\n");
  const emptyNote = panels.length
    ? ""
    : '<p class="empty">No ranked findings in this file.</p>';

  return `<div class="codemap">
  <div class="src"><table class="code"><tbody>${rows.join("")}</tbody></table></div>
  <div class="panel">
    ${panels.length ? '<p class="empty">Click a highlighted chunk of code to inspect its finding(s). Adjacent findings are independently clickable.</p>' : ""}
    ${emptyNote}
    ${firstActive}
    ${restPanels}
  </div>
</div>`;
}
