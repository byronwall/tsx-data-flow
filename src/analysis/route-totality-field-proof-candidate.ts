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
import {
  componentBoundaryConsumers,
  resolveExactComponentBoundary,
  type ExactComponentBoundary,
} from "./route-totality-field-proof-component-boundary";
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
  directConsumer: boolean;
  consumerKind: "render" | "condition" | "handler";
  consumerLabel: string;
  boundary: ExactComponentBoundary | null;
  sourceField: ProgramElement | null;
  evidenceLabel?: string | null;
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
  return [...new Map(candidates.map((candidate) => [`${candidate.findResult.id}\0${candidate.binding.id}\0${candidate.consumerField.id}\0${candidate.consumerLabel}`, candidate])).values()]
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

  const consumers: CandidateConsumer[] = [
    ...componentConsumers(ts, checker, root, showUse.render, showUse.parameter).map((consumer) => {
      const binding = index.element(consumer.attribute, "component-prop-binding");
      const occurrence = index.element(consumer.opening, "component-occurrence");
      const definitionId = binding?.componentBinding?.componentDefinitionId ?? null;
      return {
        access: consumer.access,
        call: consumer.call,
        value: consumer.value,
        valueElement: index.element(consumer.value, elementKindForExpression(ts, consumer.value)),
        binding,
        occurrence,
        definition: definitionId ? index.byId(definitionId) : null,
        componentName: consumer.componentName,
        propName: consumer.propName,
        kind: consumer.kind,
        direct: false,
        boundary: null,
        sourceField: null,
        evidenceLabel: typeof binding?.attributes?.label === "string" ? binding.attributes.label : null,
      };
    }),
    ...directConsumers(ts, checker, index, showUse.render, showUse.parameter),
    ...componentBoundaryConsumersForTarget(ts, checker, root, index, showUse.render, target),
  ];
  return consumers.flatMap((consumer) => {
    if (!matchesTarget(consumer, target)) return [];
    const consumerField = index.element(consumer.access, "field-read");
    if (!consumerField || consumerField.fieldName !== target.consumerFieldName) return [];
    const currentCall = index.element(consumer.call, "call");
    if (!currentCall) return [];
    const common = {
      ...baseValues,
      currentCall,
      consumerField,
      consumerValue: consumer.valueElement,
      binding: consumer.binding,
      occurrence: consumer.occurrence,
      definition: consumer.definition,
      directConsumer: consumer.direct,
      consumerKind: target.consumer.kind,
      consumerLabel: target.consumer.label,
      boundary: consumer.boundary,
      sourceField: consumer.sourceField,
    };
    if (!common.consumerValue || !common.binding || !common.occurrence || !common.definition) {
      return [];
    }
    const occurrence = common.occurrence;
    const binding = common.binding;
    const definition = common.definition;
    if (consumer.direct) {
      if (occurrence.kind !== "component-definition") return [];
    } else {
      if (!occurrence.symbol || binding.componentBinding?.componentOccurrenceElementId !== occurrence.id) return [];
      const definitionId = binding.componentBinding?.componentDefinitionId;
      if (!definitionId || definition.id !== definitionId || definition.kind !== "component-definition") return [];
      if (definition.symbol !== occurrence.symbol) return [];
    }
    cancellation.throwIfCancelled();
    return [{ findCall, ...common } as FieldProofCandidate];
  });
}

type CandidateConsumer = {
  access: TypeScript.PropertyAccessExpression;
  call: TypeScript.CallExpression;
  value: TypeScript.Expression;
  valueElement: ProgramElement | null;
  binding: ProgramElement | null;
  occurrence: ProgramElement | null;
  definition: ProgramElement | null;
  componentName: string | null;
  propName: string | null;
  kind: "render" | "condition" | "handler";
  direct: boolean;
  boundary: ExactComponentBoundary | null;
  sourceField: ProgramElement | null;
  evidenceLabel: string | null;
};

function directConsumers(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  index: RouteTotalityFieldProofIndex,
  render: TypeScript.ArrowFunction,
  parameter: TypeScript.Symbol,
): CandidateConsumer[] {
  const values: CandidateConsumer[] = [];
  visitTypeScript(ts, render.body, (node) => {
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tagName = opening.tagName.getText(opening.getSourceFile());
    for (const attribute of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
      const initializer = attribute.initializer;
      const value = initializer && ts.isJsxExpression(initializer) ? initializer.expression : null;
      if (!value) continue;
      const fieldConsumer = index.element(value, "field-consumer");
      const recordedKind = fieldConsumer?.attributes?.consumerKind;
      const kind = recordedKind === "condition" || recordedKind === "handler" || recordedKind === "render"
        ? recordedKind
        : tagName === "Show" && attribute.name.text === "when"
        ? "condition"
        : /^on[A-Z]/.test(attribute.name.text) ? "handler" : "render";
      if (kind === "render" && tagName !== "A" && !fieldConsumer) continue;
      const reads = currentPropertyReads(ts, checker, value, parameter);
      for (const access of reads) {
        if (!ts.isCallExpression(access.expression)) continue;
        const valueElement = index.element(value, elementKindForExpression(ts, value)) ?? index.element(value, "literal");
        const owner = fieldConsumer?.ownerId ? index.byId(fieldConsumer.ownerId) : null;
        if (!fieldConsumer || !owner) continue;
        values.push({
          access,
          call: access.expression,
          value,
          valueElement,
          binding: fieldConsumer,
          occurrence: owner,
          definition: owner,
          componentName: tagName,
          propName: attribute.name.text,
          kind,
          direct: true,
          boundary: null,
          sourceField: null,
          evidenceLabel: typeof fieldConsumer?.attributes?.label === "string" ? fieldConsumer.attributes.label : null,
        });
      }
    }
  });
  return values;
}

