import type { RouteDataDetail } from "../../../api/contracts";
import {
  contractTransparentComponentSteps,
  isTransparentSolidFlowComponent,
  isTransparentSolidFlowLabel,
  recursiveComponentOccurrenceIds,
  resolveTransparentComponentTargets,
} from "./component-topology-normalization";
import { normalizeResourceBoundaryLabel } from "./component-topology-resource-proof";

const UNOWNED_COMPONENT = "Unowned / external";
const SHARED_HUB_THRESHOLD = 5;
const SHARED_HUB_COLORS = [
  { color: "#b84b65", fill: "#f8e4e9" },
  { color: "#337f78", fill: "#e0f1ee" },
  { color: "#7458b5", fill: "#ebe6f8" },
  { color: "#ad6b24", fill: "#f7ead9" },
  { color: "#3678ae", fill: "#e1edf7" },
  { color: "#7b7429", fill: "#f0eed8" },
];

export type ComponentTopologyNode = {
  id: string;
  kind: "component" | "context" | "source" | "boundary";
  label: string;
  file: string | null;
  line: number | null;
  /** Stable source-backed identity; null means a label-only graph step. */
  sourceIdentity: string | null;
  routeEntry: boolean;
  incomingCount: number;
  outgoingCount: number;
  depth: number;
};

export type ComponentTopologyEdge = {
  id: string;
  from: string;
  to: string;
  kind: "renders" | "handoff" | "provides" | "consumes" | "loads";
  confidence: "proven" | "inferred";
  count: number;
  via?: string[];
};

export type ComponentTopology = {
  nodes: ComponentTopologyNode[];
  edges: ComponentTopologyEdge[];
  totals: { components: number; contexts: number; sources: number; inferredEdges: number };
};

export type ComponentTopologyLayoutNode = ComponentTopologyNode & { x: number; y: number; radius: number; terminal: boolean };
export type ComponentTopologyLayoutEdge = ComponentTopologyEdge & { fromNode: ComponentTopologyLayoutNode; toNode: ComponentTopologyLayoutNode };
export type SharedHub = { id: string; label: string; color: string; fill: string; connectionCount: number; kind: ComponentTopologyNode["kind"]; relationLabel: "callers" | "consumers" | "icons" };
export type SharedHubRing = { hubId: string; label: string; color: string };

export function componentTopologySelectionFocus(
  topology: ComponentTopology,
  selectedNodeId: string | null,
  downstreamProofEdgeIds: ReadonlySet<string> = new Set<string>(),
) {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const selectedNode = topology.nodes.find((node) => node.id === selectedNodeId);
  if (!selectedNodeId || !selectedNode) return { nodeIds, edgeIds };
  nodeIds.add(selectedNodeId);
  const incoming = new Map<string, ComponentTopologyEdge[]>();
  const outgoing = new Map<string, ComponentTopologyEdge[]>();
  for (const edge of topology.edges) {
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  }
  const focusedOutgoing = new Map<string, Set<string>>();
  const addFocusedEdge = (edge: ComponentTopologyEdge) => {
    if (edgeIds.has(edge.id)) return true;
    if (canReachNode(edge.to, edge.from, focusedOutgoing)) return false;
    edgeIds.add(edge.id);
    nodeIds.add(edge.from);
    nodeIds.add(edge.to);
    focusedOutgoing.set(edge.from, (focusedOutgoing.get(edge.from) ?? new Set()).add(edge.to));
    return true;
  };
  for (const edge of incoming.get(selectedNodeId) ?? []) {
    addFocusedEdge(edge);
  }
  for (const edge of outgoing.get(selectedNodeId) ?? []) {
    addFocusedEdge(edge);
  }
  if (selectedNode.kind === "boundary" && downstreamProofEdgeIds.size) {
    const visitedDownstream = new Set<string>([selectedNodeId]);
    const queue = (outgoing.get(selectedNodeId) ?? [])
      .filter((edge) => edge.kind === "loads")
      .map((edge) => edge.to);
    while (queue.length) {
      const current = queue.shift()!;
      if (visitedDownstream.has(current)) continue;
      visitedDownstream.add(current);
      for (const edge of outgoing.get(current) ?? []) {
        if (!downstreamProofEdgeIds.has(edge.id) || !addFocusedEdge(edge)) continue;
        if (!visitedDownstream.has(edge.to)) queue.push(edge.to);
      }
    }
  }
  const visited = new Set<string>();
  const queue = (incoming.get(selectedNodeId) ?? []).map((edge) => edge.from);
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of incoming.get(current) ?? []) {
      if (addFocusedEdge(edge) && !visited.has(edge.from)) queue.push(edge.from);
    }
  }
  return { nodeIds, edgeIds };
}

