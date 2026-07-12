import type { AnalysisReport, GraphNode, RankedSink, WorkUnit } from "../../types";

const CAPS = { areas: 400, edges: 800, trajectories: 400, cleanup: 40 } as const;

export function buildSemanticMap(report: AnalysisReport, focusPath?: string) {
  const ranked = report.rankings.all as RankedSink[];
  const areaByNode = new Map<string, string>();
  const areaRows = new Map<string, ReturnType<typeof emptyArea>>();

  for (const node of report.graph.nodes) {
    if (!node.file) continue;
    const id = areaId(node.file);
    areaByNode.set(node.id, id);
    const area = areaRows.get(id) ?? emptyArea(id, node.file);
    if (isSource(node)) area.sourceCount += 1;
    if (isTerminal(node)) area.sinkCount += 1;
    const landmark = landmarkOf(node);
    if (landmark && area.landmarks.length < 8 && !area.landmarks.some((item) => item.kind === landmark.kind && item.label === landmark.label)) area.landmarks.push(landmark);
    areaRows.set(id, area);
  }
  for (const sink of ranked) {
    const id = areaId(sink.file);
    const area = areaRows.get(id) ?? emptyArea(id, sink.file);
    area.findingCount += 1;
    area.worstBurden = Math.max(area.worstBurden, sink.scores.burden);
    areaRows.set(id, area);
    for (const root of sink.rootInfos) {
      if (!root.def?.file) continue;
      const sourceId = areaId(root.def.file);
      const sourceArea = areaRows.get(sourceId) ?? emptyArea(sourceId, root.def.file);
      sourceArea.sourceCount += 1;
      if (sourceArea.landmarks.length < 8 && !sourceArea.landmarks.some((item) => item.kind === "source" && item.label === root.label)) sourceArea.landmarks.push({ kind: "source", label: root.label, location: { path: root.def.file, line: root.def.line } });
      areaRows.set(sourceId, sourceArea);
    }
    for (const identity of [sink.identity, ...(sink.traceIdentities ?? [])]) {
      const definition = identity?.definition;
      if (!definition?.file || definition.file === sink.file) continue;
      const focusText = identity?.focusText ?? "project value";
      const sourceId = areaId(definition.file);
      const sourceArea = areaRows.get(sourceId) ?? emptyArea(sourceId, definition.file);
      sourceArea.sourceCount += 1;
      if (sourceArea.landmarks.length < 8 && !sourceArea.landmarks.some((item) => item.kind === "source" && item.label === focusText)) sourceArea.landmarks.push({ kind: "source", label: focusText, location: { path: definition.file, line: definition.line } });
      areaRows.set(sourceId, sourceArea);
    }
  }
  for (const row of report.helpers ?? []) {
    const id = areaId(row.file);
    const area = areaRows.get(id) ?? emptyArea(id, row.file);
    area.boundaryCount += 1;
    areaRows.set(id, area);
  }
  for (const row of report.unknownEdges ?? []) {
    const id = areaId(row.file);
    const area = areaRows.get(id) ?? emptyArea(id, row.file);
    area.unknownCount += row.occurrences;
    areaRows.set(id, area);
  }

  const nodeById = new Map(report.graph.nodes.map((node) => [node.id, node]));
  const allTrajectories = ranked.map((sink) => trajectoryOf(sink, areaByNode, nodeById));
  const allAreas = [...areaRows.values()].sort(areaSort);
  const focusId = focusPath ? areaId(focusPath) : null;
  const keptAreas = selectAreas(allAreas, allTrajectories, CAPS.areas, focusId);
  const kept = new Set(keptAreas.map((area) => area.id));
  const edgeRows = new Map<string, { id: string; from: string; to: string; flowCount: number; unknownCount: number; kinds: Set<string> }>();
  for (const edge of report.graph.edges) {
    const from = areaByNode.get(edge.from); const to = areaByNode.get(edge.to);
    if (!from || !to || from === to || !kept.has(from) || !kept.has(to)) continue;
    const key = `${from}->${to}`;
    const row = edgeRows.get(key) ?? { id: `map-edge:${key}`, from, to, flowCount: 0, unknownCount: 0, kinds: new Set<string>() };
    row.flowCount += 1; if (edge.unknown) row.unknownCount += 1; row.kinds.add(edge.kind);
    edgeRows.set(key, row);
  }
  for (const trajectory of allTrajectories) {
    const to = trajectory.areaIds.at(-1);
    if (!to) continue;
    for (const from of new Set(trajectory.areaIds.slice(0, -1))) {
      if (from === to || !kept.has(from) || !kept.has(to)) continue;
      const key = `${from}->${to}`;
      const row = edgeRows.get(key) ?? { id: `map-edge:${key}`, from, to, flowCount: 0, unknownCount: 0, kinds: new Set<string>() };
      row.flowCount += 1; if (!trajectory.traceComplete) row.unknownCount += 1; row.kinds.add("trajectory");
      edgeRows.set(key, row);
    }
  }
  const allEdges = [...edgeRows.values()].sort((a, b) => Number(Boolean(focusId && (b.from === focusId || b.to === focusId))) - Number(Boolean(focusId && (a.from === focusId || a.to === focusId))) || b.flowCount - a.flowCount || lexical(a.id, b.id));
  const edges = selectRepresentativeEdges(allEdges, keptAreas.map((area) => area.id), CAPS.edges, focusId);
  const trajectories = selectRepresentativeTrajectories(allTrajectories, keptAreas.map((area) => area.id), CAPS.trajectories, focusId);
  const cleanup = (report.workUnits as WorkUnit[]).map(cleanupOf).slice(0, CAPS.cleanup);
  return {
    areas: keptAreas,
    edges: edges.map((edge) => ({ ...edge, kinds: [...edge.kinds].sort(lexical) })),
    trajectories,
    cleanup,
    totals: { areas: allAreas.length, edges: allEdges.length, trajectories: ranked.length, cleanupOpportunities: report.workUnits.length },
    caps: CAPS,
  };
}

