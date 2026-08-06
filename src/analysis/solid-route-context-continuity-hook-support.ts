import * as TypeScript from "typescript";
import { unwrapExpression } from "./route-occurrence-support";
import { resolvedSymbolAtLocation } from "./solid-symbols";

export function guardedContextReturn(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.FunctionLikeDeclaration,
  useContextCall: TypeScript.CallExpression,
): boolean {
  const returnExpressions: TypeScript.Expression[] = [];
  const bindings = new Set<TypeScript.Symbol>();
  const body = declaration.body;
  if (!body) return false;
  const visit = (node: TypeScript.Node) => {
    if (node !== declaration && isFunctionLike(ts, node)) return;
    if (ts.isVariableDeclaration(node) && node.initializer && resolvesToCall(ts, checker, node.initializer, useContextCall) && ts.isIdentifier(node.name)) {
      const symbol = resolvedSymbolAtLocation(ts, checker, node.name);
      if (symbol) bindings.add(symbol);
    }
    if (ts.isReturnStatement(node) && node.expression) returnExpressions.push(node.expression);
    ts.forEachChild(node, visit);
  };
  visit(declaration);
  if (bindings.size === 0 || returnExpressions.length === 0) return false;
  if (!returnExpressions.every((expression) => resolvesToCall(ts, checker, expression, useContextCall))) return false;
  if (hasContextMutation(ts, checker, declaration, bindings)) return false;
  return findTerminatingGuard(ts, checker, declaration, bindings, useContextCall);
}

function resolvesToCall(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Expression,
  call: TypeScript.CallExpression,
  visited = new Set<TypeScript.Symbol>(),
): boolean {
  const current = unwrapExpression(ts, expression);
  if (current === call) return true;
  if (!ts.isIdentifier(current)) return false;
  const symbol = resolvedSymbolAtLocation(ts, checker, current);
  const declaration = symbol?.valueDeclaration;
  if (!symbol || !declaration || visited.has(symbol) || !ts.isVariableDeclaration(declaration) || !declaration.initializer || !ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)) return false;
  visited.add(symbol);
  return resolvesToCall(ts, checker, declaration.initializer, call, visited);
}

function hasContextMutation(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.FunctionLikeDeclaration,
  bindings: Set<TypeScript.Symbol>,
): boolean {
  let mutated = false;
  const touches = (node: TypeScript.Node): boolean => {
    if (ts.isIdentifier(node)) {
      const symbol = resolvedSymbolAtLocation(ts, checker, node);
      return Boolean(symbol && bindings.has(symbol));
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return touches(node.expression);
    return false;
  };
  const visit = (node: TypeScript.Node) => {
    if (node !== declaration && isFunctionLike(ts, node)) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && touches(node.left)) mutated = true;
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
      && touches(node.operand)) mutated = true;
    ts.forEachChild(node, visit);
  };
  visit(declaration);
  return mutated;
}

function findTerminatingGuard(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.FunctionLikeDeclaration,
  bindings: Set<TypeScript.Symbol>,
  call: TypeScript.CallExpression,
): boolean {
  const body = declaration.body;
  if (!body) return false;
  const visit = (node: TypeScript.Node): boolean => {
    if (node !== declaration && isFunctionLike(ts, node)) return false;
    if (ts.isIfStatement(node)) {
      const nullish = nullishCondition(ts, checker, node.expression, bindings, call);
      if (nullish === "failure" && terminatesWithoutReturn(ts, checker, node.thenStatement)) return true;
      if (nullish === "success" && node.elseStatement && terminatesWithoutReturn(ts, checker, node.elseStatement)) return true;
      const truthy = truthyCondition(ts, checker, node.expression, bindings, call);
      if (truthy && branchReturnsCall(ts, checker, node.thenStatement, call) && (node.elseStatement ? terminatesWithoutReturn(ts, checker, node.elseStatement) : nextStatementTerminates(ts, checker, node))) return true;
    }
    let found = false;
    ts.forEachChild(node, (child) => { if (!found && visit(child)) found = true; });
    return found;
  };
  return visit(body);
}

