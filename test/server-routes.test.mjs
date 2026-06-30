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

describe("createServer", () => {
  it("serves the overview and a focused file page", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);

    const home = await call(handler, "/");
    expect(home.status).toBe(200);
    expect(home.body).toContain("/file?path=");
    expect(home.body).toContain("Render-path overview");
    // OVERVIEW-1: optional per-type columns + the show/hide control are present.
    expect(home.body).toContain('id="col-toggle"');
    expect(home.body).toContain('id="overview-table"');
    expect(home.body).toContain('class="col-fanout num">Fan-out</th>');
    expect(home.body).toContain('data-col="boundaries"');

    const file = await call(
      handler,
      "/file?path=" + encodeURIComponent("src/Card.tsx"),
    );
    expect(file.status).toBe(200);
    expect(file.body).toContain('class="codemap"');
    expect(file.body).toContain("<details");

    const json = await call(
      handler,
      "/api/report.json?path=" + encodeURIComponent("src/Card.tsx"),
    );
    expect(json.status).toBe(200);
    const payload = JSON.parse(json.body);
    expect(payload.sinks.every((s) => s.file === "src/Card.tsx")).toBe(true);
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
    // SHELL-3: the file page is tabbed — the repeated-forks report renders when its
    // tab is selected via ?view=, not stacked as a <details> on the code-map page.
    const file = await call(
      handler,
      "/file?path=" +
        encodeURIComponent("src/Chart.tsx") +
        "&view=repeated-forks",
    );
    expect(file.status).toBe(200);
    expect(file.body).toContain('class="report-tab active"');
    expect(file.body).toContain("Repeated forks");
    expect(file.body).toContain("props.type");
  });

  it("file page shows the code map by default and swaps to a single report when a view is selected (SHELL-3)", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);
    const base = "/file?path=" + encodeURIComponent("src/Card.tsx");

    // Default: the code map renders (its burden heat legend is the tell).
    const map = await call(handler, base);
    expect(map.status).toBe(200);
    expect(map.body).toContain("low burden");

    // Selecting a view swaps the pane to that one report — the code map is replaced,
    // not stacked beneath every report as it used to be.
    const junctions = await call(handler, base + "&view=junctions");
    expect(junctions.status).toBe(200);
    expect(junctions.body).toContain("Junctions");
    expect(junctions.body).not.toContain("low burden");
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

    const home = await call(handler, "/");
    expect(home.body).toContain("src/Card.tsx");
    expect(home.body).toContain("src/Other.tsx");

    // Search filters the file rows to matches only.
    const searched = await call(handler, "/?q=Other&sort=file");
    expect(searched.status).toBe(200);
    expect(searched.body).toContain("src/Other.tsx");
    expect(searched.body).not.toContain("src/Card.tsx");
    // Sort controls navigate and preserve the active query (q) in the URL.
    expect(searched.body).toContain("/?q=Other&amp;sort=findings");

    // The `unknown` filter keeps only files with unknown edges (empty fixture here).
    const unknownOnly = await call(handler, "/?filter=unknown");
    expect(unknownOnly.status).toBe(200);
    expect(unknownOnly.body).not.toContain("src/Other.tsx");
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
    expect(first.status).toBe(200);
    expect(first.body).toContain("Showing 1-25 of 60 files");
    expect(first.body).toContain("Page 1 of 3");
    expect(first.body).toContain("/?sort=file&amp;page=2");
    expect(first.body).toContain("src/File00.tsx");
    expect(first.body).not.toContain("src/File59.tsx");

    const third = await call(handler, "/?sort=file&page=3");
    expect(third.status).toBe(200);
    expect(third.body).toContain("Showing 51-60 of 60 files");
    expect(third.body).toContain("src/File59.tsx");
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
    const { handler } = createServer(project.args);
    const home = await call(handler, "/?sort=burden");
    const worst = [...home.body.matchAll(/<td>(\d+\.\d+)<\/td>/g)].map((m) =>
      Number(m[1]),
    );
    // The first numeric column emitted per row is "Worst"; the sequence of the
    // first value on each row must be non-increasing.
    const firsts = [];
    const rowChunks = home.body.split("<tr>").slice(2); // skip thead
    for (const chunk of rowChunks) {
      const m = chunk.match(/<td>(\d+\.\d+)<\/td>/);
      if (m) firsts.push(Number(m[1]));
    }
    expect(firsts.length).toBeGreaterThan(1);
    for (let i = 1; i < firsts.length; i += 1) {
      expect(firsts[i]).toBeLessThanOrEqual(firsts[i - 1] + 1e-9);
    }
    expect(worst.length).toBeGreaterThan(0);
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
    const file = await call(
      handler,
      "/file?path=" + encodeURIComponent("src/Forky.tsx"),
    );
    expect(file.status).toBe(200);
    // Unified inventory with type filter + type tags. HEAD-1: the count now lives
    // in the "All N" filter pill, not a redundant "N items in this file" line.
    expect(file.body).toContain('data-filter="all"');
    expect(file.body).toContain('class="entry-filters"');
    expect(file.body).toContain('data-entry-type="fork"');
    expect(file.body).toContain("repeated fork");
    expect(file.body).toContain("Discriminant");
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
    expect(byBurden.body).toContain("<h2>Files by burden</h2>");
    expect(byBurden.body).toContain('class="sortable active"');
    expect(byBurden.body).toContain('<span class="caret"');
    // CARET-1: the label is in its own span so the caret sits inline-right via
    // flex, never wrapping to a new line or growing the header height.
    expect(byBurden.body).toContain('<span class="th-label">');
    // Header is a link that re-sorts.
    expect(byBurden.body).toContain('href="/?sort=findings"');

    const byFile = await call(handler, "/?sort=file");
    expect(byFile.body).toContain("<h2>Files by path</h2>");
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
    expect(paged.body).toContain("Show all 30");
    expect(paged.body).toContain("/?sort=file&amp;all=1");

    const all = await call(handler, "/?sort=file&all=1");
    expect(all.body).toContain("Showing all 30 files");
    expect(all.body).not.toContain(
      'aria-label="File result pages">\n  <a class="btn',
    );
    expect(all.body).toContain("src/Big00.tsx");
    expect(all.body).toContain("src/Big29.tsx");
    expect(all.body).toContain("Paginate");
  });

  it("links back to the overview from the file page and the report tab strip", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);

    const file = await call(
      handler,
      "/file?path=" + encodeURIComponent("src/Card.tsx"),
    );
    expect(file.body).toContain('class="crumbs"');
    expect(file.body).toContain('<a href="/">← Overview</a>');
    // SHELL-1: the persistent top-bar brand is a home link on every page.
    expect(file.body).toContain('<a class="brand" href="/">tsx-dataflow</a>');

    // ARCH-1: report pages now carry the page-level tab strip; its "Overview" tab
    // is the back-link, and the active view's tab is marked.
    const report = await call(handler, "/report?view=findings");
    expect(report.body).toContain('class="report-tabs"');
    expect(report.body).toContain('href="/">Overview</a>');
    expect(report.body).toContain('class="report-tab active"');
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
    expect(file.body).toContain('class="panel show-detail"');
    expect(file.body).toContain(
      `class="finding active" data-finding="${target}"`,
    );
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

    const home = await call(handler, "/");
    // SHELL-1: the overview tab strip links every report view; each report page
    // exposes its own `/api/report.<view>.md` Markdown button (checked below).
    for (const view of REPORT_VIEWS) {
      expect(home.body).toContain(`/report?view=${view}`);
    }

    const htmlReport = await call(handler, "/report?view=work-packets");
    expect(htmlReport.status).toBe(200);
    expect(htmlReport.body).toContain("Work packets");
    expect(htmlReport.body).toContain("/api/report.work-packets.md");

    const markdown = await call(handler, "/api/report.findings.md");
    expect(markdown.status).toBe(200);
    expect(markdown.headers["Content-Type"]).toContain("text/markdown");
    expect(markdown.body).toContain("# Render-Path Findings");

    expect((await call(handler, "/report?view=missing")).status).toBe(404);
    expect((await call(handler, "/api/report.missing.md")).status).toBe(404);
  });

  it("returns 404 for unknown routes and 400 for /file without path", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);
    expect((await call(handler, "/nope")).status).toBe(404);
    expect((await call(handler, "/file")).status).toBe(400);
    expect((await call(handler, "/healthz")).status).toBe(200);
  });
});
