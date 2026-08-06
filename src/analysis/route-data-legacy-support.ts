import path from "node:path";
import type * as TypeScript from "typescript";
import type { Sink, SourceSpan } from "../types";
import {
  declarationIdentity,
  isCanonicalCreateResourceCall,
  resolveResourceFetcher,
  returnedConsumerFieldPaths,
  returnedConsumerValue,
} from "./route-data-resource";
import { httpBridgeLabel, type RouteDataHttpBridge, type RouteDataHttpBridgeResolution } from "./route-data-http";
import { stableHash } from "./route-discovery";
import type {
  DataOperation,
  RouteDataBoundary,
  RouteDataEffect,
  RouteDataEvidence,
  RouteDataFieldEffect,
  RouteDataOperationOwner,
  RouteDataTerminal,
  RouteEvidenceConfidence,
  RouteRecord,
  ValueShapeSummary,
} from "./route-data";

export type LegacyRouteCandidate = {
  stage: number;
  kind: DataOperation["semanticKind"];
  effect: RouteDataEffect;
  label: string;
  node: TypeScript.Node;
  sourceFile: TypeScript.SourceFile;
  boundary: RouteDataBoundary | null;
  confidence: RouteEvidenceConfidence;
  compilerIdentity?: string | null;
  fieldEffects: RouteDataFieldEffect[];
  consumedByRoute: boolean;
  consumerReturn: TypeScript.Expression | null;
  consumerFieldPaths: string[];
  shapeNode: TypeScript.Node | null;
  transportBridge: RouteDataHttpBridge | null;
};

const LEGACY_TRAJECTORY_OPERATION_CAP = 32;
const LEGACY_ROUTE_TERMINAL_CAP = 4;

