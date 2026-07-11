import type { PackEvidence, PackGroup, Sink } from "../types.js";
import { fanOutRootsFor } from "./fan-out.js";
import { sinkAttributeName, sinkFamilyOf } from "./sink-shape.js";
import { formatExpression } from "../reports/format-helpers.js";

// Group sinks that flow through the same packed object (a createMemo/object
// literal). The verdict is evidence-based: a pack can be a useful normalization
// boundary or cohesive render model, not just wrapper churn; it becomes
// suspicious when it mixes sink families, mirrors props, or expands one source
// into broad relay work.
export function computePackGroups(sinks: Sink[]) {
  const byPack = new Map<string, { key: string; label: string; sinks: Sink[] }>();
  for (const sink of sinks) {
    for (const pack of sink.packs ?? []) {
      let entry = byPack.get(pack.key);
      if (!entry) {
        entry = { key: pack.key, label: pack.label, sinks: [] };
        byPack.set(pack.key, entry);
      }
      entry.sinks.push(sink);
    }
  }

  const groups: PackGroup[] = [];
  for (const entry of byPack.values()) {
    if (entry.sinks.length < 2) continue;
    const familyMembers = new Map<string, Set<string>>();
    for (const sink of entry.sinks) {
      const family = sinkFamilyOf(sink);
      if (!familyMembers.has(family)) familyMembers.set(family, new Set());
      familyMembers
        .get(family)!
        .add(sinkAttributeName(sink) ?? formatExpression(sink.expression, 24));
    }
    const families = Array.from(familyMembers.keys());
    const evidence = packEvidenceFor(entry, families);
    groups.push({
      key: entry.key,
      label: formatExpression(entry.label, 48),
      sinkCount: entry.sinks.length,
      families,
      familyMembers: Object.fromEntries(
        Array.from(familyMembers.entries()).map(([family, members]) => [
          family,
          Array.from(members),
        ]),
      ),
      evidence,
      verdict: packVerdictFor(evidence),
    });
  }
  return groups.sort(
    (left, right) =>
      packRiskForVerdict(right.verdict) - packRiskForVerdict(left.verdict) ||
      right.families.length - left.families.length ||
      right.sinkCount - left.sinkCount,
  );
}

function packEvidenceFor(entry: { label: string; sinks: Sink[] }, families: string[]): PackEvidence {
  const sinks = entry.sinks;
  const roots = unique<string>(
    sinks.flatMap((sink: Sink) =>
      fanOutRootsFor(sink).map((info) => formatExpression(info.label, 48)),
    ) as string[],
  );
  const steps = sinks.flatMap((sink: Sink) => sink.representativeSteps ?? []);
  const callText = steps
    .filter((step) => step.kind === "call")
    .map((step) => step.label)
    .join(" ");
  const packText = `${entry.label} ${callText}`;
  const parserBoundary =
    /\b(?:parse|parser|extract|decode|token|match|css|shadow|normalize|normalise)\b/iu.test(
      packText,
    );
  const helperBoundary =
    /\b(?:selection|choices?|model|view|derive|build|create)\b/iu.test(
      callText,
    );
  const defensiveOps = sum(
    sinks,
    (sink: Sink) => sink.metrics.defensiveOperationCount,
  );
  const representationChurn = sum(
    sinks,
    (sink: Sink) => sink.metrics.representationChurn,
  );
  const helperHops = sum(sinks, (sink: Sink) => sink.metrics.helperHops);
  const maxReach = Math.max(
    0,
    ...sinks.map((sink: Sink) => sink.metrics.reachableSinks),
  );
  const propRoots = roots.filter((root: string) => /^props\./.test(root));
  const geometryOnly = families.every((family) =>
    ["geometry", "svg-shell", "other"].includes(family),
  );
  const sourceFamilies = new Set(roots.map(sourceFamilyKey));
  const mirrorLike =
    roots.length >= 2 &&
    geometryOnly &&
    !helperBoundary &&
    propRoots.length / roots.length >= 0.75 &&
    helperHops <= sinks.length &&
    defensiveOps === 0 &&
    families.length <= 2;

  return {
    familyCount: families.length,
    sourceRootCount: roots.length,
    sourceFamilyCount: sourceFamilies.size,
    defensiveOps,
    representationChurn,
    helperHops,
    maxReach,
    parserBoundary,
    helperBoundary,
    mirrorLike,
    relayLike: maxReach >= 6 && families.length >= 2 && roots.length >= 2,
  };
}

function packVerdictFor(evidence: PackEvidence) {
  if (
    evidence.parserBoundary &&
    (evidence.defensiveOps > 0 || evidence.helperHops > 0)
  ) {
    return "normalization-boundary";
  }
  if (evidence.mirrorLike) return "mirror-object";
  if (evidence.relayLike) return "relay-bag";
  if (evidence.familyCount >= 2) return "overpacked-bag";
  return "cohesive-render-model";
}

function sourceFamilyKey(root: string) {
  const parts = String(root).split(".");
  return parts.slice(0, Math.min(parts.length, 2)).join(".");
}

export function packRiskForVerdict(verdict: string) {
  switch (verdict) {
    case "relay-bag":
      return 12;
    case "overpacked-bag":
      return 9;
    case "mirror-object":
      return 7;
    case "cohesive-render-model":
      return 0;
    case "normalization-boundary":
      return 0;
    default:
      return 4;
  }
}

export function applyPackEvidence(sinks: Sink[], packGroups: PackGroup[]) {
  const groupsByKey = new Map(packGroups.map((group) => [group.key, group]));
  for (const sink of sinks) {
    const groups = (sink.packs ?? [])
      .map((pack) => groupsByKey.get(pack.key))
      .filter((group): group is PackGroup => group != null);
    if (groups.length === 0) continue;
    sink.packVerdicts = unique(groups.map((group) => group.verdict));
    sink.metrics.packFamilyDiversity = Math.max(
      0,
      ...groups.map((group) => group.families.length),
    );
    sink.metrics.packRisk = Math.max(
      0,
      ...groups.map((group) => packRiskForVerdict(group.verdict)),
    );
    sink.metrics.suspiciousPackCount = groups.filter(
      (group) => packRiskForVerdict(group.verdict) > 0,
    ).length;
  }
}

// The pack group (if any) that a given sink flows through - suspicious groups
// win, then broader family spread, then larger sink count.
export function packGroupForSink(sink: Sink, packGroups: PackGroup[]) {
  const keys = new Set((sink.packs ?? []).map((pack) => pack.key));
  return (
    (packGroups ?? [])
      .filter((group) => keys.has(group.key))
      .sort(
        (left, right) =>
          packRiskForVerdict(right.verdict) -
            packRiskForVerdict(left.verdict) ||
          right.families.length - left.families.length ||
          right.sinkCount - left.sinkCount,
      )[0] ?? null
  );
}

function sum<T>(items: T[], project: (item: T) => number) {
  return items.reduce((total, item) => total + project(item), 0);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}
