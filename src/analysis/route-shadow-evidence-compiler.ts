import path from "node:path";
import type * as TypeScript from "typescript";
import type { Sink } from "../types";
import { stableHash } from "./route-discovery";
import type { RouteRecord } from "./route-data";
import type { RouteShadowEvidence, ShadowLocation } from "./route-shadow-evidence";
import {
  bounded,
  contains,
  importModuleFor,
  inside,
  locationForNode,
  locationForNodeFromRoot,
  locationForSink,
  relative,
  sameCompilerSymbol,
  sameSymbol,
  symbolFor,
  unwrapExpression,
  visit,
} from "./route-shadow-evidence-support";

export type FunctionRecord = {
  name: string;
  nameNode: TypeScript.Node;
  declaration: TypeScript.FunctionLikeDeclaration;
  sourceFile: TypeScript.SourceFile;
};

export type OriginSelection = {
  call: TypeScript.CallExpression;
  sourceFile: TypeScript.SourceFile;
  symbol: TypeScript.Symbol;
  compilerIdentity: string;
  module: string | null;
};

export type TerminalSelection = {
  sink: Sink;
  location: ShadowLocation;
  id: string;
};

type QueryWrapper = {
  symbol: TypeScript.Symbol;
  loadCall: TypeScript.CallExpression;
};

export const TARGET_ROUTE = "/captures/[captureId]";
export const TARGET_ORIGIN_FILE = "app/src/lib/pluck/store/json.ts";
const TARGET_ORIGIN_LINE = 20;
const TARGET_TERMINAL_FILE = "app/src/components/pluck/viewer/CaptureStatsPanel.tsx";
const TARGET_TERMINAL_LINE = 41;
const TARGET_TERMINAL_EXPRESSION = "formatBytes(props.page.captureStats.totalBytes)";
export const TARGET_ROUTE_FILE = "app/src/routes/captures/[captureId].tsx";
export const TARGET_SHELL_FILE = "app/src/components/pluck/viewer/CaptureViewerRouteShell.tsx";
export const TARGET_WORKSPACE_FILE = "app/src/components/pluck/viewer/CaptureDetailWorkspace.tsx";
const TARGET_CONTEXT_FILE = "app/src/components/pluck/viewer/CaptureViewer.context.tsx";
export const TARGET_INSPECTOR_FILE = "app/src/components/pluck/viewer/CaptureInspectorPanel.tsx";
const SHADOW_NODE_LIMIT = 32;
const SHADOW_EDGE_LIMIT = 31;
const SHADOW_GAP_LIMIT = 8;

export function finish(
  route: RouteShadowEvidence["route"],
  origin: OriginSelection,
  terminal: TerminalSelection,
  nodes: RouteShadowEvidence["nodes"],
  terminalNode: RouteShadowEvidence["nodes"][number],
  edges: RouteShadowEvidence["edges"],
  gaps: RouteShadowEvidence["gaps"],
  root: string,
): RouteShadowEvidence {
  if (!nodes.some((node) => node.id === terminalNode.id)) nodes.push(terminalNode);
  const integrity = validateGraphIntegrity(nodes, edges, gaps);
  if (integrity.invalidEdges || integrity.invalidGaps) {
    const anchor = nodes[0];
    if (anchor) gaps.push({
      id: `shadow-gap:${stableHash(`${anchor.id}:graph-integrity`)}`,
      from: anchor.id,
      to: null,
      label: `Graph integrity gap: ${integrity.invalidEdges} invalid edge endpoint(s), ${integrity.invalidGaps} invalid gap endpoint(s).`,
      reason: "identity-lost",
      location: anchor.location,
    });
  }
  const truncation = {
    nodes: nodes.length > SHADOW_NODE_LIMIT,
    edges: edges.length > SHADOW_EDGE_LIMIT,
    gaps: gaps.length > SHADOW_GAP_LIMIT,
  };
  const emittedNodes = bounded(nodes, SHADOW_NODE_LIMIT);
  const emittedNodeIds = new Set(emittedNodes.map((node) => node.id));
  const emittedEdges = bounded(edges, SHADOW_EDGE_LIMIT).filter((edge) => emittedNodeIds.has(edge.from) && emittedNodeIds.has(edge.to));
  const emittedGaps = bounded(gaps, SHADOW_GAP_LIMIT).filter((gap) => emittedNodeIds.has(gap.from) && (!gap.to || emittedNodeIds.has(gap.to)));
  validateGraphIntegrity(emittedNodes, emittedEdges, emittedGaps);
  return {
    status: gaps.length || truncation.nodes || truncation.edges || truncation.gaps ? "partial" : "proven",
    route,
    origin: originRecord(origin, root),
    terminal: terminalRecord(terminal),
    nodes: emittedNodes,
    edges: emittedEdges,
    gaps: emittedGaps,
    truncation,
    occurrenceEvidence: null,
  };
}

