import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeProject, createAnalyzer, parseArgs } from "../src/core.mjs";
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
    expect(html).toContain('class="finding active"');
    expect(html).toContain("Why selected");
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

  it("returns 404 for unknown routes and 400 for /file without path", async () => {
    const project = await createFixtureProject(FIXTURE);
    const { handler } = createServer(project.args);
    expect((await call(handler, "/nope")).status).toBe(404);
    expect((await call(handler, "/file")).status).toBe(400);
    expect((await call(handler, "/healthz")).status).toBe(200);
  });
});
