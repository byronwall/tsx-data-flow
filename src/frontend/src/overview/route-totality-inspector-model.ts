import type { RouteTotality } from "../../../api/contracts";
import {
  routeTotalityEdgeLabel,
  routeTotalityNodeLabel,
  type RouteTotalityLayout,
  type RouteTotalityLayoutEdge,
  type RouteTotalityLayoutNode,
  type RouteTotalityLocation,
  type RouteTotalityNodeKind,
  type RouteTotalityProof,
  type RouteTotalityOccurrence,
  type RouteTotalitySurface,
} from "./route-totality-model";
import {
  routeInvestigationSelectionForEdge,
  routeInvestigationSelectionForNode,
  type RouteInvestigationSelection,
} from "./route-investigation-selection";

export type RouteTotalityRecordKind = RouteTotalityNodeKind | "edge";
export type RouteTotalityInspectorSelection = Exclude<RouteInvestigationSelection, null>;

export type RouteTotalityInspectorLink = {
  selection: RouteTotalityInspectorSelection;
  kind: RouteTotalityNodeKind;
  label: string;
  detail: string;
  location: RouteTotalityLocation | null;
};

export type RouteTotalityDefinitionRecord = {
  name: string;
  compilerIdentity: string;
  sourceIdentity: string;
  sourceFile: string | null;
  importModule: string | null;
  location: RouteTotalityLocation | null;
  external: boolean;
};

export type RouteTotalityInspectorRecord = {
  selection: RouteTotalityInspectorSelection;
  kind: RouteTotalityRecordKind;
  label: string;
  detail: string;
  status: string;
  location: RouteTotalityLocation | null;
  locations: RouteTotalityLocation[];
  proof: RouteTotalityProof[];
  family?: "render" | "data" | "boundary";
  from?: RouteTotalityInspectorLink;
  to?: RouteTotalityInspectorLink;
  incoming: RouteTotalityInspectorLink[];
  outgoing: RouteTotalityInspectorLink[];
  boundaries: RouteTotalityInspectorLink[];
  gaps: RouteTotalityInspectorLink[];
  routeGlobalGaps: RouteTotalityInspectorLink[];
  definition?: RouteTotalityDefinitionRecord;
  otherCallSites: RouteTotalityInspectorLink[];
};

export function buildRouteTotalityInspectorRecord(
  totality: RouteTotality | null,
  layout: RouteTotalityLayout,
  selection: RouteInvestigationSelection,
): RouteTotalityInspectorRecord | null {
  if (!selection) return null;
  if (selection.target === "node") {
    const node = layoutNodes(layout).find((item) => item.id === selection.graphId);
    return node ? buildNodeRecord(totality, layout, node, selection) : null;
  }
  const edge = layoutEdges(layout).find((item) => (
    routeInvestigationSelectionForEdge(item).graphId === selection.graphId
  ));
  return edge ? buildEdgeRecord(layout, edge, selection) : null;
}

function buildNodeRecord(
  totality: RouteTotality | null,
  layout: RouteTotalityLayout,
  node: RouteTotalityLayoutNode,
  selection: Extract<RouteTotalityInspectorSelection, { target: "node" }>,
): RouteTotalityInspectorRecord {
  const proof = nodeProof(node);
  const neighborGroups = nodeNeighbors(layout, node);
  const occurrenceLinks = occurrenceEvidence(totality, layout, node);
  const gaps = adjacentGapLinks(layout, [node.id]);
  return {
    selection,
    kind: node.kind,
    label: routeTotalityNodeLabel(node, "high"),
    detail: node.detailLines.join(" · "),
    status: node.status,
    location: node.location,
    locations: uniqueLocations([node.location, ...proof.flatMap((item) => item.locations)]),
    proof,
    incoming: neighborGroups.incoming,
    outgoing: neighborGroups.outgoing,
    boundaries: relatedBoundaries(layout, node),
    gaps,
    routeGlobalGaps: isRouteGlobalGap(node) ? routeGlobalGapLinks(layout) : [],
    definition: occurrenceLinks.definition,
    otherCallSites: occurrenceLinks.otherCallSites,
  };
}

