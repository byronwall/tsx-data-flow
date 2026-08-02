import path from "node:path";
import type * as TypeScript from "typescript";
import type { ContextTraceLineage } from "../types";
import { isCanonicalSolidCall, resolvedSymbolAtLocation } from "./solid-symbols";

export function contextIdentityForExpression(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  expression: TypeScript.Expression,
) {
  const symbol = resolvedSymbolAtLocation(ts, checker, unwrapExpression(ts, expression));
  const declarations = symbol?.declarations?.filter(ts.isVariableDeclaration) ?? [];
  if (declarations.length !== 1) return null;
  const declaration = declarations[0];
  return declaration.initializer && ts.isCallExpression(declaration.initializer) &&
    isCanonicalSolidCall(ts, checker, declaration.initializer, "createContext")
    ? `context:${relative(root, declaration.getSourceFile().fileName)}:${declaration.getStart(declaration.getSourceFile())}`
    : null;
}

export function contextIdentityForHookCall(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  call: TypeScript.CallExpression,
): string | null {
  if (isCanonicalSolidCall(ts, checker, call, "useContext")) {
    return call.arguments.length === 1
      ? contextIdentityForExpression(ts, checker, root, call.arguments[0])
      : null;
  }
  const wrapper = firstPartyFunctionForCall(ts, checker, root, call);
  if (!wrapper) return null;
  const identities = new Set<string>();
  for (const returned of returnedExpressions(ts, wrapper)) {
    const found = contextIdentitiesInExpression(ts, checker, root, returned, new Set());
    if (!found) return null;
    for (const identity of found) identities.add(identity);
  }
  return identities.size === 1 ? [...identities][0] : null;
}

export function contextProviderIdentityForObject(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  expression: TypeScript.ObjectLiteralExpression,
) {
  const attribute = valueAttributeFor(ts, expression);
  if (!attribute) return null;
  const opening = attribute.parent.parent;
  if (!ts.isJsxOpeningElement(opening) && !ts.isJsxSelfClosingElement(opening)) return null;
  const tag = opening.tagName;
  if (!ts.isPropertyAccessExpression(tag) || tag.name.text !== "Provider") return null;
  return contextIdentityForExpression(ts, checker, root, tag.expression as TypeScript.Expression);
}

export function contextProviderIdentityForNode(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  node: TypeScript.Node,
) {
  let current: TypeScript.Node | undefined = node;
  while (current) {
    if (ts.isJsxAttribute(current) && current.name.getText() === "value" && current.initializer && ts.isJsxExpression(current.initializer) && current.initializer.expression && ts.isObjectLiteralExpression(current.initializer.expression)) {
      return contextProviderIdentityForObject(ts, checker, root, current.initializer.expression);
    }
    if (ts.isJsxExpression(current) && current.expression && ts.isObjectLiteralExpression(current.expression)) {
      return contextProviderIdentityForObject(ts, checker, root, current.expression);
    }
    current = current.parent;
  }
  return null;
}

export function contextMemberName(ts: typeof TypeScript, property: TypeScript.ObjectLiteralElementLike) {
  if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property) || ts.isMethodDeclaration(property)) {
    const name = property.name;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  }
  return null;
}

export function contextDestructuredBinding(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  expression: TypeScript.Identifier,
) {
  const element = expression.parent;
  if (!ts.isBindingElement(element) || element.name !== expression) return null;
  const pattern = element.parent;
  const declaration = pattern.parent;
  if (!ts.isObjectBindingPattern(pattern) || !ts.isVariableDeclaration(declaration) || declaration.name !== pattern || !declaration.initializer) return null;
  const propertyName = element.propertyName;
  const member = propertyName && (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName) || ts.isNumericLiteral(propertyName))
    ? propertyName.text
    : expression.text;
  if (!member) return null;
  const identity = ts.isCallExpression(declaration.initializer)
    ? contextIdentityForHookCall(ts, checker, root, declaration.initializer)
    : null;
  return identity ? { member, identity, declaration } : null;
}

export function lineageForTrace(lineages: ContextTraceLineage[] | undefined) {
  const identities = [...new Set((lineages ?? []).map((lineage) => lineage.identity))];
  return identities.length === 1 ? identities[0] : null;
}

function firstPartyFunctionForCall(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  call: TypeScript.CallExpression,
) {
  const expression = call.expression;
  if (!ts.isIdentifier(expression) && !ts.isPropertyAccessExpression(expression)) return null;
  const symbol = resolvedSymbolAtLocation(ts, checker, ts.isPropertyAccessExpression(expression) ? expression.name : expression);
  const declarations = symbol?.declarations ?? [];
  if (declarations.length !== 1) return null;
  const declaration = declarations[0];
  if (!firstParty(root, declaration)) return null;
  if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration) || ts.isGetAccessorDeclaration(declaration)) return declaration;
  if (ts.isVariableDeclaration(declaration) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) return declaration.initializer;
  return null;
}

function contextIdentitiesInExpression(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  expression: TypeScript.Expression,
  visited: Set<TypeScript.Declaration>,
): Set<string> | null {
  const current = unwrapExpression(ts, expression);
  if (ts.isCallExpression(current)) {
    if (!isCanonicalSolidCall(ts, checker, current, "useContext") || current.arguments.length !== 1) return null;
    const identity = contextIdentityForExpression(ts, checker, root, current.arguments[0]);
    return identity ? new Set([identity]) : null;
  }
  if (ts.isIdentifier(current)) {
    const symbol = resolvedSymbolAtLocation(ts, checker, current);
    const declaration = symbol?.valueDeclaration;
    if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer || visited.has(declaration)) return null;
    visited.add(declaration);
    return contextIdentitiesInExpression(ts, checker, root, declaration.initializer, visited);
  }
  if (ts.isConditionalExpression(current)) {
    const left = contextIdentitiesInExpression(ts, checker, root, current.whenTrue, new Set(visited));
    const right = contextIdentitiesInExpression(ts, checker, root, current.whenFalse, new Set(visited));
    if (!left || !right) return null;
    return new Set([...left, ...right]);
  }
  return null;
}

function returnedExpressions(ts: typeof TypeScript, fn: TypeScript.FunctionLikeDeclaration) {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
  const expressions: TypeScript.Expression[] = [];
  const visit = (node: TypeScript.Node) => {
    if (node !== fn && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) {
      expressions.push(node.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return expressions;
}

function valueAttributeFor(ts: typeof TypeScript, expression: TypeScript.ObjectLiteralExpression) {
  let current: TypeScript.Node | undefined = expression.parent;
  while (current) {
    if (ts.isJsxAttribute(current) && current.name.getText() === "value" && current.initializer && ts.isJsxExpression(current.initializer) && current.initializer.expression === expression) return current;
    current = current.parent;
  }
  return null;
}

function unwrapExpression(ts: typeof TypeScript, expression: TypeScript.Expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
  return current;
}

function firstParty(root: string, declaration: TypeScript.Declaration) {
  const file = declaration.getSourceFile();
  if (file.isDeclarationFile) return false;
  const relative = path.relative(path.resolve(root), path.resolve(file.fileName));
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !relative.split(path.sep).includes("node_modules");
}

function relative(root: string, file: string) {
  return path.relative(path.resolve(root), path.resolve(file)).replaceAll(path.sep, "/");
}
