import type {
  RouteTotalityGraph,
  RouteTotalityGraphEdge,
  RouteTotalityNode,
  RouteTotalityStackProjection,
} from "./route-totality-model";

const CONDENSED_LAYOUT_NAMES = new Set(["Box", "Flex", "Grid", "HStack", "VStack"]);

export function projectRouteTotalityStacks(
  graph: RouteTotalityGraph,
): { graph: RouteTotalityGraph; projection: RouteTotalityStackProjection } {
  const condensedNodeIds = new Set(graph.nodes.filter(isCondensedLayout).map((node) => node.id));
  if (condensedNodeIds.size === 0) {
    return { graph, projection: emptyRouteTotalityStackProjection() };
  }

  const structuralEdges = graph.edges.filter(isStructuralEdge);
  const incoming = groupEdges(structuralEdges, "to");
  const outgoing = groupEdges(structuralEdges, "from");
  const condensedToVisibleNodeId = new Map<string, string>();
  for (const nodeId of condensedNodeIds) {
    const visibleParent = nearestVisibleNode(nodeId, "incoming", condensedNodeIds, incoming, outgoing);
    const visibleChild = visibleParent
      ? null
      : nearestVisibleNode(nodeId, "outgoing", condensedNodeIds, incoming, outgoing);
    const visibleNodeId = visibleParent ?? visibleChild;
    if (visibleNodeId) condensedToVisibleNodeId.set(nodeId, visibleNodeId);
  }

  const condensedEdgeIds = new Set(graph.edges
    .filter((edge) => condensedNodeIds.has(edge.from) || condensedNodeIds.has(edge.to))
    .map((edge) => edge.id));
  const visibleNodes = graph.nodes.filter((node) => !condensedNodeIds.has(node.id));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter((edge) => !condensedEdgeIds.has(edge.id));
  const spliceEdges = buildStackSpliceEdges(
    graph.nodes,
    structuralEdges,
    condensedNodeIds,
    visibleNodeIds,
    outgoing,
  );
  const modifiedParentNodeIds = new Set(spliceEdges.map((edge) => edge.from));

  return {
    graph: {
      ...graph,
      nodes: visibleNodes,
      edges: [...visibleEdges, ...spliceEdges],
      primaryNodeIds: graph.primaryNodeIds.filter((id) => visibleNodeIds.has(id)),
      evidenceNodeIds: graph.evidenceNodeIds.filter((id) => visibleNodeIds.has(id)),
    },
    projection: {
      condensedNodeIds,
      condensedEdgeIds,
      condensedToVisibleNodeId,
      modifiedParentNodeIds,
    },
  };
}

export function emptyRouteTotalityStackProjection(): RouteTotalityStackProjection {
  return {
    condensedNodeIds: new Set(),
    condensedEdgeIds: new Set(),
    condensedToVisibleNodeId: new Map(),
    modifiedParentNodeIds: new Set(),
  };
}

export function composeRouteTotalityNodeRedirects(
  uiRedirects: ReadonlyMap<string, string>,
  stackRedirects: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const redirects = new Map<string, string>();
  for (const [nodeId, targetId] of stackRedirects) redirects.set(nodeId, targetId);
  for (const [nodeId, targetId] of uiRedirects) {
    redirects.set(nodeId, stackRedirects.get(targetId) ?? targetId);
  }
  return redirects;
}

function isCondensedLayout(node: RouteTotalityNode): boolean {
  return node.kind === "occurrence"
    && "definitionId" in node.record
    && node.record.hiddenWrapperCompatibility
    && CONDENSED_LAYOUT_NAMES.has(node.record.name);
}

function isStructuralEdge(edge: RouteTotalityGraphEdge): boolean {
  return edge.source === "occurrence-surface"
    && (edge.family === "render" || edge.family === "boundary");
}

