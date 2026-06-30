import { findingTitle } from "../analysis/finding-title.mjs";
import { escapeHtml } from "./escape.mjs";
import { snippetBlockHtml } from "./source-peek.mjs";
import {
  defenseLocHtml,
  joinPath,
  pathSection,
  pathStepsAttr,
  reachSection,
  representationSection,
  sameCodeSection,
  stepLocationHtml,
} from "./code-map-paths.mjs";

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
      (sink.rootInfos ?? []).map((r) => `${r.label} [${r.kind}]`).join(", ") ||
      (sink.roots ?? []).join(", ") ||
      "—"
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
    reps.forEach((s) =>
      out.push(`  - ${s.kind} ${s.label} @ ${s.file}:${s.line}`),
    );
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

export function findingPanel(sink, source, peers, relPath, meta, resolveSource) {
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
      : `<div class="burden-row">
    <dl>
    <dt>burden</dt><dd>${(sink.scores?.burden ?? 0).toFixed(3)}</dd>
    <dt>confidence</dt><dd>${sink.confidence}%</dd>
    <dt>risk</dt><dd>${escapeHtml(sink.confidenceRisk ?? "—")}</dd>
  </dl>
  ${burdenBreakdownHtml(sink)}
  </div>
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

// BURDEN-1: the breakdown of how the burden score was computed, rendered as
// always-visible inline pills (no click-to-expand, no full-width bars) in the
// whitespace beside the burden/confidence/risk list. Each pill names a weighted
// metric and its share of the total; the exact `weight × normalized(raw)` math is
// in the tooltip. Only terms that actually contribute are listed, widest first,
// so a clean path shows a short "burden is 0" note instead.
function burdenBreakdownHtml(sink) {
  const breakdown = sink.scores?.burdenBreakdown;
  if (!breakdown) return "";
  const total = breakdown.total ?? 0;
  const contributing = (breakdown.terms ?? []).filter(
    (term) => term.contribution > 0,
  );
  if (!contributing.length) {
    return `<div class="burden-breakdown"><div class="meta">No weighted metrics contribute — burden is 0.</div></div>`;
  }
  const pills = contributing
    .map((term) => {
      const pct = total > 0 ? Math.round((term.contribution / total) * 100) : 0;
      return `<li class="bd-pill" title="weight ${term.weight} × normalized(${term.raw}) = ${term.contribution.toFixed(
        3,
      )}">${escapeHtml(term.label)} <span class="bd-pct">${term.contribution.toFixed(
        3,
      )} · ${pct}%</span></li>`;
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
  return `<div class="burden-breakdown">
    <div class="bd-lead meta">burden breakdown — ${total.toFixed(3)} from ${contributing.length} metric${
      contributing.length === 1 ? "" : "s"
    }</div>
    <ul class="bd-pills">${pills}</ul>${penaltyNote}${clampNote}
  </div>`;
}
