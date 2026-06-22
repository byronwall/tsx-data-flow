import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeProject,
  findDefaultSource,
  findDefaultTsconfig,
  helpText,
  parseArgs,
  renderReport,
} from "../src/core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = resolve(__dirname, "..");

describe("render path data-flow analyzer", () => {
  it("validates CLI formats and report views", () => {
    expect(() => parseArgs(["--format", "xml"])).toThrow("--format must be json or markdown");
    expect(() => parseArgs(["--view", "unknown"])).toThrow("--view must be one of");

    const args = parseArgs(["--view", "findings", "--format", "json"]);
    expect(args.view).toBe("findings");
    expect(args.format).toBe("json");
  });

  it("collects JSX sink categories without ranking event handlers", async () => {
    const project = await createFixtureProject({
      "src/Sinks.tsx": `
        declare function Show(props: { when: boolean; children: unknown }): unknown;
        export function Sinks(props: { active: boolean; url: string; label: string }) {
          const klass = props.active ? "on" : "off";
          return <section class={klass} onClick={() => props.label}>
            <img src={props.url} alt={props.label} />
            <Show when={props.active}>{props.label}</Show>
          </section>;
        }
      `,
    });

    const report = await analyzeProject(project.args);
    expect(report.sinks.map((sink) => sink.category)).toEqual(
      expect.arrayContaining(["style", "attribute", "render-control", "rendered-value", "event-handler"]),
    );
    expect(report.rankings.all.some((sink) => sink.category === "event-handler")).toBe(false);
  });

  it("builds shared graph nodes, traces local helpers, and marks unknown imported helpers", async () => {
    const project = await createFixtureProject({
      "src/local-flow.tsx": `
        import { externalTitle } from "./external";
        type User = { displayName: string };
        function titleFromUser(user: User) {
          return { title: user.displayName };
        }
        export function UserCard(props: { user: User }) {
          const model = titleFromUser(props.user);
          const title = model.title;
          return <h2>{title ?? "Unknown"} {externalTitle(props.user)}</h2>;
        }
      `,
      "src/external.ts": "export function externalTitle(value: unknown) { return String(value); }",
    });

    const report = await analyzeProject(project.args);
    const titleSink = report.rankings.all.find((sink) => sink.expression.includes("title ??"));

    expect(titleSink).toBeTruthy();
    expect(titleSink.metrics.helperHops).toBeGreaterThan(0);
    expect(titleSink.metrics.representationChurn).toBeGreaterThan(0);
    expect(titleSink.metrics.impossibleDefenseCount).toBeGreaterThan(0);
    expect(report.graph.nodes.length).toBeGreaterThan(report.sinks.length);
  });

  it("models createMemo accessors and resource boundaries", async () => {
    const project = await createFixtureProject({
      "src/solid-flow.tsx": `
        declare function createMemo<T>(fn: () => T): () => T;
        declare function createResource<T>(fn: () => Promise<T>): [() => T | undefined];
        export function Profile(props: { first: string; last: string }) {
          const fullName = createMemo(() => props.first + " " + props.last);
          const [user] = createResource(async () => ({ name: fullName() }));
          return <div>{fullName()} {user()?.name ?? "missing"}</div>;
        }
      `,
    });

    const report = await analyzeProject(project.args);
    const memoSink = report.rankings.all.find((sink) => sink.representativePath.join(" ").includes("memo"));
    const resourceSink = report.sinks.find((sink) => sink.representativePath.join(" ").includes("resource"));

    expect(memoSink).toBeTruthy();
    expect(resourceSink).toBeTruthy();
  });

  it("renders output views and graph dossier JSON", async () => {
    const project = await createFixtureProject({
      "src/metrics.tsx": `
        type User = { displayName: string; avatarUrl?: string };
        function normalizeName(input: string) {
          return input.trim();
        }
        export function UserCard(props: { user: User }) {
          const packed = { rawUser: props.user };
          const model = { title: normalizeName(packed.rawUser.displayName), avatar: packed.rawUser.avatarUrl };
          return <article>
            <h2>{model.title ?? "Unknown"}</h2>
            <img src={model.avatar ?? "/fallback.png"} alt={model.title} />
          </article>;
        }
      `,
    });
    const report = await analyzeProject(project.args);

    const findings = renderReport(report, { ...project.args, view: "findings", format: "markdown" });
    const packets = renderReport(report, { ...project.args, view: "work-packets", format: "markdown" });
    const ledger = renderReport(report, { ...project.args, view: "transformation-ledger", format: "markdown" });
    const dossier = JSON.parse(renderReport(report, { ...project.args, view: "dossier", format: "json" }));

    expect(findings).toContain("type-impossible defensive render path");
    expect(packets).toContain("WORK ITEM DF-001");
    expect(packets).toContain("Feature Clusters");
    expect(packets).toContain("Candidate edits");
    expect(ledger).toContain("representation-only steps");
    expect(dossier.summary.sinks).toBeGreaterThan(0);
    expect(dossier.graph.nodes.length).toBeGreaterThan(0);
  });

  it("reports same-feature prop relay from context-aware parents", async () => {
    const project = await createFixtureProject({
      "src/feature/Feature.context.tsx": `
        export function useFeatureModel() {
          return {
            detail: () => ({ id: "one" }),
            selection: () => ({ id: "selected" }),
            onSelect: (id: string) => id,
          };
        }
      `,
      "src/feature/FeatureShell.tsx": `
        import { useFeatureModel } from "./Feature.context";
        import { FeaturePanel } from "./FeaturePanel";
        export function FeatureShell() {
          const feature = useFeatureModel();
          return <FeaturePanel
            detail={feature.detail()}
            selection={feature.selection()}
            onSelect={feature.onSelect}
          />;
        }
      `,
      "src/feature/FeaturePanel.tsx": `
        export function FeaturePanel(props: {
          detail: { id: string };
          selection: { id: string };
          onSelect: (id: string) => string;
        }) {
          return <div>{props.detail.id}{props.selection.id}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "context-relay",
      format: "markdown",
    });

    expect(output).toContain("Context Relay");
    expect(output).toContain("FeaturePanel");
    expect(output).toContain("useFeatureModel");
    expect(output).toContain("detail, selection, onSelect");
  });

  it("compares baseline reports and marks regressions when requested", async () => {
    const project = await createFixtureProject({
      "src/baseline.tsx": `
        type User = { displayName: string };
        export function UserCard(props: { user: User }) {
          const a = { user: props.user };
          const b = { title: a.user.displayName };
          const c = { model: b };
          return <h2>{c.model.title ?? "Unknown"}</h2>;
        }
      `,
    });
    const baselinePath = resolve(project.root, "baseline.json");
    await writeFile(baselinePath, JSON.stringify({ sinks: [{ scores: { burden: 0 } }] }));

    const report = await analyzeProject({ ...project.args, baseline: baselinePath });

    expect(report.baseline.regressed).toBe(true);
    expect(report.baseline.currentWorst).toBeGreaterThan(0);
  });
});

describe("general CLI defaults and project discovery", () => {
  it("defaults the project root to the current working directory", () => {
    const args = parseArgs([]);
    expect(args.root).toBe(resolve(process.cwd()));
  });

  it("prefers ./src over ./app/src when discovering the source root", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-src-"));
    await mkdir(resolve(root, "src"), { recursive: true });
    await mkdir(resolve(root, "app", "src"), { recursive: true });
    expect(findDefaultSource(root)).toBe(resolve(root, "src"));
  });

  it("falls back to ./app/src, then the root, when ./src is absent", async () => {
    const appOnly = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-app-"));
    await mkdir(resolve(appOnly, "app", "src"), { recursive: true });
    expect(findDefaultSource(appOnly)).toBe(resolve(appOnly, "app", "src"));

    const bare = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-bare-"));
    expect(findDefaultSource(bare)).toBe(bare);
  });

  it("discovers the nearest tsconfig next to the source root", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-tsconfig-"));
    const source = resolve(root, "src");
    await mkdir(source, { recursive: true });
    await writeFile(resolve(root, "tsconfig.json"), "{}");
    expect(findDefaultTsconfig(root, source)).toBe(resolve(root, "tsconfig.json"));
  });

  it("emits help text naming the CLI and listing every view", () => {
    const text = helpText();
    expect(text).toContain("tsx-dataflow");
    for (const view of ["work-packets", "prop-relay", "context-relay", "fan-out", "dossier"]) {
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
    const args = parseArgs(["--root", root, "--typescript-from", appRoot, "--format", "json"]);
    expect(args.source).toBe(resolve(root, "src"));
    expect(args.tsconfig).toBe(resolve(root, "tsconfig.json"));

    const report = await analyzeProject(args);
    expect(report.sinks.length).toBeGreaterThan(0);
  });
});

async function createFixtureProject(files) {
  const root = await mkdtemp(resolve(tmpdir(), "render-path-dataflow-"));
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
      appRoot,
      "--format",
      "json",
      "--view",
      "work-packets",
    ]),
  };
}
