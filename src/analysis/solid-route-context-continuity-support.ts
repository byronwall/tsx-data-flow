import path from "node:path";
import * as TypeScript from "typescript";
import type {
  ContextMemberPath,
  ContextMemberCertainty,
} from "./context-continuity";
import type { ProgramValueSummary } from "./program-value-summary-types";
import type { ProgramValueSummaryAnalyzer } from "./program-value-summary";
import type { SourceLocation } from "./scope-seam";
import {
  declarationForResolved,
  locationForNode,
  resolvedSymbol,
  sourceIdentityForNode,
  unwrapExpression,
} from "./route-occurrence-support";
import { isCanonicalSolidCall, resolvedSymbolAtLocation } from "./solid-symbols";
import { guardedContextReturn } from "./solid-route-context-continuity-hook-support";

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
  memberPaths: ContextMemberPath[];
  memberCertainty: ContextMemberCertainty;
};

export type SolidContextValueShape = {
  memberNames: string[];
  memberPaths: ContextMemberPath[];
  memberEvidence: {
    memberPath: ContextMemberPath;
    sourceExpression: string | null;
    location: SourceLocation | null;
    status: "proven" | "partial" | "unsupported";
    proofNodes: TypeScript.Node[];
  }[];
  memberCertainty: ContextMemberCertainty;
  status: "proven" | "partial" | "unsupported";
  proofNodes: TypeScript.Node[];
  summary: ProgramValueSummary | null;
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
  return contextDeclarationForExpressionInner(ts, checker, root, expression, new Set());
}

export function providerTagFor(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement,
  valueAnalyzer?: ProgramValueSummaryAnalyzer,
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
  const alias = valueAnalyzer ? providerAliasFor(ts, checker, root, tag, valueAnalyzer) : null;
  if (alias) return { kind: "provider", syntax: { context: alias.context, node, opening, valueExpression: valueExpressionFor(ts, opening) } };
  const wrapper = contextProviderWrapperForTag(ts, checker, root, tag);
  if (wrapper) return { kind: "provider", syntax: { context: wrapper.context, node, opening, valueExpression: wrapper.valueExpression } };
  const resolved = resolvedSymbol(ts, checker, tag);
  const declaration = resolved?.declaration;
  const initializer = declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
    ? unwrapExpression(ts, declaration.initializer)
    : null;
  if (initializer && (ts.isPropertyAccessExpression(initializer) || ts.isElementAccessExpression(initializer))) {
    const contextExpression = initializer.expression;
    return { kind: "dynamic-provider", opening, context: contextDeclarationForExpression(ts, checker, root, contextExpression) };
  }
  return null;
}

