import path from "node:path";
import type { AnalysisReport, ExpressionIdentityEvidence, RootInfo, Sink } from "../../types";
import { fanOutEntriesForFile } from "../../reports/overview-selectors";
import { REPORT_VIEWS, reportViewLabel } from "../report-views";
import { filePageSchema, type FilePage, type InventoryEntry, type FindingDetail } from "../contracts";
import { buildSemanticMap, semanticAreaId } from "./semantic-map";

type ResolveSource = (path: string) => string | null;

export function buildFilePageDto(report: AnalysisReport, fullReport: AnalysisReport, relPath: string, source: string, resolveSource: ResolveSource, fileIdentities: ExpressionIdentityEvidence[] = []): FilePage {
  const semanticMap = buildSemanticMap(fullReport, relPath);
  const focusAreaId = semanticAreaId(relPath);
  const mapAreaById = new Map(semanticMap.areas.map((area) => [area.id, area]));
  const focusArea = mapAreaById.get(focusAreaId) ?? { id: focusAreaId, label: path.basename(relPath), path: relPath, sourceCount: 0, sinkCount: 0, findingCount: 0, worstBurden: 0, boundaryCount: 0, unknownCount: 0, landmarks: [] };
  const connection = (edge: typeof semanticMap.edges[number], otherId: string) => {
    const graphKinds = edge.kinds.filter((kind) => kind !== "trajectory");
    const relationship = edge.kinds.includes("trajectory") ? graphKinds.length ? "mixed" as const : "trajectory-contributor" as const : "traced-edge" as const;
    const crossing = semanticMap.trajectories.find((trajectory) => trajectory.areaIds.includes(focusAreaId) && trajectory.areaIds.includes(otherId));
    const fromIndex = crossing?.areaIds.indexOf(otherId) ?? -1; const toIndex = crossing?.areaIds.indexOf(focusAreaId) ?? -1;
    const between = crossing && fromIndex >= 0 && toIndex >= 0 ? crossing.areaIds.slice(Math.min(fromIndex, toIndex) + 1, Math.max(fromIndex, toIndex)) : [];
    return { path: mapAreaById.get(otherId)?.path ?? otherId.replace(/^area:/, ""), label: mapAreaById.get(otherId)?.label ?? path.basename(otherId), flowCount: edge.flowCount, incompleteCount: edge.unknownCount, relationship, via: between.map((id) => mapAreaById.get(id)?.label ?? id.replace(/^area:/, "")).slice(0, 4) };
  };
  const incoming = semanticMap.edges.filter((edge) => edge.to === focusAreaId).map((edge) => connection(edge, edge.from));
  const outgoing = semanticMap.edges.filter((edge) => edge.from === focusAreaId).map((edge) => connection(edge, edge.to));
  const crossingTrajectories = semanticMap.trajectories.filter((trajectory) => trajectory.areaIds.includes(focusAreaId));
  const sinks = report.rankings.all.filter((sink) => sink.file === relPath);
  const findingsById: Record<string, FindingDetail> = {};
  const expressionsById: Record<string, FindingDetail["identity"]> = {};
  const inventory: InventoryEntry[] = [];
  for (const sink of sinks) {
    findingsById[sink.id] = findingDetail(sink, report, source, resolveSource);
    const burden = sink.scores.burden;
    inventory.push({
      id: sink.id, kind: "finding", line: sink.line, label: sink.label,
      secondaryLabel: sink.expression === sink.label ? null : sink.expression,
      burden, severity: burden >= 0.66 ? "high" : burden >= 0.33 ? "medium" : "low",
      sort: sort(burden, sink.line, sink.roots.length, 0),
      flags: { hasDetails: true, hasDefenses: sink.defenses.length > 0 },
    });
  }
  for (const [index, fork] of report.repeatedForks.filter((item) => item.file === relPath).entries()) {
    const id = String(fork.id ?? `fork-${index + 1}`);
    inventory.push({ id, kind: "fork", line: fork.line ?? null, label: fork.discriminant ?? "Repeated conditional fork",
      secondaryLabel: fork.component ?? null, siteLines: (fork.sites ?? []).map((site) => site.line), discriminant: fork.discriminant ?? "",
      sort: sort(fork.severity ?? 0.4, fork.line ?? 0, fork.siteCount ?? 0, 1), flags: { hasDetails: false, hasDefenses: false } });
  }
  for (const [index, helper] of report.helpers.filter((item) => item.file === relPath).entries()) {
    const id = `boundary-${index + 1}`;
    inventory.push({ id, kind: "boundary", line: helper.line, label: helper.name, secondaryLabel: helper.returnType,
      verdict: helper.verdict, inboundSources: helper.inSources, callers: helper.callerCount,
      sort: sort(helper.debt ?? 0.2, helper.line, helper.inSources, 2), flags: { hasDetails: false, hasDefenses: helper.internalDefenses > 0 } });
  }
  for (const [index, relay] of report.contextRelay.filter((item) => item.parentFile === relPath).entries()) {
    const id = `relay-${index + 1}`;
    inventory.push({ id, kind: "relay", line: relay.line, label: relay.childComponent, secondaryLabel: relay.signal,
      childPath: relay.childFile, props: relay.props, contextHooks: relay.contextHooks,
      sort: sort(relay.score, relay.line, relay.props.length, 3), flags: { hasDetails: false, hasDefenses: false } });
  }
  for (const edge of report.unknownEdges.filter((item) => item.file === relPath)) {
    inventory.push({ id: edge.id, kind: "unknown-edge", line: edge.line, label: edge.label, secondaryLabel: edge.kind,
      occurrences: edge.occurrences, sort: sort(0.15, edge.line ?? 0, edge.affectedSinks.length, 4), flags: { hasDetails: false, hasDefenses: false } });
  }
  for (const [index, entry] of fanOutEntriesForFile(fullReport.rankings.all, relPath).entries()) {
    inventory.push({ id: `fan-out-${index + 1}`, kind: "fan-out", line: entry.line, label: entry.root, secondaryLabel: entry.kind ?? null,
      sinkCount: entry.sinkCount, fileCount: entry.fileCount,
      sort: sort(entry.sinkCount, entry.line ?? 0, entry.sinkCount, 5), flags: { hasDetails: false, hasDefenses: false } });
  }
  inventory.sort((left, right) => right.sort.score - left.sort.score || left.sort.kindOrder - right.sort.kindOrder || left.sort.line - right.sort.line || lexical(left.id, right.id));

  for (const evidence of fileIdentities) {
    if (!evidence.symbolId || evidence.location.file !== relPath) continue;
    expressionsById[evidence.expressionId] = identityEvidenceFor(evidence);
  }
  for (const sink of fullReport.rankings.all) {
    for (const evidence of sink.traceIdentities ?? []) {
      if (!evidence.symbolId || evidence.location.file !== relPath) continue;
      const projected = identityEvidence(sink, evidence);
      expressionsById[evidence.expressionId] = expressionsById[evidence.expressionId]
        ? mergeExpressionEvidence(expressionsById[evidence.expressionId], projected)
        : projected;
    }
  }

  const annotations = new Map<number, FilePage["file"]["lines"][number]["annotations"]>();
  const add = (line: number, annotation: FilePage["file"]["lines"][number]["annotations"][number]) => {
    const list = annotations.get(line) ?? []; list.push(annotation); annotations.set(line, list);
  };
  for (const sink of sinks) {
    for (let line = sink.span.startLine; line <= sink.span.endLine; line += 1) add(line, {
      kind: "finding", entityId: sink.id,
      startColumn: line === sink.span.startLine ? sink.span.startColumn : null,
      endColumn: line === sink.span.endLine ? sink.span.endColumn : null,
      burden: sink.scores.burden,
    });
  }
  for (const expression of selectableExpressions(Object.values(expressionsById))) {
    for (let line = expression.focusSpan.startLine; line <= expression.focusSpan.endLine; line += 1) add(line, {
      kind: "expression", entityId: expression.expressionId,
      startColumn: line === expression.focusSpan.startLine ? expression.focusSpan.startColumn : null,
      endColumn: line === expression.focusSpan.endLine ? expression.focusSpan.endColumn : null,
      burden: null,
    });
  }
  for (const item of inventory.filter((entry) => entry.kind !== "finding" && entry.line !== null)) add(item.line!, {
    kind: item.kind === "unknown-edge" ? "unknown-edge" : item.kind,
    entityId: item.id, startColumn: null, endColumn: null, burden: item.sort.score,
  });
  const lines = source.split("\n").map((text, index) => ({ number: index + 1, text, annotations: annotations.get(index + 1) ?? [] }));
  return filePageSchema.parse({
    file: { path: relPath, language: languageOf(relPath), lines }, inventory, findingsById, expressionsById,
    worldContext: { area: focusArea, incoming, outgoing, trajectories: crossingTrajectories, totals: { repositoryAreas: semanticMap.totals.areas, connectedAreas: new Set([...incoming.map((item) => item.path), ...outgoing.map((item) => item.path)]).size, crossingTrajectories: crossingTrajectories.length } },
    reportAvailability: REPORT_VIEWS.filter((view) => view !== "overview").map((view) => ({ view, label: reportViewLabel(view) })),
    debug: { scopePath: relPath, findingCount: sinks.length },
  });
}

