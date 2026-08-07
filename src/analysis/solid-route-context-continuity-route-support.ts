import * as TypeScript from "typescript";
import type {
  ContextContinuityRecordStatus,
  ContextProvidedValueRecord,
  ContextReadRecord,
} from "./context-continuity";
import type { RouteFrameworkBoundary, RouteOccurrenceLocation, RouteOccurrenceSurface, RouteRenderOccurrence } from "./route-occurrence-surface";
import type { EvidenceProof, SourceLocation } from "./scope-seam";
import { stableHash } from "./scope-seam";
import { containsLocation, locationForContextNode, locationKey } from "./solid-route-context-continuity-support";
import { resolvedSymbolAtLocation } from "./solid-symbols";

export type RankedContextProvider = {
  host: RouteRenderOccurrence;
  nestingDepth: number;
  occurrence: { id: string; location: SourceLocation };
};

export function contextDeclarationId(context: string | { compilerIdentity: string }): string {
  return stableId("context-declaration", [typeof context === "string" ? context : context.compilerIdentity]);
}

export function stableId(prefix: string, values: readonly string[]): string {
  return `${prefix}:${stableHash(values.join("\u0000"))}`;
}

export function proof(kind: string, detail: string, locations: SourceLocation[], status: ContextContinuityRecordStatus): EvidenceProof[] {
  return [{ kind, detail, locations: uniqueLocations(locations), status }];
}

export function uniqueLocations(locations: readonly SourceLocation[]): SourceLocation[] {
  return [...new Map(locations.map((location) => [locationKey(location), location])).values()];
}

export function compareById(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

export function compareProof(left: EvidenceProof, right: EvidenceProof): number {
  return left.kind.localeCompare(right.kind) || left.detail.localeCompare(right.detail);
}

export function mergeStatus(left: ContextContinuityRecordStatus, right: ContextContinuityRecordStatus): ContextContinuityRecordStatus {
  if (left === "unsupported" || right === "unsupported") return "unsupported";
  return left === "partial" || right === "partial" ? "partial" : "proven";
}

export function memberStatusFor(read: ContextReadRecord, value: ContextProvidedValueRecord): "proven" | "partial" | "unsupported" {
  if (read.memberCertainty === "unknown" || value.memberCertainty === "unknown") return "partial";
  if (read.memberPaths.length === 0) return value.status === "proven" ? "proven" : "partial";
  let partial = false;
  for (const path of read.memberPaths) {
    const exact = value.memberEvidence.find((member) => samePath(member.memberPath, path));
    if (exact) {
      if (exact.status === "unsupported") {
        if (exact.sourceExpression) {
          partial = true;
          continue;
        }
        return "unsupported";
      }
      if (exact.status === "partial") partial = true;
      continue;
    }
    const prefix = value.memberEvidence
      .filter((member) => isPathPrefix(member.memberPath, path))
      .sort((left, right) => right.memberPath.length - left.memberPath.length)[0];
    if (!prefix) return "unsupported";
    if (prefix.status === "unsupported") return "unsupported";
    partial = true;
  }
  return partial ? "partial" : "proven";
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function isPathPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.length < path.length && prefix.every((part, index) => part === path[index]);
}

export function ancestryFor(surface: RouteOccurrenceSurface, ancestorId: string | null, descendantId: string): string[] {
  const byId = new Map(surface.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const reverse: string[] = [];
  let current: string | null = descendantId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    reverse.push(current);
    if (current === ancestorId) break;
    current = byId.get(current)?.parentOccurrenceId ?? null;
  }
  if (ancestorId !== null && reverse.at(-1) !== ancestorId) return [];
  return reverse.reverse();
}

export function unsupportedBoundaryBetween(
  surface: RouteOccurrenceSurface,
  ancestorId: string,
  descendantId: string,
  providerElementLocation: SourceLocation,
): RouteFrameworkBoundary | null {
  const boundaries = surface.frameworkBoundaries
    .filter((boundary) => boundary.kind === "portal" || boundary.kind === "unsupported-ownership")
    .filter((boundary) => boundary.parentOccurrenceId !== null)
    .filter((boundary) => boundaryInProviderBranch(surface, boundary, ancestorId, providerElementLocation))
    .filter((boundary) => boundaryContainsOccurrence(surface, boundary, descendantId))
    .sort((left, right) => left.id.localeCompare(right.id));
  return boundaries[0] ?? null;
}

function boundaryInProviderBranch(
  surface: RouteOccurrenceSurface,
  boundary: RouteFrameworkBoundary,
  providerOccurrenceId: string,
  providerElementLocation: SourceLocation,
): boolean {
  const parentOccurrenceId = boundary.parentOccurrenceId;
  if (!parentOccurrenceId) return false;
  if (parentOccurrenceId === providerOccurrenceId) return containsLocation(providerElementLocation, boundary.location);
  const ancestry = ancestryFor(surface, providerOccurrenceId, parentOccurrenceId);
  if (ancestry.length < 2) return false;
  const firstChild = surface.occurrences.find((occurrence) => occurrence.id === ancestry[1]);
  if (firstChild && containsLocation(providerElementLocation, firstChild.callSite)) return true;
  return surface.slotForwarding.some((slot) =>
    slot.occurrenceId === providerOccurrenceId
    && containsLocation(providerElementLocation, slot.sourceLocation)
    && slot.callerChildOccurrenceIds.includes(ancestry[1]),
  );
}

function boundaryContainsOccurrence(surface: RouteOccurrenceSurface, boundary: RouteFrameworkBoundary, occurrenceId: string): boolean {
  return [...boundary.childOccurrenceIds, ...boundary.fallbackChildOccurrenceIds].some((childId) =>
    childId === occurrenceId || ancestryFor(surface, childId, occurrenceId).length > 0,
  );
}

export function nearestProviders<T extends RankedContextProvider>(providers: readonly T[], consumerId: string, surface: RouteOccurrenceSurface): T[] {
  const consumerAncestry = ancestryFor(surface, null, consumerId);
  const ranked = providers.map((provider) => {
    const ancestryIndex = consumerAncestry.indexOf(provider.host.id);
    return { provider, ancestryIndex, nestingDepth: provider.nestingDepth };
  }).filter((item) => item.ancestryIndex >= 0);
  if (ranked.length === 0) return [];
  const maxAncestry = Math.max(...ranked.map((item) => item.ancestryIndex));
  const atNearestOccurrence = ranked.filter((item) => item.ancestryIndex === maxAncestry);
  const maxNesting = Math.max(...atNearestOccurrence.map((item) => item.nestingDepth));
  return atNearestOccurrence.filter((item) => item.nestingDepth === maxNesting).map((item) => item.provider);
}

export function jsxAncestorDepth(ts: typeof TypeScript, node: TypeScript.Node): number {
  let depth = 0;
  let current: TypeScript.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current) || ts.isJsxFragment(current)) depth += 1;
    current = current.parent;
  }
  return depth;
}

