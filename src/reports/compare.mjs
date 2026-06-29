import {
  compareNumberLabel,
  formatDeltaLabel,
  formatOptionalNumber,
  formatWorstMetric,
  readReportDirectorySummary,
  remainingFindingFamilies,
  removedFindingFamilies,
} from "./baseline-parser.mjs";
import { commandPath, formatMarkdownTable } from "./markdown-format.mjs";

export function renderCompareReport(report, args, helpers) {
  const { reportSummaryForCompare, stopRecommendationFor } = helpers;
  const baseline = readReportDirectorySummary(args.compare);
  const current = reportSummaryForCompare(report);
  const lines = [
    "# tsx-dataflow Compare",
    "",
    `Baseline: ${commandPath(args.compare)}`,
    "After: current run",
    "",
    "## Summary",
    "",
    ...formatMarkdownTable(
      ["Computed signal", "Baseline", "After", "Delta"],
      [
        [
          "Worst burden score",
          formatWorstMetric(baseline),
          formatWorstMetric(current),
          compareNumberLabel(baseline.worstScore, current.worstScore, true),
        ],
        [
          "Finding count (hotspots)",
          formatOptionalNumber(baseline.hotspots),
          String(current.hotspots),
          formatDeltaLabel(baseline.hotspots, current.hotspots, true),
        ],
        [
          "Defensive operation entries",
          formatOptionalNumber(baseline.defensiveEntries),
          String(current.defensiveEntries),
          formatDeltaLabel(
            baseline.defensiveEntries,
            current.defensiveEntries,
            true,
          ),
        ],
        [
          "Representation-only wrapper steps",
          formatOptionalNumber(baseline.wrappers),
          String(current.wrappers),
          formatDeltaLabel(baseline.wrappers, current.wrappers, true),
        ],
      ],
    ),
    "",
    "_These are analyzer-computed signals, not product accounts or runtime telemetry. Wrapper steps are the summed `representationChurn` metric: aliases, object packs, spreads, and other representation-only repacks on render paths._",
    "",
    "## How to read the deltas",
    "",
    ...formatMarkdownTable(
      ["Signal", "What it measures", "How to weigh it"],
      [
        [
          "Worst burden score",
          "The single heaviest render path, normalized 0–1 from depth, helper hops, wrapper steps, defenses, impossible defenses, control flow, and repeated normalization.",
          "Use as the headline local pain signal. It can stay flat when the same worst path remains even if broad cleanup improves elsewhere.",
        ],
        [
          "Finding count (hotspots)",
          "How many ranked render sinks remain after filtering.",
          "Use as breadth. Large drops mean less overall surface area; large counts can still be acceptable when remaining rows are low-risk background paths.",
        ],
        [
          "Defensive operation entries",
          "Unique optional reads and fallback operations on render paths.",
          "Prioritize impossible or unknown defenses first because they often point to stale guards or unclear contracts.",
        ],
        [
          "Representation-only wrapper steps",
          "Alias/object-pack/spread hops that change shape without adding product behavior.",
          "Treat a spike as a reviewability warning, not automatic failure. It matters most when worst burden, relay/overpacked findings, or defensive entries do not improve with it.",
        ],
      ],
    ),
    "",
  ];

  const removed = removedFindingFamilies(baseline, current);
  if (removed.length > 0) {
    lines.push("## Removed finding families", "");
    for (const item of removed) lines.push(`- ${item}`);
    lines.push("");
  }

  const remaining = remainingFindingFamilies(current);
  if (remaining.length > 0) {
    lines.push("## Remaining finding families", "");
    for (const item of remaining) lines.push(`- ${item}`);
    lines.push("");
  }

  const stop = stopRecommendationFor(report);
  lines.push("## Verdict", "");
  lines.push(
    stop.recommend
      ? `Verdict: improvement; stop local cleanup. ${stop.reason}`
      : `Verdict: continue cleanup. ${stop.reason}`,
  );
  lines.push("");
  if (baseline.missing.length > 0) {
    lines.push(
      `Note: baseline was missing ${baseline.missing.join(", ")}; omitted metrics are shown as n/a.`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
