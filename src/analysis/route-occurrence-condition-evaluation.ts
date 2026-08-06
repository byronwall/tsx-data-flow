import type * as TypeScript from "typescript";
import { asFunction } from "./route-occurrence-surface-entry";
import {
  callName,
  importModuleFor,
  propertyName,
  resolvedSymbol,
  unwrapExpression,
} from "./route-occurrence-support";

export type RouteConditionOutcome = "truthy" | "falsey" | "unknown";

export type RouteConditionEvaluation = {
  outcome: RouteConditionOutcome;
  detail: string;
  nodes: TypeScript.Node[];
};

type EvaluationSite = {
  occurrenceId: string;
  parentOccurrenceId: string | null;
  callSite: TypeScript.Node;
  declaration: TypeScript.FunctionLikeDeclaration | null;
};

type Primitive = string | number | boolean | null | undefined;
type StaticValue =
  | { kind: "known"; value: Primitive; detail: string; nodes: TypeScript.Node[] }
  | { kind: "truthy" | "falsey" | "unknown"; detail: string; nodes: TypeScript.Node[] };

const MAX_EVALUATION_DEPTH = 40;

export class RouteOccurrenceConditionEvaluator {
  private readonly sites = new Map<string, EvaluationSite>();

  constructor(
    private readonly ts: typeof TypeScript,
    private readonly checker: TypeScript.TypeChecker,
  ) {}

  register(site: EvaluationSite): void {
    this.sites.set(site.occurrenceId, site);
  }

  evaluate(
    occurrenceId: string | null,
    expression: TypeScript.Expression,
  ): RouteConditionEvaluation {
    const result = this.evaluateValue(occurrenceId, expression, new Set(), 0);
    return {
      outcome: truthiness(result),
      detail: result.detail,
      nodes: uniqueNodes([expression, ...result.nodes]),
    };
  }

  private evaluateValue(
    occurrenceId: string | null,
    input: TypeScript.Expression,
    active: Set<string>,
    depth: number,
  ): StaticValue {
    const expression = unwrapExpression(this.ts, input);
    if (depth >= MAX_EVALUATION_DEPTH) return unknown("Condition evaluation reached its bounded depth.", [expression]);
    const key = `${occurrenceId ?? "root"}:${expression.getSourceFile().fileName}:${expression.getStart()}:${expression.getEnd()}`;
    if (active.has(key)) return unknown("Condition evaluation found a recursive value reference.", [expression]);
    const nextActive = new Set(active).add(key);

    if (expression.kind === this.ts.SyntaxKind.TrueKeyword) return known(true, "The expression is the literal true.", [expression]);
    if (expression.kind === this.ts.SyntaxKind.FalseKeyword) return known(false, "The expression is the literal false.", [expression]);
    if (expression.kind === this.ts.SyntaxKind.NullKeyword) return known(null, "The expression is the literal null.", [expression]);
    if (this.ts.isStringLiteralLike(expression)) return known(expression.text, "The expression is a string literal.", [expression]);
    if (this.ts.isNumericLiteral(expression)) return known(Number(expression.text), "The expression is a number literal.", [expression]);
    if (this.ts.isObjectLiteralExpression(expression) || this.ts.isArrayLiteralExpression(expression) || this.ts.isArrowFunction(expression) || this.ts.isFunctionExpression(expression) || this.ts.isJsxElement(expression) || this.ts.isJsxSelfClosingElement(expression) || this.ts.isJsxFragment(expression)) {
      return truthy("The expression always creates a truthy value.", [expression]);
    }
    if (this.ts.isIdentifier(expression)) return this.evaluateIdentifier(occurrenceId, expression, nextActive, depth + 1);
    if (this.ts.isPropertyAccessExpression(expression) || this.ts.isElementAccessExpression(expression)) {
      const name = propertyName(this.ts, expression);
      return name
        ? this.evaluateProperty(occurrenceId, expression.expression, name, nextActive, depth + 1)
        : unknown("The property name is dynamic.", [expression]);
    }
    if (this.ts.isPrefixUnaryExpression(expression) && expression.operator === this.ts.SyntaxKind.ExclamationToken) {
      const operand = this.evaluateValue(occurrenceId, expression.operand, nextActive, depth + 1);
      const outcome = truthiness(operand);
      if (outcome === "truthy") return known(false, `Negation is false because ${operand.detail}`, [expression, ...operand.nodes]);
      if (outcome === "falsey") return known(true, `Negation is true because ${operand.detail}`, [expression, ...operand.nodes]);
      return unknown(`Negation is unknown because ${operand.detail}`, [expression, ...operand.nodes]);
    }
    if (this.ts.isBinaryExpression(expression)) {
      return this.evaluateBinary(occurrenceId, expression, nextActive, depth + 1);
    }
    if (this.ts.isConditionalExpression(expression)) {
      const condition = this.evaluateValue(occurrenceId, expression.condition, nextActive, depth + 1);
      const outcome = truthiness(condition);
      if (outcome === "truthy") return this.evaluateValue(occurrenceId, expression.whenTrue, nextActive, depth + 1);
      if (outcome === "falsey") return this.evaluateValue(occurrenceId, expression.whenFalse, nextActive, depth + 1);
      return combine(
        this.evaluateValue(occurrenceId, expression.whenTrue, nextActive, depth + 1),
        this.evaluateValue(occurrenceId, expression.whenFalse, nextActive, depth + 1),
        "The conditional branches do not resolve to one static value.",
      );
    }
    if (this.ts.isCallExpression(expression)) {
      return this.evaluateCall(occurrenceId, expression, nextActive, depth + 1);
    }
    if (this.ts.isVoidExpression(expression)) return known(undefined, "The void expression always returns undefined.", [expression]);
    return unknown("The expression is outside the supported static condition forms.", [expression]);
  }

