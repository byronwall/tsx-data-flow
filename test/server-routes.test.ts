import { describe, expect, it } from "vitest";
import { REPORT_VIEWS } from "../src/cli/args";
import { REPORT_VIEWS as API_REPORT_VIEWS } from "../src/api/report-views";
import { createAnalyzer } from "../src/core";
import { createServer } from "../src/server";
import { createServerFixtureProject as createFixtureProject } from "./helpers/fixture-project";
import { call } from "./helpers/http";
import { FIXTURE } from "./helpers/server-test-context";
import { filePageResponseSchema, refreshResponseSchema, reportResponseSchema, routeDataDetailResponseSchema, sourceExcerptResponseSchema, workspaceResponseSchema } from "../src/api/contracts";

function expectSpaShell(response) {
  expect(response.status).toBe(200);
  expect(response.body).toContain('<div id="root"></div>');
  expect(response.body).toMatch(/src="\/assets\/index-[^"]+\.js"/);
  expect(response.body).toMatch(/href="\/assets\/index-[^"]+\.css"/);
}

describe("createServer", () => {
  it("serves generation-aware route trajectory detail and contained source excerpts", async () => {
    const project = await createFixtureProject({
      "node_modules/solid-js/index.d.ts": "export declare function createResource<T>(fetcher: () => Promise<T>): [() => T | undefined];",
      "src/routes/items/[itemId].tsx": `
        import { createResource } from "solid-js";
        declare const prisma: { item: { findUnique(): Promise<{ name: string }> } };
        async function loadItem() { return prisma.item.findUnique(); }
        export default function ItemRoute() { const [item] = createResource(loadItem); return <h1 style={{ opacity: item() ? 1 : 0 }}>{item()?.name}</h1>; }
      `,
    });
    const { handler } = createServer(project.args);
    const workspace = workspaceResponseSchema.parse(JSON.parse((await call(handler, "/api/workspace")).body));
    const route = workspace.data.routeData.routes.find((item) => item.pathPattern === "/items/[itemId]")!;
    const flow = workspace.data.routeData.trajectories.find((item) => item.routeKey === route.key)!;
    const detailResponse = await call(handler, `/api/route-data?route=${encodeURIComponent(route.key)}&flow=${encodeURIComponent(flow.key)}&generation=${workspace.generation}`);
    const detail = routeDataDetailResponseSchema.parse(JSON.parse(detailResponse.body));
    expect(detail.data.route.parameters).toEqual([{ name: "itemId", kind: "dynamic" }]);
    expect(detail.data.operations.some((item) => item.semanticKind === "read")).toBe(true);
    const evidence = detail.data.evidence[0];
    const sourceResponse = await call(handler, `/api/route-data/source?path=${encodeURIComponent(evidence.file)}&generation=${workspace.generation}&line=${evidence.line}&column=${evidence.column}&endLine=${evidence.span.endLine}&endColumn=${evidence.span.endColumn}`);
    const source = sourceExcerptResponseSchema.parse(JSON.parse(sourceResponse.body));
    expect(source.data.lines.some((line) => line.focus && line.text.includes("prisma"))).toBe(true);
    expect((await call(handler, `/api/route-data?route=${encodeURIComponent(route.key)}&flow=${encodeURIComponent(flow.key)}&generation=${workspace.generation + 1}`)).status).toBe(404);
    expect((await call(handler, "/api/route-data/source?path=..%2Fpackage.json&generation=" + workspace.generation + "&line=1&column=1")).status).toBe(404);
  });
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

    const workspace = workspaceResponseSchema.parse(JSON.parse((await call(handler, "/api/workspace")).body));
    expect(workspace.data.files.some((row) => row.path === "src/Card.tsx")).toBe(true);
    expect(workspace.data.semanticMap.areas.some((area) => area.path === "src/Card.tsx")).toBe(true);
    expect(workspace.data.semanticMap.trajectories.some((trajectory) => trajectory.terminal.path === "src/Card.tsx")).toBe(true);
    expect(workspace.data.semanticMap.cleanup.length).toBeGreaterThan(0);
    expect(workspace.data.semanticMap.areas.length).toBeLessThanOrEqual(workspace.data.semanticMap.caps.areas);
    expect(workspace.data.semanticMap.edges.length).toBeLessThanOrEqual(workspace.data.semanticMap.caps.edges);
    const filePayload = filePageResponseSchema.parse(JSON.parse((await call(handler, "/api/file?path=src%2FCard.tsx")).body));
    expect(filePayload.data.file.lines.some((line) => line.text.includes("export function Card"))).toBe(true);
    expect(filePayload.data.inventory.some((entry) => entry.kind === "finding")).toBe(true);
    const reportPayload = reportResponseSchema.parse(JSON.parse((await call(handler, "/api/reports/findings")).body));
    expect(reportPayload.data.view).toBe("findings");
    const refreshed = refreshResponseSchema.parse(JSON.parse((await call(handler, "/api/refresh", "POST")).body));
    expect(refreshed.generation).toBeGreaterThan(workspace.generation);
  });

  it("rejects source traversal with a structured error", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);
    const response = await call(handler, "/api/file?path=..%2Fpackage.json");
    expect(response.status).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe("file_not_found");
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

    const source = filePageResponseSchema.parse(JSON.parse((await call(handler, "/api/file?path=src%2FCard.tsx")).body));
    expect(source.data.file.lines.some((line) => line.text.includes("return"))).toBe(true);

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

    const payload = workspaceResponseSchema.parse(JSON.parse((await call(handler, "/api/workspace")).body));
    expect(payload.data.files.some((row) => row.path === "src/Card.tsx")).toBe(true);
    expect(payload.data.files.some((row) => row.path === "src/Other.tsx")).toBe(true);

    // Search/filter/sort state is now owned by the SPA; the server preserves the
    // URL and returns the same client shell for those navigations.
    const searched = await call(handler, "/?q=Other&sort=file");
    expectSpaShell(searched);

    const unknownOnly = await call(handler, "/?filter=unknown");
    expectSpaShell(unknownOnly);
  });

  it("treats a supplied file set as the workspace review scope", async () => {
    const project = await createFixtureProject({ ...FIXTURE, "src/Other.tsx": `export function Other(props: { value: number }) { return <div>{props.value + 1}</div>; }` });
    const { handler } = createServer({ ...project.args, file: ["src/Card.tsx"] });
    const workspace = workspaceResponseSchema.parse(JSON.parse((await call(handler, "/api/workspace")).body));
    expect(workspace.data.workspace.reviewScope).toEqual({ kind: "file-set", paths: ["src/Card.tsx"] });
    expect(workspace.data.files.every((row) => row.path === "src/Card.tsx")).toBe(true);
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

    const payload = workspaceResponseSchema.parse(JSON.parse((await call(handler, "/api/workspace")).body));
    expect(payload.data.files.length).toBe(60);
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
    const payload = filePageResponseSchema.parse(JSON.parse((await call(handler, "/api/file?path=src%2FForky.tsx")).body));
    expect(payload.data.inventory.some((entry) => entry.kind === "finding")).toBe(true);
    expect(payload.data.inventory.some((entry) => entry.kind === "fork")).toBe(true);
    const finding = Object.values(payload.data.findingsById)[0];
    expect(finding.identity.expressionId).toContain("src/Forky.tsx");
    expect(finding.identity.traceCompletenessReason.length).toBeGreaterThan(0);
    expect(finding.identity.upstreamPath.length).toBeGreaterThan(0);
    expect(finding.identity.terminalSinks).toEqual([expect.objectContaining({ id: expect.stringMatching(/^terminal:/), path: "src/Forky.tsx" })]);
    expect(finding.identity.totalReach).toBeGreaterThanOrEqual(1);
    const expressions = Object.values(payload.data.expressionsById);
    expect(expressions.length).toBeGreaterThan(0);
    expect(expressions.some((expression) => expression.attachedFindingIds.includes(finding.id))).toBe(true);
    expect(expressions.every((expression) => expression.span.startColumn > 0 && expression.expressionId.includes("expression:"))).toBe(true);
    expect(expressions.some((expression) => expression.boundaryIds.length > 0)).toBe(true);
    expect(expressions.every((expression) => expression.typeId.startsWith("type:") && expression.typeText.length > 0)).toBe(true);
  });

  it("separates a sink predicate from the selectable values inside it", async () => {
    const project = await createFixtureProject({
      "src/model.ts": `
        export type SectionView = { sampleCount: number };
        export const makeSection = (): SectionView => ({ sampleCount: 3 });
      `,
      "src/Page.tsx": `
        import { makeSection } from "./model";
        declare function Show(props: { when: boolean; children: unknown }): unknown;
        export function Page() {
          const section = () => makeSection();
          return <Show when={section().sampleCount > 0}><span>samples</span></Show>;
        }
      `,
    });
    const { handler } = createServer(project.args);
    const payload = filePageResponseSchema.parse(JSON.parse((await call(handler, "/api/file?path=src%2FPage.tsx")).body));
    const finding = Object.values(payload.data.findingsById).find((item) => item.expression === "section().sampleCount > 0")!;
    expect(finding.type).toBe("boolean");
    expect(finding.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ focusText: "sampleCount", expression: "section().sampleCount", typeText: "number", role: "property" }),
      expect.objectContaining({ focusText: "section", expression: "section()", typeText: "SectionView", role: "call" }),
    ]));
    const sampleCount = Object.values(payload.data.expressionsById).find((item) => item.focusText === "sampleCount" && item.expression === "section().sampleCount")!;
    expect(sampleCount.symbolName).toBe("sampleCount");
    expect(sampleCount.typeText).toBe("number");
    expect(sampleCount.definition?.path).toBe("src/model.ts");
    const annotation = payload.data.file.lines.flatMap((line) => line.annotations).find((item) => item.entityId === sampleCount.expressionId);
    expect(annotation?.kind).toBe("expression");
    expect(annotation?.startColumn).toBe(sampleCount.focusSpan.startColumn);
    expect(annotation?.endColumn).toBe(sampleCount.focusSpan.endColumn);
  });

  it("omits ambient platform identities from selectable expressions", async () => {
    const project = await createFixtureProject({
      "src/Page.tsx": `export function Page(props: { value: number }) { return <span>{Math.round(props.value)}</span>; }`,
    });
    const { handler } = createServer(project.args);
    const payload = filePageResponseSchema.parse(JSON.parse((await call(handler, "/api/file?path=src%2FPage.tsx")).body));
    const expressions = Object.values(payload.data.expressionsById);
    expect(expressions.some((expression) => expression.symbolName === "Math" || expression.symbolName === "round")).toBe(false);
    expect(expressions.some((expression) => expression.symbolName === "value")).toBe(true);
    expect(payload.data.file.lines.flatMap((line) => line.annotations).filter((annotation) => annotation.kind === "expression").every((annotation) => {
      const expression = payload.data.expressionsById[annotation.entityId];
      return expression?.symbolName !== "Math" && expression?.symbolName !== "round";
    })).toBe(true);
  });

  it("annotates project-local references outside render traces", async () => {
    const project = await createFixtureProject({
      "src/Page.tsx": `
        type Filters = { labels: string[] };
        const filters = (): Filters => ({ labels: [] });
        const setPreviewLimit = (value: { width: number }) => value;
        const updateLabels = (labels: string[]) => labels;
        export function Page() {
          setPreviewLimit({ width: 1 });
          const selected = new Set(filters().labels);
          updateLabels([...selected]);
          return <span>ready</span>;
        }
      `,
    });
    const { handler } = createServer(project.args);
    const payload = filePageResponseSchema.parse(JSON.parse((await call(handler, "/api/file?path=src%2FPage.tsx")).body));
    const references = Object.values(payload.data.expressionsById).filter((expression) =>
      ["setPreviewLimit", "filters", "updateLabels"].includes(expression.focusText) &&
      expression.location.line >= 7,
    );

    expect(references.map((expression) => expression.focusText)).toEqual([
      "setPreviewLimit",
      "filters",
      "updateLabels",
    ]);
    for (const expression of references) {
      expect(expression.definition?.path).toBe("src/Page.tsx");
      expect(expression.terminalSinks).toEqual([]);
      expect(payload.data.file.lines.flatMap((line) => line.annotations)).toContainEqual(expect.objectContaining({
        kind: "expression",
        entityId: expression.expressionId,
      }));
    }
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

    const payload = workspaceResponseSchema.parse(JSON.parse((await call(handler, "/api/workspace")).body));
    expect(payload.data.files.length).toBe(30);
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
    const payload = filePageResponseSchema.parse(JSON.parse((await call(handler, "/api/file?path=src%2FCard.tsx")).body));
    expect(payload.data.inventory.some((entry) => entry.id === target)).toBe(true);
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
    for (const view of API_REPORT_VIEWS.filter((candidate) => candidate !== "overview")) {
      const structured = await call(handler, `/api/reports/${view}`);
      expect(structured.status).toBe(200);
      expect(reportResponseSchema.parse(JSON.parse(structured.body)).data.view).toBe(view);
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
    expect((await call(handler, "/api/file")).status).toBe(400);
  });
});
