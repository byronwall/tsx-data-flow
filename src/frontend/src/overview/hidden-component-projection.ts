import { matchedHiddenComponentRule, type HiddenComponentPolicy } from "../../../api/hidden-component-policy";
import { rebuildComponentTopology, type ComponentTopology, type ComponentTopologyEdge, type SharedHubRing } from "./component-topology-model";

const UI_POLICY_RING_ID = "ui-policy:components/ui";
const UI_POLICY_RING_COLOR = "#8a5cf6";
const UI_POLICY_RING_FILL = "#eee8ff";

export type UiPolicyRing = {
  id: typeof UI_POLICY_RING_ID;
  category: "hidden-by-convention";
  label: "components/ui";
  color: string;
  fill: string;
  parentId: string;
  hiddenComponentIds: string[];
  hiddenReferenceCount: number;
};

export type ComponentTopologyRing = SharedHubRing | UiPolicyRing;

export type HiddenComponentRecord = {
  componentId: string;
  label: string;
  file: string;
  line: number | null;
  matchedRule: string;
  visibleParentIds: string[];
  directHiddenParentIds: string[];
  hiddenChildIds: string[];
  incomingReferenceCount: number;
  terminalCount: number;
};

export type HiddenComponentProjection = {
  topology: ComponentTopology;
  hidden: HiddenComponentRecord[];
  uiRingsByNode: Map<string, UiPolicyRing>;
  hiddenNodeIds: Set<string>;
  hiddenEdgeIds: Set<string>;
  originalToVisibleAncestorIds: Map<string, string[]>;
};

export type HiddenComponentProjectionOptions = {
  mode?: "hidden" | "all";
  revealedComponentIds?: ReadonlySet<string>;
};

/**
 * Apply the convention as a reversible display projection. The topology input
 * is already complete; this function only removes matching nodes from the
 * returned view and summarizes paths through them.
 */
export function projectHiddenComponentTopology(
  topology: ComponentTopology,
  policy: HiddenComponentPolicy,
  options: HiddenComponentProjectionOptions = {},
): HiddenComponentProjection {
  const enabled = options.mode ? options.mode === "hidden" : policy.enabledByDefault;
  const revealed = options.revealedComponentIds ?? new Set<string>();
  const ruleByNodeId = new Map(topology.nodes.flatMap((node) => {
    if (node.kind !== "component" || !node.sourceIdentity || !node.file) return [];
    const rule = matchedHiddenComponentRule(policy, node.file);
    return rule ? [[node.id, rule] as const] : [];
  }));
  const hiddenNodeIds = new Set(enabled
    ? [...ruleByNodeId.keys()].filter((id) => !revealed.has(id))
    : []);
  const hiddenEdgeIds = new Set(topology.edges
    .filter((edge) => hiddenNodeIds.has(edge.from) || hiddenNodeIds.has(edge.to))
    .map((edge) => edge.id));
  const incoming = groupEdges(topology.edges, "to");
  const outgoing = groupEdges(topology.edges, "from");
  const originalToVisibleAncestorIds = new Map<string, string[]>();
  for (const node of topology.nodes) {
    originalToVisibleAncestorIds.set(
      node.id,
      hiddenNodeIds.has(node.id) ? nearestVisibleParents(node.id, hiddenNodeIds, incoming) : [node.id],
    );
  }

  const hidden = topology.nodes
    .filter((node) => hiddenNodeIds.has(node.id))
    .map((node): HiddenComponentRecord => ({
      componentId: node.id,
      label: node.label,
      file: node.file!,
      line: node.line,
      matchedRule: ruleByNodeId.get(node.id)!,
      visibleParentIds: originalToVisibleAncestorIds.get(node.id) ?? [],
      directHiddenParentIds: (incoming.get(node.id) ?? [])
        .filter((edge) => hiddenNodeIds.has(edge.from))
        .map((edge) => edge.from)
        .sort(lexical),
      hiddenChildIds: hiddenDescendants(node.id, hiddenNodeIds, outgoing),
      incomingReferenceCount: (incoming.get(node.id) ?? []).reduce((sum, edge) => sum + edge.count, 0),
      terminalCount: terminalDescendantCount(node.id, outgoing),
    }))
    .sort((left, right) => lexical(left.file, right.file) || (left.line ?? 0) - (right.line ?? 0) || lexical(left.componentId, right.componentId));

  const visibleNodes = topology.nodes.filter((node) => !hiddenNodeIds.has(node.id));
  const projectedEdges = topology.edges.filter((edge) => !hiddenEdgeIds.has(edge.id));
  const passthroughEdges = summarizedPassthroughEdges(topology, hiddenNodeIds, outgoing);
  const projectedTopology = rebuildComponentTopology(visibleNodes, [...projectedEdges, ...passthroughEdges]);
  const uiRingsByNode = buildUiPolicyRings(hidden, originalToVisibleAncestorIds);
  return { topology: projectedTopology, hidden, uiRingsByNode, hiddenNodeIds, hiddenEdgeIds, originalToVisibleAncestorIds };
}

export function mergeTopologyRings(
  sharedRingsByNode: ReadonlyMap<string, SharedHubRing[]>,
  uiRingsByNode: ReadonlyMap<string, UiPolicyRing>,
) {
  const merged = new Map<string, ComponentTopologyRing[]>();
  for (const [nodeId, rings] of sharedRingsByNode) merged.set(nodeId, [...rings]);
  for (const [nodeId, ring] of uiRingsByNode) merged.set(nodeId, [...(merged.get(nodeId) ?? []), ring]);
  return merged;
}

