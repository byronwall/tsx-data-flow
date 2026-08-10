import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import type {
  RouteTotalityFieldAttachment,
  RouteTotalityFieldFrontier,
  RouteTotalityFieldLineage,
} from "../../analysis/route-totality-field-lineage";
import type { EvidenceProof as DomainEvidenceProof, SourceLocation } from "../../analysis/scope-seam";
import type { RouteTotality } from "../route-totality-contracts";
import { sortedProject } from "./cancellable-projection";
import { projectSourceLocations } from "./route-totality-evidence-projection";

export function projectRouteTotalityFieldLineage(
  lineage: RouteTotalityFieldLineage,
  cancellation: AnalysisCancellationToken,
): RouteTotality["fieldLineage"] {
  cancellation.throwIfCancelled();
  const omissions: string[] = [];
  for (const omission of lineage.omissions) {
    cancellation.throwIfCancelled();
    omissions.push(omission);
  }
  cancellation.throwIfCancelled();
  return {
    status: lineage.status,
    unavailableReason: lineage.unavailableReason,
    attachments: sortedProject(lineage.attachments, (left, right) => left.id.localeCompare(right.id), projectAttachment, cancellation),
    frontiers: sortedProject(lineage.frontiers, (left, right) => left.id.localeCompare(right.id), projectFrontier, cancellation),
    counts: {
      origins: lineage.counts.origins,
      fields: lineage.counts.fields,
      occurrences: lineage.counts.occurrences,
      terminals: lineage.counts.terminals,
      frontiers: lineage.counts.frontiers,
    },
    omissions,
    transformations: sortedProject(lineage.transformations, (left, right) => left.id.localeCompare(right.id), projectTransformation, cancellation),
  };
}

function projectAttachment(
  attachment: RouteTotalityFieldAttachment,
  cancellation: AnalysisCancellationToken,
): RouteTotality["fieldLineage"]["attachments"][number] {
  cancellation.throwIfCancelled();
  const elementIds = copyIds(attachment.field.elementIds, cancellation);
  const segments = projectSegments(attachment.field.segments, cancellation);
  const terminalIds = copyIds(attachment.terminalIds, cancellation);
  const pathElementIds = copyIds(attachment.evidencePathElementIds, cancellation);
  const pathRelationIds = copyIds(attachment.evidencePathRelationIds, cancellation);
  const locations = projectSourceLocations(attachment.locations, cancellation);
  cancellation.throwIfCancelled();
  return {
    id: attachment.id,
    origin: { ...attachment.origin },
    field: {
      elementIds,
      segments,
      label: attachment.field.label,
      location: projectLocation(attachment.field.location),
    },
    occurrenceId: attachment.occurrenceId,
    terminalIds,
    evidencePathElementIds: pathElementIds,
    evidencePathRelationIds: pathRelationIds,
    proof: projectProofs(attachment.proof, cancellation),
    locations,
    consumer: attachment.consumer ? {
      ...attachment.consumer,
      location: projectLocation(attachment.consumer.location),
    } : null,
    alias: attachment.alias,
    transformationIds: copyIds(attachment.transformationIds, cancellation),
    transformationKinds: copyIds(attachment.transformationKinds, cancellation),
  };
}

function projectTransformation(
  transformation: RouteTotalityFieldLineage["transformations"][number],
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  return {
    id: transformation.id,
    kind: transformation.kind,
    fromElementIds: copyIds(transformation.fromElementIds, cancellation),
    toElementIds: copyIds(transformation.toElementIds, cancellation),
    locations: projectSourceLocations(transformation.locations, cancellation),
    proof: projectProofs(transformation.proof, cancellation),
    status: transformation.status,
  };
}

function projectFrontier(
  frontier: RouteTotalityFieldFrontier,
  cancellation: AnalysisCancellationToken,
): RouteTotality["fieldLineage"]["frontiers"][number] {
  cancellation.throwIfCancelled();
  const field = frontier.field ? {
    elementIds: copyIds(frontier.field.elementIds, cancellation),
    segments: projectSegments(frontier.field.segments, cancellation),
    label: frontier.field.label,
  } : null;
  cancellation.throwIfCancelled();
  return {
    id: frontier.id,
    origin: { ...frontier.origin },
    field,
    occurrenceId: frontier.occurrenceId,
    reason: frontier.reason,
    gapId: frontier.gapId,
    stoppedAtElementId: frontier.stoppedAtElementId,
    stoppedAtRelationId: frontier.stoppedAtRelationId,
    evidencePathElementIds: copyIds(frontier.evidencePathElementIds, cancellation),
    evidencePathRelationIds: copyIds(frontier.evidencePathRelationIds, cancellation),
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
  cancellation.throwIfCancelled();
  const projected: RouteTotality["scopeProof"] = [];
  for (const proof of proofs) {
    cancellation.throwIfCancelled();
    projected.push({
      kind: proof.kind,
      detail: proof.detail,
      locations: projectSourceLocations(proof.locations, cancellation),
      status: proof.status,
    });
  }
  cancellation.throwIfCancelled();
  return projected;
}

function projectSegments(
  segments: readonly { kind: "property" | "string-index" | "numeric-index" | "collection-element"; value: string }[],
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  const projected: Array<{ kind: "property" | "string-index" | "numeric-index" | "collection-element"; value: string }> = [];
  for (const segment of segments) {
    cancellation.throwIfCancelled();
    projected.push({ kind: segment.kind, value: segment.value });
  }
  cancellation.throwIfCancelled();
  return projected;
}

function copyIds(values: readonly string[], cancellation: AnalysisCancellationToken): string[] {
  cancellation.throwIfCancelled();
  const copied: string[] = [];
  for (const value of values) {
    cancellation.throwIfCancelled();
    copied.push(value);
  }
  cancellation.throwIfCancelled();
  return copied;
}
