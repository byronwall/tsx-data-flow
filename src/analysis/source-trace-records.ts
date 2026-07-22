import type * as TypeScript from "typescript";
import type { AnalysisGraph, DefenseRecord, RepresentationStep, RootInfo, TraceResult, TraceStep } from "../types";
import path from "node:path";
import { addEdge, addNode, locationOf, spanOf } from "./graph";
import { expressionIdFor } from "./identity";
import { safeTypeText } from "./source-defenses";
import { collapse, focusSnippet, formatExpression } from "../reports/format-helpers";

// Representation-only hops: steps that repackage a value without changing it
// (aliases, object packs/spreads). Tracked so the report can list exactly which
// transforms it counts, and deduped per sink so a shared hop isn't counted once
// per render sub-path that crosses it.
const REPRESENTATION_KINDS = new Set(["alias", "object-pack", "object-spread"]);

interface OperationTraceOptions { label?: string; detail?: string | null; type?: string; unknown?: boolean; boundaryId?: string; propName?: string }
export function addOperationTrace(ts: typeof TypeScript, graph: AnalysisGraph, kind: string, expression: TypeScript.Expression, traces: Array<TraceResult | null>, options: OperationTraceOptions = {}): TraceResult {
  const explicit = options.label != null;
  const fullText = collapse(expression.getText());
  const nodeLabel = options.label ?? formatExpression(fullText);
  // A short gloss of what this step evaluates, for kinds whose label alone is
  // ambiguous (a helper/method/memo/alias name says nothing about its body).
  // Defaults to the full expression text for calls; explicit callers override.
  const detail = options.detail ?? null;
  // File + line of this hop, threaded onto the step so the path can show where
  // each piece of logic lives (same file vs. scattered) and an agent can grep it.
  const sourceFile = expression.getSourceFile();
  const file = relativePath(graph.root, sourceFile.fileName);
  const location = locationOf(sourceFile, expression);
  const node = addNode(graph, {
    kind,
    label: nodeLabel,
    snippet: formatExpression(fullText, 240),
    file,
    location,
    type: safeTypeText(options.type),
    boundaryId: options.boundaryId,
    propName: options.propName,
  });
  const edges: string[] = [];
  const rootInfos: RootInfo[] = [];
  const defenses: DefenseRecord[] = [];
  const representationSteps: RepresentationStep[] = [];
  const allSteps: TraceStep[] = [];
  // Packed objects the value flows through, so sinks sharing one packed object
  // (a createMemo/object literal) can be grouped and checked for over-packing
  // (Phase 3). Identity is the object literal's *source location*, NOT the graph
  // node id: the trace graph re-traces each sink, minting a fresh node per
  // object-pack, so node ids are never shared even for the same literal.
  const packs: Array<{ key: string; label: string }> = [];
  // Each path step carries its operation kind so the transformation ledger and
  // path renderers can name the real operation (property-read, fallback, call,
  // object-pack, …) instead of a constant placeholder.
  let winnerChild: TraceResult | null = null;
  const step = traceStep(graph, expression, node.id, nodeLabel, kind, detail);
  allSteps.push(step);
  let longest: TraceStep[] = [step];
  for (const trace of traces.filter((trace: TraceResult | null): trace is TraceResult => trace != null)) {
    if (graph.nodeById.has(trace.lastNodeId)) {
      addEdge(
        graph,
        trace.lastNodeId,
        node.id,
        kind,
        expression,
        options.unknown,
      );
    }
    for (const edge of trace.edges) edges.push(edge);
    edges.push(kind);
    for (const root of trace.rootInfos ?? trace.roots.map((label: string) => ({ label, kind: "source" }))) rootInfos.push(root);
    for (const defense of trace.defenses) defenses.push(defense);
    for (const representation of trace.representationSteps ?? []) representationSteps.push(representation);
    for (const childStep of trace.steps ?? trace.longestPath) allSteps.push(childStep);
    for (const pack of trace.packs ?? []) packs.push(pack);
    if (trace.longestPath.length + 1 > longest.length) {
      winnerChild = trace;
      longest = [
        ...trace.longestPath,
        step,
      ];
    }
  }
  // Re-center an inline expression's label on the sub-expression that actually
  // flows in from the previous step (the "via"), marking it with « » so long
  // compute/pack/ternary expressions show the traced piece instead of
  // truncating an unrelated front. Steps with an explicit label (calls, memos,
  // reads) already carry their own gloss and keep their name.
  if (!explicit) {
    const focused = focusSnippet(fullText, winnerChild?.headText ?? null, 90);
    longest[longest.length - 1] = {
      ...longest[longest.length - 1],
      label: focused,
    };
  }
  if (kind === "object-pack") {
    packs.push({
      key: `${file}:${location.line}:${location.column}`,
      label: nodeLabel,
    });
  }
  if (REPRESENTATION_KINDS.has(kind)) {
    representationSteps.push({
      kind,
      label: nodeLabel,
      file,
      line: location.line,
      key: `${file}:${location.line}:${location.column}`,
    });
  }
  if (traces.length === 0)
    rootInfos.push({ label: nodeLabel, kind: "operation" });
  const dedupedRoots = uniqueRootInfos(rootInfos);
  return {
    lastNodeId: node.id,
    roots: dedupedRoots.map((root) => root.label),
    rootInfos: dedupedRoots,
    edges,
    defenses,
    representationSteps,
    longestPath: longest,
    steps: uniqueSteps(allSteps),
    packs: uniquePacks(packs),
    // The collapsed full text of this expression, so a parent operation can mark
    // exactly which sub-expression the traced value flowed in through.
    headText: fullText,
  };
}

