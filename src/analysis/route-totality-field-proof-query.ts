import * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import { coverageFor } from "./evidence-slice-coverage";
import { buildRouteTotalityAnchorIndex } from "./route-totality-anchor-index";
import type { RouteTotalityFieldLineage, RouteTotalityFieldOrigin, RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { failedFieldProof, fieldTransformation, provenFieldProof } from "./route-totality-field-proof-result";
import type { FieldProofInput } from "./route-totality-field-proof-types";
import { EXACT_FIELD_TRANSFER_KINDS, isExactSourceCarrierRelation, verifyExactFieldTransfer, type ExactFieldTransferKind } from "./route-totality-field-transfer-verifier";
import type { ProgramElement, ProgramRelation } from "./scope-seam";

/** Query the exact C01-C12 ledger from shared compiler evidence. */
export function queryRouteTotalityFieldProof(
  input: FieldProofInput,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage | null {
  const { ts, program, root, provider, slice, surface, selectedSource } = input;
  const index = new RouteTotalityFieldProofIndex(root, provider, slice);
  const origin = selectedFilesystemOrigin(index, selectedSource);
  if (!origin) return null;
  const checker = program.getTypeChecker();
  const candidates: ProofCandidate[] = [];
  for (const file of [...program.getSourceFiles()].sort((left, right) => left.fileName.localeCompare(right.fileName))) {
    if (file.isDeclarationFile) continue;
    visit(ts, file, (node) => {
      if (!ts.isCallExpression(node)) return;
      const candidate = candidateForFind(ts, checker, index, node, cancellation);
      if (candidate) candidates.push(candidate);
    });
  }
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.findResult.id, candidate])).values()]
    .sort((left, right) => sourceOrder(left.findCall, right.findCall));
  const sourceCandidates = uniqueCandidates.flatMap((candidate) => {
    const paths = carrierPaths(index, origin.elementId, candidate.games.id, cancellation);
    const anchored = anchorCandidate(index, surface, candidate, cancellation);
    return paths.length === 1 && anchored ? [{ candidate, carrier: paths[0], anchored }] : [];
  });
  if (sourceCandidates.length !== 1) {
    augmentSlice(index, cancellation);
    const current = uniqueCandidates[0]?.games ?? index.byId(origin.elementId);
    return failedFieldProof(
      origin,
      current,
      "source-carrier",
      [],
      sourceCandidates.length === 0
        ? "The selected filesystem evidence has no unique exact carrier chain to the compiler-resolved snapshot.games read."
        : "The selected filesystem evidence reaches more than one exact snapshot.games candidate.",
      cancellation,
    );
  }
  const { candidate, carrier, anchored } = sourceCandidates[0];
  const transformations = transformationsFor(index, origin, candidate, carrier, cancellation);
  const accepted: RouteTotalityFieldTransformation[] = [];
  for (let step = 0; step < EXACT_FIELD_TRANSFER_KINDS.length; step += 1) {
    const transfer = transformations[step];
    if (!transfer) {
      augmentSlice(index, cancellation);
      return failedFieldProof(origin, accepted.length ? index.byId(accepted.at(-1)!.toElementIds[0]) : index.byId(origin.elementId), EXACT_FIELD_TRANSFER_KINDS[step], accepted, `The exact ${EXACT_FIELD_TRANSFER_KINDS[step]} evidence transfer is missing.`, cancellation);
    }
    const verification = verifyExactFieldTransfer(transfer, index.graph(), cancellation);
    if (!verification.ok) {
      augmentSlice(index, cancellation);
      return failedFieldProof(origin, index.byId(transfer.fromElementIds[0]), transfer.kind as ExactFieldTransferKind, accepted, verification.detail, cancellation);
    }
    accepted.push(transfer);
  }
  augmentSlice(index, cancellation);
  return provenFieldProof({
    origin,
    games: candidate.games,
    collectionElement: candidate.collectionElement,
    field: candidate.field,
    occurrence: candidate.occurrence,
    titleValue: candidate.titleValue,
    binding: candidate.binding,
    occurrenceId: anchored.occurrenceId,
    terminalId: anchored.terminalId,
    transformations: accepted,
    partial: !slice.coverage.complete || surface.status !== "complete",
  }, cancellation);
}

