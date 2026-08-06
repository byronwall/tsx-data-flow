import path from "node:path";
import type * as TypeScript from "typescript";
import type { Sink } from "../types";
import type { ShadowLocation } from "./route-shadow-evidence";

export function symbolFor(checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  return resolvedSymbol(checker, node);
}

export function sameSymbol(checker: TypeScript.TypeChecker, node: TypeScript.Node, target: TypeScript.Symbol) {
  const symbol = resolvedSymbol(checker, node);
  return Boolean(symbol && sameCompilerSymbol(checker, symbol, target));
}

export function sameCompilerSymbol(checker: TypeScript.TypeChecker, left: TypeScript.Symbol, right: TypeScript.Symbol) {
  return left === right || checker.getFullyQualifiedName(left) === checker.getFullyQualifiedName(right);
}

function resolvedSymbol(checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  let symbol = checker.getSymbolAtLocation(node);
  if (!symbol) return null;
  try { if (symbol.flags & aliasFlag()) symbol = checker.getAliasedSymbol(symbol); } catch { /* unresolved aliases remain unproven */ }
  return symbol;
}

function aliasFlag() {
  return 2097152;
}

export function importModuleFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Identifier) {
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

export function compilerSourceIdentityFor(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  program: TypeScript.Program,
  root: string,
  fileSuffix: string,
  line: number,
  module: string,
) {
  const normalizedSuffix = fileSuffix.replaceAll(path.sep, "/");
  const file = program.getSourceFiles().find((candidate) => candidate.fileName.replaceAll(path.sep, "/").endsWith(normalizedSuffix));
  if (!file) return null;
  let result: { location: ShadowLocation; compilerIdentity: string } | null = null;
  visit(ts, file, (node) => {
    if (result || !ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
    const point = file.getLineAndCharacterOfPosition(node.getStart(file));
    if (point.line + 1 !== line || node.expression.text !== "readFile") return;
    if (importModuleFor(ts, checker, node.expression) !== module) return;
    const symbol = symbolFor(checker, node.expression);
    if (symbol) result = { location: locationForNode(root, node), compilerIdentity: checker.getFullyQualifiedName(symbol) };
  });
  return result;
}

export function visit(ts: typeof TypeScript, node: TypeScript.Node | undefined, callback: (node: TypeScript.Node) => void) {
  if (!node) return;
  callback(node);
  ts.forEachChild(node, (child) => visit(ts, child, callback));
}

export function contains(parent: TypeScript.Node, child: TypeScript.Node) {
  return child.getStart() >= parent.getStart() && child.getEnd() <= parent.getEnd();
}

export function sameLocation(left: ShadowLocation, right: ShadowLocation) {
  return left.file === right.file && left.line === right.line && left.column === right.column
    && left.span.startLine === right.span.startLine && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine && left.span.endColumn === right.span.endColumn;
}

export function unwrapExpression(ts: typeof TypeScript, expression: TypeScript.Expression): TypeScript.Expression {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression)) return unwrapExpression(ts, expression.expression);
  return expression;
}

export function locationForNode(root: string, node: TypeScript.Node): ShadowLocation {
  return locationForNodeFromRoot(node.getSourceFile(), root, node);
}

export function locationForNodeFromRoot(sourceFile: TypeScript.SourceFile, root: string, node: TypeScript.Node): ShadowLocation {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return { file: relative(root, sourceFile.fileName), line: start.line + 1, column: start.character + 1, span: { startLine: start.line + 1, startColumn: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 } };
}

export function locationForSink(root: string, sink: Sink): ShadowLocation {
  return { file: relative(root, sink.file), line: sink.line, column: sink.column, span: sink.span };
}

export function locationForTraceStep(root: string, step: NonNullable<Sink["identity"]>["upstreamPath"][number]): ShadowLocation {
  const span = step.span ?? { startLine: step.line ?? 1, startColumn: 1, endLine: step.line ?? 1, endColumn: 1 };
  return { file: step.file ?? "", line: step.line ?? span.startLine, column: span.startColumn, span };
}

export function relative(root: string, file: string) {
  if (!root) return file.replaceAll(path.sep, "/");
  const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);
  return path.relative(path.resolve(root), absolute).replaceAll(path.sep, "/");
}

export function inside(root: string, file: string) {
  const relativePath = path.relative(path.resolve(root), path.resolve(file));
  return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..");
}

export function bounded<T>(items: T[], limit: number) {
  return items.slice(0, limit);
}
