import path from "node:path";
import * as TypeScript from "typescript";
import type { CompilerLocation } from "./component-occurrence-identity";
import type { RouteSlotExpression } from "./route-occurrence-surface";
import { stableHash } from "./route-discovery";

export type ResolvedComponent = {
  symbol: TypeScript.Symbol;
  declaration: TypeScript.Declaration | null;
  compilerIdentity: string;
};

export function visit(ts: typeof TypeScript, node: TypeScript.Node | undefined, callback: (node: TypeScript.Node) => void) {
  if (!node) return;
  callback(node);
  ts.forEachChild(node, (child) => visit(ts, child, callback));
}

export function locationForNode(root: string, node: TypeScript.Node): CompilerLocation {
  const sourceFile = node.getSourceFile();
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    file: relative(root, sourceFile.fileName),
    line: start.line + 1,
    column: start.character + 1,
    span: {
      startLine: start.line + 1,
      startColumn: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
    },
  };
}

export function sourceIdentityForNode(root: string, node: TypeScript.Node) {
  const sourceFile = node.getSourceFile();
  return `${relative(root, sourceFile.fileName)}:${node.getStart(sourceFile)}:${node.getEnd()}`;
}

export function stableIdentity(prefix: string, values: readonly string[]) {
  return `${prefix}:${stableHash(values.join("\u0000"))}`;
}

export function relative(root: string, file: string) {
  return path.relative(path.resolve(root), path.resolve(file)).replaceAll(path.sep, "/");
}

export function inside(root: string, file: string) {
  const relativeFile = path.relative(path.resolve(root), path.resolve(file));
  return relativeFile === "" || (!relativeFile.startsWith(`..${path.sep}`) && relativeFile !== "..");
}

export function resolvedSymbol(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node): ResolvedComponent | null {
  let symbol = checker.getSymbolAtLocation(node);
  if (!symbol) return null;
  try {
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  } catch {
    return null;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.find((candidate) => !candidate.getSourceFile().isDeclarationFile) ?? symbol.declarations?.[0] ?? null;
  return { symbol, declaration, compilerIdentity: checker.getFullyQualifiedName(symbol) };
}

export function declarationForResolved(resolved: ResolvedComponent | null): TypeScript.Declaration | null {
  const declaration = resolved?.declaration;
  if (!declaration) return null;
  if (isFunctionLikeDeclaration(declaration)) return declaration;
  if (TypeScript.isVariableDeclaration(declaration) && declaration.initializer && isFunctionLikeDeclaration(declaration.initializer)) return declaration.initializer;
  if (TypeScript.isClassDeclaration(declaration)) return declaration;
  return declaration;
}

export function isFunctionLikeDeclaration(node: TypeScript.Node): node is TypeScript.FunctionLikeDeclaration {
  return TypeScript.isFunctionDeclaration(node)
    || TypeScript.isMethodDeclaration(node)
    || TypeScript.isGetAccessorDeclaration(node)
    || TypeScript.isSetAccessorDeclaration(node)
    || TypeScript.isConstructorDeclaration(node)
    || TypeScript.isArrowFunction(node)
    || TypeScript.isFunctionExpression(node);
}

export function declarationName(ts: typeof TypeScript, node: TypeScript.Node) {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (isFunctionLikeDeclaration(node) && node.name && ts.isIdentifier(node.name)) return node.name.text;
  return null;
}

export function tagName(ts: typeof TypeScript, node: TypeScript.JsxTagNameExpression) {
  return node.getText(node.getSourceFile());
}

export function isComponentTag(ts: typeof TypeScript, node: TypeScript.JsxTagNameExpression) {
  const name = tagName(ts, node);
  return /^[A-Z]/.test(name) || ts.isPropertyAccessExpression(node) || ts.isJsxNamespacedName(node);
}

export function importModuleFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  const symbol = checker.getSymbolAtLocation(node);
  for (const declaration of symbol?.declarations ?? []) {
    let current: TypeScript.Node | undefined = declaration;
    while (current) {
      if (ts.isImportDeclaration(current) && ts.isStringLiteral(current.moduleSpecifier)) return current.moduleSpecifier.text;
      current = current.parent;
    }
  }
  return null;
}

export function callName(ts: typeof TypeScript, node: TypeScript.CallExpression) {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return node.expression.getText(node.getSourceFile());
}

export function propertyName(ts: typeof TypeScript, node: TypeScript.Expression) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) return node.argumentExpression.text;
  return null;
}

export function unwrapExpression(ts: typeof TypeScript, expression: TypeScript.Expression): TypeScript.Expression {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression)) return unwrapExpression(ts, expression.expression);
  return expression;
}

export function isJsxNode(ts: typeof TypeScript, node: TypeScript.Node): node is TypeScript.JsxElement | TypeScript.JsxSelfClosingElement | TypeScript.JsxFragment {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
}

export function isCollectionType(checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  try {
    const type = checker.getTypeAtLocation(node);
    const apparent = checker.getApparentType(type);
    return checker.isArrayType(apparent) || checker.isTupleType(apparent) || Boolean(apparent.getProperty("map"));
  } catch {
    return false;
  }
}

export function isUnknownType(checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  try {
    const text = checker.typeToString(checker.getTypeAtLocation(node), node, TypeScript.TypeFormatFlags.NoTruncation);
    return text === "any" || text === "unknown";
  } catch {
    return true;
  }
}

export function safeTypeText(checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  try {
    return checker.typeToString(checker.getTypeAtLocation(node), node, TypeScript.TypeFormatFlags.NoTruncation);
  } catch {
    return "unknown";
  }
}

