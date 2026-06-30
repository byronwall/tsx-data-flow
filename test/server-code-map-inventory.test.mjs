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
  it("numbers fork sites like path steps (FORK-1)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const fork = {
      id: "FK1",
      file: "src/App.tsx",
      line: 2,
      discriminant: "t().type",
      branchValues: ["a", "b"],
      sites: [
        { line: 2, kind: "switch-match", snippet: 't().type === "a"' },
        { line: 3, kind: "switch-match", snippet: 't().type === "b"' },
      ],
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [],
      forks: [fork],
    });
    expect(html).toContain("site-list");
    expect(html).toContain('<span class="site-no">1</span>');
    expect(html).toContain('<span class="site-no">2</span>');
  });

  it("promotes ALL reached helpers, coloring junctions vs benign boundaries (ARCH-2)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const helpers = [
      {
        name: "getAskedBy",
        file: "src/App.tsx",
        line: 1,
        verdict: "confluence / junction",
        inSources: 3,
        callerCount: 2,
        callers: [],
        params: [],
      },
      {
        name: "toLabel",
        file: "src/App.tsx",
        line: 2,
        verdict: "thin pass-through (inline)",
        inSources: 1,
        callerCount: 5,
        callers: [],
        params: [],
      },
    ];
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [],
      helpers,
    });
    // Both the strict junction AND the benign boundary are promoted into the list.
    expect(html).toContain('data-type="junction"');
    expect(html).toContain('data-type="boundary"');
    // Junctions/problems are hot (hue 25); benign boundaries are calm (hue 205).
    expect(html).toContain("--bt:25");
    expect(html).toContain("--bt:205");
    // Filter chip pluralizes "boundary" correctly.
    expect(html).toContain("boundaries 1");
  });

  it("makes the inbound-source count a click-to-reveal popover (DRILL-1)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const helpers = [
      {
        name: "merge",
        file: "src/App.tsx",
        line: 1,
        verdict: "confluence / junction",
        inSources: 3,
        callerCount: 2,
        inRoots: ["props.a", "state.b", "ctx.c"],
        callers: [{ file: "src/Other.tsx", line: 9 }],
        params: [],
      },
    ];
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [],
      helpers,
    });
    // The count is a peek trigger, with the members revealed in the popover.
    expect(html).toContain('class="peek-label">3 inbound source(s)');
    expect(html).toContain('class="peek-pop">');
    expect(html).toContain("props.a");
    // The term is glossed, not just named.
    expect(html).toContain("independent source");
    // The caller count reveals the distributary (a clickable cross-file link).
    expect(html).toContain('class="peek-label">2 caller(s)');
    expect(html).toContain("Other.tsx:9");
  });

  it("sorts the inventory by score (worst first) and offers a sort control (SORT-1)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const hi = { ...baseSink, id: "HI", line: 1, scores: { burden: 0.8 } };
    const lo = { ...baseSink, id: "LO", line: 2, scores: { burden: 0.1 } };
    // Pass low-burden first to prove the default sort reorders by score, not input.
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [lo, hi],
    });
    expect(html).toContain('class="esort active" data-sort="score"');
    expect(html).toContain("data-sort-score=");
    const order = [
      ...html.matchAll(/class="finding-row" data-finding="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(order.indexOf("HI")).toBeLessThan(order.indexOf("LO"));
  });

  it("renders the sort control as a segmented group with an aligned label (HEAD-2/HEAD-3)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const hi = { ...baseSink, id: "HI", line: 1, scores: { burden: 0.8 } };
    const lo = { ...baseSink, id: "LO", line: 2, scores: { burden: 0.1 } };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [lo, hi],
    });
    expect(html).toContain('class="entry-sort-label"');
    expect(html).toContain('<div class="seg"');
    expect(html).toContain('class="esort active" data-sort="score"');
  });

  it("pins the list header (count/filter/sort) so it stays visible (HEAD-4)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [baseSink],
    });
    expect(html).toContain('class="finding-list-head"');
  });

  it("collapses consecutive same-line path steps and shows the snippet once (STEP-2)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    // Three steps on the SAME line (different kinds) must merge into one row.
    const sink = {
      ...baseSink,
      representativeSteps: [
        { kind: "source", label: "build()", file: "src/App.tsx", line: 1 },
        {
          kind: "property-read",
          label: "build().x",
          file: "src/App.tsx",
          line: 1,
        },
        { kind: "call", label: "build().x()", file: "src/App.tsx", line: 1 },
        { kind: "call", label: "<div>{v}</div>", file: "src/App.tsx", line: 2 },
      ],
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [sink],
    });
    // The run 1–3 collapses to a single ordinal range with a ×3 repeat marker.
    expect(html).toContain('<td class="step-no">1–3</td>');
    expect(html).toContain("×3");
    // The distinct kinds on the line are listed (not a vague "ops").
    expect(html).toContain("source · read · call");
  });

  it("emphasizes branch-exclusive computations with an amber accent class (FORK-2)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const fork = {
      id: "FORK-1",
      file: "src/App.tsx",
      line: 1,
      discriminant: "props.type",
      branchValues: ["a", "b"],
      sites: [{ line: 1, kind: "ternary", value: "x" }],
      branchExclusive: [{ line: 2, name: "barData", branch: "bar" }],
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [],
      forks: [fork],
    });
    expect(html).toContain('class="why branch-exclusive"');
  });

  it("dims comments but not // inside strings (COMMENT-1)", () => {
    const source = [
      "const x = 1; // trailing note",
      "/* block */ const y = 2;",
      'const u = "http://example.com";',
    ].join("\n");
    const html = renderCodeMap({ relPath: "src/App.tsx", source, sinks: [] });
    expect(html).toContain('<span class="cmt">// trailing note</span>');
    expect(html).toContain('<span class="cmt">/* block */</span>');
    // The // inside the URL string is NOT treated as a comment.
    expect(html).not.toContain('<span class="cmt">// example.com');
  });

  it("shows a human alias under the finding id (TITLE-1)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [baseSink],
    });
    expect(html).toContain('class="finding-alias"');
    expect(html).toContain("render-path data-flow hotspot");
  });
});
