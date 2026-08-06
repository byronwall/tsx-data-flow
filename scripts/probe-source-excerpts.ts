import path from "node:path";
import { sourceExcerptRequestSchema } from "../src/api/contracts";
import { parseArgs } from "../src/cli/args";
import { createAnalysisCache } from "../src/server/cache";
import { buildSourceExcerpt } from "../src/server/source-excerpts";

const fixtureRoot = path.resolve("examples/solid-route");
const args = parseArgs([
  "--root", fixtureRoot,
  "--source", "src",
  "--tsconfig", path.join(fixtureRoot, "tsconfig.json"),
  "--view", "overview",
  "--format", "json",
]);
const cache = createAnalysisCache(args);
const typescript = cache.typescript();
const request = (file: string) => sourceExcerptRequestSchema.parse({ path: file, generation: cache.generation(), line: 1 });
const rejected = [
  ["style.css", buildSourceExcerpt(typescript, request("src/frontend/src/style.css"), "body { color: red; }\n")],
  ["made-up extension", buildSourceExcerpt(typescript, request("src/routes/records.unknown"), "const value = 1;\n")],
].filter(([, value]) => value !== null);
const accepted = ["src/routes/records.tsx", "src/data/records.ts"]
  .map((file) => [file, cache.sourceFor(file)] as const)
  .filter(([, value]) => value !== null);
const repositoryArgs = parseArgs([
  "--root", process.cwd(),
  "--source", "src",
  "--tsconfig", path.resolve("tsconfig.json"),
  "--view", "overview",
  "--format", "json",
]);
const repositoryCache = createAnalysisCache(repositoryArgs);
const containedStyle = repositoryCache.sourceFor("src/frontend/src/style.css");

if (rejected.length > 0) throw new Error(`Unsupported source paths were accepted: ${rejected.map(([label]) => label).join(", ")}`);
if (accepted.length !== 2) throw new Error(`Expected both fixture source files to be owned and readable; received ${accepted.length}.`);
if (containedStyle !== null) throw new Error("Contained style.css was accepted outside the active analyzer source program.");
console.log("source excerpt probe: PASS (style.css and .unknown rejected; fixture .tsx and .ts accepted)");
