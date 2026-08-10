import path from "node:path";
import type * as TypeScript from "typescript";
import type { ComponentBindingMetadata } from "./program-component-binding-metadata";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { elementKindForExpression, visitTypeScript } from "./route-totality-field-proof-ast";
import { asFunctionLike } from "./program-evidence-support";
import type { ProgramElement } from "./scope-seam";

export type ComponentBoundaryMode = "whole-object" | "scalar-alias";

export type ExactComponentBoundary = {
  opening: TypeScript.JsxOpeningLikeElement;
  attribute: TypeScript.JsxAttribute;
  value: TypeScript.Expression;
  occurrence: ProgramElement;
  binding: ProgramElement;
  definition: ProgramElement;
  receiver: ProgramElement;
  mode: ComponentBoundaryMode;
  sourceFieldName: string | null;
  propName: string;
  componentName: string;
  target: TypeScript.FunctionLikeDeclaration;
};

export type ComponentBoundaryConsumerKind = "render" | "condition" | "handler";

export type ExactComponentBoundaryConsumer = {
  field: TypeScript.PropertyAccessExpression;
  fieldElement: ProgramElement;
  valueElement: ProgramElement;
  terminal: ProgramElement | null;
  kind: ComponentBoundaryConsumerKind;
  label: string;
  locationNode: TypeScript.Node;
};

/** Resolve one JSX call site and its occurrence-owned component receiver. */
export function resolveExactComponentBoundary(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  index: RouteTotalityFieldProofIndex,
  opening: TypeScript.JsxOpeningLikeElement,
  attribute: TypeScript.JsxAttribute,
): ExactComponentBoundary | null {
  const tagSymbol = resolveAliasedSymbol(ts, checker, opening.tagName);
  const declaration = oneSourceDeclaration(root, tagSymbol);
  const value = jsxValue(ts, attribute);
  const target = declaration ? asFunctionLike(ts, declaration) : null;
  if (!target || !value) return null;
  const occurrence = index.element(opening, "component-occurrence");
  const binding = index.element(attribute, "component-prop-binding");
  if (!occurrence || !binding) return null;
  const metadata = binding.componentBinding;
  const definition = metadata?.componentDefinitionId ? index.byId(metadata.componentDefinitionId) : null;
  if (!metadata || metadata.componentOccurrenceElementId !== occurrence.id
    || metadata.componentDefinitionId !== declarationElementId(index, metadata)
    || metadata.candidateCount !== 1 || metadata.propName === null
    || metadata.parameterElementId === null || metadata.receiverElementId === null
    || !definition || definition.kind !== "component-definition"
    || !occurrence.symbol || occurrence.symbol !== definition.symbol) return null;
  const receiver = index.byId(metadata.receiverElementId);
  if (!receiver || receiver.kind !== "field-read" || receiver.fieldName !== metadata.propName) return null;
  const mode = exactBoundaryMode(ts, checker, value, metadata);
  if (!mode) return null;
  return {
    opening,
    attribute,
    value,
    occurrence,
    binding,
    definition: definition!,
    receiver,
    mode,
    sourceFieldName: metadata.sourceFieldName ?? null,
    propName: metadata.propName,
    componentName: tagSymbol?.getName() ?? opening.tagName.getText(opening.getSourceFile()),
    target,
  };
}