function componentBoundaryConsumersForTarget(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  index: RouteTotalityFieldProofIndex,
  render: TypeScript.ArrowFunction,
  target: FieldProofTargetSelector,
): CandidateConsumer[] {
  if (!target.chain || target.chain === "direct" || !target.componentName || !target.componentPropName) return [];
  const values: CandidateConsumer[] = [];
  visitTypeScript(ts, render.body, (node) => {
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (opening.tagName.getText(opening.getSourceFile()) !== target.componentName) return;
    const attribute = opening.attributes.properties.find((item): item is TypeScript.JsxAttribute => (
      ts.isJsxAttribute(item) && ts.isIdentifier(item.name) && item.name.text === target.componentPropName
    ));
    if (!attribute) return;
    const boundary = resolveExactComponentBoundary(ts, checker, root, index, opening, attribute);
    if (!boundary || boundary.mode !== target.chain) return;
    const resolvedConsumers = componentBoundaryConsumers(ts, checker, index, boundary);
    for (const consumer of resolvedConsumers) {
      if (consumer.kind !== target.consumer.kind || consumer.fieldElement.fieldName !== target.consumerFieldName) continue;
      const tagName = consumer.label.includes(".") ? consumer.label.split(".", 1)[0] : consumer.label.split(" ", 1)[0];
      const fieldConsumer = index.element(consumer.field, "field-consumer");
      const direct = Boolean(fieldConsumer);
      if (direct !== target.consumer.directConsumer) continue;
      if (target.consumer.tagName && tagName !== target.consumer.tagName) continue;
      if (target.consumer.propName && !consumer.label.startsWith(`${tagName}.${target.consumer.propName}`)) continue;
      const sourceField = boundary.mode === "scalar-alias" ? index.element(boundary.value, "field-read") : null;
      const receiver = boundary.receiver ?? (boundary.mode === "scalar-alias"
        ? consumer.fieldElement
        : ts.isPropertyAccessExpression(consumer.field.expression)
          ? index.element(consumer.field.expression, "field-read")
          : null);
      if (!consumer.valueElement || boundary.mode === "scalar-alias" && !sourceField) continue;
      const candidateBoundary = receiver ? { ...boundary, receiver } : boundary;
      values.push({
        access: consumer.field,
        call: ts.isCallExpression(boundary.value)
          ? boundary.value
          : ts.isPropertyAccessExpression(boundary.value) && ts.isCallExpression(boundary.value.expression)
            ? boundary.value.expression
            : boundary.value as TypeScript.CallExpression,
        value: consumer.field,
        valueElement: consumer.valueElement,
        binding: fieldConsumer ?? boundary.binding,
        occurrence: fieldConsumer ? boundary.definition : boundary.occurrence,
        definition: boundary.definition,
        componentName: tagName,
        propName: boundary.propName,
        kind: consumer.kind,
        direct,
        boundary: candidateBoundary,
        sourceField,
        evidenceLabel: consumer.label,
      });
    }
  });
  return values;
}

function currentPropertyReads(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Expression,
  parameter: TypeScript.Symbol,
): TypeScript.PropertyAccessExpression[] {
  const values: TypeScript.PropertyAccessExpression[] = [];
  visitTypeScript(ts, expression, (node) => {
    if (!ts.isPropertyAccessExpression(node) || node.questionDotToken
      || !ts.isCallExpression(node.expression) || checker.getSymbolAtLocation(node.expression.expression) !== parameter) return;
    values.push(node);
  });
  return values;
}

function matchesTarget(consumer: CandidateConsumer, target: FieldProofTargetSelector): boolean {
  const selector = target.consumer;
  if (consumer.kind !== selector.kind) return false;
  if (consumer.direct !== selector.directConsumer) return false;
  if (selector.componentName && (target.chain && target.chain !== "direct"
    ? consumer.boundary?.componentName !== selector.componentName
    : consumer.componentName !== selector.componentName)) return false;
  if (selector.propName && target.chain && target.chain !== "direct") {
    const actualTag = consumer.evidenceLabel?.includes(".") ? consumer.evidenceLabel.split(".", 1)[0] : null;
    if (!consumer.evidenceLabel?.startsWith(`${actualTag}.${selector.propName}`)) return false;
  } else if (selector.propName && consumer.propName !== selector.propName) return false;
  if (selector.tagName && consumer.componentName !== selector.tagName) return false;
  if (target.chain === "scalar-alias" && selector.kind === "condition" && selector.label
    && consumer.evidenceLabel !== selector.label) return false;
  if (target.chain === "scalar-alias" && selector.propName && selector.kind === "render") {
    const actualTag = consumer.evidenceLabel?.includes(".") ? consumer.evidenceLabel.split(".", 1)[0] : null;
    if (!consumer.evidenceLabel?.startsWith(`${actualTag}.${selector.propName}`)) return false;
  }
  if (consumer.direct) {
    const attrs = consumer.binding?.attributes ?? {};
    if (selector.actionName !== undefined && attrs.actionName !== selector.actionName) return false;
    if (selector.argumentName !== undefined && attrs.argumentName !== selector.argumentName) return false;
    if (selector.conditionOperator !== undefined && attrs.conditionOperator !== selector.conditionOperator) return false;
    if (selector.conditionLiteral !== undefined && attrs.conditionLiteral !== selector.conditionLiteral) return false;
    if (selector.nestedShow !== undefined && attrs.nestedShow !== selector.nestedShow) return false;
  }
  return true;
}
