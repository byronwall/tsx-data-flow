import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeProject,
  parseArgs,
  renderAllReports,
} from "../../src/core.mjs";
import { createServer } from "../../src/server.ts";
import { call } from "./http.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(__dirname, "../..");
export const exampleRoot = resolve(repoRoot, "examples", "bad-ish-solid");

export function goldenArgs(extraArgs = []) {
  return parseArgs([
    "--root",
    exampleRoot,
    "--source",
    "src",
    "--tsconfig",
    "tsconfig.json",
    "--typescript-from",
    repoRoot,
    "--view",
    "all",
    "--format",
    "markdown",
    "--max-items",
    "8",
    ...extraArgs,
  ]);
}

export async function buildGoldenReport() {
  const args = goldenArgs();
  return { args, report: await analyzeProject(args) };
}

export function renderGoldenMarkdownByView(report, args) {
  return Object.fromEntries(
    renderAllReports(report, args).map(({ view, text }) => [
      view,
      normalizeGoldenText(text),
    ]),
  );
}

export async function fetchGoldenApiReportJson() {
  const { handler } = createServer(goldenArgs());
  const response = await call(handler, "/api/report.json");
  if (response.status !== 200) {
    throw new Error(`/api/report.json returned ${response.status}`);
  }
  return normalizeGoldenText(response.body);
}

export function normalizeGoldenText(value) {
  return String(value)
    .replaceAll(exampleRoot, "<EXAMPLE_ROOT>")
    .replaceAll(repoRoot, "<REPO_ROOT>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<GENERATED_AT>")
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "<GENERATED_DATE>");
}
