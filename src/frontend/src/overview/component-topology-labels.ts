import type { ComponentTopology, ComponentTopologyNode } from "./component-topology-model";

export const DEFAULT_VISIBLE_TOPOLOGY_LABELS = 30;

const LABEL_BUDGET_STEP = 15;
const LABEL_ZOOM_STEP = 1.25;
const ALL_LABELS_ZOOM_STEP = 5;
const ORDINARY_COMPONENT_PRIORITY = 4;

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
    const leftPriority = labelPriority(left, selectedNodeId, participantNodeIds);
    const rightPriority = labelPriority(right, selectedNodeId, participantNodeIds);
    const priorityDifference = leftPriority - rightPriority;
    if (priorityDifference) return priorityDifference;
    if (leftPriority === ORDINARY_COMPONENT_PRIORITY) {
      const sourceLocationDifference = componentSourcePriority(left) - componentSourcePriority(right);
      if (sourceLocationDifference) return sourceLocationDifference;
    }
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
  return ORDINARY_COMPONENT_PRIORITY;
}

function componentSourcePriority(node: ComponentTopologyNode) {
  if (!node.file) return 4;
  if (!isSourceResolvedComponent(node.sourceIdentity)) return 3;
  return sourceLocationPriority(node.file);
}

export function sourceLocationPriority(file: string | null) {
  if (!file) return 4;
  const segments = file
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  if (segments.includes("styled-system")) return 2;
  if (segments.includes("ui")) return 1;
  if (segments.includes("node_modules")) return 3;
  return 0;
}

function isSourceResolvedComponent(sourceIdentity: string | null) {
  return sourceIdentity?.startsWith("rendered-component:")
    || sourceIdentity?.startsWith("rendered-component-occurrence:")
    || false;
}

function degree(node: ComponentTopologyNode) {
  return node.incomingCount + node.outgoingCount;
}

function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
