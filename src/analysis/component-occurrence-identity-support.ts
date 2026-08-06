import path from "node:path";
import type * as TypeScript from "typescript";
import type {
  ComponentDefinition,
  ComponentOccurrence,
  CompilerLocation,
  SiblingIsolationDiagnostic,
  SourcePathDiagnostic,
  SourcePathSeed,
} from "./component-occurrence-identity";
import { stableHash } from "./route-discovery";
import { compilerSourceIdentityFor, sameLocation } from "./route-shadow-evidence-support";
import type { TransparentWrapperProjection } from "./transparent-wrapper-occurrence-projection";

export const TARGET_ROUTE = "/captures/[captureId]";
export const TARGET_ROUTE_ENTRY_FILE = "app/src/components/pluck/viewer/CaptureInspectorPanel.tsx";
export const TARGET_COMPONENT_FILE = "app/src/components/pluck/viewer/CaptureStatsPanel.tsx";
export const TARGET_SOURCE_FILE = "app/src/lib/pluck/store/json.ts";
export const TARGET_SOURCE_LINE = 20;
export const TARGET_TERMINAL_LINE = 41;
export const TARGET_SOURCE_MODULE = "node:fs/promises";
export const TARGET_TERMINAL_EXPRESSION = "formatBytes(props.page.captureStats.totalBytes)";
export const TRANSPARENT_MODULE = "styled-system/jsx";
export const TRANSPARENT_NAMES = new Set(["HStack", "VStack", "Grid"]);

export function collectOccurrences(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  declaration: TypeScript.FunctionLikeDeclaration,
  rootDefinition: ComponentDefinition,
  rootOccurrence: ComponentOccurrence,
) {
  const definitions = new Map<string, ComponentDefinition>([[rootDefinition.id, rootDefinition]]);
  const occurrenceByNode = new Map<TypeScript.Node, ComponentOccurrence>();
  const nodes: Array<TypeScript.JsxElement | TypeScript.JsxSelfClosingElement> = [];
  const body = declaration.body;
  if (body) visit(ts, body, (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) nodes.push(node);
  });
  nodes.sort((left, right) => left.getStart() - right.getStart());
  const occurrences: ComponentOccurrence[] = [rootOccurrence];
  for (const node of nodes) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const symbol = resolvedSymbol(ts, checker, opening.tagName);
    if (!symbol) continue;
    const definition = definitionFor(checker, symbol, root, importModuleFor(ts, checker, opening.tagName));
    definitions.set(definition.id, definition);
    const parent = nearestOccurrenceParent(ts, node, occurrenceByNode) ?? rootOccurrence;
    const occurrence = occurrenceFor(root, definition, opening, parent.id, rootOccurrence.scopeId, "caller-owned");
    occurrenceByNode.set(node, occurrence);
    occurrences.push(occurrence);
  }
  const targetTerminal = findTargetTerminal(ts, body);
  const pathIds = targetTerminal
    ? [rootOccurrence.id, ...nodesContaining(targetTerminal, occurrenceByNode)]
    : [];
  return {
    definitions: [...definitions.values()],
    occurrences: withCallerOwnedChildren(occurrences),
    terminal: targetTerminal ? locationForNode(root, targetTerminal) : null,
    pathIds: unique(pathIds),
  };
}

export function siblingDiagnostic(
  wrapper: ComponentOccurrence,
  sibling: ComponentOccurrence,
  projection: TransparentWrapperProjection,
  sourcePathIds: readonly string[],
  occurrences: readonly ComponentOccurrence[],
): SiblingIsolationDiagnostic {
  const selectedChildren = occurrences.filter((occurrence) => occurrence.parentOccurrenceId === wrapper.id).map((occurrence) => occurrence.id);
  const siblingChildren = occurrences.filter((occurrence) => occurrence.parentOccurrenceId === sibling.id).map((occurrence) => occurrence.id);
  const reattached = new Set(projection.reattachedChildOccurrenceIds);
  return {
    selectedWrapperOccurrenceId: wrapper.id,
    siblingWrapperOccurrenceId: sibling.id,
    sameDefinition: wrapper.definitionId === sibling.definitionId,
    selectedChildOccurrenceIds: selectedChildren,
    siblingChildOccurrenceIds: siblingChildren,
    siblingReceivedSelectedChildren: siblingChildren.some((id) => reattached.has(id)) || reattached.has(sibling.id),
    siblingInSourcePath: sourcePathIds.includes(sibling.id),
  };
}

