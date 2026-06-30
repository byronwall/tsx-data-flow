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
  it("promotes unknown edges, relays, and fan-out into the list (ARCH-2)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [],
      unknownEdges: [
        {
          id: "U1",
          file: "src/App.tsx",
          line: 2,
          kind: "call",
          label: "fetchThing",
          occurrences: 4,
          affectedSinks: [],
        },
      ],
      relays: [
        {
          parentFile: "src/App.tsx",
          line: 1,
          childComponent: "Card",
          childFile: "src/Card.tsx",
          props: ["a", "b", "c"],
          sharedProps: ["theme"],
          contextHooks: ["useTheme"],
          score: 6,
          signal: "shared bundle",
        },
      ],
      fanOut: [
        {
          root: "props.user",
          kind: "property-read",
          sinkCount: 5,
          fileCount: 2,
          line: 1,
          maxDepth: 4,
          sinks: [],
          graphSinks: [
            { id: "S1", file: "src/App.tsx", line: 2, label: "div / text" },
            { id: "S2", file: "src/Card.tsx", line: 7, label: "span / title" },
          ],
        },
      ],
    });
    // source-boundaries removed round-5 (folded away); the rest stay first-class.
    expect(html).not.toContain('data-entry-type="source"');
    expect(html).toContain('data-entry-type="unknown"');
    expect(html).toContain('data-entry-type="relay"');
    expect(html).toContain('data-entry-type="fan-out"');
    // Each gets a filter chip and a typed badge.
    expect(html).toContain('data-filter="fan-out"');
    expect(html).toContain('class="badge q-relay"');
    // The fan-out headline reports its cross-file reach.
    expect(html).toContain("feeds 5 sink(s)");
    // HOME-2: the per-file panel collapses — no in-file SVG — and links up to the
    // full fan-out graph on the overview (which now owns the cross-file picture).
    expect(html).not.toContain('class="fanout-graph"');
    expect(html).toContain(`/#${fanOutAnchor("props.user")}`);
    expect(html).toContain("See the full fan-out graph on the overview");
    // RELAY-1: the in-scope context hook is surfaced in the relay accent.
    expect(html).toContain('ul class="why relay-context"');
  });

  it("renders the burden breakdown as always-visible inline pills (BURDEN-1)", () => {
    const sink = {
      ...baseSink,
      id: "BD",
      line: 1,
      scores: {
        burden: 0.5,
        burdenBreakdown: {
          total: 0.5,
          rawSum: 0.5,
          backgroundPenalty: 1,
          terms: [
            { label: "path depth", weight: 0.15, raw: 5, contribution: 0.3 },
            { label: "helper hops", weight: 0.13, raw: 3, contribution: 0.2 },
          ],
        },
      },
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source: "const x = 1;",
      sinks: [sink],
    });
    // No click-to-expand, no full-width bars — pills shown inline.
    expect(html).not.toContain("burden-detail");
    expect(html).not.toContain('class="bd-bar"');
    expect(html).not.toContain('class="bd-fill"');
    expect(html).toContain('class="burden-row"');
    expect(html).toContain('ul class="bd-pills"');
    expect(html).toContain("burden breakdown — 0.500 from 2 metrics");
    expect(html).toContain("path depth");
  });

  it("offers a merge-width (sources) sort and a defended facet filter (ARCH-2 C)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const wide = {
      ...baseSink,
      id: "WIDE",
      line: 1,
      metrics: { mergeWidth: 5 },
      defenses: [
        { expression: "x ?? y", verdict: "possible", location: { line: 1 } },
      ],
    };
    const narrow = {
      ...baseSink,
      id: "NARROW",
      line: 2,
      metrics: { mergeWidth: 1 },
      defenses: [],
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [narrow, wide],
    });
    expect(html).toContain('data-sort="sources"');
    expect(html).toContain('data-sort-sources="5"');
    expect(html).toContain('data-filter="defended"');
    // The defended finding carries the facet marker; the plain one does not.
    expect(html).toMatch(/data-has-defenses="1"[^>]*>[\s\S]*WIDE/);
  });

  it("surfaces a per-file hotspots/path-census stats line (ARCH-2 D)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const s1 = {
      ...baseSink,
      id: "A",
      line: 1,
      scores: { burden: 0.6 },
      metrics: { maximumPathDepth: 12 },
    };
    const s2 = {
      ...baseSink,
      id: "B",
      line: 2,
      scores: { burden: 0.2 },
      metrics: { maximumPathDepth: 4 },
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [s1, s2],
    });
    expect(html).toContain('class="file-stats meta"');
    expect(html).toContain("worst 0.60");
    expect(html).toContain("path depth max 12");
  });

  it("explains the Defenses count vs. listed guard sites (DEF-4)", () => {
    const source = [
      "export function App() {",
      "  return <div>{v}</div>;",
      "}",
    ].join("\n");
    const sink = {
      ...baseSink,
      metrics: { actionableDefensiveOperationCount: 6 },
      defenses: [
        {
          expression: "a ?? b",
          verdict: "possible",
          type: "??",
          location: { line: 2 },
        },
      ],
    };
    const html = renderCodeMap({
      relPath: "src/App.tsx",
      source,
      sinks: [sink],
    });
    expect(html).toContain("Defenses — 1");
    expect(html).toContain("6 defensive operations across all paths");
  });
});
