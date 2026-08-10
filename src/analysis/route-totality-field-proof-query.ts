import * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import { buildRouteTotalityAnchorIndex } from "./route-totality-anchor-index";
import type { RouteTotalityFieldLineage } from "./route-totality-field-lineage";
import { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { failedFieldProof, provenFieldProof } from "./route-totality-field-proof-result";
import type { FieldProofInput } from "./route-totality-field-proof-types";

/**
 * Demand-driven proof for the declared find -> Show -> JSX-field slice.
 * It resolves syntax, symbols, and occurrence anchors. It does not use route
 * locations, names, display labels, or reachability to join identity.
 */
export function queryRouteTotalityFieldProof(
  input: FieldProofInput,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage | null {
  const { ts, program, slice, surface, selectedSource } = input;
  const index = new RouteTotalityFieldProofIndex(ts, slice);
  const origin = selectedFilesystemOrigin(index, selectedSource);
  if (!origin) return null;
  const checker = program.getTypeChecker();
  const candidates: ProofCandidate[] = [];
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile) continue;
    visit(ts, file, (node) => {
      if (!ts.isCallExpression(node)) return;
      const candidate = candidateForFind(ts, checker, index, node);
      if (candidate) candidates.push(candidate);
    });
  }
  const sourceCandidates = candidates.filter((candidate) => sourceCarriesToGames(index, origin.elementId, candidate.games.id, cancellation));
  if (sourceCandidates.length === 0) return candidates.length
    ? failedFieldProof(origin, candidates[0].games, "The selected source has no exact carrier transfer to the compiler-resolved games receiver.", cancellation)
    : failedFieldProof(origin, null, "No compiler-resolved Array.find, accessor, Solid Show, and JSX title chain matched this selected route.", cancellation);
  if (sourceCandidates.length !== 1) return failedFieldProof(origin, null, "The selected source reaches more than one exact games property candidate.", cancellation);
  const candidate = sourceCandidates[0];
  const anchored = anchorCandidate(index, surface, candidate, cancellation);
  if (!anchored) return failedFieldProof(origin, candidate.games, "The compiler proof has no unique occurrence-owned consumer anchor.", cancellation);
  return provenFieldProof(origin, [
    index.byId(origin.elementId)!, candidate.games, candidate.find, candidate.parameter,
    candidate.predicate, candidate.accessor, candidate.accessorCall, candidate.show,
    candidate.currentParameter, candidate.current, candidate.field, candidate.occurrence, candidate.title,
  ], anchored.occurrenceId, anchored.terminalId, candidate.consumerLabel, !slice.coverage.complete || surface.status !== "complete", cancellation);
}

type ProofCandidate = {
  games: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  find: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  parameter: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  predicate: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  accessor: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  accessorCall: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  show: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  currentParameter: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  current: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  field: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  occurrence: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  title: ReturnType<RouteTotalityFieldProofIndex["element"]> & {};
  render: TypeScript.ArrowFunction;
  consumerLabel: string;
};

function candidateForFind(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  index: RouteTotalityFieldProofIndex,
  findCall: TypeScript.CallExpression,
): ProofCandidate | null {
  if (!ts.isPropertyAccessExpression(findCall.expression) || findCall.expression.name.text !== "find") return null;
  if (!ts.isIdentifier(findCall.expression.name) || !resolvesArrayFind(ts, checker, findCall.expression.name) || findCall.arguments.length !== 1 || !ts.isArrowFunction(findCall.arguments[0])) return null;
  const gamesAccess = findCall.expression.expression;
  if (!ts.isPropertyAccessExpression(gamesAccess) || gamesAccess.questionDotToken || gamesAccess.name.text.length === 0) return null;
  const callback = findCall.arguments[0];
  if (callback.parameters.length !== 1 || !ts.isIdentifier(callback.parameters[0].name) || callback.parameters[0].dotDotDotToken || callback.parameters[0].questionToken) return null;
  const parameterSymbol = checker.getSymbolAtLocation(callback.parameters[0].name);
  const predicateAccess = predicatePropertyAccess(ts, checker, callback.body, parameterSymbol);
  const declaration = accessorDeclaration(ts, findCall);
  if (!predicateAccess || !declaration) return null;
  const accessorSymbol = checker.getSymbolAtLocation(declaration.name);
  const showUse = uniqueShowUse(ts, checker, declaration.getSourceFile(), accessorSymbol);
  if (!showUse) return null;
  const currentAccess = titleCurrentAccess(ts, checker, showUse.render, showUse.parameter);
  if (!currentAccess) return null;
  const games = index.element(gamesAccess, "field-read");
  const find = index.element(findCall, "call");
  const parameter = index.element(callback.parameters[0], "parameter");
  const predicate = index.element(predicateAccess, "field-read");
  const accessor = declaration.initializer ? index.element(declaration.initializer, "function-entry") : null;
  const accessorCall = index.element(showUse.when, "call");
  const show = index.element(showUse.opening, "jsx-occurrence");
  const currentParameter = index.element(showUse.render.parameters[0], "parameter");
  const current = index.element(currentAccess.call, "call");
  const field = index.element(currentAccess.access, "field-read");
  const occurrence = index.element(currentAccess.opening, "component-occurrence");
  const title = index.element(currentAccess.title, "component-prop-binding");
  return games && find && parameter && predicate && accessor && accessorCall && show && currentParameter && current && field && occurrence && title
    ? { games, find, parameter, predicate, accessor, accessorCall, show, currentParameter, current, field, occurrence, title, render: showUse.render, consumerLabel: `${currentAccess.opening.tagName.getText()}.${currentAccess.title.name.getText()}` }
    : null;
}