export function collectLegacyCandidates(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  program: TypeScript.Program,
  root: string,
  reachable: Set<string>,
  calledDeclarations: Map<string, Set<string>>,
  resourceOutputs: Map<string, TypeScript.Expression>,
  consumerFields: Map<string, Map<string, string[]>>,
  httpBridges: Map<TypeScript.CallExpression, RouteDataHttpBridgeResolution>,
) {
  const candidates: LegacyRouteCandidate[] = [];
  for (const absolute of reachable) {
    const sourceFile = program.getSourceFile(absolute);
    if (!sourceFile || isDevSupportFile(sourceFile.fileName)) continue;
    const visit = (node: TypeScript.Node) => {
      if (ts.isCallExpression(node)) {
        const text = node.expression.getText(sourceFile);
        const full = node.getText(sourceFile);
        const prisma = text.match(/(?:^|\.)prisma\.([A-Za-z0-9_]+)\.(findMany|findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow)$/);
        if (prisma) candidates.push(legacyCandidate(0, "read", "preserve", `Read ${humanize(prisma[1])} ${/Many/.test(prisma[2]) ? "rows" : "record"} from Prisma`, node, sourceFile, null, "high"));
        else if (/\breadFile(?:Sync)?$/.test(text)) candidates.push(legacyCandidate(0, "read", "preserve", "Read persisted file contents", node, sourceFile, null, "high"));
        else if (/\breadJsonFile$/.test(text)) candidates.push(legacyCandidate(0, "read", "preserve", `Read and validate ${labelFromArgument(node.arguments[0], sourceFile) || "saved JSON"}`, node, sourceFile, { kind: "call", label: "readJsonFile" }, "high"));
        if (text === "JSON.parse" || text.endsWith(".JSON.parse")) candidates.push(legacyCandidate(1, "parse", "normalize", "Parse persisted JSON text", node, sourceFile, null, "high"));
        if (/\.parse$/.test(text) && text !== "JSON.parse" && (/(?:schema|Schema)\.parse$/.test(text) || full.includes("z."))) candidates.push(legacyCandidate(2, "validate", "normalize", `Validate ${humanize(text.replace(/\.parse$/, "").split(".").at(-1) ?? "schema")} shape`, node, sourceFile, null, "high"));
        if (text === "query" || text.endsWith(".query")) candidates.push(legacyCandidate(4, "boundary", "preserve", `Define ${queryName(ts, node)} query`, node, sourceFile, { kind: "query", label: "SolidStart query" }, "high"));
        if (isCanonicalCreateResourceCall(ts, checker, node) || callExpressionName(ts, node) === "createAsync") {
          const bridge = httpBridges.get(node);
          const resource = legacyCandidate(5, "boundary", "preserve", `Load ${resourceName(ts, node)} resource`, node, sourceFile, { kind: "resource", label: resolveResourceFetcher(ts, checker, root, node)?.label ?? `Solid ${callExpressionName(ts, node)}` }, "high");
          resource.transportBridge = bridge?.bridge ?? null;
          resource.consumerReturn = bridge?.resourceReturn ?? null;
          resource.consumerFieldPaths = bridge?.resourceReturn ? ["*"] : [];
          candidates.push(resource);
        }
        if (/\.(?:map|flatMap)$/.test(text)) candidates.push(legacyCandidate(3, "map", "project", `Map ${collectionName(text)} elements`, node, sourceFile, null, "medium"));
        if (/\.filter$/.test(text) && /\bday/i.test(full)) candidates.push(legacyCandidate(8, "group", "group", "Group values by day", node, sourceFile, null, "high"));
        else if (/\.(?:filter|find)$/.test(text) || /(?:select|resolve|loaded|visible)/i.test(text)) candidates.push(legacyCandidate(6, "select", "select", `Select ${humanize(callName(text))} value`, node, sourceFile, null, "medium"));
        if (/(?:group|overlap|bucket|partition)/i.test(text)) candidates.push(legacyCandidate(8, "group", "group", `${/overlap/i.test(text) ? "Assign overlap grouping" : `Group values with ${humanize(callName(text))}`}`, node, sourceFile, { kind: "call", label: callName(text) }, "medium"));
        if (/(?:geometry|position|bounds|grid|coordinate|viewport|segment|rect)/i.test(`${text} ${sourceFile.fileName}`)) candidates.push(legacyCandidate(9, "derive", "derive", `Derive ${humanize(callName(text))} geometry`, node, sourceFile, { kind: "call", label: callName(text) }, "medium"));
      }
      if (ts.isFunctionDeclaration(node) && node.name && /^map[A-Z]/.test(node.name.text)) candidates.push(legacyCandidate(3, "map", "project", `Map input to ${returnTypeName(checker, node)}`, node, sourceFile, { kind: "call", label: node.name.text }, "high"));
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^map[A-Z]/.test(node.name.text) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) candidates.push(legacyCandidate(3, "map", "project", `Map row to ${returnTypeName(checker, node.initializer)}`, node.initializer, sourceFile, { kind: "call", label: node.name.text }, "high"));
      if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) && node.initializer && ts.isObjectLiteralExpression(node.initializer) && node.initializer.properties.some((property) => ts.isSpreadAssignment(property))) {
        const replaced = node.initializer.properties.filter(ts.isPropertyAssignment).map((property) => property.name.getText(sourceFile));
        candidates.push(legacyCandidate(7, "augment", "augment", replaced.length ? `Augment value and replace ${replaced.join(" / ")}` : "Augment value with object spread", node.initializer, sourceFile, null, "high", replaced.map((field) => ({ kind: "augment", field, detail: `${field} is added or replaced after preserving spread fields.` }))));
      }
      if (ts.isObjectLiteralExpression(node) && node.properties.some((property) => ts.isSpreadAssignment(property)) && !(ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent))) {
        const replaced = node.properties.filter(ts.isPropertyAssignment).map((property) => property.name.getText(sourceFile));
        candidates.push(legacyCandidate(7, "augment", "augment", replaced.length ? `Augment value and replace ${replaced.join(" / ")}` : "Augment value with object spread", node, sourceFile, null, "high", replaced.map((field) => ({ kind: "augment", field, detail: `${field} is added or replaced after preserving spread fields.` }))));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  for (const bridge of httpBridges.values()) {
    for (const source of bridge.persistedSources) {
      const sourceCandidate = legacyCandidate(0, "read", "preserve", "Read persisted source through API", source.call, source.call.getSourceFile(), { kind: "call", label: httpBridgeLabel(bridge.bridge) }, "high");
      sourceCandidate.consumedByRoute = true;
      sourceCandidate.consumerReturn = (source.shapeNode ?? source.call) as TypeScript.Expression;
      sourceCandidate.consumerFieldPaths = ["*"];
      sourceCandidate.shapeNode = source.shapeNode;
      sourceCandidate.transportBridge = bridge.bridge;
      candidates.push(sourceCandidate);
    }
  }
  return candidates.flatMap((item) => {
    if (item.kind !== "read" || item.transportBridge) return [item];
    const owner = callableOwner(ts, item.node);
    const ownerIdentity = owner ? declarationIdentity(owner) : null;
    const resourceLabels = ownerIdentity ? [...(calledDeclarations.get(ownerIdentity) ?? [])].sort(lexical) : [];
    const queryOwnerLabel = owner && insideBoundaryCall(ts, item.node, "query") ? declarationName(ts, owner) : null;
    const consumerLabels = resourceLabels.length ? resourceLabels : queryOwnerLabel ? [queryOwnerLabel] : [];
    const sourceReturn = ts.isCallExpression(item.node) ? returnedConsumerValue(ts, checker, item.node) : null;
    const shared = {
      consumedByRoute: owner ? calledDeclarations.has(declarationIdentity(owner)) && !insideBoundaryCall(ts, item.node, "action") : false,
      consumerReturn: sourceReturn,
    };
    if (!consumerLabels.length) return [{ ...item, ...shared }];
    return consumerLabels.map((label): LegacyRouteCandidate => ({
      ...item,
      ...shared,
      boundary: { kind: insideBoundaryCall(ts, item.node, "query") ? "query" : "call", label },
      consumerReturn: sourceReturn ? resourceOutputs.get(label) ?? sourceReturn : null,
      consumerFieldPaths: [
        ...(ownerIdentity ? consumerFields.get(ownerIdentity)?.get(label) ?? [] : []),
        ...(sourceReturn && ts.isCallExpression(item.node)
          ? returnedConsumerFieldPaths(ts, checker, item.node, sourceReturn)
          : []),
      ].filter((field, index, all) => all.indexOf(field) === index).sort(lexical),
    }));
  });
}

