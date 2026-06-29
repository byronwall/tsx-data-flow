import { code, fenced, tableReport, viewIntro } from "./markdown-format.mjs";
import { formatExpression } from "./format-helpers.mjs";

// Approach 2 — classify every function reached on a render path as a data-flow
// boundary, ranked by "boundary debt".
export function renderBoundaryReport(report, args) {
  const helpers = (report.helpers ?? []).slice(0, args.maxItems);
  if (helpers.length === 0) {
    return `# Boundary Report\n\n${viewIntro("boundary-report", report).join("\n")}No first-party helper functions were reached on a render path.\n(Imported library calls stay opaque; try --max-helper-depth.)\n`;
  }
  const rows = helpers.map((helper) => [
    `${helper.name}()`,
    `${helper.file}:${helper.line}`,
    String(helper.arity),
    String(helper.inSources),
    String(helper.callerCount),
    `${helper.internalDepth}/${helper.internalChurn}`,
    code(formatExpression(helper.returnType, 36)),
    helper.verdict,
  ]);
  const lines = [
    ...tableReport(
      "Boundary Report",
      [
        "Function",
        "Where",
        "Arity",
        "In-src",
        "Callers",
        "Internal d/churn",
        "Return type",
        "Verdict",
      ],
      rows,
      viewIntro("boundary-report", report),
    ).split("\n"),
  ];
  lines.push("## Worst boundary debt");
  lines.push("");
  for (const helper of helpers.slice(0, 5)) {
    lines.push(
      `- **${helper.name}** (${helper.verdict}) — ${boundaryNote(helper)}`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}`;
}

// XREF-1: "where used" for components. Each row is a component definition and
// the JSX sites that render it (resolved by symbol, not name). Locations are
// emitted as file:line so peekReferences makes every use site click-to-reveal.
export function renderComponentRefs(report, args) {
  const rows = (report.componentRefs ?? []).slice(0, args.maxItems);
  if (rows.length === 0) {
    return `# References\n\n${viewIntro("component-refs", report).join("\n")}No component usages were resolved in the selected files.\n`;
  }
  return tableReport(
    "References",
    ["Component", "Defined", "Uses", "Used by"],
    rows.map((row) => {
      const shown = row.uses.slice(0, 6).map((u) => `${u.file}:${u.line}`);
      const extra = row.useCount - shown.length;
      return [
        code(row.name),
        `${row.file}:${row.line ?? "?"}`,
        String(row.useCount),
        shown.join("; ") + (extra > 0 ? ` … +${extra} more` : ""),
      ];
    }),
    viewIntro("component-refs", report),
  );
}

export function affectedSinkSummary(sinks) {
  if (!sinks?.length) return "";
  return sinks
    .slice(0, 4)
    .map(
      (sink) => `${sink.file}:${sink.line} ${formatExpression(sink.label, 32)}`,
    )
    .join("; ");
}

// A one-line, human reason for a function's verdict.
function boundaryNote(helper) {
  switch (helper.verdict) {
    case "thin pass-through (inline)":
      return `forwards a parameter with no transformation across ${helper.callerCount} call site(s); inlining removes a hop for free.`;
    case "confluence / junction":
      return `${helper.inSources} source lineages converge here and the result feeds ${helper.callerCount} call sites — a load-bearing knot (see Junctions).`;
    case "leaky boundary":
      return `collapses ${helper.inSources} sources into \`${formatExpression(helper.returnType, 40)}\`; downstream code must re-narrow it. Tighten the type or split the return.`;
    case "messy internals":
      return `internal depth ${helper.internalDepth}, churn ${helper.internalChurn}, ${helper.internalDefenses} defensive op(s) behind a narrow signature.`;
    case "local scalar math":
      return `small same-component scalar calculation; leave it alone or inline into a nearby local if adjacent JSX becomes clearer.`;
    default:
      return `narrow signature, concrete return type — a healthy boundary; leave it.`;
  }
}

