import path from "node:path";
import type { EvidenceSlice } from "./evidence-slice";
import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "./cancellation";
import type {
  EvidenceStatus,
  OriginRole,
  SourceLocation,
} from "./scope-seam";
import { stableHash } from "./scope-seam";
import type {
  RouteOccurrenceSurface,
  RouteRenderOccurrence,
  RouteTerminalOccurrence,
} from "./route-occurrence-surface";

export type RouteTotalityBridgeDirection =
  | "origin-to-render"
  | "render-terminal-to-origin";

export type RouteTotalityBridgeOriginEndpoint = {
  layer: "evidence-slice";
  kind: "origin";
  elementId: string;
  role: OriginRole;
};

export type RouteTotalityBridgeOccurrenceEndpoint = {
  layer: "occurrence-surface";
  kind: "occurrence";
  occurrenceId: string;
};

export type RouteTotalityBridgeTerminalEndpoint = {
  layer: "occurrence-surface";
  kind: "terminal";
  terminalId: string;
};

type OriginToRenderBridge = {
  direction: "origin-to-render";
  from: RouteTotalityBridgeOriginEndpoint;
  to: RouteTotalityBridgeOccurrenceEndpoint;
};

type RenderTerminalToOriginBridge = {
  direction: "render-terminal-to-origin";
  from: RouteTotalityBridgeTerminalEndpoint;
  to: RouteTotalityBridgeOriginEndpoint;
};

export type RouteTotalityBridge = (OriginToRenderBridge | RenderTerminalToOriginBridge) & {
  id: string;
  status: Exclude<EvidenceStatus, "unsupported">;
  proof: {
    kind: string;
    detail: string;
    locations: SourceLocation[];
    status: Exclude<EvidenceStatus, "unsupported">;
  };
  locations: SourceLocation[];
  evidencePathElementIds: string[];
  evidencePathRelationIds: string[];
};

export type RouteTotalityBridgeCounts = {
  total: number;
  originToRender: number;
  renderTerminalToOrigin: number;
  proven: number;
  partial: number;
};

type EvidencePath = {
  elementIds: string[];
  relationIds: string[];
  partial: boolean;
};

type PathState = EvidencePath & {
  elementId: string;
};

type RouteEndpointAnchor = {
  evidenceElementId: string;
  routeLocation: SourceLocation;
};

const ACCEPTED_STATUSES = new Set<Exclude<EvidenceStatus, "unsupported">>([
  "proven",
  "partial",
]);

function isAcceptedStatus(
  status: EvidenceStatus,
): status is Exclude<EvidenceStatus, "unsupported"> {
  return ACCEPTED_STATUSES.has(status as Exclude<EvidenceStatus, "unsupported">);
}

