import path from "node:path";
import type * as TypeScript from "typescript";
import type { Sink, SourceSpan } from "../types";
import { collectReachableFiles, discoverRoute, stableHash } from "./route-discovery";

export type RouteEvidenceConfidence = "high" | "medium" | "low";
export type RouteDataEffect = "preserve" | "project" | "augment" | "derive" | "select" | "group" | "normalize" | "opaque" | "render";

export interface RouteComponentRecord {
  id: string;
  label: string;
  file: string;
  line: number;
  parentId: string | null;
  role: "route" | "component" | "framework";
}

export interface RouteRecord {
  key: string;
  pathPattern: string;
  file: string;
  componentIdentityId: string | null;
  parameters: Array<{ name: string; kind: "dynamic" | "catch-all" }>;
  confidence: RouteEvidenceConfidence;
  evidence: RouteDataEvidence | null;
  componentNames: string[];
  componentHierarchy: RouteComponentRecord[];
  renderedComponents?: RouteComponentRecord[];
  renderedComponentEdges?: Array<{ from: string; to: string }>;
  sinkIds: string[];
  omissions: string[];
}

export interface RouteDataField { key: string; typeText: string; optional: boolean }
export interface ValueShapeSummary {
  id: string;
  typeName: string | null;
  typeText: string;
  kind: "primitive" | "object" | "collection" | "union" | "opaque";
  fields: RouteDataField[];
  totalFields: number;
  opacityReason: string | null;
}
export interface RouteDataValue { id: string; label: string; shapeId: string; sourceOperationKey: string | null }
export interface RouteDataFieldEffect { kind: RouteDataEffect; field: string | null; detail: string }
export interface RouteDataEvidence {
  id: string;
  expression: string;
  operationKind: string;
  file: string;
  line: number;
  column: number;
  span: SourceSpan;
  inputType: string;
  outputType: string;
  compilerIdentity: string | null;
  confidence: RouteEvidenceConfidence;
  unknownReason: string | null;
}
export interface RouteDataBoundary { kind: "query" | "resource" | "component" | "prop" | "context" | "call"; label: string }
export interface DataOperation {
  key: string;
  semanticKind: "read" | "parse" | "validate" | "map" | "project" | "augment" | "derive" | "select" | "group" | "normalize" | "boundary" | "render" | "opaque";
  effect: RouteDataEffect;
  label: string;
  inputValueIds: string[];
  outputValueIds: string[];
  inputShapeIds: string[];
  outputShapeIds: string[];
  fieldEffects: RouteDataFieldEffect[];
  sourceExpressionIds: string[];
  boundary: RouteDataBoundary | null;
  confidence: RouteEvidenceConfidence;
  completeness: "complete" | "partial" | "opaque";
  completenessReason: string;
}
export interface RouteDataTerminal { id: string; label: string; file: string; line: number; component: string | null; operationKey: string }
export interface RouteDataTrajectory {
  key: string;
  routeKey: string;
  label: string;
  sourceValueIds: string[];
  operationKeys: string[];
  terminalIds: string[];
  supportingComponentIds: string[];
  routeReachableTerminalCount: number;
  terminalSelectionLimit: number;
  ordering: "semantic-stage";
  handoffsProven: boolean;
  completeness: "complete-for-supported-scope" | "partial" | "unknown";
  omissions: string[];
}
export interface RouteDataAnalysis {
  routes: RouteRecord[];
  trajectories: RouteDataTrajectory[];
  operations: DataOperation[];
  values: RouteDataValue[];
  shapes: ValueShapeSummary[];
  evidence: RouteDataEvidence[];
  terminals: RouteDataTerminal[];
}

type Candidate = {
  stage: number;
  kind: DataOperation["semanticKind"];
  effect: RouteDataEffect;
  label: string;
  node: TypeScript.Node;
  sourceFile: TypeScript.SourceFile;
  boundary: RouteDataBoundary | null;
  confidence: RouteEvidenceConfidence;
  fieldEffects: RouteDataFieldEffect[];
};

const SHAPE_FIELD_CAP = 12;
const TRAJECTORY_OPERATION_CAP = 15;
const ROUTE_TERMINAL_CAP = 4;

