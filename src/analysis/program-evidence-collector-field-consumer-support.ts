import type * as TypeScript from "typescript";

export function componentConditionExpression(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): TypeScript.BinaryExpression | TypeScript.ConditionalExpression | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isBinaryExpression(current) && current.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return current;
    if (ts.isConditionalExpression(current)) return current;
    if (ts.isFunctionLike(current) || ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return null;
  }
  return null;
}

export function enclosingJsxPropName(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): string | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxAttribute(current)) return ts.isIdentifier(current.name) ? current.name.text : null;
    if (ts.isFunctionLike(current)) return null;
  }
  return null;
}

export function isCollectionPredicate(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): boolean {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)
      && ["find", "filter"].includes(current.expression.name.text)) return true;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return false;
  }
  return false;
}

export function hasJsxExpressionAncestor(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): boolean {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxExpression(current)) return true;
    if (ts.isFunctionLike(current)) return false;
  }
  return false;
}

export function componentConditionLabel(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): string {
  const collection = componentConditionCollection(ts, field);
  if (collection === "schedules") return "Completed schedule gameId condition";
  if (collection === "availability") return ts.isPropertyAccessExpression(field.expression) && field.expression.name.text === "game"
    ? "Scheduled availability gameId condition" : "Completed availability gameId condition";
  if (collection === "liveGames") return "Completed live gameId condition";
  return "component prop condition";
}

export function componentConditionAttributes(ts: typeof TypeScript, value: TypeScript.BinaryExpression | TypeScript.ConditionalExpression): Record<string, string | number | boolean | null> {
  const comparison = ts.isBinaryExpression(value) ? value : ts.isBinaryExpression(value.condition) ? value.condition : null;
  return {
    conditionOperator: comparison?.operatorToken.getText(comparison.getSourceFile()) ?? null,
    conditionLiteral: comparison && ts.isStringLiteral(comparison.right) ? comparison.right.text : null,
    nestedShow: false,
  };
}

export function componentConditionCollection(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): string | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)
      && ["find", "filter"].includes(current.expression.name.text)) return collectionName(ts, current.expression.expression);
    if (ts.isFunctionLike(current)) {
      const parent = current.parent;
      if (parent && ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)
        && ["find", "filter"].includes(parent.expression.name.text)) return collectionName(ts, parent.expression.expression);
      break;
    }
  }
  return null;
}

export function enclosingJsxOpening(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): TypeScript.JsxOpeningLikeElement | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxExpression(current)) {
      const parent = current.parent;
      const opening = parent && ts.isJsxAttribute(parent)
        ? parent.parent.parent && (ts.isJsxOpeningElement(parent.parent.parent) || ts.isJsxSelfClosingElement(parent.parent.parent))
          ? parent.parent.parent : null
        : parent && (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent))
          ? ts.isJsxElement(parent) ? parent.openingElement : parent : null;
      return opening;
    }
    if (ts.isFunctionLike(current)) return null;
  }
  return null;
}

export function propertyReads(ts: typeof TypeScript, expression: TypeScript.Expression): TypeScript.PropertyAccessExpression[] {
  const reads: TypeScript.PropertyAccessExpression[] = [];
  visit(ts, expression, (node) => { if (ts.isPropertyAccessExpression(node) && !node.questionDotToken) reads.push(node); });
  return [...new Map(reads.map((read) => [read.getStart(read.getSourceFile()), read])).values()];
}

export function containsJsx(ts: typeof TypeScript, expression: TypeScript.Expression): boolean {
  let found = false;
  visit(ts, expression, (node) => { if (node !== expression && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) found = true; });
  return found;
}

export function conditionExpression(ts: typeof TypeScript, read: TypeScript.PropertyAccessExpression, value: TypeScript.Expression): TypeScript.BinaryExpression | TypeScript.ConditionalExpression | null {
  let current: TypeScript.Node = read;
  while (current !== value && current.parent) {
    current = current.parent;
    if (ts.isBinaryExpression(current) && current.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return current;
    if (ts.isConditionalExpression(current)) return current;
  }
  return ts.isBinaryExpression(value) || ts.isConditionalExpression(value) ? value : null;
}

export function conditionAttributes(ts: typeof TypeScript, value: TypeScript.BinaryExpression | TypeScript.ConditionalExpression, node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement): Record<string, string | number | boolean | null> {
  const comparison = ts.isBinaryExpression(value) ? value : ts.isBinaryExpression(value.condition) ? value.condition : null;
  const nestedShow = ts.isJsxElement(node) && node.children.some((child) => ts.isJsxElement(child) && child.openingElement.tagName.getText(child.getSourceFile()) === "Show");
  return { conditionOperator: comparison?.operatorToken.getText(comparison.getSourceFile()) ?? null, conditionLiteral: comparison && ts.isStringLiteral(comparison.right) ? comparison.right.text : null, nestedShow };
}

function collectionName(ts: typeof TypeScript, receiver: TypeScript.Expression): string | null {
  return ts.isPropertyAccessExpression(receiver) ? receiver.name.text
    : ts.isCallExpression(receiver) && ts.isIdentifier(receiver.expression) ? receiver.expression.text
      : ts.isIdentifier(receiver) ? receiver.text : null;
}

function visit(ts: typeof TypeScript, node: TypeScript.Node, callback: (node: TypeScript.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(ts, child, callback));
}
