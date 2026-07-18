import type { RouteDataDetail } from "../../../api/contracts";

type Graph = RouteDataDetail["exhaustiveGraph"];
export type RouteFlowNodeLayout = Graph["nodes"][number] & { x: number; y: number; width: number; height: number };
export type RouteFlowComponentLayout = { key: string; label: string; x: number; y: number; width: number; height: number; nodeCount: number; pathCount: number };

export function layoutRouteFlowGraph(graph: Graph, focused = false) {
  if (focused && graph.trajectories[0]) return layoutFocusedGraph(graph);
  const nodeWidth = 148; const nodeHeight = 24; const columnGap = 44; const rowGap = 6; const padding = 34;
  const maximumDepth = Math.max(0, ...graph.nodes.map((node) => node.minimumDepth));
  const width = Math.max(900, padding * 2 + (maximumDepth + 1) * nodeWidth + maximumDepth * columnGap);
  const grouped = new Map<string, Graph["nodes"]>();
  for (const node of graph.nodes) { const rows = grouped.get(node.component) ?? []; rows.push(node); grouped.set(node.component, rows); }
  const nodes: RouteFlowNodeLayout[] = [];
  const components: RouteFlowComponentLayout[] = [];
  let groupY = 14;
  const firstDepth = (rows: Graph["nodes"]) => Math.min(...rows.map((node) => node.minimumDepth));
  const orderedGroups = [...grouped].sort(([leftLabel, left], [rightLabel, right]) => firstDepth(left) - firstDepth(right) || groupRank(leftLabel) - groupRank(rightLabel) || lexical(leftLabel, rightLabel));
  for (const [component, componentNodes] of orderedGroups) {
    const layers = new Map<number, Graph["nodes"]>();
    for (const node of componentNodes) { const rows = layers.get(node.minimumDepth) ?? []; rows.push(node); layers.set(node.minimumDepth, rows); }
    const maximumRows = Math.max(1, ...[...layers.values()].map((rows) => rows.length));
    const groupHeight = 32 + maximumRows * (nodeHeight + rowGap) + 10;
    const pathCount = Math.max(0, ...componentNodes.map((node) => node.pathCount));
    components.push({ key: `component:${component}`, label: component, x: 10, y: groupY, width: width - 20, height: groupHeight, nodeCount: componentNodes.length, pathCount });
    for (const [depth, rows] of [...layers].sort(([left], [right]) => left - right)) {
      rows.sort((left, right) => right.pathCount - left.pathCount || lexical(left.label, right.label) || lexical(left.key, right.key));
      rows.forEach((node, index) => nodes.push({ ...node, x: padding + depth * (nodeWidth + columnGap), y: groupY + 32 + index * (nodeHeight + rowGap), width: nodeWidth, height: nodeHeight }));
    }
    groupY += groupHeight + 10;
  }
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const edges = graph.edges.flatMap((edge) => { const from = byKey.get(edge.from); const to = byKey.get(edge.to); return from && to ? [{ ...edge, fromNode: from, toNode: to }] : []; });
  return { nodes, edges, components, width, height: Math.max(600, groupY + 24) };
}

function layoutFocusedGraph(graph: Graph) {
  const nodeWidth = 148; const nodeHeight = 24; const columnGap = 28; const rowGap = 10; const padding = 34; const columns = 5; const width = 900;
  const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const orderedNodes = graph.trajectories[0].stepKeys.flatMap((key) => { const node = byKey.get(key); return node ? [node] : []; });
  const runs: Array<{ component: string; nodes: Graph["nodes"] }> = [];
  for (const node of orderedNodes) {
    const previous = runs.at(-1);
    if (previous?.component === node.component) previous.nodes.push(node);
    else runs.push({ component: node.component, nodes: [node] });
  }
  const nodes: RouteFlowNodeLayout[] = [];
  const components: RouteFlowComponentLayout[] = [];
  let groupY = 14;
  runs.forEach((run, runIndex) => {
    const rows = Math.ceil(run.nodes.length / columns);
    const groupHeight = 32 + rows * (nodeHeight + rowGap) + 10;
    components.push({ key: `component-run:${runIndex}:${run.component}`, label: run.component, x: 10, y: groupY, width: width - 20, height: groupHeight, nodeCount: run.nodes.length, pathCount: 1 });
    run.nodes.forEach((node, index) => {
      const row = Math.floor(index / columns);
      const position = index % columns;
      const column = row % 2 === 0 ? position : columns - 1 - position;
      nodes.push({ ...node, x: padding + column * (nodeWidth + columnGap), y: groupY + 32 + row * (nodeHeight + rowGap), width: nodeWidth, height: nodeHeight });
    });
    groupY += groupHeight + 10;
  });
  const laidOutByKey = new Map(nodes.map((node) => [node.key, node]));
  const edges = graph.edges.flatMap((edge) => { const from = laidOutByKey.get(edge.from); const to = laidOutByKey.get(edge.to); return from && to ? [{ ...edge, fromNode: from, toNode: to }] : []; });
  return { nodes, edges, components, width, height: Math.max(600, groupY + 24) };
}
function groupRank(label: string) { return label.startsWith("Shared across") ? 2 : label === "Unowned / external" ? 1 : 0; }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
