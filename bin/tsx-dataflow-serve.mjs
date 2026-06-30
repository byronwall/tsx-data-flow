#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const entry = path.join(here, "..", "src", "server-cli.ts");
const tsxLoader = require.resolve("tsx");
const result = spawnSync(
  process.execPath,
  ["--import", tsxLoader, entry, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
