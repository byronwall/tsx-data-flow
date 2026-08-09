import type { RouteTotalityBridge as DomainRouteTotalityBridge } from "../../analysis/route-totality-bridge";
import type {
  RouteTotalityFindingAttachment as DomainRouteTotalityFindingAttachment,
  RouteTotalityFindingIndexEntry as DomainRouteTotalityFindingIndexEntry,
  RouteTotalityRecord,
} from "../../analysis/route-data-totality";
import type { ScopePolicy } from "../../analysis/scope-seam";
import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "../../analysis/cancellation";
import { validateRouteTotality } from "../route-occurrence-validation";
import { projectItems, sortedProject } from "./cancellable-projection";
import { projectContextContinuity } from "./context-continuity";
import {
  projectCounts,
  projectEvidenceSlice,
  projectLocation,
  projectProof,
  projectProofs,
} from "./route-totality-evidence-projection";
import { projectRouteTotalityFieldLineage } from "./route-totality-field-lineage";
import { projectOccurrenceSurface, projectRouteIdentity } from "./route-totality-surface-projection";
import type { RouteTotality } from "../route-totality-contracts";

export function projectRouteTotality(record: RouteTotalityRecord | undefined, cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION): RouteTotality | null {
  cancellation.throwIfCancelled();
  if (!record) return null;

  const evidenceSlice = projectEvidenceSlice(record.evidenceSlice, cancellation);
  const occurrenceSurface = projectOccurrenceSurface(record.occurrenceSurface, evidenceSlice, cancellation);
  const totality: RouteTotality = {
    status: record.status,
    route: projectRouteIdentity(record.route),
    candidate: record.candidate ? projectCandidate(record.candidate, cancellation) : null,
    seed: record.seed ? projectSeed(record.seed, cancellation) : null,
    scopeProof: projectProofs(record.scopeProof, cancellation),
    occurrenceSurface,
    evidenceSlice,
    contextContinuity: projectContextContinuity(record.contextContinuity, cancellation),
    bridges: sortedProject(record.bridges, (left, right) => left.id.localeCompare(right.id), projectBridge, cancellation),
    bridgeCounts: { ...record.bridgeCounts },
    fieldLineage: projectRouteTotalityFieldLineage(record.fieldLineage, cancellation),
    findingAttachments: sortedProject(record.findingAttachments, (left, right) => left.id.localeCompare(right.id), projectFindingAttachment, cancellation),
    findingIndex: sortedProject(record.findingIndex, (left, right) => left.findingId.localeCompare(right.findingId), projectFindingIndexEntry, cancellation),
    counts: projectCounts(occurrenceSurface, evidenceSlice),
    gaps: projectItems(record.gaps, projectTotalityGap, cancellation),
    omissions: [...record.omissions],
  };

  cancellation.throwIfCancelled();
  const issues = validateRouteTotality(totality, cancellation);
  cancellation.throwIfCancelled();
  if (issues.length > 0) {
    const first = issues[0];
    const path = first.path.length > 0 ? first.path.join(".") : "root";
    throw new Error(`Route totality projection failed at ${path}: ${first.message}`);
  }
  return totality;
}

function projectCandidate(candidate: NonNullable<RouteTotalityRecord["candidate"]>, cancellation: AnalysisCancellationToken): NonNullable<RouteTotality["candidate"]> {
  return {
    id: candidate.id,
    kind: candidate.kind,
    adapter: candidate.adapter,
    label: candidate.label,
    entryElementId: candidate.entryElementId,
    entry: projectLocation(candidate.entry),
    framework: candidate.framework,
    proof: projectProofs(candidate.proof, cancellation),
    defaults: projectScopePolicy(candidate.defaults),
  };
}

function projectSeed(seed: NonNullable<RouteTotalityRecord["seed"]>, cancellation: AnalysisCancellationToken): NonNullable<RouteTotality["seed"]> {
  return {
    candidateId: seed.candidateId,
    entryElementId: seed.entryElementId,
    adapter: seed.adapter,
    label: seed.label,
    framework: seed.framework,
    proof: projectProofs(seed.proof, cancellation),
    defaults: projectScopePolicy(seed.defaults),
  };
}

function projectScopePolicy(policy: ScopePolicy): NonNullable<RouteTotality["candidate"]>["defaults"] {
  return {
    direction: policy.direction,
    boundaryPolicy: {
      maxDepth: policy.boundaryPolicy.maxDepth,
      maxElements: policy.boundaryPolicy.maxElements,
      maxRelations: policy.boundaryPolicy.maxRelations,
      includeExternal: policy.boundaryPolicy.includeExternal,
      includeUnsupported: policy.boundaryPolicy.includeUnsupported,
      includeFramework: policy.boundaryPolicy.includeFramework,
      stopAtBoundary: policy.boundaryPolicy.stopAtBoundary,
    },
    terminalPolicy: {
      roles: [...policy.terminalPolicy.roles],
      maxTerminals: policy.terminalPolicy.maxTerminals,
      includeIntermediate: policy.terminalPolicy.includeIntermediate,
      stopAtTerminal: policy.terminalPolicy.stopAtTerminal,
    },
  };
}




function projectTotalityGap(gap: RouteTotalityRecord["gaps"][number], cancellation: AnalysisCancellationToken) {
  return {
    id: gap.id,
    source: gap.source,
    reason: gap.reason,
    label: gap.label,
    status: gap.status,
    location: gap.location ? projectLocation(gap.location) : null,
    proof: projectProofs(gap.proof, cancellation),
  };
}

function projectBridge(bridge: DomainRouteTotalityBridge, cancellation: AnalysisCancellationToken): RouteTotality["bridges"][number] {
  const common = {
    id: bridge.id,
    status: bridge.status,
    proof: projectProof(bridge.proof, cancellation),
    locations: bridge.locations.map(projectLocation),
    evidencePathElementIds: [...bridge.evidencePathElementIds],
    evidencePathRelationIds: [...bridge.evidencePathRelationIds],
  };
  if (bridge.direction === "origin-to-render") {
    return {
      ...common,
      direction: bridge.direction,
      from: { ...bridge.from },
      to: { ...bridge.to },
    };
  }
  return {
    ...common,
    direction: bridge.direction,
    from: { ...bridge.from },
    to: { ...bridge.to },
  };
}

function projectFindingAttachment(
  attachment: DomainRouteTotalityFindingAttachment,
  cancellation: AnalysisCancellationToken,
): RouteTotality["findingAttachments"][number] {
  return {
    id: attachment.id,
    findingId: attachment.findingId,
    expressionId: attachment.expressionId,
    target: { ...attachment.target },
    location: projectLocation(attachment.location),
    status: attachment.status,
    proof: projectProof(attachment.proof, cancellation),
  };
}

function projectFindingIndexEntry(
  entry: DomainRouteTotalityFindingIndexEntry,
): RouteTotality["findingIndex"][number] {
  return {
    findingId: entry.findingId,
    label: entry.label,
    family: entry.family,
    file: entry.file,
    location: projectLocation(entry.location),
    expressionIds: [...entry.expressionIds],
    detailRef: { ...entry.detailRef },
  };
}
