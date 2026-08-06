import type { RouteTotality } from "../../../api/contracts";
import {
  assignParallelIndices as assignParallelIndicesInGeometry,
  layoutRouteTotalityNodes as layoutNodes,
  routeTotalityEdgePathForLayout as edgePathForLayout,
} from "./route-totality-layout-geometry";
import { buildRouteTotalityGraph } from "./route-totality-layout-graph";
import { emptyRouteTotalityLayout } from "./route-totality-layout-summary";
import {
  composeRouteTotalityNodeRedirects,
  projectRouteTotalityStacks,
} from "./route-totality-stack-projection";
import { projectRouteTotalityUi } from "./route-totality-ui-projection";
import type {
  RouteTotalityLayoutOptions,
  RouteTotalityGraphEdge,
  RouteTotalityLayout,
  RouteTotalityLayoutEdge,
} from "./route-totality-model";

export function assignParallelIndices(edges: RouteTotalityGraphEdge[]): void {
  assignParallelIndicesInGeometry(edges);
}

export function routeTotalityEdgePathForLayout(edge: RouteTotalityLayoutEdge): string {
  return edgePathForLayout(edge);
}

export function buildRouteTotalityLayout(totality: RouteTotality | null, options: RouteTotalityLayoutOptions = {}): RouteTotalityLayout {
  if (!totality) return emptyRouteTotalityLayout();

  const baseGraph = buildRouteTotalityGraph(totality);
  const mode = options.genericUiMode ?? "all";
  const projected = projectRouteTotalityUi(baseGraph, totality, options.hiddenComponentPolicy, mode);
  const condensed = projectRouteTotalityStacks(projected.graph);
  const graph = condensed.graph;
  assignParallelIndices(graph.edges);
  const positioned = layoutNodes(
    graph.nodes,
    graph.edges,
    graph.primaryNodeIds,
    graph.evidenceNodeIds,
  );
  const positionedById = new Map(positioned.nodes.map((node) => [node.id, node]));
  const edges: RouteTotalityLayoutEdge[] = graph.edges.flatMap((edge) => {
    const fromNode = positionedById.get(edge.from);
    const toNode = positionedById.get(edge.to);
    return fromNode && toNode ? [{ ...edge, fromNode, toNode }] : [];
  });

  return {
    nodes: positioned.nodes,
    edges,
    primaryNodeIds: graph.primaryNodeIds,
    evidenceNodeIds: graph.evidenceNodeIds,
    summary: graph.summary,
    width: positioned.width,
    height: positioned.height,
    uiProjection: projected.projection,
    stackProjection: condensed.projection,
    nodeRedirects: composeRouteTotalityNodeRedirects(
      projected.projection.hiddenToVisibleNodeId,
      condensed.projection.condensedToVisibleNodeId,
    ),
  };
}
