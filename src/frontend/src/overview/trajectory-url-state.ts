import type { RouteDataDetail, RouteDataInventory } from "../../../api/contracts";
import { buildRouteTotalityLayout } from "./route-totality-layout";
import type { RouteAtlasKind, RouteAtlasSort } from "./route-atlas-model";
import type { RouteTotalityLayout } from "./route-totality-model";

export type TrajectoryView = "context" | "trajectory";
export type GenericUiMode = "hidden" | "all";
export type TrajectoryRenderer = "current" | "experimental" | "totality";
export type TrajectoryTotalitySelection = { kind: "node" | "edge"; graphId: string };
export type TrajectoryGraphCamera = { x: number; y: number; scale: number };
export type TrajectoryUrlState = {
  open: boolean; route: string | null; flow: string | null; item: string | null; expand: string[]; isolate: boolean;
  mode: "atlas" | "detail"; kind: RouteAtlasKind; sort: RouteAtlasSort; source: string | null;
  filter: string | null; view: TrajectoryView; genericUi: GenericUiMode | null; pan: { x: number; y: number } | null; zoom: number | null; packet: string | null;
  /** Optional fields keep old callers and old URLs source-compatible. */
  trajectoryRenderer?: TrajectoryRenderer;
  totalitySelection?: TrajectoryTotalitySelection | null;
  graphCamera?: TrajectoryGraphCamera | null;
};

export type TrajectoryProjectionState = {
  trajectoryRenderer: TrajectoryRenderer;
  totalitySelection: TrajectoryTotalitySelection | null;
  graphCamera: TrajectoryGraphCamera | null;
};

export const EMPTY_TRAJECTORY_STATE: TrajectoryUrlState = {
  open: false, route: null, flow: null, item: null, expand: [], isolate: false, mode: "detail", kind: "pages", sort: "steps", source: null, filter: null, view: "context", genericUi: null, pan: null, zoom: null, packet: null,
  trajectoryRenderer: "current", totalitySelection: null, graphCamera: null,
};

const GRAPH_CAMERA_LIMITS = { coordinate: 100_000, minScale: 0.25, maxScale: 10 } as const;

export function parseTrajectoryUrlState(search: string | URLSearchParams): TrajectoryUrlState {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const pan = params.get("pan")?.split(",").map(Number);
  const zoom = Number(params.get("zoom"));
  const state: TrajectoryUrlState = {
    open: params.get("viz") === "trajectory", route: clean(params.get("route")), flow: clean(params.get("flow")), item: clean(params.get("item")),
    expand: [...new Set((params.get("expand") ?? "").split(",").map((value) => value.trim()).filter(Boolean))], isolate: params.get("isolate") === "1",
    mode: params.get("trajectoryMode") === "atlas" ? "atlas" : "detail",
    kind: params.get("routeKind") === "api" || params.get("routeKind") === "all" ? params.get("routeKind") as RouteAtlasKind : "pages",
    sort: (["paths", "unique", "substitutions", "gaps"].includes(params.get("routeSort") ?? "") ? params.get("routeSort") : "steps") as RouteAtlasSort,
    source: clean(params.get("sourceMethod")),
    filter: clean(params.get("filter")), view: params.get("view") === "trajectory" ? "trajectory" : "context",
    genericUi: params.get("genericUi") === "hidden" || params.get("genericUi") === "all" ? params.get("genericUi") as GenericUiMode : null,
    pan: pan?.length === 2 && pan.every(Number.isFinite) ? { x: pan[0], y: pan[1] } : null,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : null, packet: clean(params.get("packet")),
  };
  const renderer = params.get("trajectoryRenderer");
  if (renderer !== null) state.trajectoryRenderer = parseRenderer(renderer);
  const totalitySelection = params.get("totalitySelection");
  if (totalitySelection !== null) state.totalitySelection = parseTotalitySelection(totalitySelection);
  const graphCamera = params.get("graphCamera");
  if (graphCamera !== null) state.graphCamera = parseGraphCamera(graphCamera);
  return state;
}

