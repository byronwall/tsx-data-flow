import type { RouteShadowEvidence, RouteTotality } from "../../../api/contracts";
import type { RouteTotalityFieldInspectorResult } from "./route-totality-field-inspector-model";
import type { RouteTotalityInspectorRecord } from "./route-totality-inspector-model";

type ShadowLocation = NonNullable<RouteShadowEvidence["nodes"][number]["location"]>;
type RouteEvidence = Extract<RouteTotality["evidenceSlice"], { elements: unknown[] }>;
type RouteEvidenceElement = RouteEvidence["elements"][number];
type RouteEvidenceRelation = RouteEvidence["relations"][number];
type RouteEvidenceGap = RouteEvidence["gaps"][number];

export type EvidenceNodeRecord = {
  id: string;
  role: string;
  kind: string;
  label: string;
  location: ShadowLocation | null;
};

export type EvidenceEdgeRecord = {
  id: string;
  from: string;
  to: string;
  kind: string;
  proof: { kind: string; detail: string; locations: readonly ShadowLocation[] };
};

export type EvidenceGapRecord = {
  id: string;
  from: string | null;
  to: string | null;
  label: string;
  reason: string;
  location: ShadowLocation | null;
};

export type EvidencePathStep = {
  role: string;
  label: string;
  location: ShadowLocation | null;
};

export type ShadowEvidenceModel = {
  status: RouteShadowEvidence["status"] | "missing";
  source: "shadow" | "route-totality" | "missing";
  nodes: readonly EvidenceNodeRecord[];
  path: readonly EvidencePathStep[];
  edges: readonly EvidenceEdgeRecord[];
  gaps: readonly EvidenceGapRecord[];
};

export type RouteEvidenceFocus = {
  elementIds: ReadonlySet<string>;
  relationIds: ReadonlySet<string>;
  gapIds: ReadonlySet<string>;
  elements: readonly RouteEvidenceElement[];
  relations: readonly RouteEvidenceRelation[];
  gaps: readonly RouteEvidenceGap[];
  matched: boolean;
};

export type RouteTotalityEvidenceModel = {
  shadow: ShadowEvidenceModel;
  route: {
    status: "proven" | "partial" | "unavailable";
    elements: readonly RouteEvidenceElement[];
    relations: readonly RouteEvidenceRelation[];
    gaps: readonly RouteEvidenceGap[];
  };
  focus: RouteEvidenceFocus;
};

export function buildRouteTotalityEvidenceModel(
  shadowEvidence: RouteShadowEvidence | null | undefined,
  totality: RouteTotality | null,
  selected: RouteTotalityInspectorRecord | null,
  fieldResult: RouteTotalityFieldInspectorResult | null,
): RouteTotalityEvidenceModel {
  const routeEvidence = availableRouteEvidence(totality);
  const shadow = shadowEvidence
    ? {
      status: shadowEvidence.status,
      source: "shadow" as const,
      nodes: shadowEvidence.nodes.map((node) => ({ ...node, location: node.location })),
      path: meaningfulShadowPath(shadowEvidence),
      edges: shadowEvidence.edges.map((edge) => ({ ...edge, proof: { ...edge.proof, locations: edge.proof.locations } })),
      gaps: shadowEvidence.gaps.map((gap) => ({ ...gap })),
    }
    : routeEvidence
      ? routeEvidenceFallback(totality, routeEvidence)
      : { status: "missing" as const, source: "missing" as const, nodes: [], path: [], edges: [], gaps: [] };
  if (!routeEvidence) {
    return {
      shadow,
      route: { status: "unavailable", elements: [], relations: [], gaps: [] },
      focus: emptyFocus(),
    };
  }

  const elementIds = new Set<string>();
  const relationIds = new Set<string>();
  const gapIds = new Set<string>();
  addFieldEvidenceIds(fieldResult, elementIds, relationIds, gapIds);
  addSelectionEvidenceIds(selected, routeEvidence, elementIds, relationIds, gapIds);
  const elementsById = new Map(routeEvidence.elements.map((element) => [element.id, element]));
  const relationsById = new Map(routeEvidence.relations.map((relation) => [relation.id, relation]));
  const gapsById = new Map(routeEvidence.gaps.map((gap) => [gap.id, gap]));
  const elements = [...elementIds].flatMap((id) => {
    const element = elementsById.get(id);
    return element ? [element] : [];
  });
  const relations = [...relationIds].flatMap((id) => {
    const relation = relationsById.get(id);
    return relation ? [relation] : [];
  });
  const gaps = [...gapIds].flatMap((id) => {
    const gap = gapsById.get(id);
    return gap ? [gap] : [];
  });
  return {
    shadow,
    route: {
      status: totality?.status === "partial" ? "partial" : "proven",
      elements: routeEvidence.elements,
      relations: routeEvidence.relations,
      gaps: routeEvidence.gaps,
    },
    focus: {
      elementIds,
      relationIds,
      gapIds,
      elements,
      relations,
      gaps,
      matched: elements.length > 0 || relations.length > 0 || gaps.length > 0,
    },
  };
}

function availableRouteEvidence(totality: RouteTotality | null): RouteEvidence | null {
  return totality && "elements" in totality.evidenceSlice ? totality.evidenceSlice : null;
}

