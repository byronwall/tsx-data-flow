import {
  DEFAULT_COMPONENT_TOPOLOGY_LAYOUT_SETTINGS,
  layoutComponentTopology,
  type ComponentTopologyForceVector,
  type ComponentTopologyLayoutSettings,
  type ComponentTopologyLayoutStep,
} from "./component-topology-layout";
import type {
  ComponentTopology,
  ComponentTopologyEdge,
  ComponentTopologyNode,
} from "./component-topology-model";
import type {
  RouteTotalityDisplayEdge,
  RouteTotalityDisplayNode,
} from "./route-totality-display-model";

export type RouteTotalitySurfacePlacement = {
  id: string;
  x: number;
  y: number;
  radius: number;
};

export type RouteTotalitySurfaceLayout = {
  placements: readonly RouteTotalitySurfacePlacement[];
  forces: readonly ComponentTopologyForceVector[];
};

export const DEFAULT_ROUTE_TOTALITY_SURFACE_LAYOUT_SETTINGS: ComponentTopologyLayoutSettings = {
  ...DEFAULT_COMPONENT_TOPOLOGY_LAYOUT_SETTINGS,
  targetLinkDistance: 250,
  markGap: 28,
  collisionStrength: 2.8,
  separationPasses: 12,
};

export function layoutRouteTotalitySurface(
  nodes: readonly RouteTotalityDisplayNode[],
  edges: readonly RouteTotalityDisplayEdge[],
  depths: ReadonlyMap<string, number>,
  settings: ComponentTopologyLayoutSettings = DEFAULT_ROUTE_TOTALITY_SURFACE_LAYOUT_SETTINGS,
  steps: readonly ComponentTopologyLayoutStep[] = [],
): RouteTotalitySurfaceLayout {
  const incoming = connectionCounts(nodes, edges, "to");
  const outgoing = connectionCounts(nodes, edges, "from");
  const topologyNodes: ComponentTopologyNode[] = nodes.map((displayNode) => ({
    id: displayNode.id,
    kind: topologyKind(displayNode),
    label: displayNode.node.compactLabel,
    file: displayNode.node.location?.file ?? null,
    line: displayNode.node.location?.line ?? null,
    sourceIdentity: displayNode.node.id,
    routeEntry: isRouteEntry(displayNode),
    incomingCount: incoming.get(displayNode.id) ?? 0,
    outgoingCount: outgoing.get(displayNode.id) ?? 0,
    depth: depths.get(displayNode.id) ?? 0,
  }));
  const topologyEdges: ComponentTopologyEdge[] = edges.map((displayEdge) => ({
    id: displayEdge.id,
    from: displayEdge.edge.from,
    to: displayEdge.edge.to,
    kind: topologyEdgeKind(displayEdge),
    confidence: displayEdge.edge.status === "proven" ? "proven" : "inferred",
    count: 1,
  }));
  const topology: ComponentTopology = {
    nodes: topologyNodes,
    edges: topologyEdges,
    totals: {
      components: topologyNodes.filter((node) => node.kind === "component").length,
      contexts: 0,
      sources: topologyNodes.filter((node) => node.kind === "source").length,
      inferredEdges: topologyEdges.filter((edge) => edge.confidence === "inferred").length,
    },
  };
  const layout = layoutComponentTopology(
    topology,
    1200,
    760,
    settings,
    steps,
    new Set(topologyNodes.map((node) => node.id)),
  );
  return Object.freeze({
    placements: Object.freeze(layout.nodes.map((node) => Object.freeze({
      id: node.id,
      x: node.x,
      y: node.y,
      radius: node.radius,
    }))),
    forces: Object.freeze(layout.forces.map((force) => Object.freeze({ ...force }))),
  });
}

function topologyKind(node: RouteTotalityDisplayNode): ComponentTopologyNode["kind"] {
  if (node.node.kind === "origin") return "source";
  if (node.node.kind === "framework-boundary" || node.node.kind === "gap") return "boundary";
  return "component";
}

function topologyEdgeKind(edge: RouteTotalityDisplayEdge): ComponentTopologyEdge["kind"] {
  if (edge.edge.family === "data") return "handoff";
  if (edge.edge.family === "boundary") return "loads";
  return "renders";
}

function isRouteEntry(node: RouteTotalityDisplayNode): boolean {
  if (node.node.kind === "origin") return true;
  return node.node.kind === "occurrence"
    && "ownership" in node.node.record
    && node.node.record.ownership === "scope-entry";
}

function connectionCounts(
  nodes: readonly RouteTotalityDisplayNode[],
  edges: readonly RouteTotalityDisplayEdge[],
  endpoint: "from" | "to",
): ReadonlyMap<string, number> {
  const neighbors = new Map(nodes.map((node) => [node.id, new Set<string>()] as const));
  for (const edge of edges) {
    const id = edge.edge[endpoint];
    const neighbor = edge.edge[endpoint === "from" ? "to" : "from"];
    neighbors.get(id)?.add(neighbor);
  }
  return new Map([...neighbors].map(([id, values]) => [id, values.size]));
}