export function chooseLegacyCandidates(ts: typeof TypeScript, candidates: LegacyRouteCandidate[], sinks: Sink[], root: string, route: RouteRecord, filesByName: Map<string, TypeScript.SourceFile>) {
  const selected: LegacyRouteCandidate[] = [];
  const hasPrismaRead = candidates.some((item) => item.kind === "read" && item.label.includes("Prisma"));
  const consumedReadCount = candidates.filter((item) => item.stage === 0 && item.consumedByRoute).length;
  const selectionCap = (hasPrismaRead ? LEGACY_TRAJECTORY_OPERATION_CAP : LEGACY_TRAJECTORY_OPERATION_CAP + 3) + consumedReadCount * 2;
  const relevantCandidates = (hasPrismaRead
    ? candidates.filter((item) => item.kind !== "parse" && item.kind !== "validate")
    : candidates
  ).filter((item) =>
    item.kind !== "render"
    && item.boundary?.kind !== "component"
    && !dominatedRawRead(item, candidates)
  );
  const push = (items: LegacyRouteCandidate[], max: number) => {
    for (const item of items.sort((left, right) => candidateRelevance(right, route) - candidateRelevance(left, route) || confidenceRank(right.confidence) - confidenceRank(left.confidence) || candidateSort(left, right))) {
      if (selected.length >= selectionCap || selected.filter((value) => value.stage === item.stage).length >= max) break;
      const key = candidateSelectionIdentity(item);
      if (!selected.some((value) => candidateSelectionIdentity(value) === key)) selected.push(item);
    }
  };
  const stageCaps: Array<[number, number]> = hasPrismaRead
    ? [[0, consumedReadCount], [1, 0], [2, 0], [3, 1], [4, 8], [5, 8], [6, 2], [7, 2], [8, 2], [9, 2], [9.5, 1], [10, 1]]
    : [[0, Math.max(4, consumedReadCount)], [1, 1], [2, 1], [3, 1], [4, 1], [5, 3], [6, 2], [7, 1], [8, 0], [9, 0], [9.5, 1], [10, 1]];
  for (const [stage, max] of stageCaps) {
    const stageCandidates = relevantCandidates.filter((item) => item.stage === stage);
    if (stage !== 0) { push(stageCandidates, max); continue; }
    const consumedReads = stageCandidates.filter((item) => item.consumedByRoute);
    const resourceConsumers = new Set(candidates.filter((item) => item.boundary?.kind === "resource").map((item) => item.boundary!.label)); const resourceReads = [...resourceConsumers].flatMap((consumer) => consumedReads.filter((item) => item.boundary?.label === consumer).sort(preferredSourceCandidate).slice(0, 1));
    push(resourceReads, max);
    push(consumedReads, max);
  }
  const sourceConsumers = new Set(selected.filter((item) => item.kind === "read").map((item) => item.boundary?.label).filter((label): label is string => Boolean(label)));
  for (const resource of candidates.filter((item) => item.boundary?.kind === "resource" && sourceConsumers.has(item.boundary.label))) {
    if (!selected.some((item) => item.sourceFile === resource.sourceFile && item.node === resource.node)) selected.push(resource);
  }
  const render = renderCandidateForSink(ts, root, route, sinks, filesByName);
  if (render) {
    if (selected.length >= selectionCap) selected[selected.length - 1] = render;
    else selected.push(render);
  }
  return selected.sort(candidateSort).slice(0, selectionCap);
}

