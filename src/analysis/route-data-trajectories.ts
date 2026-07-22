import type { GraphEdge, GraphNode, ReportGraph, Sink } from "../types";
import { stableHash } from "./route-discovery";

export type ExhaustiveRouteGraph = ReturnType<typeof buildExhaustiveRouteGraph>;
const PATH_BUDGET = 100_000;
const DEPTH_BUDGET = 120;
const UNOWNED_COMPONENT = "Unowned / external";
type RetainedNode = { key: string; label: string; snippet: string | null; kind: string; file: string | null; line: number | null; column: number | null; boundaryId: string | null; pathCount: number; minimumDepth: number; componentCounts: Map<string, number> };
type RawPath = { sink: Sink; graphNodeIds: string[]; pathEdges: GraphEdge[]; nodeComponents: string[] };

export function buildExhaustiveRouteGraph(graph: ReportGraph, sinks: Sink[]) {
  const sourceNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) { const rows = incoming.get(edge.to) ?? []; rows.push(edge); incoming.set(edge.to, rows); }
  const rawPaths: RawPath[] = [];
  let truncated = false;
  let cycleCount = 0;

  const capturePath = (sink: Sink, graphNodeIds: string[], pathEdges: GraphEdge[]) => {
    if (rawPaths.length >= PATH_BUDGET) { truncated = true; return; }
    const component = componentFor(sink);
    rawPaths.push({ sink, graphNodeIds, pathEdges, nodeComponents: graphNodeIds.map(() => component) });
  };
  const walk = (sink: Sink, current: string, reverseNodes: string[], reverseEdges: GraphEdge[], visited: Set<string>) => {
    if (rawPaths.length >= PATH_BUDGET) { truncated = true; return; }
    if (reverseNodes.length >= DEPTH_BUDGET) { truncated = true; capturePath(sink, [...reverseNodes, current].reverse(), [...reverseEdges].reverse()); return; }
    if (visited.has(current)) { cycleCount += 1; capturePath(sink, [...reverseNodes, current].reverse(), [...reverseEdges].reverse()); return; }
    const predecessors = incoming.get(current) ?? [];
    if (!predecessors.length) { capturePath(sink, [...reverseNodes, current].reverse(), [...reverseEdges].reverse()); return; }
    const nextVisited = new Set(visited); nextVisited.add(current);
    for (const edge of predecessors) walk(sink, edge.from, [...reverseNodes, current], [...reverseEdges, edge], nextVisited);
  };
  for (const sink of sinks) walk(sink, sink.nodeId, [], [], new Set());

  const propStitchedPaths = stitchComponentProps(rawPaths, sourceNodes, () => { truncated = true; });
  const stitchedPaths = stitchContextProviders(propStitchedPaths, sourceNodes, () => { truncated = true; });
  const nodes = new Map<string, RetainedNode>();
  const edges = new Map<string, { key: string; from: string; to: string; kind: string; unknown: boolean; pathCount: number }>();
  const trajectories: Array<{ key: string; sinkId: string; terminalLabel: string; stepKeys: string[]; stepComponents: string[]; substitutionStepCount: number; completeness: "complete-for-supported-scope" | "partial" }> = [];
  const seenTrajectories = new Set<string>();

  for (const path of stitchedPaths) {
    const compacted = compactBarePropRoot(path, sourceNodes);
    const canonical = compacted.graphNodeIds.map((id, depth) => retainNode(sourceNodes.get(id), id, depth, nodes, compacted.labelOverrides.get(id)));
    const signature = canonical.join(">");
    if (seenTrajectories.has(signature)) continue;
    seenTrajectories.add(signature);
    for (let index = 0; index < canonical.length; index += 1) {
      const node = nodes.get(canonical[index])!;
      const component = compacted.nodeComponents[index] ?? UNOWNED_COMPONENT;
      node.pathCount += 1;
      node.componentCounts.set(component, (node.componentCounts.get(component) ?? 0) + 1);
    }
    for (let index = 0; index < canonical.length - 1; index += 1) {
      const from = canonical[index]; const to = canonical[index + 1]; const evidence = compacted.pathEdges[index];
      const key = `flow-edge:${stableHash(`${from}:${to}:${evidence?.kind ?? "flow"}`)}`;
      const row = edges.get(key) ?? { key, from, to, kind: evidence?.kind ?? "flow", unknown: Boolean(evidence?.unknown), pathCount: 0 };
      row.pathCount += 1; row.unknown ||= Boolean(evidence?.unknown); edges.set(key, row);
    }
    const unknown = compacted.pathEdges.some((edge) => edge.unknown) || compacted.graphNodeIds.some((id) => sourceNodes.get(id)?.kind === "unknown-source") || Boolean(path.sink.identity && !path.sink.identity.traceComplete) || (path.sink.metrics?.unknownEdgeCount ?? 0) > 0;
    trajectories.push({ key: `sink-path:${stableHash(`${path.sink.id}:${signature}`)}`, sinkId: path.sink.id, terminalLabel: path.sink.label, stepKeys: canonical, stepComponents: compacted.nodeComponents.map((component) => component || UNOWNED_COMPONENT), substitutionStepCount: canonical.filter((key) => isSubstitution(nodes.get(key)!)).length, completeness: unknown ? "partial" : "complete-for-supported-scope" });
  }

  const retainedNodes = [...nodes.values()].map(({ componentCounts, ...node }) => { const components = [...componentCounts].sort((left, right) => right[1] - left[1] || lexical(left[0], right[0])).map(([name]) => name); return { ...node, component: components[0] ?? UNOWNED_COMPONENT, components: components.length ? components : [UNOWNED_COMPONENT] }; });
  return { nodes: retainedNodes, edges: [...edges.values()], trajectories, totals: { sinks: sinks.length, trajectories: trajectories.length, nodes: nodes.size, edges: edges.size, components: new Set(retainedNodes.flatMap((node) => node.components)).size, unknownTrajectories: trajectories.filter((item) => item.completeness === "partial").length }, truncated, cycleCount, pathBudget: PATH_BUDGET };
}

