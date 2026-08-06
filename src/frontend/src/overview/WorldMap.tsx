import { For, Show, createEffect, createMemo, createResource, createSignal, createUniqueId, onCleanup, onMount, untrack } from "solid-js";
import { Portal } from "solid-js/web";
import type { Workspace } from "../../../api/contracts";
import { fetchFilePage } from "../api";
import { WorldMapGraph } from "./WorldMapGraph";
import { FolderScopeTree } from "./FolderScopeTree";
import { ComponentStructureMap } from "./ComponentStructureMap";
import { DataTrajectoryDialog } from "./DataTrajectoryDialog";
import { BROWSER_URL_CHANGE_EVENT, commitBrowserUrl } from "./trajectory-history";
import { parseTrajectoryUrlState, serializeTrajectoryUrlState } from "./trajectory-url-state";
import { folderScopes, scopeWorldMap, worldMapLayout } from "./world-map-model";

type MapData = Workspace["semanticMap"];
type Area = MapData["areas"][number];

export function WorldMap(props: { map: MapData; routeData?: Workspace["routeData"]; generation?: number; initialSearch?: string; initialSelectedAreaId?: string | null; loadSourceLines?: (path: string) => Promise<Array<{ number: number; text: string }>> }) {
  const loadSourceLines = untrack(() => props.loadSourceLines);
  const [selectedFolder, setSelectedFolder] = createSignal<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = createSignal<string | null>(untrack(() => props.map.areas.some((area) => area.id === props.initialSelectedAreaId) ? props.initialSelectedAreaId! : null));
  const [selectedTrajectoryId, setSelectedTrajectoryId] = createSignal<string | null>(null);
  const [selectedValue, setSelectedValue] = createSignal<string | null>(null);
  const [componentMapOpen, setComponentMapOpen] = createSignal(false);
  const [trajectoryOpen, setTrajectoryOpen] = createSignal(untrack(() => parseTrajectoryUrlState(props.initialSearch ?? "").open));
  let componentMapTrigger!: HTMLButtonElement;
  let trajectoryTrigger!: HTMLButtonElement;
  let componentMapDialog!: HTMLDivElement;
  const scopes = createMemo(() => folderScopes(props.map));
  const scopedMap = createMemo(() => scopeWorldMap(props.map, selectedFolder()));
  const area = createMemo(() => scopedMap().areas.find((item) => item.id === selectedAreaId()) ?? null);
  const visibleAreaIds = createMemo(() => new Set(worldMapLayout(scopedMap()).map((item) => item.id)));
  const [selectedSourceLines] = createResource(() => area()?.path ?? null, async (path) => path ? loadSourceLines ? loadSourceLines(path) : (await fetchFilePage(path)).data.file.lines : []);
  const areaTrajectories = createMemo(() => scopedMap().trajectories.filter((item) => !area() || item.areaIds.includes(area()!.id)));
  const trajectory = createMemo(() => scopedMap().trajectories.find((item) => item.id === selectedTrajectoryId()) ?? null);
  const visibleTrajectories = createMemo(() => areaTrajectories().filter((item) => !selectedValue() || item.sourceLabels.includes(selectedValue()!)));
  const clearSelection = () => { setSelectedAreaId(null); setSelectedTrajectoryId(null); setSelectedValue(null); };
  const selectArea = (id: string) => { if (selectedAreaId() === id) { clearSelection(); return; } setSelectedAreaId(id); setSelectedTrajectoryId(null); setSelectedValue(null); };
  const selectFolder = (folder: string) => { setSelectedFolder(folder || null); clearSelection(); };
  const openComponentMap = () => { setComponentMapOpen(true); queueMicrotask(() => componentMapDialog.querySelector<HTMLButtonElement>(".component-modal-close")?.focus()); };
  const closeComponentMap = () => { setComponentMapOpen(false); queueMicrotask(() => componentMapTrigger.focus()); };
  const openTrajectory = () => {
    const search = typeof window === "undefined" ? props.initialSearch ?? "" : window.location.search;
    const current = parseTrajectoryUrlState(search);
    if (!current.open) commitBrowserUrl(serializeTrajectoryUrlState({ ...current, open: true }, search), false);
    setTrajectoryOpen(true);
  };
  onMount(() => {
    const previousOverflow = document.body.style.overflow;
    const syncTrajectoryOpen = () => { if (window.location.pathname === "/") setTrajectoryOpen(parseTrajectoryUrlState(window.location.search).open); };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && componentMapOpen()) closeComponentMap(); };
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("popstate", syncTrajectoryOpen);
    window.addEventListener(BROWSER_URL_CHANGE_EVENT, syncTrajectoryOpen);
    createEffect(() => { document.body.style.overflow = componentMapOpen() ? "hidden" : previousOverflow; });
    onCleanup(() => { document.removeEventListener("keydown", handleKeyDown); window.removeEventListener("popstate", syncTrajectoryOpen); window.removeEventListener(BROWSER_URL_CHANGE_EVENT, syncTrajectoryOpen); document.body.style.overflow = previousOverflow; });
  });
  return <section class="world-map" aria-labelledby="world-map-title">
    <header class="section-heading"><div><h2 id="world-map-title">Repository world map</h2><p class="meta">Traced source-to-TSX data flow, with component hierarchy available as a full-screen map.</p></div><span class="meta">{props.map.components.totals.nodes} components · {props.map.areas.length} of {props.map.totals.areas} indexed files</span></header>
    <div class="world-map-lenses" role="group" aria-label="World map view"><button ref={componentMapTrigger} type="button" aria-haspopup="dialog" onClick={openComponentMap}>Component structure</button><Show when={props.routeData}><button ref={trajectoryTrigger} type="button" aria-haspopup="dialog" onClick={openTrajectory}>Data trajectories</button></Show><button type="button" aria-pressed="true">Data flow</button></div>
    <div class="world-map-scopebar"><span class="scopebar-label">Folder scope</span><FolderScopeTree scopes={scopes()} selected={selectedFolder()} total={props.map.areas.length} onSelect={selectFolder} /><Show when={selectedFolder()}>{(folder) => <span class="meta">{folder()} plus directly connected context · {scopedMap().areas.length} available</span>}</Show></div><div class="world-map-workspace">
      <div class="world-map-canvas"><WorldMapGraph map={scopedMap()} selectedId={selectedAreaId()} onSelect={selectArea} onClear={clearSelection} /><Show when={props.map.totals.areas > props.map.areas.length}><p class="map-cap-note">The index contains the first {props.map.areas.length} of {props.map.totals.areas} analyzed areas. Use the complete file table below for paths outside this cap.</p></Show></div>
      <aside class="world-map-inspector" aria-label="Map selection inspector"><Show when={area()} fallback={<InspectorEmpty areaCount={scopedMap().areas.length} />} >{(selected) => <Inspector area={selected()} map={scopedMap()} visibleAreaIds={visibleAreaIds()} sourceLines={selectedSourceLines() ?? []} trajectories={visibleTrajectories()} selectedTrajectoryId={selectedTrajectoryId()} selectedValue={selectedValue()} onClear={clearSelection} onSelectArea={selectArea} onSelectTrajectory={setSelectedTrajectoryId} onSelectValue={setSelectedValue} trajectory={trajectory()} totalTrajectories={props.map.totals.trajectories} />}</Show></aside>
    </div>
    <div ref={componentMapDialog} class="component-modal" hidden={!componentMapOpen()} role="dialog" aria-modal="true" aria-labelledby="component-modal-title">
      <header class="component-modal-header"><h2 id="component-modal-title">Component structure</h2><span>{props.map.components.nodes.length} of {props.map.components.totals.nodes} components · arranged by render depth</span><button type="button" class="component-modal-close" aria-label="Close component structure" onClick={closeComponentMap}>×</button></header>
      <ComponentStructureMap components={props.map.components} active={componentMapOpen()} />
    </div>
    <Show when={props.routeData}>{(inventory) => <DataTrajectoryDialog inventory={inventory()} generation={props.generation ?? 0} open={trajectoryOpen()} initialSearch={props.initialSearch ?? ""} onClose={() => { setTrajectoryOpen(false); queueMicrotask(() => trajectoryTrigger?.focus()); }} />}</Show>
  </section>;
}

