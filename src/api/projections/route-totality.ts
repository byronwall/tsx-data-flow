import type { EvidenceSlice as DomainEvidenceSlice } from "../../analysis/evidence-slice";
import type {
  RouteOccurrenceSurface as DomainOccurrenceSurface,
  RouteOccurrenceLocation as DomainOccurrenceLocation,
} from "../../analysis/route-occurrence-surface";
import type { RouteTotalityBridge as DomainRouteTotalityBridge } from "../../analysis/route-totality-bridge";
import type {
  RouteTotalityFindingAttachment as DomainRouteTotalityFindingAttachment,
  RouteTotalityFindingIndexEntry as DomainRouteTotalityFindingIndexEntry,
  RouteTotalityRecord,
  RouteTotalityUnavailable,
} from "../../analysis/route-data-totality";
import type { EvidenceProof as DomainEvidenceProof, ScopePolicy, SourceLocation } from "../../analysis/scope-seam";
import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "../../analysis/cancellation";
import { validateRouteTotality } from "../route-occurrence-validation";
import { countItems, projectItems, sortedProject, sumItems } from "./cancellable-projection";
import { projectContextContinuity } from "./context-continuity";
import { projectRouteTotalityFieldLineage } from "./route-totality-field-lineage";
import type {
  EvidenceSlice,
  RouteCount,
  RouteOccurrenceSurface,
  RouteTotality,
} from "../route-totality-contracts";

type DomainEvidenceValue = DomainEvidenceSlice | RouteTotalityUnavailable;
type DomainOccurrenceValue = DomainOccurrenceSurface | RouteTotalityUnavailable;

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