export function buildRouteTotalityBridges(
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteTotalityBridge[] {
  cancellation.throwIfCancelled();
  const elementsById = new Map(slice.elements.map((element) => [element.id, element]));
  const origins = [...slice.origins].sort(compareOrigin);
  const occurrenceAnchors = surface.occurrences
    .map((occurrence) => occurrenceAnchor(occurrence, surface.scope.seed, elementsById, slice))
    .filter((value): value is RouteEndpointAnchor & { endpoint: RouteRenderOccurrence } => value !== null)
    .sort((left, right) => left.endpoint.id.localeCompare(right.endpoint.id));
  const terminalAnchors = surface.terminals
    .map((terminal) => terminalAnchor(terminal, elementsById, slice))
    .filter((value): value is RouteEndpointAnchor & { endpoint: RouteTerminalOccurrence } => value !== null)
    .sort((left, right) => left.endpoint.id.localeCompare(right.endpoint.id));
  const targets = new Set([
    ...occurrenceAnchors.map((anchor) => anchor.evidenceElementId),
    ...terminalAnchors.map((anchor) => anchor.evidenceElementId),
  ]);
  const bridges: RouteTotalityBridge[] = [];

  for (const origin of origins) {
    cancellation.throwIfCancelled();
    const originElement = elementsById.get(origin.elementId);
    if (!originElement || origin.proof.length === 0 || originElement.proof.length === 0 || !isAcceptedStatus(origin.status) || !isAcceptedStatus(originElement.status)) continue;
    const paths = pathsFrom(origin.elementId, targets, slice, elementsById, origin.status === "partial" || originElement.status === "partial", cancellation);
    for (const occurrence of occurrenceAnchors) {
      const path = paths.get(occurrence.evidenceElementId);
      if (!path) continue;
      bridges.push(makeOriginToRenderBridge(origin, occurrence, path, elementsById, slice));
    }
    for (const terminal of terminalAnchors) {
      const path = paths.get(terminal.evidenceElementId);
      if (!path) continue;
      bridges.push(makeRenderTerminalToOriginBridge(origin, terminal, path, elementsById, slice));
    }
  }

  const unique = new Map<string, RouteTotalityBridge>();
  for (const bridge of bridges) unique.set(bridgeIdentity(bridge), bridge);
  return [...unique.values()].sort(compareBridge);
}

export function routeTotalityBridgeCounts(
  bridges: readonly RouteTotalityBridge[],
): RouteTotalityBridgeCounts {
  return bridges.reduce<RouteTotalityBridgeCounts>(
    (counts, bridge) => {
      counts.total += 1;
      if (bridge.direction === "origin-to-render") counts.originToRender += 1;
      else counts.renderTerminalToOrigin += 1;
      if (bridge.status === "proven") counts.proven += 1;
      else counts.partial += 1;
      return counts;
    },
    { total: 0, originToRender: 0, renderTerminalToOrigin: 0, proven: 0, partial: 0 },
  );
}

function occurrenceAnchor(
  occurrence: RouteRenderOccurrence,
  entryElementId: string,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
): (RouteEndpointAnchor & { endpoint: RouteRenderOccurrence }) | null {
  if (occurrence.parentOccurrenceId === null && occurrence.scopeSeed === entryElementId) {
    const entry = elementsById.get(entryElementId);
    if (entry && entry.proof.length > 0 && sameLocation(entry.location, occurrence.callSite)) {
      return { endpoint: occurrence, evidenceElementId: entry.id, routeLocation: occurrence.callSite };
    }
  }
  const matches = slice.elements.filter((element) =>
    element.kind === "component-occurrence"
    && element.proof.length > 0
    && sameLocation(element.location, occurrence.callSite));
  return matches.length === 1
    ? { endpoint: occurrence, evidenceElementId: matches[0].id, routeLocation: occurrence.callSite }
    : null;
}

function terminalAnchor(
  terminal: RouteTerminalOccurrence,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
): (RouteEndpointAnchor & { endpoint: RouteTerminalOccurrence }) | null {
  const expectedKind = terminal.kind === "jsx-text" || terminal.kind === "render-expression"
    ? "render-terminal"
    : "dom-terminal";
  const matches = slice.terminals
    .filter((item) => item.role === "render" && item.proof.length > 0)
    .map((item) => elementsById.get(item.elementId))
    .filter((element): element is EvidenceSlice["elements"][number] =>
      element !== undefined
      && element.kind === expectedKind
      && element.proof.length > 0
      && element.terminalRoles.includes("render")
      && sameLocation(element.location, terminal.location));
  const unique = [...new Map(matches.map((element) => [element.id, element])).values()];
  return unique.length === 1
    ? { endpoint: terminal, evidenceElementId: unique[0].id, routeLocation: terminal.location }
    : null;
}

function pathsFrom(
  startElementId: string,
  targets: Set<string>,
  slice: EvidenceSlice,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  startPartial: boolean,
  cancellation: AnalysisCancellationToken,
): Map<string, EvidencePath> {
  const relationsByFrom = new Map<string, EvidenceSlice["relations"]>();
  for (const relation of [...slice.relations].sort((left, right) => left.id.localeCompare(right.id))) {
    const current = relationsByFrom.get(relation.from) ?? [];
    current.push(relation);
    relationsByFrom.set(relation.from, current);
  }
  const queue: PathState[] = [{ elementId: startElementId, elementIds: [startElementId], relationIds: [], partial: startPartial }];
  const best = new Map<string, PathState>();
  const found = new Map<string, EvidencePath>();
  while (queue.length > 0) {
    cancellation.throwIfCancelled();
    queue.sort(comparePath);
    const state = queue.shift()!;
    const previous = best.get(state.elementId);
    if (previous && comparePath(previous, state) <= 0) continue;
    best.set(state.elementId, state);
    if (targets.has(state.elementId)) found.set(state.elementId, {
      elementIds: [...state.elementIds],
      relationIds: [...state.relationIds],
      partial: state.partial,
    });
    for (const relation of relationsByFrom.get(state.elementId) ?? []) {
      if (!isAcceptedStatus(relation.status) || relation.proof.locations.length === 0) continue;
      const target = elementsById.get(relation.to);
      if (!target || target.proof.length === 0 || !isAcceptedStatus(target.status) || state.elementIds.includes(target.id)) continue;
      queue.push({
        elementId: target.id,
        elementIds: [...state.elementIds, target.id],
        relationIds: [...state.relationIds, relation.id],
        partial: state.partial || relation.status === "partial" || target.status === "partial",
      });
    }
  }
  return found;
}

function makeOriginToRenderBridge(
  origin: EvidenceSlice["origins"][number],
  occurrence: RouteEndpointAnchor & { endpoint: RouteRenderOccurrence },
  path: EvidencePath,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
): RouteTotalityBridge {
  const locations = bridgeLocations(path, occurrence.routeLocation, elementsById, slice);
  const status: Exclude<EvidenceStatus, "unsupported"> = path.partial ? "partial" : "proven";
  const bridge = {
    direction: "origin-to-render" as const,
    from: {
      layer: "evidence-slice" as const,
      kind: "origin" as const,
      elementId: origin.elementId,
      role: origin.role,
    },
    to: {
      layer: "occurrence-surface" as const,
      kind: "occurrence" as const,
      occurrenceId: occurrence.endpoint.id,
    },
    status,
    proof: bridgeProof("The explicit evidence relation path reaches a route occurrence at the same source span.", locations, status),
    locations,
    evidencePathElementIds: [...path.elementIds],
    evidencePathRelationIds: [...path.relationIds],
  };
  return { ...bridge, id: bridgeId(bridge) };
}

function makeRenderTerminalToOriginBridge(
  origin: EvidenceSlice["origins"][number],
  terminal: RouteEndpointAnchor & { endpoint: RouteTerminalOccurrence },
  path: EvidencePath,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
): RouteTotalityBridge {
  const locations = bridgeLocations(path, terminal.routeLocation, elementsById, slice);
  const status: Exclude<EvidenceStatus, "unsupported"> = path.partial ? "partial" : "proven";
  const bridge = {
    direction: "render-terminal-to-origin" as const,
    from: {
      layer: "occurrence-surface" as const,
      kind: "terminal" as const,
      terminalId: terminal.endpoint.id,
    },
    to: {
      layer: "evidence-slice" as const,
      kind: "origin" as const,
      elementId: origin.elementId,
      role: origin.role,
    },
    status,
    proof: bridgeProof("The explicit evidence relation path reaches a route render terminal at the same source span.", locations, status),
    locations,
    evidencePathElementIds: [...path.elementIds],
    evidencePathRelationIds: [...path.relationIds],
  };
  return { ...bridge, id: bridgeId(bridge) };
}

function bridgeProof(
  detail: string,
  locations: SourceLocation[],
  status: Exclude<EvidenceStatus, "unsupported">,
) {
  return { kind: "route-totality-bridge", detail, locations, status };
}

function bridgeLocations(
  path: EvidencePath,
  endpointLocation: SourceLocation,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
): SourceLocation[] {
  const locations = [
    ...path.elementIds.flatMap((id) => {
      const location = elementsById.get(id)?.location;
      return location ? [location] : [];
    }),
    ...path.relationIds.flatMap((id) => slice.relations.find((relation) => relation.id === id)?.proof.locations ?? []),
    endpointLocation,
  ];
  const unique = new Map(locations.map((location) => [locationKey(location), location]));
  return [...unique.values()].sort(compareLocation);
}

function bridgeId(bridge: {
  direction: RouteTotalityBridgeDirection;
  from: RouteTotalityBridgeOriginEndpoint | RouteTotalityBridgeTerminalEndpoint;
  to: RouteTotalityBridgeOriginEndpoint | RouteTotalityBridgeOccurrenceEndpoint;
  evidencePathElementIds: string[];
  evidencePathRelationIds: string[];
}): string {
  return `route-totality-bridge:${stableHash(JSON.stringify({
    direction: bridge.direction,
    from: bridge.from,
    to: bridge.to,
    evidencePathElementIds: bridge.evidencePathElementIds,
    evidencePathRelationIds: bridge.evidencePathRelationIds,
  }))}`;
}

function bridgeIdentity(bridge: RouteTotalityBridge): string {
  return JSON.stringify({
    direction: bridge.direction,
    from: bridge.from,
    to: bridge.to,
    evidencePathElementIds: bridge.evidencePathElementIds,
    evidencePathRelationIds: bridge.evidencePathRelationIds,
  });
}

function compareBridge(left: RouteTotalityBridge, right: RouteTotalityBridge): number {
  return left.id.localeCompare(right.id);
}

function compareOrigin(
  left: EvidenceSlice["origins"][number],
  right: EvidenceSlice["origins"][number],
): number {
  return `${left.elementId}:${left.role}`.localeCompare(`${right.elementId}:${right.role}`);
}

function comparePath(left: PathState, right: PathState): number {
  return (left.partial ? 1 : 0) - (right.partial ? 1 : 0)
    || left.relationIds.length - right.relationIds.length
    || left.relationIds.join("\u0000").localeCompare(right.relationIds.join("\u0000"));
}

function compareLocation(left: SourceLocation, right: SourceLocation): number {
  return locationKey(left).localeCompare(locationKey(right));
}

function sameLocation(left: SourceLocation, right: SourceLocation): boolean {
  return path.normalize(left.file) === path.normalize(right.file)
    && left.line === right.line
    && left.column === right.column
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}

function locationKey(location: SourceLocation): string {
  return `${path.normalize(location.file)}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}
