import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeProject,
  createAnalyzer,
  parseArgs,
  REPORT_VIEWS,
} from "../src/core.mjs";
import { markdownToHtml } from "../src/html/markdown-to-html.mjs";
import { renderCodeMap } from "../src/html/code-map.mjs";
import { snippetBlockHtml, peekReferences } from "../src/html/source-peek.mjs";
import { createServer } from "../src/server.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");

async function createFixtureProject(files) {
  const root = await mkdtemp(resolve(tmpdir(), "render-path-server-"));
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
    ]),
  };
}

const FIXTURE = {
  "src/Card.tsx": `
    export function Card(props: { title: string; count: number }) {
      const label = props.title ?? "Untitled";
      return <div class={label}>{props.count + 1}</div>;
    }
  `,
};

// Drive the server handler with a minimal mock req/res, returning the response.
function call(handler, url, method = "GET") {
  return new Promise((resolve) => {
    const chunks = [];
    const res = {
      _status: 200,
      _headers: {},
      writeHead(status, headers) {
        this._status = status;
        if (headers) Object.assign(this._headers, headers);
      },
      end(body) {
        if (body) chunks.push(body);
        resolve({ status: this._status, headers: this._headers, body: chunks.join("") });
      },
    };
    handler({ url, method }, res);
  });
}

