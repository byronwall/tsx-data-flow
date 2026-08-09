import type { RouteTotality } from "../../../api/contracts";
import type { RouteTotalityLocation, RouteTotalityLayout } from "./route-totality-model";
import type { RouteTotalityFieldOriginFocus } from "./route-totality-field-lineage-model";

type RouteTotalityFieldAttachment = RouteTotality["fieldLineage"]["attachments"][number];
type RouteTotalityFieldFrontier = RouteTotality["fieldLineage"]["frontiers"][number];

export type RouteTotalityFieldInspectorAttachment = {
  attachment: RouteTotalityFieldAttachment;
  terminalCount: number;
};

export type RouteTotalityFieldInspectorFrontier = {
  frontier: RouteTotalityFieldFrontier;
};

export type RouteTotalityFieldInspectorGroup = {
  occurrenceId: string;
  label: string;
  location: RouteTotalityLocation | null;
  attachments: RouteTotalityFieldInspectorAttachment[];
  frontiers: RouteTotalityFieldInspectorFrontier[];
};

export type RouteTotalityFieldInspectorResult = {
  status: "no-origin" | "unavailable" | "no-fields" | "proven" | "partial";
  unavailableReason: string | null;
  groups: RouteTotalityFieldInspectorGroup[];
  attachments: RouteTotalityFieldInspectorAttachment[];
  frontiers: RouteTotalityFieldInspectorFrontier[];
};

const FRONTIER_REASON_LABELS: Record<RouteTotalityFieldFrontier["reason"], string> = {
  "partial-proof": "Partial proof",
  "identity-lost": "Identity lost",
  "ambiguous-target": "Ambiguous target",
  "unsupported-relation": "Unsupported relation",
  "unsupported-transform": "Unsupported transform",
  "dynamic-index": "Dynamic index",
  "renamed-prop": "Renamed prop",
  "multiple-origins": "Multiple origins",
  "evidence-truncated": "Evidence truncated",
  "unmapped-occurrence": "Occurrence not mapped",
  "unmapped-terminal": "Terminal not mapped",
};

export function selectRouteTotalityFieldInspectorResult(
  totality: RouteTotality | null,
  layout: RouteTotalityLayout,
  origin: RouteTotalityFieldOriginFocus | null,
  occurrenceId: string | null,
): RouteTotalityFieldInspectorResult | null {
  if (!totality || !occurrenceId) return null;
  if (totality.fieldLineage.status === "unavailable") {
    return {
      ...emptyResult("unavailable"),
      unavailableReason: totality.fieldLineage.unavailableReason,
    };
  }
  if (!origin) return emptyResult("no-origin");

  const targetNodeId = visibleNodeId(layout, `occurrence:${occurrenceId}`);
  const surfaceOccurrences = "occurrences" in totality.occurrenceSurface
    ? totality.occurrenceSurface.occurrences
    : [];
  const matchingOccurrences = surfaceOccurrences
    .filter((occurrence) => visibleNodeId(layout, `occurrence:${occurrence.id}`) === targetNodeId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const matchingAttachments = totality.fieldLineage.attachments
    .filter((attachment) => sameOrigin(attachment.origin, origin) && visibleNodeId(layout, `occurrence:${attachment.occurrenceId}`) === targetNodeId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const matchingFrontiers = totality.fieldLineage.frontiers
    .filter((frontier) => sameOrigin(frontier.origin, origin)
      && frontier.occurrenceId !== null
      && visibleNodeId(layout, `occurrence:${frontier.occurrenceId}`) === targetNodeId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const occurrenceIds = new Set([
    ...matchingOccurrences.map((occurrence) => occurrence.id),
    ...matchingAttachments.map((attachment) => attachment.occurrenceId),
    ...matchingFrontiers.flatMap((frontier) => frontier.occurrenceId ? [frontier.occurrenceId] : []),
  ]);
  if (occurrenceIds.size === 0) occurrenceIds.add(occurrenceId);

  const groups = [...occurrenceIds].sort((left, right) => left.localeCompare(right)).map((id) => {
    const occurrence = matchingOccurrences.find((candidate) => candidate.id === id);
    const attachments = matchingAttachments
      .filter((attachment) => attachment.occurrenceId === id)
      .map((attachment) => ({ attachment, terminalCount: attachment.terminalIds.length }));
    const frontiers = matchingFrontiers
      .filter((frontier) => frontier.occurrenceId === id)
      .map((frontier) => ({ frontier }));
    return {
      occurrenceId: id,
      label: occurrence?.expression ?? occurrence?.name ?? id,
      location: occurrence?.callSite ?? null,
      attachments,
      frontiers,
    };
  });
  const attachments = groups.flatMap((group) => group.attachments);
  const frontiers = groups.flatMap((group) => group.frontiers);
  const status = frontiers.length > 0 || (totality.fieldLineage.status === "partial" && attachments.length > 0)
    ? "partial"
    : attachments.length > 0
      ? "proven"
      : "no-fields";
  return { status, unavailableReason: null, groups, attachments, frontiers };
}

export function routeTotalityFieldFrontierReason(reason: RouteTotalityFieldFrontier["reason"]): string {
  return FRONTIER_REASON_LABELS[reason];
}

function emptyResult(status: RouteTotalityFieldInspectorResult["status"]): RouteTotalityFieldInspectorResult {
  return { status, unavailableReason: null, groups: [], attachments: [], frontiers: [] };
}

function sameOrigin(
  left: { elementId: string; role: string },
  right: RouteTotalityFieldOriginFocus,
): boolean {
  return left.elementId === right.elementId && left.role === right.role;
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
