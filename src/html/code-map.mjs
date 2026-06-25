// The annotated code map: render one source file as line-numbered code with the
// render sinks that land in it overlaid in the gutter, plus a commentary panel
// describing each finding. This is the one HTML view the Markdown reports cannot
// express — it ties the analyzer's findings back to the literal source lines.
import { escapeHtml } from "./page.mjs";
import { snippetBlockHtml } from "./source-peek.mjs";

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

// A step's location, rendered to keep you oriented to the file (transcript: the
// recurring "I lose track of which file I'm in" complaint):
//   - same file as the code map → a click-to-scroll link that centers the line
//     on the source column (no popover, no context switch);
//   - a different file → an inline code reveal (so you don't lose the code map,
//     transcript INLINE-1) PLUS a real link to that file's page for full nav.
function stepLocationHtml(step, resolveSource, relPath) {
  if (!step.line) return '<span class="meta">-</span>';
  if (!step.file) return `<span class="meta">:${step.line}</span>`;
  if (relPath && step.file === relPath) {
    return `<a class="goto-line" data-line="${step.line}" title="Scroll the code map to line ${step.line}">:${step.line}</a>`;
  }
  // Cross-file: embed the target snippet (resolved server-side) so it can be
  // revealed inline, plus a link to open the file. The user wants to see the
  // jumped-to code "without losing all this code-map stuff on the left."
  const base = escapeHtml(step.file.split("/").pop());
  const open = `<a class="xfile" href="/file?path=${encodeURIComponent(
    step.file,
  )}#L${step.line}" title="Open ${escapeHtml(step.file)}">${base}:${step.line} ↗</a>`;
  let snippet = "";
  try {
    const src = typeof resolveSource === "function" ? resolveSource(step.file) : null;
    if (src) snippet = snippetBlockHtml(src, step.line, { context: 2 });
  } catch {
    snippet = "";
  }
  if (!snippet) return open;
  return `<span class="xfile-peek">${open} <button type="button" class="reveal-code" title="Show this code inline">⌄ code</button><span class="inline-code" hidden>${snippet}</span></span>`;
}

// A defense's location, surfaced next to its verdict. The transcript called out
// that defenses showed the expression/verdict but dropped the line — the data is
// present (debug dump uses it), it just was not rendered here.
function defenseLocHtml(defense, relPath, resolveSource) {
  const line = defense.location?.line;
  if (!line) return "";
  const step = { file: defense.location?.file ?? relPath, line };
  return ` <span class="meta">@</span> ${stepLocationHtml(step, resolveSource, relPath)}`;
}

// The representative (deepest) path as compact table rows. "Show, don't tell":
// instead of "path depth 18", lay out the hops with kind/location/expression.
// Every `fallback`-kind step reads as defensive to the user (whether it is `??`,
// `||`, or `?.`); the analyzer only records `??`/`?.` in `defenses[]`, so mark
// defensiveness from the PATH here too — that is why "352 is defensive as well"
// even though only one site showed in the Defenses list (DEF-1/DEF-2).
function isDefensiveStep(step) {
  return step.kind === "fallback";
}