// Approach 5 — where independent lineages fork in and re-spread. A junction has
// ≥3 in-sources and ≥2 callers; a heavy confluence has many in-sources but one
// consumer.
export function renderJunctions(report, args) {
  const helpers = report.helpers ?? [];
  const score = (helper) => helper.inSources * Math.max(1, helper.callerCount);
  const junctions = helpers
    .filter((helper) => helper.inSources >= 3 && helper.callerCount >= 2)
    .sort((left, right) => score(right) - score(left))
    .slice(0, args.maxItems);
  const confluences = helpers
    .filter((helper) => helper.inSources >= 3 && helper.callerCount < 2)
    .sort((left, right) => right.inSources - left.inSources)
    .slice(0, args.maxItems);

  const lines = [
    "# Junctions — where independent lineages meet and re-spread",
    "",
    ...viewIntro("junctions", report),
  ];
  if (junctions.length === 0 && confluences.length === 0) {
    lines.push(
      "No confluence functions found on render paths (no helper merges ≥3 source lineages).",
    );
    lines.push("");
    return `${lines.join("\n")}`;
  }
  for (const helper of junctions) {
    lines.push(
      `## ${helper.name}   ${helper.file}:${helper.line}   score ${score(helper)}  (${helper.inSources} in × ${helper.callerCount} out)`,
    );
    lines.push("");
    lines.push(...fenced(junctionBody(helper)));
    lines.push("");
  }
  if (confluences.length > 0) {
    lines.push("## Heavy confluences (many sources in, one consumer)");
    lines.push("");
    for (const helper of confluences) {
      lines.push(
        `- **${helper.name}** (${helper.file}:${helper.line}) — ${helper.inSources} lineages → \`${formatExpression(helper.returnType, 40)}\`. Treat as a boundary to tighten, not a junction to split.`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}`;
}

function junctionBody(helper) {
  const lines = ["tributaries (independent lineages flowing in)"];
  const tribs = (helper.inRoots ?? []).length
    ? helper.inRoots
    : helper.params.map((parameter) => parameter.name);
  for (const trib of tribs.slice(0, 8))
    lines.push(`  ${formatExpression(trib, 48)}`);
  lines.push("distributaries (where the result re-spreads)");
  for (const caller of (helper.callers ?? []).slice(0, 8)) {
    lines.push(`  ${caller.file}:${caller.line}`);
  }
  lines.push("");
  lines.push(
    `Read: ${helper.inSources} source families converge; the result feeds ${helper.callerCount} call sites.`,
  );
  lines.push(
    "Options: formalize as a typed module boundary, or split by distributary if consumers need different shapes.",
  );
  return lines;
}

// Approach 3 — inline-vs-keep decision per reached helper, from its internal
// metrics and caller count (a heuristic preview, not a codemod).
export function renderInlinePreview(report, args) {
  // The point of this view is the actionable verdict, so rank the helpers worth
  // inlining first (INLINE), then the fix-the-boundary cases, with plain KEEP
  // last — otherwise the cap shows a wall of "keep" that tells the reader
  // nothing. Decide on the full list before capping.
  const verdictRank = (verdict) => {
    if (verdict === "INLINE") return 0;
    if (verdict === "KEEP (fix boundary)") return 1;
    if (verdict === "KEEP & FORMALIZE") return 2;
    return 3; // plain KEEP
  };
  const ranked = (report.helpers ?? [])
    .map((helper) => ({ helper, decision: inlineDecision(helper) }))
    .sort(
      (a, b) =>
        verdictRank(a.decision.verdict) - verdictRank(b.decision.verdict),
    );
  const helpers = ranked.slice(0, args.maxItems);
  const lines = [
    "# Inline Preview",
    "",
    ...viewIntro("inline-preview", report),
  ];
  if (helpers.length === 0) {
    lines.push("No first-party helpers were reached on a render path.");
    lines.push("");
    return `${lines.join("\n")}`;
  }
  if (!helpers.some(({ decision }) => decision.verdict === "INLINE")) {
    lines.push(
      "Nothing here is worth inlining — every reached helper is a genuine boundary (verdict KEEP). Listed worst-first for review.",
    );
    lines.push("");
  }
  for (const { helper, decision } of helpers) {
    lines.push(
      `## ${helper.name}  (${helper.file}:${helper.line} · ${helper.callerCount} caller(s) · ${helper.verdict})`,
    );
    lines.push("");
    lines.push(
      ...fenced([
        `as a step:   1 hop`,
        `if inlined:  ~${Math.max(1, helper.internalDepth)} hop(s)   Δ depth ${formatDelta(helper.internalDepth - 1)}, churn ${formatDelta(helper.internalChurn)}, defenses ${formatDelta(helper.internalDefenses)}`,
        `verdict: ${decision.verdict} — ${decision.why}`,
      ]),
    );
    // INLINE-1: list the actual consumers (call sites) so "could this be inlined?"
    // is answerable — you can see every place the fold would land. Caller counts are
    // now truthful across path-alias programs (BUG-2), so a "0 callers" here is real.
    const callers = helper.callers ?? [];
    if (callers.length === 0) {
      lines.push(
        "",
        `Consumers: none resolved${helper.callerCount > 0 ? ` (${helper.callerCount} counted)` : ""}.`,
      );
    } else {
      lines.push("", "Consumers (call sites):");
      for (const caller of callers) {
        lines.push(`- \`${caller.file}:${caller.line}\``);
      }
      if (helper.callerCount > callers.length) {
        lines.push(`- _+${helper.callerCount - callers.length} more_`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}`;
}

function inlineDecision(helper) {
  if (helper.inSources >= 3 && helper.callerCount >= 2) {
    return {
      verdict: "KEEP & FORMALIZE",
      why: `${helper.callerCount} callers + real internal work; inlining would duplicate logic. Make it a typed boundary (see Junctions).`,
    };
  }
  if (helper.passThrough && helper.internalDepth <= 1) {
    return {
      verdict: "INLINE",
      why: `pure forwarding hop${helper.callerCount > 2 ? ` (note: ${helper.callerCount} callers — a codemod, flagged not done)` : ""}.`,
    };
  }
  if (
    helper.callerCount <= 2 &&
    helper.internalDepth <= 2 &&
    !helper.typeLeak
  ) {
    return {
      verdict: "INLINE",
      why: `shallow body, few callers — the helper adds indirection without consolidating much.`,
    };
  }
  if (helper.typeLeak) {
    return {
      verdict: "KEEP (fix boundary)",
      why: `inlining dumps the body into the render leaf; the helper should exist but its type leaks — tighten it instead (see Repair Map).`,
    };
  }
  return {
    verdict: "KEEP",
    why: `genuine transformation (${helper.callerCount} callers, internal depth ${helper.internalDepth}); inlining would relocate the mess, not remove it.`,
  };
}

function formatDelta(value) {
  return value > 0 ? `+${value}` : String(value);
}