function nullishCondition(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Expression,
  bindings: Set<TypeScript.Symbol>,
  call: TypeScript.CallExpression,
): "failure" | "success" | null {
  const current = unwrapExpression(ts, expression);
  if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken && expressionUsesBinding(ts, checker, current.operand, bindings, call)) return "failure";
  if (!ts.isBinaryExpression(current)) return null;
  const equality = current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken || current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken;
  const inequality = current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken || current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
  if (!equality && !inequality) return null;
  const leftNull = isNullishLiteral(ts, current.left);
  const rightNull = isNullishLiteral(ts, current.right);
  const value = leftNull ? current.right : rightNull ? current.left : null;
  if (!value || !expressionUsesBinding(ts, checker, value, bindings, call)) return null;
  return equality ? "failure" : "success";
}

function truthyCondition(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Expression,
  bindings: Set<TypeScript.Symbol>,
  call: TypeScript.CallExpression,
): boolean {
  return expressionUsesBinding(ts, checker, unwrapExpression(ts, expression), bindings, call) && !nullishCondition(ts, checker, expression, bindings, call);
}

function isNullishLiteral(ts: typeof TypeScript, expression: TypeScript.Expression): boolean {
  const current = unwrapExpression(ts, expression);
  return current.kind === ts.SyntaxKind.NullKeyword || ts.isIdentifier(current) && current.text === "undefined";
}

function expressionUsesBinding(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Node,
  bindings: Set<TypeScript.Symbol>,
  call: TypeScript.CallExpression,
): boolean {
  if (ts.isIdentifier(expression)) {
    const symbol = resolvedSymbolAtLocation(ts, checker, expression);
    return Boolean(symbol && bindings.has(symbol));
  }
  return resolvesToCall(ts, checker, expression as TypeScript.Expression, call);
}

function branchReturnsCall(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  statement: TypeScript.Statement,
  call: TypeScript.CallExpression,
): boolean {
  let found = false;
  let invalid = false;
  const visit = (node: TypeScript.Node) => {
    if (node !== statement && isFunctionLike(ts, node)) return;
    if (ts.isReturnStatement(node)) {
      found = true;
      if (!node.expression || !resolvesToCall(ts, checker, node.expression, call)) invalid = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return found && !invalid;
}

function terminatesWithoutReturn(ts: typeof TypeScript, checker: TypeScript.TypeChecker, statement: TypeScript.Statement): boolean {
  if (ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.length > 0 && statement.statements.every((item) => terminatesWithoutReturn(ts, checker, item));
  if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) return callReturnsNever(ts, checker, statement.expression);
  if (ts.isReturnStatement(statement) && statement.expression && ts.isCallExpression(unwrapExpression(ts, statement.expression))) return callReturnsNever(ts, checker, unwrapExpression(ts, statement.expression) as TypeScript.CallExpression);
  if (ts.isIfStatement(statement) && statement.elseStatement) return terminatesWithoutReturn(ts, checker, statement.thenStatement) && terminatesWithoutReturn(ts, checker, statement.elseStatement);
  if (ts.isWhileStatement(statement) && statement.expression.kind === ts.SyntaxKind.TrueKeyword) return terminatesWithoutReturn(ts, checker, statement.statement);
  return false;
}

function callReturnsNever(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression): boolean {
  const signature = checker.getResolvedSignature(call);
  if (!signature) return false;
  return Boolean(checker.getReturnTypeOfSignature(signature).flags & ts.TypeFlags.Never);
}

function nextStatementTerminates(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.IfStatement): boolean {
  const parent = node.parent;
  if (ts.isBlock(parent)) {
    const index = parent.statements.indexOf(node);
    const next = parent.statements[index + 1];
    return Boolean(next && terminatesWithoutReturn(ts, checker, next));
  }
  return false;
}

function isFunctionLike(ts: typeof TypeScript, node: TypeScript.Node): node is TypeScript.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isArrowFunction(node)
    || ts.isFunctionExpression(node);
}
