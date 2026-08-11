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
import { fieldProofTargetKey, type FieldProofTargetSelector } from "./route-totality-field-proof-policy";
import { compilerSymbolId, importModule } from "./program-evidence-support";
import { resolveHandlerAction, type ResolvedHandlerAction } from "./program-evidence-handler-resolution";
import type { ProgramElement } from "./scope-seam";

export type FieldProofCandidate = {
  targetKey: string;
  componentIdentity: string | null;
  ownerIdentity: string | null;
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
  return [...new Map(candidates.map((candidate) => [fullCandidateProofKey(candidate), candidate])).values()]
    .sort((left, right) => sourceOrder(left.findCall, right.findCall)
      || left.binding.id.localeCompare(right.binding.id));
}

function fullCandidateProofKey(candidate: FieldProofCandidate): string {
  return [
    candidate.targetKey,
    candidate.snapshotCall.id,
    candidate.collectionField.id,
    candidate.collectionElement.id,
    candidate.parameter.id,
    candidate.parameterValue.id,
    candidate.predicateField.id,
    candidate.predicateResult.id,
    candidate.findResult.id,
    candidate.returnExpression.id,
    candidate.accessorCall.id,
    candidate.showBinding.id,
    candidate.currentParameter.id,
    candidate.currentCall.id,
    candidate.consumerField.id,
    candidate.consumerValue.id,
    candidate.binding.id,
    candidate.occurrence.id,
    candidate.definition.id,
    candidate.renderTerminal.id,
    candidate.boundary?.binding.id ?? "",
    candidate.boundary?.receiver?.id ?? "",
    candidate.sourceField?.id ?? "",
  ].join("\0");
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
        componentIdentity: compilerIdentityForNode(ts, checker, consumer.opening.tagName),
        ownerIdentity: enclosingOwnerIdentity(ts, checker, showUse.render),
        tagModule: importModule(ts, checker, consumer.opening.tagName),
        propName: consumer.propName,
        kind: consumer.kind,
        direct: false,
        boundary: null,
        sourceField: null,
        evidenceLabel: typeof binding?.attributes?.label === "string" ? binding.attributes.label : null,
        terminal: null,
      };
    }),
    ...directConsumers(ts, checker, root, index, showUse.render, showUse.parameter),
    ...componentBoundaryConsumersForTarget(ts, checker, root, index, showUse.render, target),
  ];
  return consumers.flatMap((consumer) => {
    if (!matchesTarget(consumer, target)) return [];
    const consumerField = index.element(consumer.access, "field-read");
    if (!consumerField || consumerField.fieldName !== target.consumerFieldName) return [];
    const currentCall = index.element(consumer.call, "call");
    if (!currentCall) return [];
    const common = {
      targetKey: fieldProofTargetKey(target),
      ...baseValues,
      currentCall,
      componentIdentity: consumer.componentIdentity,
      ownerIdentity: consumer.ownerIdentity,
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
      renderTerminal: consumer.terminal ?? baseValues.renderTerminal,
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
  componentIdentity: string | null;
  ownerIdentity: string | null;
  tagModule: string | null;
  propName: string | null;
  kind: "render" | "condition" | "handler";
  direct: boolean;
  boundary: ExactComponentBoundary | null;
  sourceField: ProgramElement | null;
  evidenceLabel: string | null;
  terminal: ProgramElement | null;
};

function directConsumers(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
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
      const reads = currentPropertyReads(ts, checker, value, parameter);
      for (const access of reads) {
        if (!ts.isCallExpression(access.expression)) continue;
        const fieldConsumer = index.element(access, "field-consumer");
        const recordedKind = fieldConsumer?.attributes?.consumerKind;
        const kind = recordedKind === "condition" || recordedKind === "handler" || recordedKind === "render"
          ? recordedKind
          : tagName === "Show" && attribute.name.text === "when"
          ? "condition"
          : /^on[A-Z]/.test(attribute.name.text) ? "handler" : "render";
        if (kind === "render" && tagName !== "A" && !fieldConsumer) continue;
        const handler = kind === "handler" ? resolveHandlerAction(ts, checker, root, access, value) : null;
        const valueElement = index.element(value, elementKindForExpression(ts, value)) ?? index.element(value, "literal");
        const owner = fieldConsumer?.ownerId ? index.byId(fieldConsumer.ownerId) : null;
        if (!fieldConsumer || !owner
          || fieldConsumer.symbol !== compilerSymbolId(ts, checker, root, opening.tagName)
          || kind === "handler" && (!handler || !handlerIdentityMatches(fieldConsumer, handler))) continue;
        values.push({
          access,
          call: access.expression,
          value,
          valueElement,
          binding: fieldConsumer,
          occurrence: owner,
          definition: owner,
          componentName: tagName,
          componentIdentity: compilerIdentityForNode(ts, checker, opening.tagName),
          ownerIdentity: enclosingOwnerIdentity(ts, checker, render),
          tagModule: importModule(ts, checker, opening.tagName),
          propName: attribute.name.text,
          kind,
          direct: true,
          boundary: null,
          sourceField: null,
          evidenceLabel: typeof fieldConsumer?.attributes?.label === "string" ? fieldConsumer.attributes.label : null,
          terminal: null,
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
    const attributes = opening.attributes.properties.filter((item): item is TypeScript.JsxAttribute => (
      ts.isJsxAttribute(item) && ts.isIdentifier(item.name) && item.name.text === target.componentPropName
    ));
    if (attributes.length !== 1) return;
    const attribute = attributes[0];
    const bindings = index.elements(attribute, "component-prop-binding");
    for (const binding of bindings) {
      const boundary = resolveExactComponentBoundary(ts, checker, root, index, opening, attribute, binding);
      if (!boundary || boundary.mode !== target.chain) continue;
      const resolvedConsumers = componentBoundaryConsumers(ts, checker, root, index, boundary);
      for (const consumer of resolvedConsumers) {
        if (consumer.kind !== target.consumer.kind || consumer.fieldElement.fieldName !== target.consumerFieldName) continue;
        const fieldConsumer = index.element(consumer.field, "field-consumer");
        if (!fieldConsumer || target.consumer.directConsumer !== true) continue;
        if (target.consumer.tagName && !consumerTagMatches(ts, checker, root, index, consumer.field, target.consumer.tagName, target.consumer.tagModule, fieldConsumer)) continue;
        if (target.consumer.propName && !consumerPropMatches(ts, consumer.field, target.consumer.propName)) continue;
        const sourceField = boundary.mode === "scalar-alias" ? index.element(boundary.value, "field-read") : null;
        const receiver = consumerReceiver(ts, index, consumer, boundary.mode);
        if (!receiver || receiver.id !== boundary.receiver?.id) continue;
        if (!consumer.valueElement || boundary.mode === "scalar-alias" && !sourceField) continue;
        const handler = consumer.kind === "handler" ? resolveHandlerAction(ts, checker, root, consumer.field, consumer.field) : null;
        if (consumer.kind === "handler" && (!handler || !handlerIdentityMatches(fieldConsumer, handler))) continue;
        values.push({
          access: consumer.field,
          call: ts.isCallExpression(boundary.value)
            ? boundary.value
            : ts.isPropertyAccessExpression(boundary.value) && ts.isCallExpression(boundary.value.expression)
              ? boundary.value.expression
              : boundary.value as TypeScript.CallExpression,
          value: consumer.field,
          valueElement: consumer.valueElement,
          binding: fieldConsumer,
          occurrence: boundary.definition,
          definition: boundary.definition,
          componentName: consumerTagName(ts, consumer.field),
          componentIdentity: boundary.componentIdentity,
          ownerIdentity: boundary.componentIdentity,
          tagModule: target.consumer.tagModule ?? null,
          propName: consumerPropName(ts, consumer.field),
          kind: consumer.kind,
          direct: true,
          boundary,
          sourceField,
          evidenceLabel: consumer.label,
          terminal: index.fieldConsumerTerminal(fieldConsumer.id),
        });
      }
    }
  });
  return values;
}

function consumerReceiver(
  ts: typeof TypeScript,
  index: RouteTotalityFieldProofIndex,
  consumer: { field: TypeScript.PropertyAccessExpression; fieldElement: ProgramElement },
  mode: "whole-object" | "scalar-alias",
): ProgramElement | null {
  if (mode === "scalar-alias") return consumer.fieldElement;
  return ts.isPropertyAccessExpression(consumer.field.expression)
    ? index.element(consumer.field.expression, "field-read")
    : null;
}

function consumerPropMatches(
  ts: typeof TypeScript,
  field: TypeScript.PropertyAccessExpression,
  propName: string,
): boolean {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxAttribute(current)) return ts.isIdentifier(current.name) && current.name.text === propName;
    if (ts.isFunctionLike(current)) return false;
  }
  return false;
}

function consumerPropName(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): string | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxAttribute(current)) return ts.isIdentifier(current.name) ? current.name.text : null;
    if (ts.isFunctionLike(current)) return null;
  }
  return null;
}

