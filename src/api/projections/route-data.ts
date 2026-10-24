import type { AnalysisReport } from "../../types";
import { routeDataInventorySchema, type RouteDataDetail, type RouteDataInventory } from "../contracts";
import { stableHash } from "../../analysis/route-discovery";
import { buildExhaustiveRouteGraph } from "../../analysis/route-data-trajectories";
import { routeSinkKey } from "../../analysis/route-data";
import { routeTotalityForRoute } from "../../analysis/route-data-session";
import type { RouteTotalitySelectedSource } from "../../analysis/route-totality-selected-source";
import { projectRouteTotality } from "./route-totality";
import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "../../analysis/cancellation";
const routeGraphCache = new WeakMap<object, Map<string, ReturnType<typeof buildExhaustiveRouteGraph>>>();

export function buildRouteDataInventory(report: AnalysisReport, cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION): RouteDataInventory {
  cancellation.throwIfCancelled();
  const { sourceFacts, sourceKeysForTrajectory } = collectSourceFacts(report);
  for (const trajectory of report.routeData.trajectories) {
    if (!sourceKeysForTrajectory.has(trajectory.key)) sourceKeysForTrajectory.set(trajectory.key, []);
  }
  const sources = [...sourceFacts.values()].map(({ routeKeys, consumerLabels, transportBridgeIds, ...source }) => ({
    ...source,
    routeKeys: [...routeKeys].sort(lexical),
    consumerLabel: consumerLabels.size === 1 ? [...consumerLabels][0] : null,
    consumerLabels: [...consumerLabels].sort(lexical),
    transportBridgeIds: [...transportBridgeIds].sort(lexical),
  })).sort((left, right) => lexical(left.label, right.label) || lexical(left.file, right.file));
  const routes = report.routeData.routes.map((route) => {
    cancellation.throwIfCancelled();
    const trajectories = report.routeData.trajectories.filter((trajectory) => trajectory.routeKey === route.key);
    const graph = routeGraph(report, route.key, route.sinkIds);
    const sourceMethodKeys = [...new Set(trajectories.flatMap((trajectory) => sourceKeysForTrajectory.get(trajectory.key) ?? []))];
    const apiRouteKeys = [...new Set(trajectories.flatMap((trajectory) => trajectory.operationKeys
      .map((key) => report.routeData.operations.find((operation) => operation.key === key)?.transportBridge?.apiRouteKey ?? null)
      .filter((key): key is string => Boolean(key))))].sort(lexical);
    return {
      key: route.key, pathPattern: route.pathPattern, file: route.file, componentIdentityId: route.componentIdentityId,
      parameters: route.parameters, confidence: route.confidence, componentNames: route.componentNames,
      routeKind: routeKind(route.file, route.pathPattern), sourceMethodKeys, apiRouteKeys,
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
    terminalCount: trajectory.terminalIds.length, routeReachableTerminalCount: trajectory.routeReachableTerminalCount, completeness: trajectory.completeness, omissions: trajectory.omissions,
  }));
  cancellation.throwIfCancelled();
  const inventory = routeDataInventorySchema.parse({ routes, sources, trajectories, totals: { routes: routes.length, sources: sources.length, trajectories: routes.reduce((sum, route) => sum + route.trajectoryCount, 0), complete: routes.reduce((sum, route) => sum + route.completeTrajectoryCount, 0) } });
  cancellation.throwIfCancelled();
  return inventory;
}