export function isSlotExpression(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Expression, declaration: TypeScript.FunctionLikeDeclaration | null) {
  return Boolean(slotExpressionFor(ts, checker, node, declaration));
}

export function slotExpressionFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Expression, declaration: TypeScript.FunctionLikeDeclaration | null): RouteSlotExpression | null {
  const expression = unwrapExpression(ts, node);
  if (ts.isIdentifier(expression) && /^(?:children|slot|content)$/.test(expression.text)) {
    if (!parameterMatches(checker, expression, declaration)) return null;
    return { kind: expression.text === "children" ? "children-parameter" : "named-slot", label: expression.text };
  }
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return null;
  const name = propertyName(ts, expression);
  if (!name || !/^(?:children|slot|content)$/.test(name)) return null;
  const receiver = ts.isPropertyAccessExpression(expression) ? expression.expression : expression.expression;
  if (ts.isIdentifier(receiver) && parameterMatches(checker, receiver, declaration)) {
    const kind = receiver.text === "props" && name === "children" ? "props.children" : name === "children" ? "children-parameter" : "named-slot";
    return { kind, label: expression.getText(expression.getSourceFile()) };
  }
  if (ts.isIdentifier(receiver) && splitPropsParameterReceiver(ts, checker, receiver, name, declaration)) {
    const kind = name === "children" ? "children-parameter" : "named-slot";
    return { kind, label: expression.getText(expression.getSourceFile()) };
  }
  if (ts.isCallExpression(receiver) && ts.isIdentifier(receiver.expression) && /^(?:use|create).*(?:Slot|Children)$/i.test(receiver.expression.text)) {
    return { kind: "named-slot", label: expression.getText(expression.getSourceFile()) };
  }
  return null;
}

function parameterMatches(checker: TypeScript.TypeChecker, node: TypeScript.Identifier, declaration: TypeScript.FunctionLikeDeclaration | null) {
  if (!declaration) return false;
  return declaration.parameters.some((parameter) => {
    if (!TypeScript.isIdentifier(parameter.name)) return false;
    const left = checker.getSymbolAtLocation(parameter.name);
    const right = checker.getSymbolAtLocation(node);
    return Boolean(left && right && (left === right || checker.getFullyQualifiedName(left) === checker.getFullyQualifiedName(right)));
  });
}

function splitPropsParameterReceiver(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  receiver: TypeScript.Identifier,
  name: string,
  declaration: TypeScript.FunctionLikeDeclaration | null,
) {
  const binding = resolvedSymbol(ts, checker, receiver)?.declaration;
  if (!binding || !ts.isBindingElement(binding) || !ts.isArrayBindingPattern(binding.parent)) return false;
  const owner = binding.parent.parent;
  if (!ts.isVariableDeclaration(owner) || !owner.initializer || !ts.isCallExpression(owner.initializer)) return false;
  if (!isSolidUtilityCall(ts, checker, owner.initializer, "splitProps")) return false;
  const groupIndex = binding.parent.elements.indexOf(binding);
  const group = owner.initializer.arguments[groupIndex + 1];
  if (!group || !ts.isArrayLiteralExpression(unwrapExpression(ts, group))) return false;
  const selected = unwrapExpression(ts, group) as TypeScript.ArrayLiteralExpression;
  if (!selected.elements.some((element) => ts.isStringLiteralLike(element) && element.text === name)) return false;
  const source = owner.initializer.arguments[0];
  return Boolean(source && expressionContainsParameter(ts, checker, source, declaration, new Set()));
}

function expressionContainsParameter(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  input: TypeScript.Expression,
  declaration: TypeScript.FunctionLikeDeclaration | null,
  visited: Set<string>,
): boolean {
  const expression = unwrapExpression(ts, input);
  const key = `${expression.getSourceFile().fileName}:${expression.getStart()}:${expression.getEnd()}`;
  if (visited.has(key) || visited.size >= 20) return false;
  visited.add(key);
  if (ts.isIdentifier(expression)) {
    if (parameterMatches(checker, expression, declaration)) return true;
    const target = resolvedSymbol(ts, checker, expression)?.declaration;
    return Boolean(target && ts.isVariableDeclaration(target) && target.initializer && expressionContainsParameter(ts, checker, target.initializer, declaration, visited));
  }
  if (ts.isCallExpression(expression) && isSolidUtilityCall(ts, checker, expression, "mergeProps")) {
    return expression.arguments.some((argument) => expressionContainsParameter(ts, checker, argument, declaration, new Set(visited)));
  }
  return false;
}

function isSolidUtilityCall(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression, name: string) {
  return callName(ts, call) === name && ["solid-js", "solid-js/web"].includes(importModuleFor(ts, checker, call.expression) ?? "");
}

export function hasSpreadAttribute(ts: typeof TypeScript, opening: TypeScript.JsxOpeningLikeElement) {
  return opening.attributes.properties.some((property) => ts.isJsxSpreadAttribute(property));
}

export function sourceBackedCollection(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Expression) {
  const expression = unwrapExpression(ts, node);
  return !isUnknownType(checker, expression) && isCollectionType(checker, expression);
}

export function functionDeclarationFromCall(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.CallExpression) {
  const target = resolvedSymbol(ts, checker, node.expression);
  return declarationForResolved(target);
}

export function isDeclarationFile(node: TypeScript.Node | null) {
  return Boolean(node?.getSourceFile().isDeclarationFile);
}
