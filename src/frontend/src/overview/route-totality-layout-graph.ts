import type { RouteTotality } from "../../../api/contracts";
import { assignParallelIndices } from "./route-totality-layout-geometry";
import {
  boundaryNode,
  dataEdge,
  evidenceElementNode,
  gapNode,
  gapEdges,
  occurrenceNode,
  originEdge,
  originNode,
  reuseCount,
  surfaceEdge,
  terminalEdge,
  terminalNode,
  type EvidenceRelation,
  type GapRecord,
  type RenderEdge,
} from "./route-totality-layout-records";
import {
  buildRouteTotalitySummary,
  collectRouteTotalityOmissions,
} from "./route-totality-layout-summary";
import type {
  RouteTotalityBoundary,
  RouteTotalityEvidence,
  RouteTotalityEvidenceElement,
  RouteTotalityEvidenceOrigin,
  RouteTotalityGraph,
  RouteTotalityGraphEdge,
  RouteTotalityLocation,
  RouteTotalityNode,
  RouteTotalityOccurrence,
  RouteTotalitySurface,
  RouteTotalityTerminal,
} from "./route-totality-model";

export function buildRouteTotalityGraph(totality: RouteTotality): RouteTotalityGraph {
  const surface = availableSurface(totality);
  const evidence = availableEvidence(totality);
  const boundaryIds = new Set(
    surface?.frameworkBoundaries.map((boundary) => boundary.id) ?? [],
  );
  const evidenceElements = evidence?.elements ?? [];
  const evidenceIds = new Map(
    evidenceElements.map((element) => [element.id, `evidence:${element.id}`]),
  );
  const gaps = totalityGaps(totality, evidence);
  const evidenceNodes = evidenceElements
    .slice()
    .sort(compareEvidenceElement)
    .map(evidenceElementNode);
  const primaryNodes: RouteTotalityNode[] = [
    ...(evidence?.origins ?? [])
      .slice()
      .sort(compareOrigin)
      .map((origin) => originNode(
        origin,
        evidenceElements.find((element) => element.id === origin.elementId) ?? null,
      )),
    ...(surface?.occurrences ?? [])
      .slice()
      .sort(compareOccurrence)
      .map((occurrence) => occurrenceNode(
        occurrence,
        reuseCount(surface, occurrence),
        boundaryIds,
      )),
    ...(surface?.frameworkBoundaries ?? [])
      .slice()
      .sort(compareBoundary)
      .map(boundaryNode),
    ...(surface?.terminals ?? [])
      .slice()
      .sort(compareTerminal)
      .map(terminalNode),
    ...gaps.map((gap) => gapNode(gap, evidenceIds)),
  ];
  const nodes = [...primaryNodes, ...evidenceNodes];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const primaryNodeIds = primaryNodes.map((node) => node.id);
  const evidenceNodeIds = evidenceNodes.map((node) => node.id);
  const occurrencesById = new Map(
    (surface?.occurrences ?? []).map((occurrence) => [occurrence.id, occurrence] as const),
  );
  const unresolvedEdgeIds: string[] = [];
  const edges: RouteTotalityGraphEdge[] = [];
  const addEdge = (edge: RouteTotalityGraphEdge): void => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      unresolvedEdgeIds.push(edge.id);
      return;
    }
    edges.push(edge);
  };

  for (const origin of (evidence?.origins ?? []).slice().sort(compareOrigin)) {
    addEdge(originEdge(
      origin,
      evidenceIds.get(origin.elementId) ?? `evidence:${origin.elementId}`,
    ));
  }
  for (const gap of gaps) {
    for (const edge of gapEdges(gap, evidenceIds)) addEdge(edge);
  }
  for (const edge of (surface?.renderEdges ?? []).slice().sort(compareRenderEdge)) {
    addEdge(surfaceEdge(edge, boundaryIds));
  }
  for (const terminal of (surface?.terminals ?? []).slice().sort(compareTerminal)) {
    const owner = terminal.ownerOccurrenceId ? occurrencesById.get(terminal.ownerOccurrenceId) : undefined;
    const parent = owner && compareLocation(terminal.location, owner.callSite) === 0
      ? owner.id
      : terminal.renderParentId ?? terminal.ownerOccurrenceId;
    if (parent) addEdge(terminalEdge(terminal, parent, boundaryIds));
  }
  for (const relation of (evidence?.relations ?? [])
    .slice()
    .sort(compareEvidenceRelation)) {
    addEdge(dataEdge(relation, evidenceIds));
  }
  assignParallelIndices(edges);

  const omissions = collectRouteTotalityOmissions(totality, surface, evidence);
  return {
    nodes,
    edges,
    primaryNodeIds,
    evidenceNodeIds,
    summary: buildRouteTotalitySummary(
      totality,
      nodes,
      edges,
      primaryNodeIds,
      evidenceNodeIds,
      omissions,
      unresolvedEdgeIds,
    ),
  };
}