function findingDetail(sink: Sink, report: AnalysisReport, source: string, resolveSource: ResolveSource): FindingDetail {
  const point = (file: string, line: number, column?: number) => ({ path: file, line, ...(column === undefined ? {} : { column }) });
  const sourceLine = (file: string | null, line: number | null) => file && line ? resolveSource(file)?.split("\n")[line - 1]?.trim() ?? null : null;
  const roots = sink.rootInfos.map((root) => ({ label: root.label, kind: root.kind, location: root.def ? point(root.def.file, root.def.line) : null }));
  const detail = {
    id: sink.id, label: sink.label, expression: sink.expression, category: sink.category, type: sink.type,
    location: point(sink.file, sink.line, sink.column), span: sink.span,
    context: { component: sink.renderContext.component ?? null, tag: sink.renderContext.tag ?? null, attribute: sink.renderContext.attribute ?? null },
    burden: sink.scores?.burden ?? 0, confidence: sink.confidence, confidenceReason: sink.confidenceReason,
    confidenceRisk: sink.confidenceRisk, queue: sink.queue, burdenBreakdown: sink.scores?.burdenBreakdown ?? null,
    identity: identityEvidence(sink),
    participants: findingParticipants(sink),
    roots,
    path: sink.representativeSteps.map((step) => ({ label: step.label, kind: step.kind, detail: step.detail,
      location: step.file && step.line ? point(step.file, step.line) : null, snippet: sourceLine(step.file, step.line) })),
    defenses: sink.defenses.map((defense) => ({ expression: defense.expression, verdict: defense.verdict, origin: defense.origin,
      type: defense.type ?? null, location: point(defense.location.file ?? sink.file, defense.location.line, defense.location.column) })),
    representationSteps: sink.representationSteps.map((step) => ({ kind: step.kind, label: step.label, location: point(step.file, step.line) })),
    advice: { shape: String(sink.advice?.primaryShape ?? sink.advice?.shape ?? sink.family ?? "uncategorized"),
      firstCut: String(sink.advice?.firstCut ?? "local boundary cleanup"), headline: String(sink.advice?.headline ?? "") },
    reach: (sink.reachedVia ?? []).map((group) => ({ source: group.source, total: group.total ?? group.sinks.length,
      sinks: group.sinks.map((reached) => ({ id: reached.id, path: reached.file, line: reached.line, label: reached.label, depth: reached.depth })) })),
    sameCode: report.rankings.all.filter((peer) => peer.id !== sink.id && peer.expression === sink.expression).map((peer) => ({ id: peer.id, path: peer.file, line: peer.line, label: peer.label })),
    graph: findingGraph(sink),
  };
  return { ...detail, debugText: debugText(detail, report.meta.root, source) };
}

