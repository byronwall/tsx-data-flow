import type { ComponentTopologyLayout } from "./component-topology-layout";

export type ComponentTopologyPosition = { x: number; y: number };
export type ComponentTopologyPositionMap = ReadonlyMap<string, ComponentTopologyPosition>;

export type ComponentTopologyPositionChange = {
  id: string;
  label: string;
  before: ComponentTopologyPosition;
  after: ComponentTopologyPosition;
  dx: number;
  dy: number;
  distance: number;
};

export function applyManualTopologyPositions(
  layout: ComponentTopologyLayout,
  positions: ComponentTopologyPositionMap,
): ComponentTopologyLayout {
  if (!positions.size) return layout;
  const nodes = layout.nodes.map((node) => {
    const position = positions.get(node.id);
    return position ? { ...node, ...position } : node;
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = layout.edges.map((edge) => ({
    ...edge,
    fromNode: byId.get(edge.from) ?? edge.fromNode,
    toNode: byId.get(edge.to) ?? edge.toNode,
  }));
  const forces = layout.forces.map((force) => {
    const position = positions.get(force.id);
    return position ? { ...force, ...position } : force;
  });
  return { ...layout, nodes, edges, forces };
}

export function topologyPositionSnapshot(layout: ComponentTopologyLayout) {
  return new Map(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
}

export function topologyPositionChanges(
  before: ComponentTopologyPositionMap | null,
  layout: ComponentTopologyLayout,
  editedPositions: ComponentTopologyPositionMap,
): ComponentTopologyPositionChange[] {
  if (!before) return [];
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  return [...editedPositions].flatMap(([id, after]) => {
    const start = before.get(id);
    const node = byId.get(id);
    if (!start || !node) return [];
    const dx = after.x - start.x;
    const dy = after.y - start.y;
    return [{
      id,
      label: node.label,
      before: start,
      after,
      dx,
      dy,
      distance: Math.hypot(dx, dy),
    }];
  }).filter((change) => change.distance > .001);
}
