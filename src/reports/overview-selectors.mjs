import path from "node:path";
import { fanOutIdentity, fanOutRootsFor } from "../analysis/fan-out.mjs";
import {
  classifyPathShape,
  primaryAdviceShape,
} from "../analysis/sink-shape.mjs";

// Upper bound on enumerated reached-sinks stored per source, to keep the
// reachedVia structure from going O(n^2) on a very high fan-out source. The
// true count is kept separately so the UI can show "+N more".
const REACHED_VIA_CAP = 50;

// Concise "suggested first cut" per shape — the headline action for a hotspot.
const SHAPE_FIRST_CUT = {
  "svg-shell": "keep shell sizing inline",
  "local-scalar-geometry": "name repeated local scalars",
  "geometry-chain": "extract render item geometry",
  "collection-render-model": "extract rendered items",
  "control-flow-gate": "name the predicate",
  "presentation-pack": "split the class/style object",
  "domain-normalization": "normalize at the boundary",
  "solid-prop-default-boundary": "promote prop defaults to mergeProps",
  "cross-component-relay": "move state behind context",
};

export function firstCutFor(sink) {
  if (!sink) return "—";
  return SHAPE_FIRST_CUT[primaryShapeOf(sink)] ?? "local boundary cleanup";
}

// The most common value in a list (for dominant shape/ownership columns).
export function modalValue(values) {
  const counts = countBy(values);
  const entries = Object.entries(counts).sort(
    (left, right) => right[1] - left[1],
  );
  return entries[0]?.[0] ?? "—";
}

// Approach 4 — aggregate the burden ranking into one row per file (or feature
// area). The breadth map: every place with a finding appears once.
export function hotspotGroups(report, by) {
  const groups = new Map();
  for (const sink of report.rankings.all) {
    const key = by === "feature" ? featureKeyFor(sink.file) : sink.file;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        count: 0,
        worst: 0,
        sumBurden: 0,
        maxReach: 0,
        shapes: [],
        ownership: [],
        worstSink: null,
      };
      groups.set(key, group);
    }
    group.count += 1;
    group.sumBurden += sink.scores.burden;
    if (sink.scores.burden > group.worst) {
      group.worst = sink.scores.burden;
      group.worstSink = sink;
    }
    group.maxReach = Math.max(group.maxReach, sink.metrics.reachableSinks);
    group.shapes.push(primaryShapeOf(sink));
    group.ownership.push(ownershipHintFor(sink));
  }
  return Array.from(groups.values()).sort(
    (left, right) =>
      right.sumBurden - left.sumBurden || right.worst - left.worst,
  );
}

// ARCH-2 (B): fan-out entries scoped to a single file, for the code-map unified
// list. A fan-out row is a source that feeds many render sinks; its natural unit
// is cross-file (how widely the value spreads), so we compute over ALL sinks to
// keep the true reach count, then keep only roots that touch `relPath` and anchor
// each to one of its in-file sinks. `total` is the cross-file sink count;
// `sinks` is the (capped) list of in-file sinks for jump links.
export function fanOutEntriesForFile(allSinks, relPath) {
  const map = new Map();
  for (const sink of allSinks ?? []) {
    for (const info of fanOutRootsFor(sink)) {
      const { key, label } = fanOutIdentity(sink, info);
      let entry = map.get(key);
      if (!entry) {
        entry = {
          root: label,
          kind: info.kind,
          // FANOUT-DEF-1: definition location of the source (when resolvable), so
          // the graph's source node links to where it is declared, not a usage.
          def: info.def ?? null,
          total: 0,
          files: new Set(),
          inFile: [],
          // GRAPH-1: a capped cross-file sample so the fan-out graph can show the
          // spread colored by file, not just the in-file sinks.
          graphSinks: [],
          example: null,
          maxDepth: 0,
        };
        map.set(key, entry);
      }
      entry.total += 1;
      entry.files.add(sink.file);
      // GRAPH (round 6): no cap — the graph draws every reached sink, grouped by
      // file. (Was previously capped at 40 with a "+N more" node.)
      entry.graphSinks.push(reachedSinkDescriptor(sink));
      entry.maxDepth = Math.max(
        entry.maxDepth,
        sink.metrics?.maximumPathDepth ?? 0,
      );
      if (sink.file === relPath) {
        if (entry.inFile.length < REACHED_VIA_CAP)
          entry.inFile.push(reachedSinkDescriptor(sink));
        if (
          !entry.example ||
          (sink.metrics?.maximumPathDepth ?? 0) >
            (entry.example.metrics?.maximumPathDepth ?? 0)
        ) {
          entry.example = sink;
        }
      }
    }
  }
  return Array.from(map.values())
    .filter((entry) => entry.inFile.length > 0 && entry.total >= 2)
    .map((entry) => ({
      root: entry.root,
      kind: entry.kind,
      def: entry.def,
      sinkCount: entry.total,
      fileCount: entry.files.size,
      line: entry.example?.line ?? entry.inFile[0]?.line ?? null,
      maxDepth: entry.maxDepth,
      sinks: entry.inFile,
      graphSinks: entry.graphSinks,
    }))
    .sort((left, right) => right.sinkCount - left.sinkCount);
}

