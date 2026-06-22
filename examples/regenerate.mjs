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

const reports = [
  ["findings", "markdown", "findings.md"],
  ["work-packets", "markdown", "work-packets.md"],
  ["prop-relay", "markdown", "prop-relay.md"],
  ["fan-out", "markdown", "fan-out.md"],
  ["defensive-ledger", "markdown", "defensive-ledger.md"],
  ["repair-map", "markdown", "repair-map.md"],
  ["boundary-report", "markdown", "boundary-report.md"],
  ["junctions", "markdown", "junctions.md"],
  ["inline-preview", "markdown", "inline-preview.md"],
  ["dossier", "json", "dossier.json"],
];

await rm(reportsDir, { recursive: true, force: true });
await mkdir(reportsDir, { recursive: true });

for (const [view, format, filename] of reports) {
  const args = [
    cli,
    "--root",
    path.relative(repoRoot, exampleRoot),
    "--view",
    view,
    "--format",
    format,
    "--max-items",
    "8",
    "--out",
    path.relative(repoRoot, path.join(reportsDir, filename)),
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
}