export function evidenceForLegacyCandidate(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, value: LegacyRouteCandidate): RouteDataEvidence {
  const point = value.sourceFile.getLineAndCharacterOfPosition(value.node.getStart(value.sourceFile));
  const symbolNode = ts.isCallExpression(value.node) ? value.node.expression : (value.node as TypeScript.NamedDeclaration).name ?? value.node;
  const symbol = checker.getSymbolAtLocation(symbolNode);
  const type = safeTypeAt(checker, value.node);
  const file = relative(root, value.sourceFile.fileName);
  return { id: `evidence:${stableHash(`${file}:${point.line + 1}:${point.character + 1}:${value.kind}`)}`, expression: value.node.getText(value.sourceFile).replace(/\s+/g, " ").slice(0, 320), operationKind: value.kind, file, line: point.line + 1, column: point.character + 1, span: spanFor(value.sourceFile, value.node), inputType: type, outputType: type, compilerIdentity: symbol ? checker.getFullyQualifiedName(symbol) : null, confidence: value.confidence, unknownReason: value.kind === "opaque" ? "Unresolved value transition" : null };
}

export function shapeForLegacyCandidate(checker: TypeScript.TypeChecker, node: TypeScript.Node): Omit<ValueShapeSummary, "id"> {
  try {
    const type = checker.getTypeAtLocation(node);
    const awaitedType = checker.getAwaitedType(type) ?? type;
    const resolvedType = checker.getNonNullableType(awaitedType);
    const collection = checker.isArrayType(resolvedType) || checker.isTupleType(resolvedType);
    const elementType = collection && "getTypeArguments" in checker
      ? checker.getTypeArguments(resolvedType as TypeScript.TypeReference)[0] ?? resolvedType
      : resolvedType;
    const properties = elementType.getProperties();
    const fields = properties.map((property) => {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      const propertySymbol = checker.getPropertyOfType(elementType, property.getName()) ?? property;
      const propertyType = checker.getTypeOfSymbolAtLocation(propertySymbol, declaration ?? node);
      return { key: property.getName(), typeText: checker.typeToString(propertyType), optional: Boolean(property.flags & 16_777_216) };
    });
    const coreTypeText = checker.typeToString(elementType, node, 1);
    const primitive = /^(?:string|number|boolean|bigint|symbol|null|undefined|void)$/.test(coreTypeText);
    const symbolName = elementType.aliasSymbol?.getName() ?? elementType.getSymbol()?.getName() ?? null;
    const typeName = symbolName?.startsWith("__") ? null : symbolName;
    return { typeName, typeText: coreTypeText, kind: collection ? "collection" : primitive ? "primitive" : elementType.isUnion() ? "union" : properties.length ? "object" : coreTypeText === "any" || coreTypeText === "unknown" ? "opaque" : "object", fields, totalFields: properties.length, opacityReason: coreTypeText === "any" || coreTypeText === "unknown" ? `Checker type is ${coreTypeText}.` : null };
  } catch { return { typeName: null, typeText: safeTypeAt(checker, node), kind: "opaque", fields: [], totalFields: 0, opacityReason: "Checker shape lookup failed." }; }
}