type ProofCandidate = {
  findCall: TypeScript.CallExpression;
  snapshotCall: ProgramElement;
  games: ProgramElement;
  collectionElement: ProgramElement;
  parameter: ProgramElement;
  parameterValue: ProgramElement;
  predicateField: ProgramElement;
  predicateResult: ProgramElement;
  findResult: ProgramElement;
  returnExpression: ProgramElement;
  accessorCall: ProgramElement;
  showBinding: ProgramElement;
  currentParameter: ProgramElement;
  currentCall: ProgramElement;
  field: ProgramElement;
  titleValue: ProgramElement;
  binding: ProgramElement;
  occurrence: ProgramElement;
  definition: ProgramElement;
  render: TypeScript.ArrowFunction;
};

type CarrierPath = { call: ProgramElement; relations: ProgramRelation[] };

function candidateForFind(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  index: RouteTotalityFieldProofIndex,
  findCall: TypeScript.CallExpression,
  cancellation: AnalysisCancellationToken,
): ProofCandidate | null {
  if (!ts.isPropertyAccessExpression(findCall.expression)
    || !ts.isIdentifier(findCall.expression.name)
    || findCall.expression.name.text !== "find"
    || !resolvesArrayFind(checker, findCall.expression.name)
    || findCall.arguments.length !== 1
    || !ts.isArrowFunction(findCall.arguments[0])) return null;
  const gamesAccess = findCall.expression.expression;
  if (!ts.isPropertyAccessExpression(gamesAccess) || gamesAccess.name.text !== "games" || !ts.isCallExpression(gamesAccess.expression)) return null;
  const callback = findCall.arguments[0];
  if (callback.parameters.length !== 1 || !ts.isIdentifier(callback.parameters[0].name)) return null;
  const returned = directReturnedExpression(ts, callback);
  const parameterSymbol = checker.getSymbolAtLocation(callback.parameters[0].name);
  if (!returned || !parameterSymbol) return null;
  const predicateReads = parameterPropertyReads(ts, checker, returned, parameterSymbol);
  if (predicateReads.length !== 1 || predicateReads[0].name.text !== "id") return null;
  const declaration = accessorDeclaration(ts, findCall);
  if (!declaration) return null;
  const accessorSymbol = checker.getSymbolAtLocation(declaration.name);
  const showUse = uniqueShowUse(ts, checker, declaration.getSourceFile(), accessorSymbol);
  if (!showUse) return null;
  const consumer = exactPageHeaderConsumer(ts, checker, showUse.render, showUse.parameter);
  if (!consumer || consumer.access.name.text !== "opponentName") return null;

  const values = {
    snapshotCall: index.element(gamesAccess.expression, "call"),
    games: index.element(gamesAccess, "field-read"),
    collectionElement: index.element(gamesAccess, "collection-element"),
    parameter: index.element(callback.parameters[0].name, "parameter"),
    parameterValue: index.element(predicateReads[0].expression, "value"),
    predicateField: index.element(predicateReads[0], "field-read"),
    predicateResult: index.element(returned, "predicate-result"),
    findResult: index.element(findCall, "call-result"),
    returnExpression: index.element(findCall, "return-expression"),
    accessorCall: index.element(showUse.when, "call"),
    showBinding: index.element(showUse.opening, "show-binding"),
    currentParameter: index.element(showUse.render.parameters[0].name, "parameter"),
    currentCall: index.element(consumer.call, "call"),
    field: index.element(consumer.access, "field-read"),
    titleValue: index.element(consumer.value, elementKindForExpression(ts, consumer.value)),
    binding: index.element(consumer.attribute, "component-prop-binding"),
    occurrence: index.element(consumer.opening, "component-occurrence"),
  };
  if (Object.values(values).some((value) => value === null)) return null;
  const occurrence = values.occurrence!;
  const binding = values.binding!;
  if (occurrence.symbol === null || binding.componentBinding?.propName !== "title" || binding.componentBinding.componentOccurrenceElementId !== occurrence.id) return null;
  const definitionId = binding.componentBinding.componentDefinitionId;
  const definition = definitionId ? index.byId(definitionId) : null;
  if (!definition || definition.kind !== "component-definition" || definition.symbol !== occurrence.symbol || !occurrence.symbol.includes(".PageHeader@")) return null;
  cancellation.throwIfCancelled();
  return { findCall, ...values as Omit<ProofCandidate, "findCall" | "definition" | "render">, definition, render: showUse.render };
}