function contextProviderWrapperForTag(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  tag: TypeScript.Identifier,
): { context: SolidContextDeclaration; valueExpression: TypeScript.Expression } | null {
  const resolved = resolvedSymbol(ts, checker, tag);
  const declaration = resolved ? declarationForResolved(resolved) : null;
  if (!declaration || !isFunctionLike(ts, declaration) || !isFirstPartyFunction(root, declaration)) return null;
  const returns = returnedExpressions(ts, declaration);
  if (returns.length !== 1) return null;
  const expression = unwrapExpression(ts, returns[0]);
  if (!ts.isJsxElement(expression) && !ts.isJsxSelfClosingElement(expression)) return null;
  const opening = ts.isJsxElement(expression) ? expression.openingElement : expression;
  const wrapperTag = opening.tagName;
  if (ts.isPropertyAccessExpression(wrapperTag) && wrapperTag.name.text === "Provider") {
    const context = contextDeclarationForExpression(ts, checker, root, wrapperTag.expression);
    if (!context) return null;
    const valueExpression = valueExpressionFor(ts, opening);
    if (!valueExpression) return null;
    return { context, valueExpression };
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
  const directPath = propertyPathFromExpression(ts, call, parent);
  if (directPath) return shapeFromPaths([directPath], false);
  if (parent && ts.isVariableDeclaration(parent) && parent.initializer === call) {
    return bindingShape(ts, checker, parent.name, call);
  }
  return shapeFromPaths([], false);
}

export function contextWrapperForCall(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  call: TypeScript.CallExpression,
): SolidContextWrapper | "unsupported" | null {
  const resolved = resolvedSymbol(ts, checker, call.expression);
  const declaration = resolved ? declarationForResolved(resolved) : null;
  if (!declaration || !isFunctionLike(ts, declaration) || !isFirstPartyFunction(root, declaration)) return null;
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
  if (underlyingCalls.length !== 1 || contexts.size !== 1) return "unsupported";
  if (!guardedContextReturn(ts, checker, declaration, underlyingCalls[0])) return "unsupported";
  return { context: [...contexts.values()][0], underlyingCalls };
}

export function staticValueShape(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Expression | null,
  analyzer?: ProgramValueSummaryAnalyzer,
): SolidContextValueShape {
  if (!expression) return { memberNames: [], memberPaths: [], memberEvidence: [], memberCertainty: "unknown", status: "unsupported", proofNodes: [], summary: null };
  if (analyzer) return valueShapeFromSummary(ts, expression, analyzer.summarizeExpression(expression));
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

function returnedExpressions(ts: typeof TypeScript, owner: TypeScript.FunctionLikeDeclaration) {
  if (ts.isArrowFunction(owner) && !ts.isBlock(owner.body)) return [owner.body];
  const expressions: TypeScript.Expression[] = [];
  const visit = (node: TypeScript.Node) => {
    if (node !== owner && isFunctionLike(ts, node)) return;
    if (ts.isReturnStatement(node) && node.expression) expressions.push(node.expression);
    ts.forEachChild(node, visit);
  };
  if (owner.body) visit(owner.body);
  return expressions;
}

function bindingShape(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  name: TypeScript.BindingName,
  call: TypeScript.CallExpression,
): SolidContextReadShape {
  if (ts.isObjectBindingPattern(name)) {
    const paths: ContextMemberPath[] = [];
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
      if (!(ts.isIdentifier(property) || ts.isStringLiteralLike(property) || ts.isNumericLiteral(property))) {
        unknown = true;
        continue;
      }
      if (!ts.isIdentifier(element.name)) {
        unknown = true;
        continue;
      }
      const usage = usagePaths(ts, checker, element.name, call, [property.text]);
      paths.push(...usage.paths);
      if (usage.paths.length === 0) paths.push([property.text]);
      unknown ||= usage.unknown;
    }
    return shapeFromPaths(paths, unknown);
  }
  if (!ts.isIdentifier(name)) return shapeFromPaths([], true);
  return usagePaths(ts, checker, name, call).shape;
}

function usagePaths(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  binding: TypeScript.Identifier,
  call: TypeScript.CallExpression,
  prefix: ContextMemberPath = [],
  visited = new Set<TypeScript.Symbol>(),
): { shape: SolidContextReadShape; paths: ContextMemberPath[]; unknown: boolean } {
  const symbol = resolvedSymbolAtLocation(ts, checker, binding);
  if (!symbol) return { shape: shapeFromPaths([], true), paths: [], unknown: true };
  if (visited.has(symbol)) return { shape: shapeFromPaths([], true), paths: [], unknown: true };
  visited.add(symbol);
  const paths: ContextMemberPath[] = [];
  let unknown = false;
  const owner = nearestFunctionLike(ts, call);
  const visit = (node: TypeScript.Node) => {
    if (node !== owner && isFunctionLike(ts, node)) return;
    if (ts.isIdentifier(node) && node !== binding && resolvedSymbolAtLocation(ts, checker, node) === symbol) {
      const parent = unwrappedParent(ts, node);
      const path = propertyPathFromIdentifier(ts, node);
      if (path) {
        paths.push([...prefix, ...path]);
        if (hasMutationAround(ts, node)) unknown = true;
      } else if (isImmutableAliasInitializer(ts, checker, node, symbol)) {
        const alias = aliasIdentifierForInitializer(ts, node);
        if (alias) {
          const nested = usagePaths(ts, checker, alias, call, prefix, new Set(visited));
          paths.push(...nested.paths);
          unknown ||= nested.unknown;
        }
      } else {
        paths.push([...prefix]);
        if (hasMutationAround(ts, node)) unknown = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(owner?.body ?? call.getSourceFile());
  return { shape: shapeFromPaths(paths, unknown), paths, unknown };
}

function staticValueShapeInner(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Expression,
  visited: Set<string>,
): SolidContextValueShape {
  const current = unwrapExpression(ts, expression);
  const key = `${current.getSourceFile().fileName}:${current.getStart()}:${current.getEnd()}`;
  if (visited.has(key)) return { memberNames: [], memberPaths: [], memberEvidence: [], memberCertainty: "unknown", status: "partial", proofNodes: [current], summary: null };
  visited.add(key);
  if (ts.isObjectLiteralExpression(current)) {
    const memberEvidence: SolidContextValueShape["memberEvidence"] = [];
    let unknown = false;
    for (const property of current.properties) {
      if (ts.isSpreadAssignment(property)) {
        unknown = true;
        continue;
      }
      const name = property.name;
      if (!name || !(ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name))) {
        unknown = true;
        continue;
      }
      const source = ts.isPropertyAssignment(property)
        ? property.initializer
        : ts.isShorthandPropertyAssignment(property)
          ? property.name
          : null;
      memberEvidence.push({
        memberPath: [name.text],
        sourceExpression: source?.getText(source.getSourceFile()) ?? null,
        location: source ? locationForNode("", source) : locationForNode("", property),
        status: source && !isFunctionLike(ts, unwrapExpression(ts, source)) ? "proven" : "unsupported",
        proofNodes: [property, ...(source ? [source] : [])],
      });
    }
    const memberPaths = memberEvidence.map((member) => member.memberPath);
    return {
      memberNames: [...new Set(memberPaths.map((path) => path[0] ?? ""))].filter(Boolean).sort(),
      memberPaths,
      memberEvidence,
      memberCertainty: unknown ? "unknown" : "proven",
      status: unknown ? "partial" : "proven",
      proofNodes: [current],
      summary: null,
    };
  }
  if (ts.isArrayLiteralExpression(current) || ts.isLiteralExpression(current) || current.kind === ts.SyntaxKind.NullKeyword) {
    return { memberNames: [], memberPaths: [], memberEvidence: [], memberCertainty: "proven", status: "proven", proofNodes: [current], summary: null };
  }
  if (ts.isIdentifier(current)) {
    const resolved = resolvedSymbolAtLocation(ts, checker, current);
    const declaration = resolved?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
      const nested = staticValueShapeInner(ts, checker, declaration.initializer, visited);
      return { ...nested, proofNodes: [current, declaration.initializer, ...nested.proofNodes] };
    }
  }
  return { memberNames: [], memberPaths: [], memberEvidence: [], memberCertainty: "unknown", status: "partial", proofNodes: [current], summary: null };
}

function contextDeclarationForExpressionInner(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  expression: TypeScript.Expression,
  visited: Set<string>,
): SolidContextDeclaration | null {
  const current = unwrapExpression(ts, expression);
  const symbol = resolvedSymbolAtLocation(ts, checker, current);
  const declarations = symbol?.declarations?.filter(ts.isVariableDeclaration) ?? [];
  if (!symbol || declarations.length !== 1) return null;
  const declaration = declarations[0];
  const identity = compilerIdentity(checker, symbol, root, declaration);
  if (visited.has(identity)) return null;
  visited.add(identity);
  const initializer = declaration.initializer ? unwrapExpression(ts, declaration.initializer) : null;
  if (!initializer) return null;
  if (ts.isCallExpression(initializer) && isCanonicalSolidCall(ts, checker, initializer, "createContext")) {
    return {
      compilerIdentity: identity,
      sourceIdentity: sourceIdentityForNode(root, declaration),
      label: declaration.name.getText(declaration.getSourceFile()),
      declaration,
      createContextCall: initializer,
      defaultExpression: initializer.arguments.length === 1 ? initializer.arguments[0] : null,
    };
  }
  if (!ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)) return null;
  return contextDeclarationForExpressionInner(ts, checker, root, initializer, visited);
}

function providerAliasFor(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  tag: TypeScript.Identifier,
  analyzer: ProgramValueSummaryAnalyzer,
): { context: SolidContextDeclaration } | null {
  const summary = analyzer.summarizeExpression(tag);
  if (summary.status !== "proven") return null;
  const resolved = summary.resolution.resolvedExpression?.node;
  if (!resolved || !ts.isPropertyAccessExpression(resolved) || resolved.name.text !== "Provider") return null;
  const context = contextDeclarationForExpression(ts, checker, root, resolved.expression);
  return context ? { context } : null;
}

function valueShapeFromSummary(
  ts: typeof TypeScript,
  expression: TypeScript.Expression,
  summary: ProgramValueSummary,
): SolidContextValueShape {
  const memberEvidence = summary.members.map((member) => ({
    memberPath: [...member.memberPath],
    sourceExpression: member.sourceExpression?.text ?? null,
    location: member.sourceExpression?.location ?? null,
    status: contextStatusForSummary(member.status),
    proofNodes: [expression],
  }));
  const memberPaths = uniquePaths(memberEvidence.map((member) => member.memberPath));
  const memberNames = [...new Set(memberPaths.map((path) => path[0] ?? ""))].filter(Boolean).sort();
  return {
    memberNames,
    memberPaths,
    memberEvidence,
    memberCertainty: summary.unknownMembers ? "unknown" : "proven",
    status: contextStatusForSummary(summary.status),
    proofNodes: [expression, ...summary.members.flatMap((member) => member.sourceExpression ? [member.sourceExpression.node] : [])],
    summary,
  };
}

function contextStatusForSummary(
  status: ProgramValueSummary["status"] | "proven" | "partial" | "unsupported",
): "proven" | "partial" | "unsupported" {
  return status === "proven" ? "proven" : status === "partial" || status === "budget-exhausted" ? "partial" : "unsupported";
}

function propertyPathFromExpression(
  ts: typeof TypeScript,
  base: TypeScript.Expression,
  parent: TypeScript.Node | null,
): ContextMemberPath | null {
  if (!parent || (!ts.isPropertyAccessExpression(parent) && !ts.isElementAccessExpression(parent))) return null;
  const path: string[] = [];
  let current: TypeScript.Node = parent;
  let receiver: TypeScript.Expression = base;
  while (ts.isPropertyAccessExpression(current) && current.expression === receiver) {
    path.unshift(current.name.text);
    receiver = current;
    current = unwrappedParent(ts, current) ?? current;
    if (current === receiver) break;
  }
  while (ts.isElementAccessExpression(current) && current.expression === receiver) {
    const argument = current.argumentExpression;
    if (!argument || !ts.isStringLiteralLike(argument)) return null;
    path.unshift(argument.text);
    receiver = current;
    current = unwrappedParent(ts, current) ?? current;
    if (current === receiver) break;
  }
  return path.length > 0 ? path : null;
}

function propertyPathFromIdentifier(ts: typeof TypeScript, node: TypeScript.Identifier): ContextMemberPath | null {
  const path: string[] = [];
  let receiver: TypeScript.Node = node;
  let parent = unwrappedParent(ts, node);
  while (parent && ts.isPropertyAccessExpression(parent) && parent.expression === receiver) {
    path.push(parent.name.text);
    receiver = parent;
    parent = unwrappedParent(ts, parent);
  }
  while (parent && ts.isElementAccessExpression(parent) && parent.expression === receiver) {
    const argument = parent.argumentExpression;
    if (!argument || !ts.isStringLiteralLike(argument)) return null;
    path.push(argument.text);
    receiver = parent;
    parent = unwrappedParent(ts, parent);
  }
  return path.length > 0 ? path : null;
}

function shapeFromPaths(paths: readonly ContextMemberPath[], unknown: boolean): SolidContextReadShape {
  const memberPaths = uniquePaths(paths).sort(comparePaths);
  return {
    memberPaths,
    members: memberPaths.map((path) => path.join(".")),
    memberCertainty: unknown ? "unknown" : "proven",
  };
}

function uniquePaths(paths: readonly ContextMemberPath[]): ContextMemberPath[] {
  return [...new Map(paths.filter((path) => path.length > 0).map((path) => [path.join("\u0000"), [...path]])).values()];
}

function comparePaths(left: ContextMemberPath, right: ContextMemberPath): number {
  return left.join(".").localeCompare(right.join("."));
}

function isImmutableAliasInitializer(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.Identifier,
  sourceSymbol: TypeScript.Symbol,
): boolean {
  const parent = node.parent;
  if (!ts.isVariableDeclaration(parent) || parent.initializer !== node || !ts.isIdentifier(parent.name)) return false;
  const declarationSymbol = resolvedSymbolAtLocation(ts, checker, parent.name);
  return Boolean(declarationSymbol && declarationSymbol !== sourceSymbol && ts.isVariableDeclarationList(parent.parent) && parent.parent.flags & ts.NodeFlags.Const);
}

function aliasIdentifierForInitializer(ts: typeof TypeScript, node: TypeScript.Identifier): TypeScript.Identifier | null {
  const parent = node.parent;
  return ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name) ? parent.name : null;
}

function hasMutationAround(ts: typeof TypeScript, node: TypeScript.Identifier): boolean {
  const parent = node.parent;
  if (parent
    && (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
    && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  if (parent && ts.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
  if (parent && (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node) {
    const next = unwrappedParent(ts, parent);
    return Boolean(next && ts.isBinaryExpression(next) && next.left === parent && next.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && next.operatorToken.kind <= ts.SyntaxKind.LastAssignment);
  }
  return false;
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
