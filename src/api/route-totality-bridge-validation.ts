import type { RouteTotality } from "./route-totality-contracts";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "../analysis/cancellation";
import {
  addIssue,
  type ValidationIssue,
} from "./route-occurrence-validation-graph";

export function validateRouteTotalityBridges(
  totality: RouteTotality,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bridges = totality.bridges;
  const unavailable = isUnavailable(totality.occurrenceSurface) || isUnavailable(totality.evidenceSlice);
  const expectedCounts = {
    total: bridges.length,
    originToRender: 0,
    renderTerminalToOrigin: 0,
    proven: 0,
    partial: 0,
  };
  for (const bridge of bridges) {
    cancellation.throwIfCancelled();
    expectedCounts[bridge.direction === "origin-to-render" ? "originToRender" : "renderTerminalToOrigin"] += 1;
    expectedCounts[bridge.status] += 1;
  }
  for (const key of Object.keys(expectedCounts) as Array<keyof typeof expectedCounts>) {
    cancellation.throwIfCancelled();
    if (totality.bridgeCounts[key] !== expectedCounts[key]) {
      addIssue(issues, ["bridgeCounts", key], `count must equal ${expectedCounts[key]}`);
    }
  }
  if (unavailable) {
    if (bridges.length > 0) addIssue(issues, ["bridges"], "unavailable totality cannot contain cross-layer bridges");
    return issues;
  }

  const surface = totality.occurrenceSurface;
  const evidence = totality.evidenceSlice;
  if (isUnavailable(surface) || isUnavailable(evidence)) return issues;

  const elements = indexBy(evidence.elements, (element) => element.id, cancellation);
  const relations = indexBy(evidence.relations, (relation) => relation.id, cancellation);
  const origins = indexBy(evidence.origins, (origin) => `${origin.elementId}:${origin.role}`, cancellation);
  const occurrences = indexBy(surface.occurrences, (occurrence) => occurrence.id, cancellation);
  const terminals = indexBy(surface.terminals, (terminal) => terminal.id, cancellation);
  const ids = new Set<string>();

  bridges.forEach((bridge, index) => {
    cancellation.throwIfCancelled();
    const path = ["bridges", index] as Array<string | number>;
    if (ids.has(bridge.id)) addIssue(issues, [...path, "id"], `duplicate bridge id "${bridge.id}"`);
    ids.add(bridge.id);
    if (index > 0 && bridges[index - 1].id.localeCompare(bridge.id) > 0) {
      addIssue(issues, path, "bridges must be sorted by stable id for byte-stable projection");
    }
    if (bridge.proof.status !== bridge.status) addIssue(issues, [...path, "proof", "status"], "proof status must match bridge status");
    if (bridge.proof.kind !== "route-totality-bridge") addIssue(issues, [...path, "proof", "kind"], "bridge proof must identify an explicit route-totality bridge");
    validateUniqueStrings(bridge.evidencePathElementIds, [...path, "evidencePathElementIds"], "evidence element", issues, cancellation);
    validateUniqueStrings(bridge.evidencePathRelationIds, [...path, "evidencePathRelationIds"], "evidence relation", issues, cancellation);
    if (bridge.evidencePathRelationIds.length !== bridge.evidencePathElementIds.length - 1) {
      addIssue(issues, path, "evidence path must contain one relation between each adjacent element");
    }

    const originEndpoint = bridge.direction === "origin-to-render" ? bridge.from : bridge.to;
    const origin = origins.get(`${originEndpoint.elementId}:${originEndpoint.role}`);
    const originElement = elements.get(originEndpoint.elementId);
    if (!origin) addIssue(issues, [...path, bridge.direction === "origin-to-render" ? "from" : "to"], "bridge origin is not present in the evidence slice");
    if (!originElement) addIssue(issues, [...path, "evidencePathElementIds", 0], "bridge path starts at an unknown evidence element");
    if (origin && origin.proof.length === 0) addIssue(issues, [...path], "bridge origin must carry source proof");
    if (originElement && originElement.proof.length === 0) addIssue(issues, [...path, "evidencePathElementIds", 0], "bridge origin element must carry source proof");
    if (bridge.evidencePathElementIds[0] !== originEndpoint.elementId) addIssue(issues, [...path, "evidencePathElementIds", 0], "bridge path must start at its origin element");

    for (const [pathIndex, elementId] of bridge.evidencePathElementIds.entries()) {
      cancellation.throwIfCancelled();
      const element = elements.get(elementId);
      if (!element) addIssue(issues, [...path, "evidencePathElementIds", pathIndex], `bridge path references unknown evidence element "${elementId}"`);
      else if (element.proof.length === 0) addIssue(issues, [...path, "evidencePathElementIds", pathIndex], "bridge path elements must carry source proof");
    }
    for (const [pathIndex, relationId] of bridge.evidencePathRelationIds.entries()) {
      cancellation.throwIfCancelled();
      const relation = relations.get(relationId);
      if (!relation) {
        addIssue(issues, [...path, "evidencePathRelationIds", pathIndex], `bridge path references unknown evidence relation "${relationId}"`);
        continue;
      }
      if (relation.status === "unsupported") addIssue(issues, [...path, "evidencePathRelationIds", pathIndex], "bridges cannot use unsupported evidence relations");
      if (relation.proof.locations.length === 0) addIssue(issues, [...path, "evidencePathRelationIds", pathIndex], "bridge path relations must carry source proof locations");
      const from = bridge.evidencePathElementIds[pathIndex];
      const to = bridge.evidencePathElementIds[pathIndex + 1];
      if (relation.from !== from || relation.to !== to) addIssue(issues, [...path, "evidencePathRelationIds", pathIndex], "evidence relation does not connect adjacent bridge path elements");
    }

    const endpointLocation = bridge.direction === "origin-to-render"
      ? occurrences.get(bridge.to.occurrenceId)?.callSite
      : terminals.get(bridge.from.terminalId)?.location;
    if (!endpointLocation) {
      addIssue(issues, [...path, bridge.direction === "origin-to-render" ? "to" : "from"], "bridge references an unknown occurrence-surface endpoint");
      return;
    }
    const anchorId = bridge.evidencePathElementIds[bridge.evidencePathElementIds.length - 1];
    const anchor = elements.get(anchorId);
    if (!anchor) return;
    if (!sameLocation(anchor.location, endpointLocation)) addIssue(issues, path, "bridge endpoint and evidence anchor do not have the same exact source location");
    if (bridge.direction === "origin-to-render") {
      const occurrence = occurrences.get(bridge.to.occurrenceId);
      if (!occurrence) return;
      if (occurrence.parentOccurrenceId === null) {
        if (occurrence.scopeSeed !== surface.scope.seed) addIssue(issues, [...path, "to"], "root occurrence is not the selected route scope entry");
      } else if (anchor.kind !== "component-occurrence") {
        addIssue(issues, [...path, "evidencePathElementIds"], "non-root occurrence requires a compiler-backed component-occurrence anchor");
      }
    } else {
      const terminal = terminals.get(bridge.from.terminalId);
      if (!terminal) return;
      const expectedKind = terminal.kind === "jsx-text" || terminal.kind === "render-expression" ? "render-terminal" : "dom-terminal";
      if (anchor.kind !== expectedKind || !anchor.terminalRoles.includes("render")) addIssue(issues, [...path, "evidencePathElementIds"], "terminal requires a matching render-terminal evidence anchor");
      if (!evidence.terminals.some((terminal) => terminal.elementId === anchor.id && terminal.role === "render")) addIssue(issues, [...path, "evidencePathElementIds"], "terminal anchor is not a serialized render terminal");
    }

    const statuses = [
      ...(origin ? [origin.status] : []),
      ...bridge.evidencePathElementIds.flatMap((elementId) => {
        cancellation.throwIfCancelled();
        const element = elements.get(elementId);
        return element ? [element.status] : [];
      }),
      ...bridge.evidencePathRelationIds.flatMap((relationId) => {
        cancellation.throwIfCancelled();
        const relation = relations.get(relationId);
        return relation ? [relation.status] : [];
      }),
    ];
    if (statuses.includes("unsupported")) addIssue(issues, path, "bridges cannot contain unsupported proof statuses");
    const expectedStatus = statuses.includes("partial") ? "partial" : "proven";
    if (bridge.status !== expectedStatus) addIssue(issues, [...path, "status"], `bridge status must be ${expectedStatus} for its proof path`);

    const expectedLocations = uniqueLocations([
      ...bridge.evidencePathElementIds.flatMap((elementId) => {
        cancellation.throwIfCancelled();
        const element = elements.get(elementId);
        return element ? [element.location] : [];
      }),
      ...bridge.evidencePathRelationIds.flatMap((relationId) => {
        cancellation.throwIfCancelled();
        const relation = relations.get(relationId);
        return relation ? relation.proof.locations : [];
      }),
      endpointLocation,
    ]);
    const actualLocations = bridge.locations.map(locationKey);
    const proofLocations = bridge.proof.locations.map(locationKey);
    if (JSON.stringify(actualLocations) !== JSON.stringify(expectedLocations.map(locationKey))) addIssue(issues, [...path, "locations"], "bridge locations must contain the exact path and endpoint locations");
    if (JSON.stringify(proofLocations) !== JSON.stringify(actualLocations)) addIssue(issues, [...path, "proof", "locations"], "bridge proof locations must match bridge locations");
  });
  return issues;
}