export function analyzeRouteData(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  sinks: Sink[],
): RouteDataAnalysis {
  const checker = program.getTypeChecker();
  const files = program.getSourceFiles().filter((file) => !file.isDeclarationFile && inside(root, file.fileName));
  const filesByName = new Map(files.map((file) => [path.normalize(file.fileName), file]));
  const routes = files.map((file) => discoverRoute(ts, checker, root, file)).filter((route): route is RouteRecord => Boolean(route));
  const operations: DataOperation[] = [];
  const values: RouteDataValue[] = [];
  const shapes: ValueShapeSummary[] = [];
  const evidence: RouteDataEvidence[] = [];
  const terminals: RouteDataTerminal[] = [];
  const trajectories: RouteDataTrajectory[] = [];

  for (const route of routes) {
    const routeFile = filesByName.get(path.normalize(path.resolve(root, route.file)));
    if (!routeFile) continue;
    const reachable = collectReachableFiles(ts, root, routeFile, filesByName);
    const candidates = collectCandidates(ts, checker, program, root, reachable);
    const renderedComponents = collectRenderedComponents(ts, checker, root, routeFile, route);
    route.renderedComponents = renderedComponents.records;
    route.renderedComponentEdges = renderedComponents.edges;
    const routeSinks = sinks.filter((sink) => sinkBelongsToRenderedComponent(sink, route, renderedComponents.keys));
    // Finding IDs are intentionally human-readable line/column labels and can
    // repeat across files. Route membership must use the file-qualified key or
    // unrelated sinks at the same coordinates contaminate the route graph.
    route.sinkIds = routeSinks.map((sink) => routeSinkKey(sink));
    const selected = chooseCandidates(ts, candidates, routeSinks, root, route, filesByName);
    const routeOperationKeys: string[] = [];
    const routeValueIds: string[] = [];

    const candidateGroups = selected.reduce<Candidate[][]>((groups, candidate) => {
      const previous = groups.at(-1);
      if (candidate.kind === "read" && previous?.every((item) => item.kind === "read")) previous.push(candidate);
      else groups.push([candidate]);
      return groups;
    }, []);
    for (const group of candidateGroups) {
      const candidate = group[0];
      const sources = group.map((item) => evidenceFor(ts, checker, root, item));
      const source = sources[0];
      const outputType = safeTypeAt(checker, candidate.node);
      const shape = shapeFor(checker, candidate.node, outputType);
      const shapeId = `shape:${stableHash(`${route.key}:${candidate.kind}:${source.file}:${source.span.startLine}:${source.span.startColumn}:${outputType}`)}`;
      const valueId = `value:${stableHash(`${route.key}:${candidate.label}:${source.file}:${source.line}:${source.column}`)}`;
      const operationKey = `operation:${stableHash(`${route.key}:${candidate.kind}:${source.file}:${source.span.startLine}:${source.span.startColumn}:${source.compilerIdentity ?? ""}`)}`;
      const operation: DataOperation = {
        key: operationKey,
        semanticKind: candidate.kind,
        effect: candidate.effect,
        label: group.length > 1 ? `Read and validate ${group.length} persisted values` : candidate.label,
        inputValueIds: [],
        outputValueIds: [valueId],
        inputShapeIds: [],
        outputShapeIds: [shapeId],
        fieldEffects: candidate.fieldEffects.length ? candidate.fieldEffects : [{ kind: candidate.effect, field: null, detail: effectSummary(candidate.effect, shape) }],
        sourceExpressionIds: sources.map((item) => item.id),
        boundary: candidate.boundary,
        confidence: candidate.confidence,
        completeness: candidate.kind === "opaque" ? "opaque" : candidate.confidence === "low" ? "partial" : "complete",
        completenessReason: candidate.kind === "opaque" ? "The compiler could not prove the internal value transition across this call." : "Retained from a participating source expression and checker type.",
      };
      operations.push(operation);
      values.push({ id: valueId, label: group.length > 1 ? "Saved persisted values" : valueLabel(candidate, outputType), shapeId, sourceOperationKey: operationKey });
      shapes.push({ ...shape, id: shapeId });
      evidence.push(...sources);
      routeOperationKeys.push(operationKey);
      routeValueIds.push(valueId);
    }

    const routeTerminals = buildTerminals(route, routeSinks, routeOperationKeys.at(-1) ?? null);
    terminals.push(...routeTerminals);
    const hasRead = selected.some((item) => item.kind === "read");
    const hasRender = selected.some((item) => item.kind === "render") || routeTerminals.length > 0;
    const omissions = [...route.omissions];
    if (!hasRead) omissions.push("No supported persistence source joined to this route.");
    if (!hasRender) omissions.push("No supported render terminal joined to the participating component files.");
    if (selected.some((item) => item.kind === "opaque")) omissions.push("At least one first-party or external call remains opaque.");
    omissions.push("Cards are ordered by semantic stage. Cross-operation argument, prop, and return-value handoffs are not yet proven.");
    if (routeOperationKeys.length) {
      trajectories.push({
        key: `trajectory:${stableHash(`${route.key}:${routeOperationKeys[0]}:${routeTerminals[0]?.id ?? routeOperationKeys.at(-1)}`)}`,
        routeKey: route.key,
        label: routeTerminals.length ? `${route.pathPattern} → ${routeTerminals.length} retained render ${routeTerminals.length === 1 ? "site" : "sites"}` : `${route.pathPattern} data path`,
        sourceValueIds: routeValueIds[0] ? [routeValueIds[0]] : [],
        operationKeys: routeOperationKeys,
        terminalIds: routeTerminals.map((terminal) => terminal.id),
        supportingComponentIds: route.componentNames.map((name) => `component:${stableHash(`${route.file}:${name}`)}`),
        routeReachableTerminalCount: routeSinks.length,
        terminalSelectionLimit: ROUTE_TERMINAL_CAP,
        ordering: "semantic-stage",
        handoffsProven: false,
        completeness: routeOperationKeys.length ? "partial" : "unknown",
        omissions,
      });
    }
  }
  return { routes, trajectories, operations, values, shapes, evidence, terminals };
}