export function unavailableEvidence(
  route: RouteShadowEvidence["route"],
  origin: OriginSelection | null,
  terminal: TerminalSelection | null,
  root: string,
): RouteShadowEvidence {
  const label = origin ? "Selected Pluck route terminal" : "Pluck json.ts readFile origin";
  const nodes: RouteShadowEvidence["nodes"] = [];
  const originNode = origin
    ? originNodeFor(origin, root)
    : { id: `shadow-origin-unavailable:${stableHash(route.key)}`, role: "origin" as const, kind: "missing-origin", label: "Pluck json.ts readFile origin", location: null };
  nodes.push(originNode);
  if (terminal) nodes.push(terminalNodeFor(terminal));
  const terminalNode = nodes.find((node) => node.role === "terminal");
  return {
    status: "unavailable",
    route,
    origin: origin ? originRecord(origin, root) : null,
    terminal: terminal ? terminalRecord(terminal) : null,
    nodes,
    edges: [],
    gaps: [{
      id: `shadow-gap:${stableHash(`${route.key}:${label}`)}`,
      from: originNode.id,
      to: terminalNode?.id ?? null,
      label,
      reason: origin ? "unresolved-symbol" : "identity-lost",
      location: origin ? locationForNode(root, origin.call) : null,
    }],
    truncation: { nodes: false, edges: false, gaps: false },
    occurrenceEvidence: null,
  };
}

function validateGraphIntegrity(nodes: RouteShadowEvidence["nodes"], edges: RouteShadowEvidence["edges"], gaps: RouteShadowEvidence["gaps"]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    invalidEdges: edges.filter((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to)).length,
    invalidGaps: gaps.filter((gap) => !nodeIds.has(gap.from) || Boolean(gap.to && !nodeIds.has(gap.to))).length,
  };
}

export function originNodeFor(origin: OriginSelection, root: string): RouteShadowEvidence["nodes"][number] {
  const location = locationForNode(root, origin.call);
  return {
    id: originNodeId(origin, root),
    role: "origin",
    kind: "filesystem-read",
    label: origin.call.getText(origin.sourceFile).replace(/\s+/g, " "),
    location,
  };
}

export function terminalNodeFor(terminal: TerminalSelection): RouteShadowEvidence["nodes"][number] {
  return {
    id: terminal.id,
    role: "terminal",
    kind: terminal.sink.category || "jsx-text",
    label: terminal.sink.label,
    location: terminal.location,
  };
}

function originNodeId(origin: OriginSelection, root: string) {
  const location = locationForNode(root, origin.call);
  return `shadow-origin:${stableHash(`${location.file}:${location.span.startLine}:${location.span.startColumn}:${origin.compilerIdentity}`)}`;
}

function originRecord(origin: OriginSelection, root: string) {
  const occurrenceLocation = locationForNodeFromRoot(origin.sourceFile, root, origin.call);
  const occurrenceKey = `${occurrenceLocation.file}:${occurrenceLocation.span.startLine}:${occurrenceLocation.span.startColumn}:${origin.compilerIdentity}`;
  return {
    id: originNodeId(origin, root),
    kind: "filesystem" as const,
    label: origin.call.getText(origin.sourceFile).replace(/\s+/g, " "),
    definition: {
      id: `shadow-definition:${stableHash(origin.compilerIdentity)}`,
      name: origin.symbol.getName(),
      module: origin.module,
      compilerIdentity: origin.compilerIdentity,
      location: null,
    },
    occurrence: {
      id: `shadow-occurrence:${stableHash(occurrenceKey)}`,
      expression: origin.call.getText(origin.sourceFile).replace(/\s+/g, " "),
      compilerIdentity: origin.compilerIdentity,
      location: occurrenceLocation,
    },
  };
}