function consumerTagName(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): string | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxAttribute(current)) {
      const opening = current.parent.parent;
      return opening && (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening))
        ? opening.tagName.getText(opening.getSourceFile())
        : null;
    }
    if (ts.isJsxElement(current)) return current.openingElement.tagName.getText(current.getSourceFile());
    if (ts.isFunctionLike(current)) return null;
  }
  return null;
}

function consumerTagMatches(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  _index: RouteTotalityFieldProofIndex,
  field: TypeScript.PropertyAccessExpression,
  tagName: string,
  tagModule: string | undefined,
  consumer: ProgramElement,
): boolean {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxAttribute(current)) {
      const opening = current.parent.parent;
      if (!opening || (!ts.isJsxOpeningElement(opening) && !ts.isJsxSelfClosingElement(opening))) return false;
      return opening.tagName.getText(opening.getSourceFile()) === tagName
        && consumer.symbol === compilerSymbolId(ts, checker, root, opening.tagName)
        && (!tagModule || importModule(ts, checker, opening.tagName) === tagModule);
    }
    if (ts.isJsxElement(current)) {
      const opening = current.openingElement;
      return opening.tagName.getText(opening.getSourceFile()) === tagName
        && consumer.symbol === compilerSymbolId(ts, checker, root, opening.tagName);
    }
    if (ts.isFunctionLike(current)) return false;
  }
  return false;
}

