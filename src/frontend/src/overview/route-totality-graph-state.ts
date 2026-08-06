import type { RouteTotality } from "../../../api/contracts";
import {
  routeInvestigationSelectionForEdge,
  routeInvestigationSelectionForNode,
  type RouteInvestigationSelection,
} from "./route-investigation-selection";
import type {
  RouteTotalityLayout,
  RouteTotalityLayoutNode,
  RouteTotalitySelection,
} from "./route-totality-model";
import type { RouteTotalityDisplayAnnotation } from "./route-totality-display-model";
import type {
  RouteTotalityDisplayLayout,
  RouteTotalityDisplayLayoutAnnotation,
} from "./route-totality-display-layout";
import {
  routeTotalityDisplayBridgePath,
  routeTotalityDisplayEdgePath,
} from "./route-totality-display-layout";
import type { RouteTotalityBoundaryStub } from "./route-totality-boundary-stubs";
import type {
  TrajectoryGraphCamera,
  TrajectoryTotalitySelection,
} from "./trajectory-url-state";
import type { RouteTotalityEmphasisMode } from "./route-totality-emphasis";
import {
  buildRouteTotalityAdjacency,
  buildRouteTotalityEmphasis,
} from "./route-totality-emphasis";

export type RouteTotalityInvestigationStateChange = {
  selection: TrajectoryTotalitySelection | null;
  isolated: boolean;
  camera?: TrajectoryGraphCamera | null;
};

export type RouteTotalityReconciliation = {
  selection: RouteInvestigationSelection;
  emphasisMode: RouteTotalityEmphasisMode | null;
  isolated: boolean;
  needsCorrection: boolean;
};

export function selectionFromPersisted(
  persisted: TrajectoryTotalitySelection | null,
  layout: RouteTotalityLayout,
): RouteInvestigationSelection {
  if (!persisted) return null;
  if (persisted.kind === "node") {
    const visibleId = layout.nodeRedirects.get(persisted.graphId) ?? persisted.graphId;
    const node = (layout.nodes as RouteTotalityLayoutNode[]).find((candidate) => candidate.id === visibleId);
    return node ? routeInvestigationSelectionForNode(node) : null;
  }
  const edge = layout.edges.find((candidate) => routeInvestigationSelectionForEdge(candidate).graphId === persisted.graphId);
  return edge ? routeInvestigationSelectionForEdge(edge) : null;
}

export function persistedSelection(selection: RouteInvestigationSelection): TrajectoryTotalitySelection | null {
  return selection ? { kind: selection.target, graphId: selection.graphId } : null;
}

export function modelSelectionForInvestigationSelection(selection: RouteInvestigationSelection): RouteTotalitySelection {
  return selection ? { kind: selection.target, id: selection.graphId } : null;
}

export function reconcileRouteTotalityState(args: {
  totality: RouteTotality | null;
  layout: RouteTotalityLayout;
  requestedSelection: TrajectoryTotalitySelection | null;
  requestedIsolation: boolean;
  currentMode: RouteTotalityEmphasisMode | null;
  initialPayload: boolean;
  scopeChanged: boolean;
}): RouteTotalityReconciliation {
  const selection = args.scopeChanged ? null : selectionFromPersisted(args.requestedSelection, args.layout);
  const requestedMode = args.scopeChanged
    ? null
    : args.currentMode ?? (args.initialPayload && args.requestedIsolation ? emphasisModeForSelection(selection) : null);
  const emphasisMode = requestedMode && selection?.target === "node" ? requestedMode : null;
  const emphasis = emphasisMode
    ? buildRouteTotalityEmphasis(
      buildRouteTotalityAdjacency(args.layout, args.totality),
      args.layout,
      modelSelectionForInvestigationSelection(selection),
      emphasisMode,
    )
    : null;
  const isolated = Boolean(!args.scopeChanged && args.requestedIsolation && emphasis?.active && emphasis.focusNodeIds.size > 0);
  return {
    selection,
    emphasisMode,
    isolated,
    needsCorrection: args.scopeChanged
      || Boolean(args.requestedSelection && !selection)
      || Boolean(args.requestedSelection && selection && args.requestedSelection.graphId !== selection.graphId)
      || Boolean(args.requestedIsolation && !isolated),
  };
}