function pathSection(sink, resolveSource, relPath) {
  const steps = sink.representativeSteps ?? [];
  if (steps.length < 2) return "";
  const rows = steps
    .map((step, index) => {
      const kind = STEP_KIND_LABEL[step.kind] ?? step.kind ?? "step";
      const shield = isDefensiveStep(step)
        ? ' <span class="def-icon" title="Defensive operation (fallback/guard)">🛡</span>'
        : "";
      return `<tr${isDefensiveStep(step) ? ' class="defensive-step"' : ""}>
<td class="step-no">${index + 1}</td>
<td><span class="k">${escapeHtml(kind)}</span>${shield}</td>
<td class="path-loc">${stepLocationHtml(step, resolveSource, relPath)}</td>
<td><code>${escapeHtml(step.label ?? "")}</code></td>
</tr>`;
    })
    .join("");
  // Open by default: the source→sink trajectory is the single most useful thing
  // on this panel (transcript), so it should not start collapsed.
  return `<details class="path-detail" open><summary>Path — ${steps.length} steps (source → sink)</summary><div class="path-scroll"><table class="path-table"><thead><tr><th>#</th><th>Kind</th><th>Location</th><th>Expression</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

// Map of same-file path line → step ordinal, for the numbered source overlay
// (ANNO-1: "annotate this as item number seven… click the number to jump").
// Also flags which of those lines are defensive (fallback) so the overlay can
// badge them. Returns a compact "line:ordinal[:d],…" string.
function pathStepsAttr(sink, relPath) {
  const steps = sink.representativeSteps ?? [];
  const seen = new Set();
  const parts = [];
  steps.forEach((step, index) => {
    if (step.file !== relPath || !step.line || seen.has(step.line)) return;
    seen.add(step.line);
    parts.push(`${step.line}:${index + 1}${isDefensiveStep(step) ? ":d" : ""}`);
  });
  return parts.join(",");
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

const REACH_PER_SOURCE_CAP = 8;

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
  return `<details class="reach-detail"><summary>Flows into ${reach} render outputs</summary><p class="meta">This value reaches ${reach} sinks — distinct places it is rendered to the DOM — grouped by the shared source feeding them.</p><ul class="reach">${groupHtml}</ul></details>`;
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
        )}${d.type ? ` <span class="meta">(${escapeHtml(d.type)})</span>` : ""}${defenseLocHtml(
          d,
          relPath,
          resolveSource,
        )}</li>`,
    )
    .join("");
  // Lines this finding's representative path touches IN THIS FILE — used to light
  // up the source as a path overlay when the finding is selected.
  const pathLines = [
    ...new Set(
      (sink.representativeSteps ?? [])
        .filter((step) => step.file === relPath && step.line)
        .map((step) => step.line),
    ),
  ];
  const isUsage = sink.tier === "usage";
  const badge = isUsage
    ? '<span class="badge q-usage">usage</span>'
    : `<span class="badge q-${sink.queue}">${escapeHtml(
        QUEUE_LABEL[sink.queue] ?? sink.queue,
      )}</span>`;
  // Where the value is defined — the first source step (MODEL-1 jump-to-def).
  const defStep = (sink.representativeSteps ?? []).find(
    (step) => step.kind === "source" && step.line,
  );
  const defHtml = defStep
    ? `<div class="def-jump"><strong>Defined</strong> ${stepLocationHtml(
        defStep,
        resolveSource,
        relPath,
      )} <code>${escapeHtml(defStep.label ?? "")}</code></div>`
    : "";
  // For a trivial usage, lead with "this is just a use of X — here's where it's
  // defined and where it's used", not a burden/why-selected dossier.
  const usageNote = isUsage
    ? `<div class="usage-note">Not a smell — a plain use of <code>${escapeHtml(
        sink.expression ?? sink.label ?? "",
      )}</code>. Shown so you can trace it.</div>`
    : "";
  return `<div class="finding" data-finding="${escapeHtml(
    sink.id,
  )}" data-entry-type="${isUsage ? "usage" : "finding"}" data-path-lines="${pathLines.join(
    ",",
  )}" data-path-steps="${pathStepsAttr(sink, relPath)}" data-sink-line="${
    sink.line ?? ""
  }">
  <button class="panel-back" type="button" title="Back to the list">← Back to list</button>
  <div class="finding-head">
    <h4>${escapeHtml(sink.id)} ${badge}</h4>
    <button class="copy-debug" type="button" title="Copy a full debug dump of this finding">Copy debug info</button>
  </div>
  <pre class="debug-payload" hidden>${escapeHtml(debugInfo(sink, relPath, source, meta))}</pre>
  <div class="meta">${escapeHtml(sink.file)}:${sink.line}${
    ctxParts.length ? ` · ${escapeHtml(ctxParts.join(" / "))}` : ""
  }</div>
  <pre><code>${escapeHtml(sink.expression ?? sink.label ?? "")}</code></pre>
  ${usageNote}
  ${defHtml}
  ${excerpt ? `<strong>Source</strong>${excerpt}` : ""}
  ${
    isUsage
      ? ""
      : `<dl>
    <dt>burden</dt><dd>${(sink.scores?.burden ?? 0).toFixed(3)}</dd>
    <dt>confidence</dt><dd>${sink.confidence}%</dd>
    <dt>risk</dt><dd>${escapeHtml(sink.confidenceRisk ?? "—")}</dd>
  </dl>
  ${burdenBreakdownHtml(sink)}
  ${sink.confidenceReason ? `<div class="meta">${escapeHtml(sink.confidenceReason)}</div>` : ""}
  ${why ? `<strong>Why selected</strong><ul class="why">${why}</ul>` : ""}`
  }
  ${sameCodeSection(sink, peers)}
  ${pathSection(sink, resolveSource, relPath)}
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

// Type metadata for the unified entry list: badge label + sort priority. Findings
// lead; usages sink to the bottom (they are "proof of use", not smells).
const ENTRY_TYPES = {
  finding: { label: "finding", order: 0 },
  fork: { label: "fork", order: 1 },
  junction: { label: "junction", order: 2 },
  boundary: { label: "boundary", order: 3 },
  usage: { label: "usage", order: 9 },
};

// One row in the unified inventory. `entry` = {id, type, line, primary, secondary,
// metric, hue}. The whole list (findings, forks, junctions, usages) shares this.
function entryRowHtml(entry) {
  const meta = ENTRY_TYPES[entry.type] ?? { label: entry.type };
  const hue = entry.hue ?? 150;
  return `<li data-type="${entry.type}"><button type="button" class="finding-row" data-finding="${escapeHtml(
    entry.id,
  )}" style="--bt:${hue}">
