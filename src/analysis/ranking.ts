const USAGE_BURDEN_CEILING = 0.08;

const BURDEN_TERMS = [
  {
    key: "maximumPathDepth",
    label: "path depth",
    weight: 0.15,
    read: (m) => m.maximumPathDepth,
  },
  {
    key: "helperHops",
    label: "helper hops",
    weight: 0.13,
    read: (m) => m.helperHops,
  },
  {
    key: "representationChurn",
    label: "representation churn",
    weight: 0.16,
    read: (m) => m.representationChurn,
  },
  {
    key: "defensiveOperations",
    label: "defensive operations",
    weight: 0.15,
    read: (m) =>
      m.actionableDefensiveOperationCount ?? m.defensiveOperationCount,
  },
  {
    key: "impossibleDefenseCount",
    label: "impossible defenses",
    weight: 0.15,
    read: (m) => m.impossibleDefenseCount,
  },
  {
    key: "controlDependencyCount",
    label: "control dependencies",
    weight: 0.1,
    read: (m) => m.controlDependencyCount,
  },
  {
    key: "repeatedNormalization",
    label: "repeated normalization",
    weight: 0.08,
    read: (m) => m.repeatedNormalization,
  },
  {
    key: "packRisk",
    label: "pack risk",
    weight: 0.08,
    read: (m) => m.packRisk,
  },
];

const SCALAR_HELPER_STEP_KINDS = new Set([
  "source",
  "property-read",
  "conditional",
  "call",
  "alias",
  "solid-accessor",
]);

export function rankSinks(sinks) {
  const enriched = sinks.map((sink) => {
    const background = backgroundClassificationFor(sink);
    const rawBurden = burdenScore(sink.metrics);
    const burden = background ? rawBurden * background.penalty : rawBurden;
    const centrality = centralityScore(sink.metrics);
    const changeRisk = changeRiskScore(sink.metrics);
    const confidence = sink.confidence / 100;
    return {
      ...sink,
      signature: signatureFor(sink),
      background,
      tier: classifyTier(sink, burden),
      scores: {
        burden,
        rawBurden,
        burdenBreakdown: {
          ...burdenBreakdown(sink.metrics),
          backgroundPenalty: background ? background.penalty : 1,
        },
        centrality,
        changeRisk,
        quickWin:
          (confidence * burden * Math.pow(1 - centrality, 0.7)) /
          (0.25 + changeRisk),
        centralLeverage:
          (confidence * burden * centrality * Math.max(0.1, centrality)) /
          (0.25 + changeRisk),
        investigationPriority:
          burden * centrality * Math.min(1, sink.metrics.unknownEdgeCount / 3),
      },
    };
  });
  return {
    all: enriched.sort(
      (left, right) => right.scores.burden - left.scores.burden,
    ),
    quickWins: enriched
      .filter((sink) => sink.queue === "peripheral-quick-win")
      .sort((left, right) => right.scores.quickWin - left.scores.quickWin),
    centralLeverage: enriched
      .filter((sink) => sink.queue === "central-leverage")
      .sort(
        (left, right) =>
          right.scores.centralLeverage - left.scores.centralLeverage,
      ),
    investigations: enriched
      .filter((sink) => sink.queue === "investigation")
      .sort(
        (left, right) =>
          right.scores.investigationPriority -
          left.scores.investigationPriority,
      ),
  };
}

export function familyRows(sinks) {
  const families = new Map();
  for (const sink of sinks) {
    const signature = signatureFor(sink);
    const family = families.get(signature) ?? {
      paths: 0,
      sinks: 0,
      maxDepth: 0,
      example: null,
    };
    family.paths += 1;
    family.sinks += 1;
    if (!family.example || sink.metrics.maximumPathDepth >= family.maxDepth) {
      family.example = sink;
    }
    family.maxDepth = Math.max(family.maxDepth, sink.metrics.maximumPathDepth);
    families.set(signature, family);
  }
  return Array.from(families.entries()).map(([signature, family]) => ({
    signature,
    paths: family.paths,
    sinks: family.sinks,
    maxDepth: family.maxDepth,
    example: family.example,
  }));
}

function classifyTier(sink, burden) {
  const m = sink.metrics ?? {};
  const hasSignal =
    (m.actionableDefensiveOperationCount ?? 0) > 0 ||
    (m.impossibleDefenseCount ?? 0) > 0 ||
    (m.representationChurn ?? 0) > 0 ||
    (m.controlDependencyCount ?? 0) > 0 ||
    (m.helperHops ?? 0) > 0 ||
    (m.packRisk ?? 0) > 0 ||
    (m.suspiciousPackCount ?? 0) > 0 ||
    (m.unknownEdgeCount ?? 0) > 0 ||
    (m.repeatedNormalization ?? 0) > 0;
  return burden < USAGE_BURDEN_CEILING && !hasSignal ? "usage" : "finding";
}

function signatureFor(sink) {
  const parts = [];
  if (sink.metrics.representationChurn > 0) parts.push("object-pack");
  if (sink.metrics.helperHops > 0) parts.push("call");
  if (sink.metrics.controlDependencyCount > 0) parts.push("conditional");
  if (sink.metrics.impossibleDefenseCount > 0) parts.push("impossible-defense");
  else if (sink.metrics.defensiveOperationCount > 0) parts.push("fallback");
  parts.push("jsx-sink");
  if (sink.metrics.unknownEdgeCount > 0) parts.push("(unknown)");
  return `${depthBand(sink.metrics.maximumPathDepth)} ${parts.join(" -> ")}`;
}

