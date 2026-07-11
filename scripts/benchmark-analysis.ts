import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "../src/cli/args";
import { analyzeProject } from "../src/core";

const targets = process.argv.slice(2).map(Number).filter((value) => Number.isFinite(value) && value > 0);
const lineTargets = targets.length ? targets : [10_000, 50_000, 200_000];
const results: Array<{ targetLines: number; actualLines: number; files: number; milliseconds: number; findings: number }> = [];
for (const targetLines of lineTargets) {
  const root = await mkdtemp(path.join(os.tmpdir(), `tsx-dataflow-${targetLines}-`));
  try {
    const source = path.join(root, "src"); await mkdir(source);
    const linesPerFile = 100; const fileCount = Math.ceil(targetLines / linesPerFile);
    const component = (index: number) => Array.from({ length: 10 }, (_, item) => [
      `export function Component${index}_${item}(props: { value?: number; label?: string }) {`,
      `  const packed = { label: props.label ?? "Item", value: props.value ?? 0 };`,
      `  const derived = packed.value > ${item} ? packed.value * 2 : packed.value + 1;`,
      `  return <section data-value={derived ?? 0}><strong>{packed.label ?? "Unknown"}</strong><span>{derived}</span></section>;`,
      `}`,
      ``,
      `type Marker${index}_${item} = { value: number };`,
      `const marker${index}_${item}: Marker${index}_${item} = { value: ${item} };`,
      `void marker${index}_${item};`,
      ``,
    ].join("\n")).join("\n");
    await Promise.all(Array.from({ length: fileCount }, (_, index) => writeFile(path.join(source, `Fixture${index}.tsx`), component(index))));
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "preserve", strict: true }, include: ["src"] }));
    const args = parseArgs(["--root", root, "--source", "src", "--tsconfig", "tsconfig.json", "--view", "overview", "--format", "json"]);
    const started = performance.now(); const report = await analyzeProject(args); const milliseconds = performance.now() - started;
    results.push({ targetLines, actualLines: fileCount * linesPerFile, files: fileCount, milliseconds: Math.round(milliseconds), findings: report.rankings.all.length });
  } finally { await rm(root, { recursive: true, force: true }); }
}
process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, results }, null, 2)}\n`);
