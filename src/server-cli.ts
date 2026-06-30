#!/usr/bin/env node
import { spawn } from "node:child_process";
import { parseArgs } from "./core.mjs";
import { extractServerFlags } from "./cli/server-flags.mjs";
import { createServer } from "./server.ts";

const HELP = `tsx-dataflow-serve — browse render-path analysis in your browser

Usage:
  tsx-dataflow-serve [--port <n>] [--host <addr>] [--open] [analyzer options]

Server options:
  --port <n>     Port to listen on. Defaults to 4317.
  --host <addr>  Host to bind. Defaults to 127.0.0.1.
  --open         Open the default browser at startup.

Analyzer options (--root, --source, --tsconfig, --scope, --max-items,
--no-trace-helpers, ...) are passed through; see tsx-dataflow --help.
`;

try {
  const { server: serverFlags, rest } = extractServerFlags(
    process.argv.slice(2),
  );
  const args = parseArgs(rest);
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  const { server } = createServer(args);
  server.listen(serverFlags.port, serverFlags.host, () => {
    const urlBase = `http://${serverFlags.host}:${serverFlags.port}`;
    console.log(`tsx-dataflow serving ${args.root}`);
    console.log(`  ${urlBase}`);
    if (serverFlags.open) {
      const opener =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      spawn(opener, [urlBase], { stdio: "ignore", detached: true }).unref();
    }
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