// Deduplicate packs by their source-location key, keeping the first label seen.
function uniquePacks(packs: Array<{ key: string; label: string }>) {
  const seen = new Map<string, { key: string; label: string }>();
  for (const pack of packs) {
    if (!seen.has(pack.key)) seen.set(pack.key, pack);
  }
  return Array.from(seen.values());
}

// Deduplicate root descriptors by label, keeping the first (most specific)
// kind seen. Sources are tracked with their node kind so reports can filter
// out literal/primitive roots that are not actionable "sources".
function uniqueRootInfos(rootInfos: RootInfo[]) {
  const seen = new Map<string, RootInfo>();
  for (const info of rootInfos) {
    if (!info || !info.label) continue;
    if (!seen.has(info.label)) seen.set(info.label, info);
  }
  return Array.from(seen.values());
}

// FANOUT-DEF-1: resolve a root expression to its DEFINITION location (where the
// symbol is declared), not the use site we are currently tracing. This lets the
// fan-out graph's source node link straight to where a shared source like
// `useCommitsTableContext` is defined — the user shouldn't have to click into a
// usage and chase an import. Best-effort: returns null when the symbol is
// unresolved or only declared externally (node_modules / `.d.ts`).
export function definitionLocationOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Node, root: string) {
  let symbol;
  try {
    symbol = checker.getSymbolAtLocation(expression);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
  } catch {
    return null;
  }
  const declarations = symbol?.declarations ?? [];
  if (declarations.length === 0) return null;
  const internal = declarations.find((declaration: TypeScript.Declaration) => {
    const file = declaration.getSourceFile();
    if (file.isDeclarationFile) return false;
    const relative = relativePath(root, file.fileName);
    return !relative.startsWith("..") && !relative.includes("node_modules/");
  });
  if (!internal) return null;
  const declFile = internal.getSourceFile();
  const position = declFile.getLineAndCharacterOfPosition(
    internal.getStart(declFile),
  );
  return {
    file: relativePath(root, declFile.fileName),
    line: position.line + 1,
  };
}

export function sourceTrace(
  graph: AnalysisGraph,
  expression: TypeScript.Expression,
  kind: string,
  label: string,
  unknown: boolean,
  rootKind: string = kind,
  def: { file: string; line: number } | null = null,
  boundaryId?: string,
): TraceResult {
  const sourceFile = expression.getSourceFile();
  const file = relativePath(graph.root, sourceFile.fileName);
  const location = locationOf(sourceFile, expression);
  const node = addNode(graph, {
    kind,
    label,
    snippet: formatExpression(expression.getText(), 240),
    file,
    location,
    type: safeTypeText(),
    boundaryId,
  });
  return {
    lastNodeId: node.id,
    roots: [label],
    rootInfos: [{ label, kind: rootKind, ...(def ? { def } : {}) }],
    edges: [],
    defenses: [],
    representationSteps: [],
    longestPath: [traceStep(graph, expression, node.id, label, kind, null)],
    steps: [traceStep(graph, expression, node.id, label, kind, null)],
    packs: [],
    unknown,
    headText: collapse(expression.getText()),
  };
}

function uniqueSteps(steps: TraceStep[]) {
  return [...new Map(steps.map((step) => [`${step.graphNodeId ?? ""}:${step.expressionId ?? ""}:${step.kind}`, step])).values()];
}

function traceStep(graph: AnalysisGraph, expression: TypeScript.Expression, graphNodeId: string, label: string, kind: string, detail: string | null): TraceStep {
  const source = expression.getSourceFile();
  const location = locationOf(source, expression);
  const file = relativePath(graph.root, source.fileName);
  return { label, kind, detail, file, line: location.line, span: spanOf(source, expression), graphNodeId, expressionId: expressionIdFor(graph.root, expression) };
}

function relativePath(root: string, file: string) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
