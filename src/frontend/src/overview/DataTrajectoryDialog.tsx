import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, untrack } from "solid-js";
import type { RouteDataInventory } from "../../../api/contracts";
import { fetchRouteData } from "../api";
import { RouteTrajectoryWorkspace } from "./RouteTrajectoryWorkspace";
import { RouteAtlas } from "./RouteAtlas";
import { TrajectorySourcePicker } from "./TrajectorySourcePicker";
import { BROWSER_URL_CHANGE_EVENT, commitBrowserUrl, replaceBrowserUrlSilently } from "./trajectory-history";
import { isTrajectoryHistoryNoiseOnlyChange, normalizeTrajectoryUrlState, parseTrajectoryUrlState, reconcileTrajectoryDetailState, reconcileTrajectoryUrlState, sameTrajectoryUrlState, selectCheapestTrajectoryForRoute, serializeTrajectoryUrlState, type TrajectoryUrlState } from "./trajectory-url-state";

export function DataTrajectoryDialog(props: { inventory: RouteDataInventory; generation: number; open: boolean; initialSearch: string; onClose: () => void }) {
  const initial = untrack(() => reconcileTrajectoryUrlState(parseTrajectoryUrlState(props.initialSearch), props.inventory));
  const initiallyOpen = untrack(() => props.open || initial.state.open);
  const [state, setState] = createSignal<TrajectoryUrlState>(normalizeTrajectoryUrlState({ ...initial.state, open: initiallyOpen }));
  const [notice, setNotice] = createSignal(initial.notice);
  const [transientOpen, setTransientOpen] = createSignal(false);
  let lastUrlOpen = initiallyOpen;
  let seededSearch = props.initialSearch;
  let detailController: AbortController | null = null;
  const detailCache = new Map<string, Awaited<ReturnType<typeof fetchRouteData>>>();
  const detailWarmups = new Map<string, Promise<Awaited<ReturnType<typeof fetchRouteData>>>>();
  let dialog!: HTMLDivElement;
  const selectedRoute = createMemo(() => props.inventory.routes.find((route) => route.key === state().route) ?? null);
  const selectedRouteSources = createMemo(() => props.inventory.sources.filter((source) => selectedRoute()?.sourceMethodKeys.includes(source.key)));
  const detailSelection = createMemo(() => {
    const current = state();
    return current.open && current.mode === "detail" && current.route && current.flow
      ? JSON.stringify([current.route, current.flow, props.generation, current.source])
      : null;
  });
  const [detail, { refetch }] = createResource(detailSelection, (key) => {
    const cached = detailCache.get(key);
    if (cached) return Promise.resolve(cached);
    const warmup = detailWarmups.get(key);
    if (warmup) return warmup;
    detailController?.abort();
    const controller = new AbortController();
    detailController = controller;
    const [route, flow, generation, source] = JSON.parse(key) as [string, string, number, string | null];
    return fetchRouteData(route, flow, generation, source, controller.signal).then((response) => {
      detailCache.set(key, response);
      return response;
    }).finally(() => {
      if (detailController === controller) detailController = null;
    });
  });
  const resolvedDetail = createMemo(() => {
    if (detail.error) return null;
    const response = detail();
    const current = state();
    return response?.generation === props.generation && response.data.route.key === current.route && response.data.trajectory.key === current.flow ? response.data : null;
  });
  const displayedDetail = createMemo(() => {
    const current = state();
    if (detail.error || !current.open || current.mode !== "detail" || !current.route || !current.flow) return null;
    return [detail(), detail.latest].find((response) =>
      response?.generation === props.generation
      && response.data.route.key === current.route
      && response.data.trajectory.key === current.flow,
    )?.data ?? null;
  });
  const sourcePickerSources = createMemo(() => {
    const selectedSource = state().source;
    const loadedSources = displayedDetail()?.sources;
    if (!selectedSource || !loadedSources) return selectedRouteSources();
    const loadedSource = loadedSources.find((source) => source.key === selectedSource);
    return loadedSource
      ? selectedRouteSources().map((source) => source.key === selectedSource ? {
        ...loadedSource,
        typeName: source.typeName,
        typeText: source.typeText,
        fields: loadedSource.fields.map((field) => ({
          ...field,
          typeText: source.fields.find((candidate) => candidate.key === field.key)?.typeText ?? field.typeText,
        })),
      } : source)
      : selectedRouteSources();
  });
  const unprovenFieldPaths = createMemo(() => {
    const current = displayedDetail();
    const sourceKey = state().source;
    const source = current?.sources.find((item) => item.key === sourceKey);
    const fieldLineage = current?.totality?.fieldLineage;
    if (!source || !fieldLineage || !("attachments" in fieldLineage)) return [];
    const proven = new Set(fieldLineage.attachments
      .filter((attachment) => attachment.origin.selectedEvidenceId === source.evidenceId)
      .map((attachment) => attachment.field.label));
    const provenCollections = new Set([...proven]
      .map((field) => field.match(/^(.+)\[\*\]\./)?.[1])
      .filter((field): field is string => Boolean(field)));
    return source.fields.map((field) => field.key)
      .filter((field) => !proven.has(field) && !provenCollections.has(field));
  });
  const visibleDetailError = createMemo(() => (detail.loading ? null : detail.error));
  const applyState = (next: TrajectoryUrlState, push = false, writeHistory = true) => {
    const normalized = normalizeTrajectoryUrlState(next);
    const current = state();
    const changed = !sameTrajectoryUrlState(current, normalized);
    if (!changed) return;
    const noiseOnly = isTrajectoryHistoryNoiseOnlyChange(current, normalized);
    lastUrlOpen = normalized.open;
    setState(normalized);
    if (writeHistory && typeof window !== "undefined") {
      const search = serializeTrajectoryUrlState(normalized, window.location.search);
      if (noiseOnly && !push) replaceBrowserUrlSilently(search);
      else commitBrowserUrl(search, !push);
    }
  };
  const update = (patch: Partial<TrajectoryUrlState>, push = false) => applyState({ ...state(), ...patch }, push);
  const applyUrlState = (search: string) => {
    const restored = reconcileTrajectoryUrlState(parseTrajectoryUrlState(search), props.inventory);
    const next = normalizeTrajectoryUrlState(restored.state);
    setNotice(restored.notice);
    lastUrlOpen = next.open;
    if (!sameTrajectoryUrlState(state(), next)) setState(next);
    const legacyRenderer = new URLSearchParams(search).get("trajectoryRenderer") === "experimental";
    if ((legacyRenderer || !sameTrajectoryUrlState(parseTrajectoryUrlState(search), next)) && typeof window !== "undefined") {
      commitBrowserUrl(serializeTrajectoryUrlState(next, search), true);
    }
  };
  const selectRoute = (routeKey: string) => {
    const flow = selectCheapestTrajectoryForRoute(props.inventory, routeKey);
    update({ mode: "detail", route: routeKey, flow: flow?.key ?? null, source: null, item: null, expand: [], isolate: false, view: "context", pan: null, zoom: null, totalitySelection: null, graphCamera: null, contextFocus: null, fieldFocus: null, consumerFocus: null }, true);
  };
  const selectSource = (source: string | null) => update({ source, item: null, expand: [], isolate: false, pan: null, zoom: null, totalitySelection: null, graphCamera: null, contextFocus: null, fieldFocus: null, consumerFocus: null }, true);
  const selectSourceField = (source: string, fieldFocus: string) => update({ source, item: null, expand: [], isolate: false, pan: null, zoom: null, totalitySelection: null, graphCamera: null, contextFocus: null, fieldFocus, consumerFocus: null }, true);
  const warmSource = (source: string) => {
    const current = state();
    if (!current.open || current.mode !== "detail" || !current.route || !current.flow) return;
    const key = JSON.stringify([current.route, current.flow, props.generation, source]);
    if (detailCache.has(key) || detailWarmups.has(key)) return;
    const request = fetchRouteData(current.route, current.flow, props.generation, source).then((response) => {
      detailCache.set(key, response);
      return response;
    }).finally(() => detailWarmups.delete(key));
    void request.catch(() => {});
    detailWarmups.set(key, request);
  };
  const close = () => { update({ open: false }); props.onClose(); };
  createEffect(() => {
    const open = props.open;
    if (open === state().open || open === lastUrlOpen) return;
    lastUrlOpen = open;
    setState(normalizeTrajectoryUrlState({ ...state(), open }));
  });
  createEffect(() => {
    const inventory = props.inventory;
    const restored = reconcileTrajectoryUrlState(state(), inventory);
    const next = normalizeTrajectoryUrlState(restored.state);
    if (restored.notice) setNotice(restored.notice);
    if (sameTrajectoryUrlState(state(), next)) return;
    applyState(next, false);
  });
  createEffect(() => {
    const data = resolvedDetail(); if (!data) return;
    const restored = reconcileTrajectoryDetailState(state(), data);
    if (restored.notice) setNotice(restored.notice);
    if (!sameTrajectoryUrlState(state(), restored.state)) applyState(restored.state, false);
  });
  createEffect(() => {
    const search = props.initialSearch;
    if (search === seededSearch) return;
    seededSearch = search;
    applyUrlState(search);
  });
  createEffect(() => {
    if (detailSelection() !== null) return;
    detailController?.abort();
    detailController = null;
  });
  onMount(() => {
    const previousOverflow = document.body.style.overflow;
    let wasOpen = false;
    const syncUrl = () => { if (window.location.pathname === "/") applyUrlState(window.location.search); };
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
    window.addEventListener("popstate", syncUrl);
    window.addEventListener(BROWSER_URL_CHANGE_EVENT, syncUrl);
    if (new URLSearchParams(window.location.search).get("trajectoryRenderer") === "experimental") {
      commitBrowserUrl(serializeTrajectoryUrlState(state(), window.location.search), true);
    }
    createEffect(() => {
      const open = state().open;
      document.body.style.overflow = open ? "hidden" : previousOverflow;
      if (open && !wasOpen) queueMicrotask(() => dialog.querySelector<HTMLSelectElement>("select")?.focus());
      wasOpen = open;
    });
    onCleanup(() => { document.removeEventListener("keydown", keydown); window.removeEventListener("popstate", syncUrl); window.removeEventListener(BROWSER_URL_CHANGE_EVENT, syncUrl); document.body.style.overflow = previousOverflow; detailController?.abort(); });
  });
  return <div ref={dialog} class="data-trajectory-modal" hidden={!state().open} role="dialog" aria-modal="true" aria-labelledby="data-trajectory-title">
    <header class="data-trajectory-header"><div><h2 id="data-trajectory-title">Data trajectories</h2></div><Show when={state().mode === "detail"}><button type="button" class="route-atlas-back" onClick={() => update({ mode: "atlas", item: null, expand: [], isolate: false })}>← Routes</button><label class="trajectory-header-select"><span>Route</span><select aria-label="Selected application route" value={state().route ?? ""} onChange={(event) => selectRoute(event.currentTarget.value)}><For each={props.inventory.routes}>{(route) => <option value={route.key}>{route.pathPattern} · {route.trajectoryCount.toLocaleString()} paths</option>}</For></select></label><TrajectorySourcePicker sources={sourcePickerSources()} selectedKey={state().source} selectedFieldPath={state().fieldFocus ?? null} unprovenFieldPaths={unprovenFieldPaths()} onSelect={selectSource} onSelectField={selectSourceField} onWarmSource={warmSource} /><div class="trajectory-view-toggle" role="group" aria-label="Trajectory view"><button type="button" aria-pressed={state().view === "context"} onClick={() => update({ view: "context" })}>All paths</button><button type="button" aria-pressed={state().view === "trajectory"} onClick={() => update({ view: "trajectory" })}>Evidence cards</button></div></Show><button type="button" class="component-modal-close" aria-label="Close data trajectories" onClick={close}>×</button></header>
    <Show when={notice()}><p class="trajectory-restoration-notice" role="status">{notice()}</p></Show>
    <Show when={state().mode === "atlas"}><RouteAtlas inventory={props.inventory} kind={state().kind} sort={state().sort} filter={state().filter} source={state().source} onKind={(kind) => update({ kind })} onSort={(sort) => update({ sort })} onFilter={(filter) => update({ filter })} onSource={selectSource} onRoute={selectRoute} /></Show>
    <Show when={state().mode === "detail"}>
    <div class="trajectory-load-status" role="status" aria-live="polite" classList={{ active: detail.loading }}>
      <Show when={detail.loading}><span class="trajectory-loading-dot" aria-hidden="true" /></Show>
      <span>{detail.loading ? displayedDetail() ? `Loading ${selectedRoute()?.pathPattern ?? "route"}… The current view remains available.` : `Loading ${selectedRoute()?.pathPattern ?? "selected route"} trajectory…` : displayedDetail() ? "Trajectory ready" : ""}</span>
    </div>
    <Show when={visibleDetailError()}><p class="error" role="alert">{visibleDetailError()?.message ?? "Unable to load the selected trajectory."}</p></Show>
    <Show when={displayedDetail()} fallback={<Show when={!detail.loading} fallback={<div class="trajectory-loading"><strong>Loading trajectory</strong><p>Requesting route detail and assembling its ordered operations…</p></div>}><div class="trajectory-empty-state"><h3>No trajectory is available</h3><p>{selectedRoute()?.omissions.join(" ") || "Choose another route or inspect the route inventory."}</p><Show when={visibleDetailError()}><button type="button" onClick={() => void refetch()}>Try again</button></Show></div></Show>}>
      {(data) => <RouteTrajectoryWorkspace detail={data()} generation={props.generation} state={state()} onState={update} onCloseTransient={setTransientOpen} />}
    </Show>
    </Show>
  </div>;
}
