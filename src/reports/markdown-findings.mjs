import { unique } from "../analysis/collections.mjs";
import { findingTitle } from "../analysis/finding-title.mjs";
import { fanOutRootsFor } from "../analysis/fan-out.mjs";
import { fenced, metricTable, viewIntro } from "./markdown-format.mjs";
import { formatExpression } from "./format-helpers.mjs";
import {
  selectWorkItems,
  selectionBanner,
  suppressionLines,
} from "./markdown-selection.mjs";

export function renderFindings(report, args, { appendBaseline }) {
  const selection = selectWorkItems(report, { ...args, units: false });
  const sinks = selection.selected;
  const lines = [
    "# Render-Path Findings",
    "",
    ...viewIntro("findings", report),
  ];
  const banner = selectionBanner(selection, args);
  if (banner) lines.push(banner, "");
  lines.push(...suppressionLines(selection.suppressed));
  for (const sink of sinks) {
    lines.push(`## ${sink.id} · ${severityFor(sink)} · ${findingTitle(sink)}`);
    lines.push(`${sink.file}:${sink.line}`);
    lines.push("");
    lines.push("**Sink**");
    lines.push("");
    lines.push(...fenced([formatExpression(sink.expression)]));
    lines.push("");
    lines.push("**Source**");
    lines.push("");
    lines.push(...fenced([actionableSourceLabels(sink)]));
    lines.push("");
    lines.push("**Metrics**");
    lines.push("");
    lines.push(
      ...metricTable([
        ["path depth", sink.metrics.maximumPathDepth],
        ["helper hops", sink.metrics.helperHops],
        ["representation churn", sink.metrics.representationChurn],
        ["defensive operations", sink.metrics.defensiveOperationCount],
        ["impossible defenses", sink.metrics.impossibleDefenseCount],
        ["pack risk", sink.metrics.packRisk],
        ["downstream sink count", sink.metrics.reachableSinks],
        ["centrality percentile", Math.round(sink.scores.centrality * 100)],
        ["analysis confidence", `${sink.confidence}%`],
      ]),
    );
    lines.push("");
    lines.push(`Confidence: ${sink.confidence}%`);
    lines.push(`Reason: ${sink.confidenceReason}`);
    lines.push(`Risk: ${sink.confidenceRisk}`);
    lines.push("");
    const contributions = metricContributionLines(sink);
    if (contributions.length > 0) {
      lines.push("**Metric contributions**");
      lines.push("");
      lines.push(...fenced(contributions));
      lines.push("");
    }
    lines.push("**Representative path**");
    lines.push("");
    lines.push(...fenced(representativePathLines(sink)));
    lines.push("");
    lines.push("**Finding**");
    lines.push("");
    lines.push(findingSentence(sink));
    lines.push("");
  }
  appendBaseline(lines, report);
  return `${lines.join("\n")}\n`;
}

// Phase 8 — itemize which exact path operations produced the headline metric
// counts, so a "defensive operations: 2" is backed by the two steps that caused
// it. Driven by the representative (longest) path steps.
function metricContributionLines(sink) {
  const steps = sink.representativeSteps ?? [];
  const lines = [];
  const defensive = steps.filter(
    (step) => step.kind === "fallback" || step.kind === "optional-read",
  );
  const helpers = steps.filter((step) => step.kind === "call");
  // Counts are for the representative (longest) path only, so they can be lower
  // than the whole-trace metric totals; the heading says so to avoid confusion.
  if (defensive.length > 0) {
    lines.push(`defensive operations on this path: ${defensive.length}`);
    for (const step of defensive) {
      lines.push(`  - ${formatExpression(step.label, 60)}  [${step.kind}]`);
    }
  }
  if (helpers.length > 0) {
    lines.push(`helper hops on this path: ${helpers.length}`);
    for (const step of helpers) {
      lines.push(`  - ${formatExpression(step.label, 60)}  [call]`);
    }
  }
  return lines;
}

// One-lined, kind-annotated path steps for the fenced prose renderers. The
// per-step operation kind comes from representativeSteps (P5); falls back to the
// plain label array for any record analyzed before steps were threaded through.
function representativePathLines(sink, { showKind = true } = {}) {
  const steps =
    sink.representativeSteps ??
    sink.representativePath.map((label) => ({ label, kind: null }));
  if (steps.length === 0) return ["(no path)"];
  return steps.map((step) => {
    const label = formatExpression(step.label);
    return showKind && step.kind
      ? `-> ${label}  [${step.kind}]`
      : `-> ${label}`;
  });
}

// Actionable domain sources for a sink: named locals and qualified property
// reads (props.meta), with literals, bare parameters, language globals, and
// inline function bodies dropped via fanOutRootsFor. Capped with a `(+N more)`.
export function actionableSourceLabels(sink, max = 6) {
  const labels = unique(
    fanOutRootsFor(sink).map((info) => formatExpression(info.label, 60)),
  );
  if (labels.length === 0) return "unknown";
  if (labels.length <= max) return labels.join(", ");
  return `${labels.slice(0, max).join(", ")} (+${labels.length - max} more)`;
}

function findingSentence(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) {
    return "A nullish fallback or optional access is unreachable under the checked TypeScript program.";
  }
  return "This rendered value has more data-flow plumbing than nearby JSX should usually need.";
}

export function severityFor(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) return "HIGH";
  if (sink.scores.burden > 0.55) return "MEDIUM";
  return "LOW";
}