function canReachNode(startId: string, targetId: string, outgoing: Map<string, Set<string>>) {
  if (startId === targetId) return true;
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of outgoing.get(current) ?? []) {
      if (next === targetId) return true;
      if (!visited.has(next)) queue.push(next);
    }
  }
  return false;
}

export function summarizeSharedComponentHubs(topology: ComponentTopology) {
  const iconPackageByNodeId = new Map(topology.nodes.flatMap((node) => {
    const packageName = node.kind === "component" ? iconPackageName(node.file) : null;
    return packageName ? [[node.id, packageName] as const] : [];
  }));
  const iconPackages = [...new Set(iconPackageByNodeId.values())].sort(lexical);
  const iconHubs = iconPackages.map((packageName, index): SharedHub => ({
    ...SHARED_HUB_COLORS[index % SHARED_HUB_COLORS.length],
    id: `icon-package:${packageName}`,
    label: packageName,
    connectionCount: new Set([...iconPackageByNodeId].filter(([, value]) => value === packageName).map(([id]) => id)).size,
    kind: "component",
    relationLabel: "icons",
  }));
  const reusedHubs = topology.nodes
    .filter((node) => !iconPackageByNodeId.has(node.id) && (node.kind === "component" && node.incomingCount > SHARED_HUB_THRESHOLD || node.kind === "context" && node.outgoingCount > SHARED_HUB_THRESHOLD))
    .sort((left, right) => hubConnectionCount(right) - hubConnectionCount(left) || lexical(left.label, right.label))
    .map((node, index): SharedHub => ({
      ...SHARED_HUB_COLORS[(index + iconHubs.length) % SHARED_HUB_COLORS.length],
      id: node.id,
      label: node.label,
      connectionCount: hubConnectionCount(node),
      kind: node.kind,
      relationLabel: node.kind === "context" ? "consumers" : "callers",
    }));
  const hubs = [...iconHubs, ...reusedHubs];
  const hubById = new Map(hubs.map((hub) => [hub.id, hub]));
  const hiddenEdgeIds = new Set<string>();
  const ringsByNode = new Map<string, SharedHubRing[]>();
  const summarizedReferences = new Set<string>();
  for (const edge of topology.edges) {
    const iconPackage = iconPackageByNodeId.get(edge.to);
    if (iconPackage && (edge.kind === "renders" || edge.kind === "handoff")) {
      const hub = hubById.get(`icon-package:${iconPackage}`)!;
      hiddenEdgeIds.add(edge.id);
      summarizedReferences.add(`${hub.id}:${edge.from}:${edge.to}`);
      addHubRing(ringsByNode, edge.from, hub);
      continue;
    }
    const incomingHub = hubById.get(edge.to);
    const outgoingHub = hubById.get(edge.from);
    const hub = incomingHub?.kind === "component" && (edge.kind === "renders" || edge.kind === "handoff")
      ? incomingHub
      : outgoingHub?.kind === "context" && edge.kind === "consumes"
        ? outgoingHub
        : null;
    if (!hub) continue;
    hiddenEdgeIds.add(edge.id);
    summarizedReferences.add(`${hub.id}:${hub.kind === "context" ? edge.to : edge.from}`);
    if (hub.kind === "context") continue;
    addHubRing(ringsByNode, edge.from, hub);
  }
  return {
    hubs,
    hubById,
    hiddenEdgeIds,
    ringsByNode,
    summarizedReferenceCount: summarizedReferences.size,
  };
}

