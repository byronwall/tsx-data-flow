import type { AnalysisReport, ReachedSink, Sink } from "../../types";
import { fanOutEntriesGlobal } from "../../reports/overview-selectors";
import { reportDataSchema, type ReportData } from "../contracts";
import type { ReportView } from "../report-views";

export function buildReportDto(report: AnalysisReport, view: Exclude<ReportView, "overview">): ReportData {
  const sinks = report.rankings.all;
  if (view === "findings") return parse({ view, items: sinks.map((sink) => ({ id: sink.id, label: sink.label, location: loc(sink.file, sink.line), burden: sink.scores.burden, depth: sink.metrics.maximumPathDepth, shape: shape(sink), firstCut: String(sink.advice?.firstCut ?? "local boundary cleanup") })) });
  if (view === "work-packets") return parse({ view, items: report.workUnits.map((unit) => ({ id: unit.id, label: unit.label, location: loc(unit.file, unit.line), burden: unit.scores.burden, sinkCount: unit.unit.sinkCount, pivots: unit.unit.pivots, causes: unit.unit.causes, shape: unit.unit.shape })) });
  if (view === "fan-out") return parse({ view, items: fanOutEntriesGlobal(sinks).map((entry, index) => {
    const id = `fan-out-${index + 1}`; const center = `${id}-source`;
    return { id, label: entry.root, location: entry.def ? loc(entry.def.file, entry.def.line) : null, sinkCount: entry.sinkCount, fileCount: entry.fileCount, maxDepth: entry.maxDepth,
      graph: { nodes: [{ id: center, label: entry.root, kind: "source", location: entry.def ? loc(entry.def.file, entry.def.line) : null, metric: `${entry.sinkCount} sinks` },
        ...entry.graphSinks.map((sink: ReachedSink) => ({ id: `${id}-${sink.id}`, label: sink.label, kind: "sink" as const, location: loc(sink.file, sink.line), metric: `depth ${sink.depth}` }))],
        edges: entry.graphSinks.map((sink: ReachedSink, edge: number) => ({ id: `${id}-edge-${edge}`, from: center, to: `${id}-${sink.id}`, label: null })) } };
  }) });
  if (view === "fan-in") return parse({ view, items: sinks.filter((sink) => sourceLabels(sink).length >= 2 || sink.metrics.mergeWidth >= 2).map((sink) => {
    const roots = sourceLabels(sink); const center = `fanin-${sink.id}`;
    return { id: center, label: sinkLabel(sink), location: loc(sink.file, sink.line), rootCount: Math.max(sink.metrics.mergeWidth, roots.length), predicateCount: sink.metrics.controlDependencyCount, maxDepth: sink.metrics.maximumPathDepth,
      graph: { nodes: [...roots.map((root, index) => ({ id: `${center}-root-${index}`, label: root, kind: "source" as const, location: null, metric: null })), { id: center, label: sinkLabel(sink), kind: "sink" as const, location: loc(sink.file, sink.line), metric: `depth ${sink.metrics.maximumPathDepth}` }],
        edges: roots.map((_, index) => ({ id: `${center}-edge-${index}`, from: `${center}-root-${index}`, to: center, label: null })) } };
  }).sort((a, b) => b.rootCount - a.rootCount || b.maxDepth - a.maxDepth) });
  if (view === "path-families") {
    const groups = new Map<string, Sink[]>(); for (const sink of sinks) { const key = String(sink.family ?? shape(sink)); const list = groups.get(key) ?? []; list.push(sink); groups.set(key, list); }
    return parse({ view, items: [...groups].map(([label, members], index) => ({ id: `family-${index + 1}`, label, findingCount: members.length, maxBurden: Math.max(...members.map((sink) => sink.scores?.burden ?? 0)), paths: members.map((sink) => loc(sink.file, sink.line)) })) });
  }
  if (view === "defensive-ledger") {
    const groups = new Map<string, { sink: Sink; defense: Sink["defenses"][number]; count: number }>();
    for (const sink of sinks) for (const defense of sink.defenses) { const key = `${defense.location.file ?? sink.file}:${defense.location.line}:${defense.expression}`; const current = groups.get(key); if (current) current.count += 1; else groups.set(key, { sink, defense, count: 1 }); }
    return parse({ view, items: [...groups.values()].map(({ sink, defense, count }, index) => ({ id: `defense-${index + 1}`, label: defense.expression, location: loc(defense.location.file ?? sink.file, defense.location.line), expression: defense.expression, verdict: defense.verdict, origin: defense.origin, affectedFindings: count })) });
  }
  if (view === "prop-relay") return parse({ view, items: sinks.map((sink) => ({ sink, roots: sourceLabels(sink), wrapperSteps: sink.metrics.representationChurn, boundaries: Math.max(0, sink.metrics.mergeWidth - 1), helperHops: sink.metrics.helperHops })).filter((entry) => entry.wrapperSteps || entry.boundaries || entry.helperHops).map(({ sink, roots, wrapperSteps, boundaries, helperHops }) => {
    const id = `prop-relay-${sink.id}`; const middle = `${id}-boundary`; const sinkId = `${id}-sink`;
    return { id, label: sinkLabel(sink), location: loc(sink.file, sink.line), roots, wrapperSteps, boundaries, helperHops, maxDepth: sink.metrics.maximumPathDepth,
      graph: { nodes: [...roots.map((root, index) => ({ id: `${id}-root-${index}`, label: root, kind: "source" as const, location: null, metric: null })), { id: middle, label: "relay path", kind: "boundary" as const, location: null, metric: `${boundaries} boundaries` }, { id: sinkId, label: sinkLabel(sink), kind: "sink" as const, location: loc(sink.file, sink.line), metric: null }],
        edges: [...roots.map((_, index) => ({ id: `${id}-in-${index}`, from: `${id}-root-${index}`, to: middle, label: null })), { id: `${id}-out`, from: middle, to: sinkId, label: null }] } };
  }) });
  if (view === "context-relay") return parse({ view, items: report.contextRelay.map((relay, index) => ({ id: `context-relay-${index + 1}`, label: relay.childComponent, location: loc(relay.parentFile, relay.line), child: { label: relay.childComponent, path: relay.childFile }, props: relay.props, sharedProps: relay.sharedProps, contextHooks: relay.contextHooks, signal: relay.signal, score: relay.score })) });
  if (view === "boundary-report") return parse({ view, items: report.helpers.map((helper, index) => {
    const id = `boundary-${index + 1}`; const center = `${id}-helper`;
    return { id, label: helper.name, location: loc(helper.file, helper.line), verdict: helper.verdict, inboundSources: helper.inRoots, callers: helper.callers.map((caller) => loc(caller.file, caller.line)),
      graph: { nodes: [...helper.inRoots.map((root, rootIndex) => ({ id: `${id}-root-${rootIndex}`, label: root, kind: "source" as const, location: null, metric: null })), { id: center, label: helper.name, kind: "boundary" as const, location: loc(helper.file, helper.line), metric: helper.verdict }, ...helper.callers.map((caller, callerIndex) => ({ id: `${id}-caller-${callerIndex}`, label: `${caller.file}:${caller.line}`, kind: "sink" as const, location: loc(caller.file, caller.line), metric: null }))],
        edges: [...helper.inRoots.map((_, rootIndex) => ({ id: `${id}-in-${rootIndex}`, from: `${id}-root-${rootIndex}`, to: center, label: null })), ...helper.callers.map((_, callerIndex) => ({ id: `${id}-out-${callerIndex}`, from: center, to: `${id}-caller-${callerIndex}`, label: null }))] } };
  }) });
  if (view === "component-refs") return parse({ view, items: report.componentRefs.map((ref, index) => ({ id: `component-${index + 1}`, label: ref.name, component: ref.name, location: loc(ref.file, ref.line), uses: ref.uses.map((use: { file: string; line: number }) => loc(use.file, use.line)) })) });
  return parse({ view, disposition: "merged", target: "file-explorer", message: `${view} entries are available in the unified file explorer; choose a file from the overview to inspect them in source context.` });
}

function parse(value: unknown): ReportData { return reportDataSchema.parse(value); }
function loc(path: string, line: number) { return { path, line }; }
function shape(sink: Sink) { return String(sink.advice?.primaryShape ?? sink.advice?.shape ?? sink.family ?? "uncategorized"); }
function sourceLabels(sink: Sink) { return [...new Set((sink.rootInfos.length ? sink.rootInfos.map((root) => root.label) : sink.roots).map(String))].slice(0, 12); }
function sinkLabel(sink: Sink) { const rendered = [sink.renderContext.component ?? sink.renderContext.tag, sink.renderContext.attribute].filter(Boolean).join(" / "); return rendered || sink.label || sink.expression || sink.id; }
