import type { RouteTotality } from "../../../api/contracts";
import { routeTotalityBridgeEndpointNodeId } from "./route-totality-emphasis";
import type {
  RouteTotalityLayout,
  RouteTotalityLayoutEdge,
  RouteTotalityLayoutNode,
  RouteTotalityLocation,
  RouteTotalityNodeSource,
  RouteTotalityStatus,
} from "./route-totality-model";

type RouteTotalityBridge = RouteTotality["bridges"][number];
type FindingAttachment = RouteTotality["findingAttachments"][number];
type FindingIndexEntry = RouteTotality["findingIndex"][number];

export type RouteTotalityDisplayLayer = "surface" | "evidence";
export type RouteTotalityDisplayAnnotationKind = "origin" | "gap" | "partial" | "finding";
export type RouteTotalityDisplayAnnotationAttachment = "direct" | "unanchored" | "route-global";

export type RouteTotalityDisplayNode = {
  id: string;
  node: RouteTotalityLayoutNode;
  layer: RouteTotalityDisplayLayer;
};

export type RouteTotalityDisplayEdge = {
  id: string;
  edge: RouteTotalityLayoutEdge;
  layer: RouteTotalityDisplayLayer;
};

export type RouteTotalityDisplayBridge = {
  id: string;
  graphId: string;
  bridge: RouteTotalityBridge;
  fromId: string;
  toId: string;
  fromNode: RouteTotalityLayoutNode | null;
  toNode: RouteTotalityLayoutNode | null;
};

export type RouteTotalityDisplayAnnotation = {
  id: string;
  kind: RouteTotalityDisplayAnnotationKind;
  label: string;
  detail: string;
  status: RouteTotalityStatus;
  source: RouteTotalityNodeSource | "finding-index";
  scope: RouteTotalityDisplayLayer | "route-global";
  attachment: RouteTotalityDisplayAnnotationAttachment;
  anchorNodeId: string | null;
  anchorIds: readonly string[];
  recordIds: readonly string[];
  location: RouteTotalityLocation | null;
  findingId: string | null;
  findingFamily: string | null;
  findingTargetKind: FindingAttachment["target"]["kind"] | null;
  findingTargetRole: string | null;
};

export type RouteTotalityDisplayCounts = {
  fullNodeCount: number;
  fullEdgeCount: number;
  surfaceNodeCount: number;
  surfaceEdgeCount: number;
  evidenceNodeCount: number;
  evidenceEdgeCount: number;
  bridgeCount: number;
  annotationCount: number;
  anchoredAnnotationCount: number;
  routeGlobalGapCount: number;
  unanchoredAnnotationCount: number;
};

export type RouteTotalityDisplayModel = {
  layout: RouteTotalityLayout;
  surfaceNodes: readonly RouteTotalityDisplayNode[];
  evidenceNodes: readonly RouteTotalityDisplayNode[];
  surfaceEdges: readonly RouteTotalityDisplayEdge[];
  evidenceEdges: readonly RouteTotalityDisplayEdge[];
  bridges: readonly RouteTotalityDisplayBridge[];
  annotations: readonly RouteTotalityDisplayAnnotation[];
  routeGlobalGaps: readonly RouteTotalityDisplayAnnotation[];
  unanchoredAnnotations: readonly RouteTotalityDisplayAnnotation[];
  allNodeIds: readonly string[];
  allEdgeIds: readonly string[];
  allBridgeIds: readonly string[];
  counts: RouteTotalityDisplayCounts;
};