export function serializeTrajectoryUrlState(state: TrajectoryUrlState, current = "") {
  const params = new URLSearchParams(current);
  for (const key of ["viz", "route", "flow", "item", "expand", "isolate", "trajectoryMode", "routeKind", "routeSort", "sourceMethod", "filter", "view", "genericUi", "pan", "zoom", "packet", "trajectoryRenderer", "totalitySelection", "graphCamera"]) params.delete(key);
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
  if (state.genericUi) params.set("genericUi", state.genericUi);
  if (state.pan) params.set("pan", `${round(state.pan.x)},${round(state.pan.y)}`);
  if (state.zoom) params.set("zoom", String(round(state.zoom)));
  if (state.packet) params.set("packet", state.packet);
  if (state.trajectoryRenderer !== undefined) params.set("trajectoryRenderer", state.trajectoryRenderer);
  if (state.totalitySelection) params.set("totalitySelection", `${state.totalitySelection.kind}:${state.totalitySelection.graphId}`);
  if (state.graphCamera) {
    const camera = normalizeGraphCamera(state.graphCamera);
    params.set("graphCamera", `${round(camera.x)},${round(camera.y)},${round(camera.scale)}`);
  }
  const value = params.toString(); return value ? `?${value}` : "";
}

export function normalizeTrajectoryUrlState(state: TrajectoryUrlState): TrajectoryUrlState {
  return {
    ...EMPTY_TRAJECTORY_STATE,
    ...state,
    expand: [...new Set(state.expand)],
    trajectoryRenderer: state.trajectoryRenderer ?? "current",
    totalitySelection: state.totalitySelection ?? null,
    graphCamera: state.graphCamera ? normalizeGraphCamera(state.graphCamera) : null,
  };
}

export function trajectoryProjectionState(state: TrajectoryUrlState): TrajectoryProjectionState {
  const normalized = normalizeTrajectoryUrlState(state);
  return {
    trajectoryRenderer: normalized.trajectoryRenderer!,
    totalitySelection: normalized.totalitySelection!,
    graphCamera: normalized.graphCamera!,
  };
}

export function sameTrajectoryUrlState(left: TrajectoryUrlState, right: TrajectoryUrlState) {
  const leftProjection = trajectoryProjectionState(left);
  const rightProjection = trajectoryProjectionState(right);
  return left.open === right.open && left.route === right.route && left.flow === right.flow && left.item === right.item
    && left.expand.length === right.expand.length && left.expand.every((item, index) => item === right.expand[index])
    && left.isolate === right.isolate && left.mode === right.mode && left.kind === right.kind && left.sort === right.sort
    && left.source === right.source && left.filter === right.filter && left.view === right.view && left.genericUi === right.genericUi
    && samePoint(left.pan, right.pan) && left.zoom === right.zoom && left.packet === right.packet
    && leftProjection.trajectoryRenderer === rightProjection.trajectoryRenderer
    && sameSelection(leftProjection.totalitySelection, rightProjection.totalitySelection)
    && sameCamera(leftProjection.graphCamera, rightProjection.graphCamera);
}

export function isTrajectoryCameraOnlyChange(left: TrajectoryUrlState, right: TrajectoryUrlState) {
  const leftCamera = trajectoryProjectionState(left).graphCamera;
  const rightCamera = trajectoryProjectionState(right).graphCamera;
  return !sameCamera(leftCamera, rightCamera)
    && sameTrajectoryUrlState({ ...left, graphCamera: rightCamera }, right);
}

export function selectCheapestTrajectoryForRoute(inventory: RouteDataInventory, routeKey: string) {
  return inventory.trajectories
    .filter((trajectory) => trajectory.routeKey === routeKey)
    .sort(compareTrajectoryCost)[0] ?? null;
}

