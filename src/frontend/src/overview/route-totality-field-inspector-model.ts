import type { RouteTotality } from "../../../api/contracts";
import type { RouteTotalityDisplayLayoutEdge } from "./route-totality-display-layout";
import { routeTotalityLocationLabel, type RouteTotalityLocation, type RouteTotalityLayout } from "./route-totality-model";
import type { RouteTotalityFieldOriginFocus } from "./route-totality-field-lineage-model";

type RouteTotalityFieldAttachment = RouteTotality["fieldLineage"]["attachments"][number];
type RouteTotalityFieldFrontier = RouteTotality["fieldLineage"]["frontiers"][number];

export type RouteTotalityFieldInspectorScope =
  | { kind: "origin" }
  | { kind: "occurrence"; occurrenceId: string };

export type RouteTotalityFieldInspectorAttachment = {
  attachment: RouteTotalityFieldAttachment;
  terminalCount: number;
};

export type RouteTotalityFieldInspectorFrontier = {
  frontier: RouteTotalityFieldFrontier;
};

export type RouteTotalityFieldInspectorGroup = {
  occurrenceId: string | null;
  label: string;
  location: RouteTotalityLocation | null;
  attachments: RouteTotalityFieldInspectorAttachment[];
  frontiers: RouteTotalityFieldInspectorFrontier[];
};

export type RouteTotalityFieldUse = {
  key: string;
  attachment: RouteTotalityFieldAttachment;
  occurrenceId: string;
  componentName: string;
  occurrenceLocation: RouteTotalityLocation | null;
  consumerLabel: string;
  consumerKind: string;
  consumerLocation: RouteTotalityLocation | null;
  aliasLabel: string | null;
  selected: boolean;
};

export type RouteTotalityFieldSummary = {
  label: string;
  useCount: number;
  componentCount: number;
  occurrences: Array<{ occurrenceId: string; componentName: string; location: RouteTotalityLocation | null; uses: RouteTotalityFieldUse[] }>;
  selected: boolean;
};

export type RouteTotalityFieldInspectorResult = {
  status: "no-origin" | "unavailable" | "no-fields" | "proven" | "partial";
  unavailableReason: string | null;
  scope: RouteTotalityFieldInspectorScope;
  targetOccurrenceId: string | null;
  groups: RouteTotalityFieldInspectorGroup[];
  attachments: RouteTotalityFieldInspectorAttachment[];
  frontiers: RouteTotalityFieldInspectorFrontier[];
  fields: RouteTotalityFieldSummary[];
  selectedField: string | null;
  selectedConsumer: string | null;
};

