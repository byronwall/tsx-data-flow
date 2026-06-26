// The annotated code map: render one source file as line-numbered code with the
// render sinks that land in it overlaid in the gutter, plus a commentary panel
// describing each finding. This is the one HTML view the Markdown reports cannot
// express — it ties the analyzer's findings back to the literal source lines.
import { escapeHtml } from "./page.mjs";
import { snippetBlockHtml } from "./source-peek.mjs";
import { findingTitle } from "../core.mjs";

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
    bullets.push(`${m.impossibleDefenseCount} impossible defenses`);
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

// Collapse consecutive steps on the SAME line (same file) into a single group
// (STEP-2): the user's repeated complaint is that the tall code snippet is
// reprinted once per step even when steps 1,2,3 all sit on `Task.ts:72`. We now
// group purely by file+line — regardless of kind/expression — so the snippet is
// shown ONCE and the steps read as "1–3", with the distinct kinds/expressions
// listed against that single snippet. Each group keeps the original ordinals so
// the gutter overlay still lines up.
function groupPathSteps(steps) {
  const groups = [];
  steps.forEach((step, index) => {
    const prev = groups[groups.length - 1];
    const sameLine =
      prev && prev.step.line === step.line && prev.step.file === step.file;
    const kindLabel = STEP_KIND_LABEL[step.kind] ?? step.kind ?? "step";
    const label = step.label ?? "";
    if (sameLine) {
      prev.end = index;
      prev.defensive = prev.defensive || isDefensiveStep(step);
      if (!prev.kinds.includes(kindLabel)) prev.kinds.push(kindLabel);
      if (label && !prev.labels.includes(label)) prev.labels.push(label);
    } else {
      groups.push({
        step,
        start: index,
        end: index,
        defensive: isDefensiveStep(step),
        kinds: [kindLabel],
        labels: label ? [label] : [],
      });
    }
  });
  return groups;
}

