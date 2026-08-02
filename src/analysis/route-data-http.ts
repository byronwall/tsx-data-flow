import path from "node:path";
import type * as TypeScript from "typescript";
import type { RouteRecord } from "./route-data";
import { declarationIdentity, isCanonicalCreateResourceCall } from "./route-data-resource";
import { stableHash } from "./route-discovery";

export interface RouteDataHttpBridge {
  id: string;
  path: string;
  method: "GET";
  apiRouteKey: string;
  apiRouteFile: string;
  handlerName: string;
  handlerIdentity: string;
  handlerFile: string;
  handlerLine: number;
}

export interface RouteDataHttpBridgeResolution {
  bridge: RouteDataHttpBridge;
  resourceCall: TypeScript.CallExpression;
  fetchCall: TypeScript.CallExpression;
  resourceReturn: TypeScript.Expression | null;
  persistedSources: Array<{ call: TypeScript.CallExpression; shapeNode: TypeScript.Node | null }>;
}

/**
 * Resolve the one HTTP request made by a selected Solid resource. This is
 * deliberately narrow: a direct global fetch, a literal same-origin path,
 * one literal GET, and one exported API handler are all required before any
 * source is stitched across the transport boundary.
 */
export function resolveResourceHttpBridge(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  resourceCall: TypeScript.CallExpression,
  routes: RouteRecord[],
  filesByName: ReadonlyMap<string, TypeScript.SourceFile>,
) {
  const fetcher = selectedResourceFetcher(ts, resourceCall);
  if (!fetcher) return null;
  const fetchCalls = collectFetchCalls(ts, checker, fetcher);
  if (fetchCalls.length !== 1) return null;
  const fetchCall = fetchCalls[0];
  const request = resolveGetRequest(ts, fetchCall);
  if (!request) return null;

  const apiRoutes = routes.filter((route) => isApiRoute(route) && route.pathPattern === request.path);
  if (apiRoutes.length !== 1) return null;
  const route = apiRoutes[0];
  const sourceFile = filesByName.get(path.normalize(path.resolve(root, route.file)));
  if (!sourceFile) return null;
  const handler = exportedHandler(ts, sourceFile, request.method);
  if (!handler) return null;

  const handlerIdentity = declarationIdentity(handler);
  const bridge: RouteDataHttpBridge = {
    id: `http-bridge:${stableHash(`${route.key}:${handlerIdentity}:${request.method}:${request.path}`)}`,
    path: request.path,
    method: request.method,
    apiRouteKey: route.key,
    apiRouteFile: route.file,
    handlerName: request.method,
    handlerIdentity,
    handlerFile: relative(root, sourceFile.fileName),
    handlerLine: lineOf(sourceFile, handler),
  };

  return {
    bridge,
    resourceCall,
    fetchCall,
    resourceReturn: fetcherReturn(ts, fetcher),
    persistedSources: collectHandlerPersistedCalls(ts, checker, root, handler),
  } satisfies RouteDataHttpBridgeResolution;
}

