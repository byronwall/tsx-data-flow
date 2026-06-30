import { describe, expect, it } from "vitest";
import {
  REPORT_VIEWS,
  analyzeProject,
  appRoot,
  bannedSuggestionIdentifiers,
  createFixtureProject,
  createTwoAppProject,
  helpText,
  mkdir,
  mkdtemp,
  parseArgs,
  renderAllReports,
  renderReport,
  resolve,
  tmpdir,
  writeFile,
} from "./helpers/core-test-context.mjs";

describe("general CLI defaults and project discovery", () => {
  it("defaults the project root to the current working directory", () => {
    const args = parseArgs([]);
    expect(args.root).toBe(resolve(process.cwd()));
  });

  it("prefers ./src over ./app/src when discovering the source root", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-src-"));
    await mkdir(resolve(root, "src"), { recursive: true });
    await mkdir(resolve(root, "app", "src"), { recursive: true });
    expect(parseArgs(["--root", root]).source).toBe(resolve(root, "src"));
  });

  it("falls back to ./app/src, then the root, when ./src is absent", async () => {
    const appOnly = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-app-"));
    await mkdir(resolve(appOnly, "app", "src"), { recursive: true });
    expect(parseArgs(["--root", appOnly]).source).toBe(
      resolve(appOnly, "app", "src"),
    );

    const bare = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-bare-"));
    expect(parseArgs(["--root", bare]).source).toBe(bare);
  });

  it("discovers the nearest tsconfig next to the source root", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-tsconfig-"));
    const source = resolve(root, "src");
    await mkdir(source, { recursive: true });
    await writeFile(resolve(root, "tsconfig.json"), "{}");
    expect(parseArgs(["--root", root, "--source", "src"]).tsconfig).toBe(
      resolve(root, "tsconfig.json"),
    );
  });

  it("emits help text naming the CLI and listing every view", () => {
    const text = helpText();
    expect(text).toContain("tsx-dataflow");
    for (const view of [
      "work-packets",
      "prop-relay",
      "context-relay",
      "fan-out",
      "junctions",
    ]) {
      expect(text).toContain(view);
    }
  });

  it("analyzes a project end-to-end using only --root (auto-discovered source and tsconfig)", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-discover-"));
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
      resolve(root, "src", "Widget.tsx"),
      `type Item = { label: string };
       export function Widget(props: { item: Item }) {
         const view = { title: props.item.label };
         return <span>{view.title ?? "n/a"}</span>;
       }`,
    );

    // Only --root is provided; --source and --tsconfig must auto-discover.
    const args = parseArgs([
      "--root",
      root,
      "--typescript-from",
      appRoot,
      "--format",
      "json",
    ]);
    expect(args.source).toBe(resolve(root, "src"));
    expect(args.tsconfig).toBe(resolve(root, "tsconfig.json"));

    const report = await analyzeProject(args);
    expect(report.sinks.length).toBeGreaterThan(0);
  });
});

describe("tsconfig resolution in monorepos", () => {
  const strictConfig = JSON.stringify({
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "preserve",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      composite: true,
    },
    include: ["src"],
  });
  // An optional prop guarded with `?? default`. Under strictNullChecks the
  // property type is `number | undefined`, so the guard is a real (possible)
  // fallback — never a dead, type-impossible one. This is the exact shape that
  // regressed when the analyzer fell back to non-strict options.
  const optionalPropComponent = `
    export function Gauge(props: { strokeWidth?: number }) {
      const strokeWidth = props.strokeWidth ?? 4;
      return <svg stroke-width={strokeWidth} />;
    }
  `;

  it("walks up several directories to find the governing tsconfig", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-walkup-"));
    const app = resolve(root, "client", "apps", "web");
    const nested = resolve(app, "src", "deep", "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(resolve(app, "tsconfig.json"), strictConfig);
    expect(parseArgs(["--root", app, "--source", nested]).tsconfig).toBe(
      resolve(app, "tsconfig.json"),
    );
  });

  it("expands a solution-only root tsconfig through its references and analyzes strictly", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-solution-"));
    const app = resolve(root, "apps", "web");
    await mkdir(resolve(app, "src"), { recursive: true });
    // Reference-only solution file at the root: no sources, no strict.
    await writeFile(
      resolve(root, "tsconfig.json"),
      JSON.stringify({ files: [], references: [{ path: "./apps/web" }] }),
    );
    await writeFile(resolve(app, "tsconfig.json"), strictConfig);
    await writeFile(resolve(app, "src", "Gauge.tsx"), optionalPropComponent);

    const args = parseArgs([
      "--root",
      root,
      "--typescript-from",
      appRoot,
      "--format",
      "json",
    ]);
    const report = await analyzeProject(args);
    const ledger = renderReport(report, {
      ...args,
      view: "defensive-ledger",
      format: "markdown",
    });

    // The optional prop fallback is "possible", not a false "impossible".
    // (Markdown escapes the union pipe as `number \| undefined`.)
    expect(ledger).toContain("number \\| undefined");
    expect(ledger).toContain("| possible |");
    expect(ledger).not.toContain("type-impossible");
    // The resolved (expanded) per-app config is recorded in meta.
    expect(report.meta.tsconfig).toBe(resolve(app, "tsconfig.json"));
  });

  it("throws a loud, actionable error when no valid tsconfig is found", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-noconfig-"));
    await mkdir(resolve(root, "src"), { recursive: true });
    await writeFile(resolve(root, "src", "Gauge.tsx"), optionalPropComponent);

    const args = parseArgs(["--root", root, "--typescript-from", appRoot]);
    await expect(analyzeProject(args)).rejects.toThrow(
      /could not resolve a valid tsconfig/i,
    );
  });

  it("rejects a solution-only tsconfig whose references resolve to nothing valid", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-dangling-"));
    await mkdir(resolve(root, "src"), { recursive: true });
    await writeFile(resolve(root, "src", "Gauge.tsx"), optionalPropComponent);
    await writeFile(
      resolve(root, "tsconfig.json"),
      JSON.stringify({ files: [], references: [{ path: "./does-not-exist" }] }),
    );

    const args = parseArgs(["--root", root, "--typescript-from", appRoot]);
    await expect(analyzeProject(args)).rejects.toThrow(
      /could not resolve a valid tsconfig/i,
    );
  });
});