export function sourcePathDiagnostic(
  terminal: CompilerLocation | null,
  occurrenceIds: string[],
  seed: SourcePathSeed | null,
  scopeId: string,
  sourceIdentity: { location: CompilerLocation; compilerIdentity: string } | null,
): SourcePathDiagnostic {
  if (!terminal || !seed || !sourceIdentity) {
    return {
      status: "unavailable",
      sourceOccurrenceId: seed?.sourceOccurrenceId ?? null,
      sourceCompilerIdentity: seed?.sourceCompilerIdentity ?? null,
      sourceLocation: seed?.sourceLocation ?? null,
      terminalLocation: terminal,
      scopeId: seed?.scopeId ?? null,
      occurrenceIds: [],
      detail: "The occurrence projection needs an exact compiler-backed route-slice source path.",
    };
  }
  const sourceMatches = seed.sourceCompilerIdentity === sourceIdentity.compilerIdentity
    && sameLocation(seed.sourceLocation, sourceIdentity.location);
  if (!sourceMatches) return invalidPath(seed, terminal, "The supplied route-slice source path does not match the compiler-resolved Pluck readFile occurrence.");
  if (seed.scopeId !== scopeId) return invalidPath(seed, terminal, "The supplied route-slice source path belongs to a different compiler scope.");
  if (seed.terminalLocation.file !== terminal.file || seed.terminalLocation.line !== terminal.line) return invalidPath(seed, terminal, "The supplied route-slice source path does not match the compiler-resolved source and terminal.");
  return {
    status: "proven",
    sourceOccurrenceId: seed.sourceOccurrenceId,
    sourceCompilerIdentity: seed.sourceCompilerIdentity,
    sourceLocation: seed.sourceLocation,
    terminalLocation: terminal,
    scopeId: seed.scopeId,
    occurrenceIds,
    detail: seed.proof.detail,
  };
}

function invalidPath(seed: SourcePathSeed, terminal: CompilerLocation, detail: string): SourcePathDiagnostic {
  return {
    status: "invalid",
    sourceOccurrenceId: seed.sourceOccurrenceId,
    sourceCompilerIdentity: seed.sourceCompilerIdentity,
    sourceLocation: seed.sourceLocation,
    terminalLocation: terminal,
    scopeId: seed.scopeId,
    occurrenceIds: [],
    detail,
  };
}

export function isTransparentLayout(occurrence: ComponentOccurrence, definitions: readonly ComponentDefinition[]) {
  const definition = definitions.find((candidate) => candidate.id === occurrence.definitionId);
  return Boolean(definition && definition.importModule === TRANSPARENT_MODULE && TRANSPARENT_NAMES.has(definition.name));
}

export function findTargetTerminal(ts: typeof TypeScript, body: TypeScript.Node | undefined) {
  let result: TypeScript.CallExpression | null = null;
  if (body) visit(ts, body, (node) => {
    if (result || !ts.isCallExpression(node)) return;
    if (node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1 === TARGET_TERMINAL_LINE && node.getText() === TARGET_TERMINAL_EXPRESSION) result = node;
  });
  return result;
}

function nodesContaining(target: TypeScript.Node, occurrences: ReadonlyMap<TypeScript.Node, ComponentOccurrence>) {
  return [...occurrences.entries()]
    .filter(([node]) => contains(node, target))
    .sort(([left], [right]) => left.getStart() - right.getStart())
    .map(([, occurrence]) => occurrence.id);
}

function nearestOccurrenceParent(ts: typeof TypeScript, node: TypeScript.Node, occurrences: ReadonlyMap<TypeScript.Node, ComponentOccurrence>) {
  let current = node.parent;
  while (current) {
    const occurrence = occurrences.get(current);
    if (occurrence) return occurrence;
    if (ts.isFunctionLike(current) && current !== node) break;
    current = current.parent;
  }
  return null;
}

function withCallerOwnedChildren(occurrences: readonly ComponentOccurrence[]) {
  return occurrences.map((occurrence) => ({
    ...occurrence,
    callerOwnedChildOccurrenceIds: occurrences.filter((candidate) => candidate.parentOccurrenceId === occurrence.id && candidate.ownership === "caller-owned").map((candidate) => candidate.id),
  }));
}

export function occurrenceFor(root: string, definition: ComponentDefinition, callSite: TypeScript.Node, parentOccurrenceId: string | null, scopeId: string, ownership: ComponentOccurrence["ownership"]): ComponentOccurrence {
  const location = locationForNode(root, callSite);
  const callSiteId = `component-call-site:${stableHash(`${scopeId}:${definition.compilerIdentity}:${location.file}:${callSite.getStart()}`)}`;
  const key = `${scopeId}:${callSiteId}:${parentOccurrenceId ?? "scope-root"}`;
  return {
    id: `component-occurrence:${stableHash(key)}`,
    callSiteId,
    definitionId: definition.id,
    definitionCompilerIdentity: definition.compilerIdentity,
    name: definition.name,
    parentOccurrenceId,
    callerOwnedChildOccurrenceIds: [],
    scopeId,
    callSite: location,
    ownership,
    repetition: "single",
  };
}

