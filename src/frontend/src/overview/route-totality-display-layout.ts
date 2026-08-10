import type {
  RouteTotalityDisplayAnnotation,
  RouteTotalityDisplayBridge,
  RouteTotalityDisplayEdge,
  RouteTotalityDisplayModel,
  RouteTotalityDisplayNode,
} from "./route-totality-display-model";
import type { ComponentTopologyForceVector, ComponentTopologyLayoutSettings, ComponentTopologyLayoutStep } from "./component-topology-layout";
import { layoutRouteTotalitySurface } from "./route-totality-surface-layout";

const PADDING_X = 24;
const PADDING_Y = 24;
const ANNOTATION_GAP = 24;
const ANNOTATION_ROW_STEP = 38;

export type RouteTotalityDisplayLayoutNode = {
  id: string;
  node: RouteTotalityDisplayNode["node"];
  layer: RouteTotalityDisplayNode["layer"];
  depth: number;
  degree: number;
  radius: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RouteTotalityDisplayLayoutEdge = {
  id: string;
  edge: RouteTotalityDisplayEdge["edge"];
  layer: RouteTotalityDisplayEdge["layer"];
  fromNode: RouteTotalityDisplayLayoutNode;
  toNode: RouteTotalityDisplayLayoutNode;
};

export type RouteTotalityDisplayLayoutBridge = {
  bridge: RouteTotalityDisplayBridge;
  fromNode: RouteTotalityDisplayLayoutNode | null;
  toNode: RouteTotalityDisplayLayoutNode | null;
};

export type RouteTotalityDisplayLayoutAnnotation = {
  annotation: RouteTotalityDisplayAnnotation;
  anchorNode: RouteTotalityDisplayLayoutNode | null;
  anchorNodes: readonly RouteTotalityDisplayLayoutNode[];
  x: number | null;
  y: number | null;
};

export type RouteTotalityDisplayLayout = {
  model: RouteTotalityDisplayModel;
  nodes: readonly RouteTotalityDisplayLayoutNode[];
  evidenceNodes: readonly RouteTotalityDisplayLayoutNode[];
  edges: readonly RouteTotalityDisplayLayoutEdge[];
  evidenceEdges: readonly RouteTotalityDisplayLayoutEdge[];
  bridges: readonly RouteTotalityDisplayLayoutBridge[];
  annotations: readonly RouteTotalityDisplayLayoutAnnotation[];
  forces: readonly ComponentTopologyForceVector[];
  width: number;
  height: number;
};

export type RouteTotalityDisplayLayoutOptions = {
  settings?: ComponentTopologyLayoutSettings;
  steps?: readonly ComponentTopologyLayoutStep[];
};

export function layoutRouteTotalityDisplay(
  model: RouteTotalityDisplayModel,
  options: RouteTotalityDisplayLayoutOptions = {},
): RouteTotalityDisplayLayout {
  const surfaceDepths = layoutDepths(model.surfaceNodes, model.surfaceEdges);
  const surface = placeSurfaceNodes(model.surfaceNodes, model.surfaceEdges, surfaceDepths, options);
  const surfaceNodes = surface.nodes;
  const allNodeById = new Map(surfaceNodes.map((node) => [node.id, node] as const));
  const edges = layoutEdges(model.surfaceEdges, allNodeById);
  const bridges = model.bridges.map((bridge) => Object.freeze({
    bridge,
    fromNode: allNodeById.get(bridge.fromId) ?? null,
    toNode: allNodeById.get(bridge.toId) ?? null,
  }));
  const annotations = layoutAnnotations(model.annotations, allNodeById);
  const baseWidth = Math.max(
    960,
    ...[...allNodeById.values()].map((node) => node.x + node.width + PADDING_X),
  );
  const annotationWidth = Math.max(
    0,
    ...annotations.flatMap((annotation) => annotation.x === null ? [] : [annotation.x + 90]),
  );
  const baseHeight = Math.max(
    540,
    ...[...allNodeById.values()].map((node) => node.y + node.height + PADDING_Y),
  );
  return Object.freeze({
    model,
    nodes: freezeArray(surfaceNodes),
    evidenceNodes: freezeArray([]),
    edges: freezeArray(edges),
    evidenceEdges: freezeArray([]),
    bridges: freezeArray(bridges),
    annotations: freezeArray(annotations),
    forces: surface.forces,
    width: Math.max(baseWidth, annotationWidth),
    height: baseHeight,
  });
}

export const layoutRouteTotalityDisplayModel = layoutRouteTotalityDisplay;

export function routeTotalityDisplayEdgePath(edge: RouteTotalityDisplayLayoutEdge): string {
  const from = centerOf(edge.fromNode);
  const to = centerOf(edge.toNode);
  if (edge.edge.from === edge.edge.to) {
    return `M ${from.x} ${from.y} C ${from.x + 42} ${from.y - 34}, ${from.x + 42} ${from.y + 34}, ${from.x} ${from.y}`;
  }
  const start = connectionPoint(edge.fromNode, to);
  const end = connectionPoint(edge.toNode, from);
  const offset = (edge.edge.parallelIndex - (edge.edge.parallelCount - 1) / 2) * 12;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const bend = Math.max(30, Math.abs(dx) * 0.42);
    return `M ${start.x} ${start.y} C ${start.x + Math.sign(dx) * bend} ${start.y + offset}, ${end.x - Math.sign(dx) * bend} ${end.y + offset}, ${end.x} ${end.y}`;
  }
  const bend = Math.max(30, Math.abs(dy) * 0.42);
  return `M ${start.x} ${start.y} C ${start.x + offset} ${start.y + Math.sign(dy) * bend}, ${end.x + offset} ${end.y - Math.sign(dy) * bend}, ${end.x} ${end.y}`;
}

