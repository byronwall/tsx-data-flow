import path from "node:path";

// Upper bound on enumerated reached-sinks stored per source, to keep the
// reachedVia structure from going O(n^2) on a very high fan-out source. The
// true count is kept separately so the UI can show "+N more".
const REACHED_VIA_CAP = 50;

// Attributes that size the SVG/HTML shell itself. Split out from geometry so a
// plain width={...} is not lumped with bar-coordinate math when grouping sinks.
const SVG_SHELL_ATTRIBUTES = new Set(["width", "height", "viewBox", "viewbox"]);
// Per-element coordinate/shape attributes — the bar-geometry family.
const GEOMETRY_FAMILY_ATTRIBUTES = new Set([
  "transform",
  "x",
  "y",
  "cx",
  "cy",
  "d",
  "points",
  "r",
  "dx",
  "dy",
  "x1",
  "y1",
  "x2",
  "y2",
  "rx",
  "ry",
]);
const LOCAL_SCALAR_GEOMETRY_ATTRIBUTES = new Set([
  ...GEOMETRY_FAMILY_ATTRIBUTES,
  "stroke-dasharray",
  "strokeDasharray",
  "stroke-dashoffset",
  "strokeDashoffset",
]);
const STYLE_ATTRIBUTES = new Set(["class", "className", "style"]);
const CONTROL_FLOW_ATTRIBUTES = new Set(["when", "each", "fallback"]);
const IDENTITY_ATTRIBUTES = new Set([
  "id",
  "href",
  "xlink:href",
  "for",
  "name",
  "headers",
]);

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

// Global identifiers and language keywords that the local file context cannot
// resolve and that surface as `unknown-source` roots, but are never an ownable
// domain "source" a developer could centralize. Excluded from fan-out ranking.
const NON_FAN_OUT_GLOBALS = new Set([
  "undefined",
  "null",
  "NaN",
  "Infinity",
  "Math",
  "JSON",
  "Object",
  "Array",
  "Number",
  "String",
  "Boolean",
  "Date",
  "console",
  "window",
  "document",
  "globalThis",
]);

// FANOUT-1: a `prop-read` root (`props.isOpen`) is local to the component that
// declares those props — two different components reading `props.isOpen` are
// different values. Keying fan-out by the bare expression text merged unrelated
// props across the whole repo (badly so for common names like `isOpen`) and
// inflated the consumer count. So scope prop-derived roots by their owning
// component; module-level/hook/import/context roots stay globally keyed because
// those genuinely are one shared source feeding many files. The display label is
// qualified with the component so the grouping basis is visible, not implied.
const PROP_SCOPED_FANOUT_KINDS = new Set(["prop-read"]);

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