const FRONTIER_REASON_LABELS: Record<RouteTotalityFieldFrontier["reason"], string> = {
  "partial-proof": "Partial proof",
  "budget-exhausted": "Budget exhausted",
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
  scope: RouteTotalityFieldInspectorScope,
  selectedField: string | null = null,
  selectedConsumer: string | null = null,
): RouteTotalityFieldInspectorResult | null {
  if (!totality) return null;
  if (totality.fieldLineage.status === "unavailable") {
    return {
      ...emptyResult("unavailable", scope),
      unavailableReason: totality.fieldLineage.unavailableReason,
      selectedField,
      selectedConsumer,
    };
  }
  if (!origin) return emptyResult("no-origin", scope, selectedField, selectedConsumer);

  const surfaceOccurrences = "occurrences" in totality.occurrenceSurface
    ? totality.occurrenceSurface.occurrences
    : [];
  const targetNodeId = scope.kind === "occurrence"
    ? visibleNodeId(layout, `occurrence:${scope.occurrenceId}`)
    : null;
  const matchingAttachments = uniqueById(totality.fieldLineage.attachments)
    .filter((attachment) => sameOrigin(attachment.origin, origin))
    .filter((attachment) => targetNodeId === null || visibleNodeId(layout, `occurrence:${attachment.occurrenceId}`) === targetNodeId);
  const matchingFrontiers = uniqueById(totality.fieldLineage.frontiers)
    .filter((frontier) => sameOrigin(frontier.origin, origin))
    .filter((frontier) => targetNodeId === null
      ? true
      : frontier.occurrenceId !== null && visibleNodeId(layout, `occurrence:${frontier.occurrenceId}`) === targetNodeId);
  const recordOccurrenceIds = new Set(matchingAttachments.map((attachment) => attachment.occurrenceId));
  for (const frontier of matchingFrontiers) {
    if (frontier.occurrenceId !== null) recordOccurrenceIds.add(frontier.occurrenceId);
  }
  const matchingOccurrences = surfaceOccurrences
    .filter((occurrence) => scope.kind === "occurrence"
      ? visibleNodeId(layout, `occurrence:${occurrence.id}`) === targetNodeId
      : recordOccurrenceIds.has(occurrence.id))
    .sort((left, right) => compareCodePoint(left.id, right.id));
  const occurrenceIds = new Set<string | null>(matchingOccurrences.map((occurrence) => occurrence.id));
  for (const occurrenceId of recordOccurrenceIds) occurrenceIds.add(occurrenceId);
  if (scope.kind === "occurrence" && occurrenceIds.size === 0) occurrenceIds.add(scope.occurrenceId);
  if (scope.kind === "origin" && matchingFrontiers.some((frontier) => frontier.occurrenceId === null)) occurrenceIds.add(null);

  const groups = [...occurrenceIds]
    .sort(compareOccurrenceIds)
    .map((occurrenceId) => {
      const occurrence = occurrenceId === null
        ? undefined
        : matchingOccurrences.find((candidate) => candidate.id === occurrenceId);
      return {
        occurrenceId,
        label: occurrenceId === null ? "Evidence path" : occurrence?.name ?? occurrence?.expression ?? occurrenceId,
        location: occurrence?.callSite ?? null,
        attachments: matchingAttachments
          .filter((attachment) => attachment.occurrenceId === occurrenceId)
          .map((attachment) => ({ attachment, terminalCount: attachment.terminalIds.length })),
        frontiers: matchingFrontiers
          .filter((frontier) => frontier.occurrenceId === occurrenceId)
          .map((frontier) => ({ frontier })),
      };
    });
  const attachments = groups.flatMap((group) => group.attachments);
  const frontiers = groups.flatMap((group) => group.frontiers);
  const status = frontiers.length > 0 || (totality.fieldLineage.status === "partial" && attachments.length > 0)
    ? "partial"
    : attachments.length > 0
      ? "proven"
      : "no-fields";
  return {
    status,
    unavailableReason: null,
    scope,
    targetOccurrenceId: scope.kind === "occurrence" ? scope.occurrenceId : null,
    groups,
    attachments,
    frontiers,
    fields: buildFieldSummaries(attachments, matchingOccurrences, selectedField, selectedConsumer),
    selectedField,
    selectedConsumer,
  };
}

export function selectRouteTotalityFieldFrontierLabels(
  totality: RouteTotality | null,
  origin: RouteTotalityFieldOriginFocus | null,
  edges: readonly RouteTotalityDisplayLayoutEdge[],
): ReadonlyMap<string, string> {
  if (!totality || !origin) return new Map();
  const frontiers = uniqueById(totality.fieldLineage.frontiers)
    .filter((frontier) => sameOrigin(frontier.origin, origin));
  const labelsByEdgeId = new Map<string, Set<string>>();
  for (const edge of edges) {
    const relationLabel = edge.edge.label.trim() || edge.edge.kind.trim() || "Evidence path";
    for (const frontier of frontiers) {
      if (!frontier.evidencePathRelationIds.includes(edge.id)) continue;
      const location = frontier.location ?? frontier.proof[0]?.locations[0] ?? edge.edge.locations[0] ?? null;
      const label = `Field continuity stopped — ${relationLabel} — ${routeTotalityFieldFrontierReason(frontier.reason)} — ${routeTotalityLocationLabel(location)}`;
      const labels = labelsByEdgeId.get(edge.id) ?? new Set<string>();
      labels.add(label);
      labelsByEdgeId.set(edge.id, labels);
    }
  }
  return new Map([...labelsByEdgeId.entries()]
    .sort(([left], [right]) => compareCodePoint(left, right))
    .map(([edgeId, labels]) => [edgeId, [...labels].sort(compareCodePoint).join(" · ")]));
}

