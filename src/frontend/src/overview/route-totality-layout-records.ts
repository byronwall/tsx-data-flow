import type { RouteTotality } from "../../../api/contracts";
import type {
  RouteTotalityBoundary,
  RouteTotalityEvidence,
  RouteTotalityEvidenceElement,
  RouteTotalityEvidenceGap,
  RouteTotalityEvidenceOrigin,
  RouteTotalityGraphEdge,
  RouteTotalityLocation,
  RouteTotalityNode,
  RouteTotalityNodeKind,
  RouteTotalityNodeRecord,
  RouteTotalityNodeSource,
  RouteTotalityOccurrence,
  RouteTotalityProof,
  RouteTotalitySurface,
  RouteTotalityTerminal,
} from "./route-totality-model";

export type RenderEdge = RouteTotalitySurface["renderEdges"][number];
export type EvidenceRelation = RouteTotalityEvidence["relations"][number];
export type TotalityGap = RouteTotality["gaps"][number];
export type GapRecord = {
  id: string;
  source: RouteTotalityNodeSource;
  reason: string;
  label: string;
  status: "partial" | "unsupported";
  location: RouteTotalityLocation | null;
  proof: RouteTotalityProof[];
  from: string | null;
  to: string | null;
  record: TotalityGap | RouteTotalityEvidenceGap;
};

export function evidenceElementNode(element: RouteTotalityEvidenceElement): RouteTotalityNode {
  return makeNode(
    `evidence:${element.id}`,
    "evidence-element",
    "evidence-slice",
    element.label,
    element.kind,
    element.status,
    element.status,
    element.location,
    [],
    element,
    [
      `Kind: ${element.kind}`,
      `Status: ${element.status}`,
      `Symbol: ${element.symbol ?? "Unavailable"}`,
      `Proof records: ${element.proof.length}`,
    ],
  );
}

export function originNode(
  origin: RouteTotalityEvidenceOrigin,
  element: RouteTotalityEvidenceElement | null,
): RouteTotalityNode {
  const label = origin.label || element?.label || origin.role;
  return makeNode(
    `origin:${origin.elementId}:${origin.role}`,
    "origin",
    "evidence-slice",
    label,
    origin.role,
    "Origin",
    origin.status,
    element?.location ?? null,
    element ? [`evidence:${element.id}`] : [],
    origin,
    [
      `Role: ${origin.role}`,
      `Element: ${origin.elementId}`,
      `Status: ${origin.status}`,
      `Proof records: ${origin.proof.length}`,
    ],
  );
}

export function originEdge(
  origin: RouteTotalityEvidenceOrigin,
  evidenceNodeId: string,
): RouteTotalityGraphEdge {
  return {
    id: `origin-evidence:${origin.elementId}:${origin.role}`,
    from: `origin:${origin.elementId}:${origin.role}`,
    to: evidenceNodeId,
    family: "data",
    kind: "origin-evidence",
    label: "origin evidence",
    detail: `The ${origin.role} origin is explicitly associated with evidence element ${origin.elementId}.`,
    source: "evidence-slice",
    sourceFrom: origin.elementId,
    sourceTo: origin.elementId,
    status: origin.status,
    locations: origin.proof.flatMap((proof) => proof.locations),
    proof: origin.proof[0] ?? null,
    parallelIndex: 0,
    parallelCount: 1,
  };
}

export function occurrenceNode(
  occurrence: RouteTotalityOccurrence,
  reuse: number,
  boundaryIds: ReadonlySet<string>,
): RouteTotalityNode {
  const children = [
    ...occurrence.callerOwnedChildOccurrenceIds,
    ...occurrence.definitionOwnedChildOccurrenceIds,
    ...occurrence.frameworkBoundaryIds,
  ].map((id) => surfaceNodeId(id, boundaryIds));
  return makeNode(
    `occurrence:${occurrence.id}`,
    "occurrence",
    "occurrence-surface",
    occurrence.expression ?? occurrence.name,
    occurrence.expression ?? occurrence.name,
    `${occurrence.repetition} · ${reuse} use${reuse === 1 ? "" : "s"}`,
    "proven",
    occurrence.callSite,
    children,
    occurrence,
    [
      `Definition: ${occurrence.definitionId}`,
      `Ownership: ${occurrence.ownership}`,
      `Repetition: ${occurrence.repetition}`,
      `Child occurrences: ${occurrence.callerOwnedChildOccurrenceIds.length + occurrence.definitionOwnedChildOccurrenceIds.length}`,
      `Framework boundaries: ${occurrence.frameworkBoundaryIds.length}`,
      `Slot forwarding: ${occurrence.slotForwardingIds.length}`,
      "Runtime multiplicity: unknown",
    ],
    reuse,
  );
}

