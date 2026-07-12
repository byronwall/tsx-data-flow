#!/usr/bin/env node
import { spawn } from "node:child_process";

// Everything passed to `pnpm dev -- ...` configures the analyzer server. Vite
// keeps its own stable configuration (including the proxy to port 4318).
const serverArgs = process.argv.slice(2).filter((arg, index: number) => {
  return !(index === 0 && arg === "--");
});
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const children = [
  spawn(
    packageManager,
    [
      "exec",
      "tsx",
      "watch",
      "--include",
      "src/**",
      "--exclude",
      "src/frontend/**",
      "src/server-cli.ts",
      "--port",
      "4318",
      ...serverArgs,
    ],
    { stdio: "inherit" },
  ),
  spawn(
    packageManager,
    ["exec", "vite", "--config", "vite.frontend.config.ts"],
    { stdio: "inherit" },
  ),
];

let stopping = false;

function stop(signal: string = "SIGTERM", exitCode: number = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop("SIGTERM", 1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) stop(signal ?? "SIGTERM", code ?? 1);
  });
}

process.on("SIGINT", () => stop("SIGINT", 130));
process.on("SIGTERM", () => stop("SIGTERM", 143));
