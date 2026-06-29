export function reportSummaryForCompare(report, dependencies) {
  const { severityFor } = dependencies;
  const top = report.rankings.all[0];
  return {
    worstScore: top?.scores.burden ?? 0,
    worstSeverity: top ? severityFor(top) : "LOW",
    hotspots: report.rankings.all.length,
    defensiveEntries: uniqueDefenseEntries(report.sinks).length,
    wrappers: sum(
      report.rankings.all,
      (sink) => sink.metrics.representationChurn,
    ),
    families: findingFamiliesFor(report, dependencies),
    backgroundLabels: unique(
      report.rankings.all.map((sink) => sink.background?.label).filter(Boolean),
    ),
  };
}

export function findingFamiliesFor(report, dependencies) {
  const {
    groupedRenderRecommendations,
    isProviderContextCandidate,
    mirrorSingletonRiskFor,
  } = dependencies;
  const families = [];
  if (
    report.rankings.all.some((sink) => sink.metrics.impossibleDefenseCount > 0)
  )
    families.push("type-impossible fallback");
  if (report.rankings.all.some((sink) => isProviderContextCandidate(sink)))
    families.push("provider/context advice");
  if (groupedRenderRecommendations(report.rankings.all).length > 0)
    families.push("render-item extraction");
  if (
    report.rankings.all.some(
      (sink) => sink.background?.label === "already readable",
    )
  )
    families.push("background scalar helpers");
  if (
    report.rankings.all.some(
      (sink) => sink.background?.label === "healthy shared boundary",
    )
  )
    families.push("healthy shared boundary");
  if (
    report.rankings.all.some(
      (sink) =>
        mirrorSingletonRiskFor(sink) ||
        sink.packVerdicts?.includes("mirror-object"),
    )
  )
    families.push("mirror singleton risk");
  return unique(families);
}

export function uniqueDefenseEntries(sinks) {
  return unique(
    sinks.flatMap((sink) =>
      (sink.defenses ?? []).map(
        (defense) =>
          `${defense.file}:${defense.line}:${defense.expression}:${defense.verdict}`,
      ),
    ),
  );
}

export function uniqueActionableDefenseEntries(sinks, dependencies) {
  const { isCertaintyBoundaryDefense } = dependencies;
  return unique(
    sinks.flatMap((sink) =>
      (sink.defenses ?? [])
        .filter((defense) => !isCertaintyBoundaryDefense(defense))
        .map(
          (defense) =>
            `${defense.file}:${defense.line}:${defense.expression}:${defense.verdict}`,
        ),
    ),
  );
}

export function stopRecommendationFor(report, dependencies) {
  const { findingTitle } = dependencies;
  const topActionable = report.rankings.all.find((sink) => !sink.background);
  const defensiveEntries = uniqueDefenseEntries(report.sinks).length;
  const actionableDefensiveEntries = uniqueActionableDefenseEntries(
    report.sinks,
    dependencies,
  ).length;
  const highRiskPacks = report.packGroups.filter((group) =>
    ["overpacked-bag", "relay-bag", "mirror-object"].includes(group.verdict),
  );
  const backgroundCount = report.rankings.all.filter(
    (sink) => sink.background,
  ).length;
  const topScore = topActionable?.scores.burden ?? 0;
  const lowTop = topScore < 0.35;
  const mostlyBackground =
    backgroundCount >= Math.max(1, report.rankings.all.length * 0.2);

  if (
    actionableDefensiveEntries === 0 &&
    highRiskPacks.length === 0 &&
    lowTop &&
    mostlyBackground
  ) {
    return {
      recommend: true,
      reason:
        defensiveEntries === 0
          ? "No defensive operation entries remain; highest actionable score is low; remaining paths are mostly scalar helpers or cohesive shared-boundary reads."
          : "No actionable defensive operation entries remain; remaining fallbacks are certainty/API-choice boundaries; highest actionable score is low.",
    };
  }
  if (actionableDefensiveEntries > 0) {
    return {
      recommend: false,
      reason: `${actionableDefensiveEntries} actionable defensive operation entr${actionableDefensiveEntries === 1 ? "y remains" : "ies remain"}.`,
    };
  }
  if (highRiskPacks.length > 0) {
    return {
      recommend: false,
      reason: `${highRiskPacks.length} high-risk pack verdict${highRiskPacks.length === 1 ? " remains" : "s remain"}.`,
    };
  }
  return {
    recommend: false,
    reason: topActionable
      ? `Highest actionable score is ${topScore.toFixed(2)}; review ${findingTitle(topActionable)} before stopping.`
      : "No actionable findings remain.",
  };
}

function sum(items, project) {
  return items.reduce((total, item) => total + project(item), 0);
}

function unique(values) {
  return Array.from(new Set(values));
}
