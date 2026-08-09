import type { RouteTotality } from "../../../api/contracts";
import type { RouteTotalityLayout } from "./route-totality-model";

export type RouteTotalityFieldOriginFocus = RouteTotality["fieldLineage"]["attachments"][number]["origin"];
type RouteTotalityFieldAttachment = RouteTotality["fieldLineage"]["attachments"][number];
type RouteTotalityFieldFrontier = RouteTotality["fieldLineage"]["frontiers"][number];

export type RouteTotalityFieldOccurrenceSummary = {
  labels: readonly string[];
  labelText: string;
  terminalCount: number;
  hasProvenFields: boolean;
  hasFrontier: boolean;
};

export type RouteTotalityFieldFocusModel = {
  origin: RouteTotalityFieldOriginFocus | null;
  originLabel: string | null;
  status: "no-origin" | "unavailable" | "no-fields" | "proven" | "partial";
  unavailableReason: string | null;
  activeNodeIds: ReadonlySet<string>;
  frontierNodeIds: ReadonlySet<string>;
  activeEdgeIds: ReadonlySet<string>;
  frontierEdgeIds: ReadonlySet<string>;
  activeBridgeIds: ReadonlySet<string>;
  frontierBridgeIds: ReadonlySet<string>;
  summariesByNodeId: ReadonlyMap<string, RouteTotalityFieldOccurrenceSummary>;
};

export function fieldOriginFocusForOrigin(
  totality: RouteTotality | null,
  elementId: string,
  role: string | undefined,
): RouteTotalityFieldOriginFocus | null {
  if (!totality || !role) return null;
  const origin = totality.fieldLineage.attachments
    .map((attachment) => attachment.origin)
    .concat(totality.fieldLineage.frontiers.map((frontier) => frontier.origin))
    .find((candidate) => candidate.elementId === elementId && candidate.role === role);
  if (origin) return { elementId: origin.elementId, role: origin.role };
  const evidenceOrigin = "origins" in totality.evidenceSlice
    ? totality.evidenceSlice.origins.find((candidate) => candidate.elementId === elementId && candidate.role === role && candidate.status === "proven")
    : undefined;
  return evidenceOrigin ? { elementId: evidenceOrigin.elementId, role: evidenceOrigin.role } : null;
}

export function hasRouteTotalityFieldOrigin(
  totality: RouteTotality | null,
  origin: RouteTotalityFieldOriginFocus | null,
): boolean {
  if (!totality || !origin) return false;
  if (totality.fieldLineage.attachments.some((attachment) => sameOrigin(attachment.origin, origin))) return true;
  if (totality.fieldLineage.frontiers.some((frontier) => sameOrigin(frontier.origin, origin))) return true;
  return "origins" in totality.evidenceSlice
    && totality.evidenceSlice.origins.some((candidate) => sameOrigin(candidate, origin) && candidate.status === "proven");
}