export function boundaryNode(boundary: RouteTotalityBoundary): RouteTotalityNode {
  const children = [
    ...boundary.childOccurrenceIds,
    ...boundary.fallbackChildOccurrenceIds,
  ].map((id) => `occurrence:${id}`);
  return makeNode(
    `boundary:${boundary.id}`,
    "framework-boundary",
    "occurrence-surface",
    boundary.name,
    boundary.name,
    `${boundary.kind} · ${children.length} child${children.length === 1 ? "" : "ren"}`,
    "proven",
    boundary.sourceLocation ?? boundary.location,
    children,
    boundary,
    [
      `Kind: ${boundary.kind}`,
      "Ownership: framework-owned",
      `Content children: ${boundary.childOccurrenceIds.length}`,
      `Fallback children: ${boundary.fallbackChildOccurrenceIds.length}`,
      `Source expression: ${boundary.sourceExpression ?? "Unavailable"}`,
      `Condition: ${boundary.condition ? `${boundary.condition.outcome} · ${boundary.condition.detail}` : "Not evaluated"}`,
      "Runtime multiplicity: unknown",
    ],
  );
}

export function terminalNode(terminal: RouteTotalityTerminal): RouteTotalityNode {
  return makeNode(
    `terminal:${terminal.id}`,
    "terminal",
    "occurrence-surface",
    terminal.label,
    terminal.kind,
    terminal.kind,
    "proven",
    terminal.location,
    terminal.ownerOccurrenceId ? [`occurrence:${terminal.ownerOccurrenceId}`] : [],
    terminal,
    [
      `Kind: ${terminal.kind}`,
      `Owner: ${terminal.ownerOccurrenceId ?? "Unavailable"}`,
      `Expression: ${terminal.expression ?? "Unavailable"}`,
      `Repetition: ${terminal.repetition}`,
      "Runtime multiplicity: unknown",
    ],
  );
}

export function gapNode(
  gap: GapRecord,
  evidenceIds: ReadonlyMap<string, string>,
): RouteTotalityNode {
  const relatedIds = [...new Set(
    [gap.from, gap.to]
      .filter((id): id is string => Boolean(id))
      .map((id) => evidenceIds.get(id) ?? `evidence:${id}`),
  )];
  const scope = gap.from || gap.to ? "Endpoint-backed" : "Route-global";
  return makeNode(
    `gap:${gap.source}:${gap.id}`,
    "gap",
    gap.source,
    gap.label,
    "Gap",
    `${humanize(gap.reason)} · ${scope}`,
    gap.status,
    gap.location,
    relatedIds,
    gap.record,
    [
      `Reason: ${humanize(gap.reason)}`,
      `Status: ${gap.status}`,
      `Scope: ${scope}`,
      `From: ${gap.from ?? "No explicit endpoint"}`,
      `To: ${gap.to ?? "No explicit endpoint"}`,
      `Proof records: ${gap.proof.length}`,
    ],
  );
}

export function gapEdges(
  gap: GapRecord,
  evidenceIds: ReadonlyMap<string, string>,
): RouteTotalityGraphEdge[] {
  if (gap.source !== "evidence-slice") return [];
  const gapId = `gap:${gap.source}:${gap.id}`;
  const edges: RouteTotalityGraphEdge[] = [];
  if (gap.from) {
    edges.push(gapEndpointEdge(
      gap,
      `${gapId}:from`,
      evidenceIds.get(gap.from) ?? `evidence:${gap.from}`,
      gapId,
      "from",
    ));
  }
  if (gap.to) {
    edges.push(gapEndpointEdge(
      gap,
      `${gapId}:to`,
      gapId,
      evidenceIds.get(gap.to) ?? `evidence:${gap.to}`,
      "to",
    ));
  }
  return edges;
}