export function buildLegacyTerminals(route: RouteRecord, sinks: Sink[], operationKey: string | null): RouteDataTerminal[] {
  if (!operationKey) return [];
  return [...sinks].sort((a, b) => sinkRelevance(route, b) - sinkRelevance(route, a) || b.metrics.maximumPathDepth - a.metrics.maximumPathDepth || lexical(a.file, b.file) || a.line - b.line).slice(0, LEGACY_ROUTE_TERMINAL_CAP).map((sink) => ({ id: `terminal:${stableHash(`${route.key}:${sink.file}:${sink.line}:${sink.column}:${sink.label}`)}`, label: sink.category === "style" ? `Style attribute: ${sink.label}` : sink.label, file: sink.file, line: sink.line, component: sink.renderContext.component, operationKey }));
}

export function legacyOperationOwner(ts: typeof TypeScript, root: string, candidate: LegacyRouteCandidate): RouteDataOperationOwner | null {
  const owner = callableOwner(ts, candidate.node); const label = owner ? declarationName(ts, owner) : null;
  if (!owner || !label) return null; const sourceFile = owner.getSourceFile(); const point = sourceFile.getLineAndCharacterOfPosition(owner.getStart(sourceFile));
  return { label, file: relative(root, sourceFile.fileName), line: point.line + 1 };
}

export function legacyValueLabel(candidate: LegacyRouteCandidate, typeText: string) { return candidate.label.replace(/^Read and validate\s+/i, "").replace(/^(?:Read|Map|Load|Cross|Overlay|Group|Assign|Derive|Render|Select|Validate|Parse)\s+/i, "") || typeText; }
export function legacyEffectSummary(effect: RouteDataEffect, shape: Omit<ValueShapeSummary, "id">) { if (shape.opacityReason) return "Shape unknown"; if (effect === "augment") return `Preserve existing fields and add or replace participating fields (${shape.totalFields} total).`; if (effect === "project") return `Project into ${shape.typeName ?? shape.typeText} (${shape.totalFields} fields).`; return `${humanize(effect)} ${shape.totalFields ? `${shape.totalFields} fields` : shape.typeText}.`; }

function dominatedRawRead(candidate: LegacyRouteCandidate, candidates: LegacyRouteCandidate[]) {
  if (candidate.kind !== "read" || candidate.label !== "Read persisted file contents") return false;
  const semanticReads = candidates.filter((item) => item.kind === "read" && item.label.startsWith("Read and validate ") && item.boundary?.label === candidate.boundary?.label);
  if (!semanticReads.length) return false;
  return candidate.consumerFieldPaths.length === 0 || candidate.consumerFieldPaths.every((field) => semanticReads.some((item) => item.consumerFieldPaths.includes(field)));
}

function candidateSelectionIdentity(item: LegacyRouteCandidate) {
  if (item.kind !== "read") return `${item.stage}:${item.label}`;
  return `${item.stage}:${item.sourceFile.fileName}:${item.node.getStart(item.sourceFile)}:${item.boundary?.kind ?? ""}:${item.boundary?.label ?? ""}`;
}