function terminalRecord(terminal: TerminalSelection) {
  return {
    id: terminal.id,
    kind: terminal.sink.category === "style" ? "style" as const : "jsx-text" as const,
    label: terminal.sink.label,
    component: terminal.sink.renderContext.component,
    location: terminal.location,
  };
}

export function sourceFiles(program: TypeScript.Program, root: string) {
  return new Map(program.getSourceFiles()
    .filter((file) => !file.isDeclarationFile && inside(root, file.fileName))
    .map((file) => [path.normalize(file.fileName), file]));
}

export function selectOrigin(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  files: Map<string, TypeScript.SourceFile>,
  reachable: Set<string>,
): OriginSelection | null {
  const file = [...reachable]
    .map((fileName) => files.get(path.normalize(fileName)))
    .find((candidate) => candidate && relative(root, candidate.fileName) === TARGET_ORIGIN_FILE);
  if (!file) return null;
  const matches: OriginSelection[] = [];
  visit(ts, file, (node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
    const point = file.getLineAndCharacterOfPosition(node.getStart(file));
    if (point.line + 1 !== TARGET_ORIGIN_LINE || node.expression.text !== "readFile") return;
    const symbol = symbolFor(checker, node.expression);
    if (!symbol || importModuleFor(ts, checker, node.expression) !== "node:fs/promises") return;
    matches.push({ call: node, sourceFile: file, symbol, compilerIdentity: checker.getFullyQualifiedName(symbol), module: "node:fs/promises" });
  });
  return matches.length === 1 ? matches[0] : null;
}

export function selectTerminal(route: RouteRecord, sinks: Sink[], root: string): TerminalSelection | null {
  const routeSinkIds = new Set(route.sinkIds);
  const sink = sinks
    .filter((candidate) => routeSinkIds.has(`${candidate.file}:${candidate.id}`))
    .filter((candidate) => relative(root, candidate.file).endsWith(TARGET_TERMINAL_FILE))
    .filter((candidate) => candidate.line === TARGET_TERMINAL_LINE)
    .find((candidate) => candidate.renderContext.component === "CaptureStatsPanel" && candidate.identity?.expression === TARGET_TERMINAL_EXPRESSION);
  if (!sink) return null;
  const location = locationForSink(root, sink);
  return { sink, location, id: `shadow-terminal:${stableHash(`${location.file}:${location.span.startLine}:${location.span.startColumn}:${sink.label}`)}` };
}

export function proof(kind: RouteShadowEvidence["edges"][number]["proof"]["kind"], detail: string, root: string, nodes: TypeScript.Node[]) {
  return { kind, detail, locations: nodes.map((node) => locationForNode(root, node)) };
}

export function proofFromLocations(kind: RouteShadowEvidence["edges"][number]["proof"]["kind"], detail: string, locations: ShadowLocation[]) {
  return { kind, detail, locations };
}

export function findFunction(ts: typeof TypeScript, files: Map<string, TypeScript.SourceFile>, name: string, suffix: string): FunctionRecord | null {
  const file = [...files.values()].find((candidate) => relative("/", candidate.fileName).endsWith(suffix) || candidate.fileName.replaceAll(path.sep, "/").endsWith(suffix));
  if (!file) return null;
  let result: FunctionRecord | null = null;
  visit(ts, file, (node) => {
    if (result) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = { name, nameNode: node.name, declaration: node, sourceFile: file };
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) result = { name, nameNode: node.name, declaration: node.initializer, sourceFile: file };
  });
  return result;
}

export function returnContainingCall(ts: typeof TypeScript, declaration: TypeScript.FunctionLikeDeclaration, target: TypeScript.CallExpression): TypeScript.ReturnStatement | null {
  let result: TypeScript.ReturnStatement | null = null;
  visit(ts, declaration.body, (node) => {
    if (result || !ts.isReturnStatement(node) || !node.expression || !contains(node.expression, target)) return;
    result = node;
  });
  return result;
}

