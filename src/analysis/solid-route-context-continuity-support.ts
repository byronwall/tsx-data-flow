import path from "node:path";
import * as TypeScript from "typescript";
import type {
  ContextMemberCertainty,
} from "./context-continuity";
import type { SourceLocation } from "./scope-seam";
import {
  declarationForResolved,
  locationForNode,
  resolvedSymbol,
  sourceIdentityForNode,
  unwrapExpression,
} from "./route-occurrence-support";
import { isCanonicalSolidCall, resolvedSymbolAtLocation } from "./solid-symbols";

export type SolidContextDeclaration = {
  compilerIdentity: string;
  sourceIdentity: string;
  label: string;
  declaration: TypeScript.VariableDeclaration;
  createContextCall: TypeScript.CallExpression;
  defaultExpression: TypeScript.Expression | null;
};

export type SolidProviderSyntax = {
  context: SolidContextDeclaration;
  node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement;
  opening: TypeScript.JsxOpeningLikeElement;
  valueExpression: TypeScript.Expression | null;
};

export type SolidProviderTagResult =
  | { kind: "provider"; syntax: SolidProviderSyntax }
  | { kind: "dynamic-provider"; opening: TypeScript.JsxOpeningLikeElement; context: SolidContextDeclaration | null }
  | null;

export type SolidContextReadShape = {
  members: string[];
  memberCertainty: ContextMemberCertainty;
};

export type SolidContextWrapper = {
  context: SolidContextDeclaration;
  underlyingCalls: TypeScript.CallExpression[];
};

export function contextDeclarationForExpression(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  expression: TypeScript.Expression,
): SolidContextDeclaration | null {
  const symbol = resolvedSymbolAtLocation(ts, checker, unwrapExpression(ts, expression));
  const declarations = symbol?.declarations?.filter(ts.isVariableDeclaration) ?? [];
  if (!symbol || declarations.length !== 1) return null;
  const declaration = declarations[0];
  const initializer = declaration.initializer ? unwrapExpression(ts, declaration.initializer) : null;
  if (!initializer || !ts.isCallExpression(initializer) || !isCanonicalSolidCall(ts, checker, initializer, "createContext")) return null;
  return {
    compilerIdentity: compilerIdentity(checker, symbol, root, declaration),
    sourceIdentity: sourceIdentityForNode(root, declaration),
    label: declaration.name.getText(declaration.getSourceFile()),
    declaration,
    createContextCall: initializer,
    defaultExpression: initializer.arguments.length === 1 ? initializer.arguments[0] : null,
  };
}

export function providerTagFor(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement,
): SolidProviderTagResult {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const tag = opening.tagName;
  if (ts.isPropertyAccessExpression(tag) && tag.name.text === "Provider") {
    const context = contextDeclarationForExpression(ts, checker, root, tag.expression);
    return context
      ? { kind: "provider", syntax: { context, node, opening, valueExpression: valueExpressionFor(ts, opening) } }
      : { kind: "dynamic-provider", opening, context: null };
  }
  const tagNode = tag as TypeScript.Node;
  if (ts.isElementAccessExpression(tagNode)) {
    const context = contextDeclarationForExpression(ts, checker, root, tagNode.expression);
    if (context) return { kind: "dynamic-provider", opening, context };
  }
  if (!ts.isIdentifier(tag)) return null;
  const resolved = resolvedSymbol(ts, checker, tag);
  const declaration = resolved?.declaration;
  const initializer = declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
    ? unwrapExpression(ts, declaration.initializer)
    : null;
  if (initializer && (ts.isPropertyAccessExpression(initializer) && initializer.name.text === "Provider" || ts.isElementAccessExpression(initializer))) {
    const contextExpression = ts.isPropertyAccessExpression(initializer) || ts.isElementAccessExpression(initializer)
      ? initializer.expression
      : null;
    return { kind: "dynamic-provider", opening, context: contextExpression ? contextDeclarationForExpression(ts, checker, root, contextExpression) : null };
  }
  return null;
}

export function valueExpressionFor(
  ts: typeof TypeScript,
  opening: TypeScript.JsxOpeningLikeElement,
): TypeScript.Expression | null {
  const attribute = opening.attributes.properties.find(
    (property): property is TypeScript.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === "value",
  );
  if (!attribute?.initializer) return null;
  if (ts.isJsxExpression(attribute.initializer)) return attribute.initializer.expression ?? null;
  return ts.isStringLiteral(attribute.initializer) ? attribute.initializer : null;
}

