import path from "node:path";
import * as TypeScript from "typescript";
import type {
  ProgramValueDeclarationIdentity,
  ProgramValueFunctionIdentity,
  ProgramValueSourceExpression,
} from "./program-value-summary-types";
import type { ProgramEvidenceLocation } from "./program-evidence";
import {
  compilerSymbolId,
  inside,
  locationFor,
  stableId,
  unwrap,
} from "./program-evidence-support";

export type ProgramValueCompilerContext = {
  ts: typeof TypeScript;
  checker: TypeScript.TypeChecker;
  root: string;
};

export type ProgramValueFunctionTarget = {
  identity: ProgramValueFunctionIdentity;
  symbol: TypeScript.Symbol | null;
};

export type ProgramValueReturnExpressions = {
  expressions: readonly TypeScript.Expression[];
  bareReturns: readonly TypeScript.ReturnStatement[];
};

export type ProgramValueBindingElementSource = {
  binding: TypeScript.BindingElement;
  owner: TypeScript.VariableDeclaration;
  initializer: TypeScript.Expression;
  propertyName: string;
};

export function resolvedSymbol(
  context: ProgramValueCompilerContext,
  node: TypeScript.Node,
): TypeScript.Symbol | null {
  const symbolNode = symbolNodeFor(context.ts, node);
  let symbol: TypeScript.Symbol | undefined;
  try {
    const shorthand = context.ts.isIdentifier(node) && context.ts.isShorthandPropertyAssignment(node.parent)
      ? node.parent
      : null;
    symbol = shorthand
      ? context.checker.getShorthandAssignmentValueSymbol(shorthand)
      : context.checker.getSymbolAtLocation(symbolNode);
    if (symbol && symbol.flags & context.ts.SymbolFlags.Alias) {
      symbol = context.checker.getAliasedSymbol(symbol);
    }
  } catch {
    return null;
  }
  return symbol ?? null;
}

export function symbolIdFor(
  context: ProgramValueCompilerContext,
  node: TypeScript.Node,
): string | null {
  return compilerSymbolId(context.ts, context.checker, context.root, symbolNodeFor(context.ts, node));
}

export function declarationForNode(
  context: ProgramValueCompilerContext,
  node: TypeScript.Node,
): TypeScript.Declaration | null {
  if (context.ts.isVariableDeclaration(node) && node.name) return declarationForBinding(context, node.name);
  return declarationForSymbol(context, resolvedSymbol(context, node));
}

export function declarationForBinding(
  context: ProgramValueCompilerContext,
  binding: TypeScript.BindingName,
): TypeScript.Declaration | null {
  if (!context.ts.isIdentifier(binding)) return null;
  return declarationForSymbol(context, resolvedSymbol(context, binding));
}

export function declarationForSymbol(
  context: ProgramValueCompilerContext,
  symbol: TypeScript.Symbol | null,
): TypeScript.Declaration | null {
  if (!symbol) return null;
  return symbol.valueDeclaration ?? symbol.declarations?.[0] ?? null;
}

export function declarationIdentity(
  context: ProgramValueCompilerContext,
  declaration: TypeScript.Declaration | null,
  symbol: TypeScript.Symbol | null = null,
): ProgramValueDeclarationIdentity | null {
  if (!declaration) return null;
  const sourceFile = declaration.getSourceFile();
  const symbolId = symbol
    ? safeQualifiedName(context.checker, symbol)
    : symbolIdFor(context, declaration);
  const location = locationFor(context.root, sourceFile, declaration);
  return {
    id: stableId("program-value-declaration", [
      symbolId,
      location.file,
      declaration.getStart(sourceFile),
      declaration.getEnd(),
      declaration.kind,
    ]),
    symbolId,
    name: declarationName(context.ts, declaration),
    node: declaration,
    location,
  };
}

export function sourceExpression(
  context: ProgramValueCompilerContext,
  expression: TypeScript.Expression,
): ProgramValueSourceExpression {
  const sourceFile = expression.getSourceFile();
  const location = locationFor(context.root, sourceFile, expression);
  const symbolId = symbolIdFor(context, expression);
  const declaration = declarationIdentity(
    context,
    declarationForNode(context, expression),
    resolvedSymbol(context, expression),
  );
  return {
    id: stableId("program-value-expression", [
      location.file,
      expression.getStart(sourceFile),
      expression.getEnd(),
      expression.getText(sourceFile),
      symbolId,
    ]),
    text: expression.getText(sourceFile),
    node: expression,
    location,
    symbolId,
    declarationId: declaration?.id ?? null,
  };
}

