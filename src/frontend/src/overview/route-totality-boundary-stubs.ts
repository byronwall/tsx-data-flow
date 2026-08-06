import type {
  RouteTotalityEdgeFamily,
  RouteTotalityLayout,
  RouteTotalityLayoutNode,
} from "./route-totality-model";
import type { RouteTotalityAdjacency } from "./route-totality-emphasis";

type BoundaryStubFamily = RouteTotalityEdgeFamily | "bridge";

export type RouteTotalityBoundaryStub = {
  id: string;
  focusedNodeId: string;
  direction: "incoming" | "outgoing";
  family: BoundaryStubFamily;
  count: number;
  label: string;
  detail: string;
  edgeIds: readonly string[];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  textAnchor: "start" | "end";
};

type BoundaryStubGroup = {
  focused: RouteTotalityLayoutNode;
  hidden: RouteTotalityLayoutNode;
  direction: "incoming" | "outgoing";
  family: BoundaryStubFamily;
  edgeIds: string[];
  labels: string[];
};

export function buildRouteTotalityBoundaryStubs(
  layout: RouteTotalityLayout,
  adjacency: RouteTotalityAdjacency,
  focusNodeIds: ReadonlySet<string>,
  focusEdgeIds: ReadonlySet<string>,
): readonly RouteTotalityBoundaryStub[] {
  const layoutNodes = layout.nodes as RouteTotalityLayoutNode[];
  const nodesById = new Map(layoutNodes.map((node) => [node.id, node]));
  const groups = new Map<string, BoundaryStubGroup>();
  for (const edge of adjacency.edges) {
    if (focusEdgeIds.has(edge.id)) continue;
    const fromFocused = focusNodeIds.has(edge.from);
    const toFocused = focusNodeIds.has(edge.to);
    if (fromFocused === toFocused) continue;
    const focusedId = toFocused ? edge.to : edge.from;
    const hiddenId = toFocused ? edge.from : edge.to;
    const focused = nodesById.get(focusedId);
    const hidden = nodesById.get(hiddenId);
    if (!focused || !hidden) continue;
    const direction = toFocused ? "incoming" : "outgoing";
    const key = `${focused.id}:${direction}:${edge.family}`;
    const group: BoundaryStubGroup = groups.get(key) ?? {
      focused,
      hidden,
      direction,
      family: edge.family,
      edgeIds: [],
      labels: [],
    };
    group.edgeIds.push(edge.id);
    if (!group.labels.includes(edge.label)) group.labels.push(edge.label);
    groups.set(key, group);
  }
  return Object.freeze([...groups.values()]
    .sort((left, right) => left.focused.id.localeCompare(right.focused.id) || left.direction.localeCompare(right.direction) || left.family.localeCompare(right.family))
    .map((group) => {
      const from = centerOf(group.focused);
      const to = centerOf(group.hidden);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      const stubLength = Math.min(58, Math.max(30, length * 0.2));
      const x2 = from.x + dx / length * stubLength;
      const y2 = from.y + dy / length * stubLength;
      return {
        id: `boundary-stub:${group.focused.id}:${group.direction}:${group.family}`,
        focusedNodeId: group.focused.id,
        direction: group.direction,
        family: group.family,
        count: group.edgeIds.length,
        label: `${group.edgeIds.length} ${group.direction} ${group.family} connection${group.edgeIds.length === 1 ? "" : "s"}`,
        detail: group.labels.join(" · "),
        edgeIds: Object.freeze([...group.edgeIds]),
        x1: from.x,
        y1: from.y,
        x2,
        y2,
        textAnchor: x2 < from.x ? "end" : "start",
      } satisfies RouteTotalityBoundaryStub;
    }));
}

function centerOf(node: RouteTotalityLayoutNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}