function depthBand(depth) {
  if (depth <= 1) return "trivial";
  if (depth <= 3) return "shallow";
  if (depth <= 7) return "medium";
  return "deep";
}

function burdenScore(metrics) {
  return clamp01(burdenRawSum(metrics));
}

function burdenRawSum(metrics) {
  return BURDEN_TERMS.reduce(
    (sum, term) => sum + term.weight * normalized(term.read(metrics) ?? 0),
    0,
  );
}

function burdenBreakdown(metrics) {
  const terms = BURDEN_TERMS.map((term) => {
    const raw = term.read(metrics) ?? 0;
    const norm = normalized(raw);
    return {
      key: term.key,
      label: term.label,
      weight: term.weight,
      raw,
      normalized: norm,
      contribution: term.weight * norm,
    };
  }).sort((a, b) => b.contribution - a.contribution);
  const rawSum = terms.reduce((sum, term) => sum + term.contribution, 0);
  return { terms, rawSum, total: clamp01(rawSum) };
}

function centralityScore(metrics) {
  return clamp01(
    0.4 * normalized(metrics.reachableSinks) +
      0.2 * normalized(metrics.maximumPathDepth) +
      0.15 * normalized(metrics.helperHops) +
      0.15 * normalized(metrics.mergeWidth) +
      0.1 * normalized(metrics.sliceSize),
  );
}

function changeRiskScore(metrics) {
  return clamp01(
    0.25 * normalized(metrics.reachableSinks) +
      0.25 * normalized(metrics.unknownEdgeCount) +
      0.15 * normalized(metrics.controlDependencyCount) +
      0.1 * normalized(metrics.helperHops) +
      0.25 * normalized(metrics.sliceSize),
  );
}

function backgroundClassificationFor(sink) {
  const healthyBoundary = healthySharedBoundaryFor(sink);
  if (healthyBoundary) {
    return {
      label: "healthy shared boundary",
      reason: `${healthyBoundary} returns cohesive layout data; sink reads an expected field`,
      penalty: 0.25,
    };
  }
  if (isLowValueScalarHelper(sink)) {
    return {
      label: "already readable",
      reason:
        "local scalar helper; simple reads/arithmetic; no defenses or object packing",
      penalty: 0.35,
    };
  }
  return null;
}

function healthySharedBoundaryFor(sink) {
  const metrics = sink.metrics ?? {};
  if ((metrics.impossibleDefenseCount ?? 0) > 0) return null;
  if ((metrics.defensiveOperationCount ?? 0) > 0) return null;
  if ((metrics.unknownEdgeCount ?? 0) > 0) return null;
  const steps = sink.representativeSteps ?? [];
  const helper = steps.find(
    (step) =>
      step.kind === "call" &&
      /^(?:compute|build|create|derive)[A-Z].*(?:Layout|Geometry|Bounds|Scale|Chart)/.test(
        step.label,
      ),
  );
  if (!helper) return null;
  const finalRead = [...steps]
    .reverse()
    .find((step) => step.kind === "property-read");
  const field = finalRead?.label ?? "";
  if (
    !/^(?:inner|outer|width|height|left|right|top|bottom|x|y|scale|padding|domain|range)/i.test(
      field,
    )
  ) {
    return null;
  }
  const text = `${helper.label} ${helper.detail ?? ""}`;
  return /Layout|Geometry|Bounds|Scale|Chart/.test(text) ? helper.label : null;
}

function isLowValueScalarHelper(sink) {
  const metrics = sink.metrics ?? {};
  if ((metrics.maximumPathDepth ?? 0) > 7) return false;
  if ((metrics.impossibleDefenseCount ?? 0) > 0) return false;
  if ((metrics.defensiveOperationCount ?? 0) > 0) return false;
  if ((metrics.representationChurn ?? 0) > 0) return false;
  if ((metrics.packRisk ?? 0) > 0) return false;
  if ((metrics.unknownEdgeCount ?? 0) > 0) return false;
  if ((metrics.mergeWidth ?? 0) > 3) return false;
  const steps = sink.representativeSteps ?? [];
  if (steps.some((step) => !SCALAR_HELPER_STEP_KINDS.has(step.kind)))
    return false;
  const text = steps.map((step) => step.label).join(" ");
  if (!/[-+*/%<>!]|\b(?:Math|max|min|round|floor|ceil)\b/.test(text))
    return false;
  const finalStep = finalLocalStepFor(sink);
  if (!finalStep || !["call", "alias"].includes(finalStep.kind)) return false;
  const finalName = String(finalStep.label ?? "").replace(/\(\)$/g, "");
  return /^(?:has|show|is|axis|tick|title|label|inner|outer|start|end|x|y|width|height|left|right|top|bottom)/i.test(
    finalName,
  );
}

function finalLocalStepFor(sink) {
  const steps = sink.representativeSteps ?? [];
  return [...steps]
    .reverse()
    .find((step) => ["call", "alias", "property-read"].includes(step.kind));
}

function normalized(value) {
  return Math.min(1, Math.log1p(value) / Math.log1p(20));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