function pathSection(sink, resolveSource, relPath) {
  const steps = sink.representativeSteps ?? [];
  if (steps.length < 2) return "";
  const groups = groupPathSteps(steps);
  const collapsed = groups.length < steps.length;
  const rows = groups
    .map((group) => {
      const step = group.step;
      // STEP-2: list the distinct kinds in the run (e.g. "literal · read · call")
      // rather than a vague "ops"; the snippet is shared so the kinds tell the
      // story of what happens on that line.
      const kinds = group.kinds.length ? group.kinds : ["step"];
      const kind =
        kinds.length > 3
          ? `${kinds.slice(0, 3).join(" · ")} +${kinds.length - 3}`
          : kinds.join(" · ");
      const shield = group.defensive
        ? ' <span class="def-icon" title="Defensive operation (fallback/guard)">🛡</span>'
        : "";
      const ordinal =
        group.end > group.start
          ? `${group.start + 1}–${group.end + 1}`
          : `${group.start + 1}`;
      const repeat =
        group.end > group.start
          ? ` <span class="meta">×${group.end - group.start + 1}</span>`
          : "";
      // STEP-2: distinct expressions on the line, stacked once (short text), not a
      // repeated tall snippet. STEP-3: Expression sits in the 2nd-from-left slot,
      // ahead of the (taller, reveal-bearing) Location column.
      const labels = group.labels.length ? group.labels : [step.label ?? ""];
      const exprHtml = labels
        .map(
          (l, i) =>
            `<code>${escapeHtml(l)}</code>${i === labels.length - 1 ? repeat : ""}`,
        )
        .join("<br>");
      return `<tr${group.defensive ? ' class="defensive-step"' : ""}>
<td class="step-no">${ordinal}</td>
<td><span class="k">${escapeHtml(kind)}</span>${shield}</td>
<td class="path-expr">${exprHtml}</td>
<td class="path-loc">${stepLocationHtml(step, resolveSource, relPath)}</td>
</tr>`;
    })
    .join("");
  // Open by default: the source→sink trajectory is the single most useful thing
  // on this panel (transcript), so it should not start collapsed. The summary
  // shows the raw step count; when steps were merged into ranges, say so.
  const summary =
    collapsed && groups.length !== steps.length
      ? `Path — ${steps.length} steps · ${groups.length} ops (source → sink)`
      : `Path — ${steps.length} steps (source → sink)`;
  return `<details class="path-detail" open><summary>${summary}</summary><div class="path-scroll"><table class="path-table"><thead><tr><th>#</th><th>Kind</th><th>Expression</th><th>Location</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
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
  // Collapse consecutive identical hops (same kind/expression/line) into one row
  // with a ×N count (STEP-1) — a stack of 14 identical ALIAS rows reads as one.
  const groups = [];
  for (const step of steps) {
    const prev = groups[groups.length - 1];
    if (
      prev &&
      prev.step.kind === step.kind &&
      (prev.step.label ?? "") === (step.label ?? "") &&
      prev.step.line === step.line
    ) {
      prev.count += 1;
    } else {
      groups.push({ step, count: 1 });
    }
  }
  const items = groups
    .map(({ step, count }) => {
      const kind = STEP_KIND_LABEL[step.kind] ?? step.kind;
      const loc = stepLocationText(step, { basename: true });
      const repeat = count > 1 ? ` <span class="meta">×${count}</span>` : "";
      return `<li><span class="k">${escapeHtml(kind)}</span> <code>${escapeHtml(
        step.label ?? "",
      )}</code>${repeat}${loc ? ` <span class="meta">${escapeHtml(loc)}</span>` : ""}</li>`;
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
  // DEF-3: a compact one-line row per defense with the shield in its own column
  // (the icon column may carry other markers later), instead of an inline 🛡 that
  // pushed the text onto a second line.
  const defenses = (sink.defenses ?? [])
    .map(
      (d) =>
        `<li class="def-row"><span class="def-mark" title="Defensive operation (fallback/guard)">🛡</span><span class="def-body"><code>${escapeHtml(
          d.expression ?? d.guarded ?? "",
        )}</code> — ${escapeHtml(d.verdict ?? "?")}${
          d.type ? ` <span class="meta">(${escapeHtml(d.type)})</span>` : ""
        }${defenseLocHtml(d, relPath, resolveSource)}</span></li>`,
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
  ${isUsage ? "" : `<div class="finding-alias">${escapeHtml(findingTitle(sink))}</div>`}
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
  ${
    defenses
      ? `<strong>Defenses — ${(sink.defenses ?? []).length}</strong>${defenseNote(sink)}<ul class="why def-list">${defenses}</ul>`
      : ""
  }
</div>`;
}

