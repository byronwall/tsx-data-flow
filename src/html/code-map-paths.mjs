import { escapeHtml } from "./escape.mjs";
import { snippetBlockHtml } from "./source-peek.mjs";

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
  const file = step.file
    ? basename
      ? step.file.split("/").pop()
      : step.file
    : "";
  return file ? `${file}:${step.line}` : `:${step.line}`;
}

// A step's location, rendered to keep you oriented to the file (transcript: the
// recurring "I lose track of which file I'm in" complaint):
//   - same file as the code map → a click-to-scroll link that centers the line
//     on the source column (no popover, no context switch);
//   - a different file → an inline code reveal (so you don't lose the code map,
//     transcript INLINE-1) PLUS a real link to that file's page for full nav.
export function stepLocationHtml(step, resolveSource, relPath) {
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
    const src =
      typeof resolveSource === "function" ? resolveSource(step.file) : null;
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
export function defenseLocHtml(defense, relPath, resolveSource) {
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

export function pathSection(sink, resolveSource, relPath) {
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
export function pathStepsAttr(sink, relPath) {
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
export function representationSection(sink) {
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
export function reachSection(sink) {
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
export function sameCodeSection(sink, peers) {
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
export function joinPath(root, rel) {
  if (!root) return rel;
  return `${String(root).replace(/[/\\]+$/, "")}/${rel}`;
}