function projectRouteIdentity(route: RouteTotalityRecord["route"]): RouteTotality["route"] {
  return {
    key: route.key,
    pathPattern: route.pathPattern,
    file: route.file,
  };
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

function projectOccurrenceSurface(
  surface: DomainOccurrenceValue,
  evidence: RouteTotality["evidenceSlice"],
  cancellation: AnalysisCancellationToken,
): RouteOccurrenceSurface | RouteTotality["occurrenceSurface"] {
  if (isUnavailable(surface)) return { status: "unavailable", reason: surface.reason };

  const incomplete = surface.status !== "complete"
    || surface.omissions.length > 0
  const evidenceIncomplete = !isUnavailable(evidence)
    && (evidence.coverage.budgetExhausted || Object.values(evidence.coverage.truncation).some(Boolean));
  const evidenceUnavailable = isUnavailable(evidence);
  const totalityIncomplete = incomplete || evidenceIncomplete || Object.values(surface.truncation).some(Boolean);
  const truncation = projectOccurrenceTruncation(surface, evidenceIncomplete);
  const emittedDefinitions = surface.definitions.length;
  const emittedOccurrences = surface.occurrences.length;
  const emittedEdges = surface.renderEdges.length;
  const emittedBoundaries = surface.frameworkBoundaries.length;
  const emittedTerminals = surface.terminals.length;
  const emittedHiddenWrappers = surface.hiddenWrapperCompatibility.length;
  const emittedRepeated = countItems(surface.occurrences, (item) => item.repetition === "collection" || item.repetition === "unknown", cancellation);
  const emittedConditional = countItems(surface.occurrences, (item) => item.repetitionMarkers.includes("conditional"), cancellation);
  const emittedCollection = countItems(surface.occurrences, (item) => item.repetitionMarkers.includes("collection"), cancellation);
  const emittedOmissions = surface.omissions.length;
  const emittedOmittedItems = sumItems(surface.omissions, (item) => item.count, cancellation);
  const boundaryIdsByOccurrence = boundaryIdsByChildOccurrence(surface, cancellation);

  return {
    id: surface.id,
    status: surface.status === "complete" && (evidenceIncomplete || evidenceUnavailable) ? "partial" : surface.status,
    route: projectRouteIdentity(surface.route),
    scope: {
      id: surface.scope.id,
      seed: surface.scope.seed,
    },
    definitions: projectItems(surface.definitions, projectDefinition, cancellation),
    occurrences: projectItems(surface.occurrences, (occurrence) => projectOccurrence(
      occurrence,
      boundaryIdsByOccurrence.get(occurrence.id) ?? [],
    ), cancellation),
    renderEdges: projectItems(surface.renderEdges, projectOccurrenceEdge, cancellation),
    frameworkBoundaries: projectItems(surface.frameworkBoundaries, projectBoundary, cancellation),
    slotForwarding: projectItems(surface.slotForwarding, projectSlotForwarding, cancellation),
    origins: evidenceUnavailable ? [] : projectItems(evidence.origins, projectOrigin, cancellation),
    terminals: projectItems(surface.terminals, projectTerminalOccurrence, cancellation),
    hiddenWrapperCompatibility: projectItems(surface.hiddenWrapperCompatibility, projectHiddenWrapper, cancellation),
    omissions: projectItems(surface.omissions, projectOccurrenceOmission, cancellation),
    totals: {
      definitions: occurrenceCount(emittedDefinitions, surface.totals.definitions, totalityIncomplete),
      occurrences: occurrenceCount(emittedOccurrences, surface.totals.totalOccurrences, totalityIncomplete),
      edges: occurrenceCount(emittedEdges, emittedEdges, totalityIncomplete),
      boundaries: occurrenceCount(emittedBoundaries, surface.totals.frameworkBoundaries, totalityIncomplete),
      origins: evidenceUnavailable
        ? unknownCount()
        : occurrenceCount(evidence.origins.length, evidence.origins.length, totalityIncomplete),
      terminals: occurrenceCount(emittedTerminals, surface.totals.terminalOccurrences, totalityIncomplete),
      hiddenWrappers: occurrenceCount(emittedHiddenWrappers, surface.totals.hiddenWrapperCompatibilityOccurrences, totalityIncomplete),
      repeated: occurrenceCount(emittedRepeated, surface.totals.repeatedSites, totalityIncomplete),
      conditional: occurrenceCount(emittedConditional, surface.totals.conditionalSites, totalityIncomplete),
      collection: occurrenceCount(emittedCollection, surface.totals.collectionSites, totalityIncomplete),
      omissions: occurrenceCount(emittedOmissions, surface.totals.namedOmissions, totalityIncomplete),
      omittedItems: occurrenceCount(emittedOmittedItems, surface.totals.omittedItems, totalityIncomplete),
    },
    truncation,
  };
}

function projectOccurrenceTruncation(surface: DomainOccurrenceSurface, evidenceIncomplete: boolean): RouteOccurrenceSurface["truncation"] {
  const occurrenceRelated = surface.truncation.occurrences || surface.truncation.definitions;
  return {
    definitions: surface.truncation.definitions,
    occurrences: surface.truncation.occurrences,
    edges: surface.truncation.edges,
    boundaries: surface.truncation.boundaries,
    origins: occurrenceRelated || evidenceIncomplete,
    terminals: surface.truncation.terminals,
    hiddenWrappers: occurrenceRelated,
    repeated: occurrenceRelated,
    conditional: occurrenceRelated,
    collection: occurrenceRelated,
    omissions: surface.truncation.omissions,
  };
}

function occurrenceCount(emitted: number, total: number, incomplete: boolean): RouteCount {
  return {
    emitted,
    total,
    totalStatus: incomplete ? "lower-bound" : "exact",
  };
}

function unknownCount(): RouteCount {
  return { emitted: 0, total: null, totalStatus: "unknown" };
}

function projectEvidenceSlice(slice: DomainEvidenceValue, cancellation: AnalysisCancellationToken): EvidenceSlice | RouteTotality["evidenceSlice"] {
  if (isUnavailable(slice)) return { status: "unavailable", reason: slice.reason };
  return {
    elements: projectItems(slice.elements, (element) => ({
      id: element.id,
      kind: element.kind,
      fieldName: element.fieldName,
      operationKind: element.operationKind,
      label: element.label,
      source: {
        file: element.source.file,
        start: element.source.start,
        end: element.source.end,
      },
      location: projectLocation(element.location),
      status: element.status,
      proof: projectProofs(element.proof, cancellation),
      symbol: element.symbol,
      originRoles: [...element.originRoles],
      terminalRoles: [...element.terminalRoles],
      boundary: element.boundary,
    }), cancellation),
    relations: projectItems(slice.relations, (relation) => ({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      kind: relation.kind,
      status: relation.status,
      proof: projectProof(relation.proof, cancellation),
    }), cancellation),
    origins: projectItems(slice.origins, (origin) => ({
      elementId: origin.elementId,
      role: origin.role,
      label: origin.label,
      status: origin.status,
      proof: projectProofs(origin.proof, cancellation),
    }), cancellation),
    terminals: projectItems(slice.terminals, (terminal) => ({
      elementId: terminal.elementId,
      role: terminal.role,
      label: terminal.label,
      status: terminal.status,
      proof: projectProofs(terminal.proof, cancellation),
    }), cancellation),
    gaps: projectItems(slice.gaps, (gap) => ({
      id: gap.id,
      from: gap.from,
      to: gap.to,
      label: gap.label,
      reason: gap.reason,
      status: gap.status,
      location: gap.location ? projectLocation(gap.location) : null,
      proof: projectProofs(gap.proof, cancellation),
    }), cancellation),
    coverage: {
      status: slice.coverage.status,
      complete: slice.coverage.complete,
      direction: slice.coverage.direction,
      budget: {
        limit: slice.coverage.budget.limit,
        used: slice.coverage.budget.used,
        exhausted: slice.coverage.budget.exhausted,
      },
      budgetExhausted: slice.coverage.budgetExhausted,
      elements: { ...slice.coverage.elements },
      relations: { ...slice.coverage.relations },
      origins: slice.coverage.origins,
      terminals: slice.coverage.terminals,
      gaps: slice.coverage.gaps,
      notes: [...slice.coverage.notes],
      included: { ...slice.coverage.included },
      proven: { ...slice.coverage.proven },
      partial: { ...slice.coverage.partial },
      gap: { ...slice.coverage.gap },
      truncation: { ...slice.coverage.truncation },
    },
  };
}

function projectCounts(
  surface: RouteTotality["occurrenceSurface"],
  evidence: RouteTotality["evidenceSlice"],
): RouteTotality["counts"] {
  const occurrenceCounts = isUnavailable(surface)
    ? unavailableOccurrenceCounts()
    : surface.totals;
  const evidenceCounts = isUnavailable(evidence)
    ? unavailableEvidenceCounts()
    : evidenceCountsFor(evidence);
  return {
    ...occurrenceCounts,
    ...evidenceCounts,
  };
}

function unavailableOccurrenceCounts(): Pick<RouteTotality["counts"], "definitions" | "occurrences" | "edges" | "boundaries" | "origins" | "terminals" | "hiddenWrappers" | "repeated" | "conditional" | "collection" | "omissions" | "omittedItems"> {
  return {
    definitions: unknownCount(),
    occurrences: unknownCount(),
    edges: unknownCount(),
    boundaries: unknownCount(),
    origins: unknownCount(),
    terminals: unknownCount(),
    hiddenWrappers: unknownCount(),
    repeated: unknownCount(),
    conditional: unknownCount(),
    collection: unknownCount(),
    omissions: unknownCount(),
    omittedItems: unknownCount(),
  };
}

function unavailableEvidenceCounts(): Pick<RouteTotality["counts"], "evidenceElements" | "evidenceRelations" | "evidenceOrigins" | "evidenceTerminals" | "evidenceGaps"> {
  return {
    evidenceElements: unknownCount(),
    evidenceRelations: unknownCount(),
    evidenceOrigins: unknownCount(),
    evidenceTerminals: unknownCount(),
    evidenceGaps: unknownCount(),
  };
}

function evidenceCountsFor(slice: EvidenceSlice): Pick<RouteTotality["counts"], "evidenceElements" | "evidenceRelations" | "evidenceOrigins" | "evidenceTerminals" | "evidenceGaps"> {
  const lowerBound = slice.coverage.budgetExhausted || Object.values(slice.coverage.truncation).some(Boolean);
  const totalStatus = lowerBound ? "lower-bound" : "exact";
  return {
    evidenceElements: evidenceCount(slice.coverage.included.elements, slice.coverage.elements.total, totalStatus),
    evidenceRelations: evidenceCount(slice.coverage.included.relations, slice.coverage.relations.total, totalStatus),
    evidenceOrigins: evidenceCount(slice.coverage.included.origins, slice.coverage.origins, totalStatus),
    evidenceTerminals: evidenceCount(slice.coverage.included.terminals, slice.coverage.terminals, totalStatus),
    evidenceGaps: evidenceCount(slice.gaps.length, slice.coverage.gap.total, totalStatus),
  };
}

function evidenceCount(emitted: number, total: number, totalStatus: "exact" | "lower-bound"): RouteCount {
  return { emitted, total, totalStatus };
}

function projectDefinition(definition: DomainOccurrenceSurface["definitions"][number]) {
  return {
    id: definition.id,
    name: definition.name,
    compilerIdentity: definition.compilerIdentity,
    sourceIdentity: definition.sourceIdentity,
    sourceFile: definition.sourceFile,
    importModule: definition.importModule,
    declaration: definition.declaration ? projectOccurrenceLocation(definition.declaration) : null,
    external: definition.external,
  };
}

function projectOccurrence(
  occurrence: DomainOccurrenceSurface["occurrences"][number],
  derivedBoundaryIds: string[],
) {
  return {
    id: occurrence.id,
    key: occurrence.key,
    callSiteId: occurrence.callSiteId,
    definitionId: occurrence.definitionId,
    definitionSourceIdentity: occurrence.definitionSourceIdentity,
    definitionCompilerIdentity: occurrence.definitionCompilerIdentity,
    name: occurrence.name,
    expression: occurrence.expression,
    parentOccurrenceId: occurrence.parentOccurrenceId,
    renderParentId: occurrence.renderParentId,
    scopeId: occurrence.scopeId,
    scopeSeed: occurrence.scopeSeed,
    callSite: projectOccurrenceLocation(occurrence.callSite),
    ownership: occurrence.ownership,
    repetition: occurrence.repetition,
    repetitionMarkers: [...occurrence.repetitionMarkers],
    runtimeMultiplicity: occurrence.runtimeMultiplicity,
    staticCallSiteCount: occurrence.staticCallSiteCount,
    callerOwnedChildOccurrenceIds: [...occurrence.callerOwnedChildOccurrenceIds],
    definitionOwnedChildOccurrenceIds: [...occurrence.definitionOwnedChildOccurrenceIds],
    slotForwardingIds: [...occurrence.slotForwardingIds],
    frameworkBoundaryIds: [...new Set([...occurrence.frameworkBoundaryIds, ...derivedBoundaryIds])],
    hiddenWrapperCompatibility: occurrence.hiddenWrapperCompatibility,
  };
}

function boundaryIdsByChildOccurrence(surface: DomainOccurrenceSurface, cancellation: AnalysisCancellationToken) {
  const ids = new Map<string, string[]>();
  for (const boundary of surface.frameworkBoundaries) {
    cancellation.throwIfCancelled();
    for (const occurrenceId of [...boundary.childOccurrenceIds, ...boundary.fallbackChildOccurrenceIds]) {
      cancellation.throwIfCancelled();
      const current = ids.get(occurrenceId) ?? [];
      if (!current.includes(boundary.id)) current.push(boundary.id);
      ids.set(occurrenceId, current);
    }
  }
  return ids;
}

function projectBoundary(boundary: DomainOccurrenceSurface["frameworkBoundaries"][number]) {
  return {
    id: boundary.id,
    key: boundary.key,
    name: boundary.name,
    kind: boundary.kind,
    scopeId: boundary.scopeId,
    scopeSeed: boundary.scopeSeed,
    parentOccurrenceId: boundary.parentOccurrenceId,
    renderParentId: boundary.renderParentId,
    location: projectOccurrenceLocation(boundary.location),
    repetition: boundary.repetition,
    repetitionMarkers: [...boundary.repetitionMarkers],
    runtimeMultiplicity: boundary.runtimeMultiplicity,
    childOccurrenceIds: [...boundary.childOccurrenceIds],
    fallbackChildOccurrenceIds: [...boundary.fallbackChildOccurrenceIds],
    sourceExpression: boundary.sourceExpression,
    sourceLocation: boundary.sourceLocation ? projectOccurrenceLocation(boundary.sourceLocation) : null,
    sourceBacked: boundary.sourceBacked,
    condition: boundary.condition ? {
      outcome: boundary.condition.outcome,
      detail: boundary.condition.detail,
      locations: boundary.condition.locations.map(projectOccurrenceLocation),
    } : null,
    ownership: boundary.ownership,
  };
}

function projectOccurrenceEdge(edge: DomainOccurrenceSurface["renderEdges"][number]) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    locations: edge.locations.map(projectOccurrenceLocation),
    detail: edge.detail,
  };
}