function transformationsFor(
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidate: ProofCandidate,
  carrier: CarrierPath,
  cancellation: AnalysisCancellationToken,
): Array<RouteTotalityFieldTransformation | null> {
  const source = index.byId(origin.elementId)!;
  const occurrenceRelation = one(index.exactRelations(candidate.occurrence.id, candidate.definition.id, "component-occurrence", "compiler-symbol", cancellation));
  return [
    fieldTransformation("source-carrier", source, carrier.call, carrier.relations, [], [], cancellation),
    step(index, "property-read", carrier.call, candidate.games, [["field-input", "property-access"]], cancellation),
    step(index, "find-element", candidate.games, candidate.collectionElement, [["collection-element", "array-find-element"]], cancellation),
    step(index, "callback-parameter", candidate.collectionElement, candidate.parameter, [["callback-parameter", "array-find-callback"]], cancellation),
    chainedStep(index, "predicate-return", candidate.parameter, candidate.predicateResult, [
      [candidate.parameter, candidate.parameterValue, "references", "compiler-symbol"],
      [candidate.parameterValue, candidate.predicateField, "field-input", "property-access"],
      [candidate.predicateField, candidate.predicateResult, "predicate-return", "array-find-predicate-return"],
    ], cancellation),
    step(index, "find-result", candidate.predicateResult, candidate.findResult, [["find-result", "array-find-result"]], cancellation),
    chainedStep(index, "function-return", candidate.findResult, candidate.accessorCall, [
      [candidate.findResult, candidate.returnExpression, "function-return", "return-expression"],
      [candidate.returnExpression, candidate.accessorCall, "function-call", "function-call"],
    ], cancellation),
    step(index, "show-when", candidate.accessorCall, candidate.showBinding, [["show-when", "solid-show-when"]], cancellation),
    step(index, "show-render-prop", candidate.showBinding, candidate.currentParameter, [["show-render-parameter", "solid-show-render-parameter"]], cancellation),
    step(index, "accessor-call", candidate.currentParameter, candidate.currentCall, [["accessor-call", "accessor-call"]], cancellation),
    step(index, "nested-property-read", candidate.currentCall, candidate.field, [["field-input", "property-access"]], cancellation),
    chainedStep(index, "occurrence-consumer", candidate.field, candidate.binding, [
      [candidate.field, candidate.titleValue, "consumer-value", "jsx-consumer-value"],
      [candidate.titleValue, candidate.binding, "component-prop-binding", "component-prop-binding"],
    ], cancellation, [candidate.occurrence, candidate.definition], occurrenceRelation ? [occurrenceRelation] : []),
  ];
}

