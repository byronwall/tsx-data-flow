import path from "node:path";
import { REPORT_VIEWS } from "../cli/args.mjs";
import { findingTitle } from "../analysis/finding-title.mjs";
import { primaryAdviceShape } from "../analysis/sink-shape.mjs";
import {
  code,
  formatMarkdownTable,
  viewIntro,
  VIEW_BLURBS,
} from "./markdown-format.mjs";
import { formatExpression } from "./format-helpers.mjs";
import { affectedSinkSummary } from "./markdown-boundary-views.mjs";
import { concentrationLines } from "./markdown-selection.mjs";
import {
  firstCutFor,
  hotspotGroups,
  modalValue,
} from "./overview-selectors.mjs";
import {
  localFirstCutForCluster,
  ownershipHintFor,
  providerContextEvidenceFor,
  providerEvidenceSummary,
} from "./markdown-work-advice.mjs";

function primaryShapeOf(sink) {
  return primaryAdviceShape(sink) ?? "uncategorized";
}

// MD-5: the consolidated, agent- *and* human-facing summary. It absorbs the old
// repair-map, hotspots, and unknown-edges aggregators into ONE document and opens
// with a manifest of every other report, so an agent landing in the dumped markdown
// has a single place to orient before reading the focused reports.
function reportManifestLines() {
  const lines = [
    "## Report guide",
    "",
    "Every analysis is emitted as its own markdown file. Start here, then open the one that fits the task:",
    "",
  ];
  for (const view of REPORT_VIEWS) {
    if (view === "overview") continue;
    const blurb = VIEW_BLURBS[view] ?? "";
    // First sentence only — a one-line purpose, not the full intro.
    const purpose = blurb ? blurb.split(/(?<=\.)\s/)[0] : "";
    lines.push(`- \`${view}.md\` — ${purpose}`);
  }
  lines.push("");
  return lines;
}

export function renderOverviewReport(
  report,
  args,
  { appendBaseline, stopRecommendationFor },
) {
  const lines = ["# Overview", "", ...viewIntro("overview", report)];
  lines.push(...reportManifestLines());

  // Concentration + feature clusters (from the old repair-map).
  appendFeatureClusters(lines, report, args);
  lines.push(...concentrationLines(report, report.rankings.all.length));

  // Hotspots: one row per file (or per feature with --by feature) so the spread of
  // work is visible at a glance (old hotspots view).
  const by = args.by === "feature" ? "feature" : "file";
  const groups = hotspotGroups(report, by).slice(0, args.maxItems);
  if (groups.length) {
    lines.push("## Hotspots", "");
    lines.push(
      ...formatMarkdownTable(
        [
          by === "feature" ? "Feature" : "File",
          "Findings",
          "Worst",
          "Dominant shape",
          "Ownership",
          "First cut",
        ],
        groups.map((group) => [
          group.key,
          String(group.count),
          group.worst.toFixed(2),
          modalValue(group.shapes),
          modalValue(group.ownership),
          firstCutFor(group.worstSink),
        ]),
      ),
    );
    lines.push("");
  }

  // Repair buckets (old repair-map).
  for (const [heading, sinks] of [
    ["Peripheral quick wins", report.rankings.quickWins],
    ["Central leverage", report.rankings.centralLeverage],
    ["Investigate", report.rankings.investigations],
  ]) {
    lines.push(`## ${heading}`, "");
    const selected = (sinks ?? []).slice(0, args.maxItems);
    if (selected.length === 0) lines.push("- none");
    selected.forEach((sink) => {
      lines.push(
        `- **${sink.scores.burden.toFixed(1)}** ${sink.file}:${sink.line} — ${findingTitle(sink)} _(${ownershipHintFor(sink)})_`,
      );
    });
    lines.push("");
  }

  // Unknown edges, folded in as a diagnostic section (not its own file). The user
  // keeps the signal — "if a whole file is unknown, that flags a problem."
  const unknown = (report.unknownEdges ?? []).slice(0, args.maxItems);
  lines.push("## Unknown edges (diagnostic)", "");
  if (unknown.length === 0) {
    lines.push("No unresolved graph edges in the selected render paths.", "");
  } else {
    lines.push(
      ...formatMarkdownTable(
        ["Where", "Kind", "Unresolved", "Affected sinks"],
        unknown.map((row) => [
          `${row.file}:${row.line ?? "?"}`,
          row.kind,
          code(formatExpression(row.label, 48)),
          affectedSinkSummary(row.affectedSinks),
        ]),
      ),
    );
    lines.push("");
  }

  appendStopRecommendation(lines, report, stopRecommendationFor);
  appendBaseline(lines, report);
  return `${lines.join("\n")}\n`;
}