function findingParticipants(sink: Sink): FindingDetail["participants"] {
  const byFocus = new Map<string, NonNullable<Sink["traceIdentities"]>[number]>();
  for (const evidence of sink.traceIdentities ?? []) {
    if (!evidence.symbolId || evidence.location.file !== sink.file || !spanContains(sink.span, evidence.focusSpan)) continue;
    const key = spanKey(evidence.focusSpan);
    const current = byFocus.get(key);
    if (!current || spanSize(evidence.span) > spanSize(current.span)) byFocus.set(key, evidence);
  }
  return [...byFocus.values()].sort((left, right) => left.focusSpan.startLine - right.focusSpan.startLine || left.focusSpan.startColumn - right.focusSpan.startColumn).map((evidence) => ({
    expressionId: evidence.expressionId, expression: evidence.expression, focusText: evidence.focusText, symbolName: evidence.symbolName, typeText: evidence.typeText, role: expressionRole(evidence.expression, evidence.focusText, evidence.typeText),
  }));
}

function selectableExpressions(expressions: FindingDetail["identity"][]) {
  const byFocus = new Map<string, FindingDetail["identity"]>();
  for (const expression of expressions) {
    if (!expression.symbolId) continue;
    const key = spanKey(expression.focusSpan); const current = byFocus.get(key);
    if (!current || Number(expression.traceComplete) > Number(current.traceComplete) || (expression.traceComplete === current.traceComplete && spanSize(expression.span) > spanSize(current.span))) byFocus.set(key, expression);
  }
  return [...byFocus.values()];
}
function spanContains(outer: Sink["span"], inner: Sink["span"]) { return (inner.startLine > outer.startLine || inner.startLine === outer.startLine && inner.startColumn >= outer.startColumn) && (inner.endLine < outer.endLine || inner.endLine === outer.endLine && inner.endColumn <= outer.endColumn); }
function spanKey(span: Sink["span"]) { return `${span.startLine}:${span.startColumn}:${span.endLine}:${span.endColumn}`; }
function spanSize(span: Sink["span"]) { return (span.endLine - span.startLine) * 10000 + span.endColumn - span.startColumn; }
function expressionRole(expression: string, focus: string, type: string): FindingDetail["participants"][number]["role"] { if (expression === focus && /^Accessor</.test(type)) return "accessor"; if (expression === focus) return "symbol"; if (expression.endsWith(focus)) return "property"; if (expression.includes("(")) return "call"; return "value"; }