function routeEvidenceFallback(totality: RouteTotality | null, evidence: RouteEvidence): ShadowEvidenceModel {
  const elements = [...evidence.elements].sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0));
  return {
    status: totality?.status === "partial" ? "partial" : "proven",
    source: "route-totality",
    nodes: elements.map((element) => ({
      id: element.id,
      role: routeElementRole(element),
      kind: element.kind,
      label: element.label,
      location: element.location,
    })),
    path: meaningfulRoutePath(elements),
    edges: evidence.relations
      .filter((relation) => relation.status === "proven")
      .map((relation) => ({
        id: relation.id,
        from: relation.from,
        to: relation.to,
        kind: relation.kind,
        proof: { kind: relation.proof.kind, detail: relation.proof.detail, locations: relation.proof.locations },
      })),
    gaps: evidence.gaps.map((gap) => ({
      id: gap.id,
      from: gap.from,
      to: gap.to,
      label: gap.label,
      reason: gap.reason,
      location: gap.location,
    })),
  };
}

function routeElementRole(element: RouteEvidenceElement): string {
  return element.originRoles[0] ?? element.terminalRoles[0] ?? (element.boundary ? "boundary" : element.kind);
}

function meaningfulRoutePath(elements: readonly RouteEvidenceElement[]): EvidencePathStep[] {
  const meaningful = elements.filter((element, index) => (
    index === 0
    || index === elements.length - 1
    || element.originRoles.length > 0
    || element.terminalRoles.length > 0
    || Boolean(element.boundary)
    || /boundary|component|occurrence|resource|context|prop|query|response|return|render|terminal|handoff/i.test(`${element.kind} ${element.label}`)
  ));
  const compact = meaningful.length <= 10
    ? meaningful
    : Array.from({ length: 10 }, (_, index) => meaningful[Math.round(index * (meaningful.length - 1) / 9)]);
  return deduplicatePath(compact.map((element) => ({
    role: humanize(routeElementRole(element)),
    label: element.label,
    location: element.location,
  })));
}

function addSelectionEvidenceIds(
  selected: RouteTotalityInspectorRecord | null,
  evidence: RouteEvidence,
  elementIds: Set<string>,
  relationIds: Set<string>,
  gapIds: Set<string>,
) {
  if (!selected || selected.selection.source !== "evidence-slice") return;
  if (selected.kind === "edge") {
    if (evidence.relations.some((relation) => relation.id === selected.selection.recordId)) {
      relationIds.add(selected.selection.recordId);
    }
    if (selected.selection.recordId.startsWith("gap:evidence-slice:")) {
      const gapId = selected.selection.recordId.slice("gap:evidence-slice:".length);
      if (evidence.gaps.some((gap) => gap.id === gapId)) gapIds.add(gapId);
    }
    return;
  }
  if (evidence.elements.some((element) => element.id === selected.selection.recordId)) {
    elementIds.add(selected.selection.recordId);
  }
  if (evidence.gaps.some((gap) => gap.id === selected.selection.recordId)) {
    gapIds.add(selected.selection.recordId);
  }
}

function addFieldEvidenceIds(
  fieldResult: RouteTotalityFieldInspectorResult | null,
  elementIds: Set<string>,
  relationIds: Set<string>,
  gapIds: Set<string>,
) {
  if (!fieldResult) return;
  for (const item of fieldResult.attachments) {
    for (const id of item.attachment.evidencePathElementIds) elementIds.add(id);
    for (const id of item.attachment.evidencePathRelationIds) relationIds.add(id);
  }
  for (const item of fieldResult.frontiers) {
    for (const id of item.frontier.evidencePathElementIds) elementIds.add(id);
    for (const id of item.frontier.evidencePathRelationIds) relationIds.add(id);
    if (item.frontier.stoppedAtElementId) elementIds.add(item.frontier.stoppedAtElementId);
    if (item.frontier.gapId) gapIds.add(item.frontier.gapId);
  }
}

function emptyFocus(): RouteEvidenceFocus {
  return {
    elementIds: new Set(),
    relationIds: new Set(),
    gapIds: new Set(),
    elements: [],
    relations: [],
    gaps: [],
    matched: false,
  };
}

function meaningfulShadowPath(evidence: RouteShadowEvidence): EvidencePathStep[] {
  const path = evidence.nodes
    .filter((node, index) => index === 0 || index === evidence.nodes.length - 1 || isMeaningfulNode(node))
    .map((node) => ({
      role: humanize(node.role),
      label: node.label,
      location: nodeLocation(evidence, node),
    }));
  return deduplicatePath(path);
}

function isMeaningfulNode(node: RouteShadowEvidence["nodes"][number]): boolean {
  const value = (node.kind + " " + node.label).toLowerCase();
  return /boundary|component|occurrence|resource|context|prop|query|response|return|render|terminal|handoff/.test(value);
}

function nodeLocation(evidence: RouteShadowEvidence, node: RouteShadowEvidence["nodes"][number]): ShadowLocation | null {
  if (node.location) return node.location;
  if (node.role === "origin") return evidence.origin?.occurrence.location ?? evidence.origin?.definition.location ?? null;
  if (node.role === "terminal") return evidence.terminal?.location ?? null;
  return null;
}

function deduplicatePath(path: EvidencePathStep[]): EvidencePathStep[] {
  const seen = new Set<string>();
  return path.filter((step) => {
    const key = step.role + ":" + step.label + ":" + (step.location?.file ?? "") + ":" + (step.location?.line ?? "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function humanize(value: string): string {
  return value.replaceAll("-", " ");
}
