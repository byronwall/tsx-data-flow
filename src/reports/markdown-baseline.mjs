import { fenced, metricTable } from "./markdown-format.mjs";
import { formatExpression } from "./format-helpers.mjs";

export function appendBaseline(lines, report) {
  if (!report.baseline) return;
  const baseline = report.baseline;
  lines.push("## Baseline");
  lines.push("");
  lines.push(
    ...metricTable([
      ["current worst", baseline.currentWorst.toFixed(2)],
      ["baseline worst", baseline.baselineWorst.toFixed(2)],
      ["regressed", baseline.regressed ? "yes" : "no"],
    ]),
  );

  const changes = [];
  for (const item of baseline.removed ?? []) {
    changes.push(
      `Removed:   ${formatExpression(item.label, 60)}${item.depth != null ? ` (depth ${item.depth})` : ""}`,
    );
  }
  for (const item of baseline.improved ?? []) {
    changes.push(
      `Improved:  ${item.file}:${item.line} ${item.before} -> ${item.after}`,
    );
  }
  for (const item of baseline.regressedSinks ?? []) {
    changes.push(
      `Regressed: ${item.file}:${item.line} ${item.before} -> ${item.after}`,
    );
  }
  if (baseline.newTop) {
    changes.push(
      `New top:   ${baseline.newTop.file}:${baseline.newTop.line} ${formatExpression(baseline.newTop.label, 48)}`,
    );
  }
  if (changes.length > 0) {
    lines.push("");
    lines.push(...fenced(changes));
  }
}