function projectSlotForwarding(slot: DomainOccurrenceSurface["slotForwarding"][number]) {
  return {
    id: slot.id,
    occurrenceId: slot.occurrenceId,
    kind: slot.kind,
    evidence: {
      kind: slot.evidence.kind,
      label: slot.evidence.label,
    },
    definitionSourceIdentity: slot.definitionSourceIdentity,
    sourceLocation: projectOccurrenceLocation(slot.sourceLocation),
    callerChildOccurrenceIds: [...slot.callerChildOccurrenceIds],
    sourceBacked: slot.sourceBacked,
    detail: slot.detail,
  };
}

function projectTerminalOccurrence(terminal: DomainOccurrenceSurface["terminals"][number]) {
  return {
    id: terminal.id,
    kind: terminal.kind,
    ownerOccurrenceId: terminal.ownerOccurrenceId,
    renderParentId: terminal.renderParentId,
    location: projectOccurrenceLocation(terminal.location),
    label: terminal.label,
    expression: terminal.expression,
    repetition: terminal.repetition,
    runtimeMultiplicity: terminal.runtimeMultiplicity,
  };
}

function projectHiddenWrapper(wrapper: DomainOccurrenceSurface["hiddenWrapperCompatibility"][number]) {
  return {
    occurrenceId: wrapper.occurrenceId,
    definitionId: wrapper.definitionId,
    name: wrapper.name,
    callSite: projectOccurrenceLocation(wrapper.callSite),
    detail: wrapper.detail,
  };
}

