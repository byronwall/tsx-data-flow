import { defaultMaxItemsFor } from "../cli/args.mjs";
import { unique } from "../analysis/collections.mjs";
import { findingTitle } from "../analysis/finding-title.mjs";
import { isCertaintyBoundaryDefense } from "../analysis/source-file.mjs";
import { fanOutIdentity, fanOutRootsFor } from "../analysis/fan-out.mjs";
import { packGroupForSink } from "../analysis/pack-groups.mjs";
import { familyRows } from "../analysis/ranking.mjs";
import { makeFileMatcher } from "../analysis/report-builder.mjs";
import {
  classifyPathShape,
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
} from "./markdown-format.mjs";
import { collapse, formatExpression, pascalCase } from "./format-helpers.mjs";
import {
  reportSummaryForCompare as reportSummaryForCompareImpl,
  stopRecommendationFor as stopRecommendationForImpl,
} from "./compare-summary.mjs";
import { appendBaseline } from "./markdown-baseline.mjs";
import {
  extractionProposalFor,
  pluralRenderedThing,
  renderedThingFor,
  representativePathWithBoundaries,
  singularRenderedThing,
} from "./markdown-path-proposals.mjs";
import {
  candidateEditsFor,
  isProviderContextCandidate,
  overpackedSplitLines,
  ownershipHintFor,
  packVerdictLines,
  reviewerSummaryFor,
} from "./markdown-work-advice.mjs";
import { fanOutEntriesGlobal } from "./overview-selectors.mjs";
import {
  concentrationLines,
  selectWorkItems,
  selectionBanner,
  suppressionLines,
} from "./markdown-selection.mjs";
import {
  appendFeatureClusters,
  appendStopRecommendation,
  renderOverviewReport,
} from "./markdown-overview.mjs";
import {
  actionableSourceLabels,
  renderFindings,
  severityFor,
} from "./markdown-findings.mjs";
import { renderRepeatedForks } from "./markdown-repeated-forks.mjs";
import {
  renderContextRelay,
  renderDefensiveLedger,
  renderFanIn,
  renderFanOut,
  renderPathFamilies,
  renderPropRelay,
} from "./markdown-standard-views.mjs";
import {
  renderBoundaryReport,
  renderComponentRefs,
  renderInlinePreview,
  renderJunctions,
} from "./markdown-boundary-views.mjs";

export function renderMarkdownView(report, args) {
  switch (args.view) {
    case "overview":
      return renderOverviewReport(report, args, {
        appendBaseline,
        stopRecommendationFor,
      });
    case "findings":
      return renderFindings(report, args, { appendBaseline });
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
  appendStopRecommendation(lines, report, stopRecommendationFor);
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

// "1 file" / "3 files" — pluralize a count noun for prose.
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
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
