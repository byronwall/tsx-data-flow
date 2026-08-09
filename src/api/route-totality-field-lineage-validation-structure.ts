import type { AnalysisCancellationToken } from "../analysis/cancellation";
import type { RouteTotality } from "./route-totality-contracts";
import { addIssue, type ValidationIssue } from "./route-occurrence-validation-graph";

export function validateFieldLineageCounts(
  lineage: RouteTotality["fieldLineage"],
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const origins = new Set<string>();
  const fields = new Set<string>();
  const occurrences = new Set<string>();
  const terminals = new Set<string>();
  for (const attachment of lineage.attachments) {
    cancellation.throwIfCancelled();
    origins.add(`${attachment.origin.elementId}:${attachment.origin.role}`);
    fields.add(attachment.field.elementIds.join("\u0000"));
    occurrences.add(attachment.occurrenceId);
    for (const terminalId of attachment.terminalIds) {
      cancellation.throwIfCancelled();
      terminals.add(terminalId);
    }
  }
  for (const frontier of lineage.frontiers) {
    cancellation.throwIfCancelled();
    origins.add(`${frontier.origin.elementId}:${frontier.origin.role}`);
    if (frontier.field) fields.add(frontier.field.elementIds.join("\u0000"));
    if (frontier.occurrenceId) occurrences.add(frontier.occurrenceId);
  }
  const expected = {
    origins: origins.size,
    fields: fields.size,
    occurrences: occurrences.size,
    terminals: terminals.size,
    frontiers: lineage.frontiers.length,
  };
  for (const key of ["origins", "fields", "occurrences", "terminals", "frontiers"] as const) {
    cancellation.throwIfCancelled();
    if (lineage.counts[key] !== expected[key]) {
      addIssue(issues, ["fieldLineage", "counts", key], `count must equal ${expected[key]}`);
    }
  }
  cancellation.throwIfCancelled();
}

export function validateStableFieldLineageId<T extends { id: string }>(
  values: readonly T[],
  index: number,
  path: Array<string | number>,
  issues: ValidationIssue[],
): void {
  if (index > 0 && values[index - 1].id.localeCompare(values[index].id) > 0) {
    addIssue(issues, path, "items must be sorted by stable id");
  }
}

export function validateSortedFieldLineageIds(
  values: readonly string[],
  path: Array<string | number>,
  label: string,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    cancellation.throwIfCancelled();
    const value = values[index];
    if (seen.has(value)) addIssue(issues, [...path, index], `duplicate ${label} id "${value}"`);
    if (index > 0 && values[index - 1].localeCompare(value) > 0) {
      addIssue(issues, [...path, index], `${label} ids must be sorted`);
    }
    seen.add(value);
  }
  cancellation.throwIfCancelled();
}

export function validateUniqueFieldLineageIds(
  values: readonly string[],
  path: Array<string | number>,
  label: string,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    cancellation.throwIfCancelled();
    if (seen.has(values[index])) addIssue(issues, [...path, index], `duplicate ${label} id "${values[index]}"`);
    seen.add(values[index]);
  }
  cancellation.throwIfCancelled();
}

export function hasFieldLineageId(
  values: readonly string[],
  value: string,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  for (const candidate of values) {
    cancellation.throwIfCancelled();
    if (candidate === value) return true;
  }
  cancellation.throwIfCancelled();
  return false;
}