export function spanSize(location: RouteOccurrenceLocation): number {
  return (location.span.endLine - location.span.startLine) * 1_000_000 + location.span.endColumn - location.span.startColumn;
}

export function nodeKey(node: TypeScript.Node): string {
  const file = node.getSourceFile();
  return `${file.fileName}:${node.getStart(file)}:${node.getEnd()}`;
}

export function terminalIdsForRead(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  surface: RouteOccurrenceSurface,
  root: string,
  call: TypeScript.CallExpression,
  ownerOccurrenceId: string,
): { ids: string[]; locations: SourceLocation[] } {
  const owned = surface.terminals.filter((terminal) => terminal.ownerOccurrenceId === ownerOccurrenceId);
  const ids = owned.map((terminal) => terminal.id);
  const locations = owned.map((terminal) => terminal.location);
  const owner = nearestFunctionForRead(ts, call);
  const openings = new Map<string, TypeScript.JsxOpeningLikeElement>();
  const directOpening = jsxOpeningFor(ts, call.parent);
  if (directOpening) openings.set(locationKey(locationForContextNode(root, directOpening)), directOpening);
  for (const opening of dependentJsxOpenings(ts, checker, call, owner)) {
    openings.set(locationKey(locationForContextNode(root, opening)), opening);
  }
  for (const opening of openings.values()) {
    const openingLocation = locationForContextNode(root, opening);
    const occurrence = surface.occurrences.find((item) => sameLocation(item.callSite, openingLocation));
    if (occurrence) {
      const occurrenceIds = descendantsOf(surface, occurrence.id);
      occurrenceIds.add(occurrence.id);
      for (const terminal of surface.terminals) {
        if (terminal.ownerOccurrenceId && occurrenceIds.has(terminal.ownerOccurrenceId)) {
          ids.push(terminal.id);
          locations.push(terminal.location);
        }
      }
    }
    for (const terminal of surface.terminals) {
      if (locationContainsEither(terminal.location, openingLocation)) {
        ids.push(terminal.id);
        locations.push(terminal.location);
      }
    }
  }
  return { ids: [...new Set(ids)].sort(), locations: uniqueLocations(locations) };
}

function nearestFunctionForRead(ts: typeof TypeScript, call: TypeScript.CallExpression): TypeScript.FunctionLikeDeclaration | null {
  let current: TypeScript.Node | undefined = call.parent;
  while (current) {
    if (isFunctionLikeDeclaration(ts, current)) return current;
    current = current.parent;
  }
  return null;
}

function dependentJsxOpenings(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  call: TypeScript.CallExpression,
  owner: TypeScript.FunctionLikeDeclaration | null,
): TypeScript.JsxOpeningLikeElement[] {
  const symbols = bindingSymbols(ts, checker, call);
  const openings: TypeScript.JsxOpeningLikeElement[] = [];
  const visit = (node: TypeScript.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const hasDependentAttribute = opening.attributes.properties.some((property) => {
        const expression = jsxAttributeExpression(ts, property);
        return Boolean(expression && expressionDependsOnRead(ts, checker, expression, call, symbols));
      });
      const hasDependentChild = ts.isJsxElement(node) && node.children.some((child) =>
        ts.isJsxExpression(child)
        && Boolean(child.expression && expressionDependsOnRead(ts, checker, child.expression, call, symbols)),
      );
      if (hasDependentAttribute || hasDependentChild) openings.push(opening);
    }
    ts.forEachChild(node, visit);
  };
  visit(owner?.body ?? call.getSourceFile());
  return openings;
}