export function buildRouteTotalityDisplayModel(
  layout: RouteTotalityLayout,
  totality: RouteTotality | null,
): RouteTotalityDisplayModel {
  const layoutNodes = layout.nodes as RouteTotalityLayoutNode[];
  const layoutEdges = layout.edges as RouteTotalityLayoutEdge[];
  const nodesById = new Map(layoutNodes.map((node) => [node.id, node]));
  const surfaceNodeIds = new Set(
    layoutNodes.filter(isSurfaceNode).map((node) => node.id),
  );
  const surfaceNodes = layoutNodes
    .filter((node) => surfaceNodeIds.has(node.id))
    .map((node) => displayNode(node, "surface"));
  const evidenceNodes = layoutNodes
    .filter((node) => !surfaceNodeIds.has(node.id))
    .map((node) => displayNode(node, "evidence"));
  const surfaceEdges = layoutEdges
    .filter((edge) => isSurfaceEdge(edge, surfaceNodeIds))
    .map((edge) => displayEdge(edge, "surface"));
  const surfaceEdgeIds = new Set(surfaceEdges.map((edge) => edge.id));
  const evidenceEdges = layoutEdges
    .filter((edge) => !surfaceEdgeIds.has(edge.id))
    .map((edge) => displayEdge(edge, "evidence"));
  const bridges = (totality?.bridges ?? [])
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((bridge) => displayBridge(bridge, nodesById, layout.nodeRedirects));
  const annotationGroups = buildAnnotations(layout, totality, nodesById, bridges);
  const annotations = annotationGroups.annotations;
  const routeGlobalGaps = annotationGroups.routeGlobalGaps;
  const unanchoredAnnotations = annotations.filter(
    (annotation) => annotation.attachment === "unanchored",
  );

  return Object.freeze({
    layout,
    surfaceNodes: freezeArray(surfaceNodes),
    evidenceNodes: freezeArray(evidenceNodes),
    surfaceEdges: freezeArray(surfaceEdges),
    evidenceEdges: freezeArray(evidenceEdges),
    bridges: freezeArray(bridges),
    annotations: freezeArray(annotations),
    routeGlobalGaps: freezeArray(routeGlobalGaps),
    unanchoredAnnotations: freezeArray(unanchoredAnnotations),
    allNodeIds: freezeArray(layoutNodes.map((node) => node.id)),
    allEdgeIds: freezeArray(layoutEdges.map((edge) => edge.id)),
    allBridgeIds: freezeArray(bridges.map((bridge) => bridge.id)),
    counts: Object.freeze({
      fullNodeCount: layoutNodes.length,
      fullEdgeCount: layoutEdges.length,
      surfaceNodeCount: surfaceNodes.length,
      surfaceEdgeCount: surfaceEdges.length,
      evidenceNodeCount: evidenceNodes.length,
      evidenceEdgeCount: evidenceEdges.length,
      bridgeCount: bridges.length,
      annotationCount: annotations.length,
      anchoredAnnotationCount: annotations.filter((annotation) => annotation.anchorNodeId).length,
      routeGlobalGapCount: routeGlobalGaps.length,
      unanchoredAnnotationCount: unanchoredAnnotations.length,
    }),
  });
}

export const projectRouteTotalityDisplay = buildRouteTotalityDisplayModel;

function buildAnnotations(
  layout: RouteTotalityLayout,
  totality: RouteTotality | null,
  nodesById: ReadonlyMap<string, RouteTotalityLayoutNode>,
  bridges: readonly RouteTotalityDisplayBridge[],
): {
  annotations: readonly RouteTotalityDisplayAnnotation[];
  routeGlobalGaps: readonly RouteTotalityDisplayAnnotation[];
} {
  const annotations: RouteTotalityDisplayAnnotation[] = [];
  const routeGlobalGaps: RouteTotalityDisplayAnnotation[] = [];
  const bridgeIdsWithAnnotation = new Set<string>();
  const layoutNodes = layout.nodes as RouteTotalityLayoutNode[];
  const layoutEdges = layout.edges as RouteTotalityLayoutEdge[];
  const originNodes = layoutNodes.filter((node) => node.kind === "origin");

  for (const bridge of bridges) {
    if (bridge.bridge.status === "proven" && bridge.bridge.direction === "origin-to-render") {
      const originNode = bridge.fromNode;
      const targetNode = bridge.toNode;
      if (!originNode) continue;
      annotations.push(bridgeAnnotation(bridge, originNode, targetNode, "origin"));
      bridgeIdsWithAnnotation.add(bridge.id);
    }
    if (bridge.bridge.status === "partial") {
      const anchorNode = surfaceNode(bridge.toNode) ?? surfaceNode(bridge.fromNode) ?? bridge.fromNode ?? bridge.toNode;
      annotations.push(bridgeAnnotation(bridge, anchorNode, null, "partial"));
      bridgeIdsWithAnnotation.add(bridge.id);
    }
  }

  for (const origin of originNodes) {
    const hasAnnotation = bridges.some((bridge) => (
      bridge.fromId === origin.id && bridgeIdsWithAnnotation.has(bridge.id)
    ));
    if (hasAnnotation) continue;
    const hasProvenBridge = bridges.some((bridge) => (
      bridge.bridge.status === "proven"
      && (bridge.fromId === origin.id || bridge.toId === origin.id)
    ));
    annotations.push(nodeAnnotation(
      `origin:${origin.id}`,
      "origin",
      origin,
      hasProvenBridge
        ? "Origin has a proven cross-layer handoff but no direct render anchor was returned."
        : "Origin remains in the evidence layer because no cross-layer bridge was returned.",
      origin.status,
      [origin.id],
      origin.id,
    ));
  }

  for (const node of layoutNodes.filter((candidate) => candidate.kind === "gap")) {
    const endpoints = gapEndpoints(node);
    if (!endpoints?.from && !endpoints?.to) {
      const annotation = nodeAnnotation(
        `gap:${node.id}`,
        "gap",
        node,
        "Route-global gap; no exact endpoint was returned.",
        node.status,
        [],
        null,
      );
      routeGlobalGaps.push(Object.freeze({ ...annotation, attachment: "route-global", scope: "route-global" }));
      continue;
    }
    const anchorIds = [node.id, ...node.relatedIds].filter((id) => nodesById.has(id));
    annotations.push(nodeAnnotation(
      `gap:${node.id}`,
      "gap",
      node,
      `Endpoint-backed gap · ${node.compactSummary}`,
      node.status,
      anchorIds,
      node.id,
    ));
  }

  for (const edge of layoutEdges.filter((candidate) => candidate.status !== "proven")) {
    if (edge.fromNode.kind === "gap" || edge.toNode.kind === "gap") continue;
    const anchorIds = [edge.from, edge.to].filter((id) => nodesById.has(id));
    annotations.push(Object.freeze({
      id: `partial:${edge.id}`,
      kind: "partial",
      label: "Partial relation",
      detail: edge.detail,
      status: edge.status,
      source: edge.source,
      scope: anchorIds.some((id) => surfaceNode(nodesById.get(id))) ? "surface" : "evidence",
      attachment: anchorIds.length ? "direct" : "unanchored",
      anchorNodeId: anchorIds[0] ?? null,
      anchorIds: freezeArray(anchorIds),
      recordIds: freezeArray([edge.id]),
      location: edge.locations[0] ?? null,
      findingId: null,
      findingFamily: null,
      findingTargetKind: null,
      findingTargetRole: null,
    }));
  }

  for (const annotation of findingAnnotations(totality, nodesById, layout.nodeRedirects)) annotations.push(annotation);
  return {
    annotations: freezeArray(annotations.sort(annotationSort)),
    routeGlobalGaps: freezeArray(routeGlobalGaps.sort(annotationSort)),
  };
}