function addHubRing(ringsByNode: Map<string, SharedHubRing[]>, nodeId: string, hub: SharedHub) {
  const rings = ringsByNode.get(nodeId) ?? [];
  if (!rings.some((ring) => ring.hubId === hub.id)) rings.push({ hubId: hub.id, label: hub.label, color: hub.color });
  ringsByNode.set(nodeId, rings);
}

function iconPackageName(file: string | null) {
  if (!file) return null;
  const normalized = file.replaceAll("\\", "/");
  const matches = [...normalized.matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g)];
  const packageName = matches.at(-1)?.[1]?.toLowerCase();
  if (!packageName) return null;
  return /^(?:lucide(?:-|$)|solid-icons$|react-icons$|@tabler\/icons(?:-|$)|@heroicons\/|@fortawesome\/|@iconify\/|@phosphor-icons\/|phosphor-|iconoir-)/.test(packageName)
    ? packageName
    : null;
}

function hubConnectionCount(node: ComponentTopologyNode) { return node.kind === "context" ? node.outgoingCount : node.incomingCount; }

export function projectVisibleComponentTopology(topology: ComponentTopology, hiddenEdgeIds: Set<string>): ComponentTopology {
  const edges = topology.edges.filter((edge) => !hiddenEdgeIds.has(edge.id));
  const connectedNodeIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const retainedNodes = topology.nodes.filter((node) => node.routeEntry || connectedNodeIds.has(node.id));
  return rebuildComponentTopology(retainedNodes, edges);
}

export function rebuildComponentTopology(nodes: ComponentTopologyNode[], edges: ComponentTopologyEdge[]): ComponentTopology {
  const routeEntryId = nodes.find((node) => node.routeEntry)?.id ?? "";
  const rankedNodes = applyCountsAndDepth(nodes, edges, routeEntryId);
  return {
    nodes: rankedNodes,
    edges: [...edges].sort(edgeSort),
    totals: {
      components: rankedNodes.filter((node) => node.kind === "component").length,
      contexts: rankedNodes.filter((node) => node.kind === "context").length,
      sources: rankedNodes.filter((node) => node.kind === "source").length,
      inferredEdges: edges.filter((edge) => edge.confidence === "inferred").length,
    },
  };
}

