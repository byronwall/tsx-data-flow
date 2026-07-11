import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalyzerArgs } from "./types";
import { createAnalysisCache } from "./server/cache";
import { createRequestHandler } from "./server/routes";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceFrontendDist = path.join(here, "frontend", "dist");
const builtFrontendDist = path.resolve(process.cwd(), "dist/src/frontend/dist");

export function createServer(args: AnalyzerArgs) {
  const cache = createAnalysisCache(args);
  const handler = createRequestHandler(args, cache, fs.existsSync(sourceFrontendDist) ? sourceFrontendDist : builtFrontendDist);
  const server = http.createServer(handler);
  return { server, handler, refresh: cache.refresh, ensureBuilt: cache.ensureBuilt };
}