function totalityGaps(
  totality: RouteTotality,
  evidence: RouteTotalityEvidence | null,
): GapRecord[] {
  const gaps = new Map<string, GapRecord>();
  for (const gap of totality.gaps) {
    const source = gap.source === "route-selection" ? "route-totality" : gap.source;
    gaps.set(`${source}:${gap.id}`, {
      ...gap,
      source,
      from: null,
      to: null,
      record: gap,
    });
  }
  for (const gap of evidence?.gaps ?? []) {
    gaps.set(`evidence-slice:${gap.id}`, {
      ...gap,
      source: "evidence-slice",
      from: gap.from,
      to: gap.to,
      record: gap,
    });
  }
  return [...gaps.values()].sort(compareGap);
}

function availableSurface(totality: RouteTotality): RouteTotalitySurface | null {
  return "definitions" in totality.occurrenceSurface
    ? totality.occurrenceSurface
    : null;
}

function availableEvidence(totality: RouteTotality): RouteTotalityEvidence | null {
  return "elements" in totality.evidenceSlice ? totality.evidenceSlice : null;
}

function compareEvidenceElement(
  left: RouteTotalityEvidenceElement,
  right: RouteTotalityEvidenceElement,
): number {
  return compareFields(left.location, right.location, left.kind, right.kind, left.id, right.id);
}

function compareOrigin(
  left: RouteTotalityEvidenceOrigin,
  right: RouteTotalityEvidenceOrigin,
): number {
  return compareFields(null, null, left.role, right.role, left.elementId, right.elementId);
}

function compareOccurrence(
  left: RouteTotalityOccurrence,
  right: RouteTotalityOccurrence,
): number {
  return compareFields(left.callSite, right.callSite, left.name, right.name, left.id, right.id);
}

function compareBoundary(
  left: RouteTotalityBoundary,
  right: RouteTotalityBoundary,
): number {
  return compareFields(left.location, right.location, left.kind, right.kind, left.id, right.id);
}

function compareTerminal(
  left: RouteTotalityTerminal,
  right: RouteTotalityTerminal,
): number {
  return compareFields(left.location, right.location, left.kind, right.kind, left.id, right.id);
}

function compareRenderEdge(left: RenderEdge, right: RenderEdge): number {
  return compareFields(
    left.locations[0] ?? null,
    right.locations[0] ?? null,
    left.kind,
    right.kind,
    left.id,
    right.id,
  );
}

function compareEvidenceRelation(
  left: EvidenceRelation,
  right: EvidenceRelation,
): number {
  return compareFields(
    left.proof.locations[0] ?? null,
    right.proof.locations[0] ?? null,
    left.kind,
    right.kind,
    left.id,
    right.id,
  );
}

function compareGap(left: GapRecord, right: GapRecord): number {
  return compareFields(left.location, right.location, left.source, right.source, left.id, right.id);
}

function compareFields(
  leftLocation: RouteTotalityLocation | null,
  rightLocation: RouteTotalityLocation | null,
  leftLabel: string,
  rightLabel: string,
  leftId: string,
  rightId: string,
): number {
  return compareLocation(leftLocation, rightLocation)
    || lexical(leftLabel, rightLabel)
    || lexical(leftId, rightId);
}

function compareLocation(
  left: RouteTotalityLocation | null,
  right: RouteTotalityLocation | null,
): number {
  return lexical(left?.file ?? "", right?.file ?? "")
    || (left?.line ?? 0) - (right?.line ?? 0)
    || (left?.column ?? 0) - (right?.column ?? 0)
    || (left?.span.startLine ?? 0) - (right?.span.startLine ?? 0)
    || (left?.span.startColumn ?? 0) - (right?.span.startColumn ?? 0);
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