export function buildComponentTopology(detail: RouteDataDetail): ComponentTopology {
  const nodes = new Map<string, ComponentTopologyNode>();
  const edges = new Map<string, ComponentTopologyEdge>();
  const contextNodeById = new Map(detail.context.nodes.map((node) => [node.id, node]));
  const componentContextEdges = detail.context.edges.filter((item) => item.kind === "component");
  const dedicatedComponentNodeIds = recursiveComponentOccurrenceIds(detail.context.nodes, componentContextEdges);
  const routeEntryNode = detail.context.nodes.find((node) => node.kind === "component" && node.role === "route") ?? null;
  const routeEntry = routeEntryNode?.label
    ?? detail.route.componentNames[0]
    ?? "Route component";
  const definitionsByLabel = new Map<string, RouteContextNode[]>();
  for (const node of detail.context.nodes) {
    if (node.kind !== "component" || !isResolvedComponentRecord(node)) continue;
    definitionsByLabel.set(node.label, [...(definitionsByLabel.get(node.label) ?? []), node]);
  }

  let routeEntryId = "";
  const addComponent = (label: string, file: string | null = null, line: number | null = null, id = componentId(label), sourceIdentity: string | null = null) => {
    const existing = nodes.get(id);
    if (!existing) nodes.set(id, baseNode(id, "component", label, file, line, id === routeEntryId, sourceIdentity));
    else if ((!existing.file && file) || (!existing.sourceIdentity && sourceIdentity)) {
      nodes.set(id, {
        ...existing,
        file: existing.file ?? file,
        line: existing.line ?? line,
        sourceIdentity: existing.sourceIdentity ?? sourceIdentity,
      });
    }
    return id;
  };
  const canonicalContextNode = (node: RouteContextNode) => {
    if (isResolvedComponentRecord(node) || dedicatedComponentNodeIds.has(node.id) || node.role === "route") return node;
    const definitions = definitionsByLabel.get(node.label) ?? [];
    return definitions.length === 1 ? definitions[0] : node;
  };
  const addContextComponent = (node: RouteContextNode) => {
    const canonical = canonicalContextNode(node);
    const id = sourceComponentId(canonical.id);
    return addComponent(canonical.label, canonical.file, canonical.line, id, canonical.id);
  };
  const componentIdForLabel = (label: string) => {
    const candidates = [...nodes.values()].filter((node) => node.kind === "component" && node.label === label);
    const routeCandidate = candidates.find((node) => node.routeEntry);
    if (routeCandidate) return routeCandidate.id;
    return candidates.length === 1 ? candidates[0].id : addComponent(label);
  };
  const addSpecial = (kind: "context" | "source" | "boundary", key: string, label: string, file: string | null, line: number | null) => {
    const id = `${kind}:${key}`;
    if (!nodes.has(id)) nodes.set(id, baseNode(id, kind, label, file, line, false));
    return id;
  };
  const addEdge = (from: string, to: string, kind: ComponentTopologyEdge["kind"], confidence: ComponentTopologyEdge["confidence"], count = 1, via: string[] = []) => {
    if (from === to || !nodes.has(from) || !nodes.has(to)) return;
    const id = `${kind}:${from}:${to}`;
    const existing = edges.get(id);
    if (existing) {
      existing.count += count;
      existing.via = [...new Set([...(existing.via ?? []), ...via])];
    } else {
      edges.set(id, { id, from, to, kind, confidence, count, ...(via.length ? { via } : {}) });
    }
  };

  routeEntryId = routeEntryNode ? addContextComponent(routeEntryNode) : addComponent(routeEntry, detail.route.file, 1, componentId(routeEntry), `route:${detail.route.key}`);
  const routeNode = nodes.get(routeEntryId);
  if (routeNode && !routeNode.routeEntry) nodes.set(routeEntryId, { ...routeNode, routeEntry: true });
  for (const node of detail.context.nodes) {
    if (node.kind === "component" && !isTransparentSolidFlowComponent(node)) addContextComponent(node);
  }
  for (const node of detail.exhaustiveGraph.nodes) {
    for (const component of node.components) {
      if (!isTransparentSolidFlowLabel(component)) componentIdForLabel(component);
    }
  }
  for (const trajectory of detail.exhaustiveGraph.trajectories) {
    for (const component of trajectory.stepComponents) {
      if (!isTransparentSolidFlowLabel(component)) componentIdForLabel(component);
    }
  }

  const componentContextEdgesByFrom = new Map<string, typeof componentContextEdges>();
  for (const edge of componentContextEdges) {
    componentContextEdgesByFrom.set(edge.from, [...(componentContextEdgesByFrom.get(edge.from) ?? []), edge]);
  }
  for (const edge of componentContextEdges) {
    const from = contextNodeById.get(edge.from);
    if (from?.kind !== "component" || isTransparentSolidFlowComponent(from)) continue;
    const fromId = addContextComponent(from);
    for (const target of resolveTransparentComponentTargets(edge.to, contextNodeById, componentContextEdgesByFrom)) {
      addEdge(fromId, addContextComponent(target.node), "renders", "proven", 1, target.via);
    }
  }

  for (const trajectory of detail.exhaustiveGraph.trajectories) {
    const components = contractTransparentComponentSteps(trajectory.stepComponents);
    for (let index = 0; index < components.length - 1; index += 1) {
      addEdge(
        componentIdForLabel(components[index].label),
        componentIdForLabel(components[index + 1].label),
        "handoff",
        "proven",
        1,
        components[index + 1].via,
      );
    }
  }

  const evidenceById = new Map((detail.evidence ?? []).map((item) => [item.id, item]));
  const queryLocationsByName = new Map<string, Array<RouteDataDetail["evidence"][number]>>();
  for (const operation of detail.operations ?? []) {
    if (operation.boundary?.kind !== "query") continue;
    const name = operation.label.match(/^Define (.+) query$/)?.[1];
    const evidence = evidenceById.get(operation.sourceExpressionIds[0]);
    if (name && evidence) queryLocationsByName.set(name, [...(queryLocationsByName.get(name) ?? []), evidence]);
  }
  const queryLocationByName = new Map([...queryLocationsByName].flatMap(([name, locations]) => locations.length === 1 ? [[name, locations[0]] as const] : []));
  const persistedOperationsByBridge = new Map<string, RouteDataDetail["operations"]>();
  for (const operation of detail.operations ?? []) {
    if (operation.semanticKind !== "read" || !operation.transportBridge?.id) continue;
    persistedOperationsByBridge.set(operation.transportBridge.id, [...(persistedOperationsByBridge.get(operation.transportBridge.id) ?? []), operation]);
  }
  for (const operation of detail.operations ?? []) {
    if (operation.boundary?.kind !== "resource") continue;
    const evidence = evidenceById.get(operation.sourceExpressionIds[0]);
    const resourceId = addSpecial("boundary", operation.key, normalizeResourceBoundaryLabel(operation.label), evidence?.file ?? null, evidence?.line ?? null);
    const bridge = operation.transportBridge ?? null;
    const handlerLabel = bridge ? `${bridge.method} ${bridge.path}` : operation.boundary.label;
    if (handlerLabel !== "Solid createResource") {
      const handlerEvidence = bridge
        ? { file: bridge.handlerFile, line: bridge.handlerLine }
        : queryLocationByName.get(handlerLabel) ?? null;
      const handlerId = addSpecial("source", `handler:${bridge?.id ?? cleanKey(handlerLabel)}`, handlerLabel, handlerEvidence?.file ?? null, handlerEvidence?.line ?? null);
      if (bridge) {
        for (const sourceOperation of persistedOperationsByBridge.get(bridge.id) ?? []) {
          const source = detail.sources.find((item) => item.evidenceId && sourceOperation.sourceExpressionIds.includes(item.evidenceId));
          const sourceEvidence = evidenceById.get(sourceOperation.sourceExpressionIds[0]);
          const sourceId = addSpecial("source", `persisted:${source?.key ?? sourceOperation.key}`, source?.label ?? sourceOperation.label, sourceEvidence?.file ?? null, sourceEvidence?.line ?? null);
          addEdge(sourceId, handlerId, "loads", "proven");
        }
      }
      addEdge(handlerId, resourceId, "loads", "proven");
    }
    const owner = operation.owner
      ? detail.context.nodes.find((node) => node.kind === "component" && node.label === operation.owner!.label && node.file === operation.owner!.file && node.line === operation.owner!.line)
      : null;
    if (owner) addEdge(resourceId, addContextComponent(owner), "loads", "proven");
  }

  return rebuildComponentTopology([...nodes.values()], [...edges.values()]);
}