export function surfaceEdge(
  edge: RenderEdge,
  boundaryIds: ReadonlySet<string>,
): RouteTotalityGraphEdge {
  return {
    id: edge.id,
    from: surfaceNodeId(edge.from, boundaryIds),
    to: surfaceNodeId(edge.to, boundaryIds),
    family: edge.kind === "framework-boundary" ? "boundary" : "render",
    kind: edge.kind,
    label: humanize(edge.kind),
    detail: edge.detail,
    source: "occurrence-surface",
    sourceFrom: edge.from,
    sourceTo: edge.to,
    status: "proven",
    locations: edge.locations,
    proof: null,
    parallelIndex: 0,
    parallelCount: 1,
  };
}

export function terminalEdge(
  terminal: RouteTotalityTerminal,
  parent: string,
  boundaryIds: ReadonlySet<string>,
): RouteTotalityGraphEdge {
  return {
    id: `render-terminal:${terminal.id}`,
    from: surfaceNodeId(parent, boundaryIds),
    to: `terminal:${terminal.id}`,
    family: "render",
    kind: "render-terminal",
    label: "render terminal",
    detail: `The ${terminal.kind} terminal is emitted from its render parent.`,
    source: "occurrence-surface",
    sourceFrom: parent,
    sourceTo: terminal.id,
    status: "proven",
    locations: [terminal.location],
    proof: null,
    parallelIndex: 0,
    parallelCount: 1,
  };
}

export function dataEdge(
  relation: EvidenceRelation,
  evidenceIds: Map<string, string>,
): RouteTotalityGraphEdge {
  return {
    id: relation.id,
    from: evidenceIds.get(relation.from) ?? `evidence:${relation.from}`,
    to: evidenceIds.get(relation.to) ?? `evidence:${relation.to}`,
    family: "data",
    kind: relation.kind,
    label: humanize(relation.kind),
    detail: relation.proof.detail,
    source: "evidence-slice",
    sourceFrom: relation.from,
    sourceTo: relation.to,
    status: relation.status,
    locations: relation.proof.locations,
    proof: relation.proof,
    parallelIndex: 0,
    parallelCount: 1,
  };
}

export function reuseCount(
  surface: RouteTotalitySurface | null,
  occurrence: RouteTotalityOccurrence,
): number {
  return surface?.occurrences.filter((item) => item.definitionId === occurrence.definitionId).length ?? 1;
}

export function surfaceNodeId(id: string, boundaryIds: ReadonlySet<string>): string {
  return boundaryIds.has(id) ? `boundary:${id}` : `occurrence:${id}`;
}

export function humanize(value: string): string {
  return value.replaceAll("-", " ");
}

function makeNode(
  id: string,
  kind: RouteTotalityNodeKind,
  source: RouteTotalityNodeSource,
  label: string,
  compactLabel: string,
  compactSummary: string,
  status: RouteTotalityNode["status"],
  location: RouteTotalityLocation | null,
  relatedIds: string[],
  record: RouteTotalityNodeRecord,
  detailLines: string[],
  reuseCount: number | null = null,
): RouteTotalityNode {
  return {
    id,
    kind,
    source,
    label,
    compactLabel,
    compactSummary,
    detailLines,
    status,
    location,
    relatedIds,
    reuseCount,
    record,
  };
}

function gapEndpointEdge(
  gap: GapRecord,
  id: string,
  from: string,
  to: string,
  endpoint: "from" | "to",
): RouteTotalityGraphEdge {
  return {
    id,
    from,
    to,
    family: "data",
    kind: `evidence-gap-${endpoint}`,
    label: "gap endpoint",
    detail: `${gap.label} has an explicit ${endpoint} endpoint in the evidence DTO.`,
    source: "evidence-slice",
    sourceFrom: gap.from ?? gap.id,
    sourceTo: gap.to ?? gap.id,
    status: gap.status,
    locations: gap.location ? [gap.location] : [],
    proof: gap.proof[0] ?? null,
    parallelIndex: 0,
    parallelCount: 1,
  };
}