export function appendStopRecommendation(lines, report, stopRecommendationFor) {
  const stop = stopRecommendationFor(report);
  lines.push("## Stop Recommendation");
  lines.push("");
  lines.push(`Stop recommendation: ${stop.recommend ? "yes" : "no"}`);
  lines.push(`Reason: ${stop.reason}`);
  if (stop.recommend) {
    lines.push(
      "Next useful work would require broader architecture changes, not local cleanup.",
    );
  }
  lines.push("");
}

export function appendFeatureClusters(lines, report, args) {
  const rows = featureClusterRows(report.rankings.all).slice(
    0,
    Math.min(args.maxItems, 8),
  );
  if (rows.length === 0) return;
  lines.push("## Feature Clusters");
  lines.push("");
  lines.push(
    ...formatMarkdownTable(
      [
        "Feature area",
        "Sinks",
        "Files",
        "Max depth",
        "Wrapper steps",
        "Suggested first cut",
        "Evidence",
      ],
      rows,
    ),
  );
  lines.push("");
}

function featureClusterRows(sinks) {
  const clusters = new Map();
  for (const sink of sinks) {
    const key = featureKeyFor(sink.file);
    const cluster = clusters.get(key) ?? {
      sinks: 0,
      files: new Set(),
      maxDepth: 0,
      wrappers: 0,
      providerContextSignals: 0,
      evidence: [],
      localSignals: 0,
      shapes: [],
    };
    cluster.sinks += 1;
    cluster.files.add(sink.file);
    cluster.maxDepth = Math.max(
      cluster.maxDepth,
      sink.metrics.maximumPathDepth,
    );
    cluster.wrappers += sink.metrics.representationChurn;
    const evidence = providerContextEvidenceFor(sink);
    if (evidence.eligible) cluster.providerContextSignals += 1;
    else cluster.localSignals += 1;
    cluster.evidence.push(evidence.reason);
    cluster.shapes.push(primaryShapeOf(sink));
    clusters.set(key, cluster);
  }
  return Array.from(clusters.entries())
    .map(([feature, cluster]) => {
      const providerShare =
        cluster.providerContextSignals / Math.max(1, cluster.sinks);
      const providerContext =
        cluster.providerContextSignals >= 2 ||
        (cluster.providerContextSignals > 0 && providerShare >= 0.35);
      return [
        feature,
        String(cluster.sinks),
        String(cluster.files.size),
        String(cluster.maxDepth),
        String(cluster.wrappers),
        providerContext
          ? "Provider/Context audit"
          : localFirstCutForCluster(cluster),
        providerContext
          ? providerEvidenceSummary(cluster.evidence)
          : "no provider/context signals",
      ];
    })
    .sort(
      (left, right) =>
        Number(right[1]) - Number(left[1]) ||
        Number(right[3]) - Number(left[3]) ||
        Number(right[4]) - Number(left[4]),
    );
}

function featureKeyFor(file) {
  const parts = file.split("/");
  const sourceIndex = parts.findIndex((part) => part === "src");
  const offset = sourceIndex >= 0 ? sourceIndex + 1 : 0;
  const directoryParts = parts.slice(
    offset,
    Math.max(offset + 1, parts.length - 1),
  );
  return directoryParts.slice(0, 3).join("/") || path.dirname(file);
}
