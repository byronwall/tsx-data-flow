import { unique } from "../analysis/collections.mjs";
import { packRiskForVerdict } from "../analysis/pack-groups.mjs";
import {
  classifyPathShape,
  primaryAdviceShape,
  sinkFamilyOf,
} from "../analysis/sink-shape.mjs";
import { articleFor } from "./format-helpers.mjs";
import {
  pluralRenderedThing,
  renderedThingFor,
} from "./markdown-path-proposals.mjs";
import { modalValue } from "./overview-selectors.mjs";

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

export function candidateEditsFor(sink, group = null) {
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

export function isProviderContextCandidate(sink) {
  return providerContextEvidenceFor(sink).eligible;
}

export function providerContextEvidenceFor(sink) {
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

export function localFirstCutForCluster(cluster) {
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

export function providerEvidenceSummary(evidence) {
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

export function packVerdictLines(group) {
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
export function overpackedSplitLines(group) {
  const lines = [
    `Object \`${group.label}\` feeds ${group.families.length} sink families — split it:`,
  ];
  for (const family of group.families) {
    const members = group.familyMembers[family] ?? [];
    lines.push(`  ${FAMILY_LABELS[family] ?? family}: ${members.join(", ")}`);
  }
  return lines;
}

// Phase 6 — a compact PR-review framing: what the sink mixes, the headline fix,
// and (when relevant) an over-packing warning.
export function reviewerSummaryFor(sink, group) {
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
export function ownershipHintFor(sink) {
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

function joinList(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