function validateUniqueStrings(
  values: string[],
  path: Array<string | number>,
  label: string,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    cancellation.throwIfCancelled();
    if (seen.has(value)) addIssue(issues, [...path, index], `duplicate ${label} id "${value}"`);
    seen.add(value);
  });
}

function indexBy<T>(values: readonly T[], key: (value: T) => string, cancellation: AnalysisCancellationToken): Map<string, T> {
  const index = new Map<string, T>();
  for (const value of values) {
    cancellation.throwIfCancelled();
    index.set(key(value), value);
  }
  return index;
}

function uniqueLocations(
  locations: Array<RouteTotality["scopeProof"][number]["locations"][number]>,
) {
  return [...new Map(locations.map((location) => [locationKey(location), location])).values()]
    .sort((left, right) => locationKey(left).localeCompare(locationKey(right)));
}

function locationKey(location: RouteTotality["scopeProof"][number]["locations"][number]): string {
  return `${location.file}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}

function sameLocation(
  left: RouteTotality["scopeProof"][number]["locations"][number],
  right: RouteTotality["scopeProof"][number]["locations"][number],
): boolean {
  return locationKey(left) === locationKey(right);
}

function isUnavailable(value: unknown): value is { status: "unavailable"; reason: string } {
  return Boolean(value && typeof value === "object" && "reason" in value && (value as { status?: unknown }).status === "unavailable");
}
