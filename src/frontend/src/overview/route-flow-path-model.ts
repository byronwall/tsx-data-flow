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
  const depthByKey = new Map<string, number>();
  const componentByKey = new Map<string, string>();
  trajectory.stepKeys.forEach((key, index) => {
    if (!depthByKey.has(key)) depthByKey.set(key, index);
    if (!componentByKey.has(key)) componentByKey.set(key, trajectory.stepComponents[index]);
  });
  const nodes = graph.nodes
    .filter((node) => depthByKey.has(node.key))
    .map((node) => {
      const component = componentByKey.get(node.key) || node.component;
      return { ...node, minimumDepth: depthByKey.get(node.key)!, pathCount: 1, component, components: [component] };
    });
  const pathPairs = new Set(trajectory.stepKeys.slice(0, -1).map((from, index) => `${from}>${trajectory.stepKeys[index + 1]}`));
  const edges = graph.edges.filter((edge) => pathPairs.has(`${edge.from}>${edge.to}`)).map((edge) => ({ ...edge, pathCount: 1 }));
  return {
    ...graph,
    nodes,
    edges,
    trajectories: [trajectory],
    totals: {
      ...graph.totals,
      trajectories: 1,
      nodes: nodes.length,
      edges: edges.length,
      components: new Set(nodes.flatMap((node) => node.components)).size,
      unknownTrajectories: trajectory.completeness === "partial" ? 1 : 0,
    },
  };
}

function completenessRank(trajectory: Trajectory) { return trajectory.completeness === "partial" ? 1 : 0; }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
