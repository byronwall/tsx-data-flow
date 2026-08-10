import type * as TypeScript from "typescript";
import { unwrap } from "./program-evidence-support";

/** Return one exact callback result. A block rejects every second return, including bare returns. */
export function exactCallbackReturnExpression(
  ts: typeof TypeScript,
  callback: TypeScript.ArrowFunction,
): TypeScript.Expression | null {
  if (!ts.isBlock(callback.body)) return unwrap(ts, callback.body);
  const returns: TypeScript.ReturnStatement[] = [];
  const visit = (node: TypeScript.Node): void => {
    if (node !== callback && isFunctionLike(ts, node)) return;
    if (ts.isReturnStatement(node)) returns.push(node);
    ts.forEachChild(node, visit);
  };
  visit(callback.body);
  return returns.length === 1 && returns[0].expression
    ? unwrap(ts, returns[0].expression)
    : null;
}

function isFunctionLike(ts: typeof TypeScript, node: TypeScript.Node): boolean {
  return ts.isArrowFunction(node)
    || ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node);
}