function step(
  index: RouteTotalityFieldProofIndex,
  kind: ExactFieldTransferKind,
  from: ProgramElement,
  to: ProgramElement,
  relations: readonly (readonly [string, string])[],
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldTransformation | null {
  if (relations.length !== 1) return null;
  const relation = one(index.exactRelations(from.id, to.id, relations[0][0], relations[0][1], cancellation));
  return relation ? fieldTransformation(kind, from, to, [relation], [], [], cancellation) : null;
}

function chainedStep(
  index: RouteTotalityFieldProofIndex,
  kind: ExactFieldTransferKind,
  from: ProgramElement,
  to: ProgramElement,
  definitions: readonly (readonly [ProgramElement, ProgramElement, string, string])[],
  cancellation: AnalysisCancellationToken,
  supportElements: readonly ProgramElement[] = [],
  supportRelations: readonly ProgramRelation[] = [],
): RouteTotalityFieldTransformation | null {
  const relations = definitions.map(([source, target, relationKind, proofKind]) => one(index.exactRelations(source.id, target.id, relationKind, proofKind, cancellation)));
  return relations.every(Boolean)
    ? fieldTransformation(kind, from, to, relations as ProgramRelation[], supportElements, supportRelations, cancellation)
    : null;
}

function selectedFilesystemOrigin(index: RouteTotalityFieldProofIndex, selected: FieldProofInput["selectedSource"]): RouteTotalityFieldOrigin | null {
  const evidence = selected.evidence;
  if (!evidence) return null;
  const element = index.selectedFilesystemInput(evidence);
  if (!element || !sameLocation(element.location, evidence)) return null;
  const key = `${element.id}:filesystem`;
  if (!index.slice.origins.some((origin) => `${origin.elementId}:${origin.role}` === key)) {
    index.slice.origins.push({ elementId: element.id, role: "filesystem", label: element.label, status: element.status, proof: element.proof });
    index.slice.origins.sort((left, right) => `${left.elementId}:${left.role}`.localeCompare(`${right.elementId}:${right.role}`));
  }
  return { elementId: element.id, role: "filesystem", selectedEvidenceId: evidence.id };
}

function carrierPaths(index: RouteTotalityFieldProofIndex, originId: string, gamesId: string, cancellation: AnalysisCancellationToken): CarrierPath[] {
  const queue: Array<{ ids: string[]; relations: ProgramRelation[] }> = [{ ids: [originId], relations: [] }];
  const matches: CarrierPath[] = [];
  while (queue.length > 0 && queue.length < 256) {
    cancellation.throwIfCancelled();
    const current = queue.shift()!;
    const currentId = current.ids.at(-1)!;
    for (const relation of index.outgoing(currentId, cancellation)) {
      if (current.ids.includes(relation.to) || relation.status !== "proven" || relation.proof.status !== "proven") continue;
      const target = index.byId(relation.to);
      const source = index.byId(relation.from);
      if (!source || !target || source.status !== "proven" || target.status !== "proven") continue;
      if (relation.to === gamesId && relation.kind === "field-input" && relation.proof.kind === "property-access" && target.kind === "field-read") {
        matches.push({ call: source, relations: current.relations });
        continue;
      }
      if (!isExactSourceCarrierRelation(source, target, relation) || current.relations.length >= 24) continue;
      queue.push({ ids: [...current.ids, relation.to], relations: [...current.relations, relation] });
    }
  }
  const unique = new Map(matches.map((item) => [item.relations.map((relation) => relation.id).join("\0"), item]));
  return [...unique.values()];
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

function augmentSlice(index: RouteTotalityFieldProofIndex, cancellation: AnalysisCancellationToken): void {
  const slice = index.slice;
  const elements = new Map(slice.elements.map((item) => [item.id, item]));
  const relations = new Map(slice.relations.map((item) => [item.id, item]));
  for (const element of index.materializedElements()) elements.set(element.id, element);
  for (const relation of index.materializedRelations()) relations.set(relation.id, relation);
  slice.elements = [...elements.values()].sort((left, right) => left.id.localeCompare(right.id));
  slice.relations = [...relations.values()].sort((left, right) => left.id.localeCompare(right.id));
  slice.coverage = coverageFor(slice.elements, slice.relations, slice.origins, slice.terminals, slice.gaps, slice.coverage.truncation, slice.coverage.direction, slice.coverage.budget.limit, slice.coverage.budget.used, slice.coverage.budget.exhausted);
  cancellation.throwIfCancelled();
}

function accessorDeclaration(ts: typeof TypeScript, find: TypeScript.CallExpression): TypeScript.VariableDeclaration | null {
  const arrow = find.parent;
  return ts.isArrowFunction(arrow) && arrow.body === find && ts.isVariableDeclaration(arrow.parent) && ts.isIdentifier(arrow.parent.name) ? arrow.parent : null;
}

function directReturnedExpression(ts: typeof TypeScript, callback: TypeScript.ArrowFunction): TypeScript.Expression | null {
  if (!ts.isBlock(callback.body)) return callback.body;
  const returns = callback.body.statements.filter((item): item is TypeScript.ReturnStatement => ts.isReturnStatement(item) && Boolean(item.expression));
  return returns.length === 1 ? returns[0].expression ?? null : null;
}

function parameterPropertyReads(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Expression, parameter: TypeScript.Symbol): TypeScript.PropertyAccessExpression[] {
  const values: TypeScript.PropertyAccessExpression[] = [];
  visit(ts, expression, (node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && checker.getSymbolAtLocation(node.expression) === parameter) values.push(node);
  });
  return values;
}

function uniqueShowUse(ts: typeof TypeScript, checker: TypeScript.TypeChecker, file: TypeScript.SourceFile, accessor: TypeScript.Symbol | undefined) {
  const values: Array<{ opening: TypeScript.JsxOpeningLikeElement; when: TypeScript.CallExpression; render: TypeScript.ArrowFunction; parameter: TypeScript.Symbol }> = [];
  visit(ts, file, (node) => {
    if (!ts.isJsxElement(node) || !isSolidShow(ts, checker, node.openingElement)) return;
    const attributes = node.openingElement.attributes.properties.filter((item): item is TypeScript.JsxAttribute => ts.isJsxAttribute(item) && ts.isIdentifier(item.name) && item.name.text === "when");
    const initializer = attributes.length === 1 ? attributes[0].initializer : null;
    const expression = initializer && ts.isJsxExpression(initializer) ? initializer.expression : null;
    const renders = node.children.flatMap((child) => ts.isJsxExpression(child) && child.expression && ts.isArrowFunction(child.expression) ? [child] : []);
    if (!expression || !ts.isCallExpression(expression) || checker.getSymbolAtLocation(expression.expression) !== accessor || renders.length !== 1) return;
    const render = renders[0].expression as TypeScript.ArrowFunction;
    if (render.parameters.length !== 1 || !ts.isIdentifier(render.parameters[0].name)) return;
    const parameter = checker.getSymbolAtLocation(render.parameters[0].name);
    if (parameter) values.push({ opening: node.openingElement, when: expression, render, parameter });
  });
  return values.length === 1 ? values[0] : null;
}

function exactPageHeaderConsumer(ts: typeof TypeScript, checker: TypeScript.TypeChecker, render: TypeScript.ArrowFunction, parameter: TypeScript.Symbol) {
  const values: Array<{ call: TypeScript.CallExpression; access: TypeScript.PropertyAccessExpression; opening: TypeScript.JsxOpeningLikeElement; attribute: TypeScript.JsxAttribute; value: TypeScript.Expression }> = [];
  visit(ts, render.body, (node) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxElement(node)) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (!resolvesPageHeader(ts, checker, opening.tagName)) return;
    const attributes = opening.attributes.properties.filter((item): item is TypeScript.JsxAttribute => ts.isJsxAttribute(item) && ts.isIdentifier(item.name) && item.name.text === "title");
    const initializer = attributes.length === 1 ? attributes[0].initializer : null;
    const value = initializer && ts.isJsxExpression(initializer) ? initializer.expression : null;
    if (!value) return;
    visit(ts, value, (child) => {
      if (!ts.isPropertyAccessExpression(child) || !ts.isCallExpression(child.expression) || checker.getSymbolAtLocation(child.expression.expression) !== parameter) return;
      values.push({ call: child.expression, access: child, opening, attribute: attributes[0], value });
    });
  });
  return values.length === 1 ? values[0] : null;
}