export function initializerCallFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.FunctionLikeDeclaration, name: string, target: TypeScript.Symbol, argumentText: string): { call: TypeScript.CallExpression; variable: TypeScript.VariableDeclaration } | null {
  let result: { call: TypeScript.CallExpression; variable: TypeScript.VariableDeclaration } | null = null;
  visit(ts, declaration.body, (node) => {
    if (result || !ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== name || !node.initializer) return;
    const calls = callsIn(ts, node.initializer).filter((call) => sameSymbol(checker, call.expression, target));
    const call = calls.find((candidate) => candidate.arguments[0]?.getText().includes(argumentText));
    if (call) result = { call, variable: node };
  });
  return result;
}

export function returnCallFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.FunctionLikeDeclaration, target: TypeScript.Symbol, name: string): { call: TypeScript.CallExpression; returnStatement: TypeScript.ReturnStatement } | null {
  let result: { call: TypeScript.CallExpression; returnStatement: TypeScript.ReturnStatement } | null = null;
  visit(ts, declaration.body, (node) => {
    if (result || !ts.isReturnStatement(node) || !node.expression) return;
    const call = callsIn(ts, node.expression).find((candidate) => ts.isIdentifier(candidate.expression) && candidate.expression.text === name && sameSymbol(checker, candidate.expression, target));
    if (call) result = { call, returnStatement: node };
  });
  return result;
}

export function findQueryWrapper(ts: typeof TypeScript, checker: TypeScript.TypeChecker, files: Map<string, TypeScript.SourceFile>, name: string, loadSymbol: TypeScript.Symbol): QueryWrapper | null {
  const file = [...files.values()].find((candidate) => candidate.fileName.replaceAll(path.sep, "/").endsWith("app/src/lib/pluck/store/queries.ts"));
  if (!file) return null;
  const localLoad = findFunction(ts, files, "loadCaptureDetail", "app/src/lib/pluck/store/queries.ts");
  const localLoadSymbol = localLoad ? symbolFor(checker, localLoad.nameNode) : null;
  const serverCall = localLoad && loadSymbol
    ? callsIn(ts, localLoad.declaration.body).find((call) => sameSymbol(checker, call.expression, loadSymbol))
    : null;
  if (!localLoadSymbol || !serverCall) return null;
  let result: QueryWrapper | null = null;
  visit(ts, file, (node) => {
    if (result || !ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== name || !node.initializer) return;
    const loadCall = callsIn(ts, node.initializer).find((call) => ts.isIdentifier(call.expression) && sameSymbol(checker, call.expression, localLoadSymbol));
    if (!loadCall) return;
    const symbol = symbolFor(checker, node.name);
    if (symbol) result = { symbol, loadCall: serverCall };
  });
  return result;
}

export function resourceResultFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.FunctionLikeDeclaration, target: TypeScript.Symbol): { resourceCall: TypeScript.CallExpression; queryCall: TypeScript.CallExpression; bindingName: TypeScript.Node } | null {
  let result: { resourceCall: TypeScript.CallExpression; queryCall: TypeScript.CallExpression; bindingName: TypeScript.Node } | null = null;
  visit(ts, declaration.body, (node) => {
    if (result || !ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "createResource") return;
    const queryCall = callsIn(ts, node.arguments[1]).find((call) => ts.isIdentifier(call.expression) && sameSymbol(checker, call.expression, target));
    const bindingName = ts.isVariableDeclaration(node.parent) ? firstBindingName(ts, node.parent.name) : null;
    if (queryCall && bindingName && bindingName.getText() === "fullDetail") result = { resourceCall: node, queryCall, bindingName };
  });
  return result;
}

export function loadedDetailResult(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.FunctionLikeDeclaration, resourceName: TypeScript.Node, resolvedLatest: FunctionRecord): { resourceUse: TypeScript.CallExpression; latestReturn: TypeScript.ReturnStatement; bindingName: TypeScript.Node } | null {
  const resourceSymbol = symbolFor(checker, resourceName);
  const latestSymbol = symbolFor(checker, resolvedLatest.nameNode);
  if (!resourceSymbol || !latestSymbol) return null;
  let result: { resourceUse: TypeScript.CallExpression; latestReturn: TypeScript.ReturnStatement; bindingName: TypeScript.Node } | null = null;
  visit(ts, declaration.body, (node) => {
    if (result || !ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== "loadedDetail" || !node.initializer) return;
    const uses = callsIn(ts, node.initializer).filter((call) => sameSymbol(checker, call.expression, latestSymbol));
    const resourceUse = uses.find((call) => call.arguments[0] && sameSymbol(checker, call.arguments[0], resourceSymbol));
    const latestReturn = returnPropertyFor(ts, resolvedLatest.declaration, "latest");
    if (resourceUse && latestReturn) result = { resourceUse, latestReturn, bindingName: node.name };
  });
  return result;
}

