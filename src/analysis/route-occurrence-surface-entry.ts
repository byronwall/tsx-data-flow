import type * as TypeScript from "typescript";
import {
  declarationForResolved,
  resolvedSymbol,
} from "./route-occurrence-support";
import type { RouteOccurrenceSurfaceBuilder, RouteScanContext } from "./route-occurrence-surface-builder";

export function buildRouteEntry(builder: RouteOccurrenceSurfaceBuilder) {
  const routeFile = builder.findSourceFile(builder.route.file);
  const rootDeclaration = routeFile ? routeDeclaration(builder.ts, builder.checker, routeFile) : null;
  if (!routeFile) builder.omit("unresolved-symbol", "The route entry file is not in the compiler program.", null);
  if (!rootDeclaration) builder.omit("unresolved-symbol", "The route has no compiler-resolved default render declaration.", routeFile);
  if (!rootDeclaration) return;
  const named = (rootDeclaration as TypeScript.NamedDeclaration).name ?? rootDeclaration;
  const definition = builder.definitionFor(resolvedSymbol(builder.ts, builder.checker, named), rootDeclaration, builder.route.componentNames[0] ?? "Route");
  const occurrence = definition ? builder.addOccurrence(definition, rootDeclaration, rootContext(asFunction(builder.ts, rootDeclaration))) : null;
  if (occurrence && definition) builder.expandOccurrence(occurrence, definition, 0);
}

export function routeDeclaration(ts: typeof TypeScript, checker: TypeScript.TypeChecker, file: TypeScript.SourceFile): TypeScript.Declaration | null {
  let result: TypeScript.Declaration | null = null;
  const visit = (node: TypeScript.Node) => {
    if (result) return;
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      const resolved = resolvedSymbol(ts, checker, node.expression);
      result = declarationForResolved(resolved) ?? (ts.isFunctionExpression(node.expression) || ts.isArrowFunction(node.expression) ? node.expression : null);
    }
    if (ts.isFunctionDeclaration(node) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) result = node;
    if (ts.isClassDeclaration(node) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) result = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}

export function asFunction(ts: typeof TypeScript, node: TypeScript.Node | null): TypeScript.FunctionLikeDeclaration | null {
  if (!node) return null;
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
  if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) return node.initializer;
  return null;
}

function rootContext(declaration: TypeScript.FunctionLikeDeclaration | null): RouteScanContext {
  return { parentOccurrenceId: null, evaluationOccurrenceId: null, parentBoundaryId: null, boundaryChildKind: null, repetition: "single", markers: [], ownership: "scope-entry", declaration };
}