<span class="fr-loc">:${entry.line ?? "?"}</span>
<span class="fr-expr" title="${escapeHtml(entry.primary)}"><span class="type-tag tt-${entry.type}">${escapeHtml(
    meta.label,
  )}</span> ${escapeHtml(entry.primary)}${
    entry.secondary ? ` <span class="meta">${escapeHtml(entry.secondary)}</span>` : ""
  }</span>
<span class="fr-burden">${escapeHtml(entry.metric ?? "")}</span>
</button></li>`;
}

// A repeated-fork panel: the discriminant, the fork sites (click to jump), the
// branch-exclusive eager computations, and the findings a split would fix. This
// is the worked example the user asked for — a fork shown AS a finding, with all
// its info in the detail panel and its sites overlaid on the source (ARCH-1).
function forkPanel(fork) {
  const siteLines = (fork.sites ?? []).map((s) => s.line).filter(Boolean);
  const branchLines = [];
  for (const range of fork.branchRanges ?? []) {
    for (let n = range.startLine; n <= range.endLine; n += 1) branchLines.push(n);
  }
  const pathLines = [...new Set([fork.line, ...siteLines, ...branchLines])].filter(
    Boolean,
  );
  const sites = (fork.sites ?? [])
    .map(
      (s) =>
        `<li><a class="goto-line" data-line="${s.line}">:${s.line}</a> <span class="k">${escapeHtml(
          s.kind ?? "site",
        )}</span> <code>${escapeHtml(s.snippet ?? s.value ?? "")}</code></li>`,
    )
    .join("");
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
    fork.namedValues?.length ? `: ${escapeHtml(fork.namedValues.join(", "))}` : ""
  }</div>
  ${sites ? `<strong>Fork sites — ${fork.siteCount ?? (fork.sites ?? []).length}</strong><ul class="why">${sites}</ul>` : ""}
  ${exclusive ? `<strong>Branch-exclusive computations — ${(fork.branchExclusive ?? []).length}</strong><ul class="why">${exclusive}</ul>` : ""}
  ${gated ? `<strong>Findings a split would fix — ${(fork.branchGatedSinks ?? []).length}</strong><ul class="why xref-list">${gated}</ul>` : ""}
</div>`;
}

