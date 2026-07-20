import type { AnalysisReport } from "../../types";
import { routeDataDetailSchema, routeDataInventorySchema, type RouteDataDetail, type RouteDataInventory } from "../contracts";
import { stableHash } from "../../analysis/route-discovery";
import { buildExhaustiveRouteGraph } from "../../analysis/route-data-trajectories";
import { routeSinkKey } from "../../analysis/route-data";
const routeGraphCache = new WeakMap<object, Map<string, ReturnType<typeof buildExhaustiveRouteGraph>>>();

export function buildRouteDataInventory(report: AnalysisReport): RouteDataInventory {
  const { sourceFacts, sourceKeysForTrajectory } = collectSourceFacts(report);
  for (const trajectory of report.routeData.trajectories) {
    if (!sourceKeysForTrajectory.has(trajectory.key)) sourceKeysForTrajectory.set(trajectory.key, []);
  }
  const sources = [...sourceFacts.values()].map(({ routeKeys, ...source }) => ({ ...source, routeKeys: [...routeKeys].sort(lexical) })).sort((left, right) => lexical(left.label, right.label) || lexical(left.file, right.file));
  const routes = report.routeData.routes.map((route) => {
    const trajectories = report.routeData.trajectories.filter((trajectory) => trajectory.routeKey === route.key);
    const graph = routeGraph(report, route.key, route.sinkIds);
    const sourceMethodKeys = [...new Set(trajectories.flatMap((trajectory) => sourceKeysForTrajectory.get(trajectory.key) ?? []))];
    return {
      key: route.key, pathPattern: route.pathPattern, file: route.file, componentIdentityId: route.componentIdentityId,
      parameters: route.parameters, confidence: route.confidence, componentNames: route.componentNames,
      routeKind: routeKind(route.file, route.pathPattern), sourceMethodKeys, apiRouteKeys: [],
      trajectoryCount: graph.totals.trajectories, completeTrajectoryCount: graph.totals.trajectories - graph.totals.unknownTrajectories,
      totalPathSteps: graph.trajectories.reduce((sum, item) => sum + item.stepKeys.length, 0), uniqueStepCount: graph.totals.nodes,
      substitutionStepCount: graph.trajectories.reduce((sum, item) => sum + item.substitutionStepCount, 0),
      unknownGapCount: graph.totals.unknownTrajectories,
      omissions: route.omissions,
    };
  }).sort((left, right) => lexical(left.pathPattern, right.pathPattern) || lexical(left.file, right.file));
  const trajectories = report.routeData.trajectories.map((trajectory) => ({
    key: trajectory.key, routeKey: trajectory.routeKey, label: trajectory.label, operationCount: trajectory.operationKeys.length,
    sourceMethodKeys: sourceKeysForTrajectory.get(trajectory.key) ?? [],
    substitutionStepCount: trajectory.operationKeys.map((key) => report.routeData.operations.find((operation) => operation.key === key)).filter((operation) => operation && isSubstitution(operation)).length,
    terminalCount: trajectory.terminalIds.length, routeReachableTerminalCount: trajectory.routeReachableTerminalCount, terminalSelectionLimit: trajectory.terminalSelectionLimit, ordering: trajectory.ordering, handoffsProven: trajectory.handoffsProven, completeness: trajectory.completeness, omissions: trajectory.omissions,
  }));
  return routeDataInventorySchema.parse({ routes, sources, trajectories, totals: { routes: routes.length, sources: sources.length, trajectories: routes.reduce((sum, route) => sum + route.trajectoryCount, 0), complete: routes.reduce((sum, route) => sum + route.completeTrajectoryCount, 0) } });
}