function resolvesArrayFind(checker: TypeScript.TypeChecker, name: TypeScript.Identifier): boolean {
  return Boolean(checker.getSymbolAtLocation(name)?.declarations?.some((decl) => decl.getSourceFile().isDeclarationFile && /lib\.es\d+\.core\.d\.ts$/.test(decl.getSourceFile().fileName)));
}

function isSolidShow(ts: typeof TypeScript, checker: TypeScript.TypeChecker, opening: TypeScript.JsxOpeningLikeElement): boolean {
  const symbol = checker.getSymbolAtLocation(opening.tagName);
  const target = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return Boolean(target?.getName() === "Show" && target.declarations?.some((decl) => decl.getSourceFile().fileName.includes("/solid-js/")));
}

function resolvesPageHeader(ts: typeof TypeScript, checker: TypeScript.TypeChecker, tag: TypeScript.JsxTagNameExpression): boolean {
  const symbol = checker.getSymbolAtLocation(tag);
  const target = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declarations = target?.declarations ?? [];
  return target?.getName() === "PageHeader" && declarations.length === 1 && !declarations[0].getSourceFile().isDeclarationFile;
}

function elementKindForExpression(ts: typeof TypeScript, expression: TypeScript.Expression): string {
  if (ts.isCallExpression(expression)) return "call";
  if (ts.isPropertyAccessExpression(expression)) return "field-read";
  if (ts.isIdentifier(expression)) return "value";
  if (ts.isConditionalExpression(expression) || ts.isBinaryExpression(expression)) return "selection";
  return "literal";
}

function one<T>(values: readonly T[]): T | null { return values.length === 1 ? values[0] : null; }
function sourceOrder(left: TypeScript.Node, right: TypeScript.Node): number { return left.getSourceFile().fileName.localeCompare(right.getSourceFile().fileName) || left.getStart() - right.getStart(); }
function sameLocation(left: ProgramElement["location"], right: NonNullable<FieldProofInput["selectedSource"]["evidence"]>): boolean { return left.file === right.file && left.line === right.line && left.column === right.column && JSON.stringify(left.span) === JSON.stringify(right.span); }
function visit(ts: typeof TypeScript, node: TypeScript.Node, callback: (node: TypeScript.Node) => void): void { callback(node); ts.forEachChild(node, (child) => visit(ts, child, callback)); }
