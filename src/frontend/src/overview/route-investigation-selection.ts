import type {
  RouteTotalityGraphEdge,
  RouteTotalityLayoutNode,
  RouteTotalityNodeKind,
  RouteTotalityNodeSource,
} from "./route-totality-model";

export type RouteInvestigationEdgeFamily = "render" | "data" | "boundary";

export type RouteInvestigationNodeSelection = {
  target: "node";
  kind: RouteTotalityNodeKind;
  recordId: string;
  graphId: string;
  source: RouteTotalityNodeSource;
  originRole?: string;
};

export type RouteInvestigationEdgeSelection = {
  target: "edge";
  kind: "render-edge" | "data-edge" | "boundary-edge";
  family: RouteInvestigationEdgeFamily;
  recordId: string;
  graphId: string;
  source: RouteTotalityNodeSource;
};

export type RouteInvestigationSelection =
  | RouteInvestigationNodeSelection
  | RouteInvestigationEdgeSelection
  | null;

export function routeInvestigationSelectionForNode(
  node: RouteTotalityLayoutNode,
): RouteInvestigationNodeSelection {
  const recordId = "id" in node.record ? node.record.id : node.record.elementId;
  return {
    target: "node",
    kind: node.kind,
    recordId,
    graphId: node.id,
    source: node.source,
    originRole: node.kind === "origin" && "role" in node.record
      ? node.record.role
      : undefined,
  };
}

export function routeInvestigationSelectionForEdge(
  edge: RouteTotalityGraphEdge,
): RouteInvestigationEdgeSelection {
  return {
    target: "edge",
    kind: `${edge.family}-edge`,
    family: edge.family,
    recordId: edge.id,
    graphId: `edge:${edge.family}:${edge.id}`,
    source: edge.source,
  };
}

export function sameRouteInvestigationSelection(
  left: RouteInvestigationSelection,
  right: RouteInvestigationSelection,
): boolean {
  return Boolean(left && right && left.graphId === right.graphId);
}
