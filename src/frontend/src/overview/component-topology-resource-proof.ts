import type { RouteDataDetail } from "../../../api/contracts";
import type { ComponentTopology } from "./component-topology-model";
import { contractTransparentComponentSteps } from "./component-topology-normalization";

const BOUNDARY_NODE_PREFIX = "boundary:";
const UNOWNED_COMPONENT = "Unowned / external";

/**
 * Return only visible, proven handoff edges whose component pair is present
 * after the selected resource boundary in a complete exhaustive trajectory.
 */
export function componentTopologyDownstreamProofEdgeIds(
  detail: RouteDataDetail,
  visibleTopology: ComponentTopology,
  selectedNodeId: string | null,
) {
  const edgeIds = new Set<string>();
  const selectedNode = visibleTopology.nodes.find((node) => node.id === selectedNodeId);
  if (!selectedNode || selectedNode.kind !== "boundary" || !selectedNodeId?.startsWith(BOUNDARY_NODE_PREFIX)) return edgeIds;

  const operationKey = selectedNodeId.slice(BOUNDARY_NODE_PREFIX.length);
  const operation = detail.operations.find((item) => item.key === operationKey && item.boundary?.kind === "resource" && item.boundaryId);
  if (!operation?.boundaryId) return edgeIds;

  const nodesByKey = new Map(detail.exhaustiveGraph.nodes.map((node) => [node.key, node]));
  const componentIdsByLabel = new Map<string, string[]>();
  for (const node of visibleTopology.nodes) {
    if (node.kind !== "component") continue;
    componentIdsByLabel.set(node.label, [...(componentIdsByLabel.get(node.label) ?? []), node.id]);
  }
  const handoffEdgesByPair = new Map<string, string[]>();
  for (const edge of visibleTopology.edges) {
    if (edge.kind !== "handoff" || edge.confidence !== "proven") continue;
    const key = pairKey(edge.from, edge.to);
    handoffEdgesByPair.set(key, [...(handoffEdgesByPair.get(key) ?? []), edge.id]);
  }

  for (const trajectory of detail.exhaustiveGraph.trajectories) {
    if (trajectory.completeness !== "complete-for-supported-scope") continue;
    if (trajectory.stepKeys.length !== trajectory.stepComponents.length) continue;
    for (let boundaryIndex = 0; boundaryIndex < trajectory.stepKeys.length; boundaryIndex += 1) {
      const boundary = nodesByKey.get(trajectory.stepKeys[boundaryIndex]);
      if (boundary?.boundaryId !== operation.boundaryId) continue;
      const downstreamComponents = contractTransparentComponentSteps(trajectory.stepComponents.slice(boundaryIndex));
      for (let index = 0; index < downstreamComponents.length - 1; index += 1) {
        const fromId = uniqueComponentId(componentIdsByLabel, downstreamComponents[index].label);
        const toId = uniqueComponentId(componentIdsByLabel, downstreamComponents[index + 1].label);
        if (!fromId || !toId) continue;
        for (const edgeId of handoffEdgesByPair.get(pairKey(fromId, toId)) ?? []) edgeIds.add(edgeId);
      }
    }
  }
  return edgeIds;
}

export function normalizeResourceBoundaryLabel(label: string) {
  const name = label.replace(/^\s*Load\s+/i, "").trim();
  if (!name) return "resource";
  return name.replace(/\s+resource$/i, "").trim() || "resource";
}

function uniqueComponentId(componentIdsByLabel: ReadonlyMap<string, string[]>, label: string) {
  if (!label || label === UNOWNED_COMPONENT) return null;
  const ids = componentIdsByLabel.get(label) ?? [];
  return ids.length === 1 ? ids[0] : null;
}

function pairKey(from: string, to: string) { return `${from}\u0000${to}`; }