// HOME-1: the cross-file fan-out entries for the OVERVIEW page — same grouping as
// `fanOutEntriesForFile` but with no per-file filter, so every shared source that
// reaches ≥2 sinks is returned with its full (uncapped) cross-file sink set for the
// graph. The overview is the "here are the detected fan-outs" starting point that
// motivates drilling into a file (each sink node links to its file page).
export function fanOutEntriesGlobal(allSinks) {
  const map = new Map();
  for (const sink of allSinks ?? []) {
    for (const info of fanOutRootsFor(sink)) {
      const { key, label } = fanOutIdentity(sink, info);
      let entry = map.get(key);
      if (!entry) {
        entry = {
          root: label,
          kind: info.kind,
          def: info.def ?? null,
          total: 0,
          files: new Set(),
          graphSinks: [],
          maxDepth: 0,
        };
        map.set(key, entry);
      }
      entry.total += 1;
      entry.files.add(sink.file);
      entry.graphSinks.push(reachedSinkDescriptor(sink));
      entry.maxDepth = Math.max(
        entry.maxDepth,
        sink.metrics?.maximumPathDepth ?? 0,
      );
    }
  }
  return Array.from(map.values())
    .filter((entry) => entry.total >= 2)
    .map((entry) => ({
      root: entry.root,
      kind: entry.kind,
      def: entry.def,
      sinkCount: entry.total,
      fileCount: entry.files.size,
      line: null,
      maxDepth: entry.maxDepth,
      sinks: entry.graphSinks,
      graphSinks: entry.graphSinks,
    }))
    .sort((left, right) => right.sinkCount - left.sinkCount);
}

// OVERVIEW-1: per-file counts of every non-finding entry type, so the overview
// table can show breadth across types (not just the finding count) in optional
// columns. Findings/path-depth already come from hotspotGroups; this adds
// boundaries (reached helpers), relays (context-aware parents), unknown edges,
// and fan-out roots. One pass over sinks for fan-out; the rest are direct.
export function entryTypeCountsByFile(report) {
  const counts = new Map();
  const bump = (file, key) => {
    if (!file) return;
    let c = counts.get(file);
    if (!c) {
      c = { boundaries: 0, relays: 0, unknown: 0, fanOut: 0 };
      counts.set(file, c);
    }
    c[key] += 1;
  };
  for (const helper of report.helpers ?? []) bump(helper.file, "boundaries");
  for (const relay of report.contextRelay ?? [])
    bump(relay.parentFile, "relays");
  for (const edge of report.unknownEdges ?? []) bump(edge.file, "unknown");
  // Fan-out: a file "has" a fan-out root when that root reaches ≥2 sinks total
  // and at least one of them lives in the file (mirrors fanOutEntriesForFile).
  const totals = new Map();
  const filesByRoot = new Map();
  for (const sink of report.rankings?.all ?? report.sinks ?? []) {
    for (const info of fanOutRootsFor(sink)) {
      const { key } = fanOutIdentity(sink, info);
      totals.set(key, (totals.get(key) ?? 0) + 1);
      if (!filesByRoot.has(key)) filesByRoot.set(key, new Set());
      filesByRoot.get(key).add(sink.file);
    }
  }
  for (const [key, files] of filesByRoot) {
    if ((totals.get(key) ?? 0) < 2) continue;
    for (const file of files) bump(file, "fanOut");
  }
  return counts;
}

function primaryShapeOf(sink) {
  return primaryAdviceShape(sink) ?? "uncategorized";
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

function hasContextHookRoot(sink) {
  return sink.roots.some((root) => /^use[A-Z]/.test(root));
}

// Phase 3a — the render region a sink belongs to. width/height/viewBox are the
// SVG/HTML *shell*; coordinate attributes are *geometry*; when/each/fallback are
// *control-flow*; class/style are *style*; id/href-like fields are *identity*;
// bare values are *text*.
function sinkFamilyOf(sink) {
  const attribute = sinkAttributeName(sink);
  if (attribute && SVG_SHELL_ATTRIBUTES.has(attribute)) return "svg-shell";
  if (attribute && GEOMETRY_FAMILY_ATTRIBUTES.has(attribute)) return "geometry";
  if (attribute && CONTROL_FLOW_ATTRIBUTES.has(attribute))
    return "control-flow";
  if (attribute && STYLE_ATTRIBUTES.has(attribute)) return "style";
  if (attribute && IDENTITY_ATTRIBUTES.has(attribute)) return "identity";
  if (sink.category === "rendered-value") return "text";
  return "other";
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

// Compact, render-friendly descriptor of a sink reached through a shared source.
function reachedSinkDescriptor(sink) {
  const ctx = sink.renderContext ?? {};
  const where = [ctx.tag, ctx.attribute].filter(Boolean).join(" / ");
  return {
    id: sink.id,
    file: sink.file,
    line: sink.line,
    label: where || sink.label || sink.expression || sink.id,
    // FANOUT-DEPTH-1: the sink's own longest source→sink path length, so the
    // fan-out graph can show how *derived* each reached sink is right next to it.
    // Cheap (already computed); this is the sink's overall depth, not a measured
    // distance from this particular root (that enhancement is deferred).
    depth: sink.metrics?.maximumPathDepth ?? 0,
  };
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