export function definitionFor(checker: TypeScript.TypeChecker, symbol: TypeScript.Symbol, root: string, importModule: string | null): ComponentDefinition {
  const compilerIdentity = checker.getFullyQualifiedName(symbol);
  return { id: `component-definition:${stableHash(compilerIdentity)}`, name: symbol.getName(), compilerIdentity, importModule, declaration: declarationLocation(root, symbol) };
}

function declarationLocation(root: string, symbol: TypeScript.Symbol): CompilerLocation | null {
  const declaration = symbol.declarations?.[0];
  return declaration ? locationForNode(root, declaration) : null;
}

function findJsxCallSite(ts: typeof TypeScript, checker: TypeScript.TypeChecker, file: TypeScript.SourceFile, target: TypeScript.Symbol) {
  let result: TypeScript.Node | null = null;
  visit(ts, file, (node) => {
    if (result || (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node))) return;
    const symbol = resolvedSymbol(ts, checker, node.tagName);
    if (symbol && sameCompilerIdentity(checker, symbol, target)) result = node;
  });
  return result;
}

export function findFunctionDeclaration(ts: typeof TypeScript, file: TypeScript.SourceFile, name: string): TypeScript.FunctionLikeDeclaration | null {
  let result: TypeScript.FunctionLikeDeclaration | null = null;
  visit(ts, file, (node) => {
    if (result) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) result = node.initializer;
  });
  return result;
}

function resolvedSymbol(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  let symbol = checker.getSymbolAtLocation(node);
  if (!symbol) return null;
  try {
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  } catch {
    return null;
  }
  return symbol;
}

function sameCompilerIdentity(checker: TypeScript.TypeChecker, left: TypeScript.Symbol, right: TypeScript.Symbol) {
  return left === right || checker.getFullyQualifiedName(left) === checker.getFullyQualifiedName(right);
}

function importModuleFor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node): string | null {
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

function findSourceFile(program: TypeScript.Program, suffix: string) {
  const normalizedSuffix = suffix.replaceAll("/", path.sep);
  return program.getSourceFiles().find((file) => file.fileName.replaceAll(path.sep, "/").endsWith(normalizedSuffix.replaceAll(path.sep, "/"))) ?? null;
}

export function selectedFiles(program: TypeScript.Program) {
  return { componentFile: findSourceFile(program, TARGET_COMPONENT_FILE), entryFile: findSourceFile(program, TARGET_ROUTE_ENTRY_FILE) };
}

export function selectedComponentPair(ts: typeof TypeScript, checker: TypeScript.TypeChecker, componentFile: TypeScript.SourceFile | null, entryFile: TypeScript.SourceFile | null) {
  const componentDeclaration = componentFile ? findFunctionDeclaration(ts, componentFile, "CaptureStatsPanel") : null;
  const componentSymbol = componentDeclaration?.name ? resolvedSymbol(ts, checker, componentDeclaration.name) : null;
  const componentCall = componentSymbol && entryFile ? findJsxCallSite(ts, checker, entryFile, componentSymbol) : null;
  return { componentDeclaration, componentSymbol, componentCall };
}

export function componentSourceIdentity(ts: typeof TypeScript, checker: TypeScript.TypeChecker, program: TypeScript.Program, root: string) {
  return compilerSourceIdentityFor(ts, checker, program, root, TARGET_SOURCE_FILE, TARGET_SOURCE_LINE, TARGET_SOURCE_MODULE);
}

export function locationForNode(root: string, node: TypeScript.Node): CompilerLocation {
  const sourceFile = node.getSourceFile();
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return { file: relative(root, sourceFile.fileName), line: start.line + 1, column: start.character + 1, span: { startLine: start.line + 1, startColumn: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 } };
}

function contains(parent: TypeScript.Node, child: TypeScript.Node) {
  return child.getStart() >= parent.getStart() && child.getEnd() <= parent.getEnd();
}

function visit(ts: typeof TypeScript, node: TypeScript.Node, callback: (node: TypeScript.Node) => void) {
  callback(node);
  ts.forEachChild(node, (child) => visit(ts, child, callback));
}

function relative(root: string, file: string) {
  return path.relative(path.resolve(root), path.resolve(file)).replaceAll(path.sep, "/");
}

function unique(values: string[]) {
  return [...new Set(values)];
}