export function emphasisModeForSelection(selection: RouteInvestigationSelection): RouteTotalityEmphasisMode | null {
  return selection?.target === "node" ? "both" : null;
}

export function sameCamera(left: TrajectoryGraphCamera, right: TrajectoryGraphCamera): boolean {
  return left.x === right.x && left.y === right.y && left.scale === right.scale;
}

export type RouteTotalityLedgerItem = { id: string; label: string; detail: string; status: string };
export type RouteTotalityLedgerSection = { id: string; label: string; items: RouteTotalityLedgerItem[] };

export function buildRouteTotalityLedger(
  totality: RouteTotality | null,
  layout: RouteTotalityLayout,
): RouteTotalityLedgerSection[] {
  const omissionItems: RouteTotalityLedgerItem[] = layout.summary.omissions.map((omission) => ({
    id: omission.id,
    label: omission.label,
    detail: [omission.source, omission.reason, omission.count === null ? "" : `count ${omission.count}`].filter(Boolean).join(" · "),
    status: omission.status,
  }));
  const evidence = availableEvidence(totality);
  const coverageItems: RouteTotalityLedgerItem[] = [evidence ? {
    id: "budget:evidence-slice",
    label: "Evidence budget",
    detail: `${evidence.coverage.budget.used} of ${evidence.coverage.budget.limit} used${evidence.coverage.budget.exhausted ? " · exhausted" : " · available"}`,
    status: evidence.coverage.budget.exhausted ? "partial" : "proven",
  } : { id: "budget:evidence-slice", label: "Evidence budget", detail: "Unavailable", status: "unavailable" }];
  if (totality) coverageItems.push({
    id: "bridges:totality",
    label: "Cross-layer bridges",
    detail: `${totality.bridgeCounts.proven} proven · ${totality.bridgeCounts.partial} partial · ${totality.bridgeCounts.total} total`,
    status: totality.bridgeCounts.partial ? "partial" : "proven",
  });
  if (layout.summary.unresolvedEdgeIds.length) coverageItems.push({ id: "unresolved:edges", label: "Unresolved edges", detail: `${layout.summary.unresolvedEdgeIds.length} edge record(s) name missing graph endpoints`, status: "partial" });
  if (!omissionItems.length) omissionItems.push({ id: "coverage:complete", label: "No named omissions", detail: "The returned route surface has no recorded omissions or truncation flags.", status: "exact" });
  const explicitGapItems: RouteTotalityLedgerItem[] = layout.nodes
    .filter((node) => node.kind === "gap")
    .map((gap) => ({
      id: gap.id,
      label: gap.label,
      detail: `${gap.source} · ${gap.compactSummary}`,
      status: gap.status,
    }));
  if (!explicitGapItems.length) explicitGapItems.push({ id: "gaps:none", label: "No explicit gaps", detail: "The returned payload contains no totality gap records.", status: "exact" });
  return [
    { id: "coverage", label: "Omissions and budget", items: [...coverageItems, ...omissionItems] },
    { id: "gaps", label: "Explicit gaps", items: explicitGapItems },
  ];
}

type RenderableDisplayAnnotation = Omit<RouteTotalityDisplayLayoutAnnotation, "x" | "y"> & { x: number; y: number };

export function renderableRouteTotalityAnnotations(
  display: RouteTotalityDisplayLayout,
  evidenceVisible: boolean,
): RenderableDisplayAnnotation[] {
  if (!evidenceVisible) return [];
  const allAnnotations: RouteTotalityDisplayLayoutAnnotation[] = [
    ...display.annotations,
    ...display.model.routeGlobalGaps.map((annotation) => ({
      annotation,
      anchorNode: null,
      anchorNodes: [],
      x: null,
      y: null,
    })),
  ];
  let unanchoredIndex = 0;
  return allAnnotations
    .flatMap((item) => {
      const needsExplicitLane = (
        item.annotation.attachment !== "direct"
        || item.annotation.scope === "route-global"
        || item.x === null
        || item.y === null
      );
      if (needsExplicitLane) {
        const rendered = { ...item, x: 28, y: display.height + 56 + unanchoredIndex * 42 };
        unanchoredIndex += 1;
        return [rendered];
      }
      if (item.x !== null && item.y !== null) {
        return [{ ...item, x: item.x, y: item.y }];
      }
      return [];
    });
}