export function collectResourceHttpBridges(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  program: TypeScript.Program,
  root: string,
  reachable: Set<string>,
  routes: RouteRecord[],
  filesByName: ReadonlyMap<string, TypeScript.SourceFile>,
) {
  const bridges = new Map<TypeScript.CallExpression, RouteDataHttpBridgeResolution>();
  for (const absolute of reachable) {
    const sourceFile = program.getSourceFile(absolute);
    if (!sourceFile || isDevSupportFile(sourceFile.fileName)) continue;
    const visit = (node: TypeScript.Node) => {
      if (ts.isCallExpression(node) && isCanonicalCreateResourceCall(ts, checker, node)) {
        const bridge = resolveResourceHttpBridge(ts, checker, root, node, routes, filesByName);
        if (bridge) bridges.set(node, bridge);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return bridges;
}

export function httpBridgeLabel(bridge: RouteDataHttpBridge) {
  return `${bridge.method} ${bridge.path}`;
}

function selectedResourceFetcher(ts: typeof TypeScript, resourceCall: TypeScript.CallExpression) {
  // Solid's source + fetcher overload is the only shape supported here. A
  // resource with a dynamic or indirect fetcher cannot establish an exact
  // transport owner, so it remains a normal resource boundary.
  const fetcher = resourceCall.arguments[1];
  return fetcher && (ts.isArrowFunction(fetcher) || ts.isFunctionExpression(fetcher)) ? fetcher : null;
}

function collectFetchCalls(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  fetcher: TypeScript.ArrowFunction | TypeScript.FunctionExpression,
) {
  const calls: TypeScript.CallExpression[] = [];
  let invalid = false;
  const visit = (node: TypeScript.Node) => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const fetchLike = ts.isIdentifier(expression) && expression.text === "fetch"
        || ts.isPropertyAccessExpression(expression) && expression.name.text === "fetch";
      if (fetchLike) {
        if (!isCanonicalGlobalFetch(ts, checker, node)) invalid = true;
        else calls.push(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fetcher.body);
  return invalid ? [] : calls;
}

function isCanonicalGlobalFetch(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  call: TypeScript.CallExpression,
) {
  if (!ts.isIdentifier(call.expression) || call.expression.text !== "fetch") return false;
  const symbol = checker.getSymbolAtLocation(call.expression);
  if (!symbol) return false;
  if (symbol.flags & ts.SymbolFlags.Alias) return false;
  const declarations = symbol.declarations ?? [];
  return declarations.length > 0
    && declarations.every((declaration) => declaration.getSourceFile().isDeclarationFile)
    && declarations.some((declaration) => {
      const named = declaration as TypeScript.NamedDeclaration;
      return named.name?.getText(declaration.getSourceFile()) === "fetch";
    });
}

function resolveGetRequest(ts: typeof TypeScript, fetchCall: TypeScript.CallExpression) {
  const url = fetchCall.arguments[0];
  if (!url || (!ts.isStringLiteral(url) && !ts.isNoSubstitutionTemplateLiteral(url))) return null;
  const raw = url.text;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw, "http://same-origin.invalid");
  } catch {
    return null;
  }
  const options = fetchCall.arguments[1];
  const method = options ? literalMethod(ts, options) : "GET" as const;
  if (method !== "GET") return null;
  return { path: parsed.pathname, method };
}

function literalMethod(ts: typeof TypeScript, expression: TypeScript.Expression) {
  const unwrapped = unwrapExpression(ts, expression);
  if (!ts.isObjectLiteralExpression(unwrapped)) return null;
  if (unwrapped.properties.some((property) =>
    ts.isSpreadAssignment(property)
    || ("name" in property && property.name && ts.isComputedPropertyName(property.name))
  )) return null;
  const methods = unwrapped.properties.filter((property) =>
    "name" in property && property.name && propertyName(ts, property.name) === "method",
  );
  if (methods.length > 1) return null;
  if (!methods.length) return "GET" as const;
  if (!ts.isPropertyAssignment(methods[0])) return null;
  const value = unwrapExpression(ts, methods[0].initializer);
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
    ? value.text === "GET" ? "GET" as const : null
    : null;
}

function fetcherReturn(
  ts: typeof TypeScript,
  fetcher: TypeScript.ArrowFunction | TypeScript.FunctionExpression,
) {
  if (!ts.isBlock(fetcher.body)) return fetcher.body;
  const returns = fetcher.body.statements
    .filter(ts.isReturnStatement)
    .flatMap((statement) => statement.expression ? [statement.expression] : []);
  return returns.length === 1 ? returns[0] : null;
}

function exportedHandler(
  ts: typeof TypeScript,
  sourceFile: TypeScript.SourceFile,
  method: "GET",
) {
  const matches: TypeScript.Declaration[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === method && isExported(ts, statement)) {
      matches.push(statement);
      continue;
    }
    if (!ts.isVariableStatement(statement) || !isExported(ts, statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === method && declaration.initializer) matches.push(declaration);
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

function isExported(ts: typeof TypeScript, node: TypeScript.Node & { modifiers?: TypeScript.NodeArray<TypeScript.ModifierLike> }) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function collectHandlerPersistedCalls(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  handler: TypeScript.Declaration,
) {
  const calls: Array<{ call: TypeScript.CallExpression; shapeNode: TypeScript.Node | null }> = [];
  const seenCalls = new Set<string>();
  const queued = new Set<string>();
  const queue: Array<{ declaration: TypeScript.Declaration; shapeNode: TypeScript.Node | null }> = [];
  const enqueue = (declaration: TypeScript.Declaration | undefined, shapeNode: TypeScript.Node | null = null) => {
    if (!declaration || !inside(root, declaration.getSourceFile().fileName)) return;
    const key = declarationIdentity(declaration);
    if (queued.has(key)) return;
    queued.add(key);
    queue.push({ declaration, shapeNode });
  };

  // Only calls in the handler's returned response payload seed the traversal.
  // This keeps guard/auth calls such as currentCoach out of the GET data
  // lineage while still following the selected response producer.
  for (const expression of declarationReturns(ts, handler)) {
    for (const call of callExpressions(ts, expression)) {
      for (const declaration of resolvedCallDeclarations(ts, checker, call)) enqueue(declaration);
    }
  }

  while (queue.length && queued.size <= 2_000) {
    const current = queue.shift()!;
    for (const call of declarationCalls(ts, current.declaration)) {
      if (isPersistedRead(ts, call)) {
        const key = `${path.normalize(call.getSourceFile().fileName)}:${call.getStart(call.getSourceFile())}`;
        if (!seenCalls.has(key)) {
          seenCalls.add(key);
          calls.push({ call, shapeNode: current.shapeNode ?? call });
        }
      }
      for (const next of resolvedCallDeclarations(ts, checker, call)) enqueue(next, call);
    }
  }
  return calls.sort((left, right) =>
    relative(root, left.call.getSourceFile().fileName).localeCompare(relative(root, right.call.getSourceFile().fileName))
    || left.call.getStart(left.call.getSourceFile()) - right.call.getStart(right.call.getSourceFile()),
  );
}

function declarationReturns(ts: typeof TypeScript, declaration: TypeScript.Declaration) {
  if (ts.isVariableDeclaration(declaration) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
    return functionReturns(ts, declaration.initializer);
  }
  if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration) || ts.isGetAccessorDeclaration(declaration) || ts.isSetAccessorDeclaration(declaration) || ts.isConstructorDeclaration(declaration)) {
    return functionReturns(ts, declaration);
  }
  return [];
}

function functionReturns(ts: typeof TypeScript, declaration: TypeScript.FunctionLikeDeclaration) {
  if (ts.isArrowFunction(declaration) && !ts.isBlock(declaration.body)) return [declaration.body];
  const returns: TypeScript.Expression[] = [];
  const visit = (node: TypeScript.Node) => {
    if (node !== declaration && isFunctionLike(ts, node)) return;
    if (ts.isReturnStatement(node) && node.expression) returns.push(node.expression);
    ts.forEachChild(node, visit);
  };
  if (declaration.body) visit(declaration.body);
  return returns;
}

function declarationCalls(ts: typeof TypeScript, declaration: TypeScript.Declaration) {
  const body = functionBody(ts, declaration);
  return body ? callExpressions(ts, body) : [];
}

function functionBody(ts: typeof TypeScript, declaration: TypeScript.Declaration) {
  if (ts.isVariableDeclaration(declaration) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) return declaration.initializer.body;
  if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration) || ts.isGetAccessorDeclaration(declaration) || ts.isSetAccessorDeclaration(declaration) || ts.isConstructorDeclaration(declaration)) return declaration.body;
  return null;
}