export function reconcileTrajectoryUrlState(state: TrajectoryUrlState, inventory: RouteDataInventory) {
  const notices: string[] = [];
  let mode = state.mode;
  let route = inventory.routes.find((item) => item.key === state.route) ?? null;
  const savedFlow = inventory.trajectories.find((item) => item.key === state.flow) ?? null;
  let flow = route && savedFlow?.routeKey === route.key ? savedFlow : null;
  const flowRoute = savedFlow ? inventory.routes.find((item) => item.key === savedFlow.routeKey) ?? null : null;
  if (savedFlow && flowRoute && flow === null) {
    route = flowRoute;
    flow = savedFlow;
    if (state.route && state.route !== route.key) {
      notices.push(inventory.routes.some((item) => item.key === state.route)
        ? "The restored trajectory belongs to another route; kept its owning route."
        : "The restored route no longer exists; kept the valid trajectory on its owning route.");
    }
  }
  if (!route && state.mode === "detail") {
    route = inventory.routes
      .filter((item) => routeMatchesKind(item, state.kind) && routeCanProduceUsefulDetail(item, inventory))
      .sort(compareRouteCost)[0] ?? null;
    if (route) {
      if (state.route) notices.push("The restored route is not available; selected an available route.");
    } else {
      mode = "atlas";
      if (state.route) notices.push("The restored route is not available; returned to the route atlas.");
    }
  }
  const source = state.source && inventory.sources.some((item) => item.key === state.source) ? state.source : null;
  if (state.source && source !== state.source) notices.push("The restored source is not available in this analysis; returned to the full topology.");
  if (!flow) {
    flow = route ? selectCheapestTrajectoryForRoute(inventory, route.key) : null;
    if (state.flow) notices.push("The restored trajectory no longer exists; invalid descendants were cleared.");
  }
  const sameFlow = flow?.key === state.flow;
  return {
    state: {
      ...state,
      mode,
      source,
      route: route?.key ?? null,
      flow: flow?.key ?? null,
      item: sameFlow ? state.item : null,
      expand: sameFlow ? state.expand : [],
      isolate: sameFlow && state.isolate,
      totalitySelection: sameFlow ? state.totalitySelection : null,
      graphCamera: sameFlow ? state.graphCamera : null,
    },
    notice: notices.join(" "),
  };
}

function compareRouteCost(left: RouteDataInventory["routes"][number], right: RouteDataInventory["routes"][number]) {
  return left.totalPathSteps - right.totalPathSteps
    || left.trajectoryCount - right.trajectoryCount
    || left.uniqueStepCount - right.uniqueStepCount
    || left.unknownGapCount - right.unknownGapCount
    || left.substitutionStepCount - right.substitutionStepCount
    || left.omissions.length - right.omissions.length
    || lexical(left.pathPattern, right.pathPattern)
    || lexical(left.file, right.file)
    || lexical(left.key, right.key);
}

function compareTrajectoryCost(left: RouteDataInventory["trajectories"][number], right: RouteDataInventory["trajectories"][number]) {
  return completenessRank(left.completeness) - completenessRank(right.completeness)
    || left.operationCount - right.operationCount
    || left.terminalCount - right.terminalCount
    || left.routeReachableTerminalCount - right.routeReachableTerminalCount
    || left.substitutionStepCount - right.substitutionStepCount
    || left.omissions.length - right.omissions.length
    || lexical(left.label, right.label)
    || lexical(left.key, right.key);
}

function completenessRank(completeness: RouteDataInventory["trajectories"][number]["completeness"]) {
  if (completeness === "complete-for-supported-scope") return 0;
  if (completeness === "partial") return 1;
  return 2;
}

function routeMatchesKind(route: RouteDataInventory["routes"][number], kind: RouteAtlasKind) {
  return kind === "all" || route.routeKind === (kind === "pages" ? "page" : "api");
}

function routeCanProduceUsefulDetail(route: RouteDataInventory["routes"][number], inventory: RouteDataInventory) {
  const flows = inventory.trajectories.filter((trajectory) => trajectory.routeKey === route.key);
  if (flows.length === 0) return false;
  if (route.trajectoryCount > 0 || route.completeTrajectoryCount > 0) return true;
  return flows.some((flow) => flow.completeness === "complete-for-supported-scope" && flowHasMeaningfulDetail(flow));
}

function flowHasMeaningfulDetail(flow: RouteDataInventory["trajectories"][number]) {
  return flow.operationCount > 0 || flow.terminalCount > 0 || flow.routeReachableTerminalCount > 0;
}

