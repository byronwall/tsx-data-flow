import { fanOutRootsFor } from "../analysis/fan-out.mjs";
import {
  classifyPathShape,
  sinkAttributeName,
  sinkFamilyOf,
} from "../analysis/sink-shape.mjs";
import {
  camelCase,
  camelWords,
  formatExpression,
  paramNameFor,
  pascalCase,
  stepVerb,
  wordsFromIdentifier,
} from "./format-helpers.mjs";

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
export function extractionProposalFor(sink) {
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

export function renderedThingFor(sink) {
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

export function singularRenderedThing(text) {
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

export function pluralRenderedThing(text) {
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
export function representativePathWithBoundaries(sink) {
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
