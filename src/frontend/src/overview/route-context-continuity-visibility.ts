import type { RouteTotalityEmphasis } from "./route-totality-emphasis";

export type RouteContextNodeVisibility = "visible" | "active" | "secondary" | "frontier" | "dimmed" | "hidden";

type RouteContextEmphasis = Pick<
  RouteTotalityEmphasis,
  "active" | "activeNodeIds" | "secondaryNodeIds" | "frontierNodeIds" | "focusNodeIds"
>;

export function routeContextNodeVisibility(
  nodeId: string,
  emphasis: RouteContextEmphasis,
  isolated: boolean,
): RouteContextNodeVisibility {
  if (isolated && !emphasis.focusNodeIds.has(nodeId)) return "hidden";
  if (!emphasis.active) return "visible";
  if (emphasis.secondaryNodeIds.has(nodeId)) return "secondary";
  if (emphasis.frontierNodeIds.has(nodeId)) return "frontier";
  if (emphasis.activeNodeIds.has(nodeId)) return "active";
  return "dimmed";
}

export function combineRouteContextNodeVisibility(
  visibilities: readonly RouteContextNodeVisibility[],
): RouteContextNodeVisibility {
  if (visibilities.some((visibility) => visibility === "hidden")) return "hidden";
  if (visibilities.some((visibility) => visibility === "dimmed")) return "dimmed";
  if (visibilities.some((visibility) => visibility === "frontier")) return "frontier";
  if (visibilities.some((visibility) => visibility === "secondary")) return "secondary";
  if (visibilities.some((visibility) => visibility === "active")) return "active";
  return "visible";
}
