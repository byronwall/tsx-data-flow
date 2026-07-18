import { describe, expect, it } from "vitest";
import type { RouteDataDetail } from "../../src/api/contracts";
import { projectTrajectoryGraph, rankComplexTrajectories } from "../../src/frontend/src/overview/route-flow-path-model";
import { layoutRouteFlowGraph } from "../../src/frontend/src/overview/route-flow-graph-model";

type Graph = RouteDataDetail["exhaustiveGraph"];

const graph = {
  nodes: ["a", "b", "c", "d"].map((key, index) => ({ key, label: key, snippet: `use(${key})`, kind: "source", file: null, line: null, pathCount: 1, minimumDepth: index, component: index < 2 ? "Parent" : "Child", components: [index < 2 ? "Parent" : "Child"] })),
  edges: [
    { key: "ab", from: "a", to: "b", kind: "read", unknown: false, pathCount: 1 },
    { key: "bc", from: "b", to: "c", kind: "component-prop", unknown: false, pathCount: 1 },
    { key: "cd", from: "c", to: "d", kind: "render", unknown: false, pathCount: 1 },
    { key: "ac", from: "a", to: "c", kind: "unrelated", unknown: false, pathCount: 1 },
  ],
  trajectories: [
    { key: "short", sinkId: "s1", terminalLabel: "short", stepKeys: ["a", "c"], stepComponents: ["Parent", "Child"], substitutionStepCount: 0, completeness: "complete-for-supported-scope" },
    { key: "complex", sinkId: "s2", terminalLabel: "complex", stepKeys: ["a", "b", "c", "d"], stepComponents: ["Parent", "Parent", "Child", "Child"], substitutionStepCount: 2, completeness: "partial" },
  ],
  totals: { sinks: 2, trajectories: 2, nodes: 4, edges: 4, components: 2, unknownTrajectories: 1 },
  truncated: false, cycleCount: 0, pathBudget: 100_000,
} satisfies Graph;

describe("route flow path projection", () => {
  it("ranks the longest, most transformation-heavy paths first", () => {
    expect(rankComplexTrajectories(graph.trajectories).map((item) => item.key)).toEqual(["complex", "short"]);
  });

  it("retains only selected path nodes and consecutive path edges", () => {
    const focused = projectTrajectoryGraph(graph, "complex");
    expect(focused.nodes.map((node) => node.key)).toEqual(["a", "b", "c", "d"]);
    expect(focused.edges.map((edge) => edge.key)).toEqual(["ab", "bc", "cd"]);
    expect(focused.totals).toMatchObject({ trajectories: 1, nodes: 4, edges: 3, components: 2, unknownTrajectories: 1 });
    expect(focused.nodes.every((node) => node.pathCount === 1)).toBe(true);
    expect(focused.nodes.map((node) => node.component)).toEqual(["Parent", "Parent", "Child", "Child"]);
    expect(focused.edges.every((edge) => edge.pathCount === 1)).toBe(true);
    const layout = layoutRouteFlowGraph(focused, true);
    expect(layout.width).toBe(900);
    expect(layout.nodes).toHaveLength(4);
  });
});