function callExpressions(ts: typeof TypeScript, expression: TypeScript.Node) {
  const calls: TypeScript.CallExpression[] = [];
  const visit = (node: TypeScript.Node) => {
    if (ts.isCallExpression(node)) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return calls;
}

function resolvedCallDeclarations(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  call: TypeScript.CallExpression,
) {
  const target = ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
  let symbol = checker.getSymbolAtLocation(target);
  try {
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  } catch {
    return [];
  }
  return symbol?.valueDeclaration ? [symbol.valueDeclaration] : symbol?.declarations ?? [];
}

function isPersistedRead(ts: typeof TypeScript, call: TypeScript.CallExpression) {
  const text = call.expression.getText(call.getSourceFile());
  if (/\breadFile(?:Sync)?$/.test(text) || /\breadJsonFile$/.test(text)) return true;
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  return /(?:^|\.)prisma\.[A-Za-z0-9_]+\.(?:findMany|findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow)$/.test(text);
}

function unwrapExpression(ts: typeof TypeScript, expression: TypeScript.Expression): TypeScript.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
  return current;
}

function propertyName(ts: typeof TypeScript, name: TypeScript.PropertyName) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : null;
}

function isFunctionLike(ts: typeof TypeScript, node: TypeScript.Node) {
  return ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);
}

function isApiRoute(route: RouteRecord) {
  return /(?:^|\/)api(?:\/|\.|$)/i.test(route.file) || /^\/api(?:\/|$)/i.test(route.pathPattern);
}

function lineOf(sourceFile: TypeScript.SourceFile, node: TypeScript.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function relative(root: string, file: string) {
  return path.relative(path.resolve(root), path.resolve(file)).replaceAll(path.sep, "/");
}

function inside(root: string, file: string) {
  const relativePath = path.relative(path.resolve(root), path.resolve(file));
  return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..");
}

function isDevSupportFile(file: string) {
  const normalized = file.replaceAll(path.sep, "/").toLowerCase();
  const basename = path.posix.basename(normalized);
  return /(?:^|\/)(?:__tests__|tests?|scripts?|fixtures?|benchmarks?|evals?)(?:\/|$)/.test(normalized)
    || /(?:^|[._-])(?:test|spec|smoke|fixture|benchmark)(?:[._-]|$)/.test(basename);
}
