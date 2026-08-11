import type * as TypeScript from "typescript";
import { compilerSymbolId } from "./program-evidence-support";

export type ResolvedHandlerAction = {
  call: TypeScript.CallExpression;
  name: string;
  property: string;
  receiverName: string;
  payloadObjectIdentity: string;
  receiverSymbolId: string;
  methodSymbolId: string;
  calleeSymbolId: string;
  actionArgumentSymbolId: string;
  forwardedParameterSymbolId: string | null;
};

/** Resolve one handler payload through the exact action method and symbols. */
export function resolveHandlerAction(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  read: TypeScript.PropertyAccessExpression,
  value: TypeScript.Expression,
): ResolvedHandlerAction | null {
  let current: TypeScript.Node = read;
  while (current.parent) {
    current = current.parent;
    if (ts.isPropertyAssignment(current) && contains(current.initializer, read)) {
      const object = current.parent;
      const call = object && ts.isObjectLiteralExpression(object) ? object.parent : null;
      if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(current.name)) return null;
      const property = current.name.text;
      if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "run") {
        return directAction(ts, checker, root, call, property, read);
      }
      return forwardedAction(ts, checker, root, call, property, read);
    }
  }
  return null;
}

function directAction(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  call: TypeScript.CallExpression,
  property: string,
  read: TypeScript.PropertyAccessExpression,
): ResolvedHandlerAction | null {
  if (!ts.isPropertyAccessExpression(call.expression) || call.arguments.length !== 2
    || !ts.isStringLiteral(call.arguments[0]) || !ts.isObjectLiteralExpression(call.arguments[1])) return null;
  const receiverSymbolId = compilerSymbolId(ts, checker, root, call.expression.expression);
  const methodSymbolId = compilerSymbolId(ts, checker, root, call.expression.name);
  const calleeSymbolId = compilerSymbolId(ts, checker, root, call.expression);
  const actionArgumentSymbolId = nodeIdentity(ts, root, call.arguments[0]);
  const payloadObjectIdentity = nodeIdentity(ts, root, call.arguments[1]);
  if (!receiverSymbolId || !methodSymbolId || !calleeSymbolId || !actionArgumentSymbolId || !payloadObjectIdentity) return null;
  const payload = call.arguments[1];
  const payloadProperties = payload.properties.filter((item) => ts.isPropertyAssignment(item)
    && ts.isIdentifier(item.name) && contains(item.initializer, read));
  if (payloadProperties.length !== 1) return null;
  return {
    call,
    name: call.arguments[0].text,
    property,
    receiverName: call.expression.expression.getText(call.getSourceFile()),
    payloadObjectIdentity,
    receiverSymbolId,
    methodSymbolId,
    calleeSymbolId,
    actionArgumentSymbolId,
    forwardedParameterSymbolId: null,
  };
}

function forwardedAction(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  outerCall: TypeScript.CallExpression,
  property: string,
  read: TypeScript.PropertyAccessExpression,
): ResolvedHandlerAction | null {
  if (!ts.isIdentifier(outerCall.expression) || outerCall.arguments.length !== 1
    || !ts.isObjectLiteralExpression(outerCall.arguments[0])) return null;
  const helperSymbol = checker.getSymbolAtLocation(outerCall.expression);
  const declarations = helperSymbol?.declarations?.filter((item) => ts.isVariableDeclaration(item)) ?? [];
  const declaration = helperSymbol?.valueDeclaration && ts.isVariableDeclaration(helperSymbol.valueDeclaration)
    ? helperSymbol.valueDeclaration
    : declarations.length === 1 ? declarations[0] : null;
  if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer
    || (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer))) return null;
  const helper = declaration.initializer;
  const parameter = helper.parameters.length === 1 && ts.isIdentifier(helper.parameters[0].name)
    ? helper.parameters[0].name : null;
  const parameterSymbol = parameter ? checker.getSymbolAtLocation(parameter) : null;
  if (!parameter || !parameterSymbol) return null;
  const outerPayload = outerCall.arguments[0];
  const matches: ResolvedHandlerAction[] = [];
  ts.forEachChild(helper.body, function visit(node): void {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
      || node.expression.name.text !== "run" || node.arguments.length !== 2
      || !ts.isStringLiteral(node.arguments[0]) || !ts.isIdentifier(node.arguments[1])
      || checker.getSymbolAtLocation(node.arguments[1]) !== parameterSymbol) {
      ts.forEachChild(node, visit);
      return;
    }
    const receiverSymbolId = compilerSymbolId(ts, checker, root, node.expression.expression);
    const methodSymbolId = compilerSymbolId(ts, checker, root, node.expression.name);
    const calleeSymbolId = compilerSymbolId(ts, checker, root, outerCall.expression);
    const actionArgumentSymbolId = nodeIdentity(ts, root, node.arguments[0]);
    const payloadObjectIdentity = nodeIdentity(ts, root, outerPayload);
    const forwardedParameterSymbolId = compilerSymbolId(ts, checker, root, node.arguments[1]);
    if (!receiverSymbolId || !methodSymbolId || !calleeSymbolId || !actionArgumentSymbolId || !payloadObjectIdentity || !forwardedParameterSymbolId) return;
    const payloadProperties = outerPayload.properties.filter((item) => ts.isPropertyAssignment(item)
      && ts.isIdentifier(item.name) && item.name.text === property && contains(item.initializer, read));
    if (payloadProperties.length !== 1) return;
    matches.push({
      call: node,
      name: node.arguments[0].text,
      property,
      receiverName: node.expression.expression.getText(node.getSourceFile()),
      payloadObjectIdentity,
      receiverSymbolId,
      methodSymbolId,
      calleeSymbolId,
      actionArgumentSymbolId,
      forwardedParameterSymbolId,
    });
  });
  return matches.length === 1 ? matches[0] : null;
}

function nodeIdentity(ts: typeof TypeScript, root: string, node: TypeScript.Node): string {
  const source = node.getSourceFile();
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  const relative = source.fileName.startsWith(`${root}/`) ? source.fileName.slice(root.length + 1) : source.fileName;
  return `${relative}:${start.line + 1}:${start.character + 1}:${end.line + 1}:${end.character + 1}:${ts.SyntaxKind[node.kind]}`;
}

function contains(owner: TypeScript.Node, child: TypeScript.Node): boolean {
  return owner.getSourceFile() === child.getSourceFile()
    && owner.getStart(owner.getSourceFile()) <= child.getStart(child.getSourceFile())
    && owner.getEnd() >= child.getEnd();
}