export function selectRepresentativeEdges<T extends { id: string; from: string; to: string; flowCount: number }>(edges: T[], areaIds: string[], cap: number, focusId: string | null) {
  const selected: T[] = []; const seen = new Set<string>();
  const add = (edge: T | undefined) => { if (edge && selected.length < cap && !seen.has(edge.id)) { selected.push(edge); seen.add(edge.id); } };
  if (focusId) for (const edge of edges) if (edge.from === focusId || edge.to === focusId) add(edge);
  const strongestByArea = new Map<string, T>();
  for (const edge of edges) {
    if (!strongestByArea.has(edge.from)) strongestByArea.set(edge.from, edge);
    if (!strongestByArea.has(edge.to)) strongestByArea.set(edge.to, edge);
  }
  for (const id of areaIds) add(strongestByArea.get(id));
  for (const edge of edges) add(edge);
  return selected.sort((a, b) => b.flowCount - a.flowCount || lexical(a.id, b.id));
}

export function selectRepresentativeTrajectories<T extends { id: string; areaIds: string[]; burden: number }>(trajectories: T[], areaIds: string[], cap: number, focusId: string | null) {
  const ordered = [...trajectories].sort((a, b) => Number(Boolean(focusId && b.areaIds.includes(focusId))) - Number(Boolean(focusId && a.areaIds.includes(focusId))) || b.burden - a.burden || lexical(a.id, b.id));
  const selected: T[] = []; const seen = new Set<string>(); const representativeByArea = new Map<string, T>();
  const add = (trajectory: T | undefined) => { if (trajectory && selected.length < cap && !seen.has(trajectory.id)) { selected.push(trajectory); seen.add(trajectory.id); } };
  for (const trajectory of ordered) for (const id of trajectory.areaIds) if (!representativeByArea.has(id)) representativeByArea.set(id, trajectory);
  if (focusId) add(representativeByArea.get(focusId));
  for (const id of areaIds) add(representativeByArea.get(id));
  for (const trajectory of ordered) add(trajectory);
  return selected.sort((a, b) => b.burden - a.burden || lexical(a.id, b.id));
}

