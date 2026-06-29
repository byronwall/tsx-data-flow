import path from "node:path";
import { REPORT_VIEWS, defaultMaxItemsFor } from "../cli/args.mjs";
import { unique } from "../analysis/collections.mjs";
import { findingTitle } from "../analysis/finding-title.mjs";
import { isCertaintyBoundaryDefense } from "../analysis/source-file.mjs";
import { fanOutIdentity, fanOutRootsFor } from "../analysis/fan-out.mjs";
import {
  packGroupForSink,
  packRiskForVerdict,
} from "../analysis/pack-groups.mjs";
import { familyRows } from "../analysis/ranking.mjs";
import { makeFileMatcher } from "../analysis/report-builder.mjs";
import {
  classifyPathShape,
  primaryAdviceShape,
  sinkAttributeName,
  sinkFamilyOf,
} from "../analysis/sink-shape.mjs";
import {
  code,
  fenced,
  formatMarkdownTable,
  metricTable,
  tableReport,
  viewIntro,
  VIEW_BLURBS,
} from "./markdown-format.mjs";
import {
  articleFor,
  camelCase,
  camelWords,
  collapse,
  formatExpression,
  paramNameFor,
  pascalCase,
  stepVerb,
  wordsFromIdentifier,
} from "./format-helpers.mjs";
import {
  reportSummaryForCompare as reportSummaryForCompareImpl,
  stopRecommendationFor as stopRecommendationForImpl,
} from "./compare-summary.mjs";
import {
  fanOutEntriesGlobal,
  firstCutFor,
  hotspotGroups,
  modalValue,
} from "./overview-selectors.mjs";

// Analyzer jargon and tidy-but-vague names that must never be suggested as code
// identifiers. Reports may use these words in prose; generated code names must
// describe the rendered thing instead (Taste #1/#4).
const BANNED_SUGGESTION_IDENTIFIERS = [
  "pivot",
  "sinkData",
  "fanInResult",
  "transformedProps",
  "viewModel",
  "renderModel",
  "layout",
  "geometryModel",
  "renderValue",
  "selectedValue",
  "profileData",
  "ItemModel",
];

export function renderMarkdownView(report, args) {
  switch (args.view) {
    case "overview":
      return renderOverviewReport(report, args);
    case "findings":
      return renderFindings(report, args);
    case "repeated-forks":
      return renderRepeatedForks(report, args);
    case "work-packets":
      return renderWorkPackets(report, args);
    case "fan-out":
      return renderFanOut(report, args);
    case "fan-in":
      return renderFanIn(report, args);
    case "path-families":
      return renderPathFamilies(report, args);
    case "defensive-ledger":
      return renderDefensiveLedger(report, args);
    case "prop-relay":
      return renderPropRelay(report, args);
    case "context-relay":
      return renderContextRelay(report, args);
    case "boundary-report":
      return renderBoundaryReport(report, args);
    case "component-refs":
      return renderComponentRefs(report, args);
    case "junctions":
      return renderJunctions(report, args);
    case "inline-preview":
      return renderInlinePreview(report, args);
    default:
      return renderWorkPackets(report, args);
  }
}

// THRESH-1: a "usage" is a trivial, shallow expression with no actionable
// signal — e.g. a bare `props.search` read flowing straight into a sink (burden
// ~0.05, the path-depth term only). These are not smells; they are proof a value
// is used. We keep them (browsable, jump-to-definition) but tag them `usage` so
// the UI can demote them out of the findings list, which otherwise fills with
// "the simplest usage possible" noise. Reach/fan-out is deliberately NOT a
// signal here: a plain prop read that feeds many sinks is still just a usage.
// --- Selection layer: depth vs. breadth -----------------------------------
// `rankings.all` is a pure descending-burden sort, which clusters: a few heavy
// files monopolize the top. These helpers re-select over that ranking to add
// breadth — diversity caps (Approach 1), MMR (Approach 2), coverage round-robin
// (Approach 6), or shared-cause work units (Approach 3) — without ever dropping
// the single worst sink. Today's behavior is `--sort burden` (the default).

const DEFAULT_PER_FILE = 2;
const DEFAULT_PER_FEATURE = 4;

// The primary actionable source ("pivot") and primary shape tag of a sink — the
// redundancy/grouping keys shared by MMR and work-unit grouping.
function primaryPivotOf(sink) {
  const roots = fanOutRootsFor(sink);
  return roots.length ? formatExpression(roots[0].label, 40) : null;
}
function primaryShapeOf(sink) {
  return primaryAdviceShape(sink) ?? "uncategorized";
}

// For each file with at least one shown item, how many of its ranked siblings
// were NOT shown — the "+N more" collapsed tally that keeps the concentration
// signal visible (the "don't hide the worst" risk).
function suppressionFor(allItems, selected) {
  const totalByFile = countBy(allItems.map((item) => item.file));
  const selectedByFile = countBy(selected.map((item) => item.file));
  const suppressed = new Map();
  for (const [file, total] of Object.entries(totalByFile)) {
    const shown = selectedByFile[file] ?? 0;
    if (shown > 0 && total > shown) suppressed.set(file, total - shown);
  }
  return suppressed;
}

// Approach 1 — per-file / per-feature diversity caps. Walks the burden-sorted
// list admitting an item only while its file and feature quotas have room.
function selectSpread(items, args) {
  const perFile = args.perFile ?? DEFAULT_PER_FILE;
  const perFeature = args.perFeature ?? DEFAULT_PER_FEATURE;
  const fileCount = new Map();
  const featureCount = new Map();
  const selected = [];
  for (const item of items) {
    if (selected.length >= args.maxItems) break;
    const feature = featureKeyFor(item.file);
    const fc = fileCount.get(item.file) ?? 0;
    const ec = featureCount.get(feature) ?? 0;
    if (fc < perFile && ec < perFeature) {
      selected.push(item);
      fileCount.set(item.file, fc + 1);
      featureCount.set(feature, ec + 1);
    }
  }
  return { selected, suppressed: suppressionFor(items, selected) };
}

// Approach 6 (coverage) — one item per file (best first) until every file is
// represented or the list fills, then fill remaining slots by burden.
function selectCoverage(items, args) {
  const selected = [];
  const chosen = new Set();
  const seenFiles = new Set();
  for (const item of items) {
    if (selected.length >= args.maxItems) break;
    if (!seenFiles.has(item.file)) {
      selected.push(item);
      chosen.add(item);
      seenFiles.add(item.file);
    }
  }
  for (const item of items) {
    if (selected.length >= args.maxItems) break;
    if (!chosen.has(item)) {
      selected.push(item);
      chosen.add(item);
    }
  }
  return { selected, suppressed: suppressionFor(items, selected) };
}

// Approach 2 — Maximal Marginal Relevance. Greedily pick the item maximizing
// burden − λ·redundancy, where redundancy rises when an item shares a file,
// shape, or pivot with what is already selected. λ scales with --diversity.
function selectMMR(items, args) {
  const lambda = clamp01(args.diversity);
  const maxBurden = Math.max(
    0.0001,
    ...items.map((item) => item.scores.burden),
  );
  const pool = items.slice();
  const selected = [];
  const fileCount = new Map();
  const shapeCount = new Map();
  const pivotCount = new Map();
  while (selected.length < args.maxItems && pool.length > 0) {
    const n = selected.length;
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < pool.length; index += 1) {
      const item = pool[index];
      const redundancy =
        n === 0
          ? 0
          : 0.5 * ((fileCount.get(item.file) ?? 0) / n) +
            0.25 * ((shapeCount.get(primaryShapeOf(item)) ?? 0) / n) +
            0.25 * ((pivotCount.get(primaryPivotOf(item)) ?? 0) / n);
      const score = item.scores.burden - lambda * maxBurden * redundancy;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const [picked] = pool.splice(bestIndex, 1);
    selected.push(picked);
    fileCount.set(picked.file, (fileCount.get(picked.file) ?? 0) + 1);
    const shape = primaryShapeOf(picked);
    shapeCount.set(shape, (shapeCount.get(shape) ?? 0) + 1);
    const pivot = primaryPivotOf(picked);
    if (pivot) pivotCount.set(pivot, (pivotCount.get(pivot) ?? 0) + 1);
  }
  return { selected, suppressed: suppressionFor(items, selected) };
}