  private evaluateIdentifier(
    occurrenceId: string | null,
    identifier: TypeScript.Identifier,
    active: Set<string>,
    depth: number,
  ): StaticValue {
    if (identifier.text === "undefined") return known(undefined, "The expression is undefined.", [identifier]);
    const site = occurrenceId ? this.sites.get(occurrenceId) : null;
    if (site && parameterContainsIdentifier(this.ts, this.checker, site.declaration, identifier)) {
      return unknown("A complete component parameter cannot be reduced to one scalar value.", [identifier]);
    }
    const declaration = resolvedSymbol(this.ts, this.checker, identifier)?.declaration;
    if (declaration && this.ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return this.evaluateValue(occurrenceId, declaration.initializer, active, depth + 1);
    }
    if (declaration && this.ts.isBindingElement(declaration)) {
      return this.evaluateBindingElement(occurrenceId, declaration, active, depth + 1);
    }
    return unknown(`The value of ${identifier.text} is not statically known.`, [identifier]);
  }

  private evaluateBindingElement(
    occurrenceId: string | null,
    binding: TypeScript.BindingElement,
    active: Set<string>,
    depth: number,
  ): StaticValue {
    if (!this.ts.isObjectBindingPattern(binding.parent)) return unknown("The array binding is an object alias, not a scalar value.", [binding]);
    const name = binding.propertyName?.getText(binding.getSourceFile()) ?? (this.ts.isIdentifier(binding.name) ? binding.name.text : null);
    if (!name) return unknown("The destructured property name is dynamic.", [binding]);
    const owner = binding.parent.parent;
    let result: StaticValue;
    if (this.ts.isVariableDeclaration(owner) && owner.initializer) {
      result = this.evaluateProperty(occurrenceId, owner.initializer, name, active, depth + 1);
    } else if (this.ts.isParameter(owner)) {
      result = this.evaluateCallSiteProperty(occurrenceId, name, active, depth + 1);
    } else {
      return unknown("The destructured property source is not supported.", [binding]);
    }
    if (!binding.initializer || !isUndefined(result)) return result;
    return this.evaluateValue(occurrenceId, binding.initializer, active, depth + 1);
  }