function InspectorEmpty(props: { areaCount: number }) { return <div class="inspector-empty"><span class="micro-label">Selection inspector</span><strong>Select an area in the network</strong><p>{props.areaCount} areas are available in the current folder scope. Click empty map space to clear a selection.</p></div>; }

function Inspector(props: { area: Area; map: MapData; visibleAreaIds: Set<string>; sourceLines: Array<{ number: number; text: string }>; trajectories: MapData["trajectories"]; selectedTrajectoryId: string | null; selectedValue: string | null; onClear: () => void; onSelectArea: (id: string) => void; onSelectTrajectory: (id: string) => void; onSelectValue: (value: string | null) => void; trajectory: MapData["trajectories"][number] | null; totalTrajectories: number }) {
  const path = () => splitPath(props.area.path);
  return <div class="inspector-content"><header class="inspector-header"><div title={props.area.path}><span class="inspector-directory mono">{path().directory}</span><a class="inspector-filename mono" href={`/file?path=${encodeURIComponent(props.area.path)}`} title={`Open ${props.area.path}`}>{path().name}</a></div><button type="button" class="inspector-close" aria-label="Clear map selection" onClick={() => props.onClear()}>×</button></header>
    <dl class="map-area-facts"><div><dt>Inputs</dt><dd>{props.area.sourceCount}</dd></div><div><dt>TSX</dt><dd>{props.area.sinkCount}</dd></div><div><dt>Findings</dt><dd>{props.area.findingCount}</dd></div><div><dt>Boundaries</dt><dd>{props.area.boundaryCount}</dd></div><div><dt>Opaque</dt><dd>{props.area.unknownCount}</dd></div></dl>
    <AreaConnections map={props.map} area={props.area} visibleAreaIds={props.visibleAreaIds} onSelect={props.onSelectArea} />
    <Show when={props.area.landmarks.length}><section class="inspector-section"><h3>Representative landmarks <span>{props.area.landmarks.length} shown</span></h3><p class="inspector-section-note">Upstream definitions, crossed boundaries, and TSX outputs retained for orientation. Hover or focus a row for nearby source; click to open the exact line.</p><ul class="landmark-list"><For each={props.area.landmarks}>{(landmark) => <LandmarkRow landmark={landmark} sourceLines={props.sourceLines} />}</For></ul></section></Show>
    <ValueFilters trajectories={props.trajectories} selected={props.selectedValue} onSelect={props.onSelectValue} />
    <section class="inspector-section trajectory-list"><h3>Representative trajectories <span>{props.trajectories.length} here · {props.totalTrajectories} repository-wide</span></h3><p class="inspector-section-note">The strongest retained path for each indexed area, then highest burden, capped at {props.map.caps.trajectories} repository-wide.</p><For each={props.trajectories}>{(item) => <button type="button" class="trajectory-row" classList={{ selected: props.selectedTrajectoryId === item.id }} onClick={() => props.onSelectTrajectory(item.id)}><span class="mono">{item.label}</span><span class="meta">{item.depth} steps · {item.burden.toFixed(2)} · {item.traceComplete ? "traced" : "incomplete"}</span></button>}</For><Show when={!props.trajectories.length}><p class="meta">No retained representative trajectory crosses this area. The connection list above still shows its cross-file relationships.</p></Show></section>
    <Show when={props.trajectory}>{(item) => <TrajectoryDetail map={props.map} trajectory={item()} />}</Show>
  </div>;
}