function groupEdges(
  edges: readonly RouteTotalityGraphEdge[],
  endpoint: "from" | "to",
): ReadonlyMap<string, readonly RouteTotalityGraphEdge[]> {
  const grouped = new Map<string, RouteTotalityGraphEdge[]>();
  for (const edge of edges) grouped.set(edge[endpoint], [...(grouped.get(edge[endpoint]) ?? []), edge]);
  return grouped;
}

function nearestVisibleNode(
  startId: string,
  direction: "incoming" | "outgoing",
  condensedNodeIds: ReadonlySet<string>,
  incoming: ReadonlyMap<string, readonly RouteTotalityGraphEdge[]>,
  outgoing: ReadonlyMap<string, readonly RouteTotalityGraphEdge[]>,
): string | null {
  const visited = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift()!;
    const edges = direction === "incoming" ? incoming.get(current) ?? [] : outgoing.get(current) ?? [];
    for (const edge of edges) {
      const candidate = direction === "incoming" ? edge.from : edge.to;
      if (visited.has(candidate)) continue;
      if (!condensedNodeIds.has(candidate)) return candidate;
      visited.add(candidate);
      queue.push(candidate);
    }
  }
  return null;
}

function buildStackSpliceEdges(
  nodes: readonly RouteTotalityNode[],
  structuralEdges: readonly RouteTotalityGraphEdge[],
  condensedNodeIds: ReadonlySet<string>,
  visibleNodeIds: ReadonlySet<string>,
  outgoing: ReadonlyMap<string, readonly RouteTotalityGraphEdge[]>,
): RouteTotalityGraphEdge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const summaries = new Map<string, RouteTotalityGraphEdge>();
  for (const firstEdge of structuralEdges) {
    if (!visibleNodeIds.has(firstEdge.from) || !condensedNodeIds.has(firstEdge.to)) continue;
    walkStackPath(
      firstEdge.from,
      firstEdge.to,
      [firstEdge],
      nodesById,
      condensedNodeIds,
      visibleNodeIds,
      outgoing,
      summaries,
      new Set([firstEdge.to]),
    );
  }
  return [...summaries.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function walkStackPath(
  sourceId: string,
  currentId: string,
  path: readonly RouteTotalityGraphEdge[],
  nodesById: ReadonlyMap<string, RouteTotalityNode>,
  condensedNodeIds: ReadonlySet<string>,
  visibleNodeIds: ReadonlySet<string>,
  outgoing: ReadonlyMap<string, readonly RouteTotalityGraphEdge[]>,
  summaries: Map<string, RouteTotalityGraphEdge>,
  visited: Set<string>,
): void {
  for (const edge of outgoing.get(currentId) ?? []) {
    if (visibleNodeIds.has(edge.to)) {
      const completePath = [...path, edge];
      const id = `stack-splice:${sourceId}:${edge.to}`;
      if (summaries.has(id)) continue;
      const stackLabels = [...new Set(completePath
        .map((item) => nodesById.get(item.to))
        .filter((node): node is RouteTotalityNode => Boolean(node && condensedNodeIds.has(node.id)))
        .map((node) => node.label))];
      summaries.set(id, {
        id,
        from: sourceId,
        to: edge.to,
        family: path[0].family,
        kind: "transparent-splice",
        label: "condensed layout",
        detail: `${stackLabels.join(" → ")} ${stackLabels.length === 1 ? "was" : "were"} condensed between the visible parent and child.`,
        source: "occurrence-surface",
        sourceFrom: path[0].sourceFrom,
        sourceTo: edge.sourceTo,
        status: completePath.every((item) => item.status === "proven") ? "proven" : "partial",
        locations: completePath.flatMap((item) => item.locations),
        proof: null,
        parallelIndex: 0,
        parallelCount: 1,
      });
      continue;
    }
    if (!condensedNodeIds.has(edge.to) || visited.has(edge.to)) continue;
    visited.add(edge.to);
    walkStackPath(
      sourceId,
      edge.to,
      [...path, edge],
      nodesById,
      condensedNodeIds,
      visibleNodeIds,
      outgoing,
      summaries,
      visited,
    );
    visited.delete(edge.to);
  }
}
