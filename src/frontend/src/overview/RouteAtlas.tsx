import { For, Show, createMemo } from "solid-js";
import type { RouteDataInventory } from "../../../api/contracts";
import { atlasMaximum, atlasRoutes, type RouteAtlasKind, type RouteAtlasSort } from "./route-atlas-model";

export function RouteAtlas(props: { inventory: RouteDataInventory; kind: RouteAtlasKind; sort: RouteAtlasSort; filter: string | null; source: string | null; onKind: (kind: RouteAtlasKind) => void; onSort: (sort: RouteAtlasSort) => void; onFilter: (filter: string | null) => void; onSource: (source: string | null) => void; onRoute: (route: string) => void }) {
  const routes = createMemo(() => atlasRoutes(props.inventory, props));
  const maximum = createMemo(() => atlasMaximum(routes()));
  const selectedSource = createMemo(() => props.inventory.sources.find((source) => source.key === props.source) ?? null);
  return <main class="route-atlas">
    <header class="route-atlas-intro">
      <div><h3>Route complexity atlas</h3><p>Compare retained source-to-render evidence, then open a route to inspect its trajectories. Gaps flag transitions the analyzer cannot yet prove.</p></div>
      <div class="route-atlas-controls">
        <div class="route-atlas-toggle" role="group" aria-label="Route kind"><For each={["pages", "api", "all"] as const}>{(kind) => <button type="button" aria-pressed={props.kind === kind} onClick={() => props.onKind(kind)}>{kind === "api" ? "API" : `${kind[0].toUpperCase()}${kind.slice(1)}`}</button>}</For></div>
        <input type="search" value={props.filter ?? ""} onInput={(event) => props.onFilter(event.currentTarget.value || null)} placeholder="Filter routes or sources" aria-label="Filter routes or sources" />
      </div>
    </header>
    <Show when={selectedSource()}>{(source) => <div class="route-atlas-source-filter" role="status"><span>Routes using</span><code>{source().label}</code><span>{source().file}:{source().line}</span><button type="button" onClick={() => props.onSource(null)}>Clear</button></div>}</Show>
    <div class="route-atlas-table-wrap">
      <div class="route-atlas-table" role="table" aria-label="Route complexity">
        <div class="route-atlas-row route-atlas-head" role="row">
          <span role="columnheader">Source methods</span><span role="columnheader">Route</span>
          <SortHeader label="Total steps" value="steps" active={props.sort} onSort={props.onSort} />
          <SortHeader label="Paths" value="paths" active={props.sort} onSort={props.onSort} />
          <SortHeader label="Unique" value="unique" active={props.sort} onSort={props.onSort} />
          <SortHeader label="Substitutions" value="substitutions" active={props.sort} onSort={props.onSort} />
          <SortHeader label="Gaps" value="gaps" active={props.sort} onSort={props.onSort} />
        </div>
        <For each={routes()}>{(route) => <div class="route-atlas-row" role="row" classList={{ "source-highlighted": Boolean(props.source && route.sourceMethodKeys.includes(props.source)) }}>
          <div class="route-atlas-sources" role="cell"><For each={route.sourceMethodKeys}>{(key) => { const source = () => props.inventory.sources.find((item) => item.key === key); return <Show when={source()} fallback={<span class="route-source-empty">No source identity</span>}>{(item) => <button type="button" class={`route-source-chip source-${item().kind}`} aria-pressed={props.source === key} title={`${item().file}:${item().line} · ${item().routeKeys.length} routes`} onClick={() => props.onSource(props.source === key ? null : key)}>{item().label}</button>}</Show>; }}</For><Show when={!route.sourceMethodKeys.length}><span class="route-source-empty">No supported source</span></Show></div>
          <div role="cell" class="route-atlas-route-cell"><button type="button" class="route-atlas-route" onClick={() => props.onRoute(route.key)}><code>{route.pathPattern}</code><span>{route.routeKind} · {route.file}</span><Show when={route.apiRouteKeys.length}><small>via {route.apiRouteKeys.length} API route{route.apiRouteKeys.length === 1 ? "" : "s"}</small></Show></button></div>
          <div class="route-atlas-steps" role="cell"><div><span style={{ width: `${Math.max(3, route.totalPathSteps / maximum() * 100)}%` }} /></div><b>{route.totalPathSteps}</b></div>
          <Metric value={route.trajectoryCount} label="paths" /><Metric value={route.uniqueStepCount} label="unique steps" /><Metric value={route.substitutionStepCount} label="substitutions" warning={route.substitutionStepCount > 0} /><Metric value={route.unknownGapCount} label="unknown gaps" warning={route.unknownGapCount > 0} />
        </div>}</For>
        <Show when={!routes().length}><div class="route-atlas-empty">No routes match this scope and filter.</div></Show>
      </div>
    </div>
    <footer class="route-atlas-footer"><span>{routes().length} routes shown</span><span>{props.inventory.totals.sources} concrete source methods</span><span>{props.inventory.totals.trajectories} retained trajectories</span></footer>
  </main>;
}

function SortHeader(props: { label: string; value: RouteAtlasSort; active: RouteAtlasSort; onSort: (sort: RouteAtlasSort) => void }) { return <div role="columnheader"><button type="button" aria-pressed={props.active === props.value} onClick={() => props.onSort(props.value)}>{props.label}<Show when={props.active === props.value}><span aria-hidden="true">↓</span></Show></button></div>; }
function Metric(props: { value: number; label: string; warning?: boolean }) { return <span role="cell" class="route-atlas-metric" classList={{ warning: props.warning }} aria-label={`${props.value} ${props.label}`}>{props.value}</span>; }