export function routeTotalityDisplayBounds(
  display: RouteTotalityDisplayLayout,
  evidenceVisible: boolean,
  annotations: readonly RenderableDisplayAnnotation[],
  boundaryStubs: readonly RouteTotalityBoundaryStub[] = [],
): { width: number; height: number } {
  const nodes = evidenceVisible ? [...display.nodes, ...display.evidenceNodes] : [...display.nodes];
  const bounds = { maxX: 0, maxY: 0 };
  for (const node of nodes) includePoint(bounds, node.x + node.width + 48, node.y + node.height + 42);
  for (const item of annotations) includePoint(bounds, item.x + 420, item.y + 42);
  const edges = evidenceVisible ? [...display.edges, ...display.evidenceEdges] : [...display.edges];
  for (const edge of edges) includePath(bounds, routeTotalityDisplayEdgePath(edge));
  for (const bridge of display.bridges) {
    const path = routeTotalityDisplayBridgePath(bridge);
    if (path) includePath(bounds, path);
  }
  for (const stub of boundaryStubs) {
    includePoint(bounds, stub.x1 + 24, stub.y1 + 24);
    includePoint(bounds, stub.x2 + (stub.textAnchor === "start" ? 180 : 24), stub.y2 + 24);
  }
  return {
    width: Math.max(960, bounds.maxX),
    height: Math.max(540, bounds.maxY),
  };
}

function includePath(bounds: { maxX: number; maxY: number }, path: string): void {
  const values = path.match(/-?(?:\d+\.??\d*|\.\d+)/g)?.map(Number) ?? [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    includePoint(bounds, values[index] + 18, values[index + 1] + 18);
  }
}

function includePoint(bounds: { maxX: number; maxY: number }, x: number, y: number): void {
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

export function routeTotalityDisplayInteractionLayout(
  display: RouteTotalityDisplayLayout,
  evidenceVisible: boolean,
  bounds: { width: number; height: number },
): RouteTotalityLayout {
  const displayNodes = evidenceVisible ? [...display.nodes, ...display.evidenceNodes] : [...display.nodes];
  const nodes = displayNodes.map((displayNode) => ({
    ...displayNode.node,
    x: displayNode.x,
    y: displayNode.y,
    width: displayNode.width,
    height: displayNode.height,
  }));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const displayEdges = evidenceVisible ? [...display.edges, ...display.evidenceEdges] : [...display.edges];
  const edges = displayEdges.flatMap((displayEdge) => {
    const fromNode = nodesById.get(displayEdge.edge.from);
    const toNode = nodesById.get(displayEdge.edge.to);
    return fromNode && toNode ? [{ ...displayEdge.edge, fromNode, toNode }] : [];
  });
  return {
    ...display.model.layout,
    nodes,
    edges,
    primaryNodeIds: display.nodes.map((node) => node.id),
    evidenceNodeIds: evidenceVisible ? display.evidenceNodes.map((node) => node.id) : [],
    width: bounds.width,
    height: bounds.height,
  };
}

export function selectionForRouteTotalityDisplayAnnotation(
  annotation: RouteTotalityDisplayAnnotation,
  layout: RouteTotalityLayout,
): RouteInvestigationSelection {
  const layoutNodes = layout.nodes as RouteTotalityLayoutNode[];
  const originId = annotation.kind === "origin"
    ? annotation.anchorIds.find((id) => layoutNodes.some((node) => node.id === id && node.kind === "origin"))
    : undefined;
  const node = layoutNodes.find((candidate) => candidate.id === (originId ?? annotation.anchorNodeId));
  return node ? routeInvestigationSelectionForNode(node) : null;
}

export function routeTotalityDisplayEvidenceLaneY(layout: RouteTotalityDisplayLayout): number {
  return Math.max(34, Math.min(...layout.evidenceNodes.map((node) => node.y)) - 18);
}

type AvailableEvidence = Exclude<RouteTotality["evidenceSlice"], { status: "unavailable" }>;

function availableEvidence(totality: RouteTotality | null): AvailableEvidence | null {
  const evidence = totality?.evidenceSlice;
  return evidence && !("reason" in evidence) ? evidence : null;
}
