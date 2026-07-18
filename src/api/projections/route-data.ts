import type { AnalysisReport } from "../../types";
import { routeDataDetailSchema, routeDataInventorySchema, type RouteDataDetail, type RouteDataInventory } from "../contracts";
import { stableHash } from "../../analysis/route-discovery";
import { buildExhaustiveRouteGraph } from "../../analysis/route-data-trajectories";
import { routeSinkKey } from "../../analysis/route-data";
const routeGraphCache = new WeakMap<object, Map<string, ReturnType<typeof buildExhaustiveRouteGraph>>>();

export function buildRouteDataInventory(report: AnalysisReport): RouteDataInventory {
  const sourceRoutes = new Map<string, Set<string>>();
  const sourceFacts = new Map<string, { key: string; label: string; kind: "prisma" | "file" | "validated-json" | "other"; file: string; line: number }>();
  const sourceForTrajectory = new Map<string, string>();
  for (const trajectory of report.routeData.trajectories) {
    const sourceOperation = trajectory.operationKeys.map((key) => report.routeData.operations.find((item) => item.key === key)).find((item) => item?.semanticKind === "read");
    const evidence = report.routeData.evidence.find((item) => sourceOperation?.sourceExpressionIds.includes(item.id));
    if (!sourceOperation || !evidence) continue;
    const identity = evidence.compilerIdentity ?? `${evidence.file}:${evidence.span.startLine}:${evidence.span.startColumn}`;
    const key = `source-method:${stableHash(identity)}`;
    const expression = evidence.expression.toLowerCase();
    const kind = expression.includes("prisma.") ? "prisma" : expression.includes("readjsonfile") ? "validated-json" : /readfile/.test(expression) ? "file" : "other";
    sourceFacts.set(key, { key, label: sourceLabel(evidence.compilerIdentity, sourceOperation.label), kind, file: evidence.file, line: evidence.line });
    const routes = sourceRoutes.get(key) ?? new Set<string>(); routes.add(trajectory.routeKey); sourceRoutes.set(key, routes);
    sourceForTrajectory.set(trajectory.key, key);
  }
  const sources = [...sourceFacts.values()].map((source) => ({ ...source, routeKeys: [...(sourceRoutes.get(source.key) ?? [])].sort(lexical) })).sort((left, right) => lexical(left.label, right.label) || lexical(left.file, right.file));
  const routes = report.routeData.routes.map((route) => {
    const trajectories = report.routeData.trajectories.filter((trajectory) => trajectory.routeKey === route.key);
    const graph = routeGraph(report, route.key, route.sinkIds);
    const sourceMethodKeys = [...new Set(trajectories.map((trajectory) => sourceForTrajectory.get(trajectory.key)).filter((key): key is string => Boolean(key)))];
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
    sourceMethodKey: sourceForTrajectory.get(trajectory.key) ?? null,
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
  const shapeIds = new Set(operations.flatMap((operation) => [...operation.inputShapeIds, ...operation.outputShapeIds]));
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
  const rootComponent = componentNodes.find((node) => node.parentId === null);
  const sourceEdges = rootComponent ? sourceNodes.map((node) => ({ id: `context-edge:${node.id}:${rootComponent.id}`, from: node.id, to: rootComponent.id, kind: "data" as const })) : [];
  const edges = [...sourceEdges, ...hierarchyEdges];
  const exhaustiveGraph = routeGraph(report, analysisRoute.key, analysisRoute.sinkIds);
  return routeDataDetailSchema.parse({
    route, trajectory, operations, values, shapes: report.routeData.shapes.filter((shape) => shapeIds.has(shape.id)),
    evidence, terminals, context: { nodes, edges }, exhaustiveGraph,
  });
}

function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function uniqueById<T extends { id: string }>(items: T[]) { return [...new Map(items.map((item) => [item.id, item])).values()]; }
function routeKind(file: string, pathPattern: string): "page" | "api" { return /(?:^|\/)api(?:\/|\.|$)/i.test(file) || /^\/api(?:\/|$)/i.test(pathPattern) ? "api" : "page"; }
function isSubstitution(operation: AnalysisReport["routeData"]["operations"][number]) { return operation.effect === "select" || operation.effect === "normalize" || operation.semanticKind === "opaque" || operation.fieldEffects.some((effect) => /fallback|default|nullish|conditional|substitut|normaliz/i.test(effect.detail)); }
function sourceLabel(identity: string | null, fallback: string) { const match = identity?.match(/(?:^|[."'])((?:get|read|load|fetch|find)[A-Za-z0-9_$]+)(?:["']|$)/i); return match?.[1] ?? fallback.replace(/^Read\s+/i, "").replace(/\s+from Prisma$/i, ""); }
function routeGraph(report: AnalysisReport, routeKey: string, sinkIds: string[]) { const cache = routeGraphCache.get(report) ?? new Map<string, ReturnType<typeof buildExhaustiveRouteGraph>>(); routeGraphCache.set(report, cache); const retained = cache.get(routeKey); if (retained) return retained; const selected = new Set(sinkIds); const graph = buildExhaustiveRouteGraph(report.graph, report.sinks.filter((sink) => selected.has(routeSinkKey(sink)))); cache.set(routeKey, graph); return graph; }