  private evaluateProperty(
    occurrenceId: string | null,
    input: TypeScript.Expression,
    name: string,
    active: Set<string>,
    depth: number,
  ): StaticValue {
    const expression = unwrapExpression(this.ts, input);
    if (depth >= MAX_EVALUATION_DEPTH) return unknown("Property evaluation reached its bounded depth.", [expression]);
    if (this.ts.isIdentifier(expression)) {
      const site = occurrenceId ? this.sites.get(occurrenceId) : null;
      if (site && parameterContainsIdentifier(this.ts, this.checker, site.declaration, expression)) {
        return this.evaluateCallSiteProperty(occurrenceId, name, active, depth + 1);
      }
      const declaration = resolvedSymbol(this.ts, this.checker, expression)?.declaration;
      if (declaration && this.ts.isVariableDeclaration(declaration) && declaration.initializer) {
        return this.evaluateProperty(occurrenceId, declaration.initializer, name, active, depth + 1);
      }
      if (declaration && this.ts.isBindingElement(declaration) && this.ts.isArrayBindingPattern(declaration.parent)) {
        return this.evaluateSplitBindingProperty(occurrenceId, declaration, name, active, depth + 1);
      }
    }
    if (this.ts.isObjectLiteralExpression(expression)) return this.evaluateObjectProperty(occurrenceId, expression, name, active, depth + 1);
    if (this.ts.isCallExpression(expression) && isSolidCall(this.ts, this.checker, expression, "mergeProps")) {
      const sourceDetails: string[] = [];
      const sourceNodes: TypeScript.Node[] = [expression];
      for (const source of [...expression.arguments].reverse()) {
        const result = this.evaluateProperty(occurrenceId, source, name, active, depth + 1);
        sourceDetails.push(result.detail);
        sourceNodes.push(...result.nodes);
        if (isUndefined(result)) continue;
        return result.kind === "unknown"
          ? unknown(`mergeProps cannot resolve ${name} because ${result.detail}`, sourceNodes)
          : result;
      }
      return known(undefined, `All mergeProps sources resolve ${name} to undefined. ${sourceDetails.join(" ")}`, sourceNodes);
    }
    if (propertyDefinitelyAbsent(this.ts, this.checker, expression, name)) {
      return known(undefined, `The compiler type proves that ${name} is absent.`, [expression]);
    }
    return unknown(`The property ${name} is not statically known.`, [expression]);
  }

  private evaluateSplitBindingProperty(
    occurrenceId: string | null,
    binding: TypeScript.BindingElement,
    name: string,
    active: Set<string>,
    depth: number,
  ): StaticValue {
    const pattern = binding.parent;
    const owner = pattern.parent;
    if (!this.ts.isVariableDeclaration(owner) || !owner.initializer || !this.ts.isCallExpression(owner.initializer) || !isSolidCall(this.ts, this.checker, owner.initializer, "splitProps")) {
      return unknown("The array binding does not come from Solid splitProps.", [binding]);
    }
    const index = pattern.elements.indexOf(binding);
    const groups = owner.initializer.arguments.slice(1);
    const groupNames = groups.map((group) => stringArray(this.ts, group));
    if (groupNames.some((group) => group === null)) return unknown("splitProps uses a dynamic property list.", [owner.initializer]);
    const selected = index < groupNames.length ? groupNames[index]! : null;
    if (selected && !selected.includes(name)) return known(undefined, `The splitProps group does not include ${name}.`, [binding]);
    if (!selected && groupNames.some((group) => group!.includes(name))) return known(undefined, `A prior splitProps group removes ${name}.`, [binding]);
    const source = owner.initializer.arguments[0];
    return source
      ? this.evaluateProperty(occurrenceId, source, name, active, depth + 1)
      : unknown("splitProps has no source object.", [owner.initializer]);
  }

  private evaluateObjectProperty(
    occurrenceId: string | null,
    object: TypeScript.ObjectLiteralExpression,
    name: string,
    active: Set<string>,
    depth: number,
  ): StaticValue {
    for (const property of [...object.properties].reverse()) {
      if (this.ts.isSpreadAssignment(property)) {
        const spread = this.evaluateProperty(occurrenceId, property.expression, name, active, depth + 1);
        if (!isUndefined(spread)) return spread;
        continue;
      }
      const propertyText = property.name && propertyNameText(this.ts, property.name);
      if (propertyText !== name) continue;
      if (this.ts.isPropertyAssignment(property)) return this.evaluateValue(occurrenceId, property.initializer, active, depth + 1);
      if (this.ts.isShorthandPropertyAssignment(property)) return this.evaluateIdentifier(occurrenceId, property.name, active, depth + 1);
      return unknown(`The object property ${name} uses an unsupported accessor.`, [property]);
    }
    return known(undefined, `The object literal does not define ${name}.`, [object]);
  }

