import type {
  RouteOccurrenceLocation,
  RouteOccurrenceSurface,
  RouteOccurrenceTotals,
} from "./route-occurrence-surface";
import type { RouteOccurrenceSurfaceBuilder } from "./route-occurrence-surface-builder";

export function finishRouteOccurrenceSurface(builder: RouteOccurrenceSurfaceBuilder): RouteOccurrenceSurface {
  const definitions = sortByLocation([...builder.definitions.values()]);
  const occurrences = sortByLocation([...builder.occurrences.values()]);
  const boundaries = sortByLocation([...builder.boundaries.values()]);
  const slots = sortByLocation([...builder.slots.values()]);
  const terminals = sortByLocation([...builder.terminals.values()]);
  const hidden = [...builder.hiddenWrappers.values()].sort((left, right) => locationSort(left.callSite, right.callSite) || left.occurrenceId.localeCompare(right.occurrenceId));
  const edges = [...builder.edges.values()].sort((left, right) => left.id.localeCompare(right.id));
  const omissions = [...builder.accounting.omissions.values()].sort((left, right) => left.reason.localeCompare(right.reason) || left.label.localeCompare(right.label));
  const totals: RouteOccurrenceTotals = {
    definitions: builder.accounting.discoveredDefinitions,
    emittedDefinitions: definitions.length,
    totalOccurrences: builder.accounting.discoveredOccurrences,
    emittedOccurrences: occurrences.length,
    repeatedSites: occurrences.filter((item) => item.repetition === "collection" || item.repetition === "unknown").length,
    conditionalSites: occurrences.filter((item) => item.repetition === "conditional" || item.repetition === "unknown").length,
    collectionSites: occurrences.filter((item) => item.repetition === "collection" || item.repetition === "unknown").length,
    frameworkBoundaries: builder.accounting.discoveredBoundaries,
    hiddenWrapperCompatibilityOccurrences: hidden.length,
    terminalOccurrences: builder.accounting.discoveredTerminals,
    namedOmissions: omissions.length,
    omittedItems: omissions.reduce((total, item) => total + item.count, 0),
  };
  const hasOutput = definitions.length > 0 || occurrences.length > 0 || boundaries.length > 0;
  const status = hasOutput ? Object.values(builder.accounting.truncated).some(Boolean) || omissions.length ? "partial" : "complete" : "unavailable";
  return {
    id: builder.surfaceId,
    status,
    route: { key: builder.route.key, pathPattern: builder.route.pathPattern, file: builder.route.file },
    scope: { id: builder.scopeId, seed: builder.scopeSeed },
    definitions,
    occurrences,
    frameworkBoundaries: boundaries,
    renderEdges: edges,
    slotForwarding: slots,
    hiddenWrapperCompatibility: hidden,
    terminals,
    omissions,
    totals,
    truncation: builder.accounting.truncated,
  };
}

function sortByLocation<T extends { id: string; callSite?: RouteOccurrenceLocation; location?: RouteOccurrenceLocation; sourceLocation?: RouteOccurrenceLocation | null }>(items: T[]) {
  return items.sort((left, right) => locationSort(left.callSite ?? left.location ?? left.sourceLocation, right.callSite ?? right.location ?? right.sourceLocation) || left.id.localeCompare(right.id));
}

function locationSort(left: RouteOccurrenceLocation | null | undefined, right: RouteOccurrenceLocation | null | undefined) {
  return (left?.file ?? "").localeCompare(right?.file ?? "") || (left?.line ?? 0) - (right?.line ?? 0) || (left?.column ?? 0) - (right?.column ?? 0);
}
