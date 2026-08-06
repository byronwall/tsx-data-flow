import type { RouteShadowEvidence } from "../../../api/contracts";

export type ShadowEvidenceNode = RouteShadowEvidence["nodes"][number];
export type ShadowEvidenceEdge = RouteShadowEvidence["edges"][number];
export type ShadowEvidenceGap = RouteShadowEvidence["gaps"][number];
export type ShadowNodeVisualKind = "origin" | "component-occurrence" | "boundary" | "terminal";

export type ShadowGraphNode = ShadowEvidenceNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  visualKind: ShadowNodeVisualKind;
};

export type ShadowGraphEdge = ShadowEvidenceEdge & {
  fromNode: ShadowGraphNode;
  toNode: ShadowGraphNode;
};

export type ShadowGraphGap = ShadowEvidenceGap & {
  x: number;
  y: number;
  fromNode: ShadowGraphNode | null;
  toNode: ShadowGraphNode | null;
};

export type ShadowEvidenceLayout = {
  nodes: ShadowGraphNode[];
  edges: ShadowGraphEdge[];
  gaps: ShadowGraphGap[];
  width: number;
  height: number;
};

export type ShadowSelection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "gap"; id: string }
  | null;

const NODE_WIDTH = 184;
const NODE_HEIGHT = 84;
const COLUMN_GAP = 28;
const ROW_GAP = 86;
const PADDING = 42;
const COLUMNS = 5;
const BOUNDARY_KINDS = new Set([
  "parsed-json-result",
  "capture-page",
  "server-query-result",
  "resource-result",
  "loaded-detail",
  "context-provider-value",
  "context-member",
]);

export function layoutShadowEvidence(evidence: RouteShadowEvidence | null): ShadowEvidenceLayout {
  if (!evidence) return { nodes: [], edges: [], gaps: [], width: 960, height: 540 };
  const nodes = evidence.nodes.map((node, index) => {
    const position = positionForIndex(index);
    return {
      ...node,
      ...position,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      visualKind: shadowNodeVisualKind(node),
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = evidence.edges.flatMap((edge) => {
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    return fromNode && toNode ? [{ ...edge, fromNode, toNode }] : [];
  });
  const gaps = evidence.gaps.map((gap) => {
    const fromNode = nodeById.get(gap.from) ?? null;
    const toNode = gap.to ? nodeById.get(gap.to) ?? null : null;
    const target = toNode ? centerOf(toNode) : nextGapTarget(nodes, fromNode);
    return { ...gap, x: target.x, y: target.y, fromNode, toNode };
  });
  const rows = Math.max(1, Math.ceil(nodes.length / COLUMNS));
  const width = Math.max(960, PADDING * 2 + COLUMNS * NODE_WIDTH + (COLUMNS - 1) * COLUMN_GAP);
  const height = Math.max(540, PADDING * 2 + rows * NODE_HEIGHT + (rows - 1) * ROW_GAP);
  return { nodes, edges, gaps, width, height };
}

export function shadowNodeVisualKind(node: ShadowEvidenceNode): ShadowNodeVisualKind {
  if (node.role === "origin") return "origin";
  if (node.role === "terminal") return "terminal";
  return BOUNDARY_KINDS.has(node.kind) ? "boundary" : "component-occurrence";
}

export function shadowNodeKindLabel(kind: ShadowNodeVisualKind) {
  if (kind === "component-occurrence") return "Component occurrence";
  return `${kind[0].toUpperCase()}${kind.slice(1)}`;
}

export function shadowProofKindsForNode(evidence: RouteShadowEvidence, nodeId: string) {
  return [...new Set(
    evidence.edges
      .filter((edge) => edge.from === nodeId || edge.to === nodeId)
      .map((edge) => edge.proof.kind),
  )];
}

export function shadowLocationLabel(location: ShadowEvidenceNode["location"] | null | undefined) {
  return location ? `${location.file}:${location.line}:${location.column}` : "Location unavailable";
}

export function shadowProofLocationLabel(location: RouteShadowEvidence["edges"][number]["proof"]["locations"][number]) {
  return `${location.file}:${location.line}:${location.column}`;
}

export function shadowEdgeLabel(edge: ShadowEvidenceEdge) {
  return edge.kind.replaceAll("-", " ");
}

export function shadowGapReasonLabel(reason: ShadowEvidenceGap["reason"]) {
  return reason.replaceAll("-", " ");
}

export function clipShadowLabel(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export function shadowEdgePath(from: ShadowGraphNode, to: ShadowGraphNode) {
  const start = connectionPoint(from, centerOf(to));
  const end = connectionPoint(to, centerOf(from));
  if (Math.abs(start.y - end.y) < 2) {
    const distance = Math.max(24, Math.abs(end.x - start.x) * 0.45);
    const direction = end.x >= start.x ? 1 : -1;
    return `M ${start.x} ${start.y} C ${start.x + distance * direction} ${start.y}, ${end.x - distance * direction} ${end.y}, ${end.x} ${end.y}`;
  }
  const verticalDistance = Math.max(26, Math.abs(end.y - start.y) * 0.45);
  const direction = end.y >= start.y ? 1 : -1;
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + verticalDistance * direction}, ${end.x} ${end.y - verticalDistance * direction}, ${end.x} ${end.y}`;
}

export function shadowGapPath(gap: ShadowGraphGap) {
  if (!gap.fromNode) return "";
  const start = connectionPoint(gap.fromNode, { x: gap.x, y: gap.y });
  return `M ${start.x} ${start.y} L ${gap.x} ${gap.y}`;
}

function positionForIndex(index: number) {
  const row = Math.floor(index / COLUMNS);
  const order = index % COLUMNS;
  const column = row % 2 === 0 ? order : COLUMNS - order - 1;
  return {
    x: PADDING + column * (NODE_WIDTH + COLUMN_GAP),
    y: PADDING + row * (NODE_HEIGHT + ROW_GAP),
  };
}

function nextGapTarget(nodes: ShadowGraphNode[], fromNode: ShadowGraphNode | null) {
  if (!fromNode) return { x: 480, y: 270 };
  const index = nodes.findIndex((node) => node.id === fromNode.id);
  if (index < 0) return { x: fromNode.x + fromNode.width + COLUMN_GAP, y: fromNode.y + fromNode.height / 2 };
  const position = positionForIndex(index + 1);
  return { x: position.x + NODE_WIDTH / 2, y: position.y + NODE_HEIGHT / 2 };
}

function centerOf(node: ShadowGraphNode) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function connectionPoint(node: Pick<ShadowGraphNode, "x" | "y" | "width" | "height">, other: { x: number; y: number }) {
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  const deltaX = other.x - centerX;
  const deltaY = other.y - centerY;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return { x: node.x + (deltaX >= 0 ? node.width : 0), y: centerY };
  }
  return { x: centerX, y: node.y + (deltaY >= 0 ? node.height : 0) };
}
