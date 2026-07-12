import { performance } from "node:perf_hooks";
import { buildWorkspaceDto } from "../src/api/projections/workspace";
import { parseArgs } from "../src/cli/args";
import { createAnalyzer } from "../src/core";

const rootIndex = process.argv.indexOf("--root");
if (rootIndex < 0 || !process.argv[rootIndex + 1]) throw new Error("Usage: node --import tsx scripts/benchmark-workspace.tsx --root <path>");
const args = parseArgs(["--root", process.argv[rootIndex + 1], "--view", "overview", "--format", "json"]);
const analysisStart = performance.now();
const report = createAnalyzer(args).report();
const analysisMs = performance.now() - analysisStart;
const projectionStart = performance.now();
const workspace = buildWorkspaceDto(report);
const projectionMs = performance.now() - projectionStart;
const json = JSON.stringify(workspace);
const parseStart = performance.now();
JSON.parse(json);
const parseMs = performance.now() - parseStart;
process.stdout.write(`${JSON.stringify({ root: args.root, analysisMs, projectionMs, dtoBytes: Buffer.byteLength(json), parseMs, map: workspace.semanticMap.totals, retained: { areas: workspace.semanticMap.areas.length, sourceBearingAreas: workspace.semanticMap.areas.filter((area) => area.sourceCount > 0).length, mixedAreas: workspace.semanticMap.areas.filter((area) => area.sourceCount > 0 && area.sinkCount > 0).length, terminalBearingAreas: workspace.semanticMap.areas.filter((area) => area.sinkCount > 0).length, edges: workspace.semanticMap.edges.length, trajectories: workspace.semanticMap.trajectories.length, cleanup: workspace.semanticMap.cleanup.length } })}\n`);