export function routeTotalityDisplayBridgePath(
  bridge: RouteTotalityDisplayLayoutBridge,
): string | null {
  if (!bridge.fromNode || !bridge.toNode) return null;
  const from = centerOf(bridge.fromNode);
  const to = centerOf(bridge.toNode);
  const curve = Math.max(38, Math.abs(to.x - from.x) * 0.28);
  return `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
}

function placeSurfaceNodes(
  nodes: readonly RouteTotalityDisplayNode[],
  edges: readonly RouteTotalityDisplayEdge[],
  depths: ReadonlyMap<string, number>,
  options: RouteTotalityDisplayLayoutOptions,
): { nodes: RouteTotalityDisplayLayoutNode[]; forces: readonly ComponentTopologyForceVector[] } {
  const surface = layoutRouteTotalitySurface(nodes, edges, depths, options.settings, options.steps);
  const placements = new Map(surface.placements.map((placement) => [placement.id, placement]));
  const placedNodes = nodes.flatMap((displayNode) => {
    const placement = placements.get(displayNode.id);
    if (!placement) return [];
    return [Object.freeze({
      id: displayNode.id,
      node: displayNode.node,
      layer: displayNode.layer,
      depth: depths.get(displayNode.id) ?? 0,
      degree: surfaceNodeDegree(displayNode.id, edges),
      radius: placement.radius,
      x: placement.x - placement.radius,
      y: placement.y - placement.radius,
      width: placement.radius * 2,
      height: placement.radius * 2,
    })];
  });
  return { nodes: placedNodes, forces: surface.forces };
}

function layoutEdges(
  edges: readonly RouteTotalityDisplayEdge[],
  nodesById: ReadonlyMap<string, RouteTotalityDisplayLayoutNode>,
): RouteTotalityDisplayLayoutEdge[] {
  return edges.flatMap((displayEdge) => {
    const fromNode = nodesById.get(displayEdge.edge.from);
    const toNode = nodesById.get(displayEdge.edge.to);
    return fromNode && toNode
      ? [Object.freeze({
        id: displayEdge.id,
        edge: displayEdge.edge,
        layer: displayEdge.layer,
        fromNode,
        toNode,
      })]
      : [];
  });
}

function layoutAnnotations(
  annotations: readonly RouteTotalityDisplayAnnotation[],
  nodesById: ReadonlyMap<string, RouteTotalityDisplayLayoutNode>,
): RouteTotalityDisplayLayoutAnnotation[] {
  const slotsByAnchor = new Map<string, number>();
  return annotations.map((annotation) => {
    const anchorNodes = annotation.anchorIds
      .map((id) => nodesById.get(id))
      .filter((node): node is RouteTotalityDisplayLayoutNode => Boolean(node));
    const anchorNode = annotation.anchorNodeId
      ? nodesById.get(annotation.anchorNodeId) ?? anchorNodes[0] ?? null
      : anchorNodes[0] ?? null;
    if (!anchorNode) return Object.freeze({ annotation, anchorNode: null, anchorNodes: freezeArray(anchorNodes), x: null, y: null });
    const slot = slotsByAnchor.get(anchorNode.id) ?? 0;
    slotsByAnchor.set(anchorNode.id, slot + 1);
    return Object.freeze({
      annotation,
      anchorNode,
      anchorNodes: freezeArray(anchorNodes),
      x: anchorNode.x + anchorNode.width + ANNOTATION_GAP,
      y: anchorNode.y + 20 + slot * ANNOTATION_ROW_STEP,
    });
  });
}

function layoutDepths(
  nodes: readonly RouteTotalityDisplayNode[],
  edges: readonly RouteTotalityDisplayEdge[],
): ReadonlyMap<string, number> {
  const depth = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  const incoming = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    incoming.set(edge.edge.to, (incoming.get(edge.edge.to) ?? 0) + 1);
    outgoing.set(edge.edge.from, [...(outgoing.get(edge.edge.from) ?? []), edge.edge.to]);
  }
  const queued = nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .sort(rootSort)
    .map((node) => node.id);
  const visited = new Set<string>();
  while (queued.length || visited.size < nodes.length) {
    if (!queued.length) {
      const next = nodes
        .filter((node) => !visited.has(node.id))
        .sort(rootSort)[0];
      if (next) queued.push(next.id);
    }
    const current = queued.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const next of outgoing.get(current) ?? []) {
      if (!visited.has(next)) {
        depth.set(next, Math.max(depth.get(next) ?? 0, (depth.get(current) ?? 0) + 1));
      }
      incoming.set(next, Math.max(0, (incoming.get(next) ?? 1) - 1));
      if (incoming.get(next) === 0 && !visited.has(next)) queued.push(next);
    }
  }
  return depth;
}

function surfaceNodeDegree(id: string, edges: readonly RouteTotalityDisplayEdge[]): number {
  return edges.filter((edge) => edge.edge.from === id || edge.edge.to === id).length;
}

function rootSort(left: RouteTotalityDisplayNode, right: RouteTotalityDisplayNode): number {
  return routeEntryRank(left) - routeEntryRank(right)
    || surfaceKindOrder(left.node.kind) - surfaceKindOrder(right.node.kind)
    || left.node.id.localeCompare(right.node.id);
}

function routeEntryRank(node: RouteTotalityDisplayNode): number {
  if (node.node.kind !== "occurrence" || !("ownership" in node.node.record)) return 1;
  return node.node.record.ownership === "scope-entry" ? 0 : 1;
}

function surfaceKindOrder(kind: RouteTotalityDisplayNode["node"]["kind"]): number {
  if (kind === "occurrence") return 0;
  if (kind === "framework-boundary") return 1;
  return 2;
}

function centerOf(node: Pick<RouteTotalityDisplayLayoutNode, "x" | "y" | "width" | "height">): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function connectionPoint(
  node: RouteTotalityDisplayLayoutNode,
  other: { x: number; y: number },
): { x: number; y: number } {
  const own = centerOf(node);
  const dx = other.x - own.x;
  const dy = other.y - own.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: node.x + (dx >= 0 ? node.width : 0), y: own.y };
  }
  return { x: own.x, y: node.y + (dy >= 0 ? node.height : 0) };
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}
