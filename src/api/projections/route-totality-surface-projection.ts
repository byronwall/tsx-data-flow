import type {
  RouteOccurrenceSurface as DomainOccurrenceSurface,
} from "../../analysis/route-occurrence-surface";
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { countItems, projectItems, sumItems } from "./cancellable-projection";
import {
  isUnavailable,
  projectOccurrenceLocation,
  projectOrigin,
  projectSourceLocations,
} from "./route-totality-evidence-projection";
import type {
  RouteCount,
  RouteOccurrenceSurface,
  RouteTotality,
} from "../route-totality-contracts";
import type { RouteTotalityUnavailable } from "../../analysis/route-data-totality";

type DomainOccurrenceValue = DomainOccurrenceSurface | RouteTotalityUnavailable;

export function projectRouteIdentity(route: { key: string; pathPattern: string; file: string }): RouteTotality["route"] {
  return {
    key: route.key,
    pathPattern: route.pathPattern,
    file: route.file,
  };
}

export function projectOccurrenceSurface(
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
        : occurrenceCount(evidence.origins.length, evidence.origins.length, evidenceIncomplete),
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
    origins: evidenceIncomplete,
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

function projectBoundary(
  boundary: DomainOccurrenceSurface["frameworkBoundaries"][number],
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
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
      locations: projectSourceLocations(boundary.condition.locations, cancellation),
    } : null,
    ownership: boundary.ownership,
  };
}

function projectOccurrenceEdge(
  edge: DomainOccurrenceSurface["renderEdges"][number],
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    locations: projectSourceLocations(edge.locations, cancellation),
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

function projectOccurrenceOmission(
  omission: DomainOccurrenceSurface["omissions"][number],
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  return {
    id: omission.id,
    reason: omission.reason,
    label: omission.label,
    count: omission.count,
    locations: projectSourceLocations(omission.locations, cancellation),
  };
}