function primaryAdviceShape(sink, shapes = classifyPathShape(sink)) {
  if (sinkFamilyOf(sink) === "svg-shell" && shapes.includes("svg-shell")) {
    return "svg-shell";
  }
  if (sink.category === "style" && shapes.includes("presentation-pack")) {
    return "presentation-pack";
  }
  if (
    sink.category === "render-control" &&
    shapes.includes("control-flow-gate")
  ) {
    return "control-flow-gate";
  }
  if (
    shapes.includes("solid-prop-default-boundary") &&
    (shapes[0] === "domain-normalization" || shapes.length === 1)
  ) {
    return "solid-prop-default-boundary";
  }
  return shapes[0] ?? null;
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

// The JSX attribute name a sink renders into (`transform` from `transform={...}`),
// or null for bare rendered values / text nodes.
function sinkAttributeName(sink) {
  const match = /^([A-Za-z0-9_-]+)=\{/.exec(sink.label ?? "");
  return match ? match[1] : null;
}

// tags, derived purely from the sink's own trace (no repo scanning). Tags are
// non-exclusive; the array is returned in a fixed priority order so callers can
// treat element 0 as the primary shape.
function classifyPathShape(sink) {
  const attribute = sinkAttributeName(sink);
  const steps = sink.representativeSteps ?? [];
  const kinds = new Set(steps.map((step) => step.kind));
  const labelText = steps.map((step) => step.label).join(" ");
  const metrics = sink.metrics;
  const rootInfos = sink.rootInfos ?? [];
  const tags = [];

  if (attribute && SVG_SHELL_ATTRIBUTES.has(attribute)) {
    tags.push("svg-shell");
  }

  if (isLocalScalarGeometry(sink)) {
    tags.push("local-scalar-geometry");
  }

  const hasArithmetic = /[-+*/%]/.test(labelText) || kinds.has("template");
  if (
    (attribute && GEOMETRY_FAMILY_ATTRIBUTES.has(attribute)) ||
    (kinds.has("template") &&
      hasArithmetic &&
      metrics.controlDependencyCount > 0)
  ) {
    tags.push("geometry-chain");
  }

  if (
    (sink.category === "render-control" && attribute === "each") ||
    /\.(map|filter|sort|flatMap|reduce|slice)\(/.test(labelText)
  ) {
    tags.push("collection-render-model");
  }

  if (
    (attribute && (attribute === "when" || attribute === "fallback")) ||
    (metrics.controlDependencyCount > 0 &&
      metrics.defensiveOperationCount > 0 &&
      sink.category === "render-control")
  ) {
    tags.push("control-flow-gate");
  }

  if (
    sink.category === "style" ||
    (kinds.has("object-pack") && attribute && STYLE_ATTRIBUTES.has(attribute))
  ) {
    tags.push("presentation-pack");
  }

  if (
    metrics.defensiveOperationCount > 0 ||
    (metrics.controlDependencyCount > 0 &&
      rootInfos.some((info) => info.kind === "prop-read"))
  ) {
    tags.push("domain-normalization");
  }

  if (hasSolidPropDefaultBoundary(sink)) {
    tags.push("solid-prop-default-boundary");
  }

  if (
    metrics.mergeWidth > 1 &&
    metrics.helperHops === 0 &&
    rootInfos.length > 0 &&
    rootInfos.every(
      (info) => info.kind === "prop-read" || info.kind === "parameter",
    )
  ) {
    tags.push("cross-component-relay");
  }

  return tags;
}

function isLocalScalarGeometry(sink) {
  const attribute = sinkAttributeName(sink);
  if (!attribute || !LOCAL_SCALAR_GEOMETRY_ATTRIBUTES.has(attribute)) {
    return false;
  }
  if (
    ![
      "cx",
      "cy",
      "r",
      "stroke-dasharray",
      "strokeDasharray",
      "stroke-dashoffset",
      "strokeDashoffset",
    ].includes(attribute)
  ) {
    return false;
  }
  if (sinkFamilyOf(sink) === "svg-shell") return false;
  if (sink.packVerdicts?.includes("cohesive-render-model")) return false;
  if (
    classifyPathText(sink).match(
      /\b(?:map|filter|flatMap|reduce|For|each|index\s*\(|value\s*=>)\b/,
    )
  ) {
    return false;
  }
  const metrics = sink.metrics ?? {};
  if ((metrics.packRisk ?? 0) > 0) return false;
  const text = classifyPathText(sink);
  const hasScalarMath =
    /[-+*/%]/.test(text) ||
    /\b(?:Math\.|PI|circumference|radius|center|dash|size|strokeWidth|stroke-width)\b/i.test(
      text,
    );
  if (!hasScalarMath) return false;
  return true;
}

function classifyPathText(sink) {
  return [
    sink.label,
    sink.expression,
    ...(sink.representativeSteps ?? []).map((step) => step.label),
  ].join(" ");
}

function hasSolidPropDefaultBoundary(sink) {
  return (sink.defenses ?? []).some((defense) =>
    /solid prop default/i.test(defense.origin ?? ""),
  );
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

// Fan-out ranks the sources a value flows from. Literals/primitives (`0`,
// `false`, `""`, `[]`) and bare parameter objects (`props`) are not actionable
// shared roots on their own; this returns only named/module/domain roots.
function fanOutRootsFor(sink) {
  const infos =
    sink.rootInfos ??
    sink.roots.map((root) => ({ label: root, kind: "source" }));
  return infos.filter(
    (info) =>
      info.kind !== "literal" &&
      info.kind !== "parameter" &&
      // BUG-1: an "operation" root is a synthetic placeholder for a no-input
      // operation (e.g. an empty `{}` object-pack). It is not a shared source and
      // must never collapse into a global fan-out entry keyed on its bare label.
      info.kind !== "operation" &&
      !NON_FAN_OUT_GLOBALS.has(info.label),
  );
}

function fanOutIdentity(sink, info) {
  if (PROP_SCOPED_FANOUT_KINDS.has(info.kind)) {
    const component = sink.renderContext?.component ?? null;
    const scope = component ?? sink.file ?? "";
    return {
      key: `${scope}::${info.label}`,
      label: component ? `${component} › ${info.label}` : info.label,
    };
  }
  return { key: info.label, label: info.label };
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
