import type { RouteDataDetail } from "../../../api/contracts";

type Graph = RouteDataDetail["exhaustiveGraph"];
type Trajectory = Graph["trajectories"][number];

export function rankComplexTrajectories(trajectories: Trajectory[]) {
  return [...trajectories].sort((left, right) =>
    right.stepKeys.length - left.stepKeys.length ||
    right.substitutionStepCount - left.substitutionStepCount ||
    completenessRank(right) - completenessRank(left) ||
    lexical(left.terminalLabel, right.terminalLabel) ||
    lexical(left.key, right.key),
  );
}

export function projectTrajectoryGraph(graph: Graph, trajectoryKey: string | null): Graph {
  if (!trajectoryKey) return graph;
  const trajectory = graph.trajectories.find((item) => item.key === trajectoryKey);
  if (!trajectory) return graph;
  return projectGraph(graph, [trajectory]);
}

export function projectSourceGraph(graph: Graph, sourceMethodKey: string | null): Graph {
  if (!sourceMethodKey) return graph;
  const exact = graph.trajectories.filter((trajectory) => trajectory.sourceMethodKeys.includes(sourceMethodKey));
  return projectGraph(graph, exact);
}

function projectGraph(graph: Graph, trajectories: Graph["trajectories"]): Graph {
  const depthByKey = new Map<string, number>();
  const pathCountByKey = new Map<string, number>();
  const componentsByKey = new Map<string, Map<string, number>>();
  const edgeCounts = new Map<string, number>();
  for (const trajectory of trajectories) {
    trajectory.stepKeys.forEach((key, index) => {
      depthByKey.set(key, Math.min(depthByKey.get(key) ?? index, index));
      pathCountByKey.set(key, (pathCountByKey.get(key) ?? 0) + 1);
      const component = trajectory.stepComponents[index];
      const counts = componentsByKey.get(key) ?? new Map<string, number>();
      counts.set(component, (counts.get(component) ?? 0) + 1);
      componentsByKey.set(key, counts);
      const next = trajectory.stepKeys[index + 1];
      if (next) edgeCounts.set(`${key}>${next}`, (edgeCounts.get(`${key}>${next}`) ?? 0) + 1);
    });
  }
  const nodes = graph.nodes
    .filter((node) => depthByKey.has(node.key))
    .map((node) => {
      const components = [...(componentsByKey.get(node.key) ?? [])].sort((left, right) => right[1] - left[1]).map(([component]) => component);
      return { ...node, minimumDepth: depthByKey.get(node.key)!, pathCount: pathCountByKey.get(node.key)!, component: components[0] ?? node.component, components: components.length ? components : node.components };
    });
  const edges = graph.edges.filter((edge) => edgeCounts.has(`${edge.from}>${edge.to}`)).map((edge) => ({ ...edge, pathCount: edgeCounts.get(`${edge.from}>${edge.to}`)! }));
  return {
    ...graph,
    nodes,
    edges,
    trajectories,
    totals: {
      ...graph.totals,
      sinks: new Set(trajectories.map((trajectory) => trajectory.sinkId)).size,
      trajectories: trajectories.length,
      nodes: nodes.length,
      edges: edges.length,
      components: new Set(nodes.flatMap((node) => node.components)).size,
      unknownTrajectories: trajectories.filter((trajectory) => trajectory.completeness === "partial").length,
    },
  };
}

function completenessRank(trajectory: Trajectory) { return trajectory.completeness === "partial" ? 1 : 0; }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
