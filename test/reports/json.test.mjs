import { describe, expect, it } from "vitest";
import { boundedGraph, selectViewPayload } from "../../src/reports/json.mjs";

describe("JSON report projection", () => {
  it("bounds graph nodes and edges while preserving omitted counts", () => {
    expect(
      boundedGraph(
        {
          nodes: [{ id: "n1" }, { id: "n2" }, { id: "n3" }],
          edges: [{ id: "e1" }, { id: "e2" }],
          unknownEdges: 4,
        },
        1,
      ),
    ).toEqual({
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1" }],
      omittedNodes: 2,
      omittedEdges: 1,
      unknownEdges: 4,
    });
  });

  it("projects overview-specific fields through injected overview helpers", () => {
    const report = baseReport({
      unknownEdges: [{ kind: "unknown-a" }, { kind: "unknown-b" }],
      concentration: { topFileShare: 1 },
    });
    const payload = selectViewPayload(
      report,
      { view: "overview", by: "feature", maxItems: 1 },
      {
        hotspotGroups: (_report, by) => [
          {
            key: by,
            count: 2,
            worst: 0.12345,
            sumBurden: 0.6789,
            maxReach: 3,
            shapes: ["shape-a"],
            ownership: ["owner-a"],
            worstSink: { id: "sink-a" },
          },
        ],
        modalValue: (values) => values[0] ?? "-",
        firstCutFor: (sink) => `first:${sink.id}`,
      },
    );

    expect(payload.hotspots).toEqual([
      {
        key: "feature",
        count: 2,
        worst: 0.123,
        sumBurden: 0.679,
        maxReach: 3,
        dominantShape: "shape-a",
        ownership: "owner-a",
        firstCut: "first:sink-a",
      },
    ]);
    expect(payload.unknownEdges).toEqual([{ kind: "unknown-a" }]);
    expect(payload.concentration).toEqual({ topFileShare: 1 });
  });

  it("projects view-specific arrays only for matching views", () => {
    const report = baseReport({
      contextRelay: [{ id: "relay" }],
      helpers: [{ id: "helper" }],
      packGroups: [{ id: "pack" }],
    });

    expect(
      selectViewPayload(report, { view: "context-relay", maxItems: 1 })
        .contextRelay,
    ).toEqual([{ id: "relay" }]);
    expect(
      selectViewPayload(report, { view: "boundary-report", maxItems: 1 })
        .helpers,
    ).toEqual([{ id: "helper" }]);
    expect(
      selectViewPayload(report, { view: "findings", maxItems: 1 }).packGroups,
    ).toEqual([{ id: "pack" }]);
    expect(
      selectViewPayload(report, { view: "fan-out", maxItems: 1 }).packGroups,
    ).toBeUndefined();
  });
});

function baseReport(overrides = {}) {
  return {
    analysisVersion: 1,
    generatedAt: "2026-06-29T00:00:00.000Z",
    summary: { sinks: 2 },
    rankings: { all: [{ id: "sink-1" }, { id: "sink-2" }] },
    contextRelay: [],
    helpers: [],
    unknownEdges: [],
    packGroups: [],
    concentration: null,
    graph: { nodes: [], edges: [], unknownEdges: 0 },
    baseline: null,
    ...overrides,
  };
}