export function contextReadShape(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  call: TypeScript.CallExpression,
): SolidContextReadShape {
  const parent = unwrappedParent(ts, call);
  if (parent && ts.isPropertyAccessExpression(parent) && parent.expression === call) {
    return { members: [parent.name.text], memberCertainty: "proven" };
  }
  if (parent && ts.isElementAccessExpression(parent) && parent.expression === call) {
    const argument = parent.argumentExpression;
    return argument && ts.isStringLiteralLike(argument)
      ? { members: [argument.text], memberCertainty: "proven" }
      : { members: [], memberCertainty: "unknown" };
  }
  if (parent && ts.isVariableDeclaration(parent) && parent.initializer === call) {
    return bindingShape(ts, checker, parent.name, call);
  }
  return { members: [], memberCertainty: "proven" };
}

export function contextWrapperForCall(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  call: TypeScript.CallExpression,
): SolidContextWrapper | "unsupported" | null {
  const resolved = resolvedSymbol(ts, checker, call.expression);
  const declaration = resolved ? declarationForResolved(resolved) : null;
  if (!declaration || !isFirstPartyFunction(root, declaration) || !isHookLikeName(ts, call)) return null;
  const underlyingCalls: TypeScript.CallExpression[] = [];
  const contexts = new Map<string, SolidContextDeclaration>();
  let sawUseContext = false;
  const visit = (node: TypeScript.Node) => {
    if (node !== declaration && isFunctionLike(ts, node)) return;
    if (ts.isCallExpression(node) && isCanonicalSolidCall(ts, checker, node, "useContext")) {
      sawUseContext = true;
      if (node.arguments.length !== 1) return;
      const context = contextDeclarationForExpression(ts, checker, root, node.arguments[0]);
      if (!context) return;
      underlyingCalls.push(node);
      contexts.set(context.compilerIdentity, context);
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration);
  if (!sawUseContext) return null;
  if (underlyingCalls.length === 0) return "unsupported";
  if (contexts.size !== 1 || !allReturnsUseContext(ts, declaration, underlyingCalls)) return "unsupported";
  return { context: [...contexts.values()][0], underlyingCalls };
}

export function staticValueShape(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Expression | null,
): { memberNames: string[]; memberCertainty: ContextMemberCertainty; status: "proven" | "partial"; proofNodes: TypeScript.Node[] } {
  if (!expression) return { memberNames: [], memberCertainty: "unknown", status: "partial", proofNodes: [] };
  return staticValueShapeInner(ts, checker, expression, new Set<string>());
}

export function nearestFunctionLike(ts: typeof TypeScript, node: TypeScript.Node): TypeScript.FunctionLikeDeclaration | null {
  let current: TypeScript.Node | undefined = node.parent;
  while (current) {
    if (isFunctionLike(ts, current)) return current;
    current = current.parent;
  }
  return null;
}

export function functionName(ts: typeof TypeScript, node: TypeScript.FunctionLikeDeclaration): string | null {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return null;
}

export function containsLocation(container: SourceLocation, child: SourceLocation): boolean {
  if (container.file !== child.file) return false;
  return comparePosition(child.span.startLine, child.span.startColumn, container.span.startLine, container.span.startColumn) >= 0
    && comparePosition(child.span.endLine, child.span.endColumn, container.span.endLine, container.span.endColumn) <= 0;
}

export function locationKey(location: SourceLocation): string {
  return `${location.file}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}

export function locationForContextNode(root: string, node: TypeScript.Node): SourceLocation {
  return locationForNode(root, node);
}

export function isFirstPartyFunction(root: string, node: TypeScript.Node): boolean {
  const file = node.getSourceFile();
  const relative = path.relative(path.resolve(root), path.resolve(file.fileName));
  return !file.isDeclarationFile && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !relative.split(path.sep).includes("node_modules");
}

function bindingShape(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  name: TypeScript.BindingName,
  call: TypeScript.CallExpression,
): SolidContextReadShape {
  if (ts.isObjectBindingPattern(name)) {
    const members: string[] = [];
    let unknown = false;
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element) || ts.isBindingElement(element) && element.dotDotDotToken) {
        unknown = true;
        continue;
      }
      if (!ts.isBindingElement(element)) {
        unknown = true;
        continue;
      }
      const property = element.propertyName ?? element.name;
      if (ts.isIdentifier(property) || ts.isStringLiteralLike(property) || ts.isNumericLiteral(property)) members.push(property.text);
      else unknown = true;
    }
    return { members: [...new Set(members)].sort(), memberCertainty: unknown ? "unknown" : "proven" };
  }
  if (!ts.isIdentifier(name)) return { members: [], memberCertainty: "unknown" };
  return usageShape(ts, checker, name, call);
}

function usageShape(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  binding: TypeScript.Identifier,
  call: TypeScript.CallExpression,
): SolidContextReadShape {
  const symbol = resolvedSymbolAtLocation(ts, checker, binding);
  if (!symbol) return { members: [], memberCertainty: "unknown" };
  const members = new Set<string>();
  let unknown = false;
  const visit = (node: TypeScript.Node) => {
    if (ts.isIdentifier(node) && node !== binding && resolvedSymbolAtLocation(ts, checker, node) === symbol) {
      const parent = unwrappedParent(ts, node);
      if (parent && ts.isPropertyAccessExpression(parent) && parent.expression === node) members.add(parent.name.text);
      else if (parent && ts.isElementAccessExpression(parent) && parent.expression === node) {
        const argument = parent.argumentExpression;
        if (argument && ts.isStringLiteralLike(argument)) members.add(argument.text);
        else unknown = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  const owner = nearestFunctionLike(ts, call);
  visit(owner?.body ?? call.getSourceFile());
  return { members: [...members].sort(), memberCertainty: unknown ? "unknown" : "proven" };
}

function staticValueShapeInner(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Expression,
  visited: Set<string>,
): { memberNames: string[]; memberCertainty: ContextMemberCertainty; status: "proven" | "partial"; proofNodes: TypeScript.Node[] } {
  const current = unwrapExpression(ts, expression);
  const key = `${current.getSourceFile().fileName}:${current.getStart()}:${current.getEnd()}`;
  if (visited.has(key)) return { memberNames: [], memberCertainty: "unknown", status: "partial", proofNodes: [current] };
  visited.add(key);
  if (ts.isObjectLiteralExpression(current)) {
    const names: string[] = [];
    let unknown = false;
    for (const property of current.properties) {
      if (ts.isSpreadAssignment(property)) {
        unknown = true;
        continue;
      }
      const name = property.name;
      if (name && (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name))) names.push(name.text);
      else unknown = true;
    }
    return { memberNames: [...new Set(names)].sort(), memberCertainty: unknown ? "unknown" : "proven", status: "proven", proofNodes: [current] };
  }
  if (ts.isArrayLiteralExpression(current) || ts.isLiteralExpression(current) || current.kind === ts.SyntaxKind.NullKeyword) {
    return { memberNames: [], memberCertainty: "proven", status: "proven", proofNodes: [current] };
  }
  if (ts.isIdentifier(current)) {
    const resolved = resolvedSymbolAtLocation(ts, checker, current);
    const declaration = resolved?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
      const nested = staticValueShapeInner(ts, checker, declaration.initializer, visited);
      return { ...nested, proofNodes: [current, declaration.initializer, ...nested.proofNodes] };
    }
  }
  return { memberNames: [], memberCertainty: "unknown", status: "partial", proofNodes: [current] };
}

function compilerIdentity(
  checker: TypeScript.TypeChecker,
  symbol: TypeScript.Symbol,
  root: string,
  declaration: TypeScript.Declaration,
) {
  const relative = path.relative(path.resolve(root), path.resolve(declaration.getSourceFile().fileName)).replaceAll(path.sep, "/");
  return `${checker.getFullyQualifiedName(symbol)}@${relative}:${declaration.getStart(declaration.getSourceFile())}`;
}

function allReturnsUseContext(
  ts: typeof TypeScript,
  declaration: TypeScript.Declaration,
  calls: readonly TypeScript.CallExpression[],
) {
  const returned = new Set<TypeScript.Expression>();
  const visit = (node: TypeScript.Node) => {
    if (node !== declaration && isFunctionLike(ts, node)) return;
    if (ts.isReturnStatement(node) && node.expression) returned.add(unwrapExpression(ts, node.expression));
    ts.forEachChild(node, visit);
  };
  visit(declaration);
  return returned.size > 0 && [...returned].every((expression) => calls.some((call) => expression === call || (ts.isPropertyAccessExpression(expression) && expression.expression === call)));
}

function isHookLikeName(ts: typeof TypeScript, call: TypeScript.CallExpression) {
  const expression = call.expression;
  const name = ts.isIdentifier(expression)
    ? expression.text
    : ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : "";
  return /^use[A-Z_]/.test(name);
}

function unwrappedParent(ts: typeof TypeScript, node: TypeScript.Node): TypeScript.Node | null {
  let current: TypeScript.Node | undefined = node.parent;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current))) current = current.parent;
  return current ?? null;
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

function comparePosition(leftLine: number, leftColumn: number, rightLine: number, rightColumn: number) {
  return leftLine - rightLine || leftColumn - rightColumn;
}
