import type { RouteDataDetail } from "../../../api/contracts";
import type { ComponentTopology, ComponentTopologyEdge } from "./component-topology-model";

const FOCUS_EDGE_LIMIT = 24;

export function componentTopologySelectionCopyPayload(args: {
  detail: RouteDataDetail;
  topology: ComponentTopology;
  visibleTopology: ComponentTopology;
  selectedNodeId: string;
  focusedEdgeIds: ReadonlySet<string>;
  downstreamProofEdgeIds?: ReadonlySet<string>;
  recurringHiddenEdgeIds: ReadonlySet<string>;
  policyHiddenEdgeIds: ReadonlySet<string>;
  selectedRings: readonly { label: string; category?: string }[];
  policyMode: "hidden" | "all";
  policyHiddenComponents: readonly { componentId: string; label: string; visibleParentIds: string[]; incomingReferenceCount: number }[];
  policyHiddenReferenceCount: number;
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
      visible: !args.recurringHiddenEdgeIds.has(edge.id) && !args.policyHiddenEdgeIds.has(edge.id),
      hiddenReason: args.policyHiddenEdgeIds.has(edge.id) ? "hidden-by-convention" : args.recurringHiddenEdgeIds.has(edge.id) ? "recurring-reference" : null,
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
  const focusedEdgeIds = new Set(args.visibleTopology.edges.filter((edge) => args.focusedEdgeIds.has(edge.id)).map((edge) => edge.id));
  const provenDownstreamFocused = selected.kind === "boundary"
    && [...(args.downstreamProofEdgeIds ?? [])].some((edgeId) => focusedEdgeIds.has(edgeId));
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
      rule: selected.kind === "boundary"
        ? provenDownstreamFocused
          ? "direct neighbors plus cycle-safe upstream lineage and proven downstream resource lineage"
          : "direct neighbors plus cycle-safe upstream lineage; no proven downstream resource lineage"
        : "direct neighbors plus cycle-safe upstream lineage",
      edgeCount: focusedEdges.length,
      edges: retainedFocusedEdges,
      truncated: focusedEdges.length > retainedFocusedEdges.length,
    },
    summarization: {
      selectedRings: args.selectedRings.map((ring) => ({ label: ring.label, category: ring.category ?? "recurring-reference" })),
      hiddenSelectedConnections: connections.filter((connection) => !connection.visible).length,
      totalSummarizedReferences: args.summarizedReferenceCount,
      recurring: {
        hiddenEdgeCount: args.recurringHiddenEdgeIds.size,
      },
      policy: {
        mode: args.policyMode,
        hiddenEdgeCount: args.policyHiddenEdgeIds.size,
        hiddenReferenceCount: args.policyHiddenReferenceCount,
        hiddenComponents: args.policyHiddenComponents,
      },
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
