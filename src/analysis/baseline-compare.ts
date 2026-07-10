import fs from "node:fs";

export function compareBaseline(rankings, baselinePath) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const currentWorst = rankings.all[0]?.scores.burden ?? 0;
  const baselineWorst = baseline.sinks?.[0]?.scores?.burden ?? 0;
  return {
    currentWorst,
    baselineWorst,
    regressed: currentWorst > baselineWorst,
    ...diffBaselineSinks(rankings.all, baseline.sinks ?? []),
  };
}

// Phase 10 - a per-sink diff against a prior JSON report. Sinks are keyed by
// file + structural signature so small line shifts don't read as churn; burden
// is the lower-is-better quality number. Categories: removed (gone), regressed
// (got heavier), improved (got lighter), and the current new top finding.
function diffBaselineSinks(currentSinks, baselineSinks) {
  const keyOf = (sink) =>
    `${sink.file ?? "?"}::${sink.signature ?? sink.label ?? "?"}`;
  const burdenOf = (sink) => sink.scores?.burden ?? 0;

  const currentByKey = new Map(currentSinks.map((sink) => [keyOf(sink), sink]));
  const baselineByKey = new Map(
    baselineSinks.map((sink) => [keyOf(sink), sink]),
  );

  const removed = [];
  const improved = [];
  const regressed = [];
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
