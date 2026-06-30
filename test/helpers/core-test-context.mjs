import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAnalyzerFixtureProject as createFixtureProject } from "./fixture-project.mjs";
import {
  REPORT_VIEWS,
  analyzeProject,
  helpText,
  parseArgs,
  renderAllReports,
  renderReport,
} from "../../src/core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const appRoot = resolve(__dirname, "../..");
export const bannedSuggestionIdentifiers = [
  "pivot",
  "sinkData",
  "fanInResult",
  "transformedProps",
  "viewModel",
  "renderModel",
  "layout",
  "geometryModel",
  "renderValue",
  "selectedValue",
  "profileData",
  "ItemModel",
];

export {
  REPORT_VIEWS,
  analyzeProject,
  createFixtureProject,
  helpText,
  mkdir,
  mkdtemp,
  parseArgs,
  renderAllReports,
  renderReport,
  resolve,
  tmpdir,
  writeFile,
};

async function createTwoAppProject() {
  const root = await mkdtemp(resolve(tmpdir(), "render-path-dataflow-multi-"));
  const baseOptions = {
    target: "ESNext",
    module: "ESNext",
    moduleResolution: "bundler",
    jsx: "preserve",
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: ".",
    paths: { "~/*": ["./src/*"] },
  };
  const apps = {
    appA: {
      "src/helpers.ts": `
        export function badge(n: number) {
          if (n > 0) return "+" + n;
          return "" + n;
        }
      `,
      "src/CompA.tsx": `
        import { badge } from "~/helpers";
        export function CompA(props: { n: number }) {
          return <p>{badge(props.n)}</p>;
        }
      `,
    },
    appB: {
      "src/helpers.ts": `
        export function tag(value: string) {
          return value.toUpperCase();
        }
      `,
      "src/CompB.tsx": `
        import { tag } from "~/helpers";
        export function CompB(props: { s: string }) {
          return <h2>{tag(props.s)}</h2>;
        }
      `,
    },
  };
  for (const [app, files] of Object.entries(apps)) {
    await mkdir(resolve(root, app, "src"), { recursive: true });
    await writeFile(
      resolve(root, app, "tsconfig.json"),
      JSON.stringify({ compilerOptions: baseOptions, include: ["src"] }),
    );
    for (const [relativePath, content] of Object.entries(files)) {
      await writeFile(resolve(root, app, relativePath), content);
    }
  }
  return {
    root,
    args: parseArgs([
      "--root",
      root,
      "--source",
      ".",
      "--typescript-from",
      appRoot,
      "--format",
      "json",
      "--view",
      "overview",
    ]),
  };
}
export { createTwoAppProject };
