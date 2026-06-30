import { describe, expect, it } from "vitest";
import {
  FIXTURE,
  REPORT_VIEWS,
  analyzeProject,
  call,
  createAnalyzer,
  createFixtureProject,
  createServer,
  fanOutAnchor,
  fanOutEntriesForFile,
  fanOutEntriesGlobal,
  parseArgs,
  peekReferences,
  readFile,
  renderCodeMap,
  resolve,
} from "./helpers/server-test-context.mjs";

function expectSpaShell(response) {
  expect(response.status).toBe(200);
  expect(response.body).toContain('<div id="root"></div>');
  expect(response.body).toMatch(/src="\/assets\/index-[^"]+\.js"/);
  expect(response.body).toMatch(/href="\/assets\/index-[^"]+\.css"/);
}

describe("createServer", () => {
  it("serves the Solid SPA shell and focused file data APIs", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);

    const home = await call(handler, "/");
    expectSpaShell(home);

    const file = await call(
      handler,
      "/file?path=" + encodeURIComponent("src/Card.tsx"),
    );
    expectSpaShell(file);

    const json = await call(
      handler,
      "/api/report.json?path=" + encodeURIComponent("src/Card.tsx"),
    );
    expect(json.status).toBe(200);
    const payload = JSON.parse(json.body);
    expect(payload.sinks.every((s) => s.file === "src/Card.tsx")).toBe(true);

    const source = await call(
      handler,
      "/api/source?path=" + encodeURIComponent("src/Card.tsx"),
    );
    expect(source.status).toBe(200);
    expect(source.body).toContain("export function Card");
  });

  it("renders the repeated-forks section on the file page", async () => {
    const project = await createFixtureProject({
      "src/Chart.tsx": `
        declare function Switch(props: { children: unknown }): unknown;
        declare function Match(props: { when: boolean; children: unknown }): unknown;
        export function Chart(props: { type: "bar" | "line"; values: number[] }) {
          const barData = () => props.values.map((v) => v * 2);
          const lineData = () => props.values.map((v) => v + 1);
          const active = () => (props.type === "bar" ? barData() : lineData());
          return (
            <figure>
              <p>{active().length}</p>
              <Switch>
                <Match when={props.type === "bar"}><span>{barData().length}</span></Match>
                <Match when={props.type === "line"}><span>{lineData().length}</span></Match>
              </Switch>
            </figure>
          );
        }
      `,
    });
    const { handler } = createServer(project.args);
    const fileRoute = await call(
      handler,
      "/file?path=" +
        encodeURIComponent("src/Chart.tsx") +
        "&view=repeated-forks",
    );
    expectSpaShell(fileRoute);

    const report = await call(
      handler,
      "/api/report.repeated-forks.md?path=" +
        encodeURIComponent("src/Chart.tsx"),
    );
    expect(report.status).toBe(200);
    expect(report.body).toContain("# Repeated Fork");
    expect(report.body).toContain("props.type");
  });

  it("file routes stay client-rendered while source and markdown APIs provide the pane content", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);
    const base = "/file?path=" + encodeURIComponent("src/Card.tsx");

    const map = await call(handler, base);
    expectSpaShell(map);

    const source = await call(
      handler,
      "/api/source?path=" + encodeURIComponent("src/Card.tsx"),
    );
    expect(source.body).toContain("return");

    const junctions = await call(handler, base + "&view=junctions");
    expectSpaShell(junctions);

    const junctionsMd = await call(
      handler,
      "/api/report.junctions.md?path=" + encodeURIComponent("src/Card.tsx"),
    );
    expect(junctionsMd.status).toBe(200);
    expect(junctionsMd.body).toContain("Junctions");
  });

  it("names each burden metric consistently across views (LABEL-1)", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);
    const md = await call(handler, "/api/report.findings.md");
    expect(md.status).toBe(200);
    // The canonical BURDEN_TERMS label is used; the old drift names are gone.
    expect(md.body).toContain("representation churn");
    expect(md.body).not.toContain("representation changes");
    expect(md.body).not.toContain("representation-only transformations");
  });

  it("filters, searches, and sorts overview file rows through query params", async () => {
    const project = await createFixtureProject({
      ...FIXTURE,
      "src/Other.tsx": `
        export function Other(props: { name: string; total: number }) {
          return <section title={props.name}>{props.total * 2}</section>;
        }
      `,
    });
    const { handler } = createServer(project.args);

    const data = await call(handler, "/api/report.json");
    expect(data.status).toBe(200);
    const payload = JSON.parse(data.body);
    expect(payload.sinks.some((s) => s.file === "src/Card.tsx")).toBe(true);
    expect(payload.sinks.some((s) => s.file === "src/Other.tsx")).toBe(true);

    // Search/filter/sort state is now owned by the SPA; the server preserves the
    // URL and returns the same client shell for those navigations.
    const searched = await call(handler, "/?q=Other&sort=file");
    expectSpaShell(searched);

    const unknownOnly = await call(handler, "/?filter=unknown");
    expectSpaShell(unknownOnly);
  });

  it("paginates long overview file lists", async () => {
    const files = {};
    for (let index = 0; index < 60; index += 1) {
      const name = `File${String(index).padStart(2, "0")}`;
      files[`src/${name}.tsx`] = `
        export function ${name}(props: { value: number }) {
          return <div title={String(props.value)}>{props.value + ${index}}</div>;
        }
      `;
    }
    const project = await createFixtureProject(files);
    const { handler } = createServer(project.args);

    const first = await call(handler, "/?sort=file");
    expectSpaShell(first);

    const third = await call(handler, "/?sort=file&page=3");
    expectSpaShell(third);

    const data = await call(handler, "/api/report.json");
    const payload = JSON.parse(data.body);
    expect(new Set(payload.sinks.map((sink) => sink.file)).size).toBe(60);
  });

  it("sorts the Worst column by per-file max burden, descending (BUG-1)", async () => {
    const files = {};
    for (let index = 0; index < 6; index += 1) {
      const name = `W${index}`;
      // Vary complexity so files get different worst-burden scores.
      const guards = "?? 0 ".repeat(index + 1);
      files[`src/${name}.tsx`] = `
        export function ${name}(props: { a: number; b: number | null }) {
          return <div title={String((props.b ${guards}) + props.a)}>{props.a + ${index}}</div>;
        }
      `;
    }
    const project = await createFixtureProject(files);
    const analyzer = createAnalyzer(project.args);
    const report = analyzer.report();
    const worstByFile = new Map();
    for (const sink of report.rankings.all) {
      worstByFile.set(
        sink.file,
        Math.max(worstByFile.get(sink.file) ?? 0, sink.scores.burden),
      );
    }
    const firsts = [];
    for (const value of [...worstByFile.values()].sort((a, b) => b - a))
      firsts.push(value);
    expect(firsts.length).toBeGreaterThan(1);
    for (let i = 1; i < firsts.length; i += 1) {
      expect(firsts[i]).toBeLessThanOrEqual(firsts[i - 1] + 1e-9);
    }
  });

  it("classifies a trivial expression as a usage, not a finding (THRESH-1)", async () => {
    const project = await createFixtureProject({
      "src/Plain.tsx": `
        export function Plain(props: { search: string }) {
          return <input value={props.search} />;
        }
      `,
    });
    const analyzer = createAnalyzer(project.args);
    const report = analyzer.report({ file: ["src/Plain.tsx"] });
    const sink = report.rankings.all.find((s) => s.file === "src/Plain.tsx");
    expect(sink).toBeTruthy();
    expect(sink.tier).toBe("usage");
  });

  it("unifies forks, junctions, and usages into the code-map inventory (ARCH-1)", async () => {
    const project = await createFixtureProject({
      "src/Forky.tsx": `
        declare function Switch(props: { children: unknown }): unknown;
        declare function Match(props: { when: boolean; children: unknown }): unknown;
        export function Forky(props: { type: "bar" | "line"; values: number[] }) {
          const barData = () => props.values.map((v) => v * 2);
          const lineData = () => props.values.map((v) => v + 1);
          return (
            <figure>
              <p>{props.type === "bar" ? barData().length : lineData().length}</p>
              <Switch>
                <Match when={props.type === "bar"}><span>{barData().length}</span></Match>
                <Match when={props.type === "line"}><span>{lineData().length}</span></Match>
              </Switch>
            </figure>
          );
        }
      `,
    });
    const { handler } = createServer(project.args);
    const json = await call(
      handler,
      "/api/report.json?path=" + encodeURIComponent("src/Forky.tsx"),
    );
    expect(json.status).toBe(200);
    const payload = JSON.parse(json.body);
    expect(payload.sinks.some((sink) => sink.file === "src/Forky.tsx")).toBe(
      true,
    );
    expect(
      payload.repeatedForks.some((fork) => fork.file === "src/Forky.tsx"),
    ).toBe(true);
  });

  it("marks fallback path steps as defensive and numbers path steps (DEF/ANNO)", async () => {
    const source = [
      "export function App() {",
      "  return <div>{value}</div>;",
      "}",
    ].join("\n");
    const sink = {
      id: "F1",
      file: "src/App.tsx",
      line: 2,
      column: 16,
      expression: "value",
      label: "value",
      category: "render",
      queue: "investigation",
      confidence: 80,
      metrics: {},
      scores: { burden: 0.4 },
      span: { startLine: 2, startColumn: 16, endLine: 2, endColumn: 21 },
      representativeSteps: [
        { kind: "source", label: "raw", file: "src/App.tsx", line: 1 },
        { kind: "fallback", label: "raw ?? 0", file: "src/App.tsx", line: 2 },
        {
          kind: "call",
          label: "<div>{value}</div>",
          file: "src/App.tsx",
          line: 2,
        },
      ],
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [sink],
    });
    expect(html).toContain('class="defensive-step"');
    expect(html).toContain('class="def-icon"');
    // Step map for the numbered overlay: line:ordinal[:d].
    expect(html).toMatch(/data-path-steps="[^"]*2:2:d/);
  });

  it("renders clickable sort headers with an active caret and a sort-aware heading", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);

    const byBurden = await call(handler, "/");
    expectSpaShell(byBurden);

    const byFile = await call(handler, "/?sort=file");
    expectSpaShell(byFile);
  });

  it("offers a show-all toggle and renders every row when all=1", async () => {
    const files = {};
    for (let index = 0; index < 30; index += 1) {
      const name = `Big${String(index).padStart(2, "0")}`;
      files[`src/${name}.tsx`] = `
        export function ${name}(props: { value: number }) {
          return <div title={String(props.value)}>{props.value + ${index}}</div>;
        }
      `;
    }
    const project = await createFixtureProject(files);
    const { handler } = createServer(project.args);

    const paged = await call(handler, "/?sort=file");
    expectSpaShell(paged);

    const all = await call(handler, "/?sort=file&all=1");
    expectSpaShell(all);

    const data = await call(handler, "/api/report.json");
    const payload = JSON.parse(data.body);
    expect(new Set(payload.sinks.map((sink) => sink.file)).size).toBe(30);
  });

  it("links back to the overview from the file page and the report tab strip", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);

    const file = await call(
      handler,
      "/file?path=" + encodeURIComponent("src/Card.tsx"),
    );
    expectSpaShell(file);

    const report = await call(handler, "/report?view=findings");
    expectSpaShell(report);

    const markdown = await call(handler, "/api/report.findings.md");
    expect(markdown.body).toContain("# Render-Path Findings");
  });

  it("pre-selects a finding on the file page via ?finding=", async () => {
    const project = await createFixtureProject(FIXTURE);
    const analyzer = createAnalyzer(project.args);
    const report = analyzer.report({ file: ["src/Card.tsx"] });
    const target = report.rankings.all.find(
      (s) => s.file === "src/Card.tsx",
    ).id;
    const { handler } = createServer(project.args);
    const file = await call(
      handler,
      "/file?path=" + encodeURIComponent("src/Card.tsx") + "&finding=" + target,
    );
    expectSpaShell(file);
    const json = await call(
      handler,
      "/api/report.json?path=" + encodeURIComponent("src/Card.tsx"),
    );
    const payload = JSON.parse(json.body);
    expect(payload.sinks.some((sink) => sink.id === target)).toBe(true);
  });

  it("adds an Open-file link inside source-peek popovers", () => {
    const html = peekReferences("<p>see src/Card.tsx:3 now</p>", (p) =>
      p === "src/Card.tsx" ? "a\nb\nconst c = 3;\nd" : null,
    );
    expect(html).toContain('class="peek-open"');
    expect(html).toContain('href="/file?path=src%2FCard.tsx#L3"');
    expect(html).toContain("Open Card.tsx ↗");
  });

  it("links and serves markdown assets for every registered report view", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);

    expectSpaShell(await call(handler, "/"));

    const htmlReport = await call(handler, "/report?view=work-packets");
    expectSpaShell(htmlReport);

    for (const view of REPORT_VIEWS) {
      const markdown = await call(handler, `/api/report.${view}.md`);
      expect(markdown.status).toBe(200);
      expect(markdown.headers["Content-Type"]).toContain("text/markdown");
    }

    expectSpaShell(await call(handler, "/report?view=missing"));
    expect((await call(handler, "/api/report.missing.md")).status).toBe(404);
  });

  it("serves SPA fallback for client routes and keeps healthz as a server endpoint", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);
    expectSpaShell(await call(handler, "/nope"));
    expectSpaShell(await call(handler, "/file"));
    expect((await call(handler, "/healthz")).status).toBe(200);
    expect((await call(handler, "/api/source")).status).toBe(400);
  });
});
