import type { RouteTotality } from "../../../api/contracts";
import {
  routeTotalityEdgeLabel,
  type RouteTotalityLayout,
  type RouteTotalityLayoutEdge,
  type RouteTotalityLayoutNode,
  type RouteTotalityLocation,
  type RouteTotalityProof,
  type RouteTotalitySelection,
  type RouteTotalityStatus,
} from "./route-totality-model";
import type { RouteInvestigationSelection } from "./route-investigation-selection";
import { emptyRouteTotalityEmphasis } from "./route-totality-emphasis-empty";

type RouteTotalityBridge = RouteTotality["bridges"][number];
type RouteTotalityBridgeEndpoint = RouteTotalityBridge["from"] | RouteTotalityBridge["to"];
type RouteTotalityContextLink = RouteTotality["contextContinuity"]["links"][number];
type RouteTotalityContextOccurrenceReference = RouteTotality["contextContinuity"]["providers"][number] | RouteTotality["contextContinuity"]["consumers"][number];
type AdjacencyFamily = "render" | "data" | "boundary" | "bridge" | "context";

export type RouteTotalityAdjacencyEdge = {
  id: string;
  from: string;
  to: string;
  family: AdjacencyFamily;
  kind: string;
  label: string;
  detail: string;
  status: RouteTotalityStatus;
  locations: readonly RouteTotalityLocation[];
  proof: RouteTotalityProof | null;
  layoutEdge: RouteTotalityLayoutEdge | null;
  bridge: RouteTotalityBridge | null;
  bridgeDirection: RouteTotalityBridge["direction"] | null;
};

export type RouteTotalityAdjacency = {
  edges: readonly RouteTotalityAdjacencyEdge[];
  outgoing: ReadonlyMap<string, readonly RouteTotalityAdjacencyEdge[]>;
  incoming: ReadonlyMap<string, readonly RouteTotalityAdjacencyEdge[]>;
  unresolvedBridgeIds: readonly string[];
  unresolvedBridgesByEndpoint: ReadonlyMap<string, readonly RouteTotalityBridge[]>;
  unresolvedContextIds: readonly string[];
};

export type RouteTotalityEmphasisMode = "forward" | "backward" | "both";

export type RouteTotalityFrontier = {
  edgeId: string;
  nodeId: string;
  bridgeId: string | null;
  family: AdjacencyFamily;
  label: string;
  detail: string;
  status: RouteTotalityStatus;
};

export type RouteTotalityOriginContributor = {
  id: string;
  label: string;
  role: string;
  status: RouteTotalityStatus;
};

export type RouteTotalityEmphasis = {
  active: boolean;
  mode: RouteTotalityEmphasisMode | null;
  seedId: string | null;
  status: "idle" | "proven" | "partial" | "unavailable";
  note: string;
  activeNodeIds: ReadonlySet<string>;
  activeEdgeIds: ReadonlySet<string>;
  activeLayoutEdgeIds: ReadonlySet<string>;
  activeBridgeIds: ReadonlySet<string>;
  secondaryNodeIds: ReadonlySet<string>;
  secondaryEdgeIds: ReadonlySet<string>;
  secondaryLayoutEdgeIds: ReadonlySet<string>;
  frontierNodeIds: ReadonlySet<string>;
  frontierEdgeIds: ReadonlySet<string>;
  frontierLayoutEdgeIds: ReadonlySet<string>;
  frontierBridgeIds: ReadonlySet<string>;
  focusNodeIds: ReadonlySet<string>;
  focusEdgeIds: ReadonlySet<string>;
  frontiers: readonly RouteTotalityFrontier[];
  originContributors: readonly RouteTotalityOriginContributor[];
  frontierOriginContributors: readonly RouteTotalityOriginContributor[];
  provenNodeCount: number;
  provenEdgeCount: number;
  provenBridgeCount: number;
};

type TraversalCandidate = {
  edge: RouteTotalityAdjacencyEdge;
  nextNodeId: string;
  continueTraversal: boolean;
};

