import type { ComponentTopology } from "./component-topology-model";
import type { TopologySourceLens } from "./topology-source-lens";

export type ComponentTopologyIsolation = {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
};

export function componentTopologyIsolation(
  topology: ComponentTopology,
  selection: ComponentTopologyIsolation,
  selectedNodeId: string | null,
  lens: TopologySourceLens,
): ComponentTopologyIsolation | null {
  const sourceActive = Boolean(lens.pathCount || lens.resources.length);
  if (!selectedNodeId && !sourceActive) return null;

  const sourceNodeIds = new Set([...lens.componentIds, ...lens.resourceParticipantIds]);
  const nodeIds = new Set(topology.nodes
    .filter((node) => (!selectedNodeId || selection.nodeIds.has(node.id))
      && (!sourceActive || sourceNodeIds.has(node.id)))
    .map((node) => node.id));
  if (!nodeIds.size) return null;

  const edgeIds = new Set(topology.edges
    .filter((edge) => {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return false;
      if (selectedNodeId && !selection.edgeIds.has(edge.id)) return false;
      if (!sourceActive) return true;
      const onSourcePath = lens.componentIds.has(edge.from) && lens.componentIds.has(edge.to);
      const onResourcePath = lens.resourceParticipantIds.has(edge.from) && lens.resourceParticipantIds.has(edge.to);
      return onSourcePath || onResourcePath;
    })
    .map((edge) => edge.id));
  return { nodeIds, edgeIds };
}

export function projectIsolatedComponentTopology(
  topology: ComponentTopology,
  isolation: ComponentTopologyIsolation | null,
): ComponentTopology {
  if (!isolation) return topology;
  const nodes = topology.nodes.filter((node) => isolation.nodeIds.has(node.id));
  const edges = topology.edges.filter((edge) => isolation.edgeIds.has(edge.id)
    && isolation.nodeIds.has(edge.from)
    && isolation.nodeIds.has(edge.to));
  return {
    nodes,
    edges,
    totals: {
      components: nodes.filter((node) => node.kind === "component").length,
      contexts: nodes.filter((node) => node.kind === "context").length,
      sources: nodes.filter((node) => node.kind === "source").length,
      inferredEdges: edges.filter((edge) => edge.confidence === "inferred").length,
    },
  };
}