export function routeSinkKey(sink: Pick<Sink, "file" | "id">) {
  return `${sink.file}:${sink.id}`;
}

function collectCandidates(ts: typeof TypeScript, checker: TypeScript.TypeChecker, program: TypeScript.Program, root: string, reachable: Set<string>) {
  const candidates: Candidate[] = [];
  for (const absolute of reachable) {
    const sourceFile = program.getSourceFile(absolute);
    if (!sourceFile || isDevSupportFile(sourceFile.fileName)) continue;
    const visit = (node: TypeScript.Node) => {
      if (ts.isCallExpression(node)) {
        const text = node.expression.getText(sourceFile);
        const full = node.getText(sourceFile);
        const prisma = text.match(/(?:^|\.)prisma\.([A-Za-z0-9_]+)\.(findMany|findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow)$/);
        if (prisma) candidates.push(candidate(0, "read", "preserve", `Read ${humanize(prisma[1])} ${/Many/.test(prisma[2]) ? "rows" : "record"} from Prisma`, node, sourceFile, null, "high"));
        else if (/\breadFile(?:Sync)?$/.test(text)) candidates.push(candidate(0, "read", "preserve", "Read persisted file contents", node, sourceFile, null, "high"));
        else if (/\breadJsonFile$/.test(text)) candidates.push(candidate(0, "read", "preserve", `Read and validate ${labelFromArgument(node.arguments[0], sourceFile) || "saved JSON"}`, node, sourceFile, { kind: "call", label: "readJsonFile" }, "high"));
        if (text === "JSON.parse" || text.endsWith(".JSON.parse")) candidates.push(candidate(1, "parse", "normalize", "Parse persisted JSON text", node, sourceFile, null, "high"));
        if (/\.parse$/.test(text) && text !== "JSON.parse" && (/(?:schema|Schema)\.parse$/.test(text) || full.includes("z."))) candidates.push(candidate(2, "validate", "normalize", `Validate ${humanize(text.replace(/\.parse$/, "").split(".").at(-1) ?? "schema")} shape`, node, sourceFile, null, "high"));
        if (text === "query" || text.endsWith(".query")) candidates.push(candidate(4, "boundary", "preserve", `Define ${queryName(ts, node)} query`, node, sourceFile, { kind: "query", label: "SolidStart query" }, "high"));
        if (text === "createResource" || text.endsWith(".createResource")) candidates.push(candidate(5, "boundary", "preserve", `Load ${resourceName(ts, node)} resource`, node, sourceFile, { kind: "resource", label: resourceFetcherName(ts, node) ?? "Solid createResource" }, "high"));
        if (/\.(?:map|flatMap)$/.test(text)) candidates.push(candidate(3, "map", "project", `Map ${collectionName(text)} elements`, node, sourceFile, null, "medium"));
        if (/\.filter$/.test(text) && /\bday/i.test(full)) candidates.push(candidate(8, "group", "group", "Group values by day", node, sourceFile, null, "high"));
        else if (/\.(?:filter|find)$/.test(text) || /(?:select|resolve|loaded|visible)/i.test(text)) candidates.push(candidate(6, "select", "select", `Select ${humanize(callName(text))} value`, node, sourceFile, null, "medium"));
        if (/(?:group|overlap|bucket|partition)/i.test(text)) candidates.push(candidate(8, "group", "group", `${/overlap/i.test(text) ? "Assign overlap grouping" : `Group values with ${humanize(callName(text))}`}`, node, sourceFile, { kind: "call", label: callName(text) }, "medium"));
        if (/(?:geometry|position|bounds|grid|coordinate|viewport|segment|rect)/i.test(`${text} ${sourceFile.fileName}`)) candidates.push(candidate(9, "derive", "derive", `Derive ${humanize(callName(text))} geometry`, node, sourceFile, { kind: "call", label: callName(text) }, "medium"));
      }
      if (ts.isFunctionDeclaration(node) && node.name && /^map[A-Z]/.test(node.name.text)) candidates.push(candidate(3, "map", "project", `Map input to ${returnTypeName(checker, node)}`, node, sourceFile, { kind: "call", label: node.name.text }, "high"));
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^map[A-Z]/.test(node.name.text) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) candidates.push(candidate(3, "map", "project", `Map row to ${returnTypeName(checker, node.initializer)}`, node.initializer, sourceFile, { kind: "call", label: node.name.text }, "high"));
      if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) && node.initializer && ts.isObjectLiteralExpression(node.initializer) && node.initializer.properties.some((property) => ts.isSpreadAssignment(property))) {
        const replaced = node.initializer.properties.filter(ts.isPropertyAssignment).map((property) => property.name.getText(sourceFile));
        candidates.push(candidate(7, "augment", "augment", replaced.length ? `Augment value and replace ${replaced.join(" / ")}` : "Augment value with object spread", node.initializer, sourceFile, null, "high", replaced.map((field) => ({ kind: "augment", field, detail: `${field} is added or replaced after preserving spread fields.` }))));
      }
      if (ts.isObjectLiteralExpression(node) && node.properties.some((property) => ts.isSpreadAssignment(property)) && !(ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent))) {
        const replaced = node.properties.filter(ts.isPropertyAssignment).map((property) => property.name.getText(sourceFile));
        candidates.push(candidate(7, "augment", "augment", replaced.length ? `Augment value and replace ${replaced.join(" / ")}` : "Augment value with object spread", node, sourceFile, null, "high", replaced.map((field) => ({ kind: "augment", field, detail: `${field} is added or replaced after preserving spread fields.` }))));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return candidates;
}