function stitchComponentProps(paths: RawPath[], nodes: Map<string, GraphNode>, onBudget: () => void) {
  const consumersByKey = new Map<string, number[]>();
  const producersByKey = new Map<string, number[]>();
  const componentKeysByLabel = new Map<string, Set<string>>();
  for (const path of paths) {
    const label = componentFor(path.sink);
    const key = componentKeyForSink(path.sink);
    if (label === UNOWNED_COMPONENT || !key) continue;
    const retained = componentKeysByLabel.get(label) ?? new Set<string>();
    retained.add(key);
    componentKeysByLabel.set(label, retained);
  }
  paths.forEach((path, index) => {
    const componentKey = componentKeyForSink(path.sink);
    const consumed = consumedProp(path, nodes);
    if (consumed && componentKey) {
      const key = `${componentKey}:${consumed}`;
      consumersByKey.set(key, [...(consumersByKey.get(key) ?? []), index]);
    }
    const produced = producedProp(path.sink);
    if (produced) {
      const targetKeys = componentKeysByLabel.get(produced.component);
      if (targetKeys?.size !== 1) return;
      const key = `${[...targetKeys][0]}:${produced.prop}`;
      producersByKey.set(key, [...(producersByKey.get(key) ?? []), index]);
    }
  });
  const hasDownstream = paths.map((path) => {
    const produced = producedProp(path.sink);
    const targetKeys = produced ? componentKeysByLabel.get(produced.component) : null;
    return produced && targetKeys?.size === 1 ? (consumersByKey.get(`${[...targetKeys][0]}:${produced.prop}`)?.length ?? 0) > 0 : false;
  });
  const result: RawPath[] = [];
  const expandUpstream = (consumerIndex: number, visited: Set<number>): RawPath[] => {
    const consumer = paths[consumerIndex];
    const consumed = consumedProp(consumer, nodes);
    const componentKey = componentKeyForSink(consumer.sink);
    const key = consumed && componentKey ? `${componentKey}:${consumed}` : null;
    const producers = key ? producersByKey.get(key) ?? [] : [];
    const eligible = producers.filter((index) => index !== consumerIndex && !visited.has(index));
    if (!eligible.length) return [consumer];
    const expanded: RawPath[] = [];
    for (const producerIndex of eligible) {
      const nextVisited = new Set(visited); nextVisited.add(producerIndex);
      for (const upstream of expandUpstream(producerIndex, nextVisited)) {
        if (expanded.length + result.length >= PATH_BUDGET) { onBudget(); return expanded; }
        expanded.push(joinPaths(upstream, consumer, consumed!));
      }
    }
    return expanded.length ? expanded : [consumer];
  };
  paths.forEach((path, index) => {
    if (hasDownstream[index]) return;
    for (const expanded of expandUpstream(index, new Set([index]))) {
      if (result.length >= PATH_BUDGET) { onBudget(); return; }
      result.push(expanded);
    }
  });
  return result.length ? result : paths;
}