function compilerIdentityForNode(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): string | null {
  const symbol = checker.getSymbolAtLocation(node);
  const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return resolved ? checker.getFullyQualifiedName(resolved) : null;
}

function enclosingOwnerIdentity(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  render: TypeScript.ArrowFunction,
): string | null {
  let current: TypeScript.Node | undefined = render.parent;
  while (current) {
    if (ts.isFunctionLike(current) && current !== render) {
      const name = "name" in current && current.name && ts.isIdentifier(current.name) ? current.name : null;
      const variable = current.parent && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)
        ? current.parent.name
        : null;
      const symbol = name ? checker.getSymbolAtLocation(name) : variable ? checker.getSymbolAtLocation(variable) : undefined;
      if (symbol) {
        const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        return checker.getFullyQualifiedName(resolved);
      }
    }
    current = current.parent;
  }
  return null;
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
    if (consumer.propName !== selector.propName) return false;
  } else if (selector.propName && consumer.propName !== selector.propName) return false;
  if (selector.tagName && consumer.componentName !== selector.tagName) return false;
  if (selector.tagModule && (!target.chain || target.chain === "direct") && consumer.tagModule !== selector.tagModule) return false;
  if (consumer.direct) {
    const attrs = consumer.binding?.attributes ?? {};
    if (selector.actionName !== undefined && attrs.actionName !== selector.actionName) return false;
    if (selector.argumentName !== undefined && attrs.argumentName !== selector.argumentName) return false;
    if (selector.handlerReceiverName !== undefined && attrs.handlerReceiverName !== selector.handlerReceiverName) return false;
    if (selector.conditionOperator !== undefined && attrs.conditionOperator !== selector.conditionOperator) return false;
    if (selector.conditionLiteral !== undefined && attrs.conditionLiteral !== selector.conditionLiteral) return false;
    if (selector.nestedShow !== undefined && attrs.nestedShow !== selector.nestedShow) return false;
    if (selector.collectionName !== undefined && attrs.consumerCollection !== selector.collectionName) return false;
  }
  return true;
}

function handlerIdentityMatches(consumer: ProgramElement, action: ResolvedHandlerAction): boolean {
  const attributes = consumer.attributes ?? {};
  return typeof attributes.handlerReceiverName === "string"
    && typeof attributes.handlerPayloadObject === "string"
    && typeof attributes.handlerReceiverSymbol === "string"
    && typeof attributes.handlerMethodSymbol === "string"
    && typeof attributes.handlerCalleeSymbol === "string"
    && typeof attributes.handlerActionArgumentSymbol === "string"
    && attributes.handlerReceiverName === action.receiverName
    && attributes.handlerPayloadObject === action.payloadObjectIdentity
    && attributes.handlerReceiverSymbol === action.receiverSymbolId
    && attributes.handlerMethodSymbol === action.methodSymbolId
    && attributes.handlerCalleeSymbol === action.calleeSymbolId
    && attributes.handlerActionArgumentSymbol === action.actionArgumentSymbolId
    && sameOptionalIdentity(attributes.handlerForwardedParameterSymbol, action.forwardedParameterSymbolId);
}

function sameOptionalIdentity(actual: string | number | boolean | null | undefined, expected: string | null): boolean {
  return expected === null ? actual === null || actual === undefined : actual === expected;
}