/** Find the exact child reads owned by one resolved component definition. */
export function componentBoundaryConsumers(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  index: RouteTotalityFieldProofIndex,
  boundary: ExactComponentBoundary,
): ExactComponentBoundaryConsumer[] {
  const parameter = boundary.target.parameters[0];
  if (!parameter || !ts.isIdentifier(parameter.name)) return [];
  const parameterSymbol = checker.getSymbolAtLocation(parameter.name);
  if (!parameterSymbol) return [];
  const values: ExactComponentBoundaryConsumer[] = [];
  visitTypeScript(ts, boundary.target, (node) => {
    if (!ts.isPropertyAccessExpression(node)) return;
    const isConsumer = boundary.mode === "scalar-alias"
      ? isPropReceiver(ts, checker, node, parameterSymbol, boundary.propName)
      : isReceiverField(ts, checker, node, parameterSymbol, boundary.propName);
    if (!isConsumer) return;
    const fieldElement = index.element(node, "field-read");
    if (!fieldElement) return;
    const context = consumerContext(ts, checker, index, node, boundary);
    if (context) values.push({ field: node, fieldElement, ...context });
  });
  return deduplicateConsumers(values).sort((left, right) => left.field.getStart() - right.field.getStart());
}

function consumerContext(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  index: RouteTotalityFieldProofIndex,
  field: TypeScript.PropertyAccessExpression,
  boundary: ExactComponentBoundary,
): Omit<ExactComponentBoundaryConsumer, "field" | "fieldElement"> | null {
  const render = renderContext(ts, field);
  if (render) {
    const valueElement = index.element(field, elementKindForExpression(ts, field));
    const terminal = valueElement ? findRenderTerminal(index, valueElement.id) : null;
    return valueElement && terminal
      ? { valueElement, terminal, kind: "render", label: renderLabel(ts, field, boundary), locationNode: field }
      : null;
  }
  const condition = conditionContext(ts, field);
  if (condition) {
    const valueElement = index.element(condition, "selection");
    return valueElement
      ? { valueElement, terminal: null, kind: "condition", label: conditionLabel(ts, field, boundary), locationNode: condition }
      : null;
  }
  const handler = handlerContext(ts, field);
  if (handler) {
    const valueElement = index.element(handler.call, "call");
    return valueElement
      ? { valueElement, terminal: null, kind: "handler", label: `${handler.action}.${handler.property}`, locationNode: field }
      : null;
  }
  return null;
}

function renderContext(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): boolean {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxExpression(current)) return !ts.isJsxAttribute(current.parent);
    if (ts.isFunctionLike(current) || ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return false;
  }
  return false;
}

function conditionContext(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): TypeScript.BinaryExpression | TypeScript.ConditionalExpression | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isBinaryExpression(current) && current.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return current;
    if (ts.isConditionalExpression(current)) return current;
    if (ts.isFunctionLike(current) || ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return null;
  }
  return null;
}

function handlerContext(
  ts: typeof TypeScript,
  field: TypeScript.PropertyAccessExpression,
): { call: TypeScript.CallExpression; action: string; property: string } | null {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isPropertyAssignment(current) && current.initializer === field) {
      const object = current.parent;
      if (!ts.isObjectLiteralExpression(object)) return null;
      const call = object.parent;
      if (!ts.isCallExpression(call)) return null;
      const action = call.arguments.length > 0 && ts.isStringLiteral(call.arguments[0])
        ? call.arguments[0].text
        : null;
      const property = ts.isIdentifier(current.name) ? current.name.text : null;
      return action && property ? { call, action, property } : null;
    }
    if (ts.isFunctionLike(current) || ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return null;
  }
  return null;
}

function isReceiverField(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.PropertyAccessExpression,
  parameter: TypeScript.Symbol,
  propName: string,
): boolean {
  return ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.name.text === propName
    && checker.getSymbolAtLocation(node.expression.expression) === parameter;
}

function isPropReceiver(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.PropertyAccessExpression,
  parameter: TypeScript.Symbol,
  propName: string,
): boolean {
  return ts.isIdentifier(node.expression)
    && node.name.text === propName
    && checker.getSymbolAtLocation(node.expression) === parameter;
}

