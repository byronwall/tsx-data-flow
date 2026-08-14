import type {
  RouteTotalityGraphEdge,
  RouteTotalityLayoutNode,
  RouteTotalityNodeKind,
  RouteTotalityNodeSource,
} from "./route-totality-model";

export type RouteInvestigationEdgeFamily = "render" | "data" | "boundary" | "context";

export type RouteInvestigationNodeSelection = {
  target: "node";
  kind: RouteTotalityNodeKind;
  recordId: string;
  graphId: string;
  source: RouteTotalityNodeSource;
  originRole?: string;
};

export type RouteInvestigationContextSelection = {
  target: "context";
  kind: "context";
  recordId: string;
  graphId: string;
  source: "context-continuity";
};

export type RouteInvestigationEdgeSelection = {
  target: "edge";
  kind: "render-edge" | "data-edge" | "boundary-edge" | "context-edge";
  family: RouteInvestigationEdgeFamily;
  recordId: string;
  graphId: string;
  source: RouteTotalityNodeSource;
  fromNodeId: string | null;
  toNodeId: string | null;
};

export type RouteInvestigationSelection =
  | RouteInvestigationNodeSelection
  | RouteInvestigationContextSelection
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
    fromNodeId: edge.from,
    toNodeId: edge.to,
  };
}

export function routeInvestigationSelectionForContextDeclaration(contextId: string): RouteInvestigationContextSelection {
  return {
    target: "context",
    kind: "context",
    recordId: contextId,
    graphId: `context:${contextId}`,
    source: "context-continuity",
  };
}

export function routeInvestigationSelectionForContextOccurrence(
  contextId: string,
  occurrenceId: string,
  kind: "provider" | "consumer",
): RouteInvestigationContextSelection {
  return {
    target: "context",
    kind: "context",
    recordId: `${contextId}:${kind}:${occurrenceId}`,
    graphId: `context-${kind}:${contextId}:${occurrenceId}`,
    source: "context-continuity",
  };
}

export function routeInvestigationSelectionForContextLink(
  contextLinkId: string,
  fromNodeId: string | null,
  toNodeId: string | null,
): RouteInvestigationEdgeSelection {
  return {
    target: "edge",
    kind: "context-edge",
    family: "context",
    recordId: contextLinkId,
    graphId: `context-link:${contextLinkId}`,
    source: "context-continuity",
    fromNodeId,
    toNodeId,
  };
}

export function sameRouteInvestigationSelection(
  left: RouteInvestigationSelection,
  right: RouteInvestigationSelection,
): boolean {
  return Boolean(left && right && left.graphId === right.graphId);
}