function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }

export function reconcileTrajectoryDetailState(state: TrajectoryUrlState, detail: RouteDataDetail) {
  const normalized = normalizeTrajectoryUrlState(state);
  const validOperations = new Set(detail.operations.map((item) => item.key));
  const item = normalized.item && validOperations.has(normalized.item) ? normalized.item : null;
  const expand = normalized.expand.filter((key) => validOperations.has(key));
  const currentSelection = normalized.totalitySelection ?? null;
  const totalityLayout = buildRouteTotalityLayout(detail.totality);
  const totalitySelection = isTotalitySelectionValid(currentSelection, totalityLayout) ? currentSelection : null;
  const totalitySelectionInvalid = Boolean(currentSelection && !totalitySelection);
  const hasValidIsolationOwner = normalized.trajectoryRenderer === "totality"
    ? isTotalityIsolationFocusValid(totalitySelection, totalityLayout)
    : normalized.trajectoryRenderer === "current" && Boolean(item);
  const isolate = normalized.isolate && !totalitySelectionInvalid && hasValidIsolationOwner;
  const invalid = normalized.item !== item || normalized.expand.length !== expand.length || normalized.totalitySelection !== totalitySelection;
  return {
    state: { ...normalized, item, expand, isolate, totalitySelection },
    notice: invalid ? "Some restored investigation state no longer exists and was cleared." : "",
  };
}

function parseRenderer(value: string): TrajectoryRenderer {
  return value === "experimental" || value === "totality" ? value : "current";
}

function parseTotalitySelection(value: string): TrajectoryTotalitySelection | null {
  const separator = value.indexOf(":");
  if (separator <= 0) return null;
  const kind = value.slice(0, separator);
  const graphId = clean(value.slice(separator + 1));
  return (kind === "node" || kind === "edge") && graphId ? { kind, graphId } : null;
}

function parseGraphCamera(value: string): TrajectoryGraphCamera | null {
  const values = value.split(",").map(Number);
  return values.length === 3 && values.every(Number.isFinite) ? normalizeGraphCamera({ x: values[0], y: values[1], scale: values[2] }) : null;
}

function normalizeGraphCamera(camera: TrajectoryGraphCamera): TrajectoryGraphCamera {
  return {
    x: clamp(round(camera.x), -GRAPH_CAMERA_LIMITS.coordinate, GRAPH_CAMERA_LIMITS.coordinate),
    y: clamp(round(camera.y), -GRAPH_CAMERA_LIMITS.coordinate, GRAPH_CAMERA_LIMITS.coordinate),
    scale: clamp(round(camera.scale), GRAPH_CAMERA_LIMITS.minScale, GRAPH_CAMERA_LIMITS.maxScale),
  };
}

function isTotalitySelectionValid(selection: TrajectoryTotalitySelection | null, layout: RouteTotalityLayout) {
  if (!selection) return true;
  return selection.kind === "node"
    ? layout.nodes.some((node) => node.id === selection.graphId)
    : layout.edges.some((edge) => `edge:${edge.family}:${edge.id}` === selection.graphId);
}

function isTotalityIsolationFocusValid(selection: TrajectoryTotalitySelection | null, layout: RouteTotalityLayout) {
  return selection?.kind === "node"
    && layout.nodes.some((node) => node.id === selection.graphId && (node.kind === "origin" || node.kind === "terminal"));
}

function samePoint(left: { x: number; y: number } | null, right: { x: number; y: number } | null) { return left?.x === right?.x && left?.y === right?.y; }
function sameSelection(left: TrajectoryTotalitySelection | null, right: TrajectoryTotalitySelection | null) { return left?.kind === right?.kind && left?.graphId === right?.graphId; }
function sameCamera(left: TrajectoryGraphCamera | null, right: TrajectoryGraphCamera | null) { return left?.x === right?.x && left?.y === right?.y && left?.scale === right?.scale; }
function clean(value: string | null) { const next = value?.trim(); return next ? next : null; }
function round(value: number) { return Math.round(value * 1000) / 1000; }
function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