function exactBoundaryMode(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  value: TypeScript.Expression,
  metadata: ComponentBindingMetadata,
): ComponentBoundaryMode | null {
  if (metadata.valueMode === "whole-object" && ts.isCallExpression(value)) return "whole-object";
  if (metadata.valueMode === "scalar-alias" && ts.isPropertyAccessExpression(value)
    && ts.isCallExpression(value.expression) && metadata.sourceFieldName === value.name.text) return "scalar-alias";
  if (ts.isCallExpression(value)) return "whole-object";
  if (ts.isPropertyAccessExpression(value) && ts.isCallExpression(value.expression)) {
    const callSymbol = checker.getSymbolAtLocation(value.expression.expression);
    return callSymbol ? "scalar-alias" : null;
  }
  return null;
}

function declarationElementId(
  index: RouteTotalityFieldProofIndex,
  metadata: ComponentBindingMetadata,
): string | null {
  const declarationId = metadata.componentDefinitionId;
  const element = declarationId ? index.byId(declarationId) : null;
  return element?.kind === "component-definition" ? element.id : null;
}

function findRenderTerminal(index: RouteTotalityFieldProofIndex, valueId: string): ProgramElement | null {
  const relation = index.outgoing(valueId).find((candidate) => candidate.kind === "render-terminal"
    && candidate.proof.kind === "jsx-tag" && candidate.status === "proven");
  return relation ? index.byId(relation.to) : null;
}

function conditionLabel(
  ts: typeof TypeScript,
  field: TypeScript.PropertyAccessExpression,
  boundary: ExactComponentBoundary,
): string {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
      const receiver = current.expression.expression;
      const collection = ts.isPropertyAccessExpression(receiver) ? receiver.name.text : null;
      if (collection === "schedules") return `${boundary.propName} === "published" condition`;
      if (collection === "availability") return `availability ${boundary.propName} condition`;
      if (collection === "liveGames") return `live ${boundary.propName} condition`;
    }
    if (ts.isFunctionLike(current)) break;
  }
  return `${boundary.propName} condition`;
}

function renderLabel(
  ts: typeof TypeScript,
  field: TypeScript.PropertyAccessExpression,
  boundary: ExactComponentBoundary,
): string {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxAttribute(current)) {
      const opening = current.parent.parent;
      const tag = opening && (ts.isJsxElement(opening) || ts.isJsxSelfClosingElement(opening))
        ? opening.tagName.getText(opening.getSourceFile())
        : boundary.componentName;
      return `${tag}.${current.name.getText(current.getSourceFile())}`;
    }
    if (ts.isJsxElement(current)) {
      const tag = current.openingElement.tagName.getText(current.getSourceFile());
      if (tag === "Text" && field.name.text === "venueName") return "Text venue name";
      if (tag === "Text" && field.name.text === "venueAddress") return "Text venue address";
      return `${tag} ${field.name.text}`;
    }
    if (ts.isJsxSelfClosingElement(current)) return `${current.tagName.getText(current.getSourceFile())} ${field.name.text}`;
    if (ts.isFunctionLike(current)) break;
  }
  return `${boundary.componentName}.${boundary.propName}`;
}

function jsxValue(ts: typeof TypeScript, attribute: TypeScript.JsxAttribute): TypeScript.Expression | null {
  const initializer = attribute.initializer;
  return initializer && ts.isJsxExpression(initializer) ? initializer.expression ?? null : null;
}

function resolveAliasedSymbol(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Symbol | undefined {
  const symbol = checker.getSymbolAtLocation(node);
  return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function oneSourceDeclaration(root: string, symbol: TypeScript.Symbol | undefined): TypeScript.Declaration | null {
  const declarations = symbol?.declarations ?? [];
  const values = declarations.filter((declaration) => {
    const relative = path.relative(root, declaration.getSourceFile().fileName);
    return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative) && !declaration.getSourceFile().isDeclarationFile;
  });
  return values.length === 1 ? values[0] : null;
}

function deduplicateConsumers(values: ExactComponentBoundaryConsumer[]): ExactComponentBoundaryConsumer[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.field.getSourceFile().fileName}:${value.field.getStart()}:${value.kind}:${value.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