function renderCandidateForSink(ts: typeof TypeScript, root: string, route: RouteRecord, sinks: Sink[], filesByName: Map<string, TypeScript.SourceFile>) {
  const sink = [...sinks].sort((a, b) => sinkRelevance(route, b) - sinkRelevance(route, a) || b.metrics.maximumPathDepth - a.metrics.maximumPathDepth || lexical(a.file, b.file) || a.line - b.line)[0];
  if (!sink) return null;
  const sourceFile = filesByName.get(path.normalize(path.resolve(root, sink.file)));
  if (!sourceFile) return null;
  const node = nodeForSpan(ts, sourceFile, sink.span);
  const target = sink.renderContext.component ?? sink.renderContext.tag ?? "JSX";
  const attribute = sink.renderContext.attribute ?? sink.label;
  return legacyCandidate(10, "render", "render", `Render ${attribute} in ${target}`, node, sourceFile, null, sink.confidence >= .75 ? "high" : "medium");
}

function callableOwner(ts: typeof TypeScript, node: TypeScript.Node): TypeScript.Declaration | null {
  let current: TypeScript.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current;
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isVariableDeclaration(current.parent)) return current.parent;
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isCallExpression(current.parent)) {
      const wrapper = current.parent;
      if (["query", "action"].includes(callExpressionName(ts, wrapper)) && ts.isVariableDeclaration(wrapper.parent)) return wrapper.parent;
    }
    if (ts.isMethodDeclaration(current)) return current;
    current = current.parent;
  }
  return null;
}

function insideBoundaryCall(ts: typeof TypeScript, node: TypeScript.Node, boundaryName: string) {
  let current: TypeScript.Node | undefined = node.parent;
  while (current) {
    if (ts.isCallExpression(current) && callExpressionName(ts, current) === boundaryName) return true;
    current = current.parent;
  }
  return false;
}

function callExpressionName(ts: typeof TypeScript, node: TypeScript.CallExpression) {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return "";
}

function nodeForSpan(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, span: SourceSpan) {
  const start = sourceFile.getPositionOfLineAndCharacter(span.startLine - 1, span.startColumn - 1);
  const end = sourceFile.getPositionOfLineAndCharacter(span.endLine - 1, span.endColumn - 1);
  let best: TypeScript.Node = sourceFile;
  const visit = (node: TypeScript.Node) => { if (node.getStart(sourceFile) <= start && node.getEnd() >= end) { best = node; ts.forEachChild(node, visit); } };
  visit(sourceFile);
  return best;
}

function legacyCandidate(stage: number, kind: LegacyRouteCandidate["kind"], effect: RouteDataEffect, label: string, node: TypeScript.Node, sourceFile: TypeScript.SourceFile, boundary: RouteDataBoundary | null, confidence: RouteEvidenceConfidence, fieldEffects: RouteDataFieldEffect[] = []): LegacyRouteCandidate { return { stage, kind, effect, label, node, sourceFile, boundary, confidence, fieldEffects, consumedByRoute: kind !== "read", consumerReturn: null, consumerFieldPaths: [], shapeNode: null, transportBridge: null }; }
function candidateSort(a: LegacyRouteCandidate, b: LegacyRouteCandidate) { return a.stage - b.stage || lexical(a.sourceFile.fileName, b.sourceFile.fileName) || a.node.getStart(a.sourceFile) - b.node.getStart(b.sourceFile); }
function candidateRelevance(candidate: LegacyRouteCandidate, route: RouteRecord) { const tokens = route.pathPattern.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4); const dynamicStems = route.parameters.map((parameter) => parameter.name.replace(/Id$/, "").toLowerCase()).filter((token) => token.length >= 4); const haystack = `${candidate.sourceFile.fileName} ${candidate.label}`.toLowerCase(); const componentScore = route.componentNames.some((name) => path.basename(candidate.sourceFile.fileName).replace(/\.[^.]+$/, "") === name) ? 8 : 0; const directShellScore = candidate.boundary?.kind === "component" && route.componentNames.includes(candidate.boundary.label) && candidate.sourceFile.fileName.replaceAll(path.sep, "/").endsWith(route.file) ? 12 : 0; const mapperScore = candidate.label.startsWith("Map row to ") ? 10 : 0; const detailScore = dynamicStems.some((stem) => haystack.includes(`${stem}-detail`)) ? 6 : 0; const jsonBoundaryScore = ["parse", "validate"].includes(candidate.kind) && path.basename(candidate.sourceFile.fileName).replace(/\.[^.]+$/, "") === "json" ? 10 : 0; return componentScore + directShellScore + mapperScore + detailScore + jsonBoundaryScore + tokens.reduce((score, token) => score + (haystack.includes(token) || haystack.includes(token.replace(/s$/, "")) ? 4 : 0), 0) + (candidate.label.includes("rows") ? 2 : 0); }
function preferredSourceCandidate(left: LegacyRouteCandidate, right: LegacyRouteCandidate) { return Number(Boolean(right.consumerReturn)) - Number(Boolean(left.consumerReturn)) || Number(right.label.includes("validate")) - Number(left.label.includes("validate")) || candidateSort(left, right); }
function confidenceRank(value: RouteEvidenceConfidence) { return value === "high" ? 2 : value === "medium" ? 1 : 0; }
function sinkRelevance(route: RouteRecord, sink: Sink) { const tokens = route.pathPattern.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4); const dynamic = route.parameters.map((parameter) => parameter.name.replace(/Id$/, "").toLowerCase()).filter((token) => token.length >= 4); const component = (sink.renderContext.component ?? "").toLowerCase(); return (sink.category === "style" ? 6 : 0) + (sink.file === route.file ? 0 : 2) + dynamic.reduce((score, token) => score + (component.includes(token) ? 4 : 0), 0) + tokens.reduce((score, token) => score + (sink.file.toLowerCase().includes(token) || sink.file.toLowerCase().includes(token.replace(/s$/, "")) ? 4 : 0), 0); }