function chooseCandidates(ts: typeof TypeScript, candidates: Candidate[], sinks: Sink[], root: string, route: RouteRecord, filesByName: Map<string, TypeScript.SourceFile>) {
  const selected: Candidate[] = [];
  const hasPrismaRead = candidates.some((item) => item.kind === "read" && item.label.includes("Prisma"));
  const selectionCap = hasPrismaRead ? TRAJECTORY_OPERATION_CAP : TRAJECTORY_OPERATION_CAP + 3;
  const relevantCandidates = (hasPrismaRead ? candidates.filter((item) => item.kind !== "parse" && item.kind !== "validate") : candidates).filter((item) => item.kind !== "render" && item.boundary?.kind !== "component");
  const push = (items: Candidate[], max: number) => {
    for (const item of items.sort((left, right) => candidateRelevance(right, route) - candidateRelevance(left, route) || confidenceRank(right.confidence) - confidenceRank(left.confidence) || candidateSort(left, right))) {
      if (selected.length >= selectionCap || selected.filter((value) => value.stage === item.stage).length >= max) break;
      const key = `${item.stage}:${item.label}`;
      if (!selected.some((value) => `${value.stage}:${value.label}` === key)) selected.push(item);
    }
  };
  const stageCaps: Array<[number, number]> = hasPrismaRead
    ? [[0, 1], [1, 0], [2, 0], [3, 1], [4, 1], [5, 1], [6, 2], [7, 2], [8, 2], [9, 2], [9.5, 1], [10, 1]]
    : [[0, 4], [1, 1], [2, 1], [3, 1], [4, 1], [5, 3], [6, 2], [7, 1], [8, 0], [9, 0], [9.5, 1], [10, 1]];
  for (const [stage, max] of stageCaps) {
    const stageCandidates = relevantCandidates.filter((item) => item.stage === stage);
    if (stage !== 0) { push(stageCandidates, max); continue; }
    const routeRelevantReads = stageCandidates.filter((item) => candidateRelevance(item, route) > 0);
    push(routeRelevantReads.length ? routeRelevantReads : stageCandidates, max);
  }
  const render = renderCandidateForSink(ts, root, route, sinks, filesByName);
  if (render) {
    if (selected.length >= selectionCap) selected[selected.length - 1] = render;
    else selected.push(render);
  }
  return selected.sort(candidateSort).slice(0, selectionCap);
}

