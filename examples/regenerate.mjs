#!/usr/bin/env node
import { rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const exampleRoot = path.join(repoRoot, "examples", "bad-ish-solid");
const reportsDir = path.join(exampleRoot, "reports");
const cli = path.join(repoRoot, "bin", "tsx-dataflow.mjs");

await rm(reportsDir, { recursive: true, force: true });
await mkdir(reportsDir, { recursive: true });

// One pass: `--view all` builds the report once and emits every view into the
// reports directory, so new views are picked up automatically (no per-view list
// to keep in sync here).
const args = [
  cli,
  "--root",
  path.relative(repoRoot, exampleRoot),
  "--view",
  "all",
  "--format",
  "markdown",
  "--max-items",
  "8",
  "--out",
  path.relative(repoRoot, reportsDir),
];
const result = spawnSync(process.execPath, args, {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: "pipe",
});
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stderr.write(result.stdout);
  process.exit(result.status ?? 1);
}
process.stdout.write(result.stdout);