function jsxAttributeExpression(ts: typeof TypeScript, property: TypeScript.JsxAttributeLike): TypeScript.Expression | null {
  if (!ts.isJsxAttribute(property) || !property.initializer || !ts.isJsxExpression(property.initializer)) return null;
  return property.initializer.expression ?? null;
}

function bindingSymbols(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression): Set<TypeScript.Symbol> {
  const result = new Set<TypeScript.Symbol>();
  let parent: TypeScript.Node | undefined = call.parent;
  while (parent && (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isNonNullExpression(parent))) parent = parent.parent;
  if (!parent || !ts.isVariableDeclaration(parent) || parent.initializer !== call) return result;
  collectBindingSymbols(ts, checker, parent.name, result);
  return result;
}

function collectBindingSymbols(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  name: TypeScript.BindingName,
  result: Set<TypeScript.Symbol>,
): void {
  if (ts.isIdentifier(name)) {
    const symbol = resolvedSymbolAtLocation(ts, checker, name);
    if (symbol) result.add(symbol);
    return;
  }
  for (const element of name.elements) if (ts.isBindingElement(element)) collectBindingSymbols(ts, checker, element.name, result);
}

function expressionDependsOnRead(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
  call: TypeScript.CallExpression,
  symbols: Set<TypeScript.Symbol>,
  visitedNodes = new Set<TypeScript.Node>(),
  visitedSymbols = new Set<TypeScript.Symbol>(),
): boolean {
  if (node === call) return true;
  if (visitedNodes.has(node)) return false;
  visitedNodes.add(node);
  if (ts.isIdentifier(node)) {
    const symbol = resolvedSymbolAtLocation(ts, checker, node);
    if (symbol && symbols.has(symbol)) return true;
    if (symbol && !visitedSymbols.has(symbol)) {
      visitedSymbols.add(symbol);
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.find((item) => !item.getSourceFile().isDeclarationFile);
      if (declaration && declarationDependsOnRead(ts, checker, declaration, call, symbols, visitedNodes, visitedSymbols)) return true;
    }
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
    return Boolean(node.body && expressionDependsOnRead(ts, checker, node.body, call, symbols, visitedNodes, visitedSymbols));
  }
  let result = false;
  ts.forEachChild(node, (child) => {
    if (!result && expressionDependsOnRead(ts, checker, child, call, symbols, visitedNodes, visitedSymbols)) result = true;
  });
  return result;
}

function declarationDependsOnRead(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.Declaration,
  call: TypeScript.CallExpression,
  symbols: Set<TypeScript.Symbol>,
  visitedNodes: Set<TypeScript.Node>,
  visitedSymbols: Set<TypeScript.Symbol>,
): boolean {
  if (ts.isVariableDeclaration(declaration) && declaration.initializer && declaration.initializer !== call) {
    return expressionDependsOnRead(ts, checker, declaration.initializer, call, symbols, visitedNodes, visitedSymbols);
  }
  if (ts.isBindingElement(declaration)) {
    let parent: TypeScript.Node | undefined = declaration.parent;
    while (parent && !ts.isVariableDeclaration(parent)) parent = parent.parent;
    return Boolean(parent && ts.isVariableDeclaration(parent) && parent.initializer && expressionDependsOnRead(ts, checker, parent.initializer, call, symbols, visitedNodes, visitedSymbols));
  }
  if (ts.isFunctionDeclaration(declaration) || ts.isArrowFunction(declaration) || ts.isFunctionExpression(declaration)) {
    return Boolean(declaration.body && expressionDependsOnRead(ts, checker, declaration.body, call, symbols, visitedNodes, visitedSymbols));
  }
  return false;
}

function isFunctionLikeDeclaration(ts: typeof TypeScript, node: TypeScript.Node): node is TypeScript.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isArrowFunction(node)
    || ts.isFunctionExpression(node);
}

function jsxOpeningFor(ts: typeof TypeScript, node: TypeScript.Node | undefined): TypeScript.JsxOpeningLikeElement | null {
  let current = node;
  while (current) {
    if (ts.isJsxElement(current)) return current.openingElement;
    if (ts.isJsxSelfClosingElement(current)) return current;
    if (ts.isFunctionLike(current)) return null;
    current = current.parent;
  }
  return null;
}

function descendantsOf(surface: RouteOccurrenceSurface, ancestorId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [ancestorId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const occurrence of surface.occurrences) {
      if (occurrence.parentOccurrenceId !== current || descendants.has(occurrence.id)) continue;
      descendants.add(occurrence.id);
      queue.push(occurrence.id);
    }
  }
  return descendants;
}

function sameLocation(left: RouteOccurrenceLocation, right: SourceLocation): boolean {
  return locationKey(left) === locationKey(right);
}

function locationContainsEither(left: SourceLocation, right: SourceLocation): boolean {
  return containsLocation(left, right) || containsLocation(right, left);
}
