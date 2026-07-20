import type { RouteDataDetail } from "../../../api/contracts";
import type { ComponentTopology } from "./component-topology-model";
import { projectSourceGraph } from "./route-flow-path-model";

export type TopologyResourceStage = {
  id: string;
  label: string;
  handler: string | null;
  handlerId: string | null;
  owner: string | null;
  ownerId: string | null;
  file: string | null;
  line: number | null;
};
export type TopologyTransformStage = {
  key: string;
  label: string;
  effect: string;
  component: string;
  file: string | null;
  line: number | null;
  pathCount: number;
  nodeIds: string[];
};
export type TopologyFieldStage = { label: string; pathCount: number };
export type TopologyTerminalStage = { label: string; pathCount: number };

export function buildTopologySourceLens(detail: RouteDataDetail, topology: ComponentTopology, sourceKey: string | null) {
  const source = sourceKey ? detail.sources.find((item) => item.key === sourceKey) ?? null : null;
  if (!source) return emptyLens();
  const exactPathCount = detail.exhaustiveGraph.trajectories.filter((trajectory) => trajectory.sourceMethodKeys.includes(source.key)).length;
  const graph = projectSourceGraph(detail.exhaustiveGraph, source.key);
  const componentLabels = new Set(graph.trajectories.flatMap((trajectory) => trajectory.stepComponents));
  const componentIds = new Set<string>();
  for (const node of topology.nodes) {
    const sourceNode = node.kind === "source" && (node.label === source.label || node.label === source.consumerLabel);
    if (componentLabels.has(node.label) || sourceNode) componentIds.add(node.id);
  }
  const resources = topology.nodes.filter((node) => node.kind === "boundary").flatMap((node): TopologyResourceStage[] => {
    const handlerEdge = topology.edges.find((edge) => edge.to === node.id && edge.kind === "loads");
    const handler = topology.nodes.find((item) => item.id === handlerEdge?.from) ?? null;
    if (source.consumerLabel && handler?.label !== source.consumerLabel) return [];
    const ownerEdge = topology.edges.find((edge) => edge.from === node.id && edge.kind === "loads");
    if (!ownerEdge) return [];
    const owner = topology.nodes.find((item) => item.id === ownerEdge.to) ?? null;
    return [{ id: node.id, label: node.label, handler: handler?.label ?? null, handlerId: handler?.id ?? null, owner: owner?.label ?? null, ownerId: owner?.id ?? null, file: node.file, line: node.line }];
  });
  const resourceParticipantIds = new Set(resources.flatMap((resource) => [resource.id, resource.handlerId, resource.ownerId].filter((id): id is string => Boolean(id))));
  if (exactPathCount && source.handoffProven) {
    for (const id of resourceParticipantIds) componentIds.add(id);
  }
  const transforms = exactPathCount ? detectedTransforms(graph.nodes, topology) : [];
  const transformsByNodeId = new Map<string, TopologyTransformStage[]>();
  for (const transform of transforms) {
    for (const id of transform.nodeIds) transformsByNodeId.set(id, [...(transformsByNodeId.get(id) ?? []), transform]);
  }
  const fieldsByNodeId = detectedFields(graph, topology, source.fields.map((field) => field.key));
  const terminalsByNodeId = detectedTerminals(graph.trajectories, topology);
  return {
    source,
    matchMode: exactPathCount ? "exact" as const : resources.length ? "resource" as const : "unavailable" as const,
    pathCount: graph.totals.trajectories,
    componentIds,
    resourceParticipantIds,
    resources,
    transforms,
    transformsByNodeId,
    fieldsByNodeId,
    terminalsByNodeId,
    terminalCount: new Set(graph.trajectories.map((trajectory) => trajectory.sinkId)).size,
    transformMatchMode: exactPathCount ? "source-path" as const : "unavailable" as const,
  };
}

