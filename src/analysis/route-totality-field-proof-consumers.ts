import type * as TypeScript from "typescript";
import { visitTypeScript, elementKindForExpression } from "./route-totality-field-proof-ast";
import {
  componentBoundaryConsumers,
  resolveExactComponentBoundary,
  type ExactComponentBoundary,
} from "./route-totality-field-proof-component-boundary";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { compilerSymbolId, importModule } from "./program-evidence-support";
import { resolveHandlerAction, type ResolvedHandlerAction } from "./program-evidence-handler-resolution";
import type { FieldProofTargetSelector } from "./route-totality-field-proof-policy";
import type { ProgramElement } from "./scope-seam";

export type CandidateConsumer = {
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

export function directConsumers(
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
          evidenceLabel: typeof fieldConsumer.attributes?.label === "string" ? fieldConsumer.attributes.label : null,
          terminal: null,
        });
      }
    }
  });
  return values;
}

export function componentBoundaryConsumersForTarget(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  index: RouteTotalityFieldProofIndex,
  render: TypeScript.ArrowFunction,
  target: FieldProofTargetSelector | undefined,
): CandidateConsumer[] {
  if (target && (!target.chain || target.chain === "direct" || !target.componentName || !target.componentPropName)) return [];
  const values: CandidateConsumer[] = [];
  visitTypeScript(ts, render.body, (node) => {
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (target && opening.tagName.getText(opening.getSourceFile()) !== target.componentName) return;
    const attributes = opening.attributes.properties.filter((item): item is TypeScript.JsxAttribute => (
      ts.isJsxAttribute(item) && ts.isIdentifier(item.name)
        && (!target || item.name.text === target.componentPropName)
    ));
    if (attributes.length === 0) return;
    for (const attribute of attributes) {
      const bindings = index.elements(attribute, "component-prop-binding");
      for (const binding of bindings) {
        const boundary = resolveExactComponentBoundary(ts, checker, root, index, opening, attribute, binding);
        if (!boundary || target && boundary.mode !== target.chain) continue;
        const resolvedConsumers = componentBoundaryConsumers(ts, checker, root, index, boundary);
        for (const consumer of resolvedConsumers) {
          if (target && (consumer.kind !== target.consumer.kind || consumer.fieldElement.fieldName !== target.consumerFieldName)) continue;
          const fieldConsumer = index.element(consumer.field, "field-consumer");
          if (!fieldConsumer || target?.consumer.directConsumer === false) continue;
          if (target?.consumer.tagName && !consumerTagMatches(ts, checker, root, consumer.field, target.consumer.tagName, target.consumer.tagModule, fieldConsumer)) continue;
          if (target?.consumer.propName && !consumerPropMatches(ts, consumer.field, target.consumer.propName)) continue;
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
            tagModule: target?.consumer.tagModule ?? consumerTagModule(ts, checker, consumer.field),
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

function consumerPropMatches(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression, propName: string): boolean {
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

function consumerTagModule(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  field: TypeScript.PropertyAccessExpression,
): string | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxAttribute(current)) {
      const opening = current.parent.parent;
      return opening && (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening))
        ? importModule(ts, checker, opening.tagName)
        : null;
    }
    if (ts.isJsxElement(current)) return importModule(ts, checker, current.openingElement.tagName);
    if (ts.isJsxSelfClosingElement(current)) return importModule(ts, checker, current.tagName);
    if (ts.isFunctionLike(current)) return null;
  }
  return null;
}

export function compilerIdentityForNode(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node): string | null {
  const symbol = checker.getSymbolAtLocation(node);
  const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return resolved ? checker.getFullyQualifiedName(resolved) : null;
}

export function enclosingOwnerIdentity(ts: typeof TypeScript, checker: TypeScript.TypeChecker, render: TypeScript.ArrowFunction): string | null {
  let current: TypeScript.Node | undefined = render.parent;
  while (current) {
    if (ts.isFunctionLike(current) && current !== render) {
      const name = "name" in current && current.name && ts.isIdentifier(current.name) ? current.name : null;
      const variable = current.parent && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)
        ? current.parent.name : null;
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