type RouteContextNode = RouteDataDetail["context"]["nodes"][number];

function baseNode(id: string, kind: ComponentTopologyNode["kind"], label: string, file: string | null, line: number | null, routeEntry: boolean, sourceIdentity: string | null = null): ComponentTopologyNode {
  return { id, kind, label, file, line, sourceIdentity, routeEntry, incomingCount: 0, outgoingCount: 0, depth: 0 };
}

function applyCountsAndDepth(nodes: ComponentTopologyNode[], edges: ComponentTopologyEdge[], routeEntryId: string) {
  const byId = new Map(nodes.map((node) => [node.id, { ...node }]));
  const incomingByNode = new Map<string, Set<string>>();
  const outgoingByNode = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (byId.has(edge.from)) {
      const outgoing = outgoingByNode.get(edge.from) ?? new Set<string>(); outgoing.add(edge.to); outgoingByNode.set(edge.from, outgoing);
    }
    if (byId.has(edge.to)) {
      const incoming = incomingByNode.get(edge.to) ?? new Set<string>(); incoming.add(edge.from); incomingByNode.set(edge.to, incoming);
    }
  }
  for (const node of byId.values()) {
    node.incomingCount = incomingByNode.get(node.id)?.size ?? 0;
    node.outgoingCount = outgoingByNode.get(node.id)?.size ?? 0;
  }
  return assignDepth([...byId.values()], edges, routeEntryId);
}

