import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { REPORT_VIEWS } from "../../src/core.mjs";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const cli = resolve(repoRoot, "bin", "tsx-dataflow.mjs");

describe("tsx-dataflow CLI output", () => {
  it("writes one markdown file per current report view for --view all --out", async () => {
    const { root, reportsDir } = await createProject("markdown");

    const { stdout, stderr } = await runCli([
      "--root",
      root,
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
      "2",
      "--out",
      reportsDir,
    ]);

    expect(stderr).toBe("");
    expect(stdout).toContain(
      `Wrote ${REPORT_VIEWS.length} render-path data-flow reports`,
    );
    expect((await readdir(reportsDir)).sort()).toEqual(
      REPORT_VIEWS.map((view) => `${view}.md`).sort(),
    );
    expect(
      await readFile(resolve(reportsDir, "overview.md"), "utf8"),
    ).toContain("# Overview");
  });

  it("writes json filenames and payloads for --view all --format json --out", async () => {
    const { root, reportsDir } = await createProject("json");

    await runCli([
      "--root",
      root,
      "--source",
      "src",
      "--tsconfig",
      "tsconfig.json",
      "--typescript-from",
      repoRoot,
      "--view",
      "all",
      "--format",
      "json",
      "--max-items",
      "2",
      "--out",
      reportsDir,
    ]);

    expect((await readdir(reportsDir)).sort()).toEqual(
      REPORT_VIEWS.map((view) => `${view}.json`).sort(),
    );
    const overview = await readFile(
      resolve(reportsDir, "overview.json"),
      "utf8",
    );
    expect(() => JSON.parse(overview)).not.toThrow();
  });
});

async function createProject(label) {
  const root = await mkdtemp(resolve(repoRoot, "tmp", `cli-output-${label}-`));
  await mkdir(resolve(root, "src"), { recursive: true });
  await writeFile(
    resolve(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "preserve",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["src"],
    }),
  );
  await writeFile(
    resolve(root, "src", "App.tsx"),
    `export function App(props: { name: string }) {
  return <h1>{props.name}</h1>;
}
`,
  );
  const reportsDir = resolve(root, "reports");
  return { root, reportsDir };
}

function runCli(args) {
  return execFileAsync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}
