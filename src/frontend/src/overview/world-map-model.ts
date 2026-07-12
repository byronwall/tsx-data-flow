import type { Workspace } from "../../../api/contracts";

type MapData = Workspace["semanticMap"];
export type MapArea = MapData["areas"][number];
export interface PositionedMapArea extends MapArea { x: number; y: number; role: "source" | "flow" | "terminal"; }

export const GRAPH_WIDTH = 1120;
export const GRAPH_HEIGHT = 620;
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 46;
export const GRAPH_NODE_LIMIT = 36;

export function worldMapLayout(map: MapData): PositionedMapArea[] {
  const perLaneLimit = GRAPH_NODE_LIMIT / 3;
  const trajectoryIds = unique(map.trajectories.flatMap((trajectory) => trajectory.areaIds));
  const edgeIds = unique(map.edges.flatMap((edge) => [edge.from, edge.to]));
  const rankedIds = unique([...trajectoryIds, ...edgeIds, ...map.areas.map((area) => area.id)]);
  const selected = rankedIds.map((id) => map.areas.find((area) => area.id === id)).filter((area): area is MapArea => Boolean(area));
  const byPriority = (left: MapArea, right: MapArea) => connectionVolume(map, right.id) - connectionVolume(map, left.id) || right.worstBurden - left.worstBurden || lexical(left.path, right.path);
  const lanes = {
    source: selected.filter((area) => roleOf(area) === "source").sort(byPriority).slice(0, perLaneLimit),
    flow: selected.filter((area) => roleOf(area) === "flow").sort(byPriority).slice(0, perLaneLimit),
    terminal: selected.filter((area) => roleOf(area) === "terminal").sort(byPriority).slice(0, perLaneLimit),
  };
  return (["source", "flow", "terminal"] as const).flatMap((role, laneIndex) => positionLane(lanes[role], role, laneIndex));
}

export function visibleMapEdges(map: MapData, nodes: PositionedMapArea[], selectedId: string | null) {
  const ids = new Set(nodes.map((node) => node.id));
  return map.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to) && (!selectedId || edge.from === selectedId || edge.to === selectedId));
}

export function mapSubsetLabel(map: MapData, visibleCount: number) {
  return `Showing ${visibleCount} of ${map.areas.length} available areas in this view`;
}

export function folderScopes(map: MapData) {
  const counts = new Map<string, number>();
  for (const area of map.areas) {
    const parts = parentFolder(area.path).split("/");
    for (let depth = 1; depth <= parts.length; depth += 1) { const folder = parts.slice(0, depth).join("/"); counts.set(folder, (counts.get(folder) ?? 0) + 1); }
  }
  return [...counts].map(([path, count]) => ({ path, count })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

export function scopeWorldMap(map: MapData, folder: string | null): MapData {
  if (!folder) return map;
  const directIds = new Set(map.areas.filter((area) => area.path.startsWith(`${folder}/`)).map((area) => area.id));
  const includedIds = new Set(directIds);
  for (const edge of map.edges) if (directIds.has(edge.from) || directIds.has(edge.to)) { includedIds.add(edge.from); includedIds.add(edge.to); }
  return { ...map, areas: map.areas.filter((area) => includedIds.has(area.id)), edges: map.edges.filter((edge) => includedIds.has(edge.from) && includedIds.has(edge.to)), trajectories: map.trajectories.filter((trajectory) => trajectory.areaIds.some((id) => directIds.has(id))) };
}

function positionLane(areas: MapArea[], role: PositionedMapArea["role"], laneIndex: number) {
  const x = 28 + laneIndex * 436;
  const gap = Math.min(72, (GRAPH_HEIGHT - 76) / Math.max(1, areas.length));
  return areas.map((area, index) => ({ ...area, role, x, y: 48 + index * gap }));
}
function roleOf(area: MapArea): PositionedMapArea["role"] {
  if (area.sourceCount > 0 && area.sinkCount === 0) return "source";
  if (area.sourceCount > 0 && area.sinkCount > 0) return "flow";
  return "terminal";
}
function unique(values: string[]) { return [...new Set(values)]; }
function parentFolder(path: string) { const index = path.lastIndexOf("/"); return index > 0 ? path.slice(0, index) : "."; }
function connectionVolume(map: MapData, id: string) { return map.edges.reduce((total, edge) => total + (edge.from === id || edge.to === id ? edge.flowCount : 0), 0); }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
