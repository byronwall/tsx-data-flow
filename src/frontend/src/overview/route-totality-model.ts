import type { RouteTotality } from "../../../api/contracts";
import type { HiddenComponentPolicy } from "../../../api/hidden-component-policy";
import { buildRouteTotalityLayout } from "./route-totality-layout";
import {
  assignParallelIndices as assignParallelIndicesForLayout,
  layoutRouteTotalityNodes as layoutRouteTotalityNodesForLayout,
  routeTotalityEdgePathForLayout as edgePathForLayout,
} from "./route-totality-layout-geometry";

export type RouteTotalitySurface = Extract<
  RouteTotality["occurrenceSurface"],
  { definitions: unknown[] }
>;
export type RouteTotalityEvidence = Extract<
  RouteTotality["evidenceSlice"],
  { elements: unknown[] }
>;
export type RouteTotalityLocation = RouteTotality["scopeProof"][number]["locations"][number];
export type RouteTotalityProof = RouteTotality["scopeProof"][number];
export type RouteTotalityOccurrence = RouteTotalitySurface["occurrences"][number];
export type RouteTotalityBoundary = RouteTotalitySurface["frameworkBoundaries"][number];
export type RouteTotalityTerminal = RouteTotalitySurface["terminals"][number];
export type RouteTotalityEvidenceElement = RouteTotalityEvidence["elements"][number];
export type RouteTotalityEvidenceOrigin = RouteTotalityEvidence["origins"][number];
export type RouteTotalityEvidenceGap = RouteTotalityEvidence["gaps"][number];
export type RouteTotalityGap = RouteTotality["gaps"][number];
export type RouteTotalityNodeRecord =
  | RouteTotalityOccurrence
  | RouteTotalityBoundary
  | RouteTotalityTerminal
  | RouteTotalityEvidenceElement
  | RouteTotalityEvidenceOrigin
  | RouteTotalityEvidenceGap
  | RouteTotalityGap;

export type RouteTotalityNodeKind =
  | "origin"
  | "occurrence"
  | "framework-boundary"
  | "terminal"
  | "gap"
  | "evidence-element";
export type RouteTotalityNodeSource =
  | "route-totality"
  | "occurrence-surface"
  | "evidence-slice"
  | "context-continuity";
export type RouteTotalityEdgeFamily = "render" | "data" | "boundary";
export type RouteTotalityZoom = "low" | "high";
export type RouteTotalityStatus = "proven" | "partial" | "unsupported" | "unknown";

export type RouteTotalityNode = {
  id: string;
  kind: RouteTotalityNodeKind;
  source: RouteTotalityNodeSource;
  label: string;
  compactLabel: string;
  compactSummary: string;
  detailLines: string[];
  status: RouteTotalityStatus;
  location: RouteTotalityLocation | null;
  relatedIds: string[];
  reuseCount: number | null;
  record: RouteTotalityNodeRecord;
};

export type RouteTotalityLayoutNode = RouteTotalityNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RouteTotalityGraphEdge = {
  id: string;
  from: string;
  to: string;
  family: RouteTotalityEdgeFamily;
  kind: string;
  label: string;
  detail: string;
  source: RouteTotalityNodeSource;
  sourceFrom: string;
  sourceTo: string;
  status: RouteTotalityStatus;
  locations: RouteTotalityLocation[];
  proof: RouteTotalityProof | null;
  parallelIndex: number;
  parallelCount: number;
};

export type RouteTotalityLayoutEdge = RouteTotalityGraphEdge & {
  fromNode: RouteTotalityLayoutNode;
  toNode: RouteTotalityLayoutNode;
};

export type RouteTotalitySelection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;

export type RouteTotalityOmission = {
  id: string;
  source: RouteTotalityNodeSource;
  label: string;
  reason: string | null;
  count: number | null;
  status: "partial" | "unsupported" | "unavailable";
  locations: RouteTotalityLocation[];
};

export type RouteTotalityCountSummary = {
  key: keyof RouteTotality["counts"];
  label: string;
  emitted: number;
  total: number | null;
  totalStatus: "exact" | "lower-bound" | "unknown";
  text: string;
};

export type RouteTotalityGraphSummary = {
  status: RouteTotality["status"];
  statusLabel: string;
  note: string;
  route: RouteTotality["route"] | null;
  counts: RouteTotality["counts"] | null;
  countSummaries: RouteTotalityCountSummary[];
  primaryNodeCount: number;
  evidenceNodeCount: number;
  nodeCount: number;
  nodeCounts: Record<RouteTotalityNodeKind, number>;
  edgeCounts: {
    render: number;
    data: number;
    boundary: number;
    total: number;
    terminalLinks: number;
  };
  unresolvedEdgeIds: string[];
  gapCount: number;
  omissions: RouteTotalityOmission[];
};