export function buildRouteDataDetail(report: AnalysisReport, routeKey: string, trajectoryKey: string): RouteDataDetail | null {
  const inventory = buildRouteDataInventory(report);
  const route = inventory.routes.find((item) => item.key === routeKey);
  const analysisRoute = report.routeData.routes.find((item) => item.key === routeKey);
  const trajectory = report.routeData.trajectories.find((item) => item.key === trajectoryKey && item.routeKey === routeKey);
  if (!route || !analysisRoute || !trajectory) return null;
  const operationIds = new Set(trajectory.operationKeys);
  const operations = trajectory.operationKeys.map((key) => report.routeData.operations.find((operation) => operation.key === key)).filter((operation): operation is NonNullable<typeof operation> => Boolean(operation));
  const valueIds = new Set(operations.flatMap((operation) => [...operation.inputValueIds, ...operation.outputValueIds]));
  const values = report.routeData.values.filter((value) => valueIds.has(value.id));
  const shapeIds = new Set(operations.flatMap((operation) => [
    ...operation.inputShapeIds,
    ...operation.outputShapeIds,
    ...(operation.consumerHandoff ? [operation.consumerHandoff.outputShapeId] : []),
  ]));
  const evidenceIds = new Set(operations.flatMap((operation) => operation.sourceExpressionIds));
  const evidence = uniqueById(report.routeData.evidence.filter((item) => evidenceIds.has(item.id)));
  const terminals = report.routeData.terminals.filter((terminal) => trajectory.terminalIds.includes(terminal.id));
  const sourceNodes = trajectory.sourceValueIds.map((id) => {
    const value = values.find((item) => item.id === id);
    const operation = operations.find((item) => item.key === value?.sourceOperationKey);
    const source = evidence.find((item) => item.id === operation?.sourceExpressionIds[0]);
    return { id, kind: "source" as const, label: value?.label ?? "Persisted value", file: source?.file ?? null, line: source?.line ?? null, group: "persistence" as const, parentId: null, role: "persistence" as const };
  });
  const componentRecords = uniqueById([
    ...analysisRoute.componentHierarchy.map((component) => ({ ...component, file: route.file })),
    ...(analysisRoute.renderedComponents ?? []),
  ]);
  const componentNodes = componentRecords.map((component) => ({ id: component.id, kind: "component" as const, label: component.label, file: component.file, line: component.line, group: "route" as const, parentId: component.parentId, role: component.role }));
  const terminalNodes = terminals.map((terminal) => ({ id: terminal.id, kind: "terminal" as const, label: terminal.label, file: terminal.file, line: terminal.line, group: "render" as const, parentId: null, role: "terminal" as const }));
  const nodes = [...sourceNodes, ...componentNodes, ...terminalNodes];
  const hierarchyEdges = [
    ...componentNodes.filter((node) => node.parentId).map((node) => ({ id: `context-edge:${node.id}`, from: node.parentId!, to: node.id, kind: "component" as const })),
    ...(analysisRoute.renderedComponentEdges ?? []).map((edge) => ({ id: `rendered-component-edge:${edge.from}:${edge.to}`, from: edge.from, to: edge.to, kind: "component" as const })),
  ];
  const edges = hierarchyEdges;
  const routeSources = inventory.sources.filter((source) => route.sourceMethodKeys.includes(source.key));
  const exhaustiveGraph = annotateGraphSources(
    routeGraph(report, analysisRoute.key, analysisRoute.sinkIds),
    routeSources,
    evidence,
    operations,
  );
  return routeDataDetailSchema.parse({
    route, trajectory, operations, values, shapes: report.routeData.shapes.filter((shape) => shapeIds.has(shape.id)),
    evidence, terminals, sources: routeSources, context: { nodes, edges }, exhaustiveGraph,
  });
}

function collectSourceFacts(report: AnalysisReport) {
  const sourceFacts = new Map<string, {
    key: string; label: string; kind: "prisma" | "file" | "validated-json" | "other"; file: string; line: number;
    consumerLabel: string | null; handoffProven: boolean;
    typeName: string | null; typeText: string; shapeKind: "primitive" | "object" | "collection" | "union" | "opaque";
    fields: Array<{ key: string; typeText: string; optional: boolean }>; totalFields: number; evidenceId: string; routeKeys: Set<string>;
  }>();
  const sourceKeysForTrajectory = new Map<string, string[]>();
  for (const trajectory of report.routeData.trajectories) {
    const keys: string[] = [];
    const sourceOperations = trajectory.operationKeys
      .map((key) => report.routeData.operations.find((item) => item.key === key))
      .filter((item): item is NonNullable<typeof item> => item?.semanticKind === "read");
    for (const operation of sourceOperations) {
      const sourceShape = report.routeData.shapes.find((item) => operation.outputShapeIds.includes(item.id));
      const shape = operation.consumerHandoff
        ? report.routeData.shapes.find((item) => item.id === operation.consumerHandoff?.outputShapeId) ?? sourceShape
        : sourceShape;
      for (const evidenceId of operation.sourceExpressionIds) {
        const evidence = report.routeData.evidence.find((item) => item.id === evidenceId);
        if (!evidence) continue;
        const identity = `${evidence.compilerIdentity ?? "source-call"}:${evidence.file}:${evidence.span.startLine}:${evidence.span.startColumn}:${evidence.span.endLine}:${evidence.span.endColumn}:${operation.boundary?.kind ?? ""}:${operation.boundary?.label ?? ""}`;
        const key = `source-method:${stableHash(identity)}`;
        const expression = evidence.expression.toLowerCase();
        const kind = expression.includes("prisma.") ? "prisma" : expression.includes("readjsonfile") ? "validated-json" : /readfile/.test(expression) ? "file" : "other";
        const retained = sourceFacts.get(key);
        if (retained) {
          retained.routeKeys.add(trajectory.routeKey);
          retained.handoffProven ||= Boolean(operation.consumerHandoff);
          if (retained.totalFields < (shape?.totalFields ?? 0)) {
            retained.typeName = shape?.typeName ?? null;
            retained.typeText = sourceDisplayType(shape, evidence.outputType);
            retained.shapeKind = shape?.kind ?? "opaque";
            retained.fields = shape?.fields ?? [];
            retained.totalFields = shape?.totalFields ?? 0;
            retained.evidenceId = evidence.id;
          }
        }
        else sourceFacts.set(key, {
          key, label: sourceLabel(evidence.compilerIdentity, operation.label), kind, file: evidence.file, line: evidence.line,
          consumerLabel: operation.boundary?.label ?? null, handoffProven: Boolean(operation.consumerHandoff),
          typeName: shape?.typeName ?? null, typeText: sourceDisplayType(shape, evidence.outputType), shapeKind: shape?.kind ?? "opaque",
          fields: shape?.fields ?? [], totalFields: shape?.totalFields ?? 0, evidenceId: evidence.id, routeKeys: new Set([trajectory.routeKey]),
        });
        keys.push(key);
      }
    }
    sourceKeysForTrajectory.set(trajectory.key, [...new Set(keys)]);
  }
  return { sourceFacts, sourceKeysForTrajectory };
}

