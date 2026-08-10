import path from "node:path";
import * as TypeScript from "typescript";
import type {
  ProgramElement,
  ProgramEvidenceLocation,
  ProgramProof,
} from "./program-evidence";

export type HttpBridgeFetch = {
  node: TypeScript.CallExpression;
  elementId: string;
  ownerId: string | null;
};

export type HttpBridgeCall = {
  node: TypeScript.CallExpression | TypeScript.NewExpression;
  target: { id: string; declaration: TypeScript.FunctionLikeDeclaration } | null;
};

export type HttpBridgeResource = {
  node: TypeScript.CallExpression;
  elementId: string;
  loaderTargetId: string | null;
};

export type HttpBridgeResponse = {
  node: TypeScript.CallExpression;
  elementId: string;
  ownerId: string | null;
};

export type HttpBridgeEvidenceContext = {
  root: string;
  checkCancellation: () => void;
  ts: typeof TypeScript;
  checker: TypeScript.TypeChecker;
  elements: readonly ProgramElement[];
  fetches: readonly HttpBridgeFetch[];
  calls: readonly HttpBridgeCall[];
  handlers: readonly { id: string; declaration: TypeScript.FunctionLikeDeclaration }[];
  resources: readonly HttpBridgeResource[];
  responses: readonly HttpBridgeResponse[];
  requestParameterIds: ReadonlyMap<string, string>;
  symbolId: (node: TypeScript.Node) => string | null;
  location: (node: TypeScript.Node) => ProgramEvidenceLocation;
};

export type HttpBridgeEvidence = {
  from: string;
  to: string;
  clientFetchId: string;
  locations: ProgramEvidenceLocation[];
  proof: ProgramProof;
};

type StaticRequest = {
  method: string;
  path: string;
};

type RouteGuard = {
  method: string;
  path: string;
  condition: TypeScript.Expression;
  methodComparison: TypeScript.BinaryExpression;
  pathComparison: TypeScript.BinaryExpression;
  pathNormalization: TypeScript.VariableDeclaration;
};