function emptyArea(id: string, path: string) { return { id, label: areaLabel(path), path, sourceCount: 0, sinkCount: 0, findingCount: 0, worstBurden: 0, boundaryCount: 0, unknownCount: 0, landmarks: [] as Array<{ kind: "boundary" | "context" | "source" | "terminal" | "opaque"; label: string; location: { path: string; line: number } | null }> }; }
export function semanticAreaId(path: string) { return `area:${path}`; }
const areaId = semanticAreaId;
function areaLabel(path: string) { return path.split("/").at(-1) ?? path; }
function isSource(node: GraphNode) { return node.kind === "source" || node.kind.includes("root"); }
function isTerminal(node: GraphNode) { return Boolean(node.terminalId) || node.kind.includes("sink") || node.kind.includes("jsx"); }
function landmarkOf(node: GraphNode) {
  const location = node.file && node.location ? { path: node.file, line: node.location.line } : null;
  const label = node.label.length > 80 ? `${node.label.slice(0, 77)}…` : node.label;
  if (node.boundaryId || node.kind.includes("boundary")) return { kind: "boundary" as const, label, location };
  if (/context|provider|useContext/i.test(node.label)) return { kind: "context" as const, label, location };
  if (isTerminal(node)) return { kind: "terminal" as const, label, location };
  if (isSource(node)) return { kind: "source" as const, label, location };
  return null;
}
function trajectoryOf(sink: RankedSink, areaByNode: Map<string, string>, nodeById: Map<string, GraphNode>) {
  const areaIds: string[] = [];
  for (const root of sink.rootInfos) {
    if (!root.def?.file) continue;
    const id = areaId(root.def.file); if (!areaIds.includes(id)) areaIds.push(id);
  }
  for (const identity of [sink.identity, ...(sink.traceIdentities ?? [])]) {
    const file = identity?.definition?.file;
    if (!file || file === sink.file) continue;
    const id = areaId(file); if (!areaIds.includes(id)) areaIds.push(id);
  }
  for (const step of sink.representativeSteps) {
    const node = step.graphNodeId ? nodeById.get(step.graphNodeId) : undefined;
    const id = node ? areaByNode.get(node.id) : step.file ? areaId(step.file) : undefined;
    if (id && areaIds.at(-1) !== id) areaIds.push(id);
  }
  const terminalArea = areaId(sink.file); if (areaIds.at(-1) !== terminalArea) areaIds.push(terminalArea);
  return { id: sink.id, label: sink.label, sourceLabels: sink.rootInfos.map((root) => root.label).slice(0, 6), areaIds, terminal: { path: sink.file, line: sink.line }, burden: sink.scores.burden, depth: sink.metrics.maximumPathDepth, traceComplete: !sink.identity || sink.identity.traceComplete };
}
function cleanupOf(unit: WorkUnit) {
  const members = unit.unit.members.map((member) => ({ path: unit.file, line: member.line }));
  return { id: unit.id, label: unit.label, location: { path: unit.file, line: unit.line }, burden: unit.scores.burden, sinkCount: unit.unit.sinkCount, fileCount: new Set(members.map((item) => item.path)).size, pivots: unit.unit.pivots, causes: unit.unit.causes, shape: unit.unit.shape, evidenceLevel: unit.identity?.evidenceLevel ?? "suspicious-transformation", recommendation: String(unit.advice?.firstCut ?? unit.advice?.headline ?? "Inspect the shared upstream cause."), memberLocations: members };
}
function areaSort(a: ReturnType<typeof emptyArea>, b: ReturnType<typeof emptyArea>) { return b.findingCount - a.findingCount || b.sinkCount - a.sinkCount || b.sourceCount - a.sourceCount || lexical(a.path, b.path); }
function selectAreas<T extends ReturnType<typeof emptyArea>>(areas: T[], trajectories: ReturnType<typeof trajectoryOf>[], cap: number, focusId: string | null) {
  const byId = new Map(areas.map((area) => [area.id, area]));
  const selected: T[] = []; const seen = new Set<string>();
  const add = (id: string) => { const area = byId.get(id); if (area && !seen.has(id) && selected.length < cap) { selected.push(area as T); seen.add(id); } };
  if (focusId) add(focusId);
  const orderedTrajectories = [...trajectories].sort((a, b) => Number(Boolean(focusId && b.areaIds.includes(focusId))) - Number(Boolean(focusId && a.areaIds.includes(focusId))) || b.burden - a.burden || lexical(a.id, b.id));
  for (const trajectory of orderedTrajectories.slice(0, CAPS.trajectories)) for (const id of trajectory.areaIds) add(id);
  const sourceBearing = areas.filter((area) => area.sourceCount > 0).sort(areaSort);
  const terminalBearing = areas.filter((area) => area.sinkCount > 0).sort(areaSort);
  for (let index = 0; selected.length < cap && (index < sourceBearing.length || index < terminalBearing.length); index += 1) {
    if (sourceBearing[index]) add(sourceBearing[index].id);
    if (terminalBearing[index]) add(terminalBearing[index].id);
  }
  for (const area of areas) add(area.id);
  return selected.sort(areaSort);
}
function lexical(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