  private evaluateCallSiteProperty(
    occurrenceId: string | null,
    name: string,
    active: Set<string>,
    depth: number,
  ): StaticValue {
    const site = occurrenceId ? this.sites.get(occurrenceId) : null;
    if (!site || (!this.ts.isJsxOpeningElement(site.callSite) && !this.ts.isJsxSelfClosingElement(site.callSite))) {
      return unknown(`The ${name} prop has no exact JSX call site.`, site ? [site.callSite] : []);
    }
    for (const property of [...site.callSite.attributes.properties].reverse()) {
      if (this.ts.isJsxSpreadAttribute(property)) {
        const spread = this.evaluateProperty(site.parentOccurrenceId, property.expression, name, active, depth + 1);
        if (!isUndefined(spread)) return spread.kind === "unknown"
          ? unknown(`The ${name} prop can come from an unresolved JSX spread.`, [property, ...spread.nodes])
          : spread;
        continue;
      }
      if (!this.ts.isJsxAttribute(property) || property.name.getText(site.callSite.getSourceFile()) !== name) continue;
      if (!property.initializer) return known(true, `The ${name} prop uses JSX boolean shorthand.`, [property]);
      if (this.ts.isStringLiteral(property.initializer)) return known(property.initializer.text, `The ${name} prop is a string literal.`, [property]);
      if (this.ts.isJsxExpression(property.initializer) && property.initializer.expression) {
        return this.evaluateValue(site.parentOccurrenceId, property.initializer.expression, active, depth + 1);
      }
      return unknown(`The ${name} prop initializer is not supported.`, [property]);
    }
    return known(undefined, `The ${name} prop is absent at this exact JSX call site.`, [site.callSite]);
  }

  private evaluateBinary(
    occurrenceId: string | null,
    expression: TypeScript.BinaryExpression,
    active: Set<string>,
    depth: number,
  ): StaticValue {
    const left = this.evaluateValue(occurrenceId, expression.left, active, depth + 1);
    const operator = expression.operatorToken.kind;
    if (operator === this.ts.SyntaxKind.AmpersandAmpersandToken) {
      const outcome = truthiness(left);
      if (outcome === "falsey") return left;
      if (outcome === "truthy") return this.evaluateValue(occurrenceId, expression.right, active, depth + 1);
      return unknown(`The left side of && is unknown because ${left.detail}`, [expression, ...left.nodes]);
    }
    if (operator === this.ts.SyntaxKind.BarBarToken) {
      const outcome = truthiness(left);
      if (outcome === "truthy") return left;
      if (outcome === "falsey") return this.evaluateValue(occurrenceId, expression.right, active, depth + 1);
      return unknown(`The left side of || is unknown because ${left.detail}`, [expression, ...left.nodes]);
    }
    if (operator === this.ts.SyntaxKind.QuestionQuestionToken) {
      if (isUndefined(left) || isKnown(left, null)) return this.evaluateValue(occurrenceId, expression.right, active, depth + 1);
      return left.kind === "unknown" ? unknown(`The left side of ?? is unknown because ${left.detail}`, [expression, ...left.nodes]) : left;
    }
    if (operator === this.ts.SyntaxKind.EqualsEqualsEqualsToken || operator === this.ts.SyntaxKind.ExclamationEqualsEqualsToken || operator === this.ts.SyntaxKind.EqualsEqualsToken || operator === this.ts.SyntaxKind.ExclamationEqualsToken) {
      const right = this.evaluateValue(occurrenceId, expression.right, active, depth + 1);
      if (left.kind !== "known" || right.kind !== "known") return unknown("The comparison operands are not both static values.", [expression, ...left.nodes, ...right.nodes]);
      const equal = operator === this.ts.SyntaxKind.EqualsEqualsToken || operator === this.ts.SyntaxKind.ExclamationEqualsToken
        ? looselyEqual(left.value, right.value)
        : left.value === right.value;
      const value = operator === this.ts.SyntaxKind.ExclamationEqualsEqualsToken || operator === this.ts.SyntaxKind.ExclamationEqualsToken ? !equal : equal;
      return known(value, "Both comparison operands are static values.", [expression, ...left.nodes, ...right.nodes]);
    }
    return unknown("The binary operator is outside the supported static condition forms.", [expression]);
  }