export function jsxPropFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.FunctionLikeDeclaration, tag: string, attribute: string, valueName: TypeScript.Node): { attribute: TypeScript.JsxAttribute; value: TypeScript.Node } | null {
  const valueSymbol = symbolFor(checker, valueName);
  if (!valueSymbol) return null;
  let result: { attribute: TypeScript.JsxAttribute; value: TypeScript.Node } | null = null;
  visit(ts, declaration.body, (node) => {
    if (result || (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) || node.tagName.getText() !== tag) return;
    const attr = node.attributes.properties.find((property): property is TypeScript.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === attribute);
    const expression = attr?.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : null;
    if (attr && expression && ts.isCallExpression(expression) && sameSymbol(checker, expression.expression, valueSymbol)) result = { attribute: attr, value: expression };
  });
  return result;
}

export function jsxPropForwardingFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.FunctionLikeDeclaration, tag: string, attribute: string): { attribute: TypeScript.JsxAttribute; value: TypeScript.PropertyAccessExpression } | null {
  const parameter = declaration.parameters[0]?.name;
  const parameterSymbol = parameter ? symbolFor(checker, parameter) : null;
  const parameterType = parameter ? checker.getTypeAtLocation(parameter) : null;
  const expectedProperty = parameterType ? checker.getPropertyOfType(parameterType, attribute) : null;
  if (!parameterSymbol || !expectedProperty) return null;
  let result: { attribute: TypeScript.JsxAttribute; value: TypeScript.PropertyAccessExpression } | null = null;
  visit(ts, declaration.body, (node) => {
    if (result || (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) || node.tagName.getText() !== tag) return;
    const attr = node.attributes.properties.find((property): property is TypeScript.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === attribute);
    const expression = attr?.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : null;
    if (!attr || !expression || !ts.isPropertyAccessExpression(expression)) return;
    const receiver = unwrapExpression(ts, expression.expression);
    const propertySymbol = symbolFor(checker, expression.name);
    if (sameSymbol(checker, receiver, parameterSymbol) && propertySymbol && sameCompilerSymbol(checker, propertySymbol, expectedProperty)) result = { attribute: attr, value: expression };
  });
  return result;
}

export function providerValueFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.FunctionLikeDeclaration): { detailAccess: TypeScript.PropertyAccessExpression; providerValue: TypeScript.JsxAttribute } | null {
  const parameter = declaration.parameters[0]?.name;
  const parameterSymbol = parameter ? symbolFor(checker, parameter) : null;
  const parameterType = parameter ? checker.getTypeAtLocation(parameter) : null;
  const expectedProperty = parameterType ? checker.getPropertyOfType(parameterType, "detail") : null;
  if (!parameterSymbol || !expectedProperty) return null;
  let result: { detailAccess: TypeScript.PropertyAccessExpression; providerValue: TypeScript.JsxAttribute } | null = null;
  visit(ts, declaration.body, (node) => {
    if (result || !ts.isCallExpression(node)) return;
    const modelSymbol = symbolFor(checker, node.expression);
    if (!modelSymbol || modelSymbol.getName() !== "createCaptureViewerModel") return;
    const object = node.arguments[0];
    if (!object || !ts.isObjectLiteralExpression(object)) return;
    const detailProperty = object.properties.find((property): property is TypeScript.PropertyAssignment => ts.isPropertyAssignment(property) && property.name.getText() === "detail" && (ts.isArrowFunction(property.initializer) || ts.isFunctionExpression(property.initializer)));
    if (!detailProperty || !ts.isArrowFunction(detailProperty.initializer) && !ts.isFunctionExpression(detailProperty.initializer)) return;
    const detailBody = detailProperty.initializer.body;
    if (ts.isBlock(detailBody) || !ts.isPropertyAccessExpression(detailBody)) return;
    const detailReceiver = unwrapExpression(ts, detailBody.expression);
    const detailSymbol = symbolFor(checker, detailBody.name);
    if (!sameSymbol(checker, detailReceiver, parameterSymbol) || !detailSymbol || !sameCompilerSymbol(checker, detailSymbol, expectedProperty)) return;
    const bindingName = ts.isVariableDeclaration(node.parent) ? firstBindingName(ts, node.parent.name) : null;
    const viewerSymbol = bindingName ? symbolFor(checker, bindingName) : null;
    if (!viewerSymbol) return;
    visit(ts, declaration.body, (child) => {
      if (result || (!ts.isJsxOpeningElement(child) && !ts.isJsxSelfClosingElement(child)) || child.tagName.getText() !== "CaptureViewerProvider") return;
      const providerValue = child.attributes.properties.find((property): property is TypeScript.JsxAttribute => {
        if (!ts.isJsxAttribute(property) || property.name.getText() !== "value" || !property.initializer || !ts.isJsxExpression(property.initializer)) return false;
        const expression = property.initializer.expression;
        return Boolean(expression && sameSymbol(checker, expression, viewerSymbol));
      });
      if (providerValue) result = { detailAccess: detailBody, providerValue };
    });
  });
  return result;
}