export type RouteTotalityGraph = {
  nodes: RouteTotalityNode[];
  edges: RouteTotalityGraphEdge[];
  primaryNodeIds: string[];
  evidenceNodeIds: string[];
  summary: RouteTotalityGraphSummary;
};

export type RouteTotalityUiProjection = {
  mode: "hidden" | "all";
  hiddenNodeIds: ReadonlySet<string>;
  hiddenEdgeIds: ReadonlySet<string>;
  hiddenToVisibleNodeId: ReadonlyMap<string, string>;
  collapsedRootIds: ReadonlySet<string>;
  hiddenOccurrenceIds: ReadonlySet<string>;
  availableHiddenOccurrenceCount: number;
  availableHiddenNodeCount: number;
};

export type RouteTotalityStackProjection = {
  condensedNodeIds: ReadonlySet<string>;
  condensedEdgeIds: ReadonlySet<string>;
  condensedToVisibleNodeId: ReadonlyMap<string, string>;
  modifiedParentNodeIds: ReadonlySet<string>;
};

export type RouteTotalityLayout = RouteTotalityGraph & {
  nodes: RouteTotalityLayoutNode[];
  edges: RouteTotalityLayoutEdge[];
  width: number;
  height: number;
  uiProjection: RouteTotalityUiProjection;
  stackProjection: RouteTotalityStackProjection;
  nodeRedirects: ReadonlyMap<string, string>;
};

export type RouteTotalityLayoutOptions = {
  hiddenComponentPolicy?: HiddenComponentPolicy | null;
  genericUiMode?: "hidden" | "all";
};

export const ROUTE_TOTALITY_MIN_VIEW = { width: 960, height: 540 } as const;

export function assignParallelIndices(edges: RouteTotalityGraphEdge[]): void {
  assignParallelIndicesForLayout(edges);
}

export function layoutRouteTotalityNodes(
  nodes: RouteTotalityNode[],
  edges: RouteTotalityGraphEdge[],
  primaryNodeIds: string[],
  evidenceNodeIds: string[],
): { nodes: RouteTotalityLayoutNode[]; width: number; height: number } {
  return layoutRouteTotalityNodesForLayout(
    nodes,
    edges,
    primaryNodeIds,
    evidenceNodeIds,
  );
}

export function routeTotalityEdgePathForLayout(edge: RouteTotalityLayoutEdge): string {
  return edgePathForLayout(edge);
}

export function layoutRouteTotality(totality: RouteTotality | null, options: RouteTotalityLayoutOptions = {}): RouteTotalityLayout {
  return buildRouteTotalityLayout(totality, options);
}

export function routeTotalityPayloadIdentity(
  totality: RouteTotality | null,
  generation: number | null,
): string {
  return JSON.stringify([generation, totality]);
}

export function routeTotalityNodeLabel(
  node: RouteTotalityNode,
  zoom: RouteTotalityZoom,
): string {
  return zoom === "high" ? node.label : node.compactLabel;
}

export function routeTotalityNodeSummary(
  node: RouteTotalityNode,
  zoom: RouteTotalityZoom,
): string {
  return zoom === "high" ? node.detailLines.join(" · ") : node.compactSummary;
}

export function routeTotalityZoomLevel(scale: number): RouteTotalityZoom {
  return scale >= 1.25 ? "high" : "low";
}

export function routeTotalityNodeKindLabel(kind: RouteTotalityNodeKind): string {
  if (kind === "framework-boundary") return "Framework boundary";
  if (kind === "evidence-element") return "Evidence element";
  return `${kind[0].toUpperCase()}${kind.slice(1)}`;
}

export function routeTotalityEdgeLabel(edge: RouteTotalityGraphEdge): string {
  return edge.label || humanize(edge.kind);
}

export function routeTotalityLocationLabel(
  location: RouteTotalityLocation | null | undefined,
): string {
  return location
    ? `${location.file}:${location.line}:${location.column}`
    : "Location unavailable";
}

export function routeTotalityProofKindsForNode(
  layout: RouteTotalityLayout,
  nodeId: string,
): string[] {
  return [
    ...new Set(
      layout.edges
        .filter((edge) => edge.from === nodeId || edge.to === nodeId)
        .flatMap((edge) => (edge.proof ? [edge.proof.kind] : [])),
    ),
  ];
}

export function routeTotalityEdgePath(edge: RouteTotalityLayoutEdge): string {
  return routeTotalityEdgePathForLayout(edge);
}

function humanize(value: string): string {
  return value.replaceAll("-", " ");
}