function selectedFilesystemOrigin(index: RouteTotalityFieldProofIndex, selected: FieldProofInput["selectedSource"]) {
  const evidence = selected.evidence;
  if (!evidence) return null;
  const matches = index.slice.origins.filter((origin) => origin.role === "filesystem" && origin.elementId && sameLocation(index.byId(origin.elementId)?.location, evidence));
  return matches.length === 1 && index.byId(matches[0].elementId)?.kind === "file-input" ? { elementId: matches[0].elementId, role: "filesystem" as const } : null;
}

function sourceCarriesToGames(index: RouteTotalityFieldProofIndex, originId: string, gamesId: string, cancellation: AnalysisCancellationToken): boolean {
  // This narrow resolver accepts only explicit carrier/return/reference facts.
  // It never walks broad render, component, or arbitrary reference reachability.
  const allowed = new Set(["carrier", "references", "return-expression", "return-value", "http-bridge", "resource-result", "field-input"]);
  const work: Array<{ id: string; field: boolean }> = [{ id: originId, field: false }];
  const seen = new Set<string>();
  let matches = 0;
  while (work.length) {
    cancellation.throwIfCancelled();
    const state = work.shift()!;
    if (state.id === gamesId && state.field) { matches += 1; continue; }
    if (seen.has(`${state.id}:${state.field}`) || work.length > 128) continue;
    seen.add(`${state.id}:${state.field}`);
    for (const relation of index.outgoing(state.id)) {
      if (!allowed.has(relation.kind) || relation.status !== "proven") continue;
      const target = index.byId(relation.to);
      if (!target || target.status !== "proven") continue;
      const field = state.field || relation.kind === "field-input";
      if (relation.kind === "field-input" && relation.to !== gamesId) continue;
      work.push({ id: relation.to, field });
    }
  }
  return matches === 1;
}

function anchorCandidate(index: RouteTotalityFieldProofIndex, surface: FieldProofInput["surface"], candidate: ProofCandidate, cancellation: AnalysisCancellationToken) {
  const anchors = buildRouteTotalityAnchorIndex(index.slice, surface, cancellation);
  const occurrence = anchors.occurrenceAnchorsByEvidenceElementId.get(candidate.occurrence.id) ?? [];
  const render = index.element(candidate.render, "render-terminal");
  const terminal = render ? anchors.terminalAnchorsByEvidenceElementId.get(render.id) ?? [] : [];
  return occurrence.length === 1 && terminal.length === 1
    ? { occurrenceId: occurrence[0].endpoint.id, terminalId: terminal[0].endpoint.id }
    : null;
}