export function contextBridgeFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, files: Map<string, TypeScript.SourceFile>): { provider: TypeScript.PropertyAccessExpression; consumer: TypeScript.CallExpression } | null {
  const file = [...files.values()].find((candidate) => candidate.fileName.replaceAll(path.sep, "/").endsWith(TARGET_CONTEXT_FILE));
  if (!file) return null;
  const consumerFunction = findFunction(ts, files, "useCaptureViewer", TARGET_CONTEXT_FILE);
  if (!consumerFunction) return null;
  let context: TypeScript.VariableDeclaration | null = null;
  let provider: TypeScript.PropertyAccessExpression | null = null;
  visit(ts, file, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "CaptureViewerContext") context = node;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "CaptureViewerProvider" && node.initializer && ts.isPropertyAccessExpression(node.initializer)) provider = node.initializer;
  });
  const contextDeclaration = context as TypeScript.VariableDeclaration | null;
  const providerExpression = provider as TypeScript.PropertyAccessExpression | null;
  const contextSymbol = contextDeclaration ? symbolFor(checker, contextDeclaration.name) : null;
  if (!contextSymbol || !providerExpression || !sameSymbol(checker, providerExpression.expression, contextSymbol)) return null;
  let consumerCall: TypeScript.CallExpression | null = null;
  visit(ts, consumerFunction.declaration.body, (node) => {
    if (consumerCall || !ts.isCallExpression(node) || !node.arguments[0] || !sameSymbol(checker, node.arguments[0], contextSymbol)) return;
    const consumerSymbol = symbolFor(checker, node.expression);
    if (consumerSymbol?.getName() === "useContext") consumerCall = node;
  });
  const selectedConsumerCall = consumerCall as TypeScript.CallExpression | null;
  if (!selectedConsumerCall || !sameSymbol(checker, selectedConsumerCall.arguments[0]!, contextSymbol)) return null;
  return { provider: providerExpression, consumer: selectedConsumerCall };
}

