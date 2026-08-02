#!/usr/bin/env node
import {
  one,
  parseCliArgs,
  readSnapshot,
  writeJson,
  type FlowSnapshot,
} from "./flow-lib";

const args = parseCliArgs(process.argv.slice(2));
const beforeFile = one(args, "--before");
const afterFile = one(args, "--after");
if (one(args, "--help")) {
  process.stdout.write("Usage: flow-diff.ts --before <before.json> --after <after.json> [--max-growth <ratio>] [--out <file>]\n");
} else if (!beforeFile || !afterFile) {
  throw new Error("Usage: flow-diff.ts --before <before.json> --after <after.json> [--max-growth <ratio>] [--out <file>]");
} else {
  const before = await readSnapshot(beforeFile);
  const after = await readSnapshot(afterFile);
  const maxGrowth = positiveNumber(one(args, "--max-growth")) ?? 10;
  const comparison = compare(before, after, maxGrowth);
  await writeJson(one(args, "--out"), comparison);
  if (!comparison.ok) process.exitCode = 1;
}

function compare(before: FlowSnapshot, after: FlowSnapshot, maxGrowth: number) {
  const failures: string[] = [];
  const warnings: string[] = [];
  const beforeProjection = before.projection;
  const afterProjection = after.projection;
  if (before.route && !after.route) failures.push("The selected route disappeared.");
  if (before.source && !after.source) failures.push("The selected source disappeared.");
  if (before.source?.handoffProven && !after.source?.handoffProven) failures.push("The proven source handoff regressed.");
  if (after.graph?.truncated && !before.graph?.truncated) failures.push("The exhaustive graph became truncated.");
  if ((afterProjection?.partialPathCount ?? 0) > (beforeProjection?.partialPathCount ?? 0)) failures.push("Partial source trajectories increased.");
  if ((afterProjection?.unknownEdgeCount ?? 0) > (beforeProjection?.unknownEdgeCount ?? 0)) failures.push("Unknown source-path edges increased.");
  if (afterProjection?.missingExpectedComponents.length) failures.push(`Expected components remain missing: ${afterProjection.missingExpectedComponents.join(", ")}.`);
  if (afterProjection?.presentRejectedComponents.length) failures.push(`Rejected components are present: ${afterProjection.presentRejectedComponents.join(", ")}.`);
  if (beforeProjection?.exactPathCount && afterProjection && afterProjection.exactPathCount > beforeProjection.exactPathCount * maxGrowth) {
    warnings.push(`Exact path count grew by more than ${maxGrowth}×; inspect for an overbroad bridge.`);
  }
  if (!afterProjection?.exactPathCount) failures.push("The selected source has no exact downstream trajectories.");
  return {
    ok: failures.length === 0,
    failures,
    warnings,
    delta: {
      handoffProven: [before.source?.handoffProven ?? null, after.source?.handoffProven ?? null],
      exactPathCount: [beforeProjection?.exactPathCount ?? 0, afterProjection?.exactPathCount ?? 0],
      terminalCount: [beforeProjection?.terminalCount ?? 0, afterProjection?.terminalCount ?? 0],
      componentCount: [beforeProjection?.components.length ?? 0, afterProjection?.components.length ?? 0],
      partialPathCount: [beforeProjection?.partialPathCount ?? 0, afterProjection?.partialPathCount ?? 0],
      unknownEdgeCount: [beforeProjection?.unknownEdgeCount ?? 0, afterProjection?.unknownEdgeCount ?? 0],
      truncated: [before.graph?.truncated ?? null, after.graph?.truncated ?? null],
    },
    addedComponents: difference(afterProjection?.components ?? [], beforeProjection?.components ?? []),
    removedComponents: difference(beforeProjection?.components ?? [], afterProjection?.components ?? []),
  };
}

function positiveNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function difference(left: string[], right: string[]) {
  const excluded = new Set(right);
  return left.filter((item) => !excluded.has(item));
}