function buildEdgeRecord(
  layout: RouteTotalityLayout,
  edge: RouteTotalityLayoutEdge,
  selection: Extract<RouteTotalityInspectorSelection, { target: "edge" }>,
): RouteTotalityInspectorRecord {
  const proof = edge.proof ? [edge.proof] : [];
  return {
    selection,
    kind: "edge",
    label: routeTotalityEdgeLabel(edge),
    detail: edge.detail,
    status: edge.status,
    location: edge.locations[0] ?? null,
    locations: uniqueLocations(edge.locations),
    proof,
    family: edge.family,
    from: neighborLink(edge.fromNode, `From · ${routeTotalityNodeLabel(edge.fromNode, "high")}`, edge.detail),
    to: neighborLink(edge.toNode, `To · ${routeTotalityNodeLabel(edge.toNode, "high")}`, edge.detail),
    incoming: [],
    outgoing: [],
    boundaries: [edge.fromNode, edge.toNode]
      .filter((node) => node.kind === "framework-boundary")
      .map((node) => neighborLink(node, routeTotalityNodeLabel(node, "high"), "Framework boundary on this edge.")),
    gaps: adjacentGapLinks(layout, [edge.from, edge.to]),
    routeGlobalGaps: [],
    otherCallSites: [],
  };
}

function nodeNeighbors(
  layout: RouteTotalityLayout,
  node: RouteTotalityLayoutNode,
): { incoming: RouteTotalityInspectorLink[]; outgoing: RouteTotalityInspectorLink[] } {
  const incoming = layoutEdges(layout)
    .filter((edge) => edge.to === node.id)
    .map((edge) => neighborLink(edge.fromNode, routeTotalityNodeLabel(edge.fromNode, "high"), `${routeTotalityEdgeLabel(edge)} · ${edge.detail}`));
  const outgoing = layoutEdges(layout)
    .filter((edge) => edge.from === node.id)
    .map((edge) => neighborLink(edge.toNode, routeTotalityNodeLabel(edge.toNode, "high"), `${routeTotalityEdgeLabel(edge)} · ${edge.detail}`));
  return { incoming: uniqueLinks(incoming), outgoing: uniqueLinks(outgoing) };
}

function relatedBoundaries(
  layout: RouteTotalityLayout,
  node: RouteTotalityLayoutNode,
): RouteTotalityInspectorLink[] {
  const boundaryNodes = new Map<string, RouteTotalityLayoutNode>();
  for (const relatedId of node.relatedIds) {
    const related = layoutNodes(layout).find((candidate) => candidate.id === relatedId);
    if (related?.kind === "framework-boundary") boundaryNodes.set(related.id, related);
  }
  for (const edge of layoutEdges(layout)) {
    if (edge.from !== node.id && edge.to !== node.id) continue;
    const related = edge.from === node.id ? edge.toNode : edge.fromNode;
    if (related.kind === "framework-boundary") boundaryNodes.set(related.id, related);
  }
  return [...boundaryNodes.values()].map((boundary) => neighborLink(
    boundary,
    routeTotalityNodeLabel(boundary, "high"),
    boundary.detailLines.join(" · "),
  ));
}

function adjacentGapLinks(
  layout: RouteTotalityLayout,
  nodeIds: string[],
): RouteTotalityInspectorLink[] {
  const selectedIds = new Set(nodeIds);
  const gapIds = new Set<string>();
  for (const edge of layoutEdges(layout)) {
    if (selectedIds.has(edge.from) && isGapNode(edge.toNode)) gapIds.add(edge.to);
    if (selectedIds.has(edge.to) && isGapNode(edge.fromNode)) gapIds.add(edge.from);
  }
  return layoutNodes(layout)
    .filter((node) => gapIds.has(node.id))
    .map((gap) => neighborLink(gap, routeTotalityNodeLabel(gap, "high"), gap.detailLines.join(" · ")));
}

