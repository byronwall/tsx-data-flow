import { fanOutRootsFor } from "./fan-out.mjs";
import { reachedSinkDescriptor } from "./sink-descriptor.mjs";

// Upper bound on enumerated reached-sinks stored per source, to keep the
// reachedVia structure from going O(n^2) on a very high fan-out source. The
// true count is kept separately so the UI can show "+N more".
const REACHED_VIA_CAP = 50;

export function queueFor(metrics, defenses, reachThreshold = 3) {
  if (
    metrics.unknownEdgeCount > 0 ||
    defenses.some((defense) => defense.verdict === "unknown")
  ) {
    return "investigation";
  }
  // Central-leverage = a source that feeds many render sinks (top reach
  // quartile for the report, passed in) or a pathologically deep relay path.
  if (
    metrics.reachableSinks >= reachThreshold ||
    metrics.maximumPathDepth > 10
  ) {
    return "central-leverage";
  }
  return "peripheral-quick-win";
}

// Whole-graph grounding pass. The trace graph does not deduplicate nodes across
// sinks, so downstream reach cannot be read off the raw graph per source node.
// Instead aggregate by source identity (label): a source's reach is the number
// of distinct render sinks its actionable roots feed. Each sink then inherits
// the reach of its most-central source. This replaces the former constant base
// reach in centralityScore and the hardcoded `reachable sinks: 1`.
export function groundReachability(sinks) {
  // Map each fan-out source identity to every sink it feeds, so reach is not
  // just a number but an enumerable set — the report can show *which* sinks a
  // shared source reaches, grouped by that source (the chain root → sinks).
  const sinksByRoot = new Map();
  for (const sink of sinks) {
    for (const info of fanOutRootsFor(sink)) {
      if (!sinksByRoot.has(info.label)) sinksByRoot.set(info.label, []);
      sinksByRoot.get(info.label).push(sink);
    }
  }
  for (const sink of sinks) {
    let reach = 1;
    // Group the other sinks this sink's sources also feed, keyed by the shared
    // source. Only roots with genuine fan-out (>1 sink) are interesting.
    const reachedVia = [];
    for (const info of fanOutRootsFor(sink)) {
      const fed = sinksByRoot.get(info.label) ?? [sink];
      reach = Math.max(reach, fed.length);
      const others = fed.filter((other) => other.nodeId !== sink.nodeId);
      if (others.length > 0) {
        reachedVia.push({
          source: info.label,
          total: others.length,
          // Cap stored descriptors so a high fan-out source can't make this
          // O(n^2); `total` preserves the true count for the "+N more" hint.
          sinks: others
            .slice(0, REACHED_VIA_CAP)
            .map((other) => reachedSinkDescriptor(other)),
        });
      }
    }
    sink.metrics.reachableSinks = reach;
    sink.reachedVia = reachedVia;
  }
  // Queues depend on reach, so finalize them here (buildSinkRecord runs before
  // grounding). The central-leverage cutoff is the report's own top reach
  // quartile rather than a fixed magic number: it adapts to codebase size and
  // keeps central-leverage a meaningful minority. The floor of 3 means a sink
  // must feed at least three render sinks to qualify on small/flat projects.
  const reaches = sinks
    .map((sink) => sink.metrics.reachableSinks)
    .sort((a, b) => a - b);
  const reachThreshold = Math.max(3, percentile(reaches, 0.75));
  for (const sink of sinks) {
    sink.queue = queueFor(sink.metrics, sink.defenses, reachThreshold);
  }
}

function percentile(values, target) {
  if (values.length === 0) return 0;
  return values[
    Math.min(values.length - 1, Math.floor(values.length * target))
  ];
}