function renderCandidateForSink(ts: typeof TypeScript, root: string, route: RouteRecord, sinks: Sink[], filesByName: Map<string, TypeScript.SourceFile>) {
  const sink = [...sinks].sort((a, b) => sinkRelevance(route, b) - sinkRelevance(route, a) || b.metrics.maximumPathDepth - a.metrics.maximumPathDepth || lexical(a.file, b.file) || a.line - b.line)[0];
  if (!sink) return null;
  const sourceFile = filesByName.get(path.normalize(path.resolve(root, sink.file)));
  if (!sourceFile) return null;
  const node = nodeForSpan(ts, sourceFile, sink.span);
  const target = sink.renderContext.component ?? sink.renderContext.tag ?? "JSX";
  const attribute = sink.renderContext.attribute ?? sink.label;
  return candidate(10, "render", "render", `Render ${attribute} in ${target}`, node, sourceFile, null, sink.confidence >= .75 ? "high" : "medium");
}

function nodeForSpan(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, span: SourceSpan) {
  const start = sourceFile.getPositionOfLineAndCharacter(span.startLine - 1, span.startColumn - 1);
  const end = sourceFile.getPositionOfLineAndCharacter(span.endLine - 1, span.endColumn - 1);
  let best: TypeScript.Node = sourceFile;
  const visit = (node: TypeScript.Node) => {
    if (node.getStart(sourceFile) > start || node.getEnd() < end) return;
    best = node;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return best;
}

function candidate(stage: number, kind: Candidate["kind"], effect: RouteDataEffect, label: string, node: TypeScript.Node, sourceFile: TypeScript.SourceFile, boundary: RouteDataBoundary | null, confidence: RouteEvidenceConfidence, fieldEffects: RouteDataFieldEffect[] = []): Candidate {
  return { stage, kind, effect, label, node, sourceFile, boundary, confidence, fieldEffects };
}
function candidateSort(a: Candidate, b: Candidate) { return a.stage - b.stage || lexical(a.sourceFile.fileName, b.sourceFile.fileName) || a.node.getStart(a.sourceFile) - b.node.getStart(b.sourceFile); }
function candidateRelevance(candidate: Candidate, route: RouteRecord) { const tokens = route.pathPattern.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4); const dynamicStems = route.parameters.map((parameter) => parameter.name.replace(/Id$/, "").toLowerCase()).filter((token) => token.length >= 4); const haystack = `${candidate.sourceFile.fileName} ${candidate.label}`.toLowerCase(); const componentScore = route.componentNames.some((name) => path.basename(candidate.sourceFile.fileName).replace(/\.[^.]+$/, "") === name) ? 8 : 0; const directShellScore = candidate.boundary?.kind === "component" && route.componentNames.includes(candidate.boundary.label) && candidate.sourceFile.fileName.replaceAll(path.sep, "/").endsWith(route.file) ? 12 : 0; const mapperScore = candidate.label.startsWith("Map row to ") ? 10 : 0; const detailScore = dynamicStems.some((stem) => haystack.includes(`${stem}-detail`)) ? 6 : 0; const jsonBoundaryScore = ["parse", "validate"].includes(candidate.kind) && path.basename(candidate.sourceFile.fileName).replace(/\.[^.]+$/, "") === "json" ? 10 : 0; return componentScore + directShellScore + mapperScore + detailScore + jsonBoundaryScore + tokens.reduce((score, token) => score + (haystack.includes(token) || haystack.includes(token.replace(/s$/, "")) ? 4 : 0), 0) + (candidate.label.includes("rows") ? 2 : 0); }
function confidenceRank(value: RouteEvidenceConfidence) { return value === "high" ? 2 : value === "medium" ? 1 : 0; }

function evidenceFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, value: Candidate): RouteDataEvidence {
  const point = value.sourceFile.getLineAndCharacterOfPosition(value.node.getStart(value.sourceFile));
  const symbolNode = ts.isCallExpression(value.node) ? value.node.expression : (value.node as TypeScript.NamedDeclaration).name ?? value.node;
  const symbol = checker.getSymbolAtLocation(symbolNode);
  const type = safeTypeAt(checker, value.node);
  const file = relative(root, value.sourceFile.fileName);
  return { id: `evidence:${stableHash(`${file}:${point.line + 1}:${point.character + 1}:${value.kind}`)}`, expression: value.node.getText(value.sourceFile).replace(/\s+/g, " ").slice(0, 320), operationKind: value.kind, file, line: point.line + 1, column: point.character + 1, span: spanFor(value.sourceFile, value.node), inputType: type, outputType: type, compilerIdentity: symbol ? checker.getFullyQualifiedName(symbol) : null, confidence: value.confidence, unknownReason: value.kind === "opaque" ? "Unresolved value transition" : null };
}

function shapeFor(checker: TypeScript.TypeChecker, node: TypeScript.Node, typeText: string): Omit<ValueShapeSummary, "id"> {
  try {
    const type = checker.getTypeAtLocation(node);
    const properties = type.getProperties();
    const fields = properties.slice(0, SHAPE_FIELD_CAP).map((property) => {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      const propertyType = declaration ? checker.getTypeOfSymbolAtLocation(property, declaration) : checker.getDeclaredTypeOfSymbol(property);
      return { key: property.getName(), typeText: checker.typeToString(propertyType), optional: Boolean(property.flags & 16_777_216) };
    });
    const collection = checker.isArrayType(type) || checker.isTupleType(type);
    const primitive = /^(?:string|number|boolean|bigint|symbol|null|undefined|void)$/.test(typeText);
    return { typeName: type.aliasSymbol?.getName() ?? type.getSymbol()?.getName() ?? null, typeText, kind: collection ? "collection" : primitive ? "primitive" : type.isUnion() ? "union" : properties.length ? "object" : typeText === "any" || typeText === "unknown" ? "opaque" : "object", fields, totalFields: properties.length, opacityReason: typeText === "any" || typeText === "unknown" ? `Checker type is ${typeText}.` : null };
  } catch { return { typeName: null, typeText, kind: "opaque", fields: [], totalFields: 0, opacityReason: "Checker shape lookup failed." }; }
}

function buildTerminals(route: RouteRecord, sinks: Sink[], operationKey: string | null): RouteDataTerminal[] {
  if (!operationKey) return [];
  return [...sinks].sort((a, b) => sinkRelevance(route, b) - sinkRelevance(route, a) || b.metrics.maximumPathDepth - a.metrics.maximumPathDepth || lexical(a.file, b.file) || a.line - b.line).slice(0, ROUTE_TERMINAL_CAP).map((sink) => ({ id: `terminal:${stableHash(`${route.key}:${sink.file}:${sink.line}:${sink.column}:${sink.label}`)}`, label: sink.category === "style" ? `Style attribute: ${sink.label}` : sink.label, file: sink.file, line: sink.line, component: sink.renderContext.component, operationKey }));
}
function sinkRelevance(route: RouteRecord, sink: Sink) { const tokens = route.pathPattern.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4); const dynamic = route.parameters.map((parameter) => parameter.name.replace(/Id$/, "").toLowerCase()).filter((token) => token.length >= 4); const component = (sink.renderContext.component ?? "").toLowerCase(); return (sink.category === "style" ? 6 : 0) + (sink.file === route.file ? 0 : 2) + dynamic.reduce((score, token) => score + (component.includes(token) ? 4 : 0), 0) + tokens.reduce((score, token) => score + (sink.file.toLowerCase().includes(token) || sink.file.toLowerCase().includes(token.replace(/s$/, "")) ? 4 : 0), 0); }

