// Attributes that size the SVG/HTML shell itself. Split out from geometry so a
// plain width={...} is not lumped with bar-coordinate math when grouping sinks.
export const SVG_SHELL_ATTRIBUTES = new Set([
  "width",
  "height",
  "viewBox",
  "viewbox",
]);

// Per-element coordinate/shape attributes - the bar-geometry family.
export const GEOMETRY_FAMILY_ATTRIBUTES = new Set([
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

export const LOCAL_SCALAR_GEOMETRY_ATTRIBUTES = new Set([
  ...GEOMETRY_FAMILY_ATTRIBUTES,
  "stroke-dasharray",
  "strokeDasharray",
  "stroke-dashoffset",
  "strokeDashoffset",
]);

// The union is what "this path computes geometry" keys off of.
export const GEOMETRY_ATTRIBUTES = new Set([
  ...SVG_SHELL_ATTRIBUTES,
  ...GEOMETRY_FAMILY_ATTRIBUTES,
]);

export const STYLE_ATTRIBUTES = new Set(["class", "className", "style"]);
export const CONTROL_FLOW_ATTRIBUTES = new Set(["when", "each", "fallback"]);
export const IDENTITY_ATTRIBUTES = new Set([
  "id",
  "href",
  "xlink:href",
  "for",
  "name",
  "headers",
]);

// The JSX attribute name a sink renders into (`transform` from `transform={...}`),
// or null for bare rendered values / text nodes.
export function sinkAttributeName(sink) {
  const match = /^([A-Za-z0-9_-]+)=\{/.exec(sink.label ?? "");
  return match ? match[1] : null;
}

// The render region a sink belongs to. width/height/viewBox are the SVG/HTML
// shell; coordinate attributes are geometry; when/each/fallback are control-flow;
// class/style are style; id/href-like fields are identity; bare values are text.
export function sinkFamilyOf(sink) {
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

// Classify the data-flow path feeding a sink into zero or more shape tags,
// derived purely from the sink's own trace. Tags are non-exclusive; the array is
// returned in priority order so callers can treat element 0 as the primary shape.
export function classifyPathShape(sink) {
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

export function primaryAdviceShape(sink, shapes = classifyPathShape(sink)) {
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
