import type * as TypeScript from "typescript";

export function accessorDeclaration(
  ts: typeof TypeScript,
  find: TypeScript.CallExpression,
): TypeScript.VariableDeclaration | null {
  const arrow = find.parent;
  return ts.isArrowFunction(arrow) && arrow.body === find
    && ts.isVariableDeclaration(arrow.parent) && ts.isIdentifier(arrow.parent.name)
    ? arrow.parent
    : null;
}

export function parameterPropertyReads(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Expression,
  parameter: TypeScript.Symbol,
): TypeScript.PropertyAccessExpression[] {
  const values: TypeScript.PropertyAccessExpression[] = [];
  visitTypeScript(ts, expression, (node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
      && checker.getSymbolAtLocation(node.expression) === parameter) values.push(node);
  });
  return values;
}

export function resolvesArrayFind(
  checker: TypeScript.TypeChecker,
  name: TypeScript.Identifier,
): boolean {
  return Boolean(checker.getSymbolAtLocation(name)?.declarations?.some((declaration) => (
    declaration.getSourceFile().isDeclarationFile
    && /lib\.es\d+\.core\.d\.ts$/.test(declaration.getSourceFile().fileName)
  )));
}

export function elementKindForExpression(
  ts: typeof TypeScript,
  expression: TypeScript.Expression,
): string {
  if (ts.isCallExpression(expression)) return "call";
  if (ts.isPropertyAccessExpression(expression)) return "field-read";
  if (ts.isIdentifier(expression)) return "value";
  if (ts.isConditionalExpression(expression) || ts.isBinaryExpression(expression)) return "selection";
  return "literal";
}

export function sourceOrder(left: TypeScript.Node, right: TypeScript.Node): number {
  return left.getSourceFile().fileName.localeCompare(right.getSourceFile().fileName)
    || left.getStart() - right.getStart();
}

export function visitTypeScript(
  ts: typeof TypeScript,
  node: TypeScript.Node,
  callback: (node: TypeScript.Node) => void,
): void {
  callback(node);
  ts.forEachChild(node, (child) => visitTypeScript(ts, child, callback));
}