// The selection used by the packet/finding views. Picks the unit/sink list per
// --units + --sort + --diversity, never dropping the worst item. Returns the
// chosen items, the suppression tally, and the resolved mode for the banner.
function selectWorkItems(report, args) {
  const mode = args.sort ?? "burden";
  const useUnits = Boolean(args.units) && mode !== "quick-win";
  let pool = useUnits ? report.workUnits : report.rankings.all;
  if (args.view === "work-packets") {
    const actionable = pool.filter((item) => !item.background);
    if (actionable.length > 0) pool = actionable;
  }

  if (mode === "quick-win") {
    const quickIds = new Set(report.rankings.quickWins.map((sink) => sink.id));
    pool = report.rankings.quickWins
      .filter((sink) => !sink.background)
      .concat(report.rankings.all.filter((sink) => !quickIds.has(sink.id)));
    if (args.view === "work-packets")
      pool = pool.filter((sink) => !sink.background);
  }

  let result;
  if (args.diversity != null) {
    result = selectMMR(pool, args);
  } else if (mode === "spread") {
    result = selectSpread(pool, args);
  } else if (mode === "coverage") {
    result = selectCoverage(pool, args);
  } else {
    result = { selected: pool.slice(0, args.maxItems), suppressed: new Map() };
  }
  return { ...result, useUnits, mode };
}

// A one-line banner describing the active selection mode (omitted for the
// default burden sort so today's output is unchanged at the top).
function selectionBanner(selection, args) {
  if (args.diversity != null) {
    return `_Ranked by burden, diversified (--diversity ${args.diversity}). Redundant siblings deferred._`;
  }
  switch (selection.mode) {
    case "spread":
      return `_Spread mode: ≤${args.perFile ?? DEFAULT_PER_FILE} per file, ≤${args.perFeature ?? DEFAULT_PER_FEATURE} per feature. ${selection.selected.length} shown across ${plural(new Set(selection.selected.map((item) => item.file)).size, "file")}._`;
    case "coverage":
      return "_Sort: coverage — at most one packet per file until every file is represented, then fill remaining slots by burden._";
    case "quick-win":
      return "_Sort: quick-win — peripheral, high-confidence, low-change-risk sinks first._";
    default:
      return null;
  }
}

// The collapsed "still hot" note for cap-demoted siblings (Approach 1).
function suppressionLines(suppressed) {
  if (!suppressed || suppressed.size === 0) return [];
  const parts = Array.from(suppressed.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([file, count]) => `${file.split("/").at(-1)} +${count}`);
  return [
    `_Suppressed (still hot, shown collapsed): ${parts.join(", ")} — see the Hotspots section of \`--view overview\` for the full count._`,
    "",
  ];
}

// Approach 5 — the "Coverage" paragraph shown in the packet/repair-map headers.
function concentrationLines(report, shownCount) {
  const concentration = report.concentration;
  if (!concentration || concentration.fileCount === 0) return [];
  const pct = (value) => `${Math.round(value * 100)}%`;
  const topFiles = Math.min(5, concentration.fileCount);
  let sentence = `_${shownCount} shown. Ranked burden is concentrated: top ${plural(topFiles, "file")} = ${pct(concentration.top5)}`;
  if (concentration.fileCount > 9)
    sentence += `, top 9 = ${pct(concentration.top9)}`;
  sentence += `. ${plural(concentration.fileCount, "file")} ${concentration.fileCount === 1 ? "carries" : "carry"} ≥1 finding`;
  if (concentration.hot4Plus > 0)
    sentence += `, ${concentration.hot4Plus} have ≥4`;
  sentence +=
    ". Use --spread / --diversity to widen; the Hotspots section below has the full per-file map._";
  return ["**Coverage**", "", sentence, ""];
}

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

