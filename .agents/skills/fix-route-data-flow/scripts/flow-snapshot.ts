#!/usr/bin/env node
import {
  buildSnapshot,
  one,
  parseCliArgs,
  writeJson,
} from "./flow-lib";

const args = parseCliArgs(process.argv.slice(2));
if (one(args, "--help")) {
  process.stdout.write("Usage: flow-snapshot.ts --root <project> [--selection <json-or-file>] [--source-snapshot <before.json>] [--project-source <dir>] [--route-path <path>] [--source-label <label>] [--expect-component <name>] [--reject-component <name>] [--out <file>]\n");
} else {
  await writeJson(one(args, "--out"), await buildSnapshot(args));
}