  private evaluateCall(
    occurrenceId: string | null,
    expression: TypeScript.CallExpression,
    active: Set<string>,
    depth: number,
  ): StaticValue {
    if (expression.arguments.length > 0) return unknown("The call has runtime arguments.", [expression]);
    const declaration = asFunction(this.ts, resolvedSymbol(this.ts, this.checker, expression.expression)?.declaration ?? null);
    if (!declaration || declaration.parameters.length > 0 || !declaration.body) return unknown(`The ${callName(this.ts, expression)} call is not a supported local accessor.`, [expression]);
    if (!this.ts.isBlock(declaration.body)) return this.evaluateValue(occurrenceId, declaration.body, active, depth + 1);
    const returned = declaration.body.statements.filter(this.ts.isReturnStatement).map((statement) => statement.expression).filter((item): item is TypeScript.Expression => Boolean(item));
    if (returned.length !== 1) return unknown(`The ${callName(this.ts, expression)} accessor does not have one direct return.`, [expression]);
    return this.evaluateValue(occurrenceId, returned[0], active, depth + 1);
  }
}

function isSolidCall(ts: typeof TypeScript, checker: TypeScript.TypeChecker, call: TypeScript.CallExpression, name: string) {
  return callName(ts, call) === name && ["solid-js", "solid-js/web"].includes(importModuleFor(ts, checker, call.expression) ?? "");
}

function parameterContainsIdentifier(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.FunctionLikeDeclaration | null, identifier: TypeScript.Identifier) {
  if (!declaration) return false;
  const symbol = checker.getSymbolAtLocation(identifier);
  return declaration.parameters.some((parameter) => ts.isIdentifier(parameter.name) && sameSymbol(checker, symbol, checker.getSymbolAtLocation(parameter.name)));
}

function sameSymbol(checker: TypeScript.TypeChecker, left: TypeScript.Symbol | undefined, right: TypeScript.Symbol | undefined) {
  return Boolean(left && right && (left === right || checker.getFullyQualifiedName(left) === checker.getFullyQualifiedName(right)));
}

function propertyDefinitelyAbsent(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node, name: string): boolean {
  try {
    const type = checker.getTypeAtLocation(node);
    const types = type.isUnion() ? type.types : [type];
    return types.every((item) => {
      if (item.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
      return !checker.getPropertyOfType(item, name) && !checker.getIndexTypeOfType(item, ts.IndexKind.String);
    });
  } catch {
    return false;
  }
}

function stringArray(ts: typeof TypeScript, node: TypeScript.Expression): string[] | null {
  const value = unwrapExpression(ts, node);
  if (!ts.isArrayLiteralExpression(value)) return null;
  const result: string[] = [];
  for (const element of value.elements) {
    if (!ts.isStringLiteralLike(element)) return null;
    result.push(element.text);
  }
  return result;
}

function propertyNameText(ts: typeof TypeScript, name: TypeScript.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function known(value: Primitive, detail: string, nodes: TypeScript.Node[]): StaticValue { return { kind: "known", value, detail, nodes }; }
function truthy(detail: string, nodes: TypeScript.Node[]): StaticValue { return { kind: "truthy", detail, nodes }; }
function unknown(detail: string, nodes: TypeScript.Node[]): StaticValue { return { kind: "unknown", detail, nodes }; }
function isUndefined(value: StaticValue): boolean { return value.kind === "known" && value.value === undefined; }
function isKnown(value: StaticValue, expected: Primitive): boolean { return value.kind === "known" && value.value === expected; }
function truthiness(value: StaticValue): RouteConditionOutcome {
  if (value.kind === "known") return value.value ? "truthy" : "falsey";
  return value.kind;
}
function combine(left: StaticValue, right: StaticValue, detail: string): StaticValue {
  if (left.kind === "known" && right.kind === "known" && left.value === right.value) return known(left.value, left.detail, [...left.nodes, ...right.nodes]);
  const leftOutcome = truthiness(left);
  const rightOutcome = truthiness(right);
  if (leftOutcome === rightOutcome && leftOutcome !== "unknown") return { kind: leftOutcome, detail, nodes: [...left.nodes, ...right.nodes] };
  return unknown(detail, [...left.nodes, ...right.nodes]);
}
function uniqueNodes(nodes: TypeScript.Node[]): TypeScript.Node[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const key = `${node.getSourceFile().fileName}:${node.getStart()}:${node.getEnd()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function looselyEqual(left: Primitive, right: Primitive): boolean {
  const leftNullish = left === null || left === undefined;
  const rightNullish = right === null || right === undefined;
  return left === right || (leftNullish && rightNullish);
}