function renderRepeatedForks(report, args) {
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

function renderFindings(report, args) {
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
function actionableSourceLabels(sink, max = 6) {
  const labels = unique(
    fanOutRootsFor(sink).map((info) => formatExpression(info.label, 60)),
  );
  if (labels.length === 0) return "unknown";
  if (labels.length <= max) return labels.join(", ");
  return `${labels.slice(0, max).join(", ")} (+${labels.length - max} more)`;
}

function renderWorkPackets(report, args) {
  const selection = selectWorkItems(report, args);
  const sinks = selection.selected;
  const renderGroups = groupedRenderRecommendations(report.rankings.all);
  const lines = [
    "# Render-Path Data-Flow Work Packets",
    "",
    ...viewIntro("work-packets", report),
  ];
  const banner = selectionBanner(selection, args);
  if (banner) lines.push(banner, "");
  lines.push(...suppressionLines(selection.suppressed));
  appendFeatureClusters(lines, report, args);
  appendGroupedRecommendations(lines, report, args);
  lines.push(...concentrationLines(report, sinks.length));
  const itemKind = selection.useUnits ? "WORK UNIT" : "WORK ITEM";
  sinks.forEach((sink, index) => {
    const group = packGroupForSink(sink, report.packGroups);
    lines.push(
      `## ${itemKind} DF-${String(index + 1).padStart(3, "0")}  ·  ${sink.id}`,
    );
    lines.push(`Simplify ${formatExpression(sink.label, 80)} in ${sink.file}`);
    lines.push("");
    if (selection.useUnits && sink.unit && sink.unit.sinkCount > 1) {
      lines.push(
        `**Unit impact** — fix once, ${sink.unit.sinkCount} sinks in this file improve.`,
      );
      lines.push("");
      lines.push(
        ...formatMarkdownTable(
          ["sinks improved", "shared pivot", "shared cause"],
          [
            [
              String(sink.unit.sinkCount),
              sink.unit.pivots.join(", ") || "—",
              sink.unit.causes.join(", ") || "—",
            ],
          ],
        ),
      );
      lines.push("");
      lines.push(
        `covers: ${sink.unit.members.map((member) => `${member.label} (L${member.line})`).join(", ")}`,
      );
      lines.push("");
    }
    lines.push("**Review summary**");
    lines.push("");
    lines.push(reviewerSummaryFor(sink, group));
    lines.push("");
    lines.push("**Scope**");
    lines.push("");
    lines.push(
      ...metricTable([
        ["pivot", code(actionableSourceLabels(sink, 3))],
        ["files", 1],
        ["source inputs", Math.max(1, sink.metrics.mergeWidth)],
        ["reachable sinks", sink.metrics.reachableSinks],
        ["confidence", `${sink.confidence}%`],
      ]),
    );
    lines.push("");
    lines.push(`- confidence reason: ${sink.confidenceReason}`);
    lines.push(`- risk: ${sink.confidenceRisk}`);
    lines.push("");
    lines.push("**Why this was selected**");
    lines.push("");
    // Use the canonical BURDEN_TERMS labels so the same metric is never named
    // three different ways across views (LABEL-1).
    lines.push(`- path depth ${sink.metrics.maximumPathDepth}`);
    lines.push(
      `- defensive operations ${sink.metrics.defensiveOperationCount}`,
    );
    lines.push(`- representation churn ${sink.metrics.representationChurn}`);
    lines.push(`- impossible defenses ${sink.metrics.impossibleDefenseCount}`);
    if (sink.metrics.packRisk > 0) {
      lines.push(`- pack risk ${sink.metrics.packRisk}`);
    }
    lines.push("");
    lines.push("**Representative path**");
    lines.push("");
    lines.push(
      "_Read top → bottom: each row is derived from the row above (the verb says how), and «marked» is the piece that flowed in from the previous step; the last row is the value JSX renders. ▸ marks recommended extraction boundaries._",
    );
    lines.push("");
    lines.push(...fenced(representativePathWithBoundaries(sink)));
    lines.push("");
    if (group) {
      lines.push("**Pack verdict**");
      lines.push("");
      lines.push(...fenced(packVerdictLines(group)));
      lines.push("");
    }
    if (group?.verdict === "overpacked-bag") {
      lines.push("**Sink-family split**");
      lines.push("");
      lines.push(...fenced(overpackedSplitLines(group)));
      lines.push("");
    }
    const proposal = extractionProposalFor(sink);
    if (proposal) {
      lines.push("**Extraction proposal**");
      lines.push("");
      lines.push(...fenced(proposal));
      lines.push("");
    }
    const shapeCheck = extractionShapeCheckFor(sink, group, renderGroups);
    if (shapeCheck) {
      lines.push("**Extraction shape check**");
      lines.push("");
      lines.push(...fenced(shapeCheck));
      lines.push("");
    }
    lines.push("**Candidate edits**");
    lines.push("");
    candidateEditsFor(sink, group).forEach((edit, editIndex) => {
      lines.push(`${editIndex + 1}. ${edit}`);
    });
    lines.push("");
    lines.push("**Risk**");
    lines.push("");
    lines.push(`- ownership: ${ownershipHintFor(sink)}`);
    lines.push(`- queue: ${sink.queue}`);
    if (sink.metrics.unknownEdgeCount > 0) {
      lines.push(
        `- ${sink.metrics.unknownEdgeCount} unknown edge(s) require investigation`,
      );
    }
    lines.push("");
  });
  appendStopRecommendation(lines, report);
  appendBackgroundFindings(lines, report, args);
  appendBaseline(lines, report);
  return `${lines.join("\n")}\n`;
}

function appendBackgroundFindings(lines, report, args) {
  const rows = report.rankings.all
    .filter((sink) => sink.background)
    .slice(0, Math.min(5, args.maxItems));
  if (rows.length === 0) return;
  lines.push("## Background Findings");
  lines.push("");
  lines.push("These paths are true but not recommended as cleanup work:");
  lines.push("");
  lines.push(
    ...formatMarkdownTable(
      ["Location", "Expression", "Classification", "Reason"],
      rows.map((sink) => [
        `${sink.file}:${sink.line}`,
        formatExpression(sink.expression, 28),
        sink.background.label,
        sink.background.reason,
      ]),
    ),
  );
  lines.push("");
  lines.push("Action: leave these unless adjacent edits make them redundant.");
  lines.push("");
}

function extractionShapeCheckFor(sink, packGroup, renderGroups = []) {
  if (sinkFamilyOf(sink) === "svg-shell") {
    return [
      "verdict: root shell scalar",
      `attribute: ${sinkAttributeName(sink) ?? "svg shell"}`,
      "reason: this sizes or frames the root SVG/HTML shell, not a repeated rendered item.",
      "recommendation: keep the calculation inline or as a tiny local thunk above the render block unless several render surfaces share one typed size boundary.",
    ];
  }
  if (classifyPathShape(sink).includes("local-scalar-geometry")) {
    return [
      "verdict: repeated scalar; prefer local variable",
      `attribute: ${sinkAttributeName(sink) ?? "SVG scalar"}`,
      "reason: this is fixed local SVG scalar math, not a repeated rendered item model or shared helper boundary.",
      "recommendation: name the scalar near JSX, for example center, radius, circumference, trackDasharray, or indicatorDasharray; do not introduce a helper type/function just to avoid repeated arithmetic.",
    ];
  }
  const renderGroup = renderGroups.find((group) =>
    group.sinks.some((member) => member.id === sink.id),
  );
  const representative = renderGroup?.sinks
    .slice()
    .sort((left, right) => right.scores.burden - left.scores.burden)[0];
  if (renderGroup && representative?.id === sink.id) {
    return [
      "verdict: cohesive repeated item",
      `rendered thing: ${renderGroup.renderedThing}`,
      `suggested shape: ${renderGroup.shape}`,
      `reason: ${renderGroup.fields.join(", ")} are consumed together for repeated ${pluralRenderedThing(renderGroup.renderedThing)}.`,
    ];
  }
  if (packGroup?.verdict === "mirror-object") {
    return [
      "verdict: mirror singleton risk",
      `candidate: ${packGroup.label}`,
      "reason: this object mostly gathers source fields without shared render-item consumption.",
      "recommendation: prefer narrow scalar helpers or inline reads unless a rerun shows multiple fields consumed together.",
    ];
  }
  if (mirrorSingletonRiskFor(sink)) {
    return [
      "verdict: mirror singleton risk",
      `candidate: ${renderedThingFor(sink)}`,
      "reason: this looks like local scalar or coordinate plumbing, not repeated item data.",
      "recommendation: avoid a broad singleton object; prefer narrow scalar helpers unless related fields are consumed together.",
    ];
  }
  return null;
}

function mirrorSingletonRiskFor(sink) {
  const family = sinkFamilyOf(sink);
  if (family === "svg-shell") return false;
  if ((sink.metrics.maximumPathDepth ?? 0) < 4) return false;
  return (
    ["geometry", "svg-shell", "other"].includes(family) &&
    classifyPathShape(sink).some((shape) =>
      ["geometry-chain", "domain-normalization"].includes(shape),
    ) &&
    (sink.metrics.representationChurn >= 3 || sink.metrics.mergeWidth >= 3) &&
    !classifyPathShape(sink).includes("collection-render-model") &&
    !sink.packVerdicts?.includes("cohesive-render-model")
  );
}

function appendGroupedRecommendations(lines, report, args) {
  const groups = groupedRenderRecommendations(report.rankings.all).slice(0, 5);
  if (groups.length === 0) return;
  lines.push("## Grouped Recommendations");
  lines.push("");
  for (const group of groups) {
    lines.push(`**${group.title}**`);
    lines.push("");
    lines.push(
      ...formatMarkdownTable(
        ["Component", "Rendered thing", "Sinks", "Fields", "Suggested shape"],
        [
          [
            group.component,
            group.renderedThing,
            String(group.sinkCount),
            group.fields.join(", "),
            group.shape,
          ],
        ],
      ),
    );
    lines.push("");
    lines.push(`Why: ${group.reason}`);
    lines.push("");
  }
}

function groupedRenderRecommendations(sinks) {
  const buckets = new Map();
  for (const sink of sinks) {
    if (!isRenderItemGroupingCandidate(sink)) continue;
    const component = sink.renderContext?.component ?? "local render";
    const renderedThing = groupedRenderedThing(sink);
    const key = `${sink.file}::${component}::${renderedThing}`;
    let group = buckets.get(key);
    if (!group) {
      group = { file: sink.file, component, renderedThing, sinks: [] };
      buckets.set(key, group);
    }
    group.sinks.push(sink);
  }
  return Array.from(buckets.values())
    .map((group) => {
      const fields = unique(group.sinks.map(groupedFieldName)).filter(Boolean);
      const roots = unique(
        group.sinks.flatMap((sink) =>
          fanOutRootsFor(sink).map((info) => formatExpression(info.label, 32)),
        ),
      ).slice(0, 4);
      const plural = pluralRenderedThing(group.renderedThing);
      return {
        ...group,
        title: `Extract ${plural}`,
        sinkCount: group.sinks.length,
        fields,
        shape: `${pascalCase(singularRenderedThing(group.renderedThing))}[]`,
        reason: `${roots.join(", ") || "the same local inputs"} feed ${fields.join("/")} for one ${group.renderedThing}.`,
      };
    })
    .filter((group) => group.sinkCount >= 2 && group.fields.length >= 2)
    .sort(
      (left, right) =>
        right.sinkCount - left.sinkCount ||
        right.fields.length - left.fields.length ||
        left.file.localeCompare(right.file),
    );
}

function isRenderItemGroupingCandidate(sink) {
  const family = sinkFamilyOf(sink);
  const tag = sink.renderContext?.tag;
  return (
    !classifyPathShape(sink).includes("local-scalar-geometry") &&
    String(tag ?? "").toLowerCase() !== "line" &&
    ["geometry", "style", "identity", "text"].includes(family) &&
    (isSvgLikeTag(tag) || sink.category === "rendered-value") &&
    sink.metrics.maximumPathDepth >= 3
  );
}

function isSvgLikeTag(tag) {
  return ["rect", "text", "title", "line", "path", "circle", "g"].includes(
    String(tag ?? "").toLowerCase(),
  );
}

function groupedRenderedThing(sink) {
  const component = sink.renderContext?.component ?? "";
  if (/BarRects?$/i.test(component) || /Bars?$/i.test(component))
    return "bar rectangle";
  if (/Ticks?|Axis/i.test(component)) return "bar tick";
  return renderedThingFor(sink);
}

function groupedFieldName(sink) {
  return (
    sink.renderContext?.attribute ??
    sinkAttributeName(sink) ??
    sink.renderContext?.tag ??
    "text"
  );
}

// REPORT-RECONCILE-1: the fan-out report mirrors the web "network view" — for each
// shared source it lists *every* reached sink grouped by file, with each sink's
// depth, plus the source's definition location and a single/cross-file tag. This is
// the markdown the agent consumes, so it carries the same "lists everything, shows
// depth and usage" content as the on-page graph (not the old 5-column summary).
function renderFanOut(report, args) {
  const entries = fanOutEntriesGlobal(
    report.rankings?.all ?? report.sinks ?? [],
  ).slice(0, args.maxItems);
  const lines = ["# Consumer Fan-Out", "", ...viewIntro("fan-out", report)];
  if (!entries.length) {
    lines.push("_No shared source fans out to ≥2 render sinks._", "");
    return `${lines.join("\n")}\n`;
  }
  for (const entry of entries) {
    const tag =
      entry.fileCount === 1
        ? "single-file (candidate split)"
        : `${entry.fileCount} files (cross-file usage)`;
    lines.push(
      `## ${entry.root} — ${entry.sinkCount} sinks · ${tag} · max depth ${entry.maxDepth}`,
      "",
    );
    if (entry.def) {
      lines.push(`Defined at \`${entry.def.file}:${entry.def.line}\`.`, "");
    }
    const byFile = new Map();
    for (const sink of entry.graphSinks) {
      if (!byFile.has(sink.file)) byFile.set(sink.file, []);
      byFile.get(sink.file).push(sink);
    }
    // MD-1: print the full path once on the file header; sink rows carry only the
    // bare `:line` (+ label/depth). The path is the same for every row in the group,
    // so repeating it is pure token waste — the client resolves the file from the
    // enclosing group header for code previews.
    for (const [file, sinks] of byFile) {
      lines.push(`- **${file}** (${sinks.length})`);
      for (const sink of sinks) {
        const label = sink.label ? ` ${sink.label}` : "";
        lines.push(`  - \`:${sink.line}\`${label} · depth ${sink.depth ?? 0}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderFanIn(report, args) {
  const rows = report.rankings.all
    .slice(0, args.maxItems)
    .map((sink) => [
      `${sink.file}:${sink.line}`,
      String(sink.metrics.mergeWidth),
      String(sink.metrics.controlDependencyCount),
      String(sink.metrics.maximumPathDepth),
    ]);
  return tableReport(
    "Sink Fan-In",
    ["Sink", "Root sources", "Predicates", "Max distance"],
    rows,
    viewIntro("fan-in", report),
  );
}

function renderPathFamilies(report, args) {
  const families = familyRows(report.sinks).slice(0, args.maxItems);
  const rows = families.map((family) => [
    code(family.signature),
    String(family.paths),
    String(family.sinks),
    String(family.maxDepth),
  ]);
  const lines = tableReport(
    "Path Families",
    ["Signature", "Paths", "Sinks", "Max depth"],
    rows,
    viewIntro("path-families", report),
  ).split("\n");

  // MD-7: the table only counts; show a representative example per family — the
  // deepest member's path — so the recurring shape is concrete and a single shared
  // fix can be reasoned about. Biggest/gnarliest families first.
  const withExamples = families
    .filter((family) => family.example)
    .sort((a, b) => b.sinks * b.maxDepth - a.sinks * a.maxDepth);
  if (withExamples.length) {
    lines.push("## Representative examples", "");
    for (const family of withExamples) {
      const sink = family.example;
      lines.push(
        `### ${code(family.signature)} — ${plural(family.sinks, "sink")}, max depth ${family.maxDepth}`,
        "",
        `Deepest member: \`${sink.file}:${sink.line}\``,
        "",
        ...fenced(representativePathLines(sink)),
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderDefensiveLedger(report, args) {
  // One defense can reach many sinks (e.g. a `size` fallback that drives several
  // JSX outputs), so the same guard would otherwise repeat once per reachable
  // sink. Dedupe by location+expression and surface the fan-out as a count so
  // the breadth is preserved without wasting rows on identical entries.
  const byKey = new Map();
  for (const sink of report.sinks) {
    for (const defense of sink.defenses) {
      const key = `${sink.file}:${defense.location.line}|${defense.expression}`;
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { sink, defense, count: 1 });
    }
  }
  // Impossible verdicts (dead guards) matter most; rank them first so a small
  // --max-items cap surfaces the worst, not whatever was encountered first.
  // Tie-break on fan-out (count) so a guard that reaches many sinks wins.
  const verdictRank = { impossible: 0, possible: 1, unknown: 2 };
  const rows = [...byKey.values()]
    .sort((a, b) => {
      const va = verdictRank[a.defense.verdict] ?? 3;
      const vb = verdictRank[b.defense.verdict] ?? 3;
      if (va !== vb) return va - vb;
      return b.count - a.count;
    })
    .slice(0, args.maxItems)
    .map(({ sink, defense, count }) => [
      `${sink.file}:${defense.location.line}`,
      code(formatExpression(defense.expression)),
      code(defense.type),
      String(count),
      defense.verdict,
      defense.origin ?? "—",
      defensiveActionFor(defense),
    ]);
  return tableReport(
    "Defensive Logic",
    ["Location", "Expression", "Type", "Sinks", "Verdict", "Origin", "Action"],
    rows,
    viewIntro("defensive-ledger", report),
  );
}

function defensiveActionFor(defense) {
  if (defense.verdict === "impossible") return "remove after contract check";
  if (/solid prop default/i.test(defense.origin ?? "")) {
    return "promote to mergeProps default";
  }
  if (/api-choice/i.test(defense.origin ?? "")) {
    return "keep caller-precedence fallback";
  }
  if (/parser-boundary|compatibility|optional/i.test(defense.origin ?? "")) {
    return "keep as certainty boundary";
  }
  if (defense.verdict === "unknown") return "inspect runtime shape";
  return "review boundary placement";
}

function renderPropRelay(report, args) {
  const rows = report.rankings.all
    .slice(0, args.maxItems)
    .map((sink) => [
      `${sink.file}:${sink.line}`,
      String(Math.max(0, sink.metrics.mergeWidth - 1)),
      String(sink.metrics.representationChurn),
      sink.metrics.helperHops === 0 ? "pure data relay" : "transformed relay",
    ]);
  return tableReport(
    "Prop Relay",
    ["Sink", "Component boundaries", "Wrapper steps", "Classification"],
    rows,
    viewIntro("prop-relay", report),
  );
}

function renderContextRelay(report, args) {
  const findings = report.contextRelay.slice(0, args.maxItems);
  const rows = findings.map((finding) => [
    `${finding.parentFile}:${finding.line}`,
    finding.childComponent,
    finding.contextHooks.join(", "),
    finding.props.join(", "),
    finding.signal,
  ]);
  const lines = tableReport(
    "Context Relay",
    ["Parent", "Child", "Context hooks in parent", "Passed props", "Signal"],
    rows,
    viewIntro("context-relay", report),
  ).split("\n");

  // MD-6: the table summarizes; the evidence below shows *why* each example reads as
  // a relay so an agent can act without re-deriving it — the parent already holds the
  // context, and the props it forwards (especially the shared-named ones) duplicate
  // values the child could read from context directly.
  if (findings.length) {
    lines.push("## Why these are relays", "");
    for (const finding of findings) {
      lines.push(
        `### ${finding.childComponent} — \`${finding.parentFile}:${finding.line}\``,
        "",
        `- Parent reads context via ${finding.contextHooks.map((hook) => code(hook)).join(", ") || "_(context hooks in scope)_"}.`,
        `- It forwards ${plural(finding.props.length, "prop")} to \`${finding.childComponent}\`: ${finding.props.map((prop) => code(prop)).join(", ")}.`,
      );
      if (finding.sharedProps?.length) {
        lines.push(
          `- ${plural(finding.sharedProps.length, "prop")} reuse a context-shaped name — ${finding.sharedProps
            .map((prop) => code(prop))
            .join(
              ", ",
            )} — so the child could read ${finding.sharedProps.length === 1 ? "it" : "them"} from context instead of receiving ${finding.sharedProps.length === 1 ? "it" : "them"} as ${finding.sharedProps.length === 1 ? "a prop" : "props"}.`,
        );
      } else {
        lines.push(
          `- Signal: ${finding.signal} — the whole bundle is forwarded from a context-aware parent.`,
        );
      }
      lines.push(
        `- Open \`${finding.parentFile}:${finding.line}\` to see the hand-off.`,
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
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

function renderOverviewReport(report, args) {
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

  appendStopRecommendation(lines, report);
  appendBaseline(lines, report);
  return `${lines.join("\n")}\n`;
}

function appendStopRecommendation(lines, report) {
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

// Approach 2 — classify every function reached on a render path as a data-flow
// boundary, ranked by "boundary debt".
function renderBoundaryReport(report, args) {
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
function renderComponentRefs(report, args) {
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

function affectedSinkSummary(sinks) {
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
function renderJunctions(report, args) {
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
function renderInlinePreview(report, args) {
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

function appendFeatureClusters(lines, report, args) {
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

// Plain-English noun for a shape tag — used in reviewer summaries (Phase 6).
const SHAPE_PHRASES = {
  "svg-shell": "SVG shell sizing",
  "local-scalar-geometry": "local SVG scalar geometry",
  "geometry-chain": "SVG/layout geometry",
  "collection-render-model": "collection rendering",
  "control-flow-gate": "control-flow gating",
  "presentation-pack": "class/style packing",
  "domain-normalization": "defaulting and normalization",
  "solid-prop-default-boundary": "Solid optional prop defaults",
  "cross-component-relay": "cross-component prop relay",
};

// One-line headline fix per primary shape — the lead sentence of the reviewer
// summary (Phase 6) and the spine of the candidate edits (Phase 2).
const SHAPE_HEADLINE_FIX = {
  "svg-shell":
    "keep root shell sizing inline or in a tiny local thunk unless it is a shared typed boundary",
  "local-scalar-geometry":
    "name the repeated scalar locally before JSX instead of introducing a helper type or helper function",
  "geometry-chain":
    "compute cohesive render-item geometry in a memo, then read named fields in JSX",
  "collection-render-model":
    "extract rendered items into a memo and render one component per item",
  "control-flow-gate":
    "name the scalar predicate or selected value so the gate reads as a sentence",
  "presentation-pack":
    "split style/class values by render responsibility before considering a packed object",
  "domain-normalization":
    "resolve defaults and normalization at a named boundary before JSX",
  "solid-prop-default-boundary":
    "use mergeProps once near the Solid component boundary, then read merged local props in JSX",
  "cross-component-relay":
    "move shared state behind a Provider/Context instead of threading props",
};

function candidateEditsFor(sink, group = null) {
  const shapes = classifyPathShape(sink);
  const reminder =
    "Keep JSX scannable — attributes should read named values, not derive them.";

  if (group?.verdict === "normalization-boundary") {
    return [
      "Keep the parser/model object as the normalization boundary; move defaults, parsing fragments, and derived fields there.",
      "Let JSX read the typed parsed fields directly instead of recomputing or slicing around the raw input.",
      "Do not split this pack just because it is an object; rerun only to confirm the verdict stays a normalization boundary.",
      reminder,
    ];
  }

  if (
    group &&
    ["overpacked-bag", "mirror-object", "relay-bag"].includes(group.verdict)
  ) {
    return [
      "Split the packed object by render responsibility instead of widening it.",
      "Keep style, geometry, identity, text, and control-flow values in separate narrow selectors unless the same consumers use them together.",
      group.verdict === "relay-bag"
        ? "Move broad shared state closer to consumers, or expose focused selectors from the feature boundary."
        : "Inline mirror fields or extract only the derived values that remove repeated work.",
      reminder,
    ];
  }

  // Provider/Context advice is reserved for genuine cross-component relays (or
  // flows already rooted at a feature hook), not local geometry/normalization.
  if (isProviderContextCandidate(sink)) {
    return providerContextEdits(sink);
  }

  if (primaryAdviceShape(sink, shapes) === "solid-prop-default-boundary") {
    const defaults = solidPropDefaultNames(sink);
    const defaultsText = defaults.length ? ` for ${defaults.join(", ")}` : "";
    return [
      `Use Solid mergeProps once near the component boundary${defaultsText}, for example const local = mergeProps({ size: 32, strokeWidth: 4 }, props).`,
      "Let JSX and local geometry/style calculations read the merged local props object instead of repeating props.foo ?? default at render leaves.",
      "Keep caller-precedence fallbacks separate when the right-hand side is another real API choice, such as tooltipContent ?? user.displayName.",
      "Do not move valid prop defaults into helper arguments merely to shorten the analyzer path.",
      reminder,
    ];
  }

  const shapeEdits = {
    "svg-shell": [
      "Keep SVG shell attributes such as width, height, and viewBox as root-level values; prefer a simple inline expression or a tiny local thunk immediately above the render block.",
      "If shell sizing depends on optional Solid props, default those props once with mergeProps before the shell calculation.",
      "Do not extract a separate helper function only to pass defaulted shell values as arguments.",
      "Only move shell sizing into a named boundary when the same typed sizing object is shared by several render surfaces.",
    ],
    "local-scalar-geometry": [
      "Name repeated local SVG scalar math once near the JSX, such as center, radius, circumference, trackDasharray, or indicatorDasharray.",
      "Do not introduce a helper type or helper function solely to avoid repeating size() / 2 across a pair of SVG elements.",
      "Keep valid prop defaults as explicit mergeProps certainty boundaries before the geometry math; do not move those fallbacks into helper arguments just to shorten the path.",
    ],
    "geometry-chain": [
      `For repeated rendered items, extract a createMemo returning ${articleFor(renderedThingFor(sink))} ${renderedThingFor(sink)} value (for example { x, y, width, height }); keep the SVG attribute reading named fields.`,
      `Name the memo for what it renders (${pluralRenderedThing(renderedThingFor(sink))}, visibleRows), not a catch-all like layout/view; for fixed sibling scalar math, prefer local aliases instead.`,
      "Do not combine geometry with aria text, labels, control-flow, or styles unless the pack verdict is cohesive.",
      "Resolve unknown or nullable input into a certain value at the nearest true boundary before the geometry math; do not move a legitimate fallback into function arguments just to shorten a path.",
    ],
    "collection-render-model": [
      `Extract ${pluralRenderedThing(renderedThingFor(sink))} into a createMemo that returns the array; feed <For each={...}> and render one component per item.`,
      "Name the memo with a plural noun for what is rendered (realBars, visibleRows).",
    ],
    "control-flow-gate": [
      "Prefer a scalar predicate or selected value for when={...}; avoid creating a broad ready object just to collapse nested gates.",
      "Only pack multiple selected fields when the same consumers use them together and the pack verdict stays cohesive.",
      "Keep fallbacks only when they convert an unknown or optional input into a certain value; avoid wrapping that fallback in a new helper call unless the helper owns the boundary.",
    ],
    "presentation-pack": [
      "Extract narrow style values by responsibility (for example swatchStyle, buttonShadow, spacingLabel) instead of one itemView object.",
      "Keep aria/text/identity fields separate from style and geometry unless consumers always use them together.",
      "Use the pack verdict after rerun: overpacked/mirror/relay means split, cohesive/normalization means keep or formalize.",
    ],
    "domain-normalization": [
      "Resolve defaults, optional reads, and union narrowing at the boundary that truly owns the uncertainty, before JSX reads it.",
      "When the uncertainty is optional Solid component props, prefer a single mergeProps(defaults, props) boundary over repeated leaf fallbacks.",
      "If a fallback is the boundary, keep it close and explicit; do not contort the code so the fallback becomes a helper argument.",
      "Inline representation-only wrappers that have no semantic role.",
    ],
  };

  const primary = primaryAdviceShape(sink, shapes);
  const edits = shapeEdits[primary]
    ? [...shapeEdits[primary]]
    : [
        "Move repeated parsing, formatting, or normalization to the nearest data/model boundary.",
        "Inline representation-only wrappers when they have no semantic role.",
        "Keep the change scoped to the file named above.",
      ];

  if (sink.metrics.impossibleDefenseCount > 0) {
    edits.push(
      "Remove the type-impossible fallback(s) only after confirming the checked type is the real runtime contract.",
    );
  }
  edits.push(reminder);
  return edits;
}

function solidPropDefaultNames(sink) {
  return unique(
    (sink.defenses ?? [])
      .filter((defense) => /solid prop default/i.test(defense.origin ?? ""))
      .map((defense) => propNameFromExpression(defense.guardedExpression)),
  ).slice(0, 4);
}

function propNameFromExpression(expression) {
  const match = /\.([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(String(expression ?? ""));
  return match?.[1] ?? null;
}

function providerContextEdits(sink) {
  if (hasContextHookRoot(sink)) {
    return [
      "This flow already starts at a feature hook; do not reintroduce parent pass-through props.",
      "If the same property chain appears repeatedly, extract a named selector/action on the feature model.",
      "Keep only row-local items and narrow display props outside the Provider/Context.",
    ];
  }

  if (isProviderContextCandidate(sink)) {
    return [
      "Check whether this feature already has or needs a Provider/Context boundary.",
      "Move shared filters, table state, action state, drafts, and derived selectors behind the feature hook.",
      "Remove same-feature pass-through props; keep only row-local items and narrow display props.",
    ];
  }

  if (sink.metrics.impossibleDefenseCount > 0) {
    return [
      "Add or confirm boundary coverage for the source invariant.",
      "Remove type-impossible defensive operations.",
      "Inline representation-only wrappers when they have no semantic role.",
    ];
  }

  return [
    "Move repeated parsing, formatting, or normalization to the nearest data/model boundary.",
    "Inline representation-only wrappers when they have no semantic role.",
    "Keep the change scoped to the feature area named in the cluster summary.",
  ];
}

function isProviderContextCandidate(sink) {
  return providerContextEvidenceFor(sink).eligible;
}

function providerContextEvidenceFor(sink) {
  if (hasContextHookRoot(sink)) {
    return { eligible: true, reason: "context hook root" };
  }
  const text = pathTextFor(sink);
  if (/\b(?:createContext|useContext)\b/.test(text)) {
    return { eligible: true, reason: "context API call" };
  }
  if (/\b[A-Za-z][A-Za-z0-9_$.]*\.Provider\b/.test(text)) {
    return { eligible: true, reason: "Provider JSX" };
  }
  if (hasImportedFeatureBoundary(sink)) {
    return { eligible: true, reason: "imported feature boundary" };
  }
  const crossComponentRelay = classifyPathShape(sink).includes(
    "cross-component-relay",
  );
  if (
    crossComponentRelay &&
    sink.metrics.mergeWidth > 1 &&
    (sink.metrics.reachableSinks > 3 || sink.metrics.representationChurn > 0)
  ) {
    return { eligible: true, reason: "same-feature prop relay" };
  }
  return { eligible: false, reason: "no provider/context signals" };
}

function pathTextFor(sink) {
  return [
    sink.label,
    sink.expression,
    ...(sink.roots ?? []),
    ...(sink.representativeSteps ?? []).map((step) => step.label),
  ].join(" ");
}

function hasImportedFeatureBoundary(sink) {
  const roots = sink.roots ?? [];
  return (
    roots.some((root) => /^use[A-Z]/.test(root)) ||
    roots.some((root) =>
      /(?:Store|Context|Provider|Feature|State|Model)$/.test(root),
    )
  );
}

function localFirstCutForCluster(cluster) {
  const dominantShape = modalValue(cluster.shapes ?? []);
  switch (dominantShape) {
    case "local-scalar-geometry":
      return "name repeated local scalars";
    case "svg-shell":
      return "keep shell sizing inline";
    case "collection-render-model":
      return "extract rendered items";
    case "geometry-chain":
      return "extract render item geometry";
    case "control-flow-gate":
      return "name the predicate";
    case "presentation-pack":
      return "split the class/style object";
    case "domain-normalization":
      return "normalize at the boundary";
    default:
      return "local boundary cleanup";
  }
}

function providerEvidenceSummary(evidence) {
  const concrete = unique(
    evidence.filter((reason) => reason !== "no provider/context signals"),
  );
  return concrete.length ? concrete.join(", ") : "provider/context signals";
}

function hasContextHookRoot(sink) {
  return sink.roots.some((root) => /^use[A-Z]/.test(root));
}

// Human labels for the sink families in a split recommendation.
const FAMILY_LABELS = {
  "svg-shell": "SVG shell",
  geometry: "Geometry",
  "control-flow": "Control flow",
  style: "Style",
  identity: "Identity",
  text: "Text",
  other: "Other",
};

const PACK_VERDICT_LABELS = {
  "cohesive-render-model": "cohesive render model",
  "normalization-boundary": "normalization boundary",
  "overpacked-bag": "overpacked bag",
  "mirror-object": "mirror object",
  "relay-bag": "relay bag",
};

function packVerdictLines(group) {
  const evidence = group.evidence;
  const lines = [
    `verdict: ${PACK_VERDICT_LABELS[group.verdict] ?? group.verdict}`,
    `evidence: ${group.sinkCount} sinks, ${evidence.familyCount} sink families, ${evidence.sourceRootCount} source roots, reach ${evidence.maxReach}`,
  ];
  if (group.verdict === "normalization-boundary") {
    lines.push(
      "direction: keep this as a named boundary; move parser/defaulting work here, then let JSX read typed fields.",
    );
  } else if (group.verdict === "cohesive-render-model") {
    lines.push(
      "direction: this pack is cohesive; formalize or narrow it rather than splitting solely because it is an object.",
    );
  } else if (group.verdict === "overpacked-bag") {
    lines.push(
      "direction: split by render responsibility; avoid one object feeding unrelated JSX concerns.",
    );
  } else if (group.verdict === "mirror-object") {
    lines.push(
      "direction: this mostly mirrors source fields; prefer narrow derived values or inline reads.",
    );
  } else if (group.verdict === "relay-bag") {
    lines.push(
      "direction: this broad pack fans out through the feature; move ownership closer to consumers or split selectors.",
    );
  }
  return lines;
}

// The "split this object by sink family" block shown under a work item whose
// packed object feeds more than one family (Phase 3d).
function overpackedSplitLines(group) {
  const lines = [
    `Object \`${group.label}\` feeds ${group.families.length} sink families — split it:`,
  ];
  for (const family of group.families) {
    const members = group.familyMembers[family] ?? [];
    lines.push(`  ${FAMILY_LABELS[family] ?? family}: ${members.join(", ")}`);
  }
  return lines;
}

// Phase 5 — locate recommended extraction boundaries on the representative path
// plus a suggested render-model shape. A boundary is placed after the last
// normalization step and after a contiguous geometry/arithmetic sub-chain; the
// model shape comes from the sink family. Boundaries are returned by the step
// index they sit *after* so the path renderer can mark them in place rather
// than referring to an opaque "step N".
function extractionBoundariesFor(sink) {
  const steps = sink.representativeSteps ?? [];
  const boundaries = [];

  let lastNormalization = -1;
  let lastGeometry = -1;
  steps.forEach((step, index) => {
    if (step.kind === "fallback" || step.kind === "optional-read") {
      lastNormalization = index;
    }
    if (
      step.kind === "template" ||
      (step.kind === "conditional" && /[-+*/%]/.test(step.label))
    ) {
      lastGeometry = index;
    }
  });

  if (lastNormalization >= 0 && lastNormalization < steps.length - 1) {
    boundaries.push({
      afterIndex: lastNormalization,
      text: "extract the defaults & normalization above into a named boundary memo",
    });
  }
  if (
    classifyPathShape(sink).includes("geometry-chain") &&
    !classifyPathShape(sink).includes("local-scalar-geometry") &&
    lastGeometry >= 0 &&
    lastGeometry < steps.length - 1 &&
    lastGeometry !== lastNormalization
  ) {
    boundaries.push({
      afterIndex: lastGeometry,
      text: "extract the layout/geometry math above into a sizing memo",
    });
  }

  const family = sinkFamilyOf(sink);
  let modelShape = null;
  if (classifyPathShape(sink).includes("local-scalar-geometry")) {
    modelShape = null;
  } else if (family === "geometry" || family === "svg-shell") {
    modelShape = "{ x, y, width, height }";
  } else if (
    !sink.packVerdicts?.includes("normalization-boundary") &&
    classifyPathShape(sink).includes("collection-render-model")
  ) {
    modelShape = `${pascalCase(singularRenderedThing(renderedThingFor(sink)))}[]`;
  }
  return { boundaries, modelShape };
}

// Approach 4 — synthesize the clean helper a messy boundary implies: inputs are
// the source lineages crossing the cut (with where they come from), output is the
// value/model at the sink, named from the render shape. A proposal, not a rewrite.
function extractionProposalFor(sink) {
  // Only worth proposing for paths deep enough that a boundary actually helps.
  if ((sink.metrics?.maximumPathDepth ?? 0) < 4) return null;
  if (sinkFamilyOf(sink) === "svg-shell") return null;
  if (classifyPathShape(sink).includes("local-scalar-geometry")) return null;
  const inputs = fanOutRootsFor(sink).slice(0, 5);
  if (inputs.length === 0) return null;

  const steps = sink.representativeSteps ?? [];
  const originOf = (label) => {
    const step = steps.find((candidate) => candidate.label === label);
    return step?.file && step?.line ? `${step.file}:${step.line}` : null;
  };
  const { modelShape } = extractionBoundariesFor(sink);
  const name = proposedHelperName(sink);
  const outType =
    modelShape ??
    (sink.type && sink.type !== "unknown"
      ? formatExpression(sink.type, 40)
      : "/* result */");

  const ownLines = steps
    .filter((step) => step.file === sink.file && step.line)
    .map((step) => step.line);
  const lo = ownLines.length ? Math.min(...ownLines) : null;
  const hi = ownLines.length ? Math.max(...ownLines) : null;

  const lines = [`proposed: function ${name}(`];
  inputs.forEach((info, index) => {
    const origin = originOf(info.label);
    const comma = index < inputs.length - 1 ? "," : "";
    const where = origin ? `  (${origin})` : "";
    lines.push(
      `  ${paramNameFor(info.label)}: /* type */${comma}   // ⟵ ${formatExpression(info.label, 40)}${where}`,
    );
  });
  lines.push(`): ${outType}`);
  if (lo != null && hi != null && hi > lo) {
    lines.push(`moves ~${sink.file.split("/").pop()}:${lo}–${hi}`);
  }
  const resultPhrase =
    sinkFamilyOf(sink) === "control-flow" || sink.category === "rendered-value"
      ? `JSX reads ${name}(...)`
      : `JSX reads a field of ${name}(...)`;
  lines.push(
    `after: ${resultPhrase} — a short path instead of ${sink.metrics.maximumPathDepth} hops.`,
  );
  if (sink.metrics.packRisk > 0 || sink.category === "render-control") {
    lines.push(
      "avoid: do not introduce a broad packed object unless a rerun reports it as cohesive.",
    );
  }
  return lines;
}

// A domain-flavored helper name from the sink's render family — never a banned
// catch-all (`layout`, `viewModel`, …).
function proposedHelperName(sink) {
  if (sink.packVerdicts?.includes("normalization-boundary")) {
    return "parsedValue";
  }
  const renderedThing = renderedThingFor(sink);
  switch (sinkFamilyOf(sink)) {
    case "geometry":
      return `compute${pascalCase(singularRenderedThing(renderedThing))}`;
    case "svg-shell":
      return `${camelCase(singularRenderedThing(renderedThing))}`;
    case "control-flow":
      return predicateNameFor(sink);
    case "style":
      return `${camelCase(singularRenderedThing(renderedThing))}Style`;
    case "identity":
      return `${camelCase(singularRenderedThing(renderedThing))}Ref`;
    default:
      if (classifyPathShape(sink).includes("collection-render-model")) {
        return pluralRenderedThing(renderedThing);
      }
      if (
        sink.category === "rendered-value" &&
        String(sink.renderContext?.tag).toLowerCase() === "title"
      ) {
        return `format${pascalCase(singularRenderedThing(renderedThing))}`;
      }
      return `${camelCase(singularRenderedThing(renderedThing))}Text`;
  }
}

function renderedThingFor(sink) {
  const component = sink.renderContext?.component ?? "";
  const tag = String(sink.renderContext?.tag ?? "").toLowerCase();
  const attribute = sink.renderContext?.attribute ?? sinkAttributeName(sink);
  const componentWords = wordsFromIdentifier(component).filter(
    (word) => !["chart", "svg", "render", "component"].includes(word),
  );
  const domain = componentWords.includes("bar") ? "bar" : componentWords[0];
  if (tag === "rect") return domain ? `${domain} rectangle` : "rectangle";
  if (tag === "text" && /tick|axis/i.test(component))
    return domain ? `${domain} tick` : "axis tick";
  if (tag === "title") return domain ? `${domain} title` : "title";
  if (tag && !/^[A-Z]/.test(sink.renderContext?.tag ?? ""))
    return domain ? `${domain} ${tag}` : tag;
  if (attribute)
    return `${camelWords(attribute).join(" ") || "rendered"} value`;
  return domain ? `${domain} value` : "rendered value";
}

function predicateNameFor(sink) {
  const alias = [...(sink.representativeSteps ?? [])]
    .reverse()
    .find(
      (step) =>
        step.kind === "alias" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(step.label),
    );
  if (alias) return alias.label;
  const helper = [...(sink.representativeSteps ?? [])]
    .reverse()
    .find(
      (step) =>
        step.kind === "call" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(step.label),
    );
  if (helper) return helper.label;
  const root = fanOutRootsFor(sink)[0]?.label ?? "render";
  const words = camelWords(root.split(".").at(-1) ?? root);
  const noun = pascalCase(words.join(" ")) || "Content";
  return `has${noun}`;
}

function singularRenderedThing(text) {
  const words = String(text).split(/\s+/);
  if (words.length === 0) return String(text);
  const last = words.at(-1);
  const singularLast = last
    .replace(/^(rectangles|rects)$/i, "rectangle")
    .replace(/^ticks$/i, "tick")
    .replace(/ies$/i, "y")
    .replace(/s$/i, "");
  return [...words.slice(0, -1), singularLast].join(" ");
}

function pluralRenderedThing(text) {
  const value = String(text);
  if (/rectangle$/i.test(value)) return `${value}s`;
  if (/tick$/i.test(value)) return `${value}s`;
  if (/y$/i.test(value)) return value.replace(/y$/i, "ies");
  if (/s$/i.test(value)) return value;
  return `${value}s`;
}

// Render the representative path as a derivation chain: each numbered row is
// built from the row above it, the last row is the value JSX renders. A leading
// `F#:line` column backlinks each hop to its source location (so it is clear
// whether the logic is in one file or scattered, and an agent can grep it); a
// verb column names what each hop does; recommended extraction boundaries are
// marked inline, exactly where they apply (show, don't tell); a closing line
// names the suggested sink-model shape. A `Files` legend maps each F# to a path.
function representativePathWithBoundaries(sink) {
  const steps =
    sink.representativeSteps ??
    sink.representativePath.map((label) => ({ label, kind: null }));
  if (steps.length === 0) return ["(no path)"];

  const { boundaries, modelShape } = extractionBoundariesFor(sink);
  const byIndex = new Map();
  for (const boundary of boundaries) {
    if (!byIndex.has(boundary.afterIndex)) byIndex.set(boundary.afterIndex, []);
    byIndex.get(boundary.afterIndex).push(boundary.text);
  }

  // Assign short file ids. F1 is always the sink's own file so the common
  // single-file case reads as F1 throughout; other files get F2, F3, … in the
  // order the path first visits them.
  const fileIds = new Map();
  if (sink.file) fileIds.set(sink.file, "F1");
  for (const step of steps) {
    if (step.file && !fileIds.has(step.file)) {
      fileIds.set(step.file, `F${fileIds.size + 1}`);
    }
  }
  const refFor = (step) =>
    step.file && step.line ? `${fileIds.get(step.file)}:${step.line}` : "";

  const refWidth = Math.max(...steps.map((step) => refFor(step).length), 2);
  const numberWidth = String(steps.length).length;
  const verbWidth = Math.max(
    ...steps.map((step) => stepVerb(step.kind).length),
  );
  const noteIndent = " ".repeat(refWidth + 2 + numberWidth + 2 + verbWidth + 2);
  const lines = [];
  // Track the file stack so a change between consecutive steps reads as entering
  // a helper's file (push) or returning from it (pop) — Approach 1 markers.
  const fileStack = [];
  steps.forEach((step, index) => {
    if (step.file && fileIds.has(step.file)) {
      const top = fileStack[fileStack.length - 1];
      if (top !== step.file) {
        if (fileStack.includes(step.file)) {
          while (
            fileStack.length &&
            fileStack[fileStack.length - 1] !== step.file
          ) {
            fileStack.pop();
          }
          if (index > 0) {
            lines.push(`${noteIndent}↙ return to ${fileIds.get(step.file)}`);
          }
        } else {
          fileStack.push(step.file);
          if (index > 0) {
            lines.push(`${noteIndent}↘ enter ${fileIds.get(step.file)}`);
          }
        }
      }
    }
    const ref = refFor(step).padEnd(refWidth, " ");
    const number = String(index + 1).padStart(numberWidth, " ");
    const verb = stepVerb(step.kind).padEnd(verbWidth, " ");
    // A call's name reads as a value without parens; add them so a helper/method
    // step is unmistakably an invocation. The `memo` verb already labels a memo
    // accessor, so drop the redundant trailing " memo" from its expression.
    const baseLabel = formatExpression(step.label).replace(/\s+memo$/, "");
    const label =
      step.kind === "call" && !baseLabel.includes("(")
        ? `${baseLabel}()`
        : baseLabel;
    // The detail gloss (what the step evaluates) only adds signal when it is not
    // already what the label shows.
    const detail =
      step.detail && step.detail !== baseLabel ? `  — ${step.detail}` : "";
    lines.push(`${ref}  ${number}. ${verb}  ${label}${detail}`);
    for (const text of byIndex.get(index) ?? []) {
      lines.push(`${noteIndent}▸ boundary: ${text}`);
    }
  });
  if (modelShape) {
    lines.push(`${noteIndent}▸ suggested sink model: ${modelShape}`);
  }

  lines.push("");
  lines.push("Files:");
  for (const [file, id] of fileIds) {
    lines.push(`  ${id} = ${file}`);
  }
  return lines;
}

// Phase 6 — a compact PR-review framing: what the sink mixes, the headline fix,
// and (when relevant) an over-packing warning.
function reviewerSummaryFor(sink, group) {
  const shapes = classifyPathShape(sink);
  const phrases = shapes.map((shape) => SHAPE_PHRASES[shape]).filter(Boolean);
  const mixed =
    phrases.length > 0
      ? `This sink mixes ${joinList(phrases)}.`
      : "This sink has more data-flow plumbing than nearby JSX should need.";
  const primary = primaryAdviceShape(sink, shapes);
  const fix = SHAPE_HEADLINE_FIX[primary];
  let fixSentence = fix
    ? `A behavior-preserving fix is to ${fix}.`
    : "A behavior-preserving fix is to compute a named value before JSX.";
  if (group?.verdict === "normalization-boundary") {
    fixSentence =
      "A behavior-preserving fix is to keep the parser/model boundary and make JSX read its typed fields.";
  } else if (group && packRiskForVerdict(group.verdict) > 0) {
    fixSentence =
      "A behavior-preserving fix is to split or relocate the pack before adding any broader render object.";
  }
  const sentences = [mixed, fixSentence];
  if (group) {
    if (packRiskForVerdict(group.verdict) > 0) {
      sentences.push(
        `Pack verdict: ${PACK_VERDICT_LABELS[group.verdict] ?? group.verdict}; avoid broadening \`${group.label}\`.`,
      );
    } else {
      sentences.push(
        `Pack verdict: ${PACK_VERDICT_LABELS[group.verdict] ?? group.verdict}; object packing is not the issue by itself.`,
      );
    }
  }
  return sentences.join(" ");
}

// Phase 7 — the kind of change this is, as a four-rung ladder of honest
// categories rather than a binary Provider/Context flag.
function ownershipHintFor(sink) {
  if (classifyPathShape(sink).includes("cross-component-relay")) {
    return "cross-component prop relay";
  }
  if (hasContextHookRoot(sink)) return "feature hook extraction";
  if (sink.metrics.mergeWidth >= 3 && sink.metrics.reachableSinks >= 4) {
    return "architectural fan-in";
  }
  if (sink.metrics.reachableSinks > 5) return "feature hook extraction";
  return "local component cleanup";
}

// "1 file" / "3 files" — pluralize a count noun for prose.
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// Oxford-comma join for short prose lists.
function joinList(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function sum(items, project) {
  return items.reduce((total, item) => total + project(item), 0);
}

export function reportSummaryForCompare(report) {
  return reportSummaryForCompareImpl(report, compareSummaryDependencies());
}

export function stopRecommendationFor(report) {
  return stopRecommendationForImpl(report, compareSummaryDependencies());
}

function compareSummaryDependencies() {
  return {
    findingTitle,
    groupedRenderRecommendations,
    isCertaintyBoundaryDefense,
    isProviderContextCandidate,
    mirrorSingletonRiskFor,
    severityFor,
  };
}

function appendBaseline(lines, report) {
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

function findingSentence(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) {
    return "A nullish fallback or optional access is unreachable under the checked TypeScript program.";
  }
  return "This rendered value has more data-flow plumbing than nearby JSX should usually need.";
}

function severityFor(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) return "HIGH";
  if (sink.scores.burden > 0.55) return "MEDIUM";
  return "LOW";
}

function normalized(value) {
  return Math.min(1, Math.log1p(value) / Math.log1p(20));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