function stitchContextProviders(paths: RawPath[], nodes: Map<string, GraphNode>, onBudget: () => void) {
  const consumersByChannel = new Map<string, number[]>();
  const producersByChannel = new Map<string, number[]>();
  const providerSitesByChannel = new Map<string, Set<string>>();
  paths.forEach((path, index) => {
    const consumed = consumedContext(path, nodes);
    if (consumed) consumersByChannel.set(consumed, [...(consumersByChannel.get(consumed) ?? []), index]);
    const produced = producedContext(path.sink);
    if (!produced) return;
    producersByChannel.set(produced.channel, [...(producersByChannel.get(produced.channel) ?? []), index]);
    const sites = providerSitesByChannel.get(produced.channel) ?? new Set<string>();
    sites.add(`${path.sink.file}:${path.sink.line}:${path.sink.column}`);
    providerSitesByChannel.set(produced.channel, sites);
  });
  const unambiguousProducers = new Map([...producersByChannel].filter(([channel]) => providerSitesByChannel.get(channel)?.size === 1));
  const hasDownstream = paths.map((path) => {
    const produced = producedContext(path.sink);
    return produced ? (consumersByChannel.get(produced.channel)?.length ?? 0) > 0 && unambiguousProducers.has(produced.channel) : false;
  });
  const result: RawPath[] = [];
  const expandUpstream = (consumerIndex: number, visited: Set<number>): RawPath[] => {
    const consumer = paths[consumerIndex];
    const channel = consumedContext(consumer, nodes);
    const producers = channel ? unambiguousProducers.get(channel) ?? [] : [];
    const eligible = producers.filter((index) => index !== consumerIndex && !visited.has(index));
    if (!eligible.length) return [consumer];
    const expanded: RawPath[] = [];
    for (const producerIndex of eligible) {
      const nextVisited = new Set(visited); nextVisited.add(producerIndex);
      for (const upstream of expandUpstream(producerIndex, nextVisited)) {
        if (expanded.length + result.length >= PATH_BUDGET) { onBudget(); return expanded; }
        expanded.push(joinPaths(upstream, consumer, channel!, "context"));
      }
    }
    return expanded.length ? expanded : [consumer];
  };
  paths.forEach((path, index) => {
    if (hasDownstream[index]) return;
    for (const expanded of expandUpstream(index, new Set([index]))) {
      if (result.length >= PATH_BUDGET) { onBudget(); return; }
      result.push(expanded);
    }
  });
  return result.length ? result : paths;
}

function joinPaths(producer: RawPath, consumer: RawPath, label: string, kind = "component-prop"): RawPath {
  const bridge = handoffEdge(producer.graphNodeIds.at(-1)!, consumer.graphNodeIds[0], label, kind);
  return {
    sink: consumer.sink,
    graphNodeIds: [...producer.graphNodeIds, ...consumer.graphNodeIds],
    pathEdges: [...producer.pathEdges, bridge, ...consumer.pathEdges],
    nodeComponents: [...producer.nodeComponents, ...consumer.nodeComponents],
  };
}

function producedContext(sink: Sink) {
  if (sink.renderContext?.attribute !== "value") return null;
  const tag = sink.renderContext.tag?.trim();
  if (!tag) return null;
  const providerBase = tag.endsWith(".Provider")
    ? tag.slice(0, -".Provider".length).split(".").at(-1) ?? ""
    : tag.endsWith("Provider")
      ? tag.slice(0, -"Provider".length)
      : "";
  const channel = normalizeContextChannel(providerBase);
  return channel ? { channel } : null;
}

function consumedContext(path: RawPath, nodes: Map<string, GraphNode>) {
  for (const id of path.graphNodeIds.slice(0, 6)) {
    const node = nodes.get(id);
    if (node?.kind !== "call" || !/^use[A-Z]/.test(node.label)) continue;
    const channel = normalizeContextChannel(node.label.slice("use".length));
    if (channel) return channel;
  }
  return null;
}

function normalizeContextChannel(value: string) {
  return value.replace(/Context$/, "").replace(/[^A-Za-z0-9_$]/g, "").toLowerCase();
}