function buildUiPolicyRings(hidden: HiddenComponentRecord[], ancestors: Map<string, string[]>) {
  const membersByParent = new Map<string, Set<string>>();
  const referencesByParent = new Map<string, number>();
  for (const record of hidden) {
    for (const parentId of ancestors.get(record.componentId) ?? []) {
      membersByParent.set(parentId, (membersByParent.get(parentId) ?? new Set()).add(record.componentId));
      referencesByParent.set(parentId, (referencesByParent.get(parentId) ?? 0) + record.incomingReferenceCount);
    }
  }
  return new Map<string, UiPolicyRing>([...membersByParent].sort(([left], [right]) => lexical(left, right)).map(([parentId, members]) => [parentId, {
    id: UI_POLICY_RING_ID,
    category: "hidden-by-convention" as const,
    label: "components/ui" as const,
    color: UI_POLICY_RING_COLOR,
    fill: UI_POLICY_RING_FILL,
    parentId,
    hiddenComponentIds: [...members].sort(lexical),
    hiddenReferenceCount: referencesByParent.get(parentId) ?? 0,
  }]));
}

function summarizedPassthroughEdges(
  topology: ComponentTopology,
  hiddenNodeIds: ReadonlySet<string>,
  outgoing: Map<string, ComponentTopologyEdge[]>,
) {
  const visibleNodeIds = new Set(topology.nodes.filter((node) => !hiddenNodeIds.has(node.id)).map((node) => node.id));
  const summaries = new Map<string, ComponentTopologyEdge>();
  for (const source of visibleNodeIds) {
    for (const edge of outgoing.get(source) ?? []) {
      if (!hiddenNodeIds.has(edge.to)) continue;
      walkHiddenPath(source, edge.to, edge.kind, edge.count, 1, new Set([edge.to]), outgoing, visibleNodeIds, summaries);
    }
  }
  return [...summaries.values()].sort(edgeSort);
}

function walkHiddenPath(
  source: string,
  current: string,
  kind: ComponentTopologyEdge["kind"],
  count: number,
  hiddenHopCount: number,
  visited: Set<string>,
  outgoing: Map<string, ComponentTopologyEdge[]>,
  visibleNodeIds: ReadonlySet<string>,
  summaries: Map<string, ComponentTopologyEdge>,
) {
  for (const edge of outgoing.get(current) ?? []) {
    if (edge.to === source) continue;
    if (visibleNodeIds.has(edge.to)) {
      const summaryId = `ui-passthrough:${kind}:${source}:${edge.to}`;
      const existing = summaries.get(summaryId);
      const via = `components/ui × ${hiddenHopCount}`;
      if (existing) {
        existing.count += count * edge.count;
        existing.via = [...new Set([...(existing.via ?? []), via])].sort(lexical);
      } else {
        summaries.set(summaryId, {
          id: summaryId,
          from: source,
          to: edge.to,
          kind,
          confidence: "inferred",
          count: count * edge.count,
          via: [via],
        });
      }
      continue;
    }
    if (visited.has(edge.to)) continue;
    visited.add(edge.to);
    walkHiddenPath(source, edge.to, kind, count * edge.count, hiddenHopCount + 1, visited, outgoing, visibleNodeIds, summaries);
    visited.delete(edge.to);
  }
}

function nearestVisibleParents(nodeId: string, hiddenNodeIds: ReadonlySet<string>, incoming: Map<string, ComponentTopologyEdge[]>) {
  const parents = new Set<string>();
  const queue = [nodeId];
  const visited = new Set<string>([nodeId]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of incoming.get(current) ?? []) {
      if (hiddenNodeIds.has(edge.from)) {
        if (!visited.has(edge.from)) { visited.add(edge.from); queue.push(edge.from); }
      } else parents.add(edge.from);
    }
  }
  return [...parents].sort(lexical);
}

function hiddenDescendants(nodeId: string, hiddenNodeIds: ReadonlySet<string>, outgoing: Map<string, ComponentTopologyEdge[]>) {
  const descendants = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of outgoing.get(current) ?? []) {
      if (!hiddenNodeIds.has(edge.to) || descendants.has(edge.to)) continue;
      descendants.add(edge.to);
      queue.push(edge.to);
    }
  }
  return [...descendants].sort(lexical);
}

function terminalDescendantCount(nodeId: string, outgoing: Map<string, ComponentTopologyEdge[]>) {
  const terminals = new Set<string>();
  const queue = [nodeId];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const edges = outgoing.get(current) ?? [];
    if (!edges.length) terminals.add(current);
    else for (const edge of edges) queue.push(edge.to);
  }
  return terminals.size;
}

function groupEdges(edges: ComponentTopologyEdge[], key: "from" | "to") {
  const grouped = new Map<string, ComponentTopologyEdge[]>();
  for (const edge of edges) grouped.set(edge[key], [...(grouped.get(edge[key]) ?? []), edge]);
  return grouped;
}

function edgeSort(left: ComponentTopologyEdge, right: ComponentTopologyEdge) { return lexical(left.from, right.from) || lexical(left.to, right.to) || lexical(left.kind, right.kind) || lexical(left.id, right.id); }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