function spanFor(file: TypeScript.SourceFile, node: TypeScript.Node): SourceSpan { const start = file.getLineAndCharacterOfPosition(node.getStart(file)); const end = file.getLineAndCharacterOfPosition(node.getEnd()); return { startLine: start.line + 1, startColumn: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 }; }
function safeTypeAt(checker: TypeScript.TypeChecker, node: TypeScript.Node) { try { return checker.typeToString(checker.getTypeAtLocation(node), node, 1); } catch { return "unknown"; } }
function returnTypeName(checker: TypeScript.TypeChecker, node: TypeScript.FunctionLikeDeclaration) { try { const signature = checker.getSignatureFromDeclaration(node); return signature ? checker.typeToString(checker.getReturnTypeOfSignature(signature)).replace(/^Promise<(.+)>$/, "$1") : "mapped value"; } catch { return "mapped value"; } }
function resourceName(ts: typeof TypeScript, node: TypeScript.CallExpression) { const declaration = node.parent; if (ts.isVariableDeclaration(declaration)) { if (ts.isArrayBindingPattern(declaration.name)) { const first = declaration.name.elements[0]; return first && ts.isBindingElement(first) ? first.name.getText() : "data"; } return declaration.name.getText(); } return "data"; }
function queryName(ts: typeof TypeScript, node: TypeScript.CallExpression) { return ts.isVariableDeclaration(node.parent) ? node.parent.name.getText() : "SolidStart"; }
function resourceFetcherName(ts: typeof TypeScript, node: TypeScript.CallExpression) {
  const fetcher = node.arguments.at(-1);
  if (!fetcher) return null;
  if (ts.isIdentifier(fetcher)) return fetcher.text;
  if (ts.isPropertyAccessExpression(fetcher)) return fetcher.name.text;
  const names: string[] = [];
  const visit = (current: TypeScript.Node) => {
    if (ts.isCallExpression(current)) {
      const expression = current.expression;
      const name = ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) ? expression.name.text : null;
      if (name && !["resolve", "reject"].includes(name)) names.push(name);
    }
    ts.forEachChild(current, visit);
  };
  visit(fetcher);
  return names.sort((left, right) => resourceFetcherRank(right) - resourceFetcherRank(left))[0] ?? null;
}
function resourceFetcherRank(name: string) { return /^(?:get|load|fetch|read|request|query)[A-Z_]/.test(name) ? 2 : 1; }
function collectionName(text: string) { return humanize(text.replace(/\.(?:map|flatMap)$/, "").split(".").at(-1) ?? "collection"); }
function callName(text: string) { return text.split(".").at(-1)?.replace(/[^A-Za-z0-9_$]/g, "") || "value"; }
function labelFromArgument(node: TypeScript.Expression | undefined, sourceFile: TypeScript.SourceFile) { return node?.getText(sourceFile).replace(/\(.*/, "").split(".").at(-1)?.replace(/["']/g, "") ?? ""; }
function effectSummary(effect: RouteDataEffect, shape: Omit<ValueShapeSummary, "id">) { if (shape.opacityReason) return "Shape unknown"; if (effect === "augment") return `Preserve existing fields and add or replace participating fields (${shape.totalFields} total).`; if (effect === "project") return `Project into ${shape.typeName ?? shape.typeText} (${shape.totalFields} fields).`; return `${humanize(effect)} ${shape.totalFields ? `${shape.totalFields} fields` : shape.typeText}.`; }
function valueLabel(candidate: Candidate, typeText: string) { return candidate.label.replace(/^Read and validate\s+/i, "").replace(/^(?:Read|Map|Load|Cross|Overlay|Group|Assign|Derive|Render|Select|Validate|Parse)\s+/i, "") || typeText; }
function isDevSupportFile(file: string) {
  const normalized = file.replaceAll(path.sep, "/").toLowerCase();
  const basename = path.posix.basename(normalized);
  return /(?:^|\/)(?:__tests__|tests?|scripts?|fixtures?|benchmarks?|evals?)(?:\/|$)/.test(normalized)
    || /(?:^|[._-])(?:test|spec|smoke|fixture|benchmark)(?:[._-]|$)/.test(basename);
}
function humanize(value: string) { return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()); }
function relative(root: string, file: string) { return path.relative(root, file).replaceAll(path.sep, "/"); }
function inside(root: string, file: string) { const rel = path.relative(path.resolve(root), path.resolve(file)); return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".."); }

function collectRenderedComponents(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, routeFile: TypeScript.SourceFile, route: RouteRecord) {
  const keys = new Set<string>();
  const records = new Map<string, RouteComponentRecord>();
  const edges = new Map<string, { from: string; to: string }>();
  const queued = new Set<string>();
  const queue: Array<{ node: TypeScript.Node; id: string; ancestors: Set<string> }> = [];
  const componentIdentity = (node: TypeScript.Node, alias?: string) => {
    const sourceFile = node.getSourceFile();
    if (!inside(root, sourceFile.fileName)) return null;
    const name = declarationName(ts, node) ?? alias;
    if (!name) return null;
    const file = relative(root, sourceFile.fileName);
    const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const id = `rendered-component:${stableHash(`${file}:${node.getStart(sourceFile)}:${name}`)}`;
    return { id, name, file, line: point.line + 1 };
  };
  const enqueue = (node: TypeScript.Node, alias?: string, parentId: string | null = null, ancestors = new Set<string>()) => {
    const identity = componentIdentity(node, alias);
    if (!identity) return;
    const { id, name, file, line } = identity;
    keys.add(componentMembershipKey(file, name));
    if (alias) keys.add(componentMembershipKey(file, alias));
    if (!records.has(id)) records.set(id, { id, label: name, file, line, parentId: null, role: parentId ? "component" : "route" });
    if (parentId && parentId !== id) edges.set(`${parentId}:${id}`, { from: parentId, to: id });
    if (!queued.has(id)) { queued.add(id); queue.push({ node, id, ancestors }); }
  };
  const addRecursiveOccurrence = (node: TypeScript.Node, label: string, parentId: string) => {
    const sourceFile = node.getSourceFile();
    const file = relative(root, sourceFile.fileName);
    const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const id = `rendered-component-occurrence:${stableHash(`${file}:${node.getStart(sourceFile)}:${label}:${parentId}`)}`;
    records.set(id, { id, label, file, line: point.line + 1, parentId: null, role: "component" });
    edges.set(`${parentId}:${id}`, { from: parentId, to: id });
  };
  const resolveDeclaration = (node: TypeScript.Node) => {
    let symbol = checker.getSymbolAtLocation(node);
    try { if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol); } catch { /* unresolved alias */ }
    return symbol?.valueDeclaration ?? symbol?.declarations?.find((declaration) => isComponentDeclaration(ts, declaration)) ?? null;
  };
  const rootLabel = route.componentHierarchy.find((component) => component.parentId === null)?.label ?? route.componentNames[0];
  let rootDeclaration: TypeScript.Node | null = null;
  const findRoot = (node: TypeScript.Node) => {
    if (rootDeclaration) return;
    if (declarationName(ts, node) === rootLabel && isComponentDeclaration(ts, node)) rootDeclaration = node;
    if (ts.isExportAssignment(node)) rootDeclaration = resolveDeclaration(node.expression) ?? rootDeclaration;
    ts.forEachChild(node, findRoot);
  };
  findRoot(routeFile);
  if (rootDeclaration) enqueue(rootDeclaration, rootLabel);
  else if (rootLabel) keys.add(componentMembershipKey(route.file, rootLabel));

  while (queue.length && queued.size <= 5_000) {
    const current = queue.shift()!;
    const visit = (node: TypeScript.Node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && /^[A-Z]/.test(node.tagName.text)) {
        const target = resolveDeclaration(node.tagName);
        const targetIdentity = target ? componentIdentity(target, node.tagName.text) : null;
        if (target && targetIdentity) {
          if (targetIdentity.id === current.id || current.ancestors.has(targetIdentity.id)) {
            addRecursiveOccurrence(node, node.tagName.text, current.id);
          } else {
            enqueue(target, node.tagName.text, current.id, new Set(current.ancestors).add(current.id));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(current.node);
  }
  return { keys, records: [...records.values()], edges: [...edges.values()] };
}

function sinkBelongsToRenderedComponent(sink: Sink, route: RouteRecord, renderedComponents: Set<string>) {
  const component = sink.renderContext?.component?.trim();
  if (component && renderedComponents.has(componentMembershipKey(sink.file, component))) return true;
  return !component && sink.file === route.file;
}

function componentMembershipKey(file: string, component: string) { return `${file.replaceAll("\\", "/")}:${component}`; }
function isComponentDeclaration(ts: typeof TypeScript, node: TypeScript.Node) {
  return ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node) && Boolean(node.initializer);
}
function declarationName(ts: typeof TypeScript, node: TypeScript.Node) {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name)) return node.name.text;
  return null;
}
function lexical(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