function annotateGraphSources(
  graph: ReturnType<typeof buildExhaustiveRouteGraph>,
  sources: RouteDataInventory["sources"],
  evidence: AnalysisReport["routeData"]["evidence"],
  operations: AnalysisReport["routeData"]["operations"],
) {
  const nodes = new Map(graph.nodes.map((node) => [node.key, node]));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const boundaryIdsByConsumer = new Map<string, Set<string>>();
  for (const operation of operations) {
    if (operation.boundary?.kind !== "resource" || !operation.boundaryId) continue;
    const retained = boundaryIdsByConsumer.get(operation.boundary.label) ?? new Set<string>();
    retained.add(operation.boundaryId);
    boundaryIdsByConsumer.set(operation.boundary.label, retained);
  }
  const trajectories = graph.trajectories.map((trajectory) => {
    const sourceMethodKeys = sources
      .filter((source) => trajectory.stepKeys.some((key) => {
        const node = nodes.get(key);
        const sourceEvidence = evidenceById.get(source.evidenceId);
        if (sourceEvidence && node?.file === sourceEvidence.file && node.line === sourceEvidence.line && node.column === sourceEvidence.column) return true;
        if (!source.handoffProven || !source.consumerLabel || !node?.boundaryId) return false;
        return boundaryIdsByConsumer.get(source.consumerLabel)?.has(node.boundaryId) ?? false;
      }))
      .map((source) => source.key);
    return { ...trajectory, sourceMethodKeys };
  });
  return { ...graph, trajectories };
}

function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function uniqueById<T extends { id: string }>(items: T[]) { return [...new Map(items.map((item) => [item.id, item])).values()]; }
function routeKind(file: string, pathPattern: string): "page" | "api" { return /(?:^|\/)api(?:\/|\.|$)/i.test(file) || /^\/api(?:\/|$)/i.test(pathPattern) ? "api" : "page"; }
function isSubstitution(operation: AnalysisReport["routeData"]["operations"][number]) { return operation.effect === "select" || operation.effect === "normalize" || operation.semanticKind === "opaque" || operation.fieldEffects.some((effect) => /fallback|default|nullish|conditional|substitut|normaliz/i.test(effect.detail)); }
function sourceLabel(identity: string | null, fallback: string) { const match = identity?.match(/(?:^|[."'])((?:get|read|load|fetch|find)[A-Za-z0-9_$]+)(?:["']|$)/i); const matched = match?.[1]; return matched && !/^find(?:Many|Unique|First)(?:OrThrow)?$/i.test(matched) ? matched : fallback.replace(/^Read\s+/i, "").replace(/\s+from Prisma$/i, ""); }
function sourceDisplayType(shape: AnalysisReport["routeData"]["shapes"][number] | undefined, fallback: string) {
  if (shape?.typeName) return shape.typeName;
  if (shape?.fields.length) {
    const fields = shape.fields.map((field) => `${field.key}${field.optional ? "?" : ""}: ${cleanCompilerType(field.typeText)}`).join("; ");
    const nullable = /\|\s*(?:null|undefined)\b/.exec(shape.typeText)?.[0] ?? "";
    return `{ ${fields}; }${nullable ? ` ${nullable}` : ""}`;
  }
  return cleanCompilerType(shape?.typeText ?? fallback);
}
function cleanCompilerType(typeText: string) { return typeText.replace(/import\("[^"]+"\)\./g, ""); }
function routeGraph(report: AnalysisReport, routeKey: string, sinkIds: string[]) { const cache = routeGraphCache.get(report) ?? new Map<string, ReturnType<typeof buildExhaustiveRouteGraph>>(); routeGraphCache.set(report, cache); const retained = cache.get(routeKey); if (retained) return retained; const selected = new Set(sinkIds); const graph = buildExhaustiveRouteGraph(report.graph, report.sinks.filter((sink) => selected.has(routeSinkKey(sink)))); cache.set(routeKey, graph); return graph; }