export function buildRouteDataDetail(
  report: AnalysisReport,
  routeKey: string,
  trajectoryKey: string,
  selectedSourceKey: string | null = null,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteDataDetail | null {
  cancellation.throwIfCancelled();
  const inventory = buildRouteDataInventory(report, cancellation);
  cancellation.throwIfCancelled();
  const route = inventory.routes.find((item) => item.key === routeKey);
  const analysisRoute = report.routeData.routes.find((item) => item.key === routeKey);
  const trajectory = report.routeData.trajectories.find((item) => item.key === trajectoryKey && item.routeKey === routeKey);
  if (!route || !analysisRoute || !trajectory) return null;
  const operations = trajectory.operationKeys.map((key) => report.routeData.operations.find((operation) => operation.key === key)).filter((operation): operation is NonNullable<typeof operation> => Boolean(operation));
  const evidenceIds = new Set(operations.flatMap((operation) => operation.sourceExpressionIds));
  const evidence = uniqueById(report.routeData.evidence.filter((item) => evidenceIds.has(item.id)))
    .map(projectRouteDataEvidence);
  const routeSources = inventory.sources.filter((source) => route.sourceMethodKeys.includes(source.key));
  if (selectedSourceKey && !route.sourceMethodKeys.includes(selectedSourceKey)) return null;
  const selectedSource = selectedTotalitySource(selectedSourceKey, routeSources, report.routeData.evidence);
  const totality = projectRouteTotality(routeTotalityForRoute(report.routeData, routeKey, selectedSource, cancellation) ?? undefined, cancellation);
  const detailSources = selectedSourceKey && totality
    ? addSelectedSourceFieldPaths(routeSources, selectedSource, totality)
    : routeSources;
  cancellation.throwIfCancelled();
  const detail: RouteDataDetail = {
    route, trajectory, operations, evidence, sources: detailSources,
    hiddenComponentPolicy: report.meta.hiddenComponentPolicy,
    totality,
  };
  cancellation.throwIfCancelled();
  return detail;
}

function selectedTotalitySource(
  sourceKey: string | null,
  sources: RouteDataInventory["sources"],
  evidence: AnalysisReport["routeData"]["evidence"],
): RouteTotalitySelectedSource | null {
  if (!sourceKey) return null;
  const sourceMatches = sources.filter((source) => source.key === sourceKey);
  if (sourceMatches.length !== 1) return { key: sourceKey, evidence: null };
  const evidenceMatches = evidence.filter((item) => item.id === sourceMatches[0].evidenceId);
  const [match] = evidenceMatches;
  if (!match || !match.programElementId || !evidenceMatches.every((item) => sameEvidenceIdentity(item, match))) {
    return { key: sourceKey, evidence: null };
  }
  return {
    key: sourceKey,
    evidence: {
      id: match.id,
      elementId: match.programElementId,
      file: match.file,
      line: match.line,
      column: match.column,
      span: match.span,
    },
  };
}

function addSelectedSourceFieldPaths(
  sources: RouteDataInventory["sources"],
  selectedSource: RouteTotalitySelectedSource | null,
  totality: NonNullable<RouteDataDetail["totality"]>,
): RouteDataInventory["sources"] {
  if (!selectedSource?.evidence) return sources;
  const fields = new Set(
    totality.fieldLineage.attachments
      .filter((attachment) => sameSelectedSourceOrigin(attachment.origin, selectedSource))
      .map((attachment) => attachment.field.label),
  );
  for (const frontier of totality.fieldLineage.frontiers) {
    if (sameSelectedSourceOrigin(frontier.origin, selectedSource) && frontier.field) fields.add(frontier.field.label);
  }
  if (!fields.size) return sources;
  return sources.map((source) => {
    if (source.key !== selectedSource.key) return source;
    const existing = new Set(source.fields.map((field) => field.key));
    const added = [...fields]
      .filter((field) => !existing.has(field))
      .sort(lexical)
      .map((key) => ({ key, typeText: "route field", optional: false }));
    const mergedFields = [...source.fields, ...added];
    return { ...source, fields: mergedFields, totalFields: mergedFields.length };
  });
}

function sameSelectedSourceOrigin(
  origin: { elementId: string; role: string; selectedEvidenceId: string | null },
  selectedSource: RouteTotalitySelectedSource,
) {
  return origin.elementId === selectedSource.evidence?.elementId
    && origin.role === "filesystem"
    && origin.selectedEvidenceId === selectedSource.evidence.id;
}

function sameEvidenceIdentity(
  left: AnalysisReport["routeData"]["evidence"][number],
  right: AnalysisReport["routeData"]["evidence"][number],
): boolean {
  return left.id === right.id
    && left.programElementId === right.programElementId
    && left.file === right.file
    && left.line === right.line
    && left.column === right.column
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}

function projectRouteDataEvidence(
  evidence: AnalysisReport["routeData"]["evidence"][number],
): Omit<typeof evidence, "programElementId"> {
  const { programElementId: _programElementId, ...projected } = evidence;
  return projected;
}

function collectSourceFacts(report: AnalysisReport) {
  const sourceFacts = new Map<string, {
    key: string; label: string; kind: "prisma" | "file" | "validated-json" | "other"; file: string; line: number;
    consumerLabels: Set<string>; transportBridgeIds: Set<string>; handoffProven: boolean;
    typeName: string | null; typeText: string; shapeKind: "primitive" | "object" | "collection" | "union" | "opaque";
    fields: Array<{ key: string; typeText: string; optional: boolean }>; totalFields: number;
    handoffFields: string[]; evidenceId: string; routeKeys: Set<string>;
  }>();
  const sourceKeysForTrajectory = new Map<string, string[]>();
  for (const trajectory of report.routeData.trajectories) {
    const keys: string[] = [];
    const sourceOperations = trajectory.operationKeys
      .map((key) => report.routeData.operations.find((item) => item.key === key))
      .filter((item): item is NonNullable<typeof item> => item?.semanticKind === "read");
    for (const operation of sourceOperations) {
      const sourceShape = report.routeData.shapes.find((item) => operation.outputShapeIds.includes(item.id));
      const handoffShape = operation.consumerHandoff
        ? report.routeData.shapes.find((item) => item.id === operation.consumerHandoff?.outputShapeId)
        : undefined;
      const inventoryShape = sourceInventoryShape(sourceShape, handoffShape);
      const displayShape = inventoryShape ?? sourceShape;
      for (const evidenceId of operation.sourceExpressionIds) {
        const evidence = report.routeData.evidence.find((item) => item.id === evidenceId);
        if (!evidence) continue;
        const identity = `${evidence.compilerIdentity ?? "source-call"}:${evidence.file}:${evidence.span.startLine}:${evidence.span.startColumn}:${evidence.span.endLine}:${evidence.span.endColumn}`;
        const key = `source-method:${stableHash(identity)}`;
        const expression = evidence.expression.toLowerCase();
        const kind = expression.includes("prisma.") ? "prisma" : expression.includes("readjsonfile") ? "validated-json" : /readfile/.test(expression) ? "file" : "other";
        const retained = sourceFacts.get(key);
        if (retained) {
          retained.routeKeys.add(trajectory.routeKey);
          if (operation.boundary?.label) retained.consumerLabels.add(operation.boundary.label);
          if (operation.transportBridge?.id) retained.transportBridgeIds.add(operation.transportBridge.id);
          retained.handoffProven ||= Boolean(operation.consumerHandoff);
          retained.handoffFields = [...new Set([
            ...retained.handoffFields,
            ...(operation.consumerHandoff?.fieldPaths ?? []),
          ])].sort(lexical);
          if (retained.totalFields < (inventoryShape?.totalFields ?? 0)) {
            retained.typeName = displayShape?.typeName ?? null;
            retained.typeText = sourceDisplayType(displayShape, evidence.outputType);
            retained.shapeKind = displayShape?.kind ?? "opaque";
            retained.fields = inventoryShape?.fields ?? [];
            retained.totalFields = inventoryShape?.totalFields ?? 0;
            retained.evidenceId = evidence.id;
          }
        }
        else sourceFacts.set(key, {
          key, label: sourceLabel(evidence.compilerIdentity, operation.label), kind, file: evidence.file, line: evidence.line,
          consumerLabels: new Set(operation.boundary?.label ? [operation.boundary.label] : []),
          transportBridgeIds: new Set(operation.transportBridge?.id ? [operation.transportBridge.id] : []),
          handoffProven: Boolean(operation.consumerHandoff),
          typeName: displayShape?.typeName ?? null, typeText: sourceDisplayType(displayShape, evidence.outputType), shapeKind: displayShape?.kind ?? "opaque",
          fields: inventoryShape?.fields ?? [], totalFields: inventoryShape?.totalFields ?? 0,
          handoffFields: operation.consumerHandoff?.fieldPaths ?? [],
          evidenceId: evidence.id, routeKeys: new Set([trajectory.routeKey]),
        });
        keys.push(key);
      }
    }
    sourceKeysForTrajectory.set(trajectory.key, [...new Set(keys)]);
  }
  return { sourceFacts, sourceKeysForTrajectory };
}

function sourceInventoryShape(
  sourceShape: AnalysisReport["routeData"]["shapes"][number] | undefined,
  handoffShape: AnalysisReport["routeData"]["shapes"][number] | undefined,
) {
  if (handoffShape && handoffShape.kind !== "primitive") return handoffShape;
  return sourceShape?.kind === "primitive" ? undefined : sourceShape;
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