function spanFor(file: TypeScript.SourceFile, node: TypeScript.Node): SourceSpan { const start = file.getLineAndCharacterOfPosition(node.getStart(file)); const end = file.getLineAndCharacterOfPosition(node.getEnd()); return { startLine: start.line + 1, startColumn: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 }; }
function safeTypeAt(checker: TypeScript.TypeChecker, node: TypeScript.Node) { try { return checker.typeToString(checker.getTypeAtLocation(node), node, 1); } catch { return "unknown"; } }
function returnTypeName(checker: TypeScript.TypeChecker, node: TypeScript.FunctionLikeDeclaration) { try { const signature = checker.getSignatureFromDeclaration(node); return signature ? checker.typeToString(checker.getReturnTypeOfSignature(signature)).replace(/^Promise<(.+)>$/, "$1") : "mapped value"; } catch { return "mapped value"; } }
function resourceName(ts: typeof TypeScript, node: TypeScript.CallExpression) { const declaration = node.parent; if (ts.isVariableDeclaration(declaration)) { if (ts.isArrayBindingPattern(declaration.name)) { const first = declaration.name.elements[0]; return first && ts.isBindingElement(first) ? first.name.getText() : "data"; } return declaration.name.getText(); } return "data"; }
function queryName(ts: typeof TypeScript, node: TypeScript.CallExpression) { return ts.isVariableDeclaration(node.parent) ? node.parent.name.getText() : "SolidStart"; }
function collectionName(text: string) { return humanize(text.replace(/\.(?:map|flatMap)$/, "").split(".").at(-1) ?? "collection"); }
function callName(text: string) { return text.split(".").at(-1)?.replace(/[^A-Za-z0-9_$]/g, "") || "value"; }
function labelFromArgument(node: TypeScript.Expression | undefined, sourceFile: TypeScript.SourceFile) { return node?.getText(sourceFile).replace(/\(.*/, "").split(".").at(-1)?.replace(/["']/g, "") ?? ""; }
function humanize(value: string) { return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()); }
function relative(root: string, file: string) { return path.relative(root, file).replaceAll(path.sep, "/"); }
function isDevSupportFile(file: string) {
  const normalized = file.replaceAll(path.sep, "/").toLowerCase();
  const basename = path.posix.basename(normalized);
  return /(?:^|\/)(?:__tests__|tests?|scripts?|fixtures?|benchmarks?|evals?)(?:\/|$)/.test(normalized)
    || /(?:^|[._-])(?:test|spec|smoke|fixture|benchmark)(?:[._-]|$)/.test(basename);
}

function declarationName(ts: typeof TypeScript, node: TypeScript.Node) {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name)) return node.name.text;
  return null;
}

function lexical(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