function accessorDeclaration(ts: typeof TypeScript, find: TypeScript.CallExpression): TypeScript.VariableDeclaration | null {
  const arrow = find.parent;
  if (!ts.isArrowFunction(arrow) || arrow.body !== find || !ts.isVariableDeclaration(arrow.parent) || !ts.isIdentifier(arrow.parent.name)) return null;
  return arrow.parent;
}
function predicatePropertyAccess(ts: typeof TypeScript, checker: TypeScript.TypeChecker, body: TypeScript.ConciseBody, parameter: TypeScript.Symbol | undefined): TypeScript.PropertyAccessExpression | null {
  const matches: TypeScript.PropertyAccessExpression[] = [];
  visit(ts, body, (node) => { if (ts.isPropertyAccessExpression(node) && checker.getSymbolAtLocation(node.expression) === parameter) matches.push(node); });
  return matches.length === 1 ? matches[0] : null;
}
function uniqueShowUse(ts: typeof TypeScript, checker: TypeScript.TypeChecker, file: TypeScript.SourceFile, accessor: TypeScript.Symbol | undefined) {
  const values: Array<{ opening: TypeScript.JsxOpeningLikeElement; when: TypeScript.CallExpression; render: TypeScript.ArrowFunction; parameter: TypeScript.Symbol }> = [];
  visit(ts, file, (node) => {
    if (!ts.isJsxElement(node) || !isSolidShow(ts, checker, node.openingElement)) return;
    const whenAttribute = node.openingElement.attributes.properties.filter((item): item is TypeScript.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText() === "when" && Boolean(item.initializer));
    const expression = whenAttribute.length === 1 && whenAttribute[0].initializer && ts.isJsxExpression(whenAttribute[0].initializer) ? whenAttribute[0].initializer.expression : null;
    const renderExpressions = node.children.filter((child): child is TypeScript.JsxExpression => ts.isJsxExpression(child) && child.expression !== undefined && ts.isArrowFunction(child.expression));
    if (!expression || !ts.isCallExpression(expression) || checker.getSymbolAtLocation(expression.expression) !== accessor || renderExpressions.length !== 1) return;
    const render = renderExpressions[0].expression as TypeScript.ArrowFunction;
    if (render.parameters.length !== 1 || !ts.isIdentifier(render.parameters[0].name)) return;
    const parameter = checker.getSymbolAtLocation(render.parameters[0].name);
    if (parameter) values.push({ opening: node.openingElement, when: expression, render, parameter });
  });
  return values.length === 1 ? values[0] : null;
}
function titleCurrentAccess(ts: typeof TypeScript, checker: TypeScript.TypeChecker, render: TypeScript.ArrowFunction, parameter: TypeScript.Symbol) {
  const values: Array<{ call: TypeScript.CallExpression; access: TypeScript.PropertyAccessExpression; opening: TypeScript.JsxOpeningLikeElement; title: TypeScript.JsxAttribute }> = [];
  visit(ts, render.body, (node) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxElement(node)) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const titles = opening.attributes.properties.filter((item): item is TypeScript.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText() === "title" && Boolean(item.initializer));
    if (titles.length !== 1 || !titles[0].initializer || !ts.isJsxExpression(titles[0].initializer)) return;
    const expression = titles[0].initializer.expression;
    if (!expression) return;
    visit(ts, expression, (child) => {
      if (!ts.isPropertyAccessExpression(child) || !ts.isCallExpression(child.expression) || checker.getSymbolAtLocation(child.expression.expression) !== parameter) return;
      values.push({ call: child.expression, access: child, opening, title: titles[0] });
    });
  });
  return values.length === 1 ? values[0] : null;
}
function resolvesArrayFind(ts: typeof TypeScript, checker: TypeScript.TypeChecker, name: TypeScript.Identifier): boolean { const symbol = checker.getSymbolAtLocation(name); return Boolean(symbol && symbol.getName() === "find" && symbol.declarations?.some((decl) => decl.getSourceFile().isDeclarationFile && decl.getSourceFile().fileName.includes("lib.es"))); }
function isSolidShow(ts: typeof TypeScript, checker: TypeScript.TypeChecker, opening: TypeScript.JsxOpeningLikeElement): boolean { const symbol = checker.getSymbolAtLocation(opening.tagName); const target = symbol?.flags && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol; return Boolean(target?.getName() === "Show" && target.declarations?.some((decl) => decl.getSourceFile().fileName.includes("solid-js"))); }
function sameLocation(left: { file: string; line: number; column: number; span: { startLine: number; startColumn: number; endLine: number; endColumn: number } } | undefined, right: NonNullable<FieldProofInput["selectedSource"]["evidence"]>) { return Boolean(left && left.file === right.file && left.line === right.line && left.column === right.column && left.span.startLine === right.span.startLine && left.span.startColumn === right.span.startColumn && left.span.endLine === right.span.endLine && left.span.endColumn === right.span.endColumn); }
function visit(ts: typeof TypeScript, node: TypeScript.Node, callback: (node: TypeScript.Node) => void) { callback(node); ts.forEachChild(node, (child) => visit(ts, child, callback)); }