function identityEvidence(sink: Sink, identity = sink.identity): FindingDetail["identity"] {
  if (!identity) return {
    expressionId: `expression:${sink.file}:${sink.span.startLine}:${sink.span.startColumn}`,
    expression: sink.expression, location: { path: sink.file, line: sink.line, column: sink.column }, span: sink.span, focusText: sink.expression, focusSpan: sink.span,
    symbolId: null, symbolName: null, typeId: `type:unresolved:${sink.file}:${sink.line}:${sink.column}`, typeText: sink.type, typeDefinition: null, definition: null, usages: [], traceComplete: false,
    traceCompletenessReason: "Identity evidence was not produced for this expression.", evidenceLevel: "trace-incomplete",
    upstreamPath: [], downstreamPath: [], terminalSinks: [], totalReach: 0, defenses: [], representationSteps: [], unknownBoundaries: [], attachedFindingIds: [], graphNodeIds: [], boundaryIds: [],
  };
  return identityEvidenceFor(identity, sink.file);
}

function identityEvidenceFor(identity: ExpressionIdentityEvidence, fallbackFile?: string): FindingDetail["identity"] {
  const point = (location: NonNullable<typeof identity.definition>) => ({ path: location.file, line: location.line, column: location.column });
  const pathStep = (step: typeof identity.upstreamPath[number]) => ({ label: step.label, kind: step.kind, detail: step.detail, location: step.file && step.line ? { path: step.file, line: step.line } : null });
  return {
    expressionId: identity.expressionId, expression: identity.expression, location: point(identity.location), span: identity.span, focusText: identity.focusText, focusSpan: identity.focusSpan,
    symbolId: identity.symbolId, symbolName: identity.symbolName, typeId: identity.typeId, typeText: identity.typeText,
    typeDefinition: identity.typeDefinition ? point(identity.typeDefinition) : null,
    externalOrigin: identity.externalOrigin ?? null,
    definition: identity.definition ? point(identity.definition) : null, usages: identity.usages.map(point),
    traceComplete: identity.traceComplete, traceCompletenessReason: identity.traceCompletenessReason, evidenceLevel: identity.evidenceLevel,
    upstreamPath: identity.upstreamPath.map(pathStep), downstreamPath: identity.downstreamPath.map(pathStep),
    terminalSinks: identity.terminalSinks.map((sink) => ({ id: sink.id, path: sink.file, line: sink.line, label: sink.label })), totalReach: identity.totalReach,
    defenses: identity.defenses.map((defense) => ({ expression: defense.expression, verdict: defense.verdict, origin: defense.origin, type: defense.type ?? null, location: point({ file: defense.location.file ?? fallbackFile ?? identity.location.file, line: defense.location.line, column: defense.location.column }) })),
    representationSteps: identity.representationSteps.map((step) => ({ kind: step.kind, label: step.label, location: { path: step.file, line: step.line } })),
    unknownBoundaries: identity.unknownBoundaries.map(pathStep), attachedFindingIds: identity.attachedFindingIds, graphNodeIds: identity.graphNodeIds, boundaryIds: identity.boundaryIds,
  };
}