function findingAnnotations(
  totality: RouteTotality | null,
  nodesById: ReadonlyMap<string, RouteTotalityLayoutNode>,
  hiddenToVisibleNodeId: ReadonlyMap<string, string>,
): readonly RouteTotalityDisplayAnnotation[] {
  if (!totality) return [];
  const entriesById = new Map(totality.findingIndex.map((entry) => [entry.findingId, entry]));
  return totality.findingAttachments
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((attachment) => {
      const entry = entriesById.get(attachment.findingId);
      const rawTargetNodeId = findingTargetNodeId(attachment.target);
      const targetNodeId = rawTargetNodeId ? hiddenToVisibleNodeId.get(rawTargetNodeId) ?? rawTargetNodeId : null;
      const targetNode = targetNodeId ? nodesById.get(targetNodeId) ?? null : null;
      const anchorIds = targetNode ? [targetNode.id] : [];
      return [Object.freeze({
        id: `finding:${attachment.id}`,
        kind: "finding" as const,
        label: entry?.label ?? `Finding ${attachment.findingId}`,
        detail: entry
          ? findingDetail(entry, attachment)
          : "Exact finding attachment; indexed detail is unavailable.",
        status: attachment.status,
        source: "finding-index" as const,
        scope: targetNode && isSurfaceNode(targetNode) ? "surface" as const : "evidence" as const,
        attachment: targetNode ? "direct" as const : "unanchored" as const,
        anchorNodeId: targetNode?.id ?? null,
        anchorIds: freezeArray(anchorIds),
        recordIds: freezeArray([`finding:${attachment.findingId}`, ...(targetNode ? [targetNode.id] : [])]),
        location: entry?.location ?? attachment.location,
        findingId: attachment.findingId,
        findingFamily: entry?.family ?? null,
        findingTargetKind: attachment.target.kind,
        findingTargetRole: attachment.target.role,
      })];
    });
}

function bridgeAnnotation(
  bridge: RouteTotalityDisplayBridge,
  originNode: RouteTotalityLayoutNode | null,
  targetNode: RouteTotalityLayoutNode | null,
  kind: "origin" | "partial",
): RouteTotalityDisplayAnnotation {
  const anchorIds = [bridge.fromId, bridge.toId].filter((id) => bridgeNodeExists(bridge, id));
  const anchorNode = surfaceNode(targetNode) ?? surfaceNode(originNode) ?? originNode;
  return Object.freeze({
    id: `${kind}:${bridge.id}`,
    kind,
    label: kind === "origin" ? "Proven origin handoff" : "Partial cross-layer handoff",
    detail: bridge.bridge.proof.detail,
    status: bridge.bridge.status,
    source: "evidence-slice",
    scope: surfaceNode(anchorNode) ? "surface" : "evidence",
    attachment: anchorIds.length ? "direct" : "unanchored",
    anchorNodeId: anchorNode?.id ?? null,
    anchorIds: freezeArray(anchorIds),
    recordIds: freezeArray([`bridge:${bridge.id}`, bridge.fromId, bridge.toId]),
    location: bridge.bridge.locations[0] ?? null,
    findingId: null,
    findingFamily: null,
    findingTargetKind: null,
    findingTargetRole: null,
  });
}

