import {
  routeTotalityNodeLabel,
  routeTotalityNodeSummary,
  type RouteTotalityZoom,
} from "./route-totality-model";
import type { RouteTotalityDisplayLayoutNode } from "./route-totality-display-layout";
import { sourceLocationPriority } from "./component-topology-labels";

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
    fieldSummaryNodeIds?: ReadonlySet<string>;
    includeEvidence?: boolean;
    limit?: number;
  } = {},
): ReadonlySet<string> {
  const selectedNodeIds = options.selectedNodeIds ?? new Set<string>();
  const focusedNodeIds = options.focusedNodeIds ?? new Set<string>();
  const participantNodeIds = options.participantNodeIds ?? new Set<string>();
  const nearbyNodeIds = options.nearbyNodeIds ?? new Set<string>();
  const fieldSummaryNodeIds = options.fieldSummaryNodeIds ?? new Set<string>();
  const candidates = nodes.filter((node) => options.includeEvidence || node.layer === "surface");
  const limit = Math.max(
    selectedNodeIds.size + focusedNodeIds.size,
    Math.round(options.limit ?? routeTotalityDisplayLabelBudget(options.cameraScale ?? 1, candidates.length)),
  );
  const ranked = candidates.slice().sort((left, right) => (
    labelPriority(left, selectedNodeIds, focusedNodeIds, participantNodeIds, nearbyNodeIds)
      - labelPriority(right, selectedNodeIds, focusedNodeIds, participantNodeIds, nearbyNodeIds)
    || sourceLocationDifference(left, right)
    || right.degree - left.degree
    || left.depth - right.depth
    || left.node.compactLabel.localeCompare(right.node.compactLabel)
    || left.id.localeCompare(right.id)
  ));
  const visible = new Set<string>();
  const occupied: LabelBox[] = [];
  for (const node of ranked) {
    const priority = labelPriority(node, selectedNodeIds, focusedNodeIds, participantNodeIds, nearbyNodeIds);
    if (visible.size >= limit && priority > 1) break;
    const box = labelBox(node, fieldSummaryNodeIds.has(node.id));
    if (priority > 1 && occupied.some((other) => boxesOverlap(box, other))) continue;
    visible.add(node.id);
    occupied.push(box);
  }
  for (const node of candidates) {
    if (selectedNodeIds.has(node.id) || focusedNodeIds.has(node.id)) visible.add(node.id);
  }
  return visible;
}

function sourceLocationDifference(left: RouteTotalityDisplayLayoutNode, right: RouteTotalityDisplayLayoutNode) {
  if (left.node.kind !== "occurrence" || right.node.kind !== "occurrence") return 0;
  return sourceLocationPriority(definitionSourcePath(left))
    - sourceLocationPriority(definitionSourcePath(right));
}

function definitionSourcePath(node: RouteTotalityDisplayLayoutNode) {
  if (node.node.kind !== "occurrence") return node.node.location?.file ?? null;
  const record = node.node.record;
  return "definitionSourceIdentity" in record
    ? record.definitionSourceIdentity
    : node.node.location?.file ?? null;
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
  if (node.layer === "surface") return 4;
  return 6;
}

type LabelBox = { left: number; top: number; right: number; bottom: number };

function labelBox(node: RouteTotalityDisplayLayoutNode, hasFieldSummary: boolean): LabelBox {
  const label = clip(routeTotalityDisplayNodeLabel(node, "low"), 24);
  const left = node.x + node.width + 5;
  const top = node.y + node.height / 2 - 8;
  return {
    left,
    top,
    right: left + Math.max(24, label.length * 7.5),
    bottom: top + (hasFieldSummary ? 30 : 16),
  };
}

function boxesOverlap(left: LabelBox, right: LabelBox): boolean {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function clip(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit - 1) + "…" : value;
}

function toRouteTotalityZoom(zoom: RouteTotalityDisplayZoom): RouteTotalityZoom {
  return zoom === "high" ? "high" : "low";
}
