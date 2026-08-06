import type { HiddenComponentPolicy } from "../../../api/hidden-component-policy";
import { matchedHiddenComponentRule } from "../../../api/hidden-component-policy";
import type { RouteTotality } from "../../../api/contracts";
import type {
  RouteTotalityGraph,
  RouteTotalityGraphEdge,
  RouteTotalityUiProjection,
} from "./route-totality-model";

type Surface = Extract<RouteTotality["occurrenceSurface"], { definitions: unknown[] }>;
type Occurrence = Surface["occurrences"][number];

export function projectRouteTotalityUi(
  graph: RouteTotalityGraph,
  totality: RouteTotality,
  policy: HiddenComponentPolicy | null | undefined,
  mode: "hidden" | "all",
): { graph: RouteTotalityGraph; projection: RouteTotalityUiProjection } {
  const surface = "definitions" in totality.occurrenceSurface ? totality.occurrenceSurface : null;
  if (!surface || !policy) return { graph, projection: emptyUiProjection(mode) };

  const definitions = new Map(surface.definitions.map((definition) => [definition.id, definition]));
  const occurrences = new Map(surface.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const matchedRuleByOccurrenceId = new Map<string, string>();
  for (const occurrence of surface.occurrences) {
    const file = definitions.get(occurrence.definitionId)?.sourceFile;
    const rule = file ? matchedHiddenComponentRule(policy, file) : null;
    if (rule) matchedRuleByOccurrenceId.set(occurrence.id, rule);
  }

  const collapsibleMemo = new Map<string, boolean>();
  const collapsibleOccurrenceIds = new Set(
    surface.occurrences.map((occurrence) => occurrence.id).filter((id) => isCollapsibleImplementationOccurrence(
      id,
      occurrences,
      definitions,
      matchedRuleByOccurrenceId,
      collapsibleMemo,
      new Set(),
    )),
  );
  const opaqueOccurrenceIds = new Set(
    [...matchedRuleByOccurrenceId.keys()].filter((id) => collapsibleOccurrenceIds.has(id)),
  );
  const collapsedRoots = new Set<string>();
  for (const occurrenceId of opaqueOccurrenceIds) {
    if (!hasOpaqueDefinitionOwnedAncestor(occurrenceId, occurrences, opaqueOccurrenceIds)) {
      collapsedRoots.add(`occurrence:${occurrenceId}`);
    }
  }

  const hiddenNodeIds = new Set<string>();
  const hiddenOccurrenceIds = new Set<string>();
  const hiddenToVisibleNodeId = new Map<string, string>();
  for (const rootNodeId of collapsedRoots) {
    const rootOccurrenceId = rootNodeId.slice("occurrence:".length);
    const hiddenForRoot = definitionOwnedDescendants(rootOccurrenceId, occurrences, collapsibleOccurrenceIds);
    for (const occurrenceId of hiddenForRoot) {
      const nodeId = `occurrence:${occurrenceId}`;
      hiddenNodeIds.add(nodeId);
      hiddenOccurrenceIds.add(occurrenceId);
      hiddenToVisibleNodeId.set(nodeId, rootNodeId);
    }
    hideImplementationDetails(surface, rootOccurrenceId, hiddenForRoot, rootNodeId, hiddenNodeIds, hiddenToVisibleNodeId);
  }

  const rootsWithHiddenDetails = new Set(hiddenToVisibleNodeId.values());
  const availableHiddenOccurrenceCount = hiddenOccurrenceIds.size;
  const availableHiddenNodeCount = hiddenNodeIds.size;
  if (mode === "all" || hiddenNodeIds.size === 0) {
    return {
      graph,
      projection: {
        ...emptyUiProjection(mode),
        collapsedRootIds: rootsWithHiddenDetails,
        availableHiddenOccurrenceCount,
        availableHiddenNodeCount,
      },
    };
  }

  const hiddenEdgeIds = new Set(graph.edges
    .filter((edge) => hiddenNodeIds.has(edge.from) || hiddenNodeIds.has(edge.to))
    .map((edge) => edge.id));
  const visibleNodes = graph.nodes.filter((node) => !hiddenNodeIds.has(node.id));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter((edge) => !hiddenEdgeIds.has(edge.id));
  const passthroughEdges = buildPassthroughEdges(graph.edges, rootsWithHiddenDetails, hiddenNodeIds, visibleNodeIds);
  const edges = [...visibleEdges, ...passthroughEdges];
  const primaryNodeIds = graph.primaryNodeIds.filter((id) => visibleNodeIds.has(id));
  const evidenceNodeIds = graph.evidenceNodeIds.filter((id) => visibleNodeIds.has(id));

  return {
    graph: {
      ...graph,
      nodes: visibleNodes,
      edges,
      primaryNodeIds,
      evidenceNodeIds,
    },
    projection: {
      mode,
      hiddenNodeIds,
      hiddenEdgeIds,
      hiddenToVisibleNodeId,
      collapsedRootIds: rootsWithHiddenDetails,
      hiddenOccurrenceIds,
      availableHiddenOccurrenceCount,
      availableHiddenNodeCount,
    },
  };
}

export function emptyUiProjection(mode: "hidden" | "all" = "all"): RouteTotalityUiProjection {
  return {
    mode,
    hiddenNodeIds: new Set(),
    hiddenEdgeIds: new Set(),
    hiddenToVisibleNodeId: new Map(),
    collapsedRootIds: new Set(),
    hiddenOccurrenceIds: new Set(),
    availableHiddenOccurrenceCount: 0,
    availableHiddenNodeCount: 0,
  };
}

function isCollapsibleImplementationOccurrence(
  occurrenceId: string,
  occurrences: ReadonlyMap<string, Occurrence>,
  definitions: ReadonlyMap<string, Surface["definitions"][number]>,
  matched: ReadonlyMap<string, string>,
  memo: Map<string, boolean>,
  active: Set<string>,
): boolean {
  const cached = memo.get(occurrenceId);
  if (cached !== undefined) return cached;
  if (active.has(occurrenceId)) return false;
  const occurrence = occurrences.get(occurrenceId);
  if (!occurrence) return false;
  const definition = definitions.get(occurrence.definitionId);
  if (!matched.has(occurrenceId) && !definition?.external) return false;
  active.add(occurrenceId);
  const opaque = occurrence.definitionOwnedChildOccurrenceIds.every((childId) => (
    isCollapsibleImplementationOccurrence(childId, occurrences, definitions, matched, memo, active)
  ));
  active.delete(occurrenceId);
  memo.set(occurrenceId, opaque);
  return opaque;
}

function hasOpaqueDefinitionOwnedAncestor(
  occurrenceId: string,
  occurrences: ReadonlyMap<string, Occurrence>,
  opaque: ReadonlySet<string>,
) {
  let current = occurrences.get(occurrenceId);
  const visited = new Set<string>();
  while (current?.parentOccurrenceId && !visited.has(current.parentOccurrenceId)) {
    visited.add(current.parentOccurrenceId);
    const parent = occurrences.get(current.parentOccurrenceId);
    if (!parent) return false;
    if (current.ownership === "definition-owned" && opaque.has(parent.id)) return true;
    if (current.ownership !== "definition-owned") return false;
    current = parent;
  }
  return false;
}

function definitionOwnedDescendants(
  rootId: string,
  occurrences: ReadonlyMap<string, Occurrence>,
  opaque: ReadonlySet<string>,
) {
  const hidden = new Set<string>();
  const queue = [...(occurrences.get(rootId)?.definitionOwnedChildOccurrenceIds ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (hidden.has(id) || !opaque.has(id)) continue;
    hidden.add(id);
    queue.push(...(occurrences.get(id)?.definitionOwnedChildOccurrenceIds ?? []));
  }
  return hidden;
}

function hideImplementationDetails(
  surface: Surface,
  rootOccurrenceId: string,
  hiddenOccurrences: ReadonlySet<string>,
  rootNodeId: string,
  hiddenNodeIds: Set<string>,
  hiddenToVisibleNodeId: Map<string, string>,
) {
  const implementationOwners = new Set([rootOccurrenceId, ...hiddenOccurrences]);
  const hiddenBoundaryIds = new Set(surface.frameworkBoundaries
    .filter((boundary) => Boolean(boundary.parentOccurrenceId && implementationOwners.has(boundary.parentOccurrenceId)))
    .map((boundary) => boundary.id));
  for (const boundaryId of hiddenBoundaryIds) {
    const nodeId = `boundary:${boundaryId}`;
    hiddenNodeIds.add(nodeId);
    hiddenToVisibleNodeId.set(nodeId, rootNodeId);
  }
  for (const terminal of surface.terminals) {
    const internal = Boolean(terminal.ownerOccurrenceId && implementationOwners.has(terminal.ownerOccurrenceId))
      || Boolean(terminal.renderParentId && hiddenBoundaryIds.has(terminal.renderParentId));
    if (!internal) continue;
    const nodeId = `terminal:${terminal.id}`;
    hiddenNodeIds.add(nodeId);
    hiddenToVisibleNodeId.set(nodeId, rootNodeId);
  }
}

function buildPassthroughEdges(
  edges: readonly RouteTotalityGraphEdge[],
  roots: ReadonlySet<string>,
  hiddenNodeIds: ReadonlySet<string>,
  visibleNodeIds: ReadonlySet<string>,
) {
  const outgoing = new Map<string, RouteTotalityGraphEdge[]>();
  for (const edge of edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  const summaries = new Map<string, RouteTotalityGraphEdge>();
  for (const root of roots) {
    for (const edge of outgoing.get(root) ?? []) {
      if (!hiddenNodeIds.has(edge.to)) continue;
      walkHiddenPath(root, edge.to, [edge], hiddenNodeIds, visibleNodeIds, outgoing, summaries, new Set([edge.to]));
    }
  }
  return [...summaries.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function walkHiddenPath(
  root: string,
  current: string,
  path: readonly RouteTotalityGraphEdge[],
  hiddenNodeIds: ReadonlySet<string>,
  visibleNodeIds: ReadonlySet<string>,
  outgoing: ReadonlyMap<string, RouteTotalityGraphEdge[]>,
  summaries: Map<string, RouteTotalityGraphEdge>,
  visited: Set<string>,
) {
  for (const edge of outgoing.get(current) ?? []) {
    if (visibleNodeIds.has(edge.to)) {
      if (edge.to === root || summaries.has(`ui-splice:${root}:${edge.to}`)) continue;
      const completePath = [...path, edge];
      summaries.set(`ui-splice:${root}:${edge.to}`, {
        id: `ui-splice:${root}:${edge.to}`,
        from: root,
        to: edge.to,
        family: "render",
        kind: "transparent-splice",
        label: "UI child",
        detail: `Caller-owned content remains visible through ${completePath.length - 1} hidden UI implementation hop(s).`,
        source: "occurrence-surface",
        sourceFrom: root,
        sourceTo: edge.to,
        status: "proven",
        locations: completePath.flatMap((item) => item.locations),
        proof: null,
        parallelIndex: 0,
        parallelCount: 1,
      });
      continue;
    }
    if (!hiddenNodeIds.has(edge.to) || visited.has(edge.to)) continue;
    visited.add(edge.to);
    walkHiddenPath(root, edge.to, [...path, edge], hiddenNodeIds, visibleNodeIds, outgoing, summaries, visited);
    visited.delete(edge.to);
  }
}
