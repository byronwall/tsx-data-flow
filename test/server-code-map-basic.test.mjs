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
    const report = createAnalyzer(project.args).report({
      file: ["src/Card.tsx"],
    });
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
    const report = createAnalyzer(project.args).report({
      file: ["src/Card.tsx"],
    });
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
    const source = [
      "export function App() {",
      "  return <div>{value}</div>;",
      "}",
    ].join("\n");
    const helperSource = [
      "export const value = build();",
      "function build() { return 1; }",
    ].join("\n");
    const sink = {
      ...baseSink,
      line: 2,
      span: { startLine: 2, startColumn: 16, endLine: 2, endColumn: 21 },
      representativeSteps: [
        { kind: "source", label: "build()", file: "src/helper.ts", line: 2 },
        { kind: "alias", label: "value", file: "src/helper.ts", line: 1 },
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
      resolveSource: (p) => (p === "src/helper.ts" ? helperSource : source),
    });
    expect(html).toContain('class="path-table"');
    // STEP-3: Expression sits ahead of the (taller) Location column, not buried
    // in the far-right narrow slot.
    expect(html).toContain(
      "<th>#</th><th>Kind</th><th>Expression</th><th>Location</th>",
    );
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
    const report = createAnalyzer(project.args).report({
      file: ["src/Card.tsx"],
    });
    const sinks = report.rankings.all.filter((s) => s.file === "src/Card.tsx");
    const source = await readFile(
      resolve(project.root, "src/Card.tsx"),
      "utf8",
    );
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

  it("collapses consecutive same-expression path steps into a range (STEP-1)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const sink = {
      ...baseSink,
      line: 2,
      representativeSteps: [
        { kind: "source", label: "props", file: "src/App.tsx", line: 1 },
        {
          kind: "property-read",
          label: "props.metadata.relationship",
          file: "src/App.tsx",
          line: 5,
        },
        {
          kind: "property-read",
          label: "props.metadata.relationship",
          file: "src/App.tsx",
          line: 5,
        },
        {
          kind: "property-read",
          label: "props.metadata.relationship",
          file: "src/App.tsx",
          line: 5,
        },
      ],
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [sink],
    });
    // Three identical hops on line 5 collapse into one "2–4" row with a ×3 count.
    expect(html).toContain('<td class="step-no">2–4</td>');
    expect(html).toContain("×3");
    // The summary reports both the raw step count and the collapsed op count.
    expect(html).toContain("4 steps · 2 ops");
  });
});