function routeGlobalGapLinks(layout: RouteTotalityLayout): RouteTotalityInspectorLink[] {
  return layoutNodes(layout)
    .filter(isRouteGlobalGap)
    .map((gap) => neighborLink(gap, routeTotalityNodeLabel(gap, "high"), gap.detailLines.join(" · ")));
}

function isGapNode(node: RouteTotalityLayoutNode): boolean {
  return node.kind === "gap";
}

function isRouteGlobalGap(node: RouteTotalityLayoutNode): boolean {
  if (!isGapNode(node)) return false;
  if (node.source !== "evidence-slice") return true;
  if (!("from" in node.record) || !("to" in node.record)) return true;
  return node.record.from === null && node.record.to === null;
}

function neighborLink(
  node: RouteTotalityLayoutNode,
  label: string,
  detail: string,
): RouteTotalityInspectorLink {
  return {
    selection: routeInvestigationSelectionForNode(node),
    kind: node.kind,
    label,
    detail,
    location: node.location,
  };
}

function occurrenceEvidence(
  totality: RouteTotality | null,
  layout: RouteTotalityLayout,
  node: RouteTotalityLayoutNode,
): { definition?: RouteTotalityDefinitionRecord; otherCallSites: RouteTotalityInspectorLink[] } {
  if (node.kind !== "occurrence" || !totality) return { otherCallSites: [] };
  const surface = availableSurface(totality);
  if (!surface) return { otherCallSites: [] };
  const occurrenceId = (node.record as RouteTotalityOccurrence).id;
  const occurrence = surface.occurrences.find((item) => item.id === occurrenceId);
  if (!occurrence) return { otherCallSites: [] };
  const definition = surface.definitions.find((item) => item.id === occurrence.definitionId);
  const otherCallSites = surface.occurrences
    .filter((item) => item.definitionId === occurrence.definitionId && item.id !== occurrence.id)
    .flatMap((item) => {
      const otherNode = layoutNodes(layout).find((candidate) => candidate.kind === "occurrence" && (candidate.record as RouteTotalityOccurrence).id === item.id);
      return otherNode
        ? [neighborLink(otherNode, item.name, `Other call site · ${item.ownership} · ${item.repetition}`)]
        : [];
    });
  return {
    definition: definition
      ? {
        name: definition.name,
        compilerIdentity: definition.compilerIdentity,
        sourceIdentity: definition.sourceIdentity,
        sourceFile: definition.sourceFile,
        importModule: definition.importModule,
        location: definition.declaration,
        external: definition.external,
      }
      : undefined,
    otherCallSites,
  };
}

function nodeProof(node: RouteTotalityLayoutNode): RouteTotalityProof[] {
  return "proof" in node.record ? node.record.proof : [];
}

function availableSurface(totality: RouteTotality): RouteTotalitySurface | null {
  return "definitions" in totality.occurrenceSurface ? totality.occurrenceSurface : null;
}

function uniqueLinks(links: RouteTotalityInspectorLink[]): RouteTotalityInspectorLink[] {
  return [...new Map(links.map((link) => [link.selection.graphId, link])).values()];
}

function uniqueLocations(locations: Array<RouteTotalityLocation | null>): RouteTotalityLocation[] {
  return [...new Map(
    locations
      .filter((location): location is RouteTotalityLocation => Boolean(location))
      .map((location) => [locationKey(location), location]),
  ).values()];
}

function locationKey(location: RouteTotalityLocation): string {
  return `${location.file}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}

function layoutNodes(layout: RouteTotalityLayout): RouteTotalityLayoutNode[] {
  return layout.nodes as RouteTotalityLayoutNode[];
}

function layoutEdges(layout: RouteTotalityLayout): RouteTotalityLayoutEdge[] {
  return layout.edges as RouteTotalityLayoutEdge[];
}
