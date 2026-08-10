import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import { exactCallbackReturnExpression } from "./program-callback-return";
import {
  accessorDeclaration,
  elementKindForExpression,
  parameterPropertyReads,
  resolvesArrayFind,
  sourceOrder,
  visitTypeScript,
} from "./route-totality-field-proof-ast";
import { componentConsumers, uniqueShowUse } from "./route-totality-field-proof-component";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import type { FieldProofTargetSelector } from "./route-totality-field-proof-policy";
import type { ProgramElement } from "./scope-seam";

export type FieldProofCandidate = {
  findCall: TypeScript.CallExpression;
  snapshotCall: ProgramElement;
  collectionField: ProgramElement;
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
  consumerField: ProgramElement;
  consumerValue: ProgramElement;
  binding: ProgramElement;
  occurrence: ProgramElement;
  definition: ProgramElement;
  renderTerminal: ProgramElement;
};

export function discoverFieldProofCandidates(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  index: RouteTotalityFieldProofIndex,
  target: FieldProofTargetSelector,
  cancellation: AnalysisCancellationToken,
): FieldProofCandidate[] {
  const checker = program.getTypeChecker();
  const candidates: FieldProofCandidate[] = [];
  for (const file of [...program.getSourceFiles()].sort((left, right) => left.fileName.localeCompare(right.fileName))) {
    cancellation.throwIfCancelled();
    if (file.isDeclarationFile) continue;
    visitTypeScript(ts, file, (node) => {
      if (!ts.isCallExpression(node)) return;
      candidates.push(...candidatesForFind(ts, checker, root, index, target, node, cancellation));
    });
  }
  return [...new Map(candidates.map((candidate) => [`${candidate.findResult.id}\0${candidate.binding.id}`, candidate])).values()]
    .sort((left, right) => sourceOrder(left.findCall, right.findCall)
      || left.binding.id.localeCompare(right.binding.id));
}

function candidatesForFind(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  index: RouteTotalityFieldProofIndex,
  target: FieldProofTargetSelector,
  findCall: TypeScript.CallExpression,
  cancellation: AnalysisCancellationToken,
): FieldProofCandidate[] {
  if (!ts.isPropertyAccessExpression(findCall.expression) || !ts.isIdentifier(findCall.expression.name)
    || !resolvesArrayFind(checker, findCall.expression.name) || findCall.arguments.length !== 1
    || !ts.isArrowFunction(findCall.arguments[0])) return [];
  const collectionAccess = findCall.expression.expression;
  if (!ts.isPropertyAccessExpression(collectionAccess) || !ts.isCallExpression(collectionAccess.expression)) return [];
  const callback = findCall.arguments[0];
  if (callback.parameters.length !== 1 || !ts.isIdentifier(callback.parameters[0].name)
    || callback.parameters[0].dotDotDotToken || callback.parameters[0].questionToken
    || callback.parameters[0].initializer) return [];
  const returned = exactCallbackReturnExpression(ts, callback);
  const parameterSymbol = checker.getSymbolAtLocation(callback.parameters[0].name);
  if (!returned || !parameterSymbol) return [];
  const predicateReads = parameterPropertyReads(ts, checker, returned, parameterSymbol);
  if (predicateReads.length !== 1) return [];
  const declaration = accessorDeclaration(ts, findCall);
  if (!declaration) return [];
  const accessorSymbol = checker.getSymbolAtLocation(declaration.name);
  const showUse = uniqueShowUse(ts, checker, declaration.getSourceFile(), accessorSymbol);
  if (!showUse) return [];
  const baseValues = {
    snapshotCall: index.element(collectionAccess.expression, "call"),
    collectionField: index.element(collectionAccess, "field-read"),
    collectionElement: index.element(collectionAccess, "collection-element"),
    parameter: index.element(callback.parameters[0].name, "parameter"),
    parameterValue: index.element(predicateReads[0].expression, "value"),
    predicateField: index.element(predicateReads[0], "field-read"),
    predicateResult: index.element(returned, "predicate-result"),
    findResult: index.element(findCall, "call-result"),
    returnExpression: index.element(findCall, "return-expression"),
    accessorCall: index.element(showUse.when, "call"),
    showBinding: index.element(showUse.opening, "show-binding"),
    currentParameter: index.element(showUse.render.parameters[0].name, "parameter"),
    renderTerminal: index.element(showUse.render, "render-terminal"),
  };
  if (Object.values(baseValues).some((value) => value === null)
    || baseValues.collectionField?.fieldName !== target.collectionFieldName
    || baseValues.predicateField?.fieldName !== target.predicateFieldName) return [];
  return componentConsumers(ts, checker, root, showUse.render, showUse.parameter).flatMap((consumer) => {
    const values = {
      ...baseValues,
      currentCall: index.element(consumer.call, "call"),
      consumerField: index.element(consumer.access, "field-read"),
      consumerValue: index.element(consumer.value, elementKindForExpression(ts, consumer.value)),
      binding: index.element(consumer.attribute, "component-prop-binding"),
      occurrence: index.element(consumer.opening, "component-occurrence"),
    };
    if (Object.values(values).some((value) => value === null)
      || values.consumerField?.fieldName !== target.consumerFieldName
      || consumer.componentName !== target.componentName || consumer.propName !== target.propName) return [];
    const occurrence = values.occurrence!;
    const binding = values.binding!;
    if (!occurrence.symbol || binding.componentBinding?.propName !== consumer.propName
      || binding.componentBinding.componentOccurrenceElementId !== occurrence.id) return [];
    const definitionId = binding.componentBinding.componentDefinitionId;
    const definition = definitionId ? index.byId(definitionId) : null;
    if (!definition || definition.kind !== "component-definition" || definition.symbol !== occurrence.symbol) return [];
    cancellation.throwIfCancelled();
    return [{
      findCall,
      ...values as Omit<FieldProofCandidate, "findCall" | "definition">,
      definition,
    }];
  });
}
