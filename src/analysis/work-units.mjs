import { fanOutRootsFor } from "./fan-out.mjs";
import { primaryAdviceShape } from "./sink-shape.mjs";
import { formatExpression } from "../reports/format-helpers.mjs";

// Collapse file-local sinks that share a cause into one work unit. Two sinks
// join the same unit when they share a packed object or share both their primary
// pivot and primary shape. The representative is the highest-burden member.
export function computeWorkUnits(sinks) {
  const byFile = new Map();
  for (const sink of sinks) {
    if (!byFile.has(sink.file)) byFile.set(sink.file, []);
    byFile.get(sink.file).push(sink);
  }
  const units = [];
  for (const fileSinks of byFile.values()) {
    const groups = [];
    for (const sink of fileSinks) {
      const packKeys = new Set((sink.packs ?? []).map((pack) => pack.key));
      const pivot = primaryPivotOf(sink);
      const shape = primaryShapeOf(sink);
      let group = groups.find(
        (candidate) =>
          [...packKeys].some((key) => candidate.packKeys.has(key)) ||
          (pivot !== null &&
            candidate.pivot === pivot &&
            candidate.shape === shape),
      );
      if (!group) {
        group = { sinks: [], packKeys: new Set(), pivot, shape };
        groups.push(group);
      }
      group.sinks.push(sink);
      for (const key of packKeys) group.packKeys.add(key);
    }
    for (const group of groups) {
      const members = group.sinks
        .slice()
        .sort((left, right) => right.scores.burden - left.scores.burden);
      units.push(makeWorkUnit(members[0], members));
    }
  }
  return units.sort((left, right) => right.scores.burden - left.scores.burden);
}

function primaryPivotOf(sink) {
  const roots = fanOutRootsFor(sink);
  return roots.length ? formatExpression(roots[0].label, 40) : null;
}

function primaryShapeOf(sink) {
  return primaryAdviceShape(sink) ?? "uncategorized";
}

// A work unit IS its representative sink, so every existing renderer keeps
// working, plus a `.unit` block describing the sinks it covers.
function makeWorkUnit(representative, members) {
  const pivots = unique(
    members.flatMap((member) =>
      fanOutRootsFor(member).map((info) => formatExpression(info.label, 40)),
    ),
  ).slice(0, 4);
  const causes = unique(
    members.flatMap((member) =>
      (member.representativeSteps ?? [])
        .filter((step) => step.kind === "call")
        .map((step) => formatExpression(step.label, 40)),
    ),
  ).slice(0, 4);
  return {
    ...representative,
    unit: {
      sinkCount: members.length,
      members: members.map((member) => ({
        id: member.id,
        line: member.line,
        label: formatExpression(member.label, 40),
      })),
      pivots,
      causes,
      shape: primaryShapeOf(representative),
    },
  };
}

// Quantify how concentrated the ranked burden is, so clustering becomes a
// reported fact rather than a surprise.
export function computeConcentration(sinks) {
  const burdenByFile = new Map();
  const countByFile = new Map();
  let total = 0;
  for (const sink of sinks) {
    total += sink.scores.burden;
    burdenByFile.set(
      sink.file,
      (burdenByFile.get(sink.file) ?? 0) + sink.scores.burden,
    );
    countByFile.set(sink.file, (countByFile.get(sink.file) ?? 0) + 1);
  }
  const fileBurdens = Array.from(burdenByFile.values()).sort(
    (left, right) => right - left,
  );
  const frac = (n) =>
    total > 0
      ? fileBurdens.slice(0, n).reduce((sum, value) => sum + value, 0) / total
      : 0;
  return {
    fileCount: burdenByFile.size,
    sinkCount: sinks.length,
    totalBurden: total,
    top5: frac(5),
    top9: frac(9),
    hot4Plus: Array.from(countByFile.values()).filter((count) => count >= 4)
      .length,
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