function mergeExpressionEvidence(left: FindingDetail["identity"], right: FindingDetail["identity"]): FindingDetail["identity"] {
  const uniqueBy = <T>(items: T[], key: (item: T) => string) => [...new Map(items.map((item) => [key(item), item])).values()];
  const terminals = uniqueBy([...left.terminalSinks, ...right.terminalSinks], (item) => item.id);
  return {
    ...left,
    upstreamPath: right.upstreamPath.length > left.upstreamPath.length ? right.upstreamPath : left.upstreamPath,
    downstreamPath: right.downstreamPath.length > left.downstreamPath.length ? right.downstreamPath : left.downstreamPath,
    terminalSinks: terminals,
    totalReach: Math.max(left.totalReach, right.totalReach, terminals.length),
    defenses: uniqueBy([...left.defenses, ...right.defenses], (item) => `${item.location.path}:${item.location.line}:${item.expression}`),
    representationSteps: uniqueBy([...left.representationSteps, ...right.representationSteps], (item) => `${item.location.path}:${item.location.line}:${item.kind}:${item.label}`),
    unknownBoundaries: uniqueBy([...left.unknownBoundaries, ...right.unknownBoundaries], (item) => `${item.location?.path}:${item.location?.line}:${item.kind}:${item.label}`),
    attachedFindingIds: [...new Set([...left.attachedFindingIds, ...right.attachedFindingIds])],
    graphNodeIds: [...new Set([...left.graphNodeIds, ...right.graphNodeIds])],
    boundaryIds: [...new Set([...left.boundaryIds, ...right.boundaryIds])],
  };
}

function debugText(detail: Omit<FindingDetail, "debugText">, root: string, source: string) {
  const line = source.split("\n")[detail.location.line - 1]?.trim() ?? "";
  return [`tsx-dataflow finding ${detail.id}`, `abs path: ${path.join(root, detail.location.path)}:${detail.location.line}:${detail.location.column ?? 0}`,
    `expression: ${detail.expression}`, `source: ${line}`, `burden: ${detail.burden.toFixed(3)}`, "", JSON.stringify(detail, null, 2)].join("\n");
}
function findingGraph(sink: Sink): FindingDetail["graph"] {
  const sinkId = `${sink.id}-sink`; const roots: RootInfo[] = sink.rootInfos.length ? sink.rootInfos : sink.roots.map((label) => ({ label, kind: "source" }));
  const boundarySteps = sink.representativeSteps.filter((step) => step.kind === "call" || step.kind === "helper-enter").slice(0, 4);
  const nodes: FindingDetail["graph"]["nodes"] = [
    ...roots.map((root, index) => ({ id: `${sink.id}-root-${index}`, label: root.label, kind: "source" as const, location: root.def ? { path: root.def.file, line: root.def.line } : null, metric: root.kind })),
    ...boundarySteps.map((step, index) => ({ id: `${sink.id}-boundary-${index}`, label: step.label, kind: "boundary" as const, location: step.file && step.line ? { path: step.file, line: step.line } : null, metric: step.kind })),
    { id: sinkId, label: sink.label, kind: "sink" as const, location: { path: sink.file, line: sink.line }, metric: `burden ${(sink.scores?.burden ?? 0).toFixed(2)}` },
  ];
  const target = boundarySteps.length ? `${sink.id}-boundary-0` : sinkId;
  const edges = roots.map((_, index) => ({ id: `${sink.id}-root-edge-${index}`, from: `${sink.id}-root-${index}`, to: target, label: null as string | null }));
  for (let index = 0; index < boundarySteps.length; index += 1) edges.push({ id: `${sink.id}-boundary-edge-${index}`, from: `${sink.id}-boundary-${index}`, to: index + 1 < boundarySteps.length ? `${sink.id}-boundary-${index + 1}` : sinkId, label: null });
  return { nodes, edges };
}
function sort(score: number, line: number, sources: number, kindOrder: number) { return { score, line, sources, kindOrder }; }
function languageOf(file: string): FilePage["file"]["language"] { const ext = path.extname(file).slice(1); return ext === "tsx" || ext === "ts" || ext === "jsx" || ext === "js" ? ext : "other"; }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