function detectedFields(
  graph: RouteDataDetail["exhaustiveGraph"],
  topology: ComponentTopology,
  sourceFields: string[],
) {
  const allowedFields = new Set(sourceFields);
  const nodesByKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const countsByNodeId = new Map<string, Map<string, number>>();
  for (const trajectory of graph.trajectories) {
    // A field name only participates after the selected source has already
    // projected this exact compiler-traced trajectory. The shape is a guard
    // on which top-level source fields to display, not a way to invent paths
    // from same-named properties elsewhere in the route.
    const fields = new Set(trajectory.stepKeys.flatMap((key) => {
      const node = nodesByKey.get(key);
      return node && ["property-read", "optional-read"].includes(node.kind) && allowedFields.has(node.label)
        ? [node.label]
        : [];
    }));
    if (!fields.size) continue;
    const componentNodeIds = new Set<string>();
    trajectory.stepComponents.forEach((component, index) => {
      if (component === "Unowned / external") return;
      const file = nodesByKey.get(trajectory.stepKeys[index])?.file ?? null;
      const exact = topology.nodes.filter((node) => node.kind === "component" && node.label === component && (!file || node.file === file));
      const candidates = exact.length ? exact : topology.nodes.filter((node) => node.kind === "component" && node.label === component);
      if (candidates.length === 1) componentNodeIds.add(candidates[0].id);
    });
    for (const nodeId of componentNodeIds) {
      const counts = countsByNodeId.get(nodeId) ?? new Map<string, number>();
      for (const field of fields) counts.set(field, (counts.get(field) ?? 0) + 1);
      countsByNodeId.set(nodeId, counts);
    }
  }
  return new Map([...countsByNodeId].map(([nodeId, counts]) => [
    nodeId,
    [...counts].map(([label, pathCount]) => ({ label, pathCount })).sort((left, right) => right.pathCount - left.pathCount || lexical(left.label, right.label)),
  ]));
}

export type TopologySourceLens = ReturnType<typeof buildTopologySourceLens>;
export type TopologyNodeSourceTouch = {
  key: string;
  source: RouteDataDetail["sources"][number] | null;
  label: string;
  detail: string;
  mode: "path" | "resource";
  pathCount: number;
  targetId: string;
  fields: RouteDataDetail["sources"][number]["fields"];
};

export function buildTopologyNodeSourceTouches(detail: RouteDataDetail, topology: ComponentTopology, nodeId: string | null): TopologyNodeSourceTouch[] {
  if (!nodeId) return [];
  const touches = detail.sources.flatMap((source): TopologyNodeSourceTouch[] => {
    const lens = buildTopologySourceLens(detail, topology, source.key);
    if (!lens.pathCount || !lens.componentIds.has(nodeId)) return [];
    const fields = source.handoffProven && lens.resources.some((resource) => resource.ownerId === nodeId)
      ? source.fields
      : [];
    return [{ key: `path:${source.key}`, source, label: source.consumerLabel ?? source.label, detail: `${source.label} · ${lens.pathCount.toLocaleString()} paths`, mode: "path", pathCount: lens.pathCount, targetId: nodeId, fields }];
  });
  const sourcesByConsumer = new Map<string, RouteDataDetail["sources"]>();
  for (const source of detail.sources) {
    if (!source.consumerLabel) continue;
    sourcesByConsumer.set(source.consumerLabel, [...(sourcesByConsumer.get(source.consumerLabel) ?? []), source]);
  }
  for (const edge of topology.edges.filter((item) => item.kind === "loads" && item.to === nodeId)) {
    const resource = topology.nodes.find((node) => node.id === edge.from && node.kind === "boundary");
    if (!resource) continue;
    const handlerEdge = topology.edges.find((item) => item.kind === "loads" && item.to === resource.id);
    const handler = topology.nodes.find((node) => node.id === handlerEdge?.from && node.kind === "source");
    if (!handler) continue;
    const sources = sourcesByConsumer.get(handler.label) ?? [];
    if (sources.length) {
      for (const source of sources) {
        if (touches.some((touch) => touch.source?.key === source.key)) continue;
        touches.push({ key: `resource:${resource.id}:${source.key}`, source, label: handler.label, detail: `${source.label} · ${resource.label}`, mode: "resource", pathCount: 0, targetId: resource.id, fields: [] });
      }
    } else {
      touches.push({ key: `resource:${resource.id}`, source: null, label: handler.label, detail: resource.label, mode: "resource", pathCount: 0, targetId: resource.id, fields: [] });
    }
  }
  return touches.sort((left, right) => modeRank(left.mode) - modeRank(right.mode) || right.pathCount - left.pathCount || lexical(left.label, right.label) || lexical(left.key, right.key));
}