function assignDepth(nodes: ComponentTopologyNode[], edges: ComponentTopologyEdge[], routeEntryId: string) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
  }
  const depth = new Map<string, number>();
  const walk = (roots: string[], baseDepth: number) => {
    const queue = roots.map((id) => ({ id, depth: baseDepth }));
    while (queue.length) {
      const current = queue.shift()!;
      const retained = depth.get(current.id);
      if (retained !== undefined && retained <= current.depth) continue;
      depth.set(current.id, current.depth);
      for (const next of outgoing.get(current.id) ?? []) queue.push({ id: next, depth: current.depth + 1 });
    }
  };
  const primaryRoots = uniqueStrings([
    ...nodes.filter((node) => node.kind === "source").map((node) => node.id),
    ...(nodeIds.has(routeEntryId) ? [routeEntryId] : []),
  ]);
  walk(primaryRoots, 0);
  while (depth.size < nodes.length) {
    const unvisited = nodes.filter((node) => !depth.has(node.id));
    const unvisitedIds = new Set(unvisited.map((node) => node.id));
    const localRoots = unvisited
      .filter((node) => !(incoming.get(node.id) ?? []).some((parent) => unvisitedIds.has(parent)))
      .map((node) => node.id);
    const roots = localRoots.length ? localRoots : [unvisited.sort((left, right) => lexical(left.label, right.label))[0].id];
    walk(roots, Math.max(0, ...depth.values()) + 1);
  }
  return nodes
    .map((node) => ({ ...node, depth: depth.get(node.id) ?? 0 }))
    .sort((left, right) => left.depth - right.depth || nodeKindRank(left.kind) - nodeKindRank(right.kind) || lexical(left.label, right.label));
}

function uniqueStrings(values: string[]) { return [...new Set(values)]; }

function componentId(label: string) { return `component:unresolved:${cleanKey(label || UNOWNED_COMPONENT)}`; }
function sourceComponentId(sourceIdentity: string) { return `component-source:${sourceIdentity}`; }
function isResolvedComponentRecord(node: RouteContextNode) {
  return node.id.startsWith("rendered-component:") && !node.id.startsWith("rendered-component-occurrence:");
}
function cleanKey(value: string) { return value.trim().replace(/\s+/g, " ").toLowerCase(); }
function nodeKindRank(kind: ComponentTopologyNode["kind"]) { return kind === "source" ? 0 : kind === "boundary" ? 1 : kind === "context" ? 2 : 3; }
function edgeSort(left: ComponentTopologyEdge, right: ComponentTopologyEdge) { return lexical(left.from, right.from) || lexical(left.to, right.to) || lexical(left.kind, right.kind); }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
function hashUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 0xffffffff;
}