function nodeAnnotation(
  id: string,
  kind: RouteTotalityDisplayAnnotationKind,
  node: RouteTotalityLayoutNode,
  detail: string,
  status: RouteTotalityStatus,
  anchorIds: readonly string[],
  anchorNodeId: string | null,
): RouteTotalityDisplayAnnotation {
  const anchored = Boolean(anchorNodeId);
  return Object.freeze({
    id,
    kind,
    label: node.compactLabel,
    detail,
    status,
    source: node.source,
    scope: isSurfaceNode(node) ? "surface" : "evidence",
    attachment: anchored ? "direct" : "unanchored",
    anchorNodeId,
    anchorIds: freezeArray(anchorIds),
    recordIds: freezeArray([node.id]),
    location: node.location,
    findingId: null,
    findingFamily: null,
    findingTargetKind: null,
    findingTargetRole: null,
  });
}

function displayNode(node: RouteTotalityLayoutNode, layer: RouteTotalityDisplayLayer): RouteTotalityDisplayNode { return Object.freeze({ id: node.id, node, layer }); }
function displayEdge(edge: RouteTotalityLayoutEdge, layer: RouteTotalityDisplayLayer): RouteTotalityDisplayEdge { return Object.freeze({ id: edge.id, edge, layer }); }

function displayBridge(
  bridge: RouteTotalityBridge,
  nodesById: ReadonlyMap<string, RouteTotalityLayoutNode>,
  hiddenToVisibleNodeId: ReadonlyMap<string, string>,
): RouteTotalityDisplayBridge {
  const rawFromId = routeTotalityBridgeEndpointNodeId(bridge.from);
  const rawToId = routeTotalityBridgeEndpointNodeId(bridge.to);
  const fromId = hiddenToVisibleNodeId.get(rawFromId) ?? rawFromId;
  const toId = hiddenToVisibleNodeId.get(rawToId) ?? rawToId;
  return Object.freeze({
    id: bridge.id,
    graphId: `bridge:${bridge.id}`,
    bridge,
    fromId,
    toId,
    fromNode: nodesById.get(fromId) ?? null,
    toNode: nodesById.get(toId) ?? null,
  });
}

function isSurfaceEdge(edge: RouteTotalityLayoutEdge, surfaceNodeIds: ReadonlySet<string>): boolean { return edge.status === "proven" && (edge.family === "render" || edge.family === "boundary") && surfaceNodeIds.has(edge.from) && surfaceNodeIds.has(edge.to); }
function isSurfaceNode(node: RouteTotalityLayoutNode): boolean { return node.kind === "occurrence" || node.kind === "framework-boundary" || node.kind === "terminal"; }
function surfaceNode(node: RouteTotalityLayoutNode | null | undefined): RouteTotalityLayoutNode | null { return node && isSurfaceNode(node) ? node : null; }
function bridgeNodeExists(bridge: RouteTotalityDisplayBridge, id: string): boolean { return bridge.fromId === id ? Boolean(bridge.fromNode) : bridge.toId === id ? Boolean(bridge.toNode) : false; }
function gapEndpoints(node: RouteTotalityLayoutNode): { from: string | null; to: string | null } | null { if (node.source !== "evidence-slice" || !("from" in node.record) || !("to" in node.record)) return null; return { from: node.record.from, to: node.record.to }; }
function findingTargetNodeId(target: FindingAttachment["target"]): string | null { return target.source === "occurrence-surface" ? `terminal:${target.id}` : target.kind === "origin" ? `origin:${target.id}:${target.role}` : `evidence:${target.id}`; }
function findingDetail(entry: FindingIndexEntry, attachment: FindingAttachment): string {
  const role = attachment.target.role ? ` · ${attachment.target.role}` : "";
  return `${entry.family ?? "Indexed finding"} · exact ${attachment.target.kind}${role} · ${attachment.status}`;
}

function annotationSort(left: RouteTotalityDisplayAnnotation, right: RouteTotalityDisplayAnnotation): number {
  return annotationKindOrder(left.kind) - annotationKindOrder(right.kind)
    || left.scope.localeCompare(right.scope)
    || left.id.localeCompare(right.id);
}

function annotationKindOrder(kind: RouteTotalityDisplayAnnotationKind): number { return kind === "origin" ? 0 : kind === "gap" ? 1 : kind === "partial" ? 2 : 3; }
function freezeArray<T>(values: readonly T[]): readonly T[] { return Object.freeze([...values]); }
