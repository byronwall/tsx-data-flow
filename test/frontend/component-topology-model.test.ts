import { describe, expect, it } from "vitest";
import type { RouteDataDetail } from "../../src/api/contracts";
import { layoutComponentTopology } from "../../src/frontend/src/overview/component-topology-layout";
import { buildComponentTopology, componentTopologySelectionFocus, projectVisibleComponentTopology, summarizeSharedComponentHubs, type ComponentTopology } from "../../src/frontend/src/overview/component-topology-model";

const detail = {
  route: { componentNames: ["RouteA"], file: "src/routes/a.tsx" },
  context: {
    nodes: [
      { id: "source", kind: "source", label: "domain rows", file: "src/data.ts", line: 4, role: "persistence" },
      { id: "route", kind: "component", label: "RouteA", file: "src/routes/a.tsx", line: 2, role: "route" },
      { id: "child", kind: "component", label: "DomainList", file: "src/routes/a.tsx", line: 8, role: "component" },
    ],
    edges: [
      { id: "loads", from: "source", to: "route", kind: "data" },
      { id: "renders", from: "route", to: "child", kind: "component" },
    ],
  },
  exhaustiveGraph: {
    nodes: [
      { key: "provider", label: "DomainContext.Provider", snippet: "<DomainContext.Provider>", file: "src/routes/a.tsx", line: 5, components: ["RouteA"] },
      { key: "consumer", label: "useDomain()", snippet: "const domain = useDomain()", file: "src/DomainList.tsx", line: 3, components: ["DomainList"] },
    ],
    trajectories: [
      { stepComponents: ["RouteA", "RouteA", "DomainList", "DomainList"] },
    ],
  },
} as unknown as RouteDataDetail;

