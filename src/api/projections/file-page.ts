import path from "node:path";
import type { AnalysisReport, RootInfo, Sink } from "../../types";
import { fanOutEntriesForFile } from "../../reports/overview-selectors";
import { REPORT_VIEWS, reportViewLabel } from "../report-views";
import { filePageSchema, type FilePage, type InventoryEntry, type FindingDetail } from "../contracts";

type ResolveSource = (path: string) => string | null;

export function buildFilePageDto(report: AnalysisReport, fullReport: AnalysisReport, relPath: string, source: string, resolveSource: ResolveSource): FilePage {
  const sinks = report.rankings.all.filter((sink) => sink.file === relPath);
  const findingsById: Record<string, FindingDetail> = {};
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
  for (const item of inventory.filter((entry) => entry.kind !== "finding" && entry.line !== null)) add(item.line!, {
    kind: item.kind === "unknown-edge" ? "unknown-edge" : item.kind,
    entityId: item.id, startColumn: null, endColumn: null, burden: item.sort.score,
  });
  const lines = source.split("\n").map((text, index) => ({ number: index + 1, text, annotations: annotations.get(index + 1) ?? [] }));
  return filePageSchema.parse({
    file: { path: relPath, language: languageOf(relPath), lines }, inventory, findingsById,
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
