import type { RouteTotality } from "../../../api/contracts";

export type RouteTotalityFieldOriginFocus = RouteTotality["fieldLineage"]["attachments"][number]["origin"];

export type RouteTotalityFieldInspectorAttachment = {
  attachment: RouteTotality["fieldLineage"]["attachments"][number];
  terminalLabels: string[];
};

export type RouteTotalityFieldInspectorResult = {
  attachments: RouteTotalityFieldInspectorAttachment[];
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

export function selectRouteTotalityFieldInspectorResult(
  totality: RouteTotality | null,
  origin: RouteTotalityFieldOriginFocus | null,
  occurrenceId: string | null,
): RouteTotalityFieldInspectorResult | null {
  if (!totality || !origin || !occurrenceId) return null;
  const terminals = "terminals" in totality.occurrenceSurface ? totality.occurrenceSurface.terminals : [];
  const terminalLabels = new Map(terminals.map((terminal) => [terminal.id, terminal.label]));
  const attachments = totality.fieldLineage.attachments
    .filter((attachment) => attachment.origin.elementId === origin.elementId
      && attachment.origin.role === origin.role
      && attachment.occurrenceId === occurrenceId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((attachment) => ({
      attachment,
      terminalLabels: attachment.terminalIds
        .map((terminalId) => terminalLabels.get(terminalId) ?? terminalId)
        .sort(),
    }));
  return attachments.length > 0 ? { attachments } : null;
}
