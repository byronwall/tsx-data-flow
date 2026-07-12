import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalyzerArgs } from "./types";
import { createAnalysisService } from "./server/analysis-service";
import { createRequestHandler } from "./server/routes";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceFrontendDist = path.join(here, "frontend", "dist");
const builtFrontendDist = path.resolve(process.cwd(), "dist/src/frontend/dist");

export function createServer(args: AnalyzerArgs) {
  const analysis = createAnalysisService(args);
  const handler = createRequestHandler(analysis, fs.existsSync(sourceFrontendDist) ? sourceFrontendDist : builtFrontendDist);
  const server = http.createServer(handler);
  server.on("close", () => { void analysis.close(); });
  return { server, handler, analysis };
}