function projectOccurrenceOmission(omission: DomainOccurrenceSurface["omissions"][number]) {
  return {
    id: omission.id,
    reason: omission.reason,
    label: omission.label,
    count: omission.count,
    locations: omission.locations.map(projectOccurrenceLocation),
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

function projectOccurrenceLocation(location: DomainOccurrenceLocation) {
  return projectLocation(location);
}

function projectProofs(proofs: DomainEvidenceProof[], cancellation: AnalysisCancellationToken): Array<RouteTotality["scopeProof"][number]> {
  return projectItems(proofs, (proof) => ({
    kind: proof.kind,
    detail: proof.detail,
    locations: proof.locations.map(projectLocation),
    status: proof.status,
  }), cancellation);
}

function projectProof(proof: DomainEvidenceProof, cancellation: AnalysisCancellationToken): EvidenceSlice["relations"][number]["proof"] {
  cancellation.throwIfCancelled();
  return {
    kind: proof.kind,
    detail: proof.detail,
    locations: proof.locations.map(projectLocation),
    status: proof.status,
  };
}

function projectOrigin(origin: NonNullable<DomainEvidenceSlice["origins"]>[number], cancellation: AnalysisCancellationToken) {
  return {
    elementId: origin.elementId,
    role: origin.role,
    label: origin.label,
    status: origin.status,
    proof: projectProofs(origin.proof, cancellation),
  };
}

function isUnavailable(value: unknown): value is RouteTotalityUnavailable {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { status?: unknown; reason?: unknown };
  return candidate.status === "unavailable" && typeof candidate.reason === "string";
}