describe("component topology projection", () => {
  it("collapses retained paths to components without inventing source or context fallbacks", () => {
    const topology = buildComponentTopology(detail);
    expect(topology.nodes.map((node) => node.label)).toEqual(["RouteA", "DomainList"]);
    expect(topology.edges.map((edge) => `${edge.kind}:${edge.from}->${edge.to}`)).toEqual(expect.arrayContaining([
      "handoff:component:routea->component:domainlist",
      "renders:component:routea->component:domainlist",
    ]));
    expect(topology.totals).toEqual({ components: 2, contexts: 0, sources: 0, inferredEdges: 0 });
  });

  it("produces deterministic finite positions", () => {
    const topology = buildComponentTopology(detail);
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

  it("reports the exact next-tick displacement without replaying a different schedule", () => {
    const topology = buildComponentTopology(detail);
    const current = layoutComponentTopology(topology, 1200, 760, { simulationTicks: 160 });
    const next = layoutComponentTopology(topology, 1200, 760, { simulationTicks: 161 });
    const nextById = new Map(next.nodes.map((node) => [node.id, node]));
    for (const force of current.forces) {
      const node = current.nodes.find((item) => item.id === force.id)!;
      const nextNode = nextById.get(force.id)!;
      expect(nextNode.x - node.x).toBeCloseTo(force.dx, 8);
      expect(nextNode.y - node.y).toBeCloseTo(force.dy, 8);
      expect(force.magnitude).toBeLessThanOrEqual(12);
    }
  });

  it("keeps separation bounded and preserves action order before the next tick", () => {
    const topology = buildComponentTopology(detail);
    const base = layoutComponentTopology(topology, 1200, 760, { simulationTicks: 160 });
    const separated = layoutComponentTopology(topology, 1200, 760, { simulationTicks: 160, separationPasses: 1 }, ["separate"]);
    const separatedById = new Map(separated.nodes.map((node) => [node.id, node]));
    for (const node of base.nodes) {
      const after = separatedById.get(node.id)!;
      expect(Math.hypot(after.x - node.x, after.y - node.y)).toBeLessThanOrEqual(12.0000001);
    }
    const next = layoutComponentTopology(topology, 1200, 760, { simulationTicks: 161, separationPasses: 1 }, ["separate", "tick"]);
    const nextById = new Map(next.nodes.map((node) => [node.id, node]));
    for (const force of separated.forces) {
      const node = separatedById.get(force.id)!;
      const nextNode = nextById.get(force.id)!;
      expect(nextNode.x - node.x).toBeCloseTo(force.dx, 8);
      expect(nextNode.y - node.y).toBeCloseTo(force.dy, 8);
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
    expect(laidOutLeaves.every((leaf) => Math.hypot(leaf.x - laidOutParent.x, leaf.y - laidOutParent.y) < 180)).toBe(true);
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
    expect(Math.hypot(leaf.x - parent.x, leaf.y - parent.y)).toBeLessThan(220);
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
    expect(Math.max(...xValues) - Math.min(...xValues)).toBeLessThan(240);
    expect(Math.max(...yValues) - Math.min(...yValues)).toBeLessThan(240);
    for (const edge of layout.edges) {
      const angle = Math.atan2(-(edge.toNode.y - edge.fromNode.y), edge.toNode.x - edge.fromNode.x) * 180 / Math.PI;
      expect(angle).toBeGreaterThan(-90);
      expect(angle).toBeLessThan(0);
    }
    expect(layout.width).toBeGreaterThan(1200);
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

  it("projects a named resource fetcher as an incoming data-loading chain", () => {
    const resourceDetail = {
      ...detail,
      operations: [{
        key: "operation:summary", semanticKind: "boundary", label: "Load summary resource",
        sourceExpressionIds: ["evidence:summary"], boundary: { kind: "resource", label: "getInventorySummary" },
        owner: { label: "RouteA", file: "src/routes/a.tsx", line: 2 },
      }],
      evidence: [{ id: "evidence:summary", file: "src/routes/a.tsx", line: 6 }],
    } as unknown as RouteDataDetail;
    const topology = buildComponentTopology(resourceDetail);
    expect(topology.nodes.map((node) => `${node.kind}:${node.label}`)).toEqual(expect.arrayContaining([
      "source:getInventorySummary",
      "boundary:summary resource",
    ]));
    expect(topology.edges.map((edge) => `${edge.kind}:${edge.from}->${edge.to}`)).toEqual(expect.arrayContaining([
      "loads:source:handler:getinventorysummary->boundary:operation:summary",
      "loads:boundary:operation:summary->component:routea",
    ]));
  });

  it("contracts Solid control-flow wrappers from every topology input without merging their occurrences", () => {
    const controlFlowDetail = {
      ...detail,
      context: {
        nodes: [
          { id: "route", kind: "component", label: "InventoryRouteContent", file: "src/routes/inventory.tsx", line: 10, role: "route" },
          { id: "show-occurrence", kind: "component", label: "Show", file: "src/routes/inventory.tsx", line: 20, role: "framework" },
          { id: "shell", kind: "component", label: "InventoryRouteShell", file: "src/routes/inventory.tsx", line: 30, role: "component" },
          { id: "palette", kind: "component", label: "Palette", file: "src/Palette.tsx", line: 1, role: "component" },
          { id: "suspense-occurrence", kind: "component", label: "Suspense", file: "src/Palette.tsx", line: 8, role: "framework" },
          { id: "swatches", kind: "component", label: "Swatches", file: "src/Palette.tsx", line: 9, role: "component" },
          { id: "suspense-declaration", kind: "component", label: "Suspense", file: "node_modules/solid-js/types/render/flow.d.ts", line: 74, role: "component" },
        ],
        edges: [
          { id: "into-wrapper", from: "route", to: "show-occurrence", kind: "component" },
          { id: "out-of-wrapper", from: "show-occurrence", to: "shell", kind: "component" },
          { id: "into-suspense", from: "palette", to: "suspense-occurrence", kind: "component" },
          { id: "out-of-suspense", from: "suspense-occurrence", to: "swatches", kind: "component" },
          { id: "shared-declaration", from: "route", to: "suspense-declaration", kind: "component" },
        ],
      },
      route: { componentNames: ["InventoryRouteContent"], file: "src/routes/inventory.tsx" },
      exhaustiveGraph: {
        nodes: [
          { key: "route-step", label: "route step", snippet: null, file: "src/routes/inventory.tsx", line: 10, components: ["InventoryRouteContent", "Show"] },
          { key: "palette-step", label: "palette step", snippet: null, file: "src/Palette.tsx", line: 1, components: ["Palette", "Suspense"] },
        ],
        trajectories: [
          { stepComponents: ["InventoryRouteContent", "Show", "InventoryRouteShell", "Suspense", "Palette"] },
        ],
      },
    } as unknown as RouteDataDetail;
    const topology = buildComponentTopology(controlFlowDetail);
    expect(topology.nodes.some((node) => node.label === "Show")).toBe(false);
    expect(topology.nodes.some((node) => node.label === "Suspense")).toBe(false);
    expect(topology.edges).toContainEqual(expect.objectContaining({
      from: "component:inventoryroutecontent",
      to: "component:inventoryrouteshell",
      kind: "renders",
      confidence: "proven",
      via: ["Show"],
    }));
    expect(topology.edges).toContainEqual(expect.objectContaining({
      from: "component:palette",
      to: "component:swatches",
      kind: "renders",
      confidence: "proven",
      via: ["Suspense"],
    }));
    expect(topology.edges).toContainEqual(expect.objectContaining({
      from: "component:inventoryrouteshell",
      to: "component:palette",
      kind: "handoff",
      confidence: "proven",
      via: ["Suspense"],
    }));
    expect(topology.edges.some((edge) => edge.to === "component:suspense" || edge.from === "component:suspense")).toBe(false);
  });

  it("focuses direct neighbors and every upstream ancestor without expanding through descendants", () => {
    const nodes = ["source", "root", "parent", "selected", "child", "grandchild", "unrelated"].map((id, index) => ({
      id, kind: "component" as const, label: id, file: null, line: null,
      routeEntry: id === "root", incomingCount: 0, outgoingCount: 0, depth: index,
    }));
    const edge = (from: string, to: string) => ({ id: `${from}-${to}`, from, to, kind: "renders" as const, confidence: "proven" as const, count: 1 });
    const topology = {
      nodes,
      edges: [edge("source", "root"), edge("root", "parent"), edge("parent", "selected"), edge("selected", "child"), edge("child", "grandchild"), edge("root", "unrelated")],
      totals: { components: nodes.length, contexts: 0, sources: 0, inferredEdges: 0 },
    } satisfies ComponentTopology;
    const focus = componentTopologySelectionFocus(topology, "selected");
    expect([...focus.nodeIds]).toEqual(expect.arrayContaining(["source", "root", "parent", "selected", "child"]));
    expect(focus.nodeIds.has("grandchild")).toBe(false);
    expect(focus.nodeIds.has("unrelated")).toBe(false);
    expect(focus.edgeIds).toEqual(new Set(["parent-selected", "selected-child", "root-parent", "source-root"]));
  });

  it("keeps a repeated descendant component as a dedicated occurrence instead of closing a cycle", () => {
    const recursiveDetail = {
      ...detail,
      route: { componentNames: ["TreeRoute"], file: "src/routes/tree.tsx" },
      context: {
        nodes: [
          { id: "route", kind: "component", label: "TreeRoute", file: "src/routes/tree.tsx", line: 2, role: "route" },
          { id: "branch", kind: "component", label: "Branch", file: "src/Branch.tsx", line: 1, role: "component" },
          { id: "recursive-branch", kind: "component", label: "Branch", file: "src/Branch.tsx", line: 3, role: "component" },
        ],
        edges: [
          { id: "route-branch", from: "route", to: "branch", kind: "component" },
          { id: "branch-recursive", from: "branch", to: "recursive-branch", kind: "component" },
        ],
      },
      exhaustiveGraph: { nodes: [], trajectories: [] },
    } as unknown as RouteDataDetail;
    const topology = buildComponentTopology(recursiveDetail);
    const branchNodes = topology.nodes.filter((node) => node.label === "Branch");

    expect(branchNodes).toHaveLength(2);
    expect(topology.edges).toContainEqual(expect.objectContaining({
      from: "component:branch",
      to: expect.stringMatching(/^component-occurrence:/),
      kind: "renders",
    }));
    expect(topology.edges.every((edge) => edge.from !== edge.to)).toBe(true);
  });

  it("keeps direct inbound lines while rejecting only the edge that would close a focus cycle", () => {
    const ids = ["root", "selected", "suspense", "content", "content-child"];
    const nodes = ids.map((id, index) => ({
      id, kind: "component" as const, label: id, file: null, line: null,
      routeEntry: id === "selected", incomingCount: 0, outgoingCount: 0, depth: index,
    }));
    const edge = (from: string, to: string) => ({ id: `${from}-${to}`, from, to, kind: "renders" as const, confidence: "proven" as const, count: 1 });
    const topology = {
      nodes,
      edges: [
        edge("root", "selected"),
        edge("selected", "suspense"),
        edge("suspense", "content"),
        edge("content", "selected"),
        edge("content", "content-child"),
      ],
      totals: { components: nodes.length, contexts: 0, sources: 0, inferredEdges: 0 },
    } satisfies ComponentTopology;
    const focus = componentTopologySelectionFocus(topology, "selected");
    expect(focus.nodeIds).toEqual(new Set(["selected", "root", "content", "suspense"]));
    expect(focus.edgeIds).toEqual(new Set(["root-selected", "content-selected", "selected-suspense"]));
    expect(focus.edgeIds.has("suspense-content")).toBe(false);
  });

  it("replaces high-reuse inbound component edges with caller rings", () => {
    const callers = Array.from({ length: 6 }, (_, index) => ({
      id: `component:caller-${index}`, kind: "component" as const, label: `Caller${index}`, file: null, line: null,
      routeEntry: index === 0, incomingCount: 0, outgoingCount: 1, depth: index,
    }));
    const hub = { id: "component:button", kind: "component" as const, label: "Button", file: null, line: null, routeEntry: false, incomingCount: 6, outgoingCount: 0, depth: 6 };
    const edges = callers.flatMap((caller, index) => [
      { id: `renders-${index}`, from: caller.id, to: hub.id, kind: "renders" as const, confidence: "proven" as const, count: 1 },
      { id: `handoff-${index}`, from: caller.id, to: hub.id, kind: "handoff" as const, confidence: "inferred" as const, count: 1 },
    ]);
    const summary = summarizeSharedComponentHubs({
      nodes: [...callers, hub], edges,
      totals: { components: 7, contexts: 0, sources: 0, inferredEdges: 6 },
    } satisfies ComponentTopology);
    expect(summary.hubs).toMatchObject([{ id: hub.id, label: "Button", connectionCount: 6, relationLabel: "callers" }]);
    expect(summary.hiddenEdgeIds.size).toBe(12);
    expect(summary.summarizedReferenceCount).toBe(6);
    expect(summary.ringsByNode.get(callers[0].id)).toHaveLength(1);
  });

  it("replaces high-reuse context consumer spokes with consumer rings", () => {
    const context = { id: "context:button-props", kind: "context" as const, label: "ButtonProps context", file: null, line: null, routeEntry: false, incomingCount: 1, outgoingCount: 6, depth: 2 };
    const provider = { id: "component:provider", kind: "component" as const, label: "Button", file: null, line: null, routeEntry: true, incomingCount: 0, outgoingCount: 1, depth: 1 };
    const consumers = Array.from({ length: 6 }, (_, index) => ({
      id: `component:consumer-${index}`, kind: "component" as const, label: `Consumer${index}`, file: null, line: null,
      routeEntry: false, incomingCount: 1, outgoingCount: 0, depth: 3,
    }));
    const providerEdge = { id: "provides", from: provider.id, to: context.id, kind: "provides" as const, confidence: "inferred" as const, count: 1 };
    const consumerEdges = consumers.map((consumer, index) => ({ id: `consumes-${index}`, from: context.id, to: consumer.id, kind: "consumes" as const, confidence: "inferred" as const, count: 1 }));
    const summary = summarizeSharedComponentHubs({
      nodes: [provider, context, ...consumers], edges: [providerEdge, ...consumerEdges],
      totals: { components: 7, contexts: 1, sources: 0, inferredEdges: 7 },
    } satisfies ComponentTopology);
    expect(summary.hubs).toMatchObject([{ id: context.id, connectionCount: 6, relationLabel: "consumers" }]);
    expect(summary.hiddenEdgeIds).not.toContain(providerEdge.id);
    expect(summary.hiddenEdgeIds.size).toBe(6);
    expect(summary.summarizedReferenceCount).toBe(6);
    expect(summary.ringsByNode.get(consumers[0].id)).toBeUndefined();
  });

  it("replaces package icon nodes and arrows with one ring per caller and icon package", () => {
    const route = { id: "component:route", kind: "component" as const, label: "Route", file: "src/Route.tsx", line: 1, routeEntry: true, incomingCount: 0, outgoingCount: 3, depth: 0 };
    const child = { id: "component:child", kind: "component" as const, label: "Child", file: "src/Child.tsx", line: 1, routeEntry: false, incomingCount: 1, outgoingCount: 0, depth: 1 };
    const zoomIn = { id: "component:zoom-in", kind: "component" as const, label: "ZoomIn", file: "node_modules/lucide-solid/dist/lucide-solid.js", line: 12, routeEntry: false, incomingCount: 1, outgoingCount: 0, depth: 1 };
    const search = { id: "component:search", kind: "component" as const, label: "Search", file: "node_modules/.pnpm/lucide-solid@1.0.0/node_modules/lucide-solid/dist/lucide-solid.js", line: 20, routeEntry: false, incomingCount: 1, outgoingCount: 0, depth: 1 };
    const childEdge = { id: "child", from: route.id, to: child.id, kind: "renders" as const, confidence: "proven" as const, count: 1 };
    const iconEdges = [
      { id: "zoom", from: route.id, to: zoomIn.id, kind: "renders" as const, confidence: "proven" as const, count: 1 },
      { id: "search", from: route.id, to: search.id, kind: "renders" as const, confidence: "proven" as const, count: 1 },
    ];
    const topology = {
      nodes: [route, child, zoomIn, search], edges: [childEdge, ...iconEdges],
      totals: { components: 4, contexts: 0, sources: 0, inferredEdges: 0 },
    } satisfies ComponentTopology;
    const summary = summarizeSharedComponentHubs(topology);
    expect(summary.hubs).toMatchObject([{ id: "icon-package:lucide-solid", label: "lucide-solid", connectionCount: 2, relationLabel: "icons" }]);
    expect(summary.hiddenEdgeIds).toEqual(new Set(["zoom", "search"]));
    expect(summary.ringsByNode.get(route.id)).toHaveLength(1);
    const visible = projectVisibleComponentTopology(topology, summary.hiddenEdgeIds);
    expect(visible.nodes.map((node) => node.label)).toEqual(["Route", "Child"]);
    expect(visible.edges).toEqual([childEdge]);
  });

  it("omits nodes whose only connection was summarized and genuinely isolated evidence nodes", () => {
    const route = { id: "component:route", kind: "component" as const, label: "Route", file: null, line: null, routeEntry: true, incomingCount: 0, outgoingCount: 1, depth: 0 };
    const context = { id: "context:button", kind: "context" as const, label: "Button context", file: null, line: null, routeEntry: false, incomingCount: 1, outgoingCount: 1, depth: 1 };
    const consumer = { id: "component:demo", kind: "component" as const, label: "Demo", file: null, line: null, routeEntry: false, incomingCount: 1, outgoingCount: 0, depth: 2 };
    const isolated = { id: "component:isolated", kind: "component" as const, label: "Isolated", file: null, line: null, routeEntry: false, incomingCount: 0, outgoingCount: 0, depth: 2 };
    const provides = { id: "provides", from: route.id, to: context.id, kind: "provides" as const, confidence: "inferred" as const, count: 1 };
    const consumes = { id: "consumes", from: context.id, to: consumer.id, kind: "consumes" as const, confidence: "inferred" as const, count: 1 };
    const visible = projectVisibleComponentTopology({
      nodes: [route, context, consumer, isolated], edges: [provides, consumes],
      totals: { components: 3, contexts: 1, sources: 0, inferredEdges: 2 },
    }, new Set([consumes.id]));
    expect(visible.nodes.map((node) => node.label)).toEqual(["Route", "Button context"]);
    expect(visible.edges).toEqual([provides]);
    expect(visible.totals.components).toBe(1);
  });
});

function topologyNode(id: string, kind: ComponentTopology["nodes"][number]["kind"], label: string, routeEntry: boolean, depth: number) { return { id, kind, label, file: null, line: null, routeEntry, incomingCount: 1, outgoingCount: 1, depth }; }
function topologyEdge(id: string, from: string, to: string, kind: ComponentTopology["edges"][number]["kind"]) { return { id, from, to, kind, confidence: "proven" as const, count: 1 }; }