// A junction / boundary panel built from a helper record: the confluence
// function, its verdict, tributaries (inbound lineages) and distributaries
// (callers, click to open). Surfaces the "info down in the report" the user
// wanted promoted into the finding view — and is the ONLY content on sink-less
// .ts files (TS-1).
function junctionPanel(helper, id, type) {
  const tributaries = (helper.inRoots && helper.inRoots.length
    ? helper.inRoots
    : (helper.params ?? []).map((p) => p.name ?? p)
  )
    .filter(Boolean)
    .map((t) => `<li><code>${escapeHtml(String(t))}</code></li>`)
    .join("");
  const distributaries = (helper.callers ?? [])
    .map(
      (c) =>
        `<li><a class="xfile" href="/file?path=${encodeURIComponent(
          c.file,
        )}#L${c.line}">${escapeHtml(c.file.split("/").pop())}:${c.line} ↗</a></li>`,
    )
    .join("");
  const badge = type === "boundary" ? "boundary" : "junction";
  return `<div class="finding" data-finding="${escapeHtml(
    id,
  )}" data-entry-type="${type}" data-path-lines="${helper.line ?? ""}" data-sink-line="${
    helper.line ?? ""
  }">
  <button class="panel-back" type="button" title="Back to the list">← Back to list</button>
  <div class="finding-head"><h4>${escapeHtml(helper.name ?? "(helper)")} <span class="badge q-${type}">${badge}</span></h4></div>
  <div class="meta">${escapeHtml(helper.file ?? "")}:${helper.line ?? "?"}${
    helper.returnType ? ` · returns ${escapeHtml(helper.returnType)}` : ""
  }</div>
  <div class="def-jump"><strong>Verdict</strong> ${escapeHtml(helper.verdict ?? "—")} · ${
    helper.inSources ?? 0
  } inbound source(s) → ${helper.callerCount ?? 0} caller(s)</div>
  ${tributaries ? `<strong>Tributaries (inbound lineages)</strong><ul class="why">${tributaries}</ul>` : ""}
  ${distributaries ? `<strong>Distributaries (callers)</strong><ul class="why">${distributaries}</ul>` : ""}
</div>`;
}

export function renderCodeMap({
  relPath,
  source,
  sinks,
  meta,
  resolveSource,
  selectedFinding = null,
  forks = [],
  helpers = [],
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

  // Junctions: helper records that are genuine confluences (≥3 inbound sources,
  // ≥2 callers). This is the report info the user wanted promoted — and on a
  // sink-less .ts file it is the only thing here (TS-1).
  const junctions = (helpers ?? []).filter(
    (h) => (h.inSources ?? 0) >= 3 && (h.callerCount ?? 0) >= 2,
  );

  // Build unified entries: {id, type, line, rowEntry, panelHtml}.
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
      row: {
        id: sink.id,
        type,
        line: sink.line,
        primary: sink.expression ?? sink.label ?? "",
        secondary: [ctx.tag, ctx.attribute].filter(Boolean).join("/"),
        metric: burden.toFixed(2),
        hue: burdenHue(burden),
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
  junctions.forEach((helper, index) => {
    const id = `JCT-${helper.line ?? index}`;
    entries.push({
      id,
      type: "junction",
      line: helper.line,
      sortLine: helper.line ?? 0,
      row: {
        id,
        type: "junction",
        line: helper.line,
        primary: helper.name ?? "(helper)",
        secondary: `${helper.inSources ?? 0}→${helper.callerCount ?? 0}`,
        metric: "",
        hue: 205,
      },
      panelHtml: junctionPanel(helper, id, "junction"),
    });
  });

  entries.sort(
    (a, b) =>
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
  const filterTypes = ["finding", "fork", "junction", "boundary", "usage"].filter(
    (t) => counts[t],
  );
  const filterChips =
    entries.length && filterTypes.length > 1
      ? `<div class="entry-filters"><button type="button" class="efilter active" data-filter="all">All ${entries.length}</button>${filterTypes
          .map(
            (t) =>
              `<button type="button" class="efilter" data-filter="${t}">${
                ENTRY_TYPES[t]?.label ?? t
              }s ${counts[t]}</button>`,
          )
          .join("")}</div>`
      : "";

  const listHtml = entries.length
    ? `<div class="finding-list">
<strong>${entries.length} item${entries.length === 1 ? "" : "s"} in this file</strong>
<p class="meta">Findings, repeated forks, junctions, and plain usages. Click any to inspect it; selecting one highlights its path on the source.</p>
${filterChips}
<ol>${entries.map((e) => entryRowHtml(e.row)).join("")}</ol>
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
