export function selectViewPayload(report, args, overviewHelpers = {}) {
  return {
    analysisVersion: report.analysisVersion,
    generatedAt: report.generatedAt,
    summary: report.summary,
    view: args.view,
    sinks: report.rankings.all.slice(0, args.maxItems),
    contextRelay:
      args.view === "context-relay"
        ? report.contextRelay.slice(0, args.maxItems)
        : undefined,
    helpers: ["boundary-report", "junctions", "inline-preview"].includes(
      args.view,
    )
      ? (report.helpers ?? []).slice(0, args.maxItems)
      : undefined,
    unknownEdges:
      args.view === "overview"
        ? (report.unknownEdges ?? []).slice(0, args.maxItems)
        : undefined,
    packGroups: ["work-packets", "findings"].includes(args.view)
      ? (report.packGroups ?? []).slice(0, args.maxItems)
      : undefined,
    hotspots:
      args.view === "overview"
        ? overviewHotspotsPayload(report, args, overviewHelpers)
        : undefined,
    concentration: args.view === "overview" ? report.concentration : undefined,
    // The `dossier` markdown view was retired (round 8), but its structural payload
    // (graph counts + bounded node/edge sample) stays "available on request" here:
    // every `--format json` response carries the bounded graph regardless of view.
    graph: boundedGraph(report.graph, args.maxItems),
    baseline: report.baseline,
  };
}

export function boundedGraph(graph, maxItems) {
  return {
    nodes: graph.nodes.slice(0, maxItems),
    edges: graph.edges.slice(0, maxItems),
    omittedNodes: Math.max(0, graph.nodes.length - maxItems),
    omittedEdges: Math.max(0, graph.edges.length - maxItems),
    unknownEdges: graph.unknownEdges,
  };
}

function overviewHotspotsPayload(report, args, helpers) {
  const { hotspotGroups, modalValue, firstCutFor } = helpers;
  if (!hotspotGroups || !modalValue || !firstCutFor) {
    throw new Error("overview JSON payload requires overview helper functions");
  }
  return hotspotGroups(report, args.by === "feature" ? "feature" : "file")
    .slice(0, args.maxItems)
    .map((group) => ({
      key: group.key,
      count: group.count,
      worst: Number(group.worst.toFixed(3)),
      sumBurden: Number(group.sumBurden.toFixed(3)),
      maxReach: group.maxReach,
      dominantShape: modalValue(group.shapes),
      ownership: modalValue(group.ownership),
      firstCut: firstCutFor(group.worstSink),
    }));
}
