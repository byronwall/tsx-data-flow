import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../src/core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

export function createAnalyzerFixtureProject(files) {
  return createFixtureProject(files, {
    prefix: "render-path-dataflow-",
    extraArgs: ["--format", "json", "--view", "work-packets"],
  });
}

export function createServerFixtureProject(files) {
  return createFixtureProject(files, { prefix: "render-path-server-" });
}

async function createFixtureProject(files, { prefix, extraArgs = [] }) {
  const root = await mkdtemp(resolve(tmpdir(), prefix));
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
  for (const [relativePath, content] of Object.entries(files)) {
    const target = resolve(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return {
    root,
    args: parseArgs([
      "--root",
      root,
      "--source",
      "src",
      "--tsconfig",
      "tsconfig.json",
      "--typescript-from",
      repoRoot,
      ...extraArgs,
    ]),
  };
}
