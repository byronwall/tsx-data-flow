import { For, Show, createMemo, createResource, createSignal, untrack } from "solid-js";
import type { Workspace } from "../../../api/contracts";
import { fetchFilePage } from "../api";
import { WorldMapGraph } from "./WorldMapGraph";
import { FolderScopeTree } from "./FolderScopeTree";
import { folderScopes, scopeWorldMap, worldMapLayout } from "./world-map-model";

type MapData = Workspace["semanticMap"];
type Area = MapData["areas"][number];

export function WorldMap(props: { map: MapData; initialSelectedAreaId?: string | null; loadSourceLines?: (path: string) => Promise<Array<{ number: number; text: string }>> }) {
  const loadSourceLines = untrack(() => props.loadSourceLines);
  const [selectedFolder, setSelectedFolder] = createSignal<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = createSignal<string | null>(untrack(() => props.map.areas.some((area) => area.id === props.initialSelectedAreaId) ? props.initialSelectedAreaId! : null));
  const [selectedTrajectoryId, setSelectedTrajectoryId] = createSignal<string | null>(null);
  const [selectedValue, setSelectedValue] = createSignal<string | null>(null);
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
  return <section class="world-map" aria-labelledby="world-map-title">
    <header class="section-heading"><div><h2 id="world-map-title">Repository world map</h2><p class="meta">Project areas arranged by their role in source-to-TSX trajectories.</p></div><span class="meta">{props.map.areas.length} of {props.map.totals.areas} indexed areas · {props.map.edges.length} of {props.map.totals.edges} indexed connections</span></header>
    <div class="world-map-scopebar"><span class="scopebar-label">Folder scope</span><FolderScopeTree scopes={scopes()} selected={selectedFolder()} total={props.map.areas.length} onSelect={selectFolder} /><Show when={selectedFolder()}>{(folder) => <span class="meta">{folder()} plus directly connected context · {scopedMap().areas.length} available</span>}</Show></div>
    <div class="world-map-workspace">
      <div class="world-map-canvas"><WorldMapGraph map={scopedMap()} selectedId={selectedAreaId()} onSelect={selectArea} onClear={clearSelection} /><Show when={props.map.totals.areas > props.map.areas.length}><p class="map-cap-note">The index contains the first {props.map.areas.length} of {props.map.totals.areas} analyzed areas. Use the complete file table below for paths outside this cap.</p></Show></div>
      <aside class="world-map-inspector" aria-label="Map selection inspector"><Show when={area()} fallback={<InspectorEmpty areaCount={scopedMap().areas.length} />} >{(selected) => <Inspector area={selected()} map={scopedMap()} visibleAreaIds={visibleAreaIds()} sourceLines={selectedSourceLines() ?? []} trajectories={visibleTrajectories()} selectedTrajectoryId={selectedTrajectoryId()} selectedValue={selectedValue()} onClear={clearSelection} onSelectArea={selectArea} onSelectTrajectory={setSelectedTrajectoryId} onSelectValue={setSelectedValue} trajectory={trajectory()} totalTrajectories={props.map.totals.trajectories} />}</Show></aside>
    </div>
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
  return <li><a class="landmark-row" href={props.landmark.location ? `/file?path=${encodeURIComponent(props.landmark.location.path)}#L${props.landmark.location.line}` : undefined}><span class={`type-tag tt-${props.landmark.kind}`}>{props.landmark.kind}</span><code>{props.landmark.label}</code></a><div class="landmark-source-card"><Show when={context().length} fallback={<p class="meta">Loading nearby source…</p>}><pre><For each={context()}>{(line) => <span classList={{ focus: line.number === props.landmark.location?.line }}><b>{line.number}</b><code>{line.text || " "}</code></span>}</For></pre></Show><span>{props.landmark.location ? `${fileName(props.landmark.location.path)}:${props.landmark.location.line}` : "No source location retained"}</span></div></li>;
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