function AreaConnections(props: { map: MapData; area: Area; visibleAreaIds: Set<string>; onSelect: (id: string) => void }) {
  const all = createMemo(() => props.map.edges.filter((edge) => edge.from === props.area.id || edge.to === props.area.id));
  const visibleCount = createMemo(() => all().filter((edge) => props.visibleAreaIds.has(edge.from === props.area.id ? edge.to : edge.from)).length);
  return <section class="inspector-section"><h3>Connections <span>{visibleCount()} on map · {all().length - visibleCount()} off map</span></h3><Show when={all().length} fallback={<p class="inspector-section-note">No cross-file relationship was retained for this area. Its input and TSX counts are local landmarks, not connection counts.</p>}><div class="map-connections"><For each={all().slice(0, 12)}>{(edge) => { const outgoing = edge.from === props.area.id; const otherId = outgoing ? edge.to : edge.from; const other = () => props.map.areas.find((area) => area.id === otherId); const visible = () => props.visibleAreaIds.has(otherId); return <Show when={visible()} fallback={<a class="off-map" href={`/file?path=${encodeURIComponent(other()?.path ?? otherId.replace(/^area:/, ""))}`} title="Outside the current 36-node drawing; open its file"><span aria-hidden="true">{outgoing ? "→" : "←"}</span><span class="mono">{other()?.label ?? otherId}</span><span class="connection-status">off map · {edge.flowCount}</span></a>}><button type="button" onClick={() => props.onSelect(otherId)} title={`${edge.flowCount} indexed flows${edge.unknownCount ? `, ${edge.unknownCount} incomplete` : ""}`}><span aria-hidden="true">{outgoing ? "→" : "←"}</span><span class="mono">{other()?.label ?? otherId}</span><span class="connection-status">on map · {edge.flowCount}</span></button></Show>; }}</For></div></Show></section>;
}

