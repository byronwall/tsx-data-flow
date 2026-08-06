import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import type { RouteContextContinuity } from "../../analysis/context-continuity";
import type { EvidenceProof, SourceLocation } from "../../analysis/scope-seam";
import { sortedProject } from "./cancellable-projection";
import type { RouteTotality } from "../route-totality-contracts";

export function projectContextContinuity(
  context: RouteContextContinuity,
  cancellation: AnalysisCancellationToken,
): RouteTotality["contextContinuity"] {
  return {
    status: context.status,
    counts: { ...context.counts },
    declarations: sortedProject(context.declarations, compareIds, (declaration) => ({
      id: declaration.id,
      compilerIdentity: declaration.compilerIdentity,
      sourceIdentity: declaration.sourceIdentity,
      label: declaration.label,
      location: projectLocation(declaration.location),
      defaultValueId: declaration.defaultValueId,
      status: declaration.status,
      proof: projectProofs(declaration.proof, cancellation),
    }), cancellation),
    providers: sortedProject(context.providers, compareIds, (provider) => ({
      id: provider.id,
      contextDeclarationId: provider.contextDeclarationId,
      renderOccurrenceId: provider.renderOccurrenceId,
      ownership: provider.ownership,
      repetition: provider.repetition,
      location: projectLocation(provider.location),
      valueId: provider.valueId,
      status: provider.status,
      proof: projectProofs(provider.proof, cancellation),
    }), cancellation),
    values: sortedProject(context.values, compareIds, (value) => ({
      id: value.id,
      contextDeclarationId: value.contextDeclarationId,
      providerOccurrenceId: value.providerOccurrenceId,
      sourceKind: value.sourceKind,
      expression: value.expression,
      location: projectLocation(value.location),
      memberNames: [...value.memberNames],
      memberCertainty: value.memberCertainty,
      status: value.status,
      proof: projectProofs(value.proof, cancellation),
    }), cancellation),
    reads: sortedProject(context.reads, compareIds, (read) => ({
      id: read.id,
      contextDeclarationId: read.contextDeclarationId,
      consumerOccurrenceId: read.consumerOccurrenceId,
      expression: read.expression,
      location: projectLocation(read.location),
      members: [...read.members],
      memberCertainty: read.memberCertainty,
      status: read.status,
      proof: projectProofs(read.proof, cancellation),
    }), cancellation),
    consumers: sortedProject(context.consumers, compareIds, (consumer) => ({
      id: consumer.id,
      contextDeclarationId: consumer.contextDeclarationId,
      renderOccurrenceId: consumer.renderOccurrenceId,
      readIds: [...consumer.readIds].sort(),
      terminalIds: [...consumer.terminalIds].sort(),
      repetition: consumer.repetition,
      location: projectLocation(consumer.location),
      status: consumer.status,
      proof: projectProofs(consumer.proof, cancellation),
    }), cancellation),
    links: sortedProject(context.links, compareIds, (link) => ({
      id: link.id,
      contextDeclarationId: link.contextDeclarationId,
      providerOccurrenceId: link.providerOccurrenceId,
      providedValueId: link.providedValueId,
      readId: link.readId,
      consumerOccurrenceId: link.consumerOccurrenceId,
      terminalIds: [...link.terminalIds].sort(),
      members: [...link.members],
      memberCertainty: link.memberCertainty,
      sourceKind: link.sourceKind,
      renderAncestry: [...link.renderAncestry],
      nearestProvider: link.nearestProvider,
      repetition: link.repetition,
      status: link.status,
      proof: projectProofs(link.proof, cancellation),
    }), cancellation),
    gaps: sortedProject(context.gaps, compareIds, (gap) => ({
      id: gap.id,
      contextDeclarationId: gap.contextDeclarationId,
      providerOccurrenceId: gap.providerOccurrenceId,
      readId: gap.readId,
      consumerOccurrenceId: gap.consumerOccurrenceId,
      reason: gap.reason,
      label: gap.label,
      status: gap.status,
      location: gap.location ? projectLocation(gap.location) : null,
      proof: projectProofs(gap.proof, cancellation),
    }), cancellation),
  };
}

function compareIds(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function projectProofs(proofs: EvidenceProof[], cancellation: AnalysisCancellationToken) {
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

function projectLocation(location: SourceLocation) {
  return {
    file: location.file,
    line: location.line,
    column: location.column,
    span: {
      startLine: location.span.startLine,
      startColumn: location.span.startColumn,
      endLine: location.span.endLine,
      endColumn: location.span.endColumn,
    },
  };
}
