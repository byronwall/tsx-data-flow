import path from "node:path";
import type * as TypeScript from "typescript";
import type { ComponentBindingMetadata } from "./program-component-binding-metadata";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { elementKindForExpression, visitTypeScript } from "./route-totality-field-proof-ast";
import { asFunctionLike, compilerSymbolId } from "./program-evidence-support";
import { resolveHandlerAction, type ResolvedHandlerAction } from "./program-evidence-handler-resolution";
import type { ProgramElement } from "./scope-seam";

export type ComponentBoundaryMode = "whole-object" | "scalar-alias";

export type ExactComponentBoundary = {
  opening: TypeScript.JsxOpeningLikeElement;
  attribute: TypeScript.JsxAttribute;
  value: TypeScript.Expression;
  occurrence: ProgramElement;
  binding: ProgramElement;
  definition: ProgramElement;
  receiver: ProgramElement | null;
  mode: ComponentBoundaryMode;
  sourceFieldName: string | null;
  propName: string;
  componentName: string;
  componentIdentity: string;
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
  bindingOverride?: ProgramElement,
): ExactComponentBoundary | null {
  const tagSymbol = resolveAliasedSymbol(ts, checker, opening.tagName);
  const declaration = oneSourceDeclaration(root, tagSymbol);
  const value = jsxValue(ts, attribute);
  const target = declaration ? asFunctionLike(ts, declaration) : null;
  if (!target || !value) return null;
  const occurrence = index.element(opening, "component-occurrence");
  const binding = bindingOverride ?? index.element(attribute, "component-prop-binding");
  if (!occurrence || !binding) return null;
  const metadata = binding.componentBinding;
  const definition = metadata?.componentDefinitionId ? index.byId(metadata.componentDefinitionId) : null;
  const compilerIdentity = compilerSymbolId(ts, checker, root, opening.tagName);
  if (!metadata || metadata.componentOccurrenceElementId !== occurrence.id
    || metadata.componentDefinitionId !== declarationElementId(index, metadata)
    || metadata.candidateCount !== 1 || metadata.propName === null
    || !metadata.parameterElementId || !metadata.receiverElementId
    || !definition || definition.kind !== "component-definition"
    || !compilerIdentity || occurrence.symbol !== compilerIdentity || definition.symbol !== compilerIdentity) return null;
  const parameter = index.byId(metadata.parameterElementId);
  const receiver = index.byId(metadata.receiverElementId);
  if (!parameter || parameter.kind !== "parameter" || !receiver
    || receiver.kind !== "field-read" || receiver.fieldName !== metadata.propName) return null;
  const receiverRelations = index.outgoing(binding.id).filter((relation) => (
    relation.to === receiver.id && relation.kind === "component-prop-binding"
      && relation.proof.kind === "component-prop-binding" && relation.status === "proven"
  ));
  if (receiverRelations.length !== 1) return null;
  const valueElement = index.element(value, elementKindForExpression(ts, value));
  if (!valueElement) return null;
  const valueRelations = index.outgoing(valueElement.id).filter((relation) => (
    relation.to === binding.id && relation.kind === "component-prop-binding"
      && relation.proof.kind === "component-prop-binding" && relation.status === "proven"
  ));
  if (valueRelations.length !== 1) return null;
  const mode = exactBoundaryMode(ts, value, metadata);
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
    componentIdentity: tagSymbol ? checker.getFullyQualifiedName(tagSymbol) : "",
    target,
  };
}

/** Find the exact child reads owned by one resolved component definition. */
export function componentBoundaryConsumers(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
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
    const context = consumerContext(ts, checker, root, index, node, boundary);
    if (context) values.push({ field: node, fieldElement, ...context });
  });
  return deduplicateConsumers(values).sort((left, right) => left.field.getStart() - right.field.getStart());
}

function consumerContext(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  index: RouteTotalityFieldProofIndex,
  field: TypeScript.PropertyAccessExpression,
  boundary: ExactComponentBoundary,
): Omit<ExactComponentBoundaryConsumer, "field" | "fieldElement"> | null {
  const render = renderContext(ts, field);
  if (render) {
    const valueElement = index.element(field, elementKindForExpression(ts, field));
    const terminal = valueElement ? findRenderTerminal(index, valueElement.id) : null;
    return valueElement
      ? { valueElement, terminal, kind: "render", label: renderLabel(ts, field, boundary), locationNode: field }
      : null;
  }
  const condition = conditionContext(ts, field);
  if (condition) {
    const valueElement = index.element(condition, "selection");
    if (valueElement) {
      return { valueElement, terminal: null, kind: "condition", label: conditionLabel(ts, field, boundary), locationNode: condition };
    }
  }
  const handler = handlerContext(ts, checker, root, field, boundary);
  if (handler) {
    const valueElement = index.element(handler.call, "call");
    return valueElement
      ? { valueElement, terminal: null, kind: "handler", label: `${handler.name}.${handler.property}`, locationNode: field }
      : null;
  }
  return null;
}

function renderContext(ts: typeof TypeScript, field: TypeScript.PropertyAccessExpression): boolean {
  let current: TypeScript.Node = field;
  while (current.parent) {
    current = current.parent;
    if (ts.isJsxExpression(current)) {
      if (ts.isJsxAttribute(current.parent)) {
        const name = ts.isIdentifier(current.parent.name) ? current.parent.name.text : "";
        return name !== "when" && !/^on[A-Z]/.test(name);
      }
      return true;
    }
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
  checker: TypeScript.TypeChecker,
  root: string,
  field: TypeScript.PropertyAccessExpression,
  boundary: ExactComponentBoundary,
): ResolvedHandlerAction | null {
  return resolveHandlerAction(ts, checker, root, field, field);
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
  value: TypeScript.Expression,
  metadata: ComponentBindingMetadata,
): ComponentBoundaryMode | null {
  if (metadata.valueMode === "whole-object" && ts.isCallExpression(value)) return "whole-object";
  if (metadata.valueMode === "scalar-alias" && ts.isPropertyAccessExpression(value)
    && ts.isCallExpression(value.expression) && metadata.sourceFieldName === value.name.text) return "scalar-alias";
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
      if (collection === "schedules") return "Completed schedule gameId condition";
      if (collection === "availability") return boundary.componentName === "ScheduledGamePlanningDetails"
        ? "Scheduled availability gameId condition"
        : "Completed availability gameId condition";
      if (collection === "liveGames") return "Completed live gameId condition";
    }
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
      const tag = opening && (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening))
        ? opening.tagName.getText(opening.getSourceFile())
        : boundary.componentName;
      return boundary.componentName === "CompletedGameSummary" && tag === "A" && current.name.getText(current.getSourceFile()) === "href"
        ? "A.href live"
        : `${tag}.${current.name.getText(current.getSourceFile())}`;
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
