import type { RouteDataDetail } from "../../../api/contracts";
import type { ComponentTopology, ComponentTopologyEdge } from "./component-topology-model";

const FOCUS_EDGE_LIMIT = 24;

export function componentTopologySelectionCopyPayload(args: {
  detail: RouteDataDetail;
  topology: ComponentTopology;
  visibleTopology: ComponentTopology;
  selectedNodeId: string;
  focusedEdgeIds: ReadonlySet<string>;
  hiddenEdgeIds: ReadonlySet<string>;
  selectedRings: readonly { label: string }[];
  summarizedReferenceCount: number;
  view: string;
}) {
  const nodeById = new Map(args.topology.nodes.map((node) => [node.id, node]));
  const selected = nodeById.get(args.selectedNodeId);
  if (!selected) return null;
  const connections = args.topology.edges.flatMap((edge) => {
    if (edge.from !== selected.id && edge.to !== selected.id) return [];
    const outgoing = edge.from === selected.id;
    const neighbor = nodeById.get(outgoing ? edge.to : edge.from);
    if (!neighbor) return [];
    return [{
      direction: outgoing ? "outgoing" : "incoming",
      node: nodeSummary(neighbor),
      relationship: edgeSummary(edge),
      visible: !args.hiddenEdgeIds.has(edge.id),
      highlighted: args.focusedEdgeIds.has(edge.id),
    }];
  }).sort((left, right) => lexical(left.direction, right.direction) || lexical(left.node.label, right.node.label));
  const focusedEdges = args.visibleTopology.edges
    .filter((edge) => args.focusedEdgeIds.has(edge.id))
    .map((edge) => ({
      from: nodeById.get(edge.from)?.label ?? edge.from,
      to: nodeById.get(edge.to)?.label ?? edge.to,
      ...edgeSummary(edge),
    }))
    .sort((left, right) => lexical(left.from, right.from) || lexical(left.to, right.to));
  const retainedFocusedEdges = focusedEdges.slice(0, FOCUS_EDGE_LIMIT);
  return {
    kind: "component-topology-selection",
    view: args.view,
    route: {
      key: args.detail.route.key,
      path: args.detail.route.pathPattern,
      file: args.detail.route.file,
      components: args.detail.route.componentNames,
    },
    trajectory: {
      key: args.detail.trajectory.key,
      label: args.detail.trajectory.label,
      completeness: args.detail.trajectory.completeness,
    },
    selection: nodeSummary(selected),
    connections,
    focus: {
      rule: "direct neighbors plus cycle-safe upstream lineage",
      edgeCount: focusedEdges.length,
      edges: retainedFocusedEdges,
      truncated: focusedEdges.length > retainedFocusedEdges.length,
    },
    summarization: {
      selectedRings: args.selectedRings.map((ring) => ring.label),
      hiddenSelectedConnections: connections.filter((connection) => !connection.visible).length,
      totalSummarizedReferences: args.summarizedReferenceCount,
    },
    graph: {
      visibleNodes: args.visibleTopology.nodes.length,
      visibleEdges: args.visibleTopology.edges.length,
      inferredVisibleEdges: args.visibleTopology.totals.inferredEdges,
    },
  };
}

function nodeSummary(node: ComponentTopology["nodes"][number]) {
  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    location: node.file ? `${node.file}${node.line ? `:${node.line}` : ""}` : null,
    routeEntry: node.routeEntry,
    incoming: node.incomingCount,
    outgoing: node.outgoingCount,
  };
}

function edgeSummary(edge: ComponentTopologyEdge) {
  return {
    kind: edge.kind,
    confidence: edge.confidence,
    retainedPaths: edge.count,
    ...(edge.via?.length ? { via: edge.via } : {}),
  };
}

function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