export function routeTotalityFieldFrontierReason(reason: RouteTotalityFieldFrontier["reason"]): string {
  return FRONTIER_REASON_LABELS[reason];
}

function emptyResult(
  status: RouteTotalityFieldInspectorResult["status"],
  scope: RouteTotalityFieldInspectorScope,
  selectedField: string | null = null,
  selectedConsumer: string | null = null,
): RouteTotalityFieldInspectorResult {
  return {
    status,
    unavailableReason: null,
    scope,
    targetOccurrenceId: scope.kind === "occurrence" ? scope.occurrenceId : null,
    groups: [],
    attachments: [],
    frontiers: [],
    fields: [],
    selectedField,
    selectedConsumer,
  };
}

function buildFieldSummaries(
  attachments: RouteTotalityFieldInspectorAttachment[],
  occurrences: RouteTotalitySurfaceOccurrence[],
  selectedField: string | null,
  selectedConsumer: string | null,
): RouteTotalityFieldSummary[] {
  const occurrenceById = new Map(occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const fields = new Map<string, RouteTotalityFieldUse[]>();
  for (const item of attachments) {
    const attachment = item.attachment;
    const occurrence = occurrenceById.get(attachment.occurrenceId);
    const consumer = attachment.consumer;
    const uses = fields.get(attachment.field.label) ?? [];
    uses.push({
      key: consumer?.id ?? attachment.id,
      attachment,
      occurrenceId: attachment.occurrenceId,
      componentName: occurrence?.name ?? "Unnamed component occurrence",
      occurrenceLocation: occurrence?.callSite ?? null,
      consumerLabel: consumer?.label ?? "Unmapped consumer",
      consumerKind: consumer?.kind ?? "field read",
      consumerLocation: consumer?.location ?? attachment.field.location,
      aliasLabel: aliasLabel(attachment.alias, attachment.field.label),
      selected: consumer?.id === selectedConsumer || attachment.id === selectedConsumer,
    });
    fields.set(attachment.field.label, uses);
  }
  return [...fields.entries()]
    .sort(([left], [right]) => compareCodePoint(left, right))
    .map(([label, uses]) => {
      const occurrencesById = new Map<string, RouteTotalityFieldUse[]>();
      for (const use of uses) occurrencesById.set(use.occurrenceId, [...(occurrencesById.get(use.occurrenceId) ?? []), use]);
      const grouped = [...occurrencesById.entries()]
        .sort(([left], [right]) => compareCodePoint(left, right))
        .map(([occurrenceId, occurrenceUses]) => ({
          occurrenceId,
          componentName: occurrenceUses[0].componentName,
          location: occurrenceUses[0].occurrenceLocation,
          uses: occurrenceUses.sort((left, right) => compareCodePoint(left.key, right.key)),
        }));
      return {
        label,
        useCount: uses.length,
        componentCount: grouped.length,
        occurrences: grouped,
        selected: selectedField === label,
      };
    });
}

function aliasLabel(alias: unknown, fieldLabel: string): string | null {
  if (typeof alias === "string") {
    const target = alias.split(/->|→/).at(-1)?.trim();
    return target ? `${fieldLabel} -> ${target}` : alias;
  }
  if (!alias || typeof alias !== "object") return null;
  const value = alias as { from?: unknown; to?: unknown };
  return typeof value.to === "string" ? `${fieldLabel} -> ${value.to}` : null;
}

type RouteTotalitySurfaceOccurrence = RouteTotality["occurrenceSurface"] extends infer Surface
  ? Surface extends { occurrences: Array<infer Occurrence> } ? Occurrence : never
  : never;

function uniqueById<T extends { id: string }>(records: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const record of records) {
    if (!byId.has(record.id)) byId.set(record.id, record);
  }
  return [...byId.values()].sort((left, right) => compareCodePoint(left.id, right.id));
}

function compareOccurrenceIds(left: string | null, right: string | null): number {
  if (left === null) return right === null ? 0 : -1;
  if (right === null) return 1;
  return compareCodePoint(left, right);
}

function compareCodePoint(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
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