export function functionTarget(
  context: ProgramValueCompilerContext,
  call: TypeScript.CallExpression,
): ProgramValueFunctionTarget | null {
  const symbol = resolvedSymbol(context, call.expression);
  const candidates: TypeScript.Node[] = [];
  try {
    const signature = context.checker.getResolvedSignature(call);
    if (signature?.declaration) candidates.push(signature.declaration);
  } catch {
    // The symbol path below still provides a useful unresolved-call result.
  }
  if (symbol?.valueDeclaration) candidates.push(symbol.valueDeclaration);
  candidates.push(...(symbol?.declarations ?? []));
  for (const candidate of uniqueNodes(candidates)) {
    const declaration = functionLikeForNode(context.ts, candidate);
    if (!declaration || !isFirstParty(context.root, declaration)) continue;
    if (!functionHasBody(context.ts, declaration)) continue;
    return {
      identity: functionIdentity(context, declaration, symbol),
      symbol,
    };
  }
  return null;
}

export function functionIdentity(
  context: ProgramValueCompilerContext,
  declaration: TypeScript.FunctionLikeDeclaration,
  symbol: TypeScript.Symbol | null,
): ProgramValueFunctionIdentity {
  const location = locationFor(context.root, declaration.getSourceFile(), declaration);
  const symbolId = symbol ? safeQualifiedName(context.checker, symbol) : symbolIdFor(context, declaration);
  return {
    id: stableId("program-value-function", [
      symbolId,
      location.file,
      declaration.getStart(declaration.getSourceFile()),
      declaration.getEnd(),
    ]),
    symbolId,
    name: declarationName(context.ts, declaration),
    declaration,
    location,
  };
}

export function isFirstParty(root: string, node: TypeScript.Node): boolean {
  const sourceFile = node.getSourceFile();
  const relativeFile = path.relative(path.resolve(root), path.resolve(sourceFile.fileName));
  return (
    !sourceFile.isDeclarationFile &&
    inside(root, sourceFile.fileName) &&
    !relativeFile.split(path.sep).includes("node_modules")
  );
}

export function immutableVariable(
  ts: typeof TypeScript,
  declaration: TypeScript.VariableDeclaration,
): boolean {
  return (
    ts.isVariableDeclarationList(declaration.parent) &&
    Boolean(declaration.parent.flags & ts.NodeFlags.Const)
  );
}

export function bindingElementSource(
  context: ProgramValueCompilerContext,
  expression: TypeScript.Expression,
): ProgramValueBindingElementSource | null {
  const symbol = resolvedSymbol(context, unwrap(context.ts, expression));
  const declaration = symbol?.declarations?.find((candidate): candidate is TypeScript.BindingElement => context.ts.isBindingElement(candidate)) ?? null;
  if (!declaration || !context.ts.isBindingElement(declaration)) return null;
  const pattern = declaration.parent;
  const owner = pattern.parent;
  if (!context.ts.isObjectBindingPattern(pattern) || !context.ts.isVariableDeclaration(owner) || !owner.initializer || !immutableVariable(context.ts, owner)) return null;
  const property = declaration.propertyName ?? declaration.name;
  if (!(context.ts.isIdentifier(property) || context.ts.isStringLiteralLike(property) || context.ts.isNumericLiteral(property))) return null;
  return { binding: declaration, owner, initializer: owner.initializer, propertyName: property.text };
}

export function variableDeclarationFor(
  context: ProgramValueCompilerContext,
  expression: TypeScript.Expression,
): TypeScript.VariableDeclaration | null {
  const declaration = declarationForNode(context, unwrap(context.ts, expression));
  return declaration && context.ts.isVariableDeclaration(declaration) ? declaration : null;
}

export function parameterDeclarationFor(
  context: ProgramValueCompilerContext,
  expression: TypeScript.Expression,
): TypeScript.ParameterDeclaration | null {
  const declaration = declarationForNode(context, unwrap(context.ts, expression));
  return declaration && context.ts.isParameter(declaration) ? declaration : null;
}

