import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, untrack } from "solid-js";
import type { RouteDataInventory } from "../../../api/contracts";
import { fetchRouteData } from "../api";
import { RouteTrajectoryWorkspace } from "./RouteTrajectoryWorkspace";
import { RouteAtlas } from "./RouteAtlas";
import { TrajectorySourcePicker } from "./TrajectorySourcePicker";
import { parseTrajectoryUrlState, reconcileTrajectoryUrlState, serializeTrajectoryUrlState, type TrajectoryUrlState } from "./trajectory-url-state";

export function DataTrajectoryDialog(props: { inventory: RouteDataInventory; generation: number; open: boolean; initialSearch: string; onClose: () => void }) {
  const initial = untrack(() => reconcileTrajectoryUrlState(parseTrajectoryUrlState(props.initialSearch), props.inventory));
  const initiallyOpen = untrack(() => props.open);
  const [state, setState] = createSignal<TrajectoryUrlState>({ ...initial.state, open: initiallyOpen });
  const [notice, setNotice] = createSignal(initial.notice);
  const [transientOpen, setTransientOpen] = createSignal(false);
  let dialog!: HTMLDivElement;
  const selectedRoute = createMemo(() => props.inventory.routes.find((route) => route.key === state().route) ?? null);
  const selectedRouteSources = createMemo(() => props.inventory.sources.filter((source) => selectedRoute()?.sourceMethodKeys.includes(source.key)));
  const detailSelection = createMemo(() => {
    const current = state();
    return current.open && current.mode === "detail" && current.route && current.flow
      ? JSON.stringify([current.route, current.flow, props.generation])
      : null;
  });
  const [detail, { refetch }] = createResource(detailSelection, (key) => {
    const [route, flow, generation] = JSON.parse(key) as [string, string, number];
    return fetchRouteData(route, flow, generation);
  });
  const displayedDetail = createMemo(() => detail.latest?.data ?? detail()?.data ?? null);
  const update = (patch: Partial<TrajectoryUrlState>, push = false) => {
    const next = { ...state(), ...patch };
    setState(next);
    if (typeof window !== "undefined") window.history[push ? "pushState" : "replaceState"]({}, "", `${window.location.pathname}${serializeTrajectoryUrlState(next, window.location.search)}`);
  };
  const selectRoute = (routeKey: string) => {
    const route = props.inventory.routes.find((item) => item.key === routeKey);
    const flow = props.inventory.trajectories.find((item) => item.routeKey === routeKey && item.completeness === "complete-for-supported-scope") ?? props.inventory.trajectories.find((item) => item.routeKey === routeKey);
    update({ mode: "detail", route: routeKey, flow: flow?.key ?? null, source: null, item: null, expand: [], isolate: false, view: "context", pan: null, zoom: null }, true);
  };
  const selectSource = (source: string | null) => update({ source, item: null, expand: [], isolate: false, pan: null, zoom: null }, true);
  const close = () => { update({ open: false }); props.onClose(); };
  createEffect(() => { if (props.open !== state().open) update({ open: props.open }); });
  createEffect(() => {
    const data = displayedDetail(); if (!data) return;
    const validOperations = new Set(data.operations.map((item) => item.key));
    const invalidItem = state().item && !validOperations.has(state().item!);
    const invalidExpand = state().expand.filter((item) => !validOperations.has(item));
    if (invalidItem || invalidExpand.length) { update({ item: invalidItem ? null : state().item, expand: state().expand.filter((item) => validOperations.has(item)) }); setNotice("Some restored operation state no longer exists and was cleared."); }
  });
  onMount(() => {
    const previousOverflow = document.body.style.overflow;
    const keydown = (event: KeyboardEvent) => {
      if (!state().open) return;
      if (event.key === "Tab" && !transientOpen()) {
        const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((item) => !item.closest("[hidden]"));
        const first = focusable[0]; const last = focusable.at(-1);
        if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.key === "Escape") { event.preventDefault(); if (!transientOpen()) close(); }
    };
    document.addEventListener("keydown", keydown);
    createEffect(() => { document.body.style.overflow = state().open ? "hidden" : previousOverflow; if (state().open) queueMicrotask(() => dialog.querySelector<HTMLSelectElement>("select")?.focus()); });
    onCleanup(() => { document.removeEventListener("keydown", keydown); document.body.style.overflow = previousOverflow; });
  });
  return <div ref={dialog} class="data-trajectory-modal" hidden={!state().open} role="dialog" aria-modal="true" aria-labelledby="data-trajectory-title">
    <header class="data-trajectory-header"><div><h2 id="data-trajectory-title">Data trajectories</h2></div><Show when={state().mode === "detail"}><button type="button" class="route-atlas-back" onClick={() => update({ mode: "atlas", item: null, expand: [], isolate: false }, true)}>← Routes</button><label class="trajectory-header-select"><span>Route</span><select aria-label="Selected application route" value={state().route ?? ""} onChange={(event) => selectRoute(event.currentTarget.value)}><For each={props.inventory.routes}>{(route) => <option value={route.key}>{route.pathPattern} · {route.trajectoryCount.toLocaleString()} paths</option>}</For></select></label><TrajectorySourcePicker sources={selectedRouteSources()} selectedKey={state().source} onSelect={selectSource} /><div class="trajectory-view-toggle" role="group" aria-label="Trajectory view"><button type="button" aria-pressed={state().view === "context"} onClick={() => update({ view: "context" })}>All paths</button><button type="button" aria-pressed={state().view === "trajectory"} onClick={() => update({ view: "trajectory" })}>Evidence cards</button></div></Show><button type="button" class="component-modal-close" aria-label="Close data trajectories" onClick={close}>×</button></header>
    <Show when={notice()}><p class="trajectory-restoration-notice" role="status">{notice()}</p></Show>
    <Show when={state().mode === "atlas"}><RouteAtlas inventory={props.inventory} kind={state().kind} sort={state().sort} filter={state().filter} source={state().source} onKind={(kind) => update({ kind })} onSort={(sort) => update({ sort })} onFilter={(filter) => update({ filter })} onSource={(source) => update({ source })} onRoute={selectRoute} /></Show>
    <Show when={state().mode === "detail"}>
    <div class="trajectory-load-status" role="status" aria-live="polite" classList={{ active: detail.loading }}>
      <Show when={detail.loading}><span class="trajectory-loading-dot" aria-hidden="true" /></Show>
      <span>{detail.loading ? displayedDetail() ? `Loading ${selectedRoute()?.pathPattern ?? "route"}… The current view remains available.` : `Loading ${selectedRoute()?.pathPattern ?? "selected route"} trajectory…` : displayedDetail() ? "Trajectory ready" : ""}</span>
    </div>
    <Show when={displayedDetail()} fallback={<Show when={!detail.loading} fallback={<div class="trajectory-loading"><strong>Loading trajectory</strong><p>Requesting route detail and assembling its ordered operations…</p></div>}><div class="trajectory-empty-state"><h3>No trajectory is available</h3><p>{selectedRoute()?.omissions.join(" ") || detail.error?.message || "Choose another route or inspect the route inventory."}</p><Show when={detail.error}><button type="button" onClick={() => void refetch()}>Try again</button></Show></div></Show>}>
      {(data) => <RouteTrajectoryWorkspace detail={data()} state={state()} onState={update} onCloseTransient={setTransientOpen} />}
    </Show>
    </Show>
  </div>;
}