export function routeTotalityBridgeEndpointNodeId(
  endpoint: RouteTotalityBridgeEndpoint,
): string {
  if (endpoint.kind === "origin") return `origin:${endpoint.elementId}:${endpoint.role}`;
  if (endpoint.kind === "occurrence") return `occurrence:${endpoint.occurrenceId}`;
  return `terminal:${endpoint.terminalId}`;
}

export function buildRouteTotalityAdjacency(
  layout: RouteTotalityLayout,
  totality: RouteTotality | null,
): RouteTotalityAdjacency {
  const nodeIds = new Set(layout.nodes.map((node) => node.id));
  const edges: RouteTotalityAdjacencyEdge[] = [];
  const outgoing = new Map<string, RouteTotalityAdjacencyEdge[]>();
  const incoming = new Map<string, RouteTotalityAdjacencyEdge[]>();
  const unresolvedBridgeIds: string[] = [];
  const unresolvedByEndpoint = new Map<string, RouteTotalityBridge[]>();
  const unresolvedContextIds: string[] = [];
  const contextContinuity = totality?.contextContinuity;
  const contextProviders = new Map<string, string>();
  const providerStatus = new Map<string, string>();
  const contextConsumers = new Map<string, string>();
  const consumerStatus = new Map<string, string>();
  for (const provider of contextContinuity?.providers ?? []) {
    contextProviders.set(provider.id, provider.renderOccurrenceId);
    providerStatus.set(provider.id, provider.status);
  }
  for (const consumer of contextContinuity?.consumers ?? []) {
    contextConsumers.set(consumer.id, consumer.renderOccurrenceId);
    consumerStatus.set(consumer.id, consumer.status);
  }

  const addEdge = (edge: RouteTotalityAdjacencyEdge): void => {
    edges.push(Object.freeze(edge));
    const fromEdges = outgoing.get(edge.from) ?? [];
    fromEdges.push(edge);
    outgoing.set(edge.from, fromEdges);
    const toEdges = incoming.get(edge.to) ?? [];
    toEdges.push(edge);
    incoming.set(edge.to, toEdges);
  };

  for (const edge of layout.edges) {
    addEdge({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      family: edge.family,
      kind: edge.kind,
      label: routeTotalityEdgeLabel(edge),
      detail: edge.detail,
      status: edge.status,
      locations: Object.freeze([...edge.locations]),
      proof: edge.proof,
      layoutEdge: edge,
      bridge: null,
      bridgeDirection: null,
    });
  }

  for (const bridge of [...(totality?.bridges ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    const rawFrom = routeTotalityBridgeEndpointNodeId(bridge.from);
    const rawTo = routeTotalityBridgeEndpointNodeId(bridge.to);
    const from = layout.nodeRedirects.get(rawFrom) ?? rawFrom;
    const to = layout.nodeRedirects.get(rawTo) ?? rawTo;
    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      unresolvedBridgeIds.push(bridge.id);
      const knownEndpoint = nodeIds.has(from) ? from : nodeIds.has(to) ? to : null;
      if (knownEndpoint) {
        const knownBridges = unresolvedByEndpoint.get(knownEndpoint) ?? [];
        knownBridges.push(bridge);
        unresolvedByEndpoint.set(knownEndpoint, knownBridges);
      }
      continue;
    }
    addEdge({
      id: `bridge:${bridge.id}`,
      from,
      to,
      family: "bridge",
      kind: bridge.direction,
      label: bridgeLabel(bridge),
      detail: bridgeDetail(bridge),
      status: bridge.status,
      locations: Object.freeze([...bridge.locations]),
      proof: bridge.proof,
      layoutEdge: null,
      bridge,
      bridgeDirection: bridge.direction,
    });
  }

  for (const link of [...(contextContinuity?.links ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    const providerRenderId = link.providerOccurrenceId ? contextProviders.get(link.providerOccurrenceId) : null;
    const consumerRenderId = contextConsumers.get(link.consumerOccurrenceId) ?? null;
    const from = resolveContextOccurrenceNodeId(providerRenderId, nodeIds, layout.nodeRedirects);
    const to = resolveContextOccurrenceNodeId(consumerRenderId, nodeIds, layout.nodeRedirects);
    const status = deriveContextLinkStatus(
      link.status,
      link.providerOccurrenceId ? providerStatus.get(link.providerOccurrenceId) ?? null : null,
      consumerStatus.get(link.consumerOccurrenceId) ?? null,
    );
    const detail = formatContextLinkDetail(link, status, from === null || to === null);
    const edgeId = `context:${link.id}`;
    if (from && to) {
      addEdge({
        id: edgeId,
        from,
        to,
        family: "context",
        kind: link.sourceKind,
        label: contextLinkLabel(link),
        detail,
        status,
        locations: Object.freeze([]),
        proof: null,
        layoutEdge: null,
        bridge: null,
        bridgeDirection: null,
      });
      continue;
    }
    if (!from && !to) continue;
    addEdge({
      id: edgeId,
      from: from ?? `context-missing:${link.id}:from`,
      to: to ?? `context-missing:${link.id}:to`,
      family: "context",
      kind: link.sourceKind,
      label: contextLinkLabel(link),
      detail,
      status,
      locations: Object.freeze([]),
      proof: null,
      layoutEdge: null,
      bridge: null,
      bridgeDirection: null,
    });
    unresolvedContextIds.push(link.id);
  }

  const freezeMap = <T>(source: Map<string, T[]>): ReadonlyMap<string, readonly T[]> => (
    new Map([...source.entries()].map(([id, values]) => [id, Object.freeze([...values])] as const))
  );
  return Object.freeze({
    edges: Object.freeze(edges),
    outgoing: freezeMap(outgoing),
    incoming: freezeMap(incoming),
    unresolvedBridgeIds: Object.freeze(unresolvedBridgeIds),
    unresolvedBridgesByEndpoint: freezeMap(unresolvedByEndpoint),
    unresolvedContextIds: Object.freeze(unresolvedContextIds),
  });
}

export function buildRouteTotalityEmphasis(
  adjacency: RouteTotalityAdjacency,
  layout: RouteTotalityLayout,
  selection: RouteTotalitySelection | RouteInvestigationSelection,
  mode: RouteTotalityEmphasisMode | null,
): RouteTotalityEmphasis {
  const seedIds = collectEmphasisSeedNodeIds(selection, layout);
  if (!mode || seedIds.size === 0) {
    return emptyRouteTotalityEmphasis();
  }
  const seedId = seedIds.values().next().value;
  const seed = layout.nodes.find((node) => node.id === seedId) ?? null;
  if (!seed) return emptyRouteTotalityEmphasis();

  const layoutNodes = layout.nodes as RouteTotalityLayoutNode[];
  const nodesById = new Map(layoutNodes.map((node) => [node.id, node]));
  const activeNodes = new Set<string>();
  const activeEdges = new Set<string>();
  const activeLayoutEdges = new Set<string>();
  const activeBridges = new Set<string>();
  const secondaryNodes = new Set<string>();
  const secondaryEdges = new Set<string>();
  const secondaryLayoutEdges = new Set<string>();
  const frontierNodes = new Set<string>();
  const frontierEdges = new Set<string>();
  const frontierLayoutEdges = new Set<string>();
  const frontierBridges = new Set<string>();
  const frontiers: RouteTotalityFrontier[] = [];
  const visited = new Set<string>();
  const queued: string[] = [];
  const provenSeedIds = [...seedIds].filter((nodeId) => nodesById.get(nodeId)?.status === "proven");
  for (const id of seedIds) {
    if (nodesById.get(id)?.status === "proven") {
      activeNodes.add(id);
      queued.push(id);
      continue;
    }
    frontierNodes.add(id);
  }

  const addFrontier = (candidate: TraversalCandidate, status = candidate.edge.status): void => {
    const { edge, nextNodeId } = candidate;
    if (frontierEdges.has(edge.id)) return;
    frontierEdges.add(edge.id);
    frontierNodes.add(nextNodeId);
    if (edge.layoutEdge) frontierLayoutEdges.add(edge.id);
    if (edge.bridge) frontierBridges.add(edge.bridge.id);
    frontiers.push({
      edgeId: edge.id,
      nodeId: nextNodeId,
      bridgeId: edge.bridge?.id ?? null,
      family: edge.family,
      label: edge.label,
      detail: edge.detail,
      status,
    });
  };

  while (queued.length) {
    const nodeId = queued.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const candidate of traversalCandidates(adjacency, nodesById, nodeId, seedIds, mode)) {
      const { edge, nextNodeId } = candidate;
      if (edge.status !== "proven") {
        addFrontier(candidate);
        continue;
      }
      if (nodesById.get(nextNodeId)?.status !== "proven") {
        addFrontier(candidate, nodesById.get(nextNodeId)?.status ?? "unknown");
        continue;
      }
      activeEdges.add(edge.id);
      if (edge.layoutEdge) activeLayoutEdges.add(edge.id);
      if (edge.bridge) activeBridges.add(edge.bridge.id);
      activeNodes.add(nextNodeId);
      if (candidate.continueTraversal && !visited.has(nextNodeId)) queued.push(nextNodeId);
    }
    for (const bridge of adjacency.unresolvedBridgesByEndpoint.get(nodeId) ?? []) {
      if (!bridgeApplies(bridge, mode)) continue;
      const edgeId = `bridge:${bridge.id}`;
      if (frontierEdges.has(edgeId)) continue;
      frontierEdges.add(edgeId);
      frontierBridges.add(bridge.id);
      frontiers.push({
        edgeId,
        nodeId,
        bridgeId: bridge.id,
        family: "bridge",
        label: "Unresolved cross-layer handoff",
        detail: `${bridgeDetail(bridge)} One bridge endpoint is absent from the rendered layout.`,
        status: "partial",
      });
    }
  }

  if (mode === "both" && provenSeedIds.length > 0) {
    const primaryNodes = new Set(activeNodes);
    const primaryEdges = new Set(activeEdges);
    const downstreamVisited = new Set<string>(provenSeedIds);
    const downstreamQueue = [...new Set(provenSeedIds.flatMap((seedNodeId) => (
      (adjacency.outgoing.get(seedNodeId) ?? [])
        .filter((edge) => edge.layoutEdge?.kind !== "origin-evidence")
        .filter((edge) => activeEdges.has(edge.id) && activeNodes.has(edge.to))
        .map((edge) => edge.to)
    )))];

    while (downstreamQueue.length) {
      const nodeId = downstreamQueue.shift()!;
      if (downstreamVisited.has(nodeId)) continue;
      downstreamVisited.add(nodeId);
      for (const edge of adjacency.outgoing.get(nodeId) ?? []) {
        if (edge.layoutEdge?.kind === "origin-evidence") continue;
        const candidate: TraversalCandidate = { edge, nextNodeId: edge.to, continueTraversal: true };
        if (edge.status !== "proven") {
          addFrontier(candidate);
          continue;
        }
        if (nodesById.get(edge.to)?.status !== "proven") {
          addFrontier(candidate, nodesById.get(edge.to)?.status ?? "unknown");
          continue;
        }
        activeEdges.add(edge.id);
        activeLayoutEdges.add(edge.id);
        activeNodes.add(edge.to);
        if (!primaryEdges.has(edge.id)) {
          secondaryEdges.add(edge.id);
          secondaryLayoutEdges.add(edge.id);
        }
        if (!primaryNodes.has(edge.to)) secondaryNodes.add(edge.to);
        if (!downstreamVisited.has(edge.to)) downstreamQueue.push(edge.to);
      }
    }
  }

  const focusNodes = new Set([...activeNodes, ...frontierNodes]);
  const focusEdges = new Set([...activeLayoutEdges, ...frontierLayoutEdges]);
  const activeContributors = contributorsFor(layoutNodes, activeNodes);
  const contributors = activeContributors.filter((origin) => origin.status === "proven");
  const frontierContributors = uniqueContributors([
    ...contributorsFor(layoutNodes, frontierNodes),
    ...activeContributors.filter((origin) => origin.status !== "proven"),
  ]);
  const hasFrontier = frontiers.length > 0 || provenSeedIds.length === 0;
  const status = mode === "both"
    ? hasFrontier ? "partial" : "proven"
    : activeBridges.size === 0
    ? provenSeedIds.length > 0 ? "unavailable" : "partial"
    : hasFrontier ? "partial" : "proven";
  const note = mode === "both"
    ? hasFrontier
      ? "Immediate connections and upstream lineage use strong emphasis. Downstream trees continue with lighter emphasis. Partial frontiers remain explicit."
      : "Immediate connections and upstream lineage use strong emphasis. Downstream trees continue to their terminals with lighter emphasis."
    : activeBridges.size === 0
    ? provenSeedIds.length > 0
      ? "No proven cross-layer handoff exists. Surface-only reach is not evidence of a cross-layer contribution."
      : "The selected seed is partial. It remains a frontier; downstream reach is not proven."
    : hasFrontier
      ? "Proven reach is emphasized. Partial or unsupported frontiers remain explicit."
      : "Only proven reach is emphasized.";

  return Object.freeze({
    active: true,
    mode,
    seedId: seed.id,
    status,
    note,
    activeNodeIds: readOnlySet(activeNodes),
    activeEdgeIds: readOnlySet(activeEdges),
    activeLayoutEdgeIds: readOnlySet(activeLayoutEdges),
    activeBridgeIds: readOnlySet(activeBridges),
    secondaryNodeIds: readOnlySet(secondaryNodes),
    secondaryEdgeIds: readOnlySet(secondaryEdges),
    secondaryLayoutEdgeIds: readOnlySet(secondaryLayoutEdges),
    frontierNodeIds: readOnlySet(frontierNodes),
    frontierEdgeIds: readOnlySet(frontierEdges),
    frontierLayoutEdgeIds: readOnlySet(frontierLayoutEdges),
    frontierBridgeIds: readOnlySet(frontierBridges),
    focusNodeIds: readOnlySet(focusNodes),
    focusEdgeIds: readOnlySet(focusEdges),
    frontiers: Object.freeze(frontiers),
    originContributors: Object.freeze(contributors),
    frontierOriginContributors: Object.freeze(frontierContributors),
    provenNodeCount: [...activeNodes].filter((id) => nodesById.get(id)?.status === "proven").length,
    provenEdgeCount: activeEdges.size,
    provenBridgeCount: activeBridges.size,
  });
}

function traversalCandidates(
  adjacency: RouteTotalityAdjacency,
  nodesById: ReadonlyMap<string, RouteTotalityLayoutNode>,
  nodeId: string,
  seedIds: ReadonlySet<string>,
  mode: RouteTotalityEmphasisMode,
): TraversalCandidate[] {
  const candidates = new Map<string, TraversalCandidate>();
  if (mode === "both") {
    for (const edge of adjacency.incoming.get(nodeId) ?? []) {
      if (edge.layoutEdge?.kind === "origin-evidence") continue;
      candidates.set(edge.id, { edge, nextNodeId: edge.from, continueTraversal: true });
    }
    if (seedIds.has(nodeId)) {
      for (const edge of adjacency.outgoing.get(nodeId) ?? []) {
        if (edge.layoutEdge?.kind === "origin-evidence") continue;
        candidates.set(edge.id, { edge, nextNodeId: edge.to, continueTraversal: false });
      }
    }
    return [...candidates.values()];
  }
  if (mode !== "backward") {
    for (const edge of adjacency.outgoing.get(nodeId) ?? []) {
      if (edge.bridge && edge.bridgeDirection !== "origin-to-render") continue;
      candidates.set(edge.id, { edge, nextNodeId: edge.to, continueTraversal: true });
    }
  }
  if (mode !== "forward") {
    for (const edge of adjacency.incoming.get(nodeId) ?? []) {
      if (edge.layoutEdge) {
        if (edge.layoutEdge.kind === "origin-evidence") continue;
        candidates.set(edge.id, { edge, nextNodeId: edge.from, continueTraversal: true });
        continue;
      }
      if (edge.bridgeDirection === "origin-to-render" || edge.family === "context") {
        candidates.set(edge.id, { edge, nextNodeId: edge.from, continueTraversal: true });
      }
    }
    if (nodesById.get(nodeId)?.kind === "origin") {
      for (const edge of adjacency.outgoing.get(nodeId) ?? []) {
        if (edge.layoutEdge?.kind !== "origin-evidence") continue;
        candidates.set(edge.id, { edge, nextNodeId: edge.to, continueTraversal: true });
      }
    }
    for (const edge of adjacency.outgoing.get(nodeId) ?? []) {
      if (edge.bridgeDirection !== "render-terminal-to-origin") continue;
      candidates.set(edge.id, { edge, nextNodeId: edge.to, continueTraversal: true });
    }
  }
  return [...candidates.values()];
}

function collectEmphasisSeedNodeIds(
  selection: RouteTotalitySelection | RouteInvestigationSelection,
  layout: RouteTotalityLayout,
): ReadonlySet<string> {
  const nodeIds = new Set(layout.nodes.map((node) => node.id));
  const result = new Set<string>();
  if (!selection) return result;
  if ("kind" in selection && selection.kind === "node" && nodeIds.has(selection.id)) {
    result.add(selection.id);
    return result;
  }
  if ("target" in selection && selection.target === "edge" && selection.kind === "context-edge") {
    if (selection.fromNodeId && nodeIds.has(selection.fromNodeId)) result.add(selection.fromNodeId);
    if (selection.toNodeId && nodeIds.has(selection.toNodeId)) result.add(selection.toNodeId);
  }
  return result;
}

function resolveContextOccurrenceNodeId(
  occurrenceId: string | null | undefined,
  nodeIds: ReadonlySet<string>,
  redirects: ReadonlyMap<string, string>,
): string | null {
  if (!occurrenceId) return null;
  let nodeId = `occurrence:${occurrenceId}`;
  const visited = new Set<string>();
  while (redirects.has(nodeId) && !visited.has(nodeId)) {
    visited.add(nodeId);
    nodeId = redirects.get(nodeId) ?? nodeId;
  }
  return nodeIds.has(nodeId) ? nodeId : null;
}

function deriveContextLinkStatus(
  status: RouteTotalityContextLink["status"],
  providerStatus: string | null,
  consumerStatus: string | null,
): RouteTotalityStatus {
  if (status === "unsupported") return "unsupported";
  if (providerStatus === "unsupported" || consumerStatus === "unsupported") return "unsupported";
  if (status === "partial" || providerStatus === "partial" || consumerStatus === "partial") return "partial";
  return "proven";
}

function contextLinkLabel(link: RouteTotalityContextLink): string {
  return `${link.sourceKind === "default" ? "default" : "provider"} context link`;
}

function formatContextLinkDetail(
  link: RouteTotalityContextLink,
  status: RouteTotalityStatus,
  endpointMissing: boolean,
): string {
  const members = [...link.members, ...link.memberPaths.map((path) => path.join("."))].join(" · ");
  return `${status} ${link.sourceKind === "default" ? "default" : "provider"} context handoff${endpointMissing ? " from or to unknown mapped endpoint" : ""}${members ? ` · ${members}` : ""}`;
}

function bridgeApplies(bridge: RouteTotalityBridge, mode: RouteTotalityEmphasisMode): boolean {
  if (mode === "both") return false;
  return mode === "forward"
    ? bridge.direction === "origin-to-render"
    : bridge.direction === "render-terminal-to-origin";
}

function contributorsFor(
  nodes: readonly RouteTotalityLayoutNode[],
  ids: ReadonlySet<string>,
): RouteTotalityOriginContributor[] {
  return nodes
    .filter((node) => node.kind === "origin" && ids.has(node.id))
    .map((node) => ({
      id: node.id,
      label: node.label,
      role: "role" in node.record ? node.record.role : "origin",
      status: node.status,
    }));
}

function uniqueContributors(contributors: RouteTotalityOriginContributor[]): RouteTotalityOriginContributor[] {
  return [...new Map(contributors.map((origin) => [origin.id, origin])).values()];
}

function bridgeLabel(bridge: RouteTotalityBridge): string {
  return bridge.direction === "origin-to-render"
    ? "origin to render handoff"
    : "terminal to origin handoff";
}

function bridgeDetail(bridge: RouteTotalityBridge): string {
  return `${bridge.proof.detail} · ${bridge.evidencePathElementIds.length} evidence element(s) · ${bridge.evidencePathRelationIds.length} relation(s)`;
}

function readOnlySet(values: Iterable<string>): ReadonlySet<string> {
  return new Set(values);
}
