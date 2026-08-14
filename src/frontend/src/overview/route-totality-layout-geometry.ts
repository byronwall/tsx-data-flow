import type {
  RouteTotalityGraphEdge,
  RouteTotalityLayoutEdge,
  RouteTotalityLayoutNode,
  RouteTotalityNode,
} from "./route-totality-model";

const NODE_WIDTH = 208;
const NODE_HEIGHT = 78;
const COLUMN_GAP = 44;
const ROW_GAP = 20;
const PADDING = 44;
const SECTION_GAP = 72;
const ROWS_PER_COLUMN = 16;
const MIN_WIDTH = 960;
const MIN_HEIGHT = 540;

export function layoutRouteTotalityNodes(
  nodes: RouteTotalityNode[],
  edges: RouteTotalityGraphEdge[],
  primaryNodeIds: string[],
  evidenceNodeIds: string[],
): {
  nodes: RouteTotalityLayoutNode[];
  width: number;
  height: number;
} {
  const primarySet = new Set(primaryNodeIds);
  const evidenceSet = new Set(evidenceNodeIds);
  const primaryEdges = edges.filter(
    (edge) => primarySet.has(edge.from) && primarySet.has(edge.to),
  );
  const evidenceEdges = edges.filter(
    (edge) => evidenceSet.has(edge.from) && evidenceSet.has(edge.to),
  );
  const primaryDepth = layoutDepths(primaryNodeIds, primaryEdges);
  const evidenceDepth = layoutDepths(evidenceNodeIds, evidenceEdges);
  const positions = new Map<string, { x: number; y: number }>();

  placeLayoutNodes(primaryNodeIds, primaryDepth, PADDING, positions);
  const mainHeight = layoutLaneHeight(primaryNodeIds, primaryDepth);
  placeLayoutNodes(
    evidenceNodeIds,
    evidenceDepth,
    PADDING + mainHeight + SECTION_GAP,
    positions,
  );

  const maxX = Math.max(
    0,
    ...[...positions.values()].map((position) => position.x + NODE_WIDTH),
  );
  const maxY = Math.max(
    0,
    ...[...positions.values()].map((position) => position.y + NODE_HEIGHT),
  );
  return {
    nodes: nodes.map((node) => ({
      ...node,
      ...(positions.get(node.id) ?? { x: PADDING, y: PADDING }),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    width: Math.max(MIN_WIDTH, maxX + PADDING),
    height: Math.max(MIN_HEIGHT, maxY + PADDING),
  };
}

export function assignParallelIndices(edges: RouteTotalityGraphEdge[]): void {
  const groups = new Map<string, RouteTotalityGraphEdge[]>();
  for (const edge of edges) {
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.family}`;
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }
  for (const group of groups.values()) {
    group.forEach((edge, index) => {
      edge.parallelIndex = index;
      edge.parallelCount = group.length;
    });
  }
}

export function routeTotalityEdgePathForLayout(edge: RouteTotalityLayoutEdge): string {
  const from = centerOf(edge.fromNode);
  const to = centerOf(edge.toNode);
  if (edge.from === edge.to) {
    return `M ${from.x} ${from.y} Q ${from.x + 48} ${from.y - 48} ${from.x} ${from.y}`;
  }

  const start = connectionPoint(edge.fromNode, to, edge.fromNode.width / 2 + 1);
  const end = connectionPoint(edge.toNode, from, edge.toNode.width / 2 + 7);
  const distance = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
  const normal = { x: -(end.y - start.y) / distance, y: (end.x - start.x) / distance };
  const bend = Math.min(36, distance * .12);
  const parallelOffset = (edge.parallelIndex - (edge.parallelCount - 1) / 2) * 14;
  const middle = {
    x: (start.x + end.x) / 2 + normal.x * (bend + parallelOffset),
    y: (start.y + end.y) / 2 + normal.y * (bend + parallelOffset),
  };
  return `M ${start.x} ${start.y} Q ${middle.x} ${middle.y} ${end.x} ${end.y}`;
}

function placeLayoutNodes(
  ids: string[],
  depth: Map<string, number>,
  top: number,
  positions: Map<string, { x: number; y: number }>,
): void {
  const columns = new Map<number, string[]>();
  for (const id of ids) {
    const column = depth.get(id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), id]);
  }
  for (const [column, columnIds] of columns) {
    columnIds.forEach((id, index) => {
      const wrappedColumn = Math.floor(index / ROWS_PER_COLUMN);
      const row = index % ROWS_PER_COLUMN;
      positions.set(id, {
        x: PADDING + (column + wrappedColumn) * (NODE_WIDTH + COLUMN_GAP),
        y: top + row * (NODE_HEIGHT + ROW_GAP),
      });
    });
  }
}

function layoutLaneHeight(ids: string[], depth: Map<string, number>): number {
  if (!ids.length) return NODE_HEIGHT;

  const rowsByColumn = new Map<number, number>();
  for (const id of ids) {
    const column = depth.get(id) ?? 0;
    rowsByColumn.set(column, (rowsByColumn.get(column) ?? 0) + 1);
  }
  const rows = Math.min(ROWS_PER_COLUMN, Math.max(...rowsByColumn.values()));
  return Math.max(NODE_HEIGHT, (rows - 1) * (NODE_HEIGHT + ROW_GAP) + NODE_HEIGHT);
}

function layoutDepths(
  ids: string[],
  edges: RouteTotalityGraphEdge[],
): Map<string, number> {
  const depth = new Map(ids.map((id) => [id, 0]));
  const incoming = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const edge of edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }

  const queue = ids.filter((id) => (incoming.get(id) ?? 0) === 0).sort(lexical);
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;

    visited.add(current);
    for (const next of outgoing.get(current) ?? []) {
      depth.set(next, Math.max(depth.get(next) ?? 0, (depth.get(current) ?? 0) + 1));
      incoming.set(next, (incoming.get(next) ?? 1) - 1);
      if (incoming.get(next) === 0) queue.push(next);
    }
  }

  return depth;
}

function centerOf(
  node: Pick<RouteTotalityLayoutNode, "x" | "y" | "width" | "height">,
): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function connectionPoint(
  node: RouteTotalityLayoutNode,
  other: { x: number; y: number },
  distanceFromCenter: number,
): { x: number; y: number } {
  const own = centerOf(node);
  const dx = other.x - own.x;
  const dy = other.y - own.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  return {
    x: own.x + dx / distance * distanceFromCenter,
    y: own.y + dy / distance * distanceFromCenter,
  };
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
