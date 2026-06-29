import { defaultMaxItemsFor } from "../cli/args.mjs";
import { makeFileMatcher } from "../analysis/report-builder.mjs";
import { fenced, viewIntro } from "./markdown-format.mjs";
import { formatExpression } from "./format-helpers.mjs";

// Display label + human kind for a fork-site construct.
const FORK_SITE_KIND = {
  "switch-match": "Match",
  show: "Show",
  ternary: "ternary",
  if: "if",
  logical: "&&/||",
};

function forkSeverityLabel(fork) {
  // Driven by named-value diversity (the real split signal) and severity, which
  // already weights distinct named values × 5.
  const named = fork.namedValues?.length ?? 0;
  if (named >= 3 || fork.severity >= 16) return "HIGH";
  if ((named >= 2 && fork.confidence === "high") || fork.severity >= 10)
    return "MEDIUM";
  return "LOW";
}

export function renderRepeatedForks(report, args) {
  const fileMatch = makeFileMatcher(args.file);
  const all = report.repeatedForks ?? [];
  const forks = fileMatch ? all.filter((fork) => fileMatch(fork.file)) : all;
  const maxItems = args.maxItems ?? defaultMaxItemsFor("repeated-forks");
  const selected = forks.slice(0, maxItems);

  const lines = [
    "# Repeated Fork → Split Candidates",
    "",
    ...viewIntro("repeated-forks", report),
  ];

  if (forks.length === 0) {
    lines.push(
      "_No component tests the same discriminant across multiple sibling branch sites. " +
        "Nothing here suggests a discriminated split._",
      "",
    );
    return `${lines.join("\n")}\n`;
  }

  if (forks.length > selected.length) {
    lines.push(
      `_Showing top ${selected.length} of ${forks.length} candidates (raise with --max-items)._`,
      "",
    );
  }

  for (const fork of selected) {
    const component = fork.component ?? "(anonymous render scope)";
    lines.push(
      `## ${fork.id} · ${forkSeverityLabel(fork)} · \`${component}\` forks on \`${fork.discriminant}\``,
    );
    lines.push(`${fork.file}:${fork.componentLine ?? fork.line}`);
    lines.push("");

    lines.push("**Discriminant**");
    lines.push("");
    lines.push(...fenced([fork.discriminant]));
    lines.push("");
    if (fork.branchValues.length > 0) {
      lines.push(
        `Branch values: ${fork.branchValues.map((value) => `\`${value}\``).join(", ")}`,
      );
      lines.push("");
    }

    lines.push("**Fork sites**");
    lines.push("");
    lines.push("| Where | Construct | Branch | Condition |");
    lines.push("| --- | --- | --- | --- |");
    for (const site of fork.sites) {
      lines.push(
        `| ${fork.file}:${site.line} | ${FORK_SITE_KIND[site.kind] ?? site.kind} | ${
          site.value != null ? `\`${site.value}\`` : "—"
        } | \`${site.snippet}\` |`,
      );
    }
    lines.push("");

    if (fork.branchExclusive && fork.branchExclusive.length > 0) {
      lines.push("**Branch-exclusive eager computation**");
      lines.push("");
      lines.push(
        "These component-scope values are computed regardless of branch but read under only one:",
      );
      lines.push("");
      for (const decl of fork.branchExclusive) {
        lines.push(
          `- \`${decl.name}\` (${fork.file}:${decl.line}) — used only when \`${decl.branch}\``,
        );
      }
      lines.push("");
    }

    const gated = fork.branchGatedSinks ?? [];
    const related = fork.relatedSinks ?? [];
    if (gated.length > 0) {
      lines.push("**Findings under the discriminated branches**");
      lines.push("");
      lines.push(
        `${gated.length} ranked finding(s) render inside the \`${fork.discriminant}\` branches — these move with a split` +
          (related.length > gated.length
            ? ` (${related.length} total in \`${component}\`).`
            : "."),
      );
      lines.push("");
      for (const sink of gated.slice(0, 8)) {
        lines.push(
          `- ${sink.id} — \`${formatExpression(sink.label, 60)}\` (${fork.file}:${sink.line})`,
        );
      }
      lines.push("");
    } else if (related.length > 0) {
      lines.push("**Findings in this component**");
      lines.push("");
      lines.push(
        `${related.length} ranked finding(s) render in \`${component}\` (none lie directly inside a discriminated branch body):`,
      );
      lines.push("");
      for (const sink of related.slice(0, 6)) {
        lines.push(
          `- ${sink.id} — \`${formatExpression(sink.label, 60)}\` (${fork.file}:${sink.line})`,
        );
      }
      lines.push("");
    }

    lines.push("**Recommendation**");
    lines.push("");
    lines.push(forkRecommendation(fork, component));
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function forkRecommendation(fork, component) {
  // Only suggest concrete sub-component names when the component has a usable
  // PascalCase name and the branches key on ≥2 named domain values; otherwise
  // the generated names ("EnterCombobox") are noise.
  const named = fork.namedValues ?? [];
  const isPascal = /^[A-Z][A-Za-z0-9]*$/.test(component);
  const subComponents =
    named.length >= 2 && isPascal
      ? named
          .slice(0, 3)
          .map((value) => `\`${pascalish(value)}${component}\``)
          .join(" / ")
      : "one sub-component per branch";
  const eager =
    fork.branchExclusive && fork.branchExclusive.length > 0
      ? ` Each branch already computes ${fork.branchExclusive.length} value(s) eagerly that only one path reads — moving those into the matching sub-component removes the cross-branch waste.`
      : "";
  return (
    `\`${component}\` discriminates on \`${fork.discriminant}\` in ${fork.siteCount} render-path sites. ` +
    `Lift the decision to a single top-level split (${subComponents}) so each sub-component computes its own data in place instead of forking the same condition repeatedly.${eager}`
  );
}

// "bar" -> "Bar", "line-chart" -> "LineChart"; best-effort label for a suggested
// sub-component name. Non-identifier values fall back to a generic tag.
function pascalish(value) {
  const cleaned = String(value)
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();
  if (!cleaned) return "Branch";
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}
