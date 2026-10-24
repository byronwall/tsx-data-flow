import { describe, expect, it } from "vitest";
import { DEFAULT_COMPONENT_TOPOLOGY_LAYOUT_SETTINGS, layoutComponentTopology } from "../../src/frontend/src/overview/component-topology-layout";
import type { ComponentTopology } from "../../src/frontend/src/overview/component-topology-types";

const twoComponentTopology: ComponentTopology = {
  nodes: [
    { id: "component-source:route", kind: "component", label: "RouteA", file: "src/routes/a.tsx", line: 2, sourceIdentity: null, routeEntry: true, incomingCount: 0, outgoingCount: 2, depth: 0 },
    { id: "component-source:child", kind: "component", label: "DomainList", file: "src/routes/a.tsx", line: 8, sourceIdentity: null, routeEntry: false, incomingCount: 2, outgoingCount: 0, depth: 1 },
  ],
  edges: [
    { id: "handoff", from: "component-source:route", to: "component-source:child", kind: "handoff", confidence: "proven", count: 1 },
    { id: "renders", from: "component-source:route", to: "component-source:child", kind: "renders", confidence: "proven", count: 1 },
  ],
  totals: { components: 2, contexts: 0, sources: 0, inferredEdges: 0 },
};

describe("component topology layout", () => {
  it("produces deterministic finite positions", () => {
    const topology = twoComponentTopology;
    const first = layoutComponentTopology(topology);
    const second = layoutComponentTopology(topology);
    expect(first.nodes).toEqual(second.nodes);
    expect(first.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    expect(first.nodes.find((node) => node.routeEntry)!.x).toBeLessThan(first.nodes.find((node) => node.label === "DomainList")!.x);
  });

  it("seeds sources at the top left and contexts above their consumers", () => {
    const topology: ComponentTopology = {
      nodes: [topologyNode("source", "source", "Rows", false, 0), topologyNode("route", "component", "Route", true, 1), topologyNode("context", "context", "Domain context", false, 2), topologyNode("consumer", "component", "Consumer", false, 3)],
      edges: [topologyEdge("loads", "source", "route", "loads"), topologyEdge("provides", "route", "context", "provides"), topologyEdge("consumes", "context", "consumer", "consumes")],
      totals: { components: 2, contexts: 1, sources: 1, inferredEdges: 0 },
    };
    const initial = layoutComponentTopology(topology, 1200, 760, { simulationTicks: 0 });
    const source = initial.nodes.find((node) => node.kind === "source")!;
    const context = initial.nodes.find((node) => node.kind === "context")!;
    const consumers = initial.edges.filter((edge) => edge.from === context.id && edge.kind === "consumes").map((edge) => edge.toNode);
    expect(source.x).toBeLessThan(100);
    expect(source.y).toBeLessThan(100);
    expect(context.y).toBeLessThan(100);
    expect(consumers.length).toBeGreaterThan(0);
    expect(consumers.every((consumer) => context.y < consumer.y)).toBe(true);
  });

  it("reports bounded next-tick displacement from the settled layout", () => {
    const topology = twoComponentTopology;
    const current = layoutComponentTopology(topology, 1200, 760, { simulationTicks: 160 });
    for (const force of current.forces) {
      const node = current.nodes.find((item) => item.id === force.id)!;
      expect(force.x).toBeCloseTo(node.x, 8);
      expect(force.y).toBeCloseTo(node.y, 8);
      expect(force.magnitude).toBeLessThanOrEqual(12);
    }
  });

  it("keeps separation bounded and preserves action order before the next tick", () => {
    const topology = twoComponentTopology;
    const base = layoutComponentTopology(topology, 1200, 760, { simulationTicks: 160 });
    const separated = layoutComponentTopology(topology, 1200, 760, { simulationTicks: 160, separationPasses: 1 }, ["separate"]);
    const separatedById = new Map(separated.nodes.map((node) => [node.id, node]));
    for (const node of base.nodes) {
      const after = separatedById.get(node.id)!;
      expect(Math.hypot(after.x - node.x, after.y - node.y)).toBeLessThanOrEqual(12.0000001);
    }
    for (const force of separated.forces) {
      const node = separatedById.get(force.id)!;
      expect(force.x).toBeCloseTo(node.x, 8);
      expect(force.y).toBeCloseTo(node.y, 8);
    }
  });

  it("settles terminal children downstream of their parent", () => {
    const route = {
      id: "route", kind: "component" as const, label: "Route", file: null, line: null,
      routeEntry: true, incomingCount: 0, outgoingCount: 1, depth: 0,
    };
    const parent = {
      id: "parent", kind: "component" as const, label: "Parent", file: null, line: null,
      routeEntry: false, incomingCount: 1, outgoingCount: 4, depth: 1,
    };
    const leaves = Array.from({ length: 4 }, (_, index) => ({
      id: `leaf-${index}`, kind: "component" as const, label: `Leaf${index}`, file: null, line: null,
      routeEntry: false, incomingCount: 1, outgoingCount: 0, depth: 2,
    }));
    const edges = [{
      id: "into-parent", from: route.id, to: parent.id,
      kind: "renders" as const, confidence: "proven" as const, count: 1,
    }, ...leaves.map((leaf, index) => ({
      id: `edge-${index}`, from: parent.id, to: leaf.id,
      kind: "renders" as const, confidence: "proven" as const, count: 1,
    }))];
    const layout = layoutComponentTopology({
      nodes: [route, parent, ...leaves],
      edges,
      totals: { components: 6, contexts: 0, sources: 0, inferredEdges: 0 },
    });
    const laidOutParent = layout.nodes.find((node) => node.id === parent.id)!;
    const laidOutLeaves = layout.nodes.filter((node) => node.id.startsWith("leaf-"));
    expect(laidOutLeaves.every((leaf) => leaf.terminal)).toBe(true);
    expect(laidOutLeaves.every((leaf) => leaf.x > laidOutParent.x && leaf.y > laidOutParent.y)).toBe(true);
    // Springs leave an 8% dead band around the target distance; crowded siblings settle a little past it.
    const tetherLimit = DEFAULT_COMPONENT_TOPOLOGY_LAYOUT_SETTINGS.targetLinkDistance * 1.2;
    expect(laidOutLeaves.every((leaf) => Math.hypot(leaf.x - laidOutParent.x, leaf.y - laidOutParent.y) < tetherLimit)).toBe(true);
    expect(new Set(laidOutLeaves.map((leaf) => `${leaf.x}:${leaf.y}`)).size).toBe(4);
  });

  it("keeps a degree-one terminal strongly tethered to its only parent", () => {
    const nodes = [
      {
        id: "route", kind: "component" as const, label: "Route", file: null, line: null,
        routeEntry: true, incomingCount: 0, outgoingCount: 1, depth: 0,
      },
      {
        id: "parent", kind: "component" as const, label: "Parent", file: null, line: null,
        routeEntry: false, incomingCount: 1, outgoingCount: 1, depth: 1,
      },
      {
        id: "leaf", kind: "component" as const, label: "Surface", file: null, line: null,
        routeEntry: false, incomingCount: 1, outgoingCount: 0, depth: 2,
      },
    ];
    const edges = [
      { id: "route-parent", from: "route", to: "parent", kind: "renders" as const, confidence: "proven" as const, count: 1 },
      { id: "parent-leaf", from: "parent", to: "leaf", kind: "renders" as const, confidence: "proven" as const, count: 1 },
    ];
    const layout = layoutComponentTopology({
      nodes,
      edges,
      totals: { components: 3, contexts: 0, sources: 0, inferredEdges: 0 },
    }, 1200, 760, { targetLinkDistance: 240, fringeStrength: 5 });
    const parent = layout.nodes.find((node) => node.id === "parent")!;
    const leaf = layout.nodes.find((node) => node.id === "leaf")!;

    expect(leaf.terminal).toBe(true);
    // Within the 8% spring dead band around the 240 target, plus settling slack.
    expect(Math.hypot(leaf.x - parent.x, leaf.y - parent.y)).toBeLessThanOrEqual(240 * 1.1);
  });

  it("keeps an exclusively owned subtree attached after the simulation cools", () => {
    const branch = ["route", "parent", "child", "leaf"].map((id, depth) => ({
      id,
      kind: "component" as const,
      label: id,
      file: null,
      line: null,
      routeEntry: id === "route",
      incomingCount: depth === 0 ? 0 : 1,
      outgoingCount: depth === 3 ? 0 : 1,
      depth,
    }));
    const crowd = Array.from({ length: 8 }, (_, index) => ({
      id: `crowd-${index}`,
      kind: "component" as const,
      label: `Crowd${index}`,
      file: null,
      line: null,
      routeEntry: false,
      incomingCount: 1,
      outgoingCount: 0,
      depth: 1,
    }));
    const edges = [
      { id: "route-parent", from: "route", to: "parent", kind: "renders" as const, confidence: "proven" as const, count: 1 },
      { id: "parent-child", from: "parent", to: "child", kind: "renders" as const, confidence: "proven" as const, count: 1 },
      { id: "child-leaf", from: "child", to: "leaf", kind: "renders" as const, confidence: "proven" as const, count: 1 },
      ...crowd.map((node, index) => ({
        id: `crowd-edge-${index}`, from: "route", to: node.id,
        kind: "renders" as const, confidence: "proven" as const, count: 1,
      })),
    ];
    const layout = layoutComponentTopology({
      nodes: [...branch, ...crowd],
      edges,
      totals: { components: 12, contexts: 0, sources: 0, inferredEdges: 0 },
    }, 1200, 760, { simulationTicks: 1000, targetLinkDistance: 64, fringeStrength: 5 });
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));

    for (const [parentId, childId] of [["route", "parent"], ["parent", "child"], ["child", "leaf"]]) {
      const parent = byId.get(parentId)!;
      const child = byId.get(childId)!;
      expect(Math.hypot(child.x - parent.x, child.y - parent.y)).toBeLessThan(150);
    }
  });

  it("uses mark gap as the requested empty clearance between node shapes", () => {
    const nodes = Array.from({ length: 61 }, (_, index) => ({
      id: `node-${index}`,
      kind: "component" as const,
      label: `Node${index}`,
      file: null,
      line: null,
      routeEntry: false,
      incomingCount: 0,
      outgoingCount: 0,
      depth: 0,
    }));
    const topology = {
      nodes,
      edges: [],
      totals: { components: nodes.length, contexts: 0, sources: 0, inferredEdges: 0 },
    };
    const averageNearestDistance = (markGap: number) => {
      const layout = layoutComponentTopology(topology, 1200, 760, {
        simulationTicks: 0,
        separationPasses: 10,
        markGap,
      });
      return layout.nodes.reduce((sum, node) => {
        const nearest = Math.min(...layout.nodes
          .filter((other) => other.id !== node.id)
          .map((other) => Math.hypot(other.x - node.x, other.y - node.y)));
        return sum + nearest;
      }, 0) / layout.nodes.length;
    };

    expect(averageNearestDistance(40)).toBeGreaterThan(averageNearestDistance(0) + 5);
  });

  it("pushes loose near-terminal nodes away from the dense connected neighborhood", () => {
    const route = {
      id: "route", kind: "component" as const, label: "Route", file: null, line: null,
      routeEntry: true, incomingCount: 0, outgoingCount: 1, depth: 0,
    };
    const trunk = ["trunk-a", "trunk-b", "trunk-c"].map((id, index) => ({
      id, kind: "component" as const, label: id, file: null, line: null,
      routeEntry: false, incomingCount: index === 0 ? 1 : 3, outgoingCount: index === 2 ? 6 : 3, depth: index + 1,
    }));
    const branches = Array.from({ length: 6 }, (_, index) => ({
      id: `branch-${index}`, kind: "component" as const, label: `Branch${index}`, file: null, line: null,
      routeEntry: false, incomingCount: 1, outgoingCount: 1, depth: 4,
    }));
    const leaves = branches.map((_, index) => ({
      id: `leaf-${index}`, kind: "component" as const, label: `Leaf${index}`, file: null, line: null,
      routeEntry: false, incomingCount: 1, outgoingCount: 0, depth: 5,
    }));
    const edges = [
      { id: "route-trunk", from: route.id, to: trunk[0].id, kind: "renders" as const, confidence: "proven" as const, count: 1 },
      { id: "trunk-a-b", from: trunk[0].id, to: trunk[1].id, kind: "renders" as const, confidence: "proven" as const, count: 1 },
      { id: "trunk-b-c", from: trunk[1].id, to: trunk[2].id, kind: "renders" as const, confidence: "proven" as const, count: 1 },
      ...branches.map((branch, index) => ({
        id: `branch-edge-${index}`, from: trunk[index % trunk.length].id, to: branch.id,
        kind: "renders" as const, confidence: "proven" as const, count: 1,
      })),
      ...leaves.map((leaf, index) => ({
        id: `leaf-edge-${index}`, from: branches[index].id, to: leaf.id,
        kind: "renders" as const, confidence: "proven" as const, count: 1,
      })),
    ];
    const topology = {
      nodes: [route, ...trunk, ...branches, ...leaves],
      edges,
      totals: { components: 16, contexts: 0, sources: 0, inferredEdges: 0 },
    };
    const withoutFringe = layoutComponentTopology(topology, 1200, 760, { fringeStrength: 0 });
    const withFringe = layoutComponentTopology(topology, 1200, 760, { fringeStrength: 5 });

    const averageFringeDistance = (layout: ReturnType<typeof layoutComponentTopology>) => {
      const trunkNodes = layout.nodes.filter((node) => node.id.startsWith("trunk-"));
      const trunkCenter = {
        x: trunkNodes.reduce((sum, node) => sum + node.x, 0) / trunkNodes.length,
        y: trunkNodes.reduce((sum, node) => sum + node.y, 0) / trunkNodes.length,
      };
      const fringeNodes = layout.nodes.filter((node) => node.id.startsWith("branch-") || node.id.startsWith("leaf-"));
      return fringeNodes.reduce((sum, node) => sum + Math.hypot(node.x - trunkCenter.x, node.y - trunkCenter.y), 0) / fringeNodes.length;
    };

    expect(averageFringeDistance(withFringe)).toBeGreaterThan(averageFringeDistance(withoutFringe) + 8);
  });

  it("places a context hub upstream of its consumers", () => {
    const provider = {
      id: "provider", kind: "component" as const, label: "Provider", file: null, line: null,
      routeEntry: true, incomingCount: 0, outgoingCount: 1, depth: 0,
    };
    const context = {
      id: "context", kind: "context" as const, label: "Data context", file: null, line: null,
      routeEntry: false, incomingCount: 1, outgoingCount: 3, depth: 1,
    };
    const consumers = Array.from({ length: 3 }, (_, index) => ({
      id: `consumer-${index}`, kind: "component" as const, label: `Consumer${index}`, file: null, line: null,
      routeEntry: false, incomingCount: 1, outgoingCount: 1, depth: 2,
    }));
    const leaves = consumers.map((consumer, index) => ({
      id: `leaf-${index}`, kind: "component" as const, label: `Leaf${index}`, file: null, line: null,
      routeEntry: false, incomingCount: 1, outgoingCount: 0, depth: 3,
    }));
    const edges = [
      { id: "provides", from: provider.id, to: context.id, kind: "provides" as const, confidence: "inferred" as const, count: 1 },
      ...consumers.map((consumer, index) => ({ id: `consumes-${index}`, from: context.id, to: consumer.id, kind: "consumes" as const, confidence: "inferred" as const, count: 1 })),
      ...consumers.map((consumer, index) => ({ id: `renders-${index}`, from: consumer.id, to: leaves[index].id, kind: "renders" as const, confidence: "proven" as const, count: 1 })),
    ];
    const layout = layoutComponentTopology({
      nodes: [provider, context, ...consumers, ...leaves],
      edges,
      totals: { components: 7, contexts: 1, sources: 0, inferredEdges: 4 },
    });
    const laidOutContext = layout.nodes.find((node) => node.id === context.id)!;
    const laidOutConsumers = layout.nodes.filter((node) => node.id.startsWith("consumer-"));
    const consumerCenter = {
      x: laidOutConsumers.reduce((sum, node) => sum + node.x, 0) / laidOutConsumers.length,
      y: laidOutConsumers.reduce((sum, node) => sum + node.y, 0) / laidOutConsumers.length,
    };
    expect(laidOutContext.x).toBeGreaterThan(consumerCenter.x);
    expect(laidOutContext.y).toBeLessThan(consumerCenter.y);
    const contextAngle = Math.atan2(-(consumerCenter.y - laidOutContext.y), consumerCenter.x - laidOutContext.x) * 180 / Math.PI;
    expect(contextAngle).toBeGreaterThan(-180);
    expect(contextAngle).toBeLessThan(-90);
    for (const consumer of laidOutConsumers) {
      expect(consumer.x - laidOutContext.x).toBeLessThan(12);
      expect(laidOutContext.y).toBeLessThan(consumer.y);
      const edgeAngle = Math.atan2(-(consumer.y - laidOutContext.y), consumer.x - laidOutContext.x) * 180 / Math.PI;
      expect(edgeAngle).toBeGreaterThan(-180);
      expect(edgeAngle).toBeLessThan(-80);
      const markClearance = laidOutContext.radius * Math.SQRT2 + consumer.radius + 10;
      expect(Math.hypot(consumer.x - laidOutContext.x, consumer.y - laidOutContext.y)).toBeGreaterThan(markClearance);
    }
    for (let leftIndex = 0; leftIndex < layout.nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < layout.nodes.length; rightIndex += 1) {
        const left = layout.nodes[leftIndex];
        const right = layout.nodes[rightIndex];
        const leftExtent = left.kind === "context" ? left.radius * Math.SQRT2 : left.radius;
        const rightExtent = right.kind === "context" ? right.radius * Math.SQRT2 : right.radius;
        expect(Math.hypot(right.x - left.x, right.y - left.y)).toBeGreaterThan(leftExtent + rightExtent + 8);
      }
    }
  });

  it("condenses a settled chain toward the target link distance", () => {
    const nodes = ["route", "middle", "leaf"].map((id, depth) => ({
      id,
      kind: "component" as const,
      label: id,
      file: null,
      line: null,
      routeEntry: id === "route",
      incomingCount: depth === 0 ? 0 : 1,
      outgoingCount: depth === 2 ? 0 : 1,
      depth,
    }));
    const edges = [
      { id: "route-middle", from: "route", to: "middle", kind: "renders" as const, confidence: "proven" as const, count: 1 },
      { id: "middle-leaf", from: "middle", to: "leaf", kind: "renders" as const, confidence: "proven" as const, count: 1 },
    ];
    const layout = layoutComponentTopology({
      nodes,
      edges,
      totals: { components: 3, contexts: 0, sources: 0, inferredEdges: 0 },
    });
    const xValues = layout.nodes.map((node) => node.x);
    const yValues = layout.nodes.map((node) => node.y);
    expect(Math.max(...xValues) - Math.min(...xValues)).toBeLessThan(320);
    expect(Math.max(...yValues) - Math.min(...yValues)).toBeLessThan(320);
    for (const edge of layout.edges) {
      const angle = Math.atan2(-(edge.toNode.y - edge.fromNode.y), edge.toNode.x - edge.fromNode.x) * 180 / Math.PI;
      expect(angle).toBeGreaterThan(-90);
      expect(angle).toBeLessThan(0);
    }
    expect(layout.width).toBeGreaterThanOrEqual(1200);
  });

  it("treats a node with only hidden downstream references as a visible terminal", () => {
    const topology: ComponentTopology = {
      nodes: [
        { id: "route", kind: "component", label: "Route", file: null, line: null, routeEntry: true, incomingCount: 0, outgoingCount: 1, depth: 0 },
        { id: "layer", kind: "component", label: "Layer", file: null, line: null, routeEntry: false, incomingCount: 1, outgoingCount: 3, depth: 1 },
      ],
      edges: [{ id: "visible", from: "route", to: "layer", kind: "renders", confidence: "proven", count: 1 }],
      totals: { components: 2, contexts: 0, sources: 0, inferredEdges: 0 },
    };
    expect(layoutComponentTopology(topology).nodes.find((node) => node.id === "layer")?.terminal).toBe(true);
  });

});

function topologyNode(id: string, kind: ComponentTopology["nodes"][number]["kind"], label: string, routeEntry: boolean, depth: number) { return { id, kind, label, file: null, line: null, routeEntry, incomingCount: 1, outgoingCount: 1, depth }; }
function topologyEdge(id: string, from: string, to: string, kind: ComponentTopology["edges"][number]["kind"]) { return { id, from, to, kind, confidence: "proven" as const, count: 1 }; }
