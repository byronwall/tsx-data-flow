import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import type {
  RouteTotalityFieldAttachment,
  RouteTotalityFieldFrontier,
  RouteTotalityFieldLineage,
} from "../../analysis/route-totality-field-lineage";
import type { EvidenceProof as DomainEvidenceProof, SourceLocation } from "../../analysis/scope-seam";
import type { RouteTotality } from "../route-totality-contracts";
import { sortedProject } from "./cancellable-projection";

export function projectRouteTotalityFieldLineage(
  lineage: RouteTotalityFieldLineage,
  cancellation: AnalysisCancellationToken,
): RouteTotality["fieldLineage"] {
  return {
    status: lineage.status,
    unavailableReason: lineage.unavailableReason,
    attachments: sortedProject(lineage.attachments, (left, right) => left.id.localeCompare(right.id), projectAttachment, cancellation),
    frontiers: sortedProject(lineage.frontiers, (left, right) => left.id.localeCompare(right.id), projectFrontier, cancellation),
    counts: { ...lineage.counts },
    omissions: [...lineage.omissions],
  };
}

function projectAttachment(
  attachment: RouteTotalityFieldAttachment,
  cancellation: AnalysisCancellationToken,
): RouteTotality["fieldLineage"]["attachments"][number] {
  return {
    id: attachment.id,
    origin: { ...attachment.origin },
    field: {
      elementIds: [...attachment.field.elementIds],
      segments: attachment.field.segments.map((segment) => ({ ...segment })),
      label: attachment.field.label,
      location: projectLocation(attachment.field.location),
    },
    occurrenceId: attachment.occurrenceId,
    terminalIds: [...attachment.terminalIds],
    evidencePathElementIds: [...attachment.evidencePathElementIds],
    evidencePathRelationIds: [...attachment.evidencePathRelationIds],
    proof: projectProofs(attachment.proof, cancellation),
    locations: attachment.locations.map(projectLocation),
  };
}

function projectFrontier(
  frontier: RouteTotalityFieldFrontier,
  cancellation: AnalysisCancellationToken,
): RouteTotality["fieldLineage"]["frontiers"][number] {
  return {
    id: frontier.id,
    origin: { ...frontier.origin },
    field: frontier.field ? {
      elementIds: [...frontier.field.elementIds],
      segments: frontier.field.segments.map((segment) => ({ ...segment })),
      label: frontier.field.label,
    } : null,
    occurrenceId: frontier.occurrenceId,
    reason: frontier.reason,
    stoppedAtElementId: frontier.stoppedAtElementId,
    stoppedAtRelationId: frontier.stoppedAtRelationId,
    location: frontier.location ? projectLocation(frontier.location) : null,
    proof: projectProofs(frontier.proof, cancellation),
  };
}

function projectLocation(location: SourceLocation) {
  return {
    file: location.file,
    line: location.line,
    column: location.column,
    span: { ...location.span },
  };
}

function projectProofs(proofs: DomainEvidenceProof[], cancellation: AnalysisCancellationToken): RouteTotality["scopeProof"] {
  return proofs.map((proof) => {
    cancellation.throwIfCancelled();
    return {
      kind: proof.kind,
      detail: proof.detail,
      locations: proof.locations.map(projectLocation),
      status: proof.status,
    };
  });
}
