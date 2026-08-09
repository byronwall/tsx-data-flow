import type { AnalysisCancellationToken } from "./cancellation";
import type {
  RouteTotalityFieldAttachment,
  RouteTotalityFieldFrontier,
} from "./route-totality-field-lineage";

export function lineageCounts(
  attachments: readonly RouteTotalityFieldAttachment[],
  frontiers: readonly RouteTotalityFieldFrontier[],
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  const origins = new Set<string>();
  const fields = new Set<string>();
  const occurrences = new Set<string>();
  const terminals = new Set<string>();
  for (const attachment of attachments) {
    cancellation.throwIfCancelled();
    origins.add(`${attachment.origin.elementId}:${attachment.origin.role}`);
    fields.add(attachment.field.elementIds.join("\u0000"));
    occurrences.add(attachment.occurrenceId);
    terminals.add(attachment.terminalIds[0]);
  }
  for (const frontier of frontiers) {
    cancellation.throwIfCancelled();
    origins.add(`${frontier.origin.elementId}:${frontier.origin.role}`);
    if (frontier.field) fields.add(frontier.field.elementIds.join("\u0000"));
    if (frontier.occurrenceId) occurrences.add(frontier.occurrenceId);
  }
  cancellation.throwIfCancelled();
  return {
    origins: origins.size,
    fields: fields.size,
    occurrences: occurrences.size,
    terminals: terminals.size,
    frontiers: frontiers.length,
  };
}
