import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { isFullyProvenElement } from "../analysis/route-totality-field-lineage-transition";
import { addIssue, type ValidationIssue } from "./route-occurrence-validation-graph";
import {
  endpointTerminalAnchors,
  exactElement,
  fullyProvenTerminal,
  type EvidenceIndexes,
  type FieldAttachment,
  type SurfaceIndexes,
  type SurfaceOccurrence,
} from "./route-totality-field-lineage-validation-index";

export function validateFieldLineageAttachmentTerminals(
  attachment: FieldAttachment,
  occurrence: SurfaceOccurrence | undefined,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (attachment.terminalIds.length !== 1) {
    addIssue(issues, [...path, "terminalIds"], "Milestone 1 field attachments require exactly one terminal");
    cancellation.throwIfCancelled();
    return;
  }
  const terminalId = attachment.terminalIds[0];
  const terminals = surface.terminalsById.get(terminalId) ?? [];
  if (terminals.length !== 1) {
    addIssue(issues, [...path, "terminalIds"], `field attachment terminal "${terminalId}" must exist exactly once`);
    cancellation.throwIfCancelled();
    return;
  }
  const terminal = terminals[0];
  const anchors = endpointTerminalAnchors(surface.anchors, terminalId, cancellation);
  if (anchors.length !== 1 || surface.anchors.terminalIssuesByEndpointId.has(terminalId)) {
    addIssue(issues, [...path, "terminalIds"], "field terminal must have one unshared exact evidence anchor");
    cancellation.throwIfCancelled();
    return;
  }
  const anchor = anchors[0];
  const reverse = surface.anchors.terminalAnchorsByEvidenceElementId.get(anchor.evidenceElementId) ?? [];
  const anchorElement = exactElement(evidence, anchor.evidenceElementId);
  if (reverse.length !== 1 || !anchorElement || !isFullyProvenElement(anchorElement, cancellation)) {
    addIssue(issues, [...path, "terminalIds"], "field terminal anchor must be uniquely and fully proven");
  }
  const finalElementId = attachment.evidencePathElementIds[attachment.evidencePathElementIds.length - 1] ?? null;
  if (finalElementId !== anchor.evidenceElementId) {
    addIssue(issues, [...path, "evidencePathElementIds"], "field terminal evidence anchor must equal the final canonical path element");
  }
  if (!occurrence || terminal.ownerOccurrenceId !== occurrence.id) {
    addIssue(issues, [...path, "terminalIds"], "field terminal must be render-owned by its attachment occurrence");
  }
  const terminalRecords = evidence.terminalsByKey.get(`${anchor.evidenceElementId}:render`) ?? [];
  if (terminalRecords.length !== 1 || !fullyProvenTerminal(terminalRecords[0], cancellation)) {
    addIssue(issues, [...path, "terminalIds"], "field terminal must have one fully proven render evidence record");
  }
  cancellation.throwIfCancelled();
}