describe("markdownToHtml", () => {
  it("renders GFM tables to thead/tbody", () => {
    const html = markdownToHtml(
      ["| A | B |", "| - | - |", "| 1 | 2 |", "| 3 | 4 |"].join("\n"),
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<td>4</td>");
  });

  it("escapes pipes inside table cells", () => {
    const html = markdownToHtml(
      ["| Type |", "| - |", "| string \\| number |"].join("\n"),
    );
    expect(html).toContain("<td>string | number</td>");
  });

  it("renders fenced code with embedded backticks and escapes HTML", () => {
    const html = markdownToHtml(
      ["````", "const a = `x` + `<y>`;", "````"].join("\n"),
    );
    expect(html).toContain("<pre><code>");
    expect(html).toContain("`x` + `&lt;y&gt;`");
  });

  it("renders headings, blockquotes, bold, inline code, and lists", () => {
    const html = markdownToHtml(
      [
        "# Title",
        "",
        "> a **bold** note with `code`",
        "",
        "- one",
        "- two",
      ].join("\n"),
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toMatch(/<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/);
  });

  it("treats underscores inside identifiers as literal", () => {
    const html = markdownToHtml("the view_model value");
    expect(html).toContain("view_model");
    expect(html).not.toContain("<em>");
  });
});

describe("createAnalyzer", () => {
  it("reprojects the same report as analyzeProject", async () => {
    const project = await createFixtureProject(FIXTURE);
    const direct = await analyzeProject(project.args);
    const analyzer = createAnalyzer(project.args);
    const reused = analyzer.report();
    expect(reused.rankings.all.map((s) => s.id)).toEqual(
      direct.rankings.all.map((s) => s.id),
    );
  });

  it("focuses on a single file via the file override", async () => {
    const project = await createFixtureProject({
      ...FIXTURE,
      "src/Other.tsx": `
        export function Other(props: { name: string }) {
          return <span>{props.name ?? "anon"}</span>;
        }
      `,
    });
    const analyzer = createAnalyzer(project.args);
    const full = analyzer.report();
    const focused = analyzer.report({ file: ["src/Card.tsx"] });
    expect(new Set(full.sinks.map((s) => s.file)).size).toBeGreaterThan(1);
    expect(new Set(focused.sinks.map((s) => s.file))).toEqual(
      new Set(["src/Card.tsx"]),
    );
  });
});

describe("renderCodeMap", () => {
  const baseSink = {
    id: "F1",
    file: "src/App.tsx",
    line: 2,
    column: 10,
    expression: "props.user.name ?? props.fallback",
    label: "props.user.name ?? props.fallback",
    category: "render",
    queue: "investigation",
    confidence: 80,
    confidenceRisk: "medium",
    metrics: {},
    scores: { burden: 0.42 },
    renderContext: { component: "App", tag: "div", attribute: "title" },
  };

  it("marks sink lines, escapes source, and renders commentary", async () => {
    const project = await createFixtureProject(FIXTURE);
    const report = createAnalyzer(project.args).report({ file: ["src/Card.tsx"] });
    const sinks = report.rankings.all.filter((s) => s.file === "src/Card.tsx");
    const source = `const x = a < b && c > d;\nconst y = 2;`;
    const html = renderCodeMap({ relPath: "src/Card.tsx", source, sinks });
    expect(html).toContain('class="codemap"');
    // angle brackets in source are escaped, not rendered as tags
    expect(html).toContain("a &lt; b &amp;&amp; c &gt; d");
    // at least one finding panel exists for the file's sinks
    expect(sinks.length).toBeGreaterThan(0);
    // The panel defaults to the findings inventory (no finding force-opened);
    // detail blocks are present but not active until selected.
    expect(html).toContain('class="finding-list"');
    expect(html).toContain('class="finding"');
    expect(html).not.toContain('class="finding active"');
    expect(html).toContain("Why selected");
  });

  it("pre-activates a finding when selectedFinding is provided", async () => {
    const project = await createFixtureProject(FIXTURE);
    const report = createAnalyzer(project.args).report({ file: ["src/Card.tsx"] });
    const sinks = report.rankings.all.filter((s) => s.file === "src/Card.tsx");
    const source = `const x = 1;\nconst y = 2;`;
    const target = sinks[0].id;
    const html = renderCodeMap({
      relPath: "src/Card.tsx",
      source,
      sinks,
      selectedFinding: target,
    });
    // Panel opens straight into detail mode on the requested finding.
    expect(html).toContain('class="panel show-detail"');
    expect(html).toContain(`class="finding active" data-finding="${target}"`);
    // Rows carry a data-line so the client can scroll/overlay by line number.
    expect(html).toMatch(/<tr[^>]*data-line="1"/);
  });

  it("connects multi-line sink spans across every touched line", () => {
    const source = [
      "export function App(props) {",
      "  return <div title={props.user",
      "    .profile",
      "    .name ?? props.fallback}>ok</div>;",
      "}",
    ].join("\n");
    const sink = {
      ...baseSink,
      span: { startLine: 2, startColumn: 22, endLine: 4, endColumn: 28 },
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [sink],
    });
    expect(html).toContain("span-start");
    expect(html).toContain("span-middle");
    expect(html).toContain("span-end");
    expect(html).toContain('data-span-part="start"');
    expect(html).toContain('data-span-part="middle"');
    expect(html).toContain('data-span-part="end"');
    expect(html.match(/data-findings="F1"/g)).toHaveLength(3);
  });

  it("renders representative paths as dense rows with source-peek locations", () => {
    const source = ["export function App() {", "  return <div>{value}</div>;", "}"].join(
      "\n",
    );
    const helperSource = ["export const value = build();", "function build() { return 1; }"].join(
      "\n",
    );
    const sink = {
      ...baseSink,
      line: 2,
      span: { startLine: 2, startColumn: 16, endLine: 2, endColumn: 21 },
      representativeSteps: [
        { kind: "source", label: "build()", file: "src/helper.ts", line: 2 },
        { kind: "alias", label: "value", file: "src/helper.ts", line: 1 },
        { kind: "call", label: "<div>{value}</div>", file: "src/App.tsx", line: 2 },
      ],
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [sink],
      resolveSource: (p) => (p === "src/helper.ts" ? helperSource : source),
    });
    expect(html).toContain('class="path-table"');
    expect(html).toContain("<th>#</th><th>Kind</th><th>Location</th><th>Expression</th>");
    expect(html).toContain('<td class="step-no">1</td>');
    // Cross-file hop → a real link to that file's page (so hops navigate).
    expect(html).toContain(
      'class="xfile" href="/file?path=src%2Fhelper.ts#L2"',
    );
    expect(html).toContain("helper.ts:2 ↗");
    // Same-file hop → a click-to-scroll link, not a context-switching popover.
    expect(html).toContain('class="goto-line" data-line="2"');
    // The path section is open by default (most useful artifact on the panel).
    expect(html).toContain('<details class="path-detail" open>');
  });

  it("maps each finding to its own chunk so adjacent findings are independently clickable", async () => {
    const project = await createFixtureProject({
      "src/Two.tsx": `
        export function Two(props: { a: number; b: number }) {
          return <rect x={props.a + 1} y={props.b + 1} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const sinks = report.rankings.all.filter((s) => s.file === "src/Two.tsx");
    // Each sink carries an exact source span.
    expect(sinks.length).toBeGreaterThanOrEqual(2);
    for (const sink of sinks) {
      expect(sink.span).toBeTruthy();
      expect(sink.span.startColumn).toBeGreaterThan(0);
    }
    const source = await readFile(resolve(project.root, "src/Two.tsx"), "utf8");
    const html = renderCodeMap({ relPath: "src/Two.tsx", source, sinks });
    // The single JSX line yields two separate, independently clickable hits.
    const hits = html.match(/data-findings="[^"]+"/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(new Set(hits).size).toBeGreaterThanOrEqual(2);
  });

  it("emits a copyable debug payload with absolute paths and the full trace", async () => {
    const project = await createFixtureProject(FIXTURE);
    const report = createAnalyzer(project.args).report({ file: ["src/Card.tsx"] });
    const sinks = report.rankings.all.filter((s) => s.file === "src/Card.tsx");
    const source = await readFile(resolve(project.root, "src/Card.tsx"), "utf8");
    const html = renderCodeMap({
      relPath: "src/Card.tsx",
      source,
      sinks,
      meta: report.meta,
    });
    expect(html).toContain("Copy debug info");
    expect(html).toContain('class="debug-payload"');
    // Payload traces back to source: absolute root + absolute file path.
    expect(html).toContain(`analysis root (cwd): ${project.root}`);
    expect(html).toContain(`abs path: ${project.root}/src/Card.tsx`);
    expect(html).toContain("representative path");
    expect(html).toContain("--- JSON ---");
  });

  it("cross-references findings that share identical code", async () => {
    const project = await createFixtureProject({
      "src/Dup.tsx": `
        export function Dup(props: { n: number }) {
          return <g a={props.n / 2} b={props.n / 2} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const sinks = report.rankings.all.filter((s) => s.file === "src/Dup.tsx");
    const source = await readFile(resolve(project.root, "src/Dup.tsx"), "utf8");
    const html = renderCodeMap({ relPath: "src/Dup.tsx", source, sinks });
    // `props.n / 2` appears twice — each finding lists the other.
    expect(html).toContain("Same code");
    expect(html).toContain('class="xref"');
    expect(html).toContain('data-finding="');
    expect(html).toContain('data-findings="');
  });
});

describe("source peek", () => {
  const SRC = ["const a = 1;", "const b = 2;", "const c = 3;", "const d = 4;"].join(
    "\n",
  );

  it("builds a span-only excerpt with the cited line highlighted", () => {
    const html = snippetBlockHtml(SRC, 2, { context: 1 });
    expect(html).toContain('<span class="snip">');
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("<div");
    expect(html).toContain('class="snip-row snip-hit"');
    // context window is lines 1..3, not line 4
    expect(html).toContain("const a = 1;");
    expect(html).toContain("const c = 3;");
    expect(html).not.toContain("const d = 4;");
  });

  it("rewrites path:line references into peek popovers, skipping <pre>", () => {
    const resolve = (p) => (p === "src/x.tsx" ? SRC : null);
    const html =
      "<p>see src/x.tsx:2 here</p><pre><code>src/x.tsx:3</code></pre>";
    const out = peekReferences(html, resolve);
    expect(out).toContain('<span class="peek">');
    expect(out).toContain("src/x.tsx:2");
    // the reference inside <pre> is left untouched
    expect(out).toContain("<pre><code>src/x.tsx:3</code></pre>");
  });

  it("leaves references with no resolvable source as plain text", () => {
    const out = peekReferences("<p>src/missing.tsx:9</p>", () => null);
    expect(out).toBe("<p>src/missing.tsx:9</p>");
  });
});

describe("createServer", () => {
  it("serves the overview and a focused file page", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);

    const home = await call(handler, "/");
    expect(home.status).toBe(200);
    expect(home.body).toContain("/file?path=");
    expect(home.body).toContain("Render-path overview");

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
    const file = await call(
      handler,
      "/file?path=" + encodeURIComponent("src/Chart.tsx"),
    );
    expect(file.status).toBe(200);
    expect(file.body).toContain('id="view-repeated-forks"');
    expect(file.body).toContain("Repeated forks");
    expect(file.body).toContain("props.type");
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
    expect(home.body).toContain('name="q"');
    expect(home.body).toContain('name="filter"');
    expect(home.body).toContain('name="sort"');
    expect(home.body).toContain("src/Card.tsx");
    expect(home.body).toContain("src/Other.tsx");

    const searched = await call(handler, "/?q=Other&sort=file");
    expect(searched.status).toBe(200);
    expect(searched.body).toContain("src/Other.tsx");
    expect(searched.body).not.toContain("src/Card.tsx");
    expect(searched.body).toContain("/?q=Other&amp;sort=findings");
    expect(searched.body).toContain('option value="file" selected');

    const unknownOnly = await call(handler, "/?filter=unknown");
    expect(unknownOnly.status).toBe(200);
    expect(unknownOnly.body).toContain('option value="unknown" selected');
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

  it("renders clickable sort headers with an active caret and a sort-aware heading", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);

    const byBurden = await call(handler, "/");
    expect(byBurden.body).toContain("<h2>Files by burden</h2>");
    expect(byBurden.body).toContain('class="sortable active"');
    expect(byBurden.body).toContain('<span class="caret"');
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
    expect(all.body).not.toContain('aria-label="File result pages">\n  <a class="btn');
    expect(all.body).toContain("src/Big00.tsx");
    expect(all.body).toContain("src/Big29.tsx");
    expect(all.body).toContain("Paginate");
  });

  it("shows a back-to-overview breadcrumb on file and report pages", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);

    const file = await call(
      handler,
      "/file?path=" + encodeURIComponent("src/Card.tsx"),
    );
    expect(file.body).toContain('class="crumbs"');
    expect(file.body).toContain('<a href="/">← Overview</a>');
    // The sidebar title is a home link here too (consistent with the file page).
    expect(file.body).toContain('<h1><a href="/">tsx-dataflow</a></h1>');

    const report = await call(handler, "/report?view=findings");
    expect(report.body).toContain('class="crumbs"');
    expect(report.body).toContain('<a href="/">← Overview</a>');
  });

  it("pre-selects a finding on the file page via ?finding=", async () => {
    const project = await createFixtureProject(FIXTURE);
    const analyzer = createAnalyzer(project.args);
    const report = analyzer.report({ file: ["src/Card.tsx"] });
    const target = report.rankings.all.find((s) => s.file === "src/Card.tsx").id;
    const { handler } = createServer(project.args);
    const file = await call(
      handler,
      "/file?path=" + encodeURIComponent("src/Card.tsx") + "&finding=" + target,
    );
    expect(file.body).toContain('class="panel show-detail"');
    expect(file.body).toContain(`class="finding active" data-finding="${target}"`);
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
    for (const view of REPORT_VIEWS) {
      expect(home.body).toContain(`/report?view=${view}`);
      expect(home.body).toContain(`/api/report.${view}.md`);
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
