import type { ComponentTopology, ComponentTopologyNode } from "./component-topology-model";

export const DEFAULT_VISIBLE_TOPOLOGY_LABELS = 30;

const LABEL_BUDGET_STEP = 15;
const LABEL_ZOOM_STEP = 1.25;
const ALL_LABELS_ZOOM_STEP = 5;

export function topologyLabelBudget(cameraScale: number, nodeCount: number) {
  if (nodeCount <= DEFAULT_VISIBLE_TOPOLOGY_LABELS) return nodeCount;
  const normalizedScale = Math.max(1, cameraScale);
  const zoomStep = Math.max(0, Math.floor(Math.log(normalizedScale) / Math.log(LABEL_ZOOM_STEP) + Number.EPSILON * 8));
  if (zoomStep >= ALL_LABELS_ZOOM_STEP) return nodeCount;
  return Math.min(nodeCount, DEFAULT_VISIBLE_TOPOLOGY_LABELS + zoomStep * LABEL_BUDGET_STEP);
}

export function selectVisibleTopologyLabelIds(
  topology: ComponentTopology,
  options: {
    selectedNodeId?: string | null;
    participantNodeIds?: ReadonlySet<string>;
    limit?: number;
  } = {},
) {
  const limit = Math.max(0, Math.round(options.limit ?? DEFAULT_VISIBLE_TOPOLOGY_LABELS));
  const selectedNodeId = options.selectedNodeId ?? null;
  const participantNodeIds = options.participantNodeIds ?? new Set<string>();
  const ranked = [...topology.nodes].sort((left, right) => {
    const priorityDifference = labelPriority(left, selectedNodeId, participantNodeIds)
      - labelPriority(right, selectedNodeId, participantNodeIds);
    if (priorityDifference) return priorityDifference;
    const degreeDifference = degree(right) - degree(left);
    if (degreeDifference) return degreeDifference;
    const depthDifference = left.depth - right.depth;
    if (depthDifference) return depthDifference;
    const labelDifference = lexical(left.label, right.label);
    return labelDifference || lexical(left.id, right.id);
  });
  return new Set(ranked.slice(0, limit).map((node) => node.id));
}

function labelPriority(node: ComponentTopologyNode, selectedNodeId: string | null, participantNodeIds: ReadonlySet<string>) {
  if (node.id === selectedNodeId) return 0;
  if (node.routeEntry) return 1;
  if (node.kind !== "component") return 2;
  if (participantNodeIds.has(node.id)) return 3;
  return 4;
}

function degree(node: ComponentTopologyNode) {
  return node.incomingCount + node.outgoingCount;
}

function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
