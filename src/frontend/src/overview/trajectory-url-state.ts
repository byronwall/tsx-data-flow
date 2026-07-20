import type { RouteDataInventory } from "../../../api/contracts";
import type { RouteAtlasKind, RouteAtlasSort } from "./route-atlas-model";

export type TrajectoryView = "context" | "trajectory";
export type TrajectoryUrlState = {
  open: boolean; route: string | null; flow: string | null; item: string | null; expand: string[]; isolate: boolean;
  mode: "atlas" | "detail"; kind: RouteAtlasKind; sort: RouteAtlasSort; source: string | null;
  filter: string | null; view: TrajectoryView; pan: { x: number; y: number } | null; zoom: number | null; packet: string | null;
};
export const EMPTY_TRAJECTORY_STATE: TrajectoryUrlState = { open: false, route: null, flow: null, item: null, expand: [], isolate: false, mode: "detail", kind: "pages", sort: "steps", source: null, filter: null, view: "context", pan: null, zoom: null, packet: null };

export function parseTrajectoryUrlState(search: string | URLSearchParams): TrajectoryUrlState {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const pan = params.get("pan")?.split(",").map(Number);
  const zoom = Number(params.get("zoom"));
  return {
    open: params.get("viz") === "trajectory", route: clean(params.get("route")), flow: clean(params.get("flow")), item: clean(params.get("item")),
    expand: [...new Set((params.get("expand") ?? "").split(",").map((value) => value.trim()).filter(Boolean))], isolate: params.get("isolate") === "1",
    mode: params.get("trajectoryMode") === "atlas" ? "atlas" : "detail",
    kind: params.get("routeKind") === "api" || params.get("routeKind") === "all" ? params.get("routeKind") as RouteAtlasKind : "pages",
    sort: (["paths", "unique", "substitutions", "gaps"].includes(params.get("routeSort") ?? "") ? params.get("routeSort") : "steps") as RouteAtlasSort,
    source: clean(params.get("sourceMethod")),
    filter: clean(params.get("filter")), view: params.get("view") === "trajectory" ? "trajectory" : "context",
    pan: pan?.length === 2 && pan.every(Number.isFinite) ? { x: pan[0], y: pan[1] } : null,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : null, packet: clean(params.get("packet")),
  };
}

export function serializeTrajectoryUrlState(state: TrajectoryUrlState, current = "") {
  const params = new URLSearchParams(current);
  for (const key of ["viz", "route", "flow", "item", "expand", "isolate", "trajectoryMode", "routeKind", "routeSort", "sourceMethod", "filter", "view", "pan", "zoom", "packet"]) params.delete(key);
  if (state.open) params.set("viz", "trajectory");
  if (state.route) params.set("route", state.route);
  if (state.flow) params.set("flow", state.flow);
  if (state.item) params.set("item", state.item);
  if (state.expand.length) params.set("expand", state.expand.join(","));
  if (state.isolate) params.set("isolate", "1");
  params.set("trajectoryMode", state.mode);
  params.set("routeKind", state.kind);
  params.set("routeSort", state.sort);
  if (state.source) params.set("sourceMethod", state.source);
  if (state.filter) params.set("filter", state.filter);
  params.set("view", state.view);
  if (state.pan) params.set("pan", `${round(state.pan.x)},${round(state.pan.y)}`);
  if (state.zoom) params.set("zoom", String(round(state.zoom)));
  if (state.packet) params.set("packet", state.packet);
  const value = params.toString(); return value ? `?${value}` : "";
}

export function reconcileTrajectoryUrlState(state: TrajectoryUrlState, inventory: RouteDataInventory) {
  const notices: string[] = [];
  let route = inventory.routes.find((item) => item.key === state.route) ?? null;
  if (!route && state.mode === "detail") {
    route = [...inventory.routes].sort((left, right) => right.trajectoryCount - left.trajectoryCount || (left.pathPattern < right.pathPattern ? -1 : 1))[0] ?? null;
    if (state.route) notices.push("The restored route no longer exists; selected the nearest available route.");
  }
  const routeSources = inventory.sources.filter((item) => route?.sourceMethodKeys.includes(item.key));
  const source = state.source && routeSources.some((item) => item.key === state.source) ? state.source : null;
  if (state.source && source !== state.source) notices.push("The restored source is not available on this route; returned to the full topology.");
  const routeFlows = inventory.trajectories.filter((item) => item.routeKey === route?.key);
  let flow = routeFlows.find((item) => item.key === state.flow) ?? null;
  if (!flow) {
    flow = routeFlows.find((item) => item.completeness === "complete-for-supported-scope") ?? routeFlows[0] ?? null;
    if (state.flow) notices.push("The restored trajectory no longer exists; invalid descendants were cleared.");
  }
  const sameFlow = flow?.key === state.flow;
  return { state: { ...state, source, route: route?.key ?? null, flow: flow?.key ?? null, item: sameFlow ? state.item : null, expand: sameFlow ? state.expand : [], isolate: sameFlow && state.isolate }, notice: notices.join(" ") };
}
function clean(value: string | null) { const next = value?.trim(); return next ? next : null; }
function round(value: number) { return Math.round(value * 1000) / 1000; }
