import type { RouteTotalityEmphasis } from "./route-totality-emphasis";

export function emptyRouteTotalityEmphasis(): RouteTotalityEmphasis {
  const empty = new Set<string>();
  return Object.freeze({
    active: false,
    mode: null,
    seedId: null,
    status: "idle",
    note: "Select a node to emphasize its upstream and downstream connections.",
    activeNodeIds: readOnlySet(empty),
    activeEdgeIds: readOnlySet(empty),
    activeLayoutEdgeIds: readOnlySet(empty),
    activeBridgeIds: readOnlySet(empty),
    secondaryNodeIds: readOnlySet(empty),
    secondaryEdgeIds: readOnlySet(empty),
    secondaryLayoutEdgeIds: readOnlySet(empty),
    frontierNodeIds: readOnlySet(empty),
    frontierEdgeIds: readOnlySet(empty),
    frontierLayoutEdgeIds: readOnlySet(empty),
    frontierBridgeIds: readOnlySet(empty),
    focusNodeIds: readOnlySet(empty),
    focusEdgeIds: readOnlySet(empty),
    frontiers: Object.freeze([]),
    originContributors: Object.freeze([]),
    frontierOriginContributors: Object.freeze([]),
    provenNodeCount: 0,
    provenEdgeCount: 0,
    provenBridgeCount: 0,
  });
}

function readOnlySet(values: Iterable<string>): ReadonlySet<string> {
  return new Set(values);
}
