import type * as TypeScript from "typescript";
import type { AnalysisGraph, AnalyzerArgs, CrossFileState, DefenseRecord, GraphNode, Sink, TraceContext, TraceResult } from "../types";
import path from "node:path";
import {
  addEdge,
  addNode,
  locationOf,
  spanOf,
} from "./graph";
import { buildHelperReport as buildHelperReportImpl } from "./helper-report";
import { fanOutRootsFor } from "./fan-out";
import { queueFor } from "./reachability";
import { detectRepeatedForks } from "./repeated-forks";
import { sinkAttributeName } from "./sink-shape";
import {
  buildFileContext,
  getFileContextCached,
  resolveCatalogFn,
} from "./trace-support";


import {
  enclosingFunctionName,
  getSinkExpression,
} from "./source-sinks";
import {
  confidenceFor,
  isCertaintyBoundaryDefense,
  safeTypeText,
} from "./source-defenses";
import { traceExpression } from "./source-trace";
import { addOperationTrace } from "./source-trace-records";
import { formatExpression } from "../reports/format-helpers";
import { contextProviderIdentityForNode } from "./semantic-context";
export function analyzeSourceFile(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  graph: AnalysisGraph,
  sourceFile: TypeScript.SourceFile,
  args: AnalyzerArgs,
  crossFile: CrossFileState | null,
) {
  const context = crossFile
    ? getFileContextCached(ts, sourceFile, crossFile, checker)
    : buildFileContext(ts, sourceFile, checker);
  const sinks: Sink[] = [];

  const visit = (node: TypeScript.Node) => {
    const sinkExpression = getSinkExpression(ts, node);
    if (sinkExpression) {
      const traceContext: TraceContext = {
          ...context,
          sourceFile,
          root: args.root,
          stack: new Set(),
          // Cross-file descent state (Approach enabler). Null crossFile keeps the
          // legacy single-file behavior for callers that don't supply it.
          crossFile: crossFile ?? null,
          crossDepth: 0,
          visitedFns: new Set(),
          paramBindings: null,
          paramObjectBindings: null,
        };
      const trace = sinkExpression.category === "event-handler"
        ? traceEventHandler(ts, checker, graph, sinkExpression.expression, traceContext)
        : traceExpression(ts, checker, graph, sinkExpression.expression, traceContext);
      const sinkNode = addNode(graph, {
        kind: "jsx-sink",
        label: sinkExpression.label,
        snippet: formatExpression(node.getText(sourceFile), 240),
        file: relativePath(args.root, sourceFile.fileName),
        location: locationOf(sourceFile, node),
        type: "DOM",
      });
      addEdge(graph, trace.lastNodeId, sinkNode.id, "jsx-sink", node);
      sinks.push(
        buildSinkRecord(
          ts,
          checker,
          sourceFile,
          node,
          sinkExpression,
          trace,
          sinkNode,
          args.root,
          crossFile?.identityIndex,
          graph,
        ),
      );
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  const forks = detectRepeatedForks(ts, checker, sourceFile, args.root);
  return { sinks, forks };
}

function traceEventHandler(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  graph: AnalysisGraph,
  expression: TypeScript.Expression,
  context: Parameters<typeof traceExpression>[4],
) {
  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) {
    return traceExpression(ts, checker, graph, expression, context);
  }
  const bodies = callbackValueExpressions(ts, expression);
  if (!bodies.length) return traceExpression(ts, checker, graph, expression, context);
  const traces = bodies.map((body) => traceExpression(ts, checker, graph, body, context));
  return addOperationTrace(ts, graph, "event-callback", expression, traces, {
    label: "event callback",
    detail: bodies.length === 1 ? formatExpression(bodies[0].getText(), 60) : `${bodies.length} callback operations`,
  });
}

function callbackValueExpressions(
  ts: typeof TypeScript,
  callback: TypeScript.ArrowFunction | TypeScript.FunctionExpression,
) {
  if (!ts.isBlock(callback.body)) return [callback.body];
  const expressions: TypeScript.Expression[] = [];
  const visit = (node: TypeScript.Node) => {
    if (node !== callback && ts.isFunctionLike(node)) return;
    if (ts.isExpressionStatement(node)) {
      expressions.push(node.expression);
      return;
    }
    if (ts.isReturnStatement(node) && node.expression) {
      expressions.push(node.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(callback.body);
  return expressions;
}

// --- Repeated fork/split detector (component-scoped branch inventory) ---------
export function buildHelperReport(ts: typeof TypeScript, checker: TypeScript.TypeChecker, crossFile: CrossFileState, args: AnalyzerArgs, sourceFiles: TypeScript.SourceFile[]) {
  return buildHelperReportImpl(ts, checker, crossFile, args, sourceFiles, {
    fanOutRootsFor,
    getFileContextCached,
    metricsFor,
    resolveCatalogFn,
    safeTypeText,
    traceExpression,
  });
}

function buildSinkRecord(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  sourceFile: TypeScript.SourceFile,
  node: TypeScript.Node,
  sinkExpression: NonNullable<ReturnType<typeof getSinkExpression>>,
  trace: TraceResult,
  sinkNode: GraphNode,
  root: string,
  identityIndex: CrossFileState["identityIndex"],
  graph: AnalysisGraph,
) {
  const location = locationOf(sourceFile, node);
  // One physical guard reached via several render sub-paths is a single
  // defensive operation; dedupe before metrics so counts and the rendered list
  // reflect distinct sites, not path multiplicity.
  const distinctDefenses = dedupeDefenses(trace.defenses);
  const distinctRepresentation = dedupeByKey(trace.representationSteps ?? []);
  const metrics = metricsFor(trace, distinctDefenses, distinctRepresentation);
  const sinkId = `RPF-${String(location.line).padStart(3, "0")}-${String(location.column).padStart(2, "0")}`;
  const confidence = confidenceFor(metrics, distinctDefenses);
  const file = relativePath(root, sourceFile.fileName);
  const terminalIdentityId = `terminal:${file}:${sinkExpression.expression.getStart(sourceFile)}:${sinkExpression.expression.getEnd()}`;
  const contextIdentity = contextProviderIdentityForNode(ts, checker, root, node);
  const identity = identityIndex?.evidenceFor(sinkExpression.expression, checker);
  if (identity) {
    identity.upstreamPath = trace.longestPath.map((step) => ({ ...step, detail: step.detail ?? null, file: step.file ?? null, line: step.line ?? null }));
    identity.downstreamPath = [{ label: sinkExpression.label, kind: "jsx-sink", detail: "renders at this terminal sink", file, line: location.line }];
    identity.terminalSinks = [{ id: terminalIdentityId, file, line: location.line, label: sinkExpression.label }];
    identity.totalReach = metrics.reachableSinks;
    identity.defenses = distinctDefenses.map((defense) => ({ ...defense, location: { ...defense.location, file: defense.location.file ?? file } }));
    identity.representationSteps = distinctRepresentation;
    identity.unknownBoundaries = trace.longestPath.filter((step) => step.kind.includes("unknown"));
    identity.attachedFindingIds = [sinkId];
    identity.graphNodeIds = [sinkNode.id];
    identity.boundaryIds = boundaryIdsFor(trace.longestPath, graph);
    sinkNode.identityId = identity.expressionId;
    sinkNode.typeId = identity.typeId;
    sinkNode.terminalId = terminalIdentityId;
  }
  const stepsByExpression = new Map<string, TraceResult["steps"]>();
  for (const step of trace.steps) {
    if (!step.expressionId || step.expressionId === identity?.expressionId) continue;
    const steps = stepsByExpression.get(step.expressionId) ?? [];
    steps.push(step); stepsByExpression.set(step.expressionId, steps);
  }
  const stepByNode = new Map(trace.steps.flatMap((step) => step.graphNodeId ? [[step.graphNodeId, step] as const] : []));
  const traceIdentities = [...stepsByExpression.entries()].flatMap(([expressionId, matchingSteps]) => {
    const step = matchingSteps[0];
    const evidence = identityIndex?.evidenceForId(expressionId);
    if (!evidence) return [];
    const upstreamIds = step.graphNodeId ? pathToRoot(step.graphNodeId, graph) : [];
    const downstreamIds = step.graphNodeId ? pathBetween(step.graphNodeId, sinkNode.id, graph) : [];
    evidence.upstreamPath = upstreamIds.map((id) => stepByNode.get(id)).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    evidence.downstreamPath = [...downstreamIds.slice(1).map((id) => stepByNode.get(id)).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)), { label: sinkExpression.label, kind: "jsx-sink", detail: "renders at this terminal sink", file, line: location.line }];
    evidence.terminalSinks = [{ id: terminalIdentityId, file, line: location.line, label: sinkExpression.label }];
    evidence.totalReach = metrics.reachableSinks;
    evidence.defenses = distinctDefenses.map((defense) => ({ ...defense, location: { ...defense.location, file: defense.location.file ?? file } }));
    evidence.representationSteps = distinctRepresentation;
    evidence.unknownBoundaries = trace.longestPath.filter((candidate) => candidate.kind.includes("unknown"));
    evidence.attachedFindingIds = [sinkId];
    evidence.graphNodeIds = matchingSteps.flatMap((candidate) => candidate.graphNodeId ? [candidate.graphNodeId] : []);
    evidence.boundaryIds = boundaryIdsFor([...evidence.upstreamPath, ...evidence.downstreamPath], graph);
    for (const graphNodeId of evidence.graphNodeIds) {
      const graphNode = graph.nodeById.get(graphNodeId);
      if (graphNode) { graphNode.identityId = evidence.expressionId; graphNode.typeId = evidence.typeId; }
    }
    return [evidence];
  });
  return {
    id: sinkId,
    file,
    line: location.line,
    column: location.column,
    // Exact source span of the rendered expression, so the code map can map the
    // finding to its chunk of code (not the whole line) and make adjacent
    // findings on one line independently selectable.
    span: spanOf(sourceFile, sinkExpression.expression),
    category: sinkExpression.category,
    label: sinkExpression.label,
    expression: sinkExpression.expression.getText(),
    renderContext: {
      tag: sinkExpression.jsx?.tag ?? null,
      attribute:
        ("attribute" in sinkExpression.jsx ? sinkExpression.jsx.attribute : null) ??
        sinkAttributeName({ label: sinkExpression.label }),
      component: enclosingFunctionName(ts, node),
    },
    type: safeTypeText(
      checker.typeToString(
        checker.getTypeAtLocation(sinkExpression.expression),
      ),
    ),
    roots: trace.roots,
    rootInfos:
      trace.rootInfos ??
      trace.roots.map((root: string) => ({ label: root, kind: "source" })),
    representativePath: trace.longestPath.map((step) => step.label),
    representativeSteps: trace.longestPath.map((step) => ({
      label: step.label,
      kind: step.kind,
      detail: step.detail ?? null,
      file: step.file ?? null,
      line: step.line ?? null,
    })),
    // Distinct representation-only hops (alias/pack/spread) on this sink's
    // slice, so the report can list exactly what the churn count refers to.
    representationSteps: distinctRepresentation,
    packs: trace.packs ?? [],
    nodeId: sinkNode.id,
    metrics,
    defenses: distinctDefenses,
    confidence: confidence.score,
    confidenceReason: confidence.reason,
    confidenceRisk: confidence.risk,
    queue: queueFor(metrics, distinctDefenses),
    identity,
    traceIdentities,
    terminalIdentityId,
    contextIdentity,
    contextMember: trace.contextLineages?.length === 1 ? trace.contextLineages[0].member : null,
  };
}

function pathBetween(from: string, to: string, graph: AnalysisGraph) {
  return breadthFirstPath(from, (id) => id === to, (id) => graph.outgoing.get(id) ?? []);
}
function pathToRoot(from: string, graph: AnalysisGraph) {
  return breadthFirstPath(from, (id) => (graph.incoming.get(id) ?? []).length === 0, (id) => graph.incoming.get(id) ?? []).reverse();
}
function breadthFirstPath(start: string, done: (id: string) => boolean, next: (id: string) => string[]) {
  const queue: Array<{ id: string; path: string[] }> = [{ id: start, path: [start] }]; const seen = new Set([start]);
  while (queue.length) { const current = queue.shift()!; if (done(current.id)) return current.path; for (const id of next(current.id)) if (!seen.has(id)) { seen.add(id); queue.push({ id, path: [...current.path, id] }); } }
  return [start];
}

const BOUNDARY_STEP_KINDS = new Set(["call", "helper-enter", "helper-return", "import", "unknown", "unknown-source"]);
function boundaryIdsFor(steps: TraceResult["longestPath"], graph: AnalysisGraph) {
  return [...new Set(steps.filter((step) => BOUNDARY_STEP_KINDS.has(step.kind) && step.graphNodeId).map((step) => {
    const id = `boundary:${step.graphNodeId}`;
    const node = graph.nodeById.get(step.graphNodeId!);
    if (node) node.boundaryId = id;
    return id;
  }))];
}

function metricsFor(
  trace: TraceResult,
  defenses: DefenseRecord[] = dedupeDefenses(trace.defenses),
  representationSteps = dedupeByKey(trace.representationSteps ?? []),
) {
  const edgeCounts = countBy(trace.edges);
  // Count distinct guard sites, not edge traversals: the same `??`/`?.` reached
  // through several render sub-paths is one defensive operation.
  const defensiveOperationCount = defenses.length;
  const certaintyBoundaryDefenseCount = defenses.filter((defense) =>
    isCertaintyBoundaryDefense(defense),
  ).length;
  const actionableDefensiveOperationCount = Math.max(
    0,
    defensiveOperationCount - certaintyBoundaryDefenseCount,
  );
  // Distinct representation-only hops, deduped by site (same rationale as
  // defenses) rather than counted once per render sub-path that crosses them.
  const representationChurn = representationSteps.length;
  const helperHops = edgeCounts.call ?? 0;
  const impossibleDefenseCount = defenses.filter(
    (defense) => defense.verdict === "impossible",
  ).length;
  const unknownEdgeCount = trace.edges.filter(
    (edge) => edge === "unknown",
  ).length;
  return {
    sliceSize: trace.edges.length + trace.longestPath.length,
    maximumPathDepth: trace.longestPath.length,
    helperHops,
    representationChurn,
    defensiveOperationCount,
    actionableDefensiveOperationCount,
    certaintyBoundaryDefenseCount,
    impossibleDefenseCount,
    controlDependencyCount: edgeCounts.conditional ?? 0,
    mergeWidth: trace.roots.length,
    // True downstream reach is a whole-report property (how many sinks this
    // sink's sources also feed), so it cannot be known from a single trace.
    // Seeded to 1 here and filled in by groundReachability once all sinks exist.
    reachableSinks: 1,
    repeatedNormalization: Math.max(0, actionableDefensiveOperationCount - 1),
    unknownEdgeCount,
    packFamilyDiversity: 0,
    packRisk: 0,
    suspiciousPackCount: 0,
  };
}

// Collapse defenses that refer to the same physical guard site (the trace
// re-walks shared sub-paths, so one `props.size ?? 32` can appear many times).
// First occurrence wins; order is preserved.
function dedupeDefenses(defenses: DefenseRecord[]) {
  return dedupeByKey(
    defenses,
    (defense) =>
      defense.key ?? `${defense.location?.line}:${defense.expression}`,
  );
}

// Generic first-wins, order-preserving dedupe over a `.key` (or a supplied key
// function). Used to collapse trace artifacts (defenses, representation hops)
// that the per-sink re-trace can visit through multiple sub-paths.
function dedupeByKey<T>(items: T[], keyOf: (item: T) => string = (item) => (item as { key: string }).key) {
  const seen = new Set<string>();
  const distinct: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(item);
  }
  return distinct;
}

function findingSentence(sink: Sink) {
  if (sink.metrics.impossibleDefenseCount > 0) {
    return "A nullish fallback or optional access is unreachable under the checked TypeScript program.";
  }
  return "This rendered value has more data-flow plumbing than nearby JSX should usually need.";
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function relativePath(root: string, file: string) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