function producedProp(sink: Sink) {
  const tag = sink.renderContext?.tag?.trim();
  const prop = sink.renderContext?.attribute?.trim();
  if (!tag || !prop || (!/^[A-Z]/.test(tag) && !tag.includes("."))) return null;
  return { component: tag.split(".").at(-1)!, prop };
}

function consumedProp(path: RawPath, nodes: Map<string, GraphNode>) {
  for (let index = 0; index < Math.min(4, path.graphNodeIds.length); index += 1) {
    const current = nodes.get(path.graphNodeIds[index]);
    const previous = index ? nodes.get(path.graphNodeIds[index - 1]) : null;
    if (previous?.label === "props" && current?.kind === "property-read") return current.label;
    if (previous?.label === "props") {
      const callable = callablePropName(current);
      if (callable) return callable;
    }
    if (current?.label.startsWith("props.")) return current.label.slice("props.".length).split(".")[0];
  }
  return null;
}

function compactBarePropRoot(path: RawPath, nodes: Map<string, GraphNode>) {
  const graphNodeIds = [...path.graphNodeIds];
  const pathEdges = [...path.pathEdges];
  const nodeComponents = [...path.nodeComponents];
  const labelOverrides = new Map<string, string>();
  for (let index = 0; index < graphNodeIds.length; index += 1) {
    const current = nodes.get(graphNodeIds[index]);
    const next = nodes.get(graphNodeIds[index + 1]);
    if (current?.label !== "props" || !/source|parameter/.test(current.kind)) continue;
    const prop = next?.kind === "property-read" ? next.label : callablePropName(next);
    if (!prop) continue;
    labelOverrides.set(graphNodeIds[index + 1], prop.startsWith("props.") ? prop : `props.${prop}`);
    graphNodeIds.splice(index, 1);
    nodeComponents.splice(index, 1);
    if (index === 0) pathEdges.splice(0, Math.min(1, pathEdges.length));
    else if (index >= graphNodeIds.length) pathEdges.splice(index - 1, 1);
    else {
      const incomingKind = pathEdges[index - 1]?.kind === "component-prop" ? "component-prop" : "property-read";
      pathEdges.splice(index - 1, 2, componentPropEdge(graphNodeIds[index - 1], graphNodeIds[index], incomingKind));
    }
    index -= 1;
  }
  return { ...path, graphNodeIds, pathEdges, nodeComponents, labelOverrides };
}

function callablePropName(node: GraphNode | undefined) {
  return node?.kind === "call" ? node.propName ?? null : null;
}

function componentPropEdge(from: string, to: string, prop: string): GraphEdge {
  return handoffEdge(from, to, prop, "component-prop");
}
function handoffEdge(from: string, to: string, label: string, kind: string): GraphEdge {
  return { id: `${kind}:${stableHash(`${from}:${to}:${label}`)}`, from, to, kind, unknown: false, location: null };
}
function componentFor(sink: Sink) { return sink.renderContext?.component?.trim() || UNOWNED_COMPONENT; }
function componentKeyForSink(sink: Sink) {
  const component = sink.renderContext?.component?.trim();
  return component && sink.file ? `${sink.file.replaceAll("\\", "/")}:${component}` : null;
}
function retainNode(node: GraphNode | undefined, fallbackId: string, depth: number, rows: Map<string, RetainedNode>, labelOverride?: string) {
  const identity = node?.terminalId ?? node?.identityId ?? `${node?.file ?? ""}:${node?.location?.line ?? ""}:${node?.location?.column ?? ""}:${node?.kind ?? "unknown"}:${node?.label ?? fallbackId}`;
  const key = `flow-node:${stableHash(identity)}`;
  const row = rows.get(key) ?? { key, label: labelOverride ?? node?.label ?? fallbackId, snippet: node?.snippet ?? null, kind: node?.kind ?? "unknown", file: node?.file ?? null, line: node?.location?.line ?? null, column: node?.location?.column ?? null, boundaryId: node?.boundaryId ?? null, pathCount: 0, minimumDepth: depth, componentCounts: new Map<string, number>() };
  if (labelOverride && row.label === node?.label) row.label = labelOverride;
  row.minimumDepth = Math.min(row.minimumDepth, depth); rows.set(key, row); return key;
}
function isSubstitution(node: { kind: string; label: string }) { return /fallback|default|nullish|conditional|normalize|select|defense/i.test(`${node.kind} ${node.label}`); }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