export function selectRouteTotalityFieldFocus(
  totality: RouteTotality | null,
  layout: RouteTotalityLayout,
  origin: RouteTotalityFieldOriginFocus | null,
): RouteTotalityFieldFocusModel {
  const empty = emptyFieldFocusModel(origin);
  if (!totality || !origin) return empty;

  const unavailable = totality.fieldLineage.status === "unavailable";
  const activeNodeIds = new Set<string>();
  const frontierNodeIds = new Set<string>();
  const activeEdgeIds = new Set<string>();
  const frontierEdgeIds = new Set<string>();
  const activeBridgeIds = new Set<string>();
  const frontierBridgeIds = new Set<string>();
  const summaries = new Map<string, FieldSummaryAccumulator>();
  const attachments = totality.fieldLineage.attachments.filter((candidate) => sameOrigin(candidate.origin, origin));
  const frontiers = totality.fieldLineage.frontiers.filter((candidate) => sameOrigin(candidate.origin, origin));

  if (unavailable) {
    return {
      ...empty,
      originLabel: fieldOriginLabel(totality, origin),
      unavailableReason: totality.fieldLineage.unavailableReason,
    };
  }

  if (attachments.length > 0) addOriginPath(origin, activeNodeIds, activeEdgeIds);
  for (const attachment of attachments) {
    const occurrenceNodeId = visibleNodeId(layout, `occurrence:${attachment.occurrenceId}`);
    addSummary(summaries, occurrenceNodeId, attachment.field.label, attachment.terminalIds.length, true, false);
    activeNodeIds.add(occurrenceNodeId);
    addPathElements(activeNodeIds, attachment.evidencePathElementIds);
    addPathRelations(activeEdgeIds, attachment.evidencePathRelationIds);
    for (const terminalId of attachment.terminalIds) {
      activeNodeIds.add(visibleNodeId(layout, `terminal:${terminalId}`));
      activeEdgeIds.add(`render-terminal:${terminalId}`);
    }
    addMatchingBridgeIds(
      totality.bridges,
      origin,
      attachment.occurrenceId,
      attachment.terminalIds,
      attachment.evidencePathElementIds,
      attachment.evidencePathRelationIds,
      activeBridgeIds,
    );
  }
  for (const frontier of frontiers) {
    addPathElements(frontierNodeIds, frontier.evidencePathElementIds);
    addPathRelations(frontierEdgeIds, frontier.evidencePathRelationIds);
    if (!frontier.occurrenceId) continue;
    const occurrenceNodeId = visibleNodeId(layout, `occurrence:${frontier.occurrenceId}`);
    addSummary(summaries, occurrenceNodeId, null, 0, false, true);
    frontierNodeIds.add(occurrenceNodeId);
    addMatchingBridgeIds(
      totality.bridges,
      origin,
      frontier.occurrenceId,
      [],
      frontier.evidencePathElementIds,
      frontier.evidencePathRelationIds,
      frontierBridgeIds,
    );
  }

  return {
    origin,
    originLabel: fieldOriginLabel(totality, origin),
    status: unavailable ? "unavailable" : frontiers.length > 0 ? "partial" : attachments.length > 0 ? "proven" : "no-fields",
    unavailableReason: unavailable ? totality.fieldLineage.unavailableReason : null,
    activeNodeIds,
    frontierNodeIds,
    activeEdgeIds,
    frontierEdgeIds,
    activeBridgeIds,
    frontierBridgeIds,
    summariesByNodeId: summariesToMap(summaries),
  };
}

function emptyFieldFocusModel(origin: RouteTotalityFieldOriginFocus | null): RouteTotalityFieldFocusModel {
  return {
    origin,
    originLabel: null,
    status: origin ? "unavailable" : "no-origin",
    unavailableReason: origin ? "Field lineage is unavailable for this route." : null,
    activeNodeIds: new Set(),
    frontierNodeIds: new Set(),
    activeEdgeIds: new Set(),
    frontierEdgeIds: new Set(),
    activeBridgeIds: new Set(),
    frontierBridgeIds: new Set(),
    summariesByNodeId: new Map(),
  };
}

function sameOrigin(
  left: { elementId: string; role: string },
  right: RouteTotalityFieldOriginFocus,
): boolean {
  return left.elementId === right.elementId && left.role === right.role;
}

function fieldOriginLabel(totality: RouteTotality, origin: RouteTotalityFieldOriginFocus): string {
  if ("origins" in totality.evidenceSlice) {
    const evidenceOrigin = totality.evidenceSlice.origins.find((candidate) => sameOrigin(candidate, origin));
    if (evidenceOrigin) return evidenceOrigin.label;
  }
  return `${origin.elementId} · ${origin.role}`;
}

function visibleNodeId(layout: RouteTotalityLayout, nodeId: string): string {
  let current = nodeId;
  const visited = new Set<string>();
  while (layout.nodeRedirects.has(current) && !visited.has(current)) {
    visited.add(current);
    current = layout.nodeRedirects.get(current) ?? current;
  }
  return current;
}

