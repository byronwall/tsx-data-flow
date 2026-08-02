#!/usr/bin/env node
import {
  one,
  parseCliArgs,
  readSnapshot,
  writeJson,
  type FlowSnapshot,
} from "./flow-lib";

const args = parseCliArgs(process.argv.slice(2));
const snapshotFile = one(args, "--snapshot");
if (one(args, "--help")) {
  process.stdout.write("Usage: flow-diagnose.ts --snapshot <snapshot.json> [--out <file>]\n");
} else {
  if (!snapshotFile) throw new Error("Usage: flow-diagnose.ts --snapshot <snapshot.json> [--out <file>]");
  const snapshot = await readSnapshot(snapshotFile);
  await writeJson(one(args, "--out"), diagnose(snapshot));
}

function diagnose(snapshot: FlowSnapshot) {
  const projection = snapshot.projection;
  if (!snapshot.route) return result("ROUTE_NOT_FOUND", "The selected route key, path, and file did not reconcile with the current analysis.");
  if (!snapshot.source) return result("SOURCE_NOT_DISCOVERED", "The route exists, but the selected persisted source is absent from its source inventory.");
  if (!snapshot.source.handoffProven) return result("RETURN_HANDOFF_MISSING", "The persisted source was found, but its consumer return value was not proven.");
  if (!projection?.exactPathCount) return result("SOURCE_PROJECTION_MISSING", "The handoff is proven, but no exhaustive trajectory is annotated with this exact source.");
  if (snapshot.graph?.truncated) return result("GRAPH_TRUNCATED", "The exhaustive route graph reached its path or depth budget.");
  if (projection.presentRejectedComponents.length) {
    return result("CONTEXT_MEMBER_OVERMATCH", `Rejected consumers are present: ${projection.presentRejectedComponents.join(", ")}.`);
  }
  if (projection.missingExpectedComponents.length) {
    const hasPropBridge = (projection.edgeKinds["component-prop"] ?? 0) > 0;
    const failure = hasPropBridge ? "CONTEXT_BRIDGE_MISSING" : "PROP_BRIDGE_MISSING";
    return result(failure, `Expected downstream components are absent: ${projection.missingExpectedComponents.join(", ")}.`);
  }
  return result("API_PROOF_COMPLETE", `The exact source reaches ${projection.exactPathCount} paths, ${projection.terminalCount} terminals, and ${projection.components.length} components.`);
}

function result(classification: string, reason: string) {
  return { classification, reason };
}
