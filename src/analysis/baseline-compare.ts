import type { Sink } from "../types";
import fs from "node:fs";

export function compareBaseline(rankings: { all: Sink[] }, baselinePath: string) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const currentWorst = rankings.all[0]?.scores?.burden ?? 0;
  const baselineWorst = baseline.sinks?.[0]?.scores?.burden ?? 0;
  return {
    currentWorst,
    baselineWorst,
    regressed: currentWorst > baselineWorst,
    metricDeltas: compareMetrics(rankings.all, baseline.sinks ?? []),
    ...diffBaselineSinks(rankings.all, baseline.sinks ?? []),
  };
}

function compareMetrics(current: Sink[], baseline: Sink[]) {
  const total = (sinks: Sink[], key: keyof Sink["metrics"]) =>
    sinks.reduce((sum, sink) => sum + Number(sink.metrics?.[key] ?? 0), 0);
  const delta = (key: keyof Sink["metrics"]) => total(current, key) - total(baseline, key);
  return {
    fallbacks: delta("actionableDefensiveOperationCount"),
    hops: delta("helperHops"),
    transformations: delta("representationChurn"),
    packing: delta("suspiciousPackCount"),
    conditionals: delta("controlDependencyCount"),
  };
}

// Phase 10 - a per-sink diff against a prior JSON report. Sinks are keyed by
// file + structural signature so small line shifts don't read as churn; burden
// is the lower-is-better quality number. Categories: removed (gone), regressed
// (got heavier), improved (got lighter), and the current new top finding.
function diffBaselineSinks(currentSinks: Sink[], baselineSinks: Sink[]) {
  const keyOf = (sink: Sink) =>
    `${sink.file ?? "?"}::${sink.signature ?? sink.label ?? "?"}`;
  const burdenOf = (sink: Sink) => sink.scores?.burden ?? 0;

  const currentByKey = new Map<string, Sink>(currentSinks.map((sink: Sink) => [keyOf(sink), sink]));
  const baselineByKey = new Map<string, Sink>(
    baselineSinks.map((sink: Sink) => [keyOf(sink), sink]),
  );

  const removed: Array<{ label: string; depth: number | null }> = [];
  const improved: Array<{ label: string; file: string; line: number; before: number; after: number }> = [];
  const regressed: Array<{ label: string; file: string; line: number; before: number; after: number }> = [];
  for (const [key, baseSink] of baselineByKey) {
    const current = currentByKey.get(key);
    if (!current) {
      removed.push({
        label: baseSink.label ?? baseSink.file ?? key,
        depth: baseSink.metrics?.maximumPathDepth ?? null,
      });
      continue;
    }
    const before = burdenOf(baseSink);
    const after = burdenOf(current);
    const entry = {
      label: current.label ?? current.file,
      file: current.file,
      line: current.line,
      before: Number(before.toFixed(2)),
      after: Number(after.toFixed(2)),
    };
    if (after < before - 0.001) improved.push(entry);
    else if (after > before + 0.001) regressed.push(entry);
  }

  const top = currentSinks[0];
  const newTop =
    top && !baselineByKey.has(keyOf(top))
      ? { label: top.label, file: top.file, line: top.line }
      : null;

  // `regressedSinks` (a list), not `regressed` (the boolean summary flag), so
  // the spread in compareBaseline does not clobber the existing flag.
  return { removed, improved, regressedSinks: regressed, newTop };
}