function detectedTransforms(nodes: RouteDataDetail["exhaustiveGraph"]["nodes"], topology: ComponentTopology) {
  const retained = new Map<string, TopologyTransformStage>();
  for (const node of nodes) {
    const effect = transformEffect(node.kind);
    if (!effect) continue;
    const key = `${node.file ?? ""}:${node.line ?? ""}:${node.column ?? ""}:${node.label}`;
    const topologyCandidates = topology.nodes.filter((item) => item.kind === "component" && node.components.includes(item.label) && (!item.file || item.file === node.file));
    const topologyNodeIds = topologyCandidates.length === 1 ? [topologyCandidates[0].id] : [];
    const existing = retained.get(key);
    if (existing) {
      existing.pathCount = Math.max(existing.pathCount, node.pathCount);
      existing.nodeIds = [...new Set([...existing.nodeIds, ...topologyNodeIds])];
      continue;
    }
    retained.set(key, {
      key,
      label: node.label,
      effect,
      component: node.component,
      file: node.file,
      line: node.line,
      pathCount: node.pathCount,
      nodeIds: topologyNodeIds,
    });
  }
  return [...retained.values()]
    .sort((left, right) => right.pathCount - left.pathCount || lexical(left.component, right.component) || lexical(left.label, right.label))
    .slice(0, 16);
}

function detectedTerminals(
  trajectories: RouteDataDetail["exhaustiveGraph"]["trajectories"],
  topology: ComponentTopology,
) {
  const labelsByNodeId = new Map<string, Map<string, number>>();
  for (const trajectory of trajectories) {
    const component = [...trajectory.stepComponents].reverse().find((label) => label !== "Unowned / external");
    if (!component) continue;
    const candidates = topology.nodes.filter((node) => node.kind === "component" && node.label === component);
    if (candidates.length !== 1) continue;
    const labels = labelsByNodeId.get(candidates[0].id) ?? new Map<string, number>();
    labels.set(trajectory.terminalLabel, (labels.get(trajectory.terminalLabel) ?? 0) + 1);
    labelsByNodeId.set(candidates[0].id, labels);
  }
  return new Map([...labelsByNodeId].map(([nodeId, labels]) => [
    nodeId,
    [...labels].map(([label, pathCount]) => ({ label, pathCount })).sort((left, right) => right.pathCount - left.pathCount || lexical(left.label, right.label)),
  ]));
}

function transformEffect(kind: string) {
  if (kind === "fallback") return "Fallback";
  if (/conditional|branch/i.test(kind)) return "Conditional";
  if (kind === "iteration" || kind === "object-pack") return "Transform";
  return null;
}

function emptyLens() {
  return {
    source: null,
    matchMode: "none" as const,
    pathCount: 0,
    componentIds: new Set<string>(),
    resourceParticipantIds: new Set<string>(),
    resources: [] as TopologyResourceStage[],
    transforms: [] as TopologyTransformStage[],
    transformsByNodeId: new Map<string, TopologyTransformStage[]>(),
    fieldsByNodeId: new Map<string, TopologyFieldStage[]>(),
    terminalsByNodeId: new Map<string, TopologyTerminalStage[]>(),
    terminalCount: 0,
    transformMatchMode: "unavailable" as const,
  };
}

function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function modeRank(mode: TopologyNodeSourceTouch["mode"]) { return mode === "path" ? 0 : 1; }