function LandmarkRow(props: { landmark: Area["landmarks"][number]; sourceLines: Array<{ number: number; text: string }> }) {
  const context = createMemo(() => { const line = props.landmark.location?.line; return line ? props.sourceLines.filter((item) => item.number >= line - 2 && item.number <= line + 2) : []; });
  const cardId = `landmark-source-${createUniqueId()}`;
  const [active, setActive] = createSignal(false);
  const [position, setPosition] = createSignal({ top: 0, left: 0, width: 0 });
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTimers = () => { if (openTimer) clearTimeout(openTimer); if (closeTimer) clearTimeout(closeTimer); };
  const placeCard = (trigger: HTMLElement) => {
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    if (window.innerWidth <= 980) {
      setPosition({ top: rect.bottom + 3, left: viewportPadding, width: Math.max(0, window.innerWidth - viewportPadding * 2) });
      return;
    }
    const width = Math.min(560, Math.max(240, rect.left - viewportPadding * 2));
    setPosition({ top: Math.max(viewportPadding, rect.top), left: Math.max(viewportPadding, rect.left - width - 8), width });
  };
  const showCard = (trigger: HTMLElement, delayed: boolean) => {
    clearTimers();
    placeCard(trigger);
    if (delayed) openTimer = setTimeout(() => setActive(true), 450);
    else setActive(true);
  };
  const keepCardOpen = () => { if (closeTimer) clearTimeout(closeTimer); };
  const hideCard = () => { if (openTimer) clearTimeout(openTimer); closeTimer = setTimeout(() => setActive(false), 80); };
  onCleanup(clearTimers);
  return <li><a class="landmark-row" aria-describedby={cardId} href={props.landmark.location ? `/file?path=${encodeURIComponent(props.landmark.location.path)}#L${props.landmark.location.line}` : undefined} onPointerEnter={(event) => showCard(event.currentTarget, true)} onPointerLeave={hideCard} onFocus={(event) => showCard(event.currentTarget, false)} onBlur={hideCard}><span class={`type-tag tt-${props.landmark.kind}`}>{props.landmark.kind}</span><code>{props.landmark.label}</code></a><Portal><div id={cardId} role="tooltip" class="landmark-source-card" classList={{ active: active() }} style={{ top: `${position().top}px`, left: `${position().left}px`, width: `${position().width}px` }} onPointerEnter={keepCardOpen} onPointerLeave={hideCard}><Show when={context().length} fallback={<p class="meta">Loading nearby source…</p>}><pre><For each={context()}>{(line) => <span classList={{ focus: line.number === props.landmark.location?.line }}><b>{line.number}</b><code>{line.text || " "}</code></span>}</For></pre></Show><span>{props.landmark.location ? `${fileName(props.landmark.location.path)}:${props.landmark.location.line}` : "No source location retained"}</span></div></Portal></li>;
}

function ValueFilters(props: { trajectories: MapData["trajectories"]; selected: string | null; onSelect: (value: string | null) => void }) {
  const values = createMemo(() => traceInputValues(props.trajectories));
  return <Show when={values().length}><section class="inspector-section"><h3>Filter trajectories by input <span>{values().length} actionable inputs</span></h3><p class="inspector-section-note">Limits the trajectory list below; it does not rearrange the network.</p><div class="map-value-filters"><button type="button" aria-pressed={!props.selected} onClick={() => props.onSelect(null)}>All inputs</button><For each={values()}>{(value) => <button type="button" class="mono" aria-pressed={props.selected === value} title={value} onClick={() => props.onSelect(value)}>{value}</button>}</For></div><Show when={props.selected}><p class="active-filter-note">Showing trajectories that include <code>{props.selected}</code>.</p></Show></section></Show>;
}

function TrajectoryDetail(props: { map: MapData; trajectory: MapData["trajectories"][number] }) {
  const areas = () => props.trajectory.areaIds.map((id) => props.map.areas.find((area) => area.id === id)).filter((area): area is Area => Boolean(area));
  return <section class="trajectory-detail" aria-label="Selected trajectory"><div class="trajectory-chain"><For each={areas()}>{(area, index) => <><span class="mono">{area.label}</span><Show when={index() < areas().length - 1}><span aria-hidden="true">→</span></Show></>}</For></div><div class="trajectory-sources"><span class="micro-label">Trace inputs</span><For each={props.trajectory.sourceLabels}>{(label) => <code>{label}</code>}</For></div><a class="btn" href={`/file?path=${encodeURIComponent(props.trajectory.terminal.path)}&finding=${encodeURIComponent(props.trajectory.id)}#L${props.trajectory.terminal.line}`}>Open responsible source</a></section>;
}
function splitPath(path: string) { const index = path.lastIndexOf("/"); return index < 0 ? { directory: "", name: path } : { directory: path.slice(0, index + 1), name: path.slice(index + 1) }; }
function fileName(path: string) { return path.split("/").at(-1) ?? path; }
function traceInputValues(trajectories: MapData["trajectories"]) { return [...new Set(trajectories.flatMap((item) => item.sourceLabels).map((value) => value.trim()).filter((value) => value && !/^(["']).*\1$/.test(value) && !/^(?:true|false|null|undefined|NaN|Infinity|-?\d+(?:\.\d+)?)$/.test(value)))].slice(0, 12); }