// DEF-4: the user noticed "it says six even though there's only a couple listed."
// The header counts the explicit `??`/`?.` guard sites recorded in `defenses[]`,
// while the metric counts every defensive operation across ALL paths through the
// value (the panel shows the single worst path). When they differ, say so rather
// than leave the gap looking like a bug.
function defenseNote(sink) {
  const shown = (sink.defenses ?? []).length;
  const ops = sink.metrics?.actionableDefensiveOperationCount ?? 0;
  if (ops <= shown) return "";
  return `<div class="meta">${ops} defensive operation${
    ops === 1 ? "" : "s"
  } across all paths through this value; the ${shown} explicit <code>??</code>/<code>?.</code> guard site${
    shown === 1 ? "" : "s"
  } on the worst path ${shown === 1 ? "is" : "are"} listed.</div>`;
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

// COMMENT-1: the "thinnest of highlighting" — dim `//` and `/* */` comments so
// the eye can skip them. Not a syntax highlighter: only comments are styled.
// `state.inBlock` carries an open block comment across lines; strings are
// respected so a `//` inside a string literal is not mistaken for a comment.
function renderCommentLine(text, state) {
  let out = "";
  let buf = "";
  let cbuf = "";
  const flushCode = () => {
    if (buf) {
      out += escapeHtml(buf);
      buf = "";
    }
  };
  const flushComment = () => {
    if (cbuf) {
      out += `<span class="cmt">${escapeHtml(cbuf)}</span>`;
      cbuf = "";
    }
  };
  let str = null;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (state.inBlock) {
      const end = text.indexOf("*/", i);
      if (end === -1) {
        cbuf += text.slice(i);
        i = n;
      } else {
        cbuf += text.slice(i, end + 2);
        i = end + 2;
        state.inBlock = false;
      }
      continue;
    }
    if (str) {
      buf += ch;
      if (ch === "\\") {
        buf += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === str) str = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      flushComment();
      str = ch;
      buf += ch;
      i += 1;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === "//") {
      flushCode();
      cbuf += text.slice(i);
      i = n;
      continue;
    }
    if (two === "/*") {
      flushCode();
      const end = text.indexOf("*/", i + 2);
      if (end === -1) {
        cbuf += text.slice(i);
        i = n;
        state.inBlock = true;
      } else {
        cbuf += text.slice(i, end + 2);
        i = end + 2;
      }
      continue;
    }
    buf += ch;
    i += 1;
  }
  flushCode();
  flushComment();
  return out;
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
function helperSeverity(helper) {
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
function entryRowHtml(entry, score = 0) {
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
    fork.namedValues?.length ? `: ${escapeHtml(fork.namedValues.join(", "))}` : ""
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
    return { verdict: "Keep & formalize", why: "multiple callers + real internal work — make it a typed boundary." };
  if (helper.passThrough && (helper.internalDepth ?? 0) <= 1)
    return { verdict: "Inline", why: "pure forwarding hop — the indirection adds nothing." };
  if ((helper.callerCount ?? 0) <= 2 && (helper.internalDepth ?? 0) <= 2 && !helper.typeLeak)
    return { verdict: "Inline", why: "shallow body, few callers — indirection without consolidation." };
  if (helper.typeLeak)
    return { verdict: "Keep (fix boundary)", why: "the helper should exist but its type leaks — tighten it." };
  return { verdict: "Keep", why: "genuine transformation — inlining would relocate the mess, not remove it." };
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

function junctionPanel(helper, id, type) {
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
  const tribPop = tribItems.length ? `${tribGloss}${cappedList(tribItems)}` : "";
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
      const where = s.file === relPath
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
function unknownEdgePanel(row, id, relPath) {
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
function relayPanel(row, id) {
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

// ARCH-2: a fan-out panel — a source feeding many render sinks. The headline is
// how widely it spreads (sink/file counts); the list is the sinks it drives here.
// GRAPH-1: a deterministic hue per file so the fan-out graph colors sinks by the
// file they live in (the user's "color by file" ask). Stable string hash → hue.
function fileHue(file) {
  let h = 0;
  for (const ch of String(file)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const truncMid = (text, max = 26) => {
  const s = String(text);
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
};

// GRAPH-1 (first slice): a node/edge diagram for one fan-out source — the source
// on the left, an edge to each reached sink on the right, each sink colored by
// its file. This is the "circles with connections, colored by file" the user
// asked for. It draws the cross-file sample (`graphSinks`, capped upstream);
// deeper layering (intermediate hops) and an interactive file filter are the
// next steps. In-file sinks select on the code map; cross-file sinks open.
function fanOutGraphSvg(row, relPath) {
  const sinks = row.graphSinks ?? row.sinks ?? [];
  if (!sinks.length) return "";
  const W = 540;
  const rowH = 26;
  const top = 16;
  const H = Math.max(96, sinks.length * rowH + top + 12);
  const srcCy = H / 2;
  const srcW = 150;
  const sinkX = W - 196;
  const sinkW = 188;
  const edges = [];
  const nodes = [];
  const files = new Set();
  sinks.forEach((s, i) => {
    const cy = top + i * rowH + 10;
    const hue = fileHue(s.file);
    files.add(s.file);
    edges.push(
      `<path d="M${srcW} ${srcCy} C ${srcW + 60} ${srcCy}, ${sinkX - 60} ${cy}, ${sinkX} ${cy}" fill="none" stroke="hsl(${hue} 60% 50% / 0.45)" stroke-width="1.5"/>`,
    );
    const inFile = s.file === relPath;
    const label = escapeHtml(truncMid(`${s.file.split("/").pop()}:${s.line} ${s.label ?? ""}`.trim()));
    const open = inFile
      ? `<a class="xref" data-finding="${escapeHtml(s.id ?? "")}">`
      : `<a class="xfile" href="/file?path=${encodeURIComponent(s.file)}#L${s.line}">`;
    nodes.push(
      `${open}<g class="fg-node">
        <rect x="${sinkX}" y="${cy - 9}" width="${sinkW}" height="18" rx="9" fill="hsl(${hue} 70% 50% / 0.16)" stroke="hsl(${hue} 60% 50%)" stroke-width="${inFile ? 2 : 1}"/>
        <text x="${sinkX + 9}" y="${cy + 4}" font-size="11" fill="currentColor">${label}</text>
      </g></a>`,
    );
  });
  const omitted = (row.sinkCount ?? sinks.length) - sinks.length;
  const moreNode =
    omitted > 0
      ? `<text x="${sinkX}" y="${H - 4}" font-size="11" fill="var(--muted)">+${omitted} more sink(s) in other files</text>`
      : "";
  const legend = [...files]
    .slice(0, 6)
    .map(
      (f) =>
        `<span class="fg-key"><span class="fg-swatch" style="background:hsl(${fileHue(f)} 60% 50%)"></span>${escapeHtml(f.split("/").pop())}</span>`,
    )
    .join("");
  return `<div class="fanout-graph">
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Fan-out graph for ${escapeHtml(row.root ?? "source")}">
    ${edges.join("")}
    <g><rect x="0" y="${srcCy - 16}" width="${srcW}" height="32" rx="8" fill="hsl(205 70% 50% / 0.16)" stroke="hsl(205 70% 50%)" stroke-width="2"/>
    <text x="10" y="${srcCy + 4}" font-size="11.5" fill="currentColor">${escapeHtml(truncMid(row.root ?? "source", 20))}</text></g>
    ${nodes.join("")}
    ${moreNode}
  </svg>
  <div class="fg-legend">${legend}</div>
</div>`;
}

function fanOutPanel(row, id, relPath) {
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
  } render output(s) — a shared source; centralizing it would touch them all.</div>
  ${fanOutGraphSvg(row, relPath)}
  ${
    affectedSinkList(row.sinks, relPath)
      ? `<strong>Sinks in this file</strong>${affectedSinkList(row.sinks, relPath)}`
      : ""
  }
</div>`;
}

// ARCH-2 D: the hotspots roll-up + path-census for ONE file, folded into the
// panel header. Hotspots/census have no per-row unit (they describe the file as a
// whole), so they live here rather than as list entries. Computed directly from
// the file's ranked sinks.
function fileStatsHtml(sinks) {
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
    depths.length ? depths[Math.min(depths.length - 1, Math.floor(p * depths.length))] : 0;
  const depthBit = depths.length
    ? ` · path depth max ${depths[depths.length - 1]} <span class="meta">(p90 ${pct(
        0.9,
      )}, median ${pct(0.5)})</span>`
    : "";
  return `<div class="file-stats meta">worst ${worst.toFixed(2)} · total burden ${total.toFixed(
    1,
  )}${depthBit}</div>`;
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
        secondary: helper.verdict ?? `${helper.inSources ?? 0}→${helper.callerCount ?? 0}`,
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
      panelHtml: fanOutPanel(row, id, relPath),
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