export function inspectorPageProp(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.FunctionLikeDeclaration): { detailUse: TypeScript.PropertyAccessExpression; pageAttribute: TypeScript.JsxAttribute } | null {
  let viewerSymbol: TypeScript.Symbol | null = null;
  let detailSymbol: TypeScript.Symbol | null = null;
  let detailUse: TypeScript.PropertyAccessExpression | null = null;
  let pageAttribute: TypeScript.JsxAttribute | null = null;
  visit(ts, declaration.body, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "viewer" && node.initializer && ts.isCallExpression(node.initializer)) {
      const viewerCallee = symbolFor(checker, node.initializer.expression);
      if (viewerCallee?.getName() === "useCaptureViewer") viewerSymbol = symbolFor(checker, node.name);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "detail" && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      const body = node.initializer.body;
      if (!ts.isBlock(body) && ts.isCallExpression(body) && ts.isPropertyAccessExpression(body.expression) && viewerSymbol) {
        const detailAccess = body.expression;
        const receiver = unwrapExpression(ts, detailAccess.expression);
        const detailProperty = symbolFor(checker, detailAccess.name);
        const expectedProperty = checker.getPropertyOfType(checker.getTypeAtLocation(receiver), detailAccess.name.text);
        if (sameSymbol(checker, receiver, viewerSymbol) && detailProperty && expectedProperty && sameCompilerSymbol(checker, detailProperty, expectedProperty)) {
          detailUse = detailAccess;
          detailSymbol = symbolFor(checker, node.name);
        }
      }
    }
    if ((!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) || node.tagName.getText() !== "CaptureStatsPanel") return;
    const attr = node.attributes.properties.find((property): property is TypeScript.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === "page");
    const expression = attr?.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : null;
    if (!attr || !expression || !ts.isPropertyAccessExpression(expression) || !detailSymbol) return;
    const detailCall = unwrapExpression(ts, expression.expression);
    const pageProperty = symbolFor(checker, expression.name);
    const expectedPage = checker.getPropertyOfType(checker.getTypeAtLocation(detailCall), expression.name.text);
    if (ts.isCallExpression(detailCall) && sameSymbol(checker, detailCall.expression, detailSymbol) && pageProperty && expectedPage && sameCompilerSymbol(checker, pageProperty, expectedPage)) pageAttribute = attr;
  });
  if (!detailUse || !pageAttribute) return null;
  return { detailUse, pageAttribute };
}

export function terminalPathProof(ts: typeof TypeScript, checker: TypeScript.TypeChecker, files: Map<string, TypeScript.SourceFile>, root: string, terminal: TerminalSelection) {
  const panel = findFunction(ts, files, "CaptureStatsPanel", TARGET_TERMINAL_FILE);
  const expressionText = terminal.sink.identity?.expression;
  if (!panel || !expressionText) return null;
  let terminalCall: TypeScript.CallExpression | null = null;
  visit(ts, panel.declaration.body, (node) => {
    if (terminalCall || !ts.isCallExpression(node) || node.getText() !== expressionText) return;
    const location = locationForNode(root, node);
    if (location.span.startLine === terminal.location.span.startLine && location.span.startColumn === terminal.location.span.startColumn) terminalCall = node;
  });
  const selectedTerminalCall = terminalCall as TypeScript.CallExpression | null;
  if (!selectedTerminalCall || selectedTerminalCall.arguments.length !== 1) return null;
  const accesses: TypeScript.PropertyAccessExpression[] = [];
  let base = unwrapExpression(ts, selectedTerminalCall.arguments[0]);
  while (ts.isPropertyAccessExpression(base)) {
    accesses.unshift(base);
    base = unwrapExpression(ts, base.expression);
  }
  const parameter = panel.declaration.parameters[0]?.name;
  const parameterSymbol = parameter ? symbolFor(checker, parameter) : null;
  if (!parameterSymbol || accesses.length !== 3 || !sameSymbol(checker, base, parameterSymbol)) return null;
  let receiver: TypeScript.Expression = base;
  for (const access of accesses) {
    const actualProperty = symbolFor(checker, access.name);
    const expectedProperty = checker.getPropertyOfType(checker.getTypeAtLocation(receiver), access.name.text);
    if (!actualProperty || !expectedProperty || !sameCompilerSymbol(checker, actualProperty, expectedProperty)) return null;
    receiver = access;
  }
  return {
    page: { node: accesses[0], location: locationForNode(root, accesses[0]) },
    properties: accesses.slice(1).map((node) => ({ label: node.name.text, node, location: locationForNode(root, node) })),
  };
}

function returnPropertyFor(ts: typeof TypeScript, declaration: TypeScript.FunctionLikeDeclaration, property: string): TypeScript.ReturnStatement | null {
  let result: TypeScript.ReturnStatement | null = null;
  visit(ts, declaration.body, (node) => {
    if (result || !ts.isReturnStatement(node) || !node.expression || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== property) return;
    result = node;
  });
  return result;
}

function callsIn(ts: typeof TypeScript, node: TypeScript.Node | undefined) {
  const calls: TypeScript.CallExpression[] = [];
  if (node) visit(ts, node, (child) => { if (ts.isCallExpression(child)) calls.push(child); });
  return calls;
}

function firstBindingName(ts: typeof TypeScript, name: TypeScript.BindingName) {
  if (ts.isIdentifier(name)) return name;
  const first = name.elements[0];
  return first && ts.isBindingElement(first) ? first.name : null;
}