export function returnExpressionsForFunction(
  ts: typeof TypeScript,
  declaration: TypeScript.FunctionLikeDeclaration,
): ProgramValueReturnExpressions {
  if (ts.isArrowFunction(declaration) && declaration.body && !ts.isBlock(declaration.body)) {
    return { expressions: [declaration.body], bareReturns: [] };
  }
  const body = declaration.body;
  if (!body || !ts.isBlock(body)) return { expressions: [], bareReturns: [] };
  const expressions: TypeScript.Expression[] = [];
  const bareReturns: TypeScript.ReturnStatement[] = [];
  const visit = (node: TypeScript.Node) => {
    if (node !== body && isFunctionLikeDeclaration(ts, node)) return;
    if (ts.isReturnStatement(node)) {
      if (node.expression) expressions.push(node.expression);
      else bareReturns.push(node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  expressions.sort(compareNodes);
  bareReturns.sort(compareNodes);
  return { expressions, bareReturns };
}

export function staticObjectMemberName(
  ts: typeof TypeScript,
  property: TypeScript.ObjectLiteralElementLike,
): string | null {
  if (!property.name || ts.isComputedPropertyName(property.name)) return null;
  if (
    ts.isIdentifier(property.name) ||
    ts.isStringLiteralLike(property.name) ||
    ts.isNumericLiteral(property.name)
  ) {
    return property.name.text;
  }
  return null;
}

export function isComputedObjectMember(
  ts: typeof TypeScript,
  property: TypeScript.ObjectLiteralElementLike,
): boolean {
  return Boolean(property.name && ts.isComputedPropertyName(property.name));
}

export function isFunctionObjectMember(
  ts: typeof TypeScript,
  property: TypeScript.ObjectLiteralElementLike,
): boolean {
  return (
    ts.isMethodDeclaration(property) ||
    ts.isGetAccessorDeclaration(property) ||
    ts.isSetAccessorDeclaration(property) ||
    ts.isPropertyAssignment(property) &&
      isFunctionLikeDeclaration(ts, unwrapExpressionForProperty(ts, property.initializer))
  );
}

export function propertySourceExpression(
  ts: typeof TypeScript,
  property: TypeScript.ObjectLiteralElementLike,
): TypeScript.Expression | null {
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  return null;
}

export function proofLocation(
  context: ProgramValueCompilerContext,
  node: TypeScript.Node,
): ProgramEvidenceLocation {
  return locationFor(context.root, node.getSourceFile(), node);
}

export function locationKey(location: ProgramEvidenceLocation): string {
  return `${location.file}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}

function symbolNodeFor(ts: typeof TypeScript, node: TypeScript.Node): TypeScript.Node {
  if (ts.isPropertyAccessExpression(node)) return node.name;
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) return node.expression;
  if (ts.isVariableDeclaration(node)) return node.name;
  if (ts.isParameter(node) || ts.isBindingElement(node)) return node.name;
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isPropertyDeclaration(node)
  ) {
    return node.name ?? node;
  }
  return node;
}

function functionLikeForNode(
  ts: typeof TypeScript,
  node: TypeScript.Node,
): TypeScript.FunctionLikeDeclaration | null {
  if (isFunctionLikeDeclaration(ts, node)) return node;
  if (ts.isVariableDeclaration(node) && node.initializer && isFunctionLikeDeclaration(ts, node.initializer)) return node.initializer;
  if (ts.isPropertyDeclaration(node) && node.initializer && isFunctionLikeDeclaration(ts, node.initializer)) return node.initializer;
  return null;
}

function functionHasBody(ts: typeof TypeScript, declaration: TypeScript.FunctionLikeDeclaration): boolean {
  return Boolean(declaration.body);
}

function isFunctionLikeDeclaration(ts: typeof TypeScript, node: TypeScript.Node): node is TypeScript.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  );
}

function unwrapExpressionForProperty(ts: typeof TypeScript, expression: TypeScript.Expression): TypeScript.Expression {
  return unwrap(ts, expression);
}

function declarationName(ts: typeof TypeScript, declaration: TypeScript.Declaration): string | null {
  const named = (declaration as TypeScript.NamedDeclaration).name;
  if (named && (ts.isIdentifier(named) || ts.isStringLiteralLike(named))) {
    return named.text;
  }
  const parent = declaration.parent;
  if (
    parent &&
    ts.isVariableDeclaration(parent) &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.text;
  }
  return null;
}

function safeQualifiedName(checker: TypeScript.TypeChecker, symbol: TypeScript.Symbol): string | null {
  try {
    return checker.getFullyQualifiedName(symbol);
  } catch {
    return null;
  }
}

function uniqueNodes(nodes: readonly TypeScript.Node[]): TypeScript.Node[] {
  return [...new Set(nodes)];
}

function compareNodes(left: TypeScript.Node, right: TypeScript.Node): number {
  return (
    left.getSourceFile().fileName.localeCompare(right.getSourceFile().fileName) ||
    left.getStart(left.getSourceFile()) - right.getStart(right.getSourceFile()) ||
    left.getEnd() - right.getEnd()
  );
}