/** Match only compiler-linked handlers for one static method/path tuple. */
export function collectHttpBridgeEvidence(
  context: HttpBridgeEvidenceContext,
): HttpBridgeEvidence[] {
  context.checkCancellation();
  const elementsById = new Map<string, ProgramElement>();
  for (const element of context.elements) {
    context.checkCancellation();
    elementsById.set(element.id, element);
  }
  const handlerCalls = context.calls.filter((call) => {
    context.checkCancellation();
      const target = call.target;
      const targetElement = target ? elementsById.get(target.id) : undefined;
      return Boolean(
        context.ts.isCallExpression(call.node)
        && target
        && (targetElement?.kind === "handler-entry" || targetElement?.kind === "function-entry")
        && handlerMethod(target.declaration) !== null
        && hasRequestParameterProof(context, target.declaration),
      );
  });
  const directHandlers = context.handlers.filter((handler) => {
    const element = elementsById.get(handler.id);
    return (element?.kind === "handler-entry" || element?.kind === "function-entry")
      && handlerMethod(handler.declaration) !== null
      && routePathForHandler(context, handler.declaration) !== null;
  });
  const matches: HttpBridgeEvidence[] = [];
  const seen = new Set<string>();

  for (const fetch of context.fetches) {
    context.checkCancellation();
    const clientRequest = staticFetchRequest(context.ts, fetch.node);
    if (!clientRequest || !fetch.ownerId) continue;

    const handlerCandidates = [
      ...handlerCalls.flatMap((call) => {
      context.checkCancellation();
      const target = call.target;
      if (!target || !context.ts.isCallExpression(call.node)) return [];
      const guard = routeGuardForCall(context, call.node);
      const routePath = routePathForHandler(context, target.declaration);
      const methodMatches = guard
        ? guard.method === clientRequest.method && guard.path === clientRequest.path
        : handlerMethod(target.declaration) === clientRequest.method && routePath === clientRequest.path;
      if (!methodMatches) return [];
      const response = responseForHandler(context, target.id);
      return response ? [{ call, target, guard, response }] : [];
      }),
      ...directHandlers.flatMap((target) => {
        context.checkCancellation();
        const routePath = routePathForHandler(context, target.declaration);
        if (routePath !== clientRequest.path || handlerMethod(target.declaration) !== clientRequest.method) return [];
        const response = responseForHandler(context, target.id);
        return response ? [{ call: null, target, guard: null, response }] : [];
      }),
    ].filter((candidate, index, candidates) => candidates.findIndex((other) =>
      other.target.id === candidate.target.id && other.response.elementId === candidate.response.elementId,
    ) === index);
    const resourceCandidates = context.resources.filter((resource) => {
      context.checkCancellation();
      return resource.loaderTargetId !== null && resource.loaderTargetId === fetch.ownerId;
    });
    if (handlerCandidates.length !== 1 || resourceCandidates.length !== 1) continue;

    const [{ call, target, guard, response }] = handlerCandidates;
    const [resource] = resourceCandidates;

    const key = `${response.elementId}:${resource.elementId}:${call ? call.node.getStart(call.node.getSourceFile()) : target.declaration.getStart(target.declaration.getSourceFile())}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const locations = [
      context.location(fetch.node),
      ...(guard ? [
        context.location(guard.pathNormalization),
        context.location(guard.condition),
        context.location(guard.methodComparison),
        context.location(guard.pathComparison),
      ] : []),
      context.location(target.declaration),
      ...(call ? [context.location(call.node)] : []),
      context.location(response.node),
      context.location(resource.node),
    ];
    const proof: ProgramProof = {
      kind: "http-bridge",
      detail:
        `Exact normalized HTTP bridge tuple: ${clientRequest.method} ${clientRequest.path} client fetch, `
        + (guard ? "compiler-resolved route guard" : "compiler-resolved route declaration")
        + ", one handler response body, and one createResource input.",
      locations,
    };
    matches.push({ from: response.elementId, to: resource.elementId, clientFetchId: fetch.elementId, locations, proof });
  }

  return matches;
}

function responseForHandler(
  context: HttpBridgeEvidenceContext,
  handlerId: string,
): HttpBridgeResponse | null {
  const responses = context.responses.filter((response) => {
    context.checkCancellation();
    return response.ownerId === handlerId && isResponseBody(context.ts, response.node);
  });
  if (responses.length === 1) return responses[0];
  const snapshotResponses = responses.filter((response) => hasSnapshotBody(context, response.node));
  return snapshotResponses.length === 1 ? snapshotResponses[0] : null;
}

function isResponseBody(
  ts: typeof TypeScript,
  node: TypeScript.CallExpression,
): boolean {
  if (!ts.isPropertyAccessExpression(node.expression) || node.arguments.length === 0) return false;
  if (node.expression.name.text === "end") return true;
  return node.expression.name.text === "json"
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "Response";
}

function hasSnapshotBody(
  context: HttpBridgeEvidenceContext,
  node: TypeScript.CallExpression,
): boolean {
  const body = objectLiteral(context.ts, node.arguments[0]);
  if (!body) return false;
  for (const property of body.properties) {
    context.checkCancellation();
    if (!context.ts.isSpreadAssignment(property)) continue;
    const expression = unwrap(context.ts, property.expression);
    if (!context.ts.isAwaitExpression(expression) || !context.ts.isCallExpression(expression.expression)) continue;
    const target = context.calls.find((call) => call.node === expression.expression)?.target;
    if (target && isExactSnapshotTarget(context, target.declaration) && normalizedSourcePath(context, target.declaration.getSourceFile()) === "src/lib/soccer/store.ts") return true;
  }
  return false;
}

function isExactSnapshotTarget(
  context: HttpBridgeEvidenceContext,
  declaration: TypeScript.FunctionLikeDeclaration,
): boolean {
  const parent = declaration.parent;
  if (!context.ts.isVariableDeclaration(parent) || !context.ts.isIdentifier(parent.name)) return false;
  return parent.name.text === "getSnapshot";
}

function hasRequestParameterProof(
  context: HttpBridgeEvidenceContext,
  declaration: TypeScript.FunctionLikeDeclaration,
): boolean {
  for (const parameter of declaration.parameters) {
    context.checkCancellation();
    for (const binding of bindingIdentifiers(context.ts, parameter.name)) {
      context.checkCancellation();
      const symbolId = context.symbolId(binding);
      const parameterId = symbolId ? context.requestParameterIds.get(symbolId) : null;
      const evidence = parameterId ? elementForId(context, parameterId) : null;
      if (evidence?.kind === "parameter" && (evidence.attributes.originRole === "request" || evidence.attributes.originRole === "event")) return true;
    }
  }
  return false;
}

function elementForId(context: HttpBridgeEvidenceContext, id: string): ProgramElement | null {
  for (const element of context.elements) {
    context.checkCancellation();
    if (element.id === id) return element;
  }
  return null;
}

function bindingIdentifiers(
  ts: typeof TypeScript,
  name: TypeScript.BindingName,
): TypeScript.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap((element) => ts.isBindingElement(element) ? bindingIdentifiers(ts, element.name) : []);
}

function staticFetchRequest(
  ts: typeof TypeScript,
  node: TypeScript.CallExpression,
): StaticRequest | null {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "fetch") return null;
  const target = staticString(ts, node.arguments[0]);
  if (target === null) return null;
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  const method = staticFetchMethod(ts, node.arguments[1]);
  if (method === null) return null;
  const path = normalizePath(target);
  if (path === null) return null;
  const normalizedMethod = normalizeMethod(method);
  return normalizedMethod ? { method: normalizedMethod, path } : null;
}

function routePathForHandler(
  context: HttpBridgeEvidenceContext,
  declaration: TypeScript.FunctionLikeDeclaration,
): string | null {
  const relative = normalizedSourcePath(context, declaration.getSourceFile());
  if (!relative) return null;
  if (!relative.startsWith("src/routes/")) return null;
  const withoutExtension = relative.replace(/\.(?:tsx?|jsx?)$/, "");
  const route = withoutExtension.slice("src/routes/".length);
  if (!route.startsWith("api/")) return null;
  const segments = route.split("/").filter(Boolean);
  if (segments.at(-1) === "index") segments.pop();
  const pathValue = `/${segments.map((segment) => segment
    .replace(/^\[\.\.\.(.+)\]$/, ":$1*")
    .replace(/^\[(.+)\]$/, ":$1"))
    .join("/")}`;
  return pathValue === "/" ? "/" : pathValue;
}

/** Normalize one exact source-root layout without accepting arbitrary suffixes. */
function normalizedSourcePath(context: HttpBridgeEvidenceContext, file: TypeScript.SourceFile): string | null {
  const relative = path.relative(context.root, file.fileName).replaceAll(path.sep, "/");
  if (relative.startsWith("src/")) return relative;
  return relative.startsWith("app/src/") ? relative.slice("app/".length) : null;
}

function handlerMethod(declaration: TypeScript.FunctionLikeDeclaration): string | null {
  const name = declaration.name?.getText(declaration.getSourceFile()) ?? "";
  return /^[A-Z]+$/.test(name) ? name : null;
}

function objectLiteral(
  ts: typeof TypeScript,
  node: TypeScript.Expression | undefined,
): TypeScript.ObjectLiteralExpression | null {
  const expression = node ? unwrap(ts, node) : null;
  return expression && ts.isObjectLiteralExpression(expression) ? expression : null;
}

function staticFetchMethod(
  ts: typeof TypeScript,
  options: TypeScript.Expression | undefined,
): string | null {
  if (!options) return "GET";
  if (!ts.isObjectLiteralExpression(options)) return null;

  let method: string | null = null;
  for (const property of options.properties) {
    if (ts.isSpreadAssignment(property) || property.name && ts.isComputedPropertyName(property.name)) return null;
    const name = property.name ? property.name.getText(options.getSourceFile()).replace(/["']/g, "") : null;
    if (name !== "method") continue;
    if (!ts.isPropertyAssignment(property) || method !== null) return null;
    method = staticString(ts, property.initializer);
    if (method === null) return null;
  }
  return method ?? "GET";
}

function staticString(
  ts: typeof TypeScript,
  node: TypeScript.Node | undefined,
): string | null {
  if (!node) return null;
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function normalizeMethod(method: string): string {
  return method.trim().toUpperCase();
}

function normalizePath(target: string): string | null {
  try {
    return new URL(target, "http://tsx-data-flow.invalid").pathname || "/";
  } catch {
    return null;
  }
}

function routeGuardForCall(
  context: HttpBridgeEvidenceContext,
  call: TypeScript.CallExpression,
): RouteGuard | null {
  const { ts } = context;
  let current: TypeScript.Node = call;
  while (current.parent) {
    context.checkCancellation();
    const parent = current.parent;
    if (ts.isIfStatement(parent) && containsNode(parent.thenStatement, call)) {
      const guard = staticRouteGuard(context, parent.expression);
      if (guard) return guard;
    }
    current = parent;
  }
  return null;
}

function staticRouteGuard(
  context: HttpBridgeEvidenceContext,
  condition: TypeScript.Expression,
): RouteGuard | null {
  const terms = andTerms(context.ts, condition);
  const methodMatches: Array<{ value: string; comparison: TypeScript.BinaryExpression }> = [];
  const pathMatches: Array<{ value: string; comparison: TypeScript.BinaryExpression; declaration: TypeScript.VariableDeclaration }> = [];

  for (const term of terms) {
    context.checkCancellation();
    const comparison = strictStringComparison(context.ts, term);
    if (!comparison) continue;
    const left = unwrap(context.ts, comparison.left);
    const right = unwrap(context.ts, comparison.right);
    const leftString = staticString(context.ts, left);
    const rightString = staticString(context.ts, right);

    if (context.ts.isPropertyAccessExpression(left) && left.name.text === "method" && rightString !== null && isRequestExpression(context, left.expression)) {
      methodMatches.push({ value: normalizeMethod(rightString), comparison });
    } else if (
      context.ts.isPropertyAccessExpression(right) &&
      right.name.text === "method" &&
      leftString !== null &&
      isRequestExpression(context, right.expression)
    ) {
      methodMatches.push({ value: normalizeMethod(leftString), comparison });
    }

    const leftPathDeclaration = context.ts.isIdentifier(left) ? pathExpressionDeclaration(context, left) : null;
    const rightPathDeclaration = context.ts.isIdentifier(right) ? pathExpressionDeclaration(context, right) : null;
    if (leftPathDeclaration && rightString !== null) {
      pathMatches.push({ value: normalizePath(rightString) ?? rightString, comparison, declaration: leftPathDeclaration });
    } else if (rightPathDeclaration && leftString !== null) {
      pathMatches.push({ value: normalizePath(leftString) ?? leftString, comparison, declaration: rightPathDeclaration });
    }
  }

  if (methodMatches.length !== 1 || pathMatches.length !== 1) return null;
  return {
    method: methodMatches[0].value,
    path: pathMatches[0].value,
    condition,
    methodComparison: methodMatches[0].comparison,
    pathComparison: pathMatches[0].comparison,
    pathNormalization: pathMatches[0].declaration,
  };
}

function andTerms(
  ts: typeof TypeScript,
  expression: TypeScript.Expression,
): TypeScript.Expression[] {
  const unwrapped = unwrap(ts, expression);
  if (ts.isBinaryExpression(unwrapped) && unwrapped.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return [...andTerms(ts, unwrapped.left), ...andTerms(ts, unwrapped.right)];
  }
  return [unwrapped];
}

function strictStringComparison(
  ts: typeof TypeScript,
  expression: TypeScript.Expression,
): TypeScript.BinaryExpression | null {
  if (!ts.isBinaryExpression(expression)) return null;
  return expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ? expression : null;
}

function isRequestExpression(
  context: HttpBridgeEvidenceContext,
  expression: TypeScript.Expression,
): boolean {
  const symbolId = context.symbolId(unwrap(context.ts, expression));
  const parameterId = symbolId ? context.requestParameterIds.get(symbolId) : null;
  if (!parameterId) return false;
  const parameter = context.elements.find((element) => element.id === parameterId);
  return parameter?.kind === "parameter" && parameter.attributes.originRole === "request";
}

function pathExpressionDeclaration(
  context: HttpBridgeEvidenceContext,
  expression: TypeScript.Identifier,
): TypeScript.VariableDeclaration | null {
  const symbol = context.checker.getSymbolAtLocation(expression);
  const declaration = symbol?.declarations?.find((item) => context.ts.isVariableDeclaration(item));
  if (!declaration || !context.ts.isVariableDeclaration(declaration) || !declaration.initializer) return null;
  const initializer = unwrap(context.ts, declaration.initializer);
  if (!context.ts.isPropertyAccessExpression(initializer) || initializer.name.text !== "pathname") return null;
  const receiver = unwrap(context.ts, initializer.expression);
  return context.ts.isNewExpression(receiver)
    && context.ts.isIdentifier(receiver.expression)
    && receiver.expression.text === "URL"
    ? declaration
    : null;
}

function unwrap(
  ts: typeof TypeScript,
  expression: TypeScript.Expression,
): TypeScript.Expression {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrap(ts, expression.expression);
  }
  return expression;
}

function containsNode(ancestor: TypeScript.Node, node: TypeScript.Node): boolean {
  let current: TypeScript.Node | undefined = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}
