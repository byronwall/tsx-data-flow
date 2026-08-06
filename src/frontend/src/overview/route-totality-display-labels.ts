import {
  routeTotalityNodeLabel,
  routeTotalityNodeSummary,
  type RouteTotalityZoom,
} from "./route-totality-model";
import type { RouteTotalityDisplayLayoutNode } from "./route-totality-display-layout";

export type RouteTotalityDisplayZoom = "low" | "medium" | "high";

export const DEFAULT_ROUTE_TOTALITY_VISIBLE_LABELS = 30;

const LABEL_BUDGET_STEP = 15;
const LABEL_ZOOM_STEP = 1.25;
const ALL_LABELS_ZOOM_STEP = 5;

export function routeTotalityDisplayZoomLevel(scale: number): RouteTotalityDisplayZoom {
  if (scale >= 2.5) return "high";
  if (scale >= LABEL_ZOOM_STEP) return "medium";
  return "low";
}

export function routeTotalityDisplayLabelBudget(cameraScale: number, nodeCount: number): number {
  if (nodeCount <= DEFAULT_ROUTE_TOTALITY_VISIBLE_LABELS) return nodeCount;
  const normalizedScale = Math.max(1, cameraScale);
  const zoomStep = Math.max(0, Math.floor(Math.log(normalizedScale) / Math.log(LABEL_ZOOM_STEP) + Number.EPSILON * 8));
  if (zoomStep >= ALL_LABELS_ZOOM_STEP) return nodeCount;
  return Math.min(nodeCount, DEFAULT_ROUTE_TOTALITY_VISIBLE_LABELS + zoomStep * LABEL_BUDGET_STEP);
}

export function selectRouteTotalityDisplayLabelIds(
  nodes: readonly RouteTotalityDisplayLayoutNode[],
  options: {
    cameraScale?: number;
    selectedNodeIds?: ReadonlySet<string>;
    focusedNodeIds?: ReadonlySet<string>;
    participantNodeIds?: ReadonlySet<string>;
    nearbyNodeIds?: ReadonlySet<string>;
    includeEvidence?: boolean;
    limit?: number;
  } = {},
): ReadonlySet<string> {
  const selectedNodeIds = options.selectedNodeIds ?? new Set<string>();
  const focusedNodeIds = options.focusedNodeIds ?? new Set<string>();
  const participantNodeIds = options.participantNodeIds ?? new Set<string>();
  const nearbyNodeIds = options.nearbyNodeIds ?? new Set<string>();
  const candidates = nodes.filter((node) => options.includeEvidence || node.layer === "surface");
  const limit = Math.max(
    selectedNodeIds.size + focusedNodeIds.size,
    Math.round(options.limit ?? routeTotalityDisplayLabelBudget(options.cameraScale ?? 1, candidates.length)),
  );
  const ranked = candidates.slice().sort((left, right) => (
    labelPriority(left, selectedNodeIds, focusedNodeIds, participantNodeIds, nearbyNodeIds)
      - labelPriority(right, selectedNodeIds, focusedNodeIds, participantNodeIds, nearbyNodeIds)
    || right.degree - left.degree
    || left.depth - right.depth
    || left.node.compactLabel.localeCompare(right.node.compactLabel)
    || left.id.localeCompare(right.id)
  ));
  const visible = new Set<string>();
  for (const node of ranked) {
    if (visible.size >= limit) break;
    visible.add(node.id);
  }
  for (const node of candidates) {
    if (selectedNodeIds.has(node.id) || focusedNodeIds.has(node.id)) visible.add(node.id);
  }
  return visible;
}

export function routeTotalityDisplayNodeLabel(
  node: RouteTotalityDisplayLayoutNode,
  zoom: RouteTotalityDisplayZoom,
): string {
  return routeTotalityNodeLabel(node.node, toRouteTotalityZoom(zoom));
}

export function routeTotalityDisplayNodeSummary(
  node: RouteTotalityDisplayLayoutNode,
  zoom: RouteTotalityDisplayZoom,
): string {
  return routeTotalityNodeSummary(node.node, toRouteTotalityZoom(zoom));
}

export function routeTotalityDisplayShowsExactEvidence(zoom: RouteTotalityDisplayZoom): boolean {
  return zoom === "high";
}

function labelPriority(
  node: RouteTotalityDisplayLayoutNode,
  selectedNodeIds: ReadonlySet<string>,
  focusedNodeIds: ReadonlySet<string>,
  participantNodeIds: ReadonlySet<string>,
  nearbyNodeIds: ReadonlySet<string>,
): number {
  if (selectedNodeIds.has(node.id)) return 0;
  if (focusedNodeIds.has(node.id)) return 1;
  if (participantNodeIds.has(node.id)) return 2;
  if (nearbyNodeIds.has(node.id)) return 3;
  if (node.layer === "surface") return node.depth === 0 ? 4 : 5;
  return 6;
}

function toRouteTotalityZoom(zoom: RouteTotalityDisplayZoom): RouteTotalityZoom {
  return zoom === "high" ? "high" : "low";
}
