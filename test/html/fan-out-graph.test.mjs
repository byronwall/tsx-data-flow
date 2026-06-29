import { describe, expect, it } from "vitest";
import { fanOutGraphSvg } from "../../src/html/code-map.mjs";

describe("fanOutGraphSvg (GRAPH-COLOR-1 / GRAPH-GROUP-1)", () => {
  const row = {
    root: "props.user",
    kind: "property-read",
    sinkCount: 5,
    fileCount: 2,
    maxDepth: 4,
    graphSinks: [
      { id: "S1", file: "src/App.tsx", line: 2, label: "div / text" },
      { id: "S2", file: "src/App.tsx", line: 9, label: "span / title" },
      { id: "S3", file: "src/Card.tsx", line: 7, label: "div / class" },
    ],
  };

  it("groups sinks by file (filename once) and draws no '+N more' cap node", () => {
    const svg = fanOutGraphSvg(row, null);
    expect(svg).toContain('class="fanout-graph"');
    expect(svg).toContain("<svg");
    // Each file's name appears once as a band header + once as a legend key, not
    // once per sink (GRAPH-GROUP-1). `>name<` matches visible text, not the
    // url-encoded href on each sink link.
    expect(svg.match(/>App\.tsx</g).length).toBe(2);
    expect(svg.match(/>Card\.tsx</g).length).toBe(2);
    // No caps / "+N more" overflow node anymore (round 6: render them all).
    expect(svg).not.toContain("more sink(s)");
    // Leaves carry just the :line, not a repeated filename prefix.
    expect(svg).toContain(":2 div / text");
  });

  it("gives each file a distinct color (GRAPH-COLOR-1)", () => {
    const svg = fanOutGraphSvg(row, null);
    const hues = [...svg.matchAll(/hsl\((\d+) /g)].map((m) => m[1]);
    const fileHues = new Set(hues.filter((h) => h !== "205")); // 205 = source node
    // two files -> two distinct hues
    expect(fileHues.size).toBeGreaterThanOrEqual(2);
  });

  it("links cross-file sinks to their file and selects in-file sinks", () => {
    // relPath null -> every sink is cross-file (overview use): all open by href.
    const overview = fanOutGraphSvg(row, null);
    expect(overview).toContain('href="/file?path=src%2FApp.tsx#L2"');
    expect(overview).not.toContain('class="xref"');
    // relPath set -> in-file sinks select on the code map instead.
    const scoped = fanOutGraphSvg(row, "src/App.tsx");
    expect(scoped).toContain('class="xref" data-finding="S1"');
  });

  it("draws one edge per file band, shows per-sink depth, and links the source to its definition (round 7)", () => {
    const r = {
      root: "useThing",
      kind: "import",
      sinkCount: 3,
      fileCount: 2,
      maxDepth: 4,
      def: { file: "src/hooks/useThing.ts", line: 5 },
      graphSinks: [
        {
          id: "S1",
          file: "src/App.tsx",
          line: 2,
          label: "div / text",
          depth: 3,
        },
        {
          id: "S2",
          file: "src/App.tsx",
          line: 9,
          label: "span / title",
          depth: 4,
        },
        {
          id: "S3",
          file: "src/Card.tsx",
          line: 7,
          label: "div / class",
          depth: 1,
        },
      ],
    };
    const svg = fanOutGraphSvg(r, null);
    // FANOUT-EDGE-1: one edge per FILE band (2 files), not one per sink (3 sinks).
    expect((svg.match(/<path d="M/g) ?? []).length).toBe(2);
    // FANOUT-DEPTH-1: each leaf carries its own depth.
    expect(svg).toContain("· d3");
    expect(svg).toContain("· d4");
    // FANOUT-DEF-1: the source node links to its DEFINITION, not a usage.
    expect(svg).toContain('href="/file?path=src%2Fhooks%2FuseThing.ts#L5"');
  });

  it("links a single-file fan-out's source to the one file when no definition resolved", () => {
    const r = {
      root: "X › props.isOpen",
      kind: "prop-read",
      sinkCount: 2,
      fileCount: 1,
      maxDepth: 2,
      def: null,
      graphSinks: [
        { id: "A", file: "src/X.tsx", line: 3, label: "Show / when", depth: 2 },
        { id: "B", file: "src/X.tsx", line: 8, label: "div", depth: 1 },
      ],
    };
    expect(fanOutGraphSvg(r, null)).toContain('href="/file?path=src%2FX.tsx"');
  });
});
