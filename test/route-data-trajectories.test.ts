import { describe, expect, it } from "vitest";
import { buildExhaustiveRouteGraph } from "../src/analysis/route-data-trajectories";
import type { GraphEdge, GraphNode, Sink } from "../src/types";

describe("exhaustive route trajectory assembly", () => {
  it("enumerates every graph path to a sink and merges shared nodes and edges", () => {
    const nodes: GraphNode[] = [
      { id: "a", kind: "source", label: "source A", file: "src/data.ts", location: { line: 1, column: 1 } },
      { id: "b", kind: "source", label: "source B", file: "src/data.ts", location: { line: 2, column: 1 } },
      { id: "c", kind: "call", label: "normalize", file: "src/data.ts", location: { line: 4, column: 1 } },
      { id: "d", kind: "jsx-child", label: "title", file: "src/View.tsx", location: { line: 8, column: 1 }, terminalId: "sink:1" },
    ];
    const edges: GraphEdge[] = [edge("a", "c", "read"), edge("b", "c", "read"), edge("c", "d", "render")];
    const sink = { id: "sink:1", nodeId: "d", label: "title" } as Sink;
    const result = buildExhaustiveRouteGraph({ nodes, edges, unknownEdges: 0 }, [sink]);
    expect(result.totals).toMatchObject({ sinks: 1, trajectories: 2, nodes: 4, edges: 3 });
    expect(result.trajectories.map((item) => item.stepKeys.length)).toEqual([3, 3]);
    expect(result.nodes.find((node) => node.label === "normalize")?.pathCount).toBe(2);
    expect(result.edges.find((item) => item.kind === "render")?.pathCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("joins a component prop assignment to the matching child prop read", () => {
    const nodes: GraphNode[] = [
      { id: "source", kind: "source", label: "board.description", file: "src/BoardHeader.tsx", location: { line: 8, column: 1 } },
      { id: "assignment", kind: "jsx-sink", label: "boardDescription={...}", file: "src/BoardHeader.tsx", location: { line: 9, column: 1 }, terminalId: "assignment" },
      { id: "props", kind: "parameter", label: "props", file: "src/MobileBoardInspectorDrawer.tsx", location: { line: 2, column: 1 } },
      { id: "read", kind: "property-read", label: "boardDescription", file: "src/MobileBoardInspectorDrawer.tsx", location: { line: 12, column: 1 } },
      { id: "render", kind: "jsx-sink", label: "JSX props.boardDescription", file: "src/MobileBoardInspectorDrawer.tsx", location: { line: 12, column: 1 }, terminalId: "render" },
    ];
    const edges: GraphEdge[] = [edge("source", "assignment", "jsx-sink"), edge("props", "read", "property-read"), edge("read", "render", "jsx-sink")];
    const producer = { id: "producer", nodeId: "assignment", label: "boardDescription={...}", renderContext: { tag: "MobileBoardInspectorDrawer", attribute: "boardDescription", component: "BoardHeader" } } as Sink;
    const consumer = { id: "consumer", nodeId: "render", label: "JSX props.boardDescription", renderContext: { tag: "p", attribute: null, component: "MobileBoardInspectorDrawer" } } as Sink;

    const result = buildExhaustiveRouteGraph({ nodes, edges, unknownEdges: 0 }, [producer, consumer]);

    expect(result.totals.trajectories).toBe(1);
    expect(result.nodes.map((node) => node.label)).toEqual(["board.description", "boardDescription={...}", "props.boardDescription", "JSX props.boardDescription"]);
    expect(result.nodes.find((node) => node.label === "props")).toBeUndefined();
    expect(result.edges.map((item) => item.kind)).toContain("component-prop");
    expect(result.trajectories[0].stepKeys).toHaveLength(4);
  });

  it("keeps every handoff in a multi-component prop relay", () => {
    const nodes: GraphNode[] = [
      { id: "source", kind: "source", label: "board.description", file: "src/Parent.tsx", location: { line: 1, column: 1 } },
      { id: "to-middle", kind: "jsx-sink", label: "description={...}", file: "src/Parent.tsx", location: { line: 2, column: 1 }, terminalId: "to-middle" },
      { id: "middle-props", kind: "parameter", label: "props", file: "src/Middle.tsx", location: { line: 1, column: 1 } },
      { id: "middle-read", kind: "property-read", label: "description", file: "src/Middle.tsx", location: { line: 3, column: 1 } },
      { id: "to-leaf", kind: "jsx-sink", label: "description={...}", file: "src/Middle.tsx", location: { line: 3, column: 1 }, terminalId: "to-leaf" },
      { id: "leaf-props", kind: "parameter", label: "props", file: "src/Leaf.tsx", location: { line: 1, column: 1 } },
      { id: "leaf-read", kind: "property-read", label: "description", file: "src/Leaf.tsx", location: { line: 4, column: 1 } },
      { id: "render", kind: "jsx-sink", label: "JSX props.description", file: "src/Leaf.tsx", location: { line: 4, column: 1 }, terminalId: "render" },
    ];
    const edges = [edge("source", "to-middle", "jsx-sink"), edge("middle-props", "middle-read", "property-read"), edge("middle-read", "to-leaf", "jsx-sink"), edge("leaf-props", "leaf-read", "property-read"), edge("leaf-read", "render", "jsx-sink")];
    const sinks = [
      { id: "parent", nodeId: "to-middle", label: "description={...}", renderContext: { tag: "Middle", attribute: "description", component: "Parent" } },
      { id: "middle", nodeId: "to-leaf", label: "description={...}", renderContext: { tag: "Leaf", attribute: "description", component: "Middle" } },
      { id: "leaf", nodeId: "render", label: "JSX props.description", renderContext: { tag: "p", attribute: null, component: "Leaf" } },
    ] as Sink[];

    const result = buildExhaustiveRouteGraph({ nodes, edges, unknownEdges: 0 }, sinks);

    expect(result.totals.trajectories).toBe(1);
    expect(result.edges.filter((item) => item.kind === "component-prop")).toHaveLength(2);
    expect(result.trajectories[0].stepKeys).toHaveLength(6);
    expect(result.nodes.filter((node) => node.label === "props.description")).toHaveLength(2);
  });

  it("keeps cross-path evidence in a concrete primary component", () => {
    const nodes: GraphNode[] = [
      { id: "shared", kind: "literal", label: "undefined", file: "src/shared.tsx", location: { line: 1, column: 1 } },
      { id: "alpha", kind: "jsx-sink", label: "alpha", file: "src/Alpha.tsx", location: { line: 2, column: 1 }, terminalId: "alpha" },
      { id: "beta", kind: "jsx-sink", label: "beta", file: "src/Beta.tsx", location: { line: 2, column: 1 }, terminalId: "beta" },
    ];
    const sinks = [
      { id: "alpha", nodeId: "alpha", label: "alpha", renderContext: { tag: "div", attribute: null, component: "Alpha" } },
      { id: "beta", nodeId: "beta", label: "beta", renderContext: { tag: "div", attribute: null, component: "Beta" } },
    ] as Sink[];
    const result = buildExhaustiveRouteGraph({ nodes, edges: [edge("shared", "alpha", "jsx-sink"), edge("shared", "beta", "jsx-sink")], unknownEdges: 0 }, sinks);
    const shared = result.nodes.find((node) => node.label === "undefined")!;

    expect(shared.component).toBe("Alpha");
    expect(shared.components).toEqual(["Alpha", "Beta"]);
    expect(result.nodes.some((node) => node.component.startsWith("Shared across"))).toBe(false);
    expect(result.trajectories.map((trajectory) => trajectory.stepComponents)).toEqual([["Alpha", "Alpha"], ["Beta", "Beta"]]);
  });
});
function edge(from: string, to: string, kind: string): GraphEdge { return { id: `${from}-${to}`, from, to, kind, unknown: false, location: null }; }
