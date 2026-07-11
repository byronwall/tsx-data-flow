import path from "node:path";
import type { AnalysisReport, RootInfo, Sink } from "../../types";
import { entryTypeCountsByFile } from "../../reports/overview-selectors";
import { workspaceSchema, type Workspace } from "../contracts";

export function buildWorkspaceDto(report: AnalysisReport): Workspace {
  const counts = entryTypeCountsByFile(report);
  const participating = new Set<string>();
  for (const node of report.graph.nodes) if (node.file) participating.add(node.file);
  for (const edge of report.graph.edges) if (edge.location?.file) participating.add(edge.location.file);
  const groups = new Map<string, Sink[]>();
  const baseline = report.baseline;
  for (const sink of report.rankings.all) {
    const entries = groups.get(sink.file) ?? [];
    entries.push(sink);
    groups.set(sink.file, entries);
  }
  const files = [...groups.entries()].map(([filePath, sinks]) => {
    const worst = sinks.reduce((best, sink) =>
      (sink.scores?.burden ?? 0) > (best?.scores?.burden ?? -1) ? sink : best, sinks[0]);
    const shapes = sinks.map(shapeOf);
    const ownership = sinks.map(ownershipOf);
    const entry = counts.get(filePath) ?? { boundaries: 0, relays: 0, unknown: 0, fanOut: 0 };
    const primaryShape = modalValue(shapes);
    const primaryOwnership = modalValue(ownership);
    const firstCut = String(worst?.advice?.firstCut ?? worst?.advice?.headline ?? "local boundary cleanup");
    return {
      path: filePath,
      findings: {
        count: sinks.length,
        worstBurden: worst?.scores?.burden ?? 0,
        maxDepth: Math.max(0, ...sinks.map((sink) => sink.metrics.maximumPathDepth ?? 0)),
      },
      entries: {
        boundaries: entry.boundaries,
        relays: entry.relays,
        unknownEdges: entry.unknown,
        fanOutSources: entry.fanOut,
      },
      classification: { primaryShape, ownership: primaryOwnership, firstCut },
      flags: { graphParticipant: participating.has(filePath) },
      comparisonState: comparisonState(filePath, worst?.label ?? "", baseline),
      worstFinding: worst ? {
        id: worst.id,
        label: worst.label,
        line: worst.line,
        burden: worst.scores?.burden ?? 0,
      } : null,
      searchText: [filePath, primaryShape, primaryOwnership, firstCut].join(" ").toLowerCase(),
    };
  }).sort((left, right) => right.findings.worstBurden - left.findings.worstBurden || lexical(left.path, right.path));

  return workspaceSchema.parse({
    workspace: {
      displayRoot: path.basename(report.meta.root) || report.meta.root,
      source: report.meta.source,
      typescriptVersion: report.meta.typescript ?? null,
      configPaths: report.meta.tsconfigs ?? (report.meta.tsconfig ? [report.meta.tsconfig] : []),
      warnings: report.meta.tsconfigWarnings ?? [],
      reviewScope: report.meta.file?.length ? { kind: "file-set", paths: report.meta.file } : report.meta.scope ? { kind: "scope", query: report.meta.scope } : { kind: "project" },
    },
    summary: report.summary,
    concentration: {
      fileCount: report.concentration?.fileCount ?? 0,
      top5: report.concentration?.top5 ?? 0,
      hot4Plus: report.concentration?.hot4Plus ?? 0,
    },
    comparison: baseline ? {
      currentWorst: baseline.currentWorst,
      baselineWorst: baseline.baselineWorst,
      worsened: baseline.regressedSinks.length,
      improved: baseline.improved.length,
      resolved: baseline.removed.map((entry) => entry.label),
      newTop: baseline.newTop ? { label: baseline.newTop.label, path: baseline.newTop.file, line: baseline.newTop.line } : null,
      metricDeltas: baseline.metricDeltas,
    } : null,
    files,
  });
}

function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function modalValue(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1] || lexical(left[0], right[0]))[0]?.[0] ?? "—";
}
function shapeOf(sink: Sink) { return String(sink.advice?.primaryShape ?? sink.advice?.shape ?? sink.family ?? "uncategorized"); }
function ownershipOf(sink: Sink) {
  if (sink.roots.some((root) => /^use[A-Z]/.test(root))) return "feature hook/context";
  if (sink.rootInfos.some((source: RootInfo) => source.kind === "prop-read")) return "props";
  return "local";
}
function comparisonState(path: string, label: string, baseline: AnalysisReport["baseline"]): Workspace["files"][number]["comparisonState"] {
  if (!baseline) return null;
  if (baseline.newTop?.file === path && baseline.newTop.label === label) return "new";
  if (baseline.regressedSinks.some((entry) => entry.file === path && entry.label === label)) return "worsened";
  return "unchanged";
}