function addOriginPath(
  origin: RouteTotalityFieldOriginFocus,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
): void {
  nodeIds.add(`origin:${origin.elementId}:${origin.role}`);
  nodeIds.add(`evidence:${origin.elementId}`);
  edgeIds.add(`origin-evidence:${origin.elementId}:${origin.role}`);
}

function addPathElements(nodeIds: Set<string>, elementIds: readonly string[]): void {
  for (const elementId of elementIds) nodeIds.add(`evidence:${elementId}`);
}

function addPathRelations(edgeIds: Set<string>, relationIds: readonly string[]): void {
  for (const relationId of relationIds) edgeIds.add(relationId);
}

function addMatchingBridgeIds(
  bridges: RouteTotality["bridges"],
  origin: RouteTotalityFieldOriginFocus,
  occurrenceId: string,
  terminalIds: readonly string[],
  pathElementIds: readonly string[],
  pathRelationIds: readonly string[],
  bridgeIds: Set<string>,
): void {
  for (const bridge of bridges) {
    if (bridge.direction === "origin-to-render") {
      if (
        sameOrigin(bridge.from, origin)
        && bridge.to.occurrenceId === occurrenceId
        && bridgePathIsPrefix(bridge.evidencePathElementIds, bridge.evidencePathRelationIds, pathElementIds, pathRelationIds)
      ) bridgeIds.add(bridge.id);
      continue;
    }
    if (
      sameOrigin(bridge.to, origin)
      && terminalIds.includes(bridge.from.terminalId)
      && samePath(bridge.evidencePathElementIds, pathElementIds)
      && samePath(bridge.evidencePathRelationIds, pathRelationIds)
    ) bridgeIds.add(bridge.id);
  }
}

function bridgePathIsPrefix(
  bridgeElementIds: readonly string[],
  bridgeRelationIds: readonly string[],
  fieldElementIds: readonly string[],
  fieldRelationIds: readonly string[],
): boolean {
  return bridgeElementIds.length <= fieldElementIds.length
    && bridgeRelationIds.length <= fieldRelationIds.length
    && bridgeElementIds.every((elementId, index) => elementId === fieldElementIds[index])
    && bridgeRelationIds.every((relationId, index) => relationId === fieldRelationIds[index]);
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

type FieldSummaryAccumulator = {
  labels: Set<string>;
  terminalCount: number;
  hasProvenFields: boolean;
  hasFrontier: boolean;
};

function addSummary(
  summaries: Map<string, FieldSummaryAccumulator>,
  nodeId: string,
  label: string | null,
  terminalCount: number,
  proven: boolean,
  frontier: boolean,
): void {
  const summary = summaries.get(nodeId) ?? {
    labels: new Set<string>(),
    terminalCount: 0,
    hasProvenFields: false,
    hasFrontier: false,
  };
  if (label) summary.labels.add(label);
  summary.terminalCount += terminalCount;
  summary.hasProvenFields ||= proven;
  summary.hasFrontier ||= frontier;
  summaries.set(nodeId, summary);
}

function summariesToMap(
  summaries: Map<string, FieldSummaryAccumulator>,
): ReadonlyMap<string, RouteTotalityFieldOccurrenceSummary> {
  return new Map([...summaries.entries()].map(([nodeId, summary]) => {
    const labels = [...summary.labels].sort((left, right) => left.localeCompare(right));
    const visible = labels.slice(0, 3).map((label) => clip(label, 22));
    const overflow = labels.length > visible.length ? `+${labels.length - visible.length}` : null;
    const prefix = visible.join(" · ");
    const labelText = overflow
      ? `${clip(prefix, Math.max(1, 60 - overflow.length))} · ${overflow}`
      : clip(prefix, 64);
    return [nodeId, {
      labels,
      labelText,
      terminalCount: summary.terminalCount,
      hasProvenFields: summary.hasProvenFields,
      hasFrontier: summary.hasFrontier,
    }];
  }));
}

function clip(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
