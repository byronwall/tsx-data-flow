import type * as TypeScript from "typescript";
import {
  callName,
  declarationForResolved,
  hasSpreadAttribute,
  importModuleFor,
  isComponentTag,
  isJsxNode,
  resolvedSymbol,
  safeTypeText,
  slotExpressionFor,
  sourceBackedCollection,
  tagName,
  unwrapExpression,
} from "./route-occurrence-support";
import type {
  RouteFrameworkBoundaryKind,
  RouteOccurrenceDefinition,
  RouteOccurrenceRepetition,
  RouteRenderOccurrence,
} from "./route-occurrence-surface";
import { asFunction } from "./route-occurrence-surface-entry";
import type { RouteOccurrenceSurfaceBuilder, RouteScanContext } from "./route-occurrence-surface-builder";

type RenderRoot = { node: TypeScript.Expression; repetition: RouteOccurrenceRepetition };
const FRAMEWORK_NAMES = new Set(["ErrorBoundary", "For", "Index", "Match", "Portal", "Show", "Suspense", "SuspenseList", "Switch", "Dynamic"]);

export function scanOccurrenceDefinition(builder: RouteOccurrenceSurfaceBuilder, occurrence: RouteRenderOccurrence, definition: RouteOccurrenceDefinition, declaration: TypeScript.Declaration, depth: number) {
  builder.checkCancellation();
  const roots = renderRoots(builder.ts, declaration);
  const functionDeclaration = asFunction(builder.ts, declaration);
  if (!roots.length) {
    builder.omit("unsupported-syntax", `The ${definition.name} definition has no statically visible render return.`, declaration);
    return;
  }
  const scanner = new OccurrenceScanner(builder);
  for (const root of roots) scanner.scanExpression(root.node, { parentOccurrenceId: occurrence.id, evaluationOccurrenceId: occurrence.id, parentBoundaryId: null, boundaryChildKind: null, repetition: mergeRepetition(occurrence.repetition, root.repetition), markers: occurrence.repetitionMarkers, ownership: "definition-owned", declaration: functionDeclaration }, depth);
}

class OccurrenceScanner {
  private readonly helperStack = new Set<string>();

  constructor(private readonly builder: RouteOccurrenceSurfaceBuilder) {}

  scanExpression(expression: TypeScript.Expression, context: RouteScanContext, depth: number) {
    this.builder.checkCancellation();
    const node = unwrapExpression(this.builder.ts, expression);
    if (isJsxNode(this.builder.ts, node)) {
      this.scanJsx(node, context, depth);
      return;
    }
    if (this.builder.ts.isConditionalExpression(node)) {
      const condition = this.builder.evaluateCondition(context.evaluationOccurrenceId, node.condition);
      if (condition.outcome !== "falsey") this.scanExpression(node.whenTrue, condition.outcome === "unknown" ? withRepetition(context, "conditional") : context, depth);
      if (condition.outcome !== "truthy") this.scanExpression(node.whenFalse, condition.outcome === "unknown" ? withRepetition(context, "conditional") : context, depth);
      return;
    }
    if (this.builder.ts.isBinaryExpression(node) && (node.operatorToken.kind === this.builder.ts.SyntaxKind.AmpersandAmpersandToken || node.operatorToken.kind === this.builder.ts.SyntaxKind.BarBarToken)) {
      const condition = this.builder.evaluateCondition(context.evaluationOccurrenceId, node.left);
      const scansRight = node.operatorToken.kind === this.builder.ts.SyntaxKind.AmpersandAmpersandToken
        ? condition.outcome !== "falsey"
        : condition.outcome !== "truthy";
      if (scansRight) this.scanExpression(node.right, condition.outcome === "unknown" ? withRepetition(context, "conditional") : context, depth);
      return;
    }
    if (this.builder.ts.isCallExpression(node)) {
      if (this.scanCollectionCall(node, context, depth)) return;
      const slot = slotExpressionFor(this.builder.ts, this.builder.checker, node, context.declaration);
      if (slot) {
        this.builder.addSlot(context, node, slot);
        return;
      }
      const helper = functionHelper(this.builder.ts, this.builder.checker, node);
      if (helper) {
        const identity = helper.getSourceFile().fileName + ":" + helper.getStart();
        if (this.helperStack.has(identity)) {
          this.builder.omit("recursion-limit", `Render helper recursion stopped at ${callName(this.builder.ts, node)}.`, node);
          return;
        }
        this.helperStack.add(identity);
        for (const root of renderRoots(this.builder.ts, helper)) this.scanExpression(root.node, context, depth + 1);
        this.helperStack.delete(identity);
        return;
      }
      for (const argument of node.arguments) if (this.builder.ts.isArrowFunction(argument) || this.builder.ts.isFunctionExpression(argument)) this.scanFunction(argument, withRepetition(context, "unknown"), depth);
      return;
    }
    if (this.builder.ts.isArrowFunction(node) || this.builder.ts.isFunctionExpression(node)) {
      this.scanFunction(node, context, depth);
      return;
    }
    if (this.builder.ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) if (this.builder.ts.isExpression(element)) this.scanExpression(element, context, depth);
      return;
    }
    const slot = slotExpressionFor(this.builder.ts, this.builder.checker, node, context.declaration);
    if (slot) this.builder.addSlot(context, node, slot);
  }

  private scanJsx(node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement | TypeScript.JsxFragment, context: RouteScanContext, depth: number) {
    if (this.builder.ts.isJsxFragment(node)) {
      for (const child of node.children) this.scanJsxChild(child, context, depth);
      return;
    }
    const opening = this.builder.ts.isJsxElement(node) ? node.openingElement : node;
    const name = tagName(this.builder.ts, opening.tagName);
    if (this.isFramework(name, opening.tagName)) {
      this.scanFramework(node, opening, name, context, depth);
      return;
    }
    if (!isComponentTag(this.builder.ts, opening.tagName)) {
      this.scanIntrinsic(node, opening, context, depth);
      return;
    }
    const resolved = resolvedSymbol(this.builder.ts, this.builder.checker, opening.tagName);
    if (!resolved) {
      this.builder.omit("unresolved-symbol", `The component symbol for <${name}> could not be resolved.`, opening);
      return;
    }
    const declaration = declarationForResolved(resolved);
    const definition = this.builder.definitionFor(resolved, declaration ?? opening, name, importModuleFor(this.builder.ts, this.builder.checker, opening.tagName));
    if (!definition) return;
    const child = this.builder.addOccurrence(definition, opening, context, name);
    if (!child) return;
    if (hasSpreadAttribute(this.builder.ts, opening)) this.builder.omit("unsupported-ownership", `<${name}> receives spread props, so child ownership is not fully proven.`, opening);
    this.scanComponentCallChildren(node, child, context, depth);
    this.builder.expandOccurrence(child, definition, depth + 1);
  }

  private scanComponentCallChildren(node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement, occurrence: RouteRenderOccurrence, ownerContext: RouteScanContext, depth: number) {
    const context: RouteScanContext = { parentOccurrenceId: occurrence.id, evaluationOccurrenceId: ownerContext.evaluationOccurrenceId, parentBoundaryId: null, boundaryChildKind: null, repetition: occurrence.repetition, markers: occurrence.repetitionMarkers, ownership: "caller-owned", declaration: ownerContext.declaration };
    if (this.builder.ts.isJsxElement(node)) for (const child of node.children) this.scanJsxChild(child, context, depth);
    const opening = this.builder.ts.isJsxElement(node) ? node.openingElement : node;
    for (const property of opening.attributes.properties) {
      if (!this.builder.ts.isJsxAttribute(property) || !property.initializer || property.name.getText() !== "children") continue;
      if (this.builder.ts.isJsxExpression(property.initializer) && property.initializer.expression) this.scanExpression(property.initializer.expression, context, depth);
    }
  }

  private scanJsxChild(child: TypeScript.JsxChild, context: RouteScanContext, depth: number) {
    if (this.builder.ts.isJsxText(child)) {
      if (child.getText().trim()) this.builder.addTerminal("jsx-text", context, child, child.getText().trim(), null);
      return;
    }
    if (this.builder.ts.isJsxExpression(child)) {
      if (!child.expression) return;
      const slot = slotExpressionFor(this.builder.ts, this.builder.checker, child.expression, context.declaration);
      if (slot) this.builder.addSlot(context, child.expression, slot);
      else {
        this.scanExpression(child.expression, context, depth);
        if (!containsJsx(this.builder.ts, child.expression)) this.builder.addTerminal("render-expression", context, child.expression, child.expression.getText(), child.expression.getText());
      }
      return;
    }
    this.scanJsx(child, context, depth);
  }

  private scanIntrinsic(node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement, opening: TypeScript.JsxOpeningLikeElement, context: RouteScanContext, depth: number) {
    if (this.builder.includeIntrinsicTerminals) {
      for (const property of opening.attributes.properties) {
        if (!this.builder.ts.isJsxAttribute(property) || !property.initializer) continue;
        const name = property.name.getText();
        if (this.builder.ts.isStringLiteral(property.initializer) || /^(?:on[A-Z]|ref$|use:)/.test(name)) continue;
        const expression = this.builder.ts.isJsxExpression(property.initializer) ? property.initializer.expression : null;
        if (expression) this.builder.addTerminal(name === "style" ? "style" : "dom-attribute", context, property, name, expression.getText(node.getSourceFile()));
      }
    }
    if (this.builder.ts.isJsxElement(node)) for (const child of node.children) this.scanJsxChild(child, context, depth);
  }

  private scanFramework(node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement, opening: TypeScript.JsxOpeningLikeElement, name: string, context: RouteScanContext, depth: number) {
    const kind = frameworkKind(name);
    const showRenderProp = exactSolidShowRenderProp(this.builder.ts, this.builder.checker, opening);
    const marker = kind === "collection" ? "collection" : kind === "portal" ? "single" : kind === "unsupported-ownership" ? "unknown" : "conditional";
    const sourceName = name === "For" ? "each" : "when";
    const sourceAttribute = opening.attributes.properties.find((property) => this.builder.ts.isJsxAttribute(property) && property.name.getText() === sourceName);
    const sourceExpression = sourceAttribute && this.builder.ts.isJsxAttribute(sourceAttribute) && sourceAttribute.initializer && this.builder.ts.isJsxExpression(sourceAttribute.initializer) && sourceAttribute.initializer.expression ? sourceAttribute.initializer.expression : null;
    const sourceBacked = kind === "collection" ? Boolean(sourceExpression && sourceBackedCollection(this.builder.ts, this.builder.checker, sourceExpression)) : sourceExpression ? !isUnknownType(this.builder.checker, sourceExpression) : null;
    const condition = kind === "control-flow" && sourceExpression
      ? this.builder.evaluateCondition(context.evaluationOccurrenceId, sourceExpression)
      : null;
    const boundary = this.builder.addBoundary(name, kind, opening, context, marker, sourceExpression, sourceBacked, condition);
    if (!boundary) return;
    if (kind === "unsupported-ownership") this.builder.omit("unsupported-ownership", `<${name}> has dynamic framework ownership.`, opening);
    if (kind === "collection" && !sourceBacked) this.builder.omit("unsupported-syntax", `<${name}> has no source-backed collection expression.`, sourceExpression ?? opening);
    if (condition?.outcome !== "falsey" && this.builder.ts.isJsxElement(node)) for (const child of node.children) {
      const childContext = withBoundary(context, boundary.id, condition?.outcome === "unknown" ? marker : "single");
      if (this.builder.ts.isJsxExpression(child) && child.expression && (this.builder.ts.isArrowFunction(child.expression) || this.builder.ts.isFunctionExpression(child.expression))) {
        if (showRenderProp === child.expression) {
          const text = child.expression.getText(child.expression.getSourceFile());
          this.builder.addTerminal("render-expression", childContext, child.expression, text, text);
        }
        this.scanFunction(child.expression, childContext, depth);
      }
      else this.scanJsxChild(child, childContext, depth);
    }
    const fallback = opening.attributes.properties.find((property) => this.builder.ts.isJsxAttribute(property) && property.name.getText() === "fallback");
    if (condition?.outcome !== "truthy" && fallback && this.builder.ts.isJsxAttribute(fallback) && fallback.initializer && this.builder.ts.isJsxExpression(fallback.initializer) && fallback.initializer.expression) this.scanExpression(fallback.initializer.expression, withBoundary(context, boundary.id, condition?.outcome === "unknown" ? "conditional" : "single", "fallback"), depth);
  }

  private scanCollectionCall(node: TypeScript.CallExpression, context: RouteScanContext, depth: number) {
    const name = callName(this.builder.ts, node);
    if (name !== "map" && name !== "flatMap") return false;
    const callback = node.arguments.find((argument) => this.builder.ts.isArrowFunction(argument) || this.builder.ts.isFunctionExpression(argument));
    const source = this.builder.ts.isPropertyAccessExpression(node.expression) ? node.expression.expression : null;
    const sourceBacked = Boolean(source && sourceBackedCollection(this.builder.ts, this.builder.checker, source));
    const boundary = this.builder.addBoundary(`Array.${name}`, "collection", node, context, sourceBacked ? "collection" : "unknown", source, sourceBacked);
    if (!boundary) return true;
    if (!sourceBacked) this.builder.omit("unsupported-syntax", `The ${name} callback source is not compiler-proven as a collection.`, source ?? node);
    if (callback && (this.builder.ts.isArrowFunction(callback) || this.builder.ts.isFunctionExpression(callback))) this.scanFunction(callback, withBoundary(context, boundary.id, sourceBacked ? "collection" : "unknown"), depth);
    else this.builder.omit("unsupported-syntax", `The ${name} call has no statically visible callback.`, node);
    return true;
  }

  private scanFunction(node: TypeScript.ArrowFunction | TypeScript.FunctionExpression, context: RouteScanContext, depth: number) {
    if (node.body && !this.builder.ts.isBlock(node.body)) {
      this.scanExpression(node.body, context, depth);
      return;
    }
    const roots = functionRoots(this.builder.ts, node);
    if (!roots.length && node.body) this.builder.omit("unsupported-syntax", "A render callback has no statically visible return expression.", node);
    for (const root of roots) this.scanExpression(root.node, withRepetition(context, root.repetition), depth);
  }

  private isFramework(name: string, tag: TypeScript.JsxTagNameExpression) {
    if (!FRAMEWORK_NAMES.has(name)) return false;
    const module = importModuleFor(this.builder.ts, this.builder.checker, tag);
    return module === null || module === "solid-js" || module === "solid-js/web";
  }
}

function renderRoots(ts: typeof TypeScript, declaration: TypeScript.Declaration): RenderRoot[] {
  if (ts.isClassDeclaration(declaration)) {
    const render = declaration.members.find((member) => ts.isMethodDeclaration(member) && member.name?.getText() === "render");
    return render && ts.isMethodDeclaration(render) ? functionRoots(ts, render) : [];
  }
  const functionDeclaration = asFunction(ts, declaration);
  return functionDeclaration ? functionRoots(ts, functionDeclaration) : [];
}

function functionRoots(ts: typeof TypeScript, declaration: TypeScript.FunctionLikeDeclaration): RenderRoot[] {
  if (declaration.body && !ts.isBlock(declaration.body)) return [{ node: declaration.body, repetition: "single" }];
  const roots: RenderRoot[] = [];
  const walk = (node: TypeScript.Node, repetition: RouteOccurrenceRepetition) => {
    if (node !== declaration.body && (ts.isFunctionLike(node) || ts.isClassDeclaration(node))) return;
    if (ts.isReturnStatement(node) && node.expression) {
      roots.push({ node: node.expression, repetition });
      return;
    }
    if (ts.isIfStatement(node)) {
      walk(node.thenStatement, mergeRepetition(repetition, "conditional"));
      if (node.elseStatement) walk(node.elseStatement, mergeRepetition(repetition, "conditional"));
      return;
    }
    ts.forEachChild(node, (child) => walk(child, repetition));
  };
  if (declaration.body) walk(declaration.body, "single");
  return roots;
}

function functionHelper(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.CallExpression) {
  const declaration = declarationForResolved(resolvedSymbol(ts, checker, node.expression));
  return declaration ? asFunction(ts, declaration) : null;
}

function frameworkKind(name: string): RouteFrameworkBoundaryKind {
  if (name === "Portal") return "portal";
  if (name === "For" || name === "Index") return "collection";
  if (name === "Suspense" || name === "SuspenseList" || name === "ErrorBoundary") return "suspense-async";
  if (name === "Dynamic") return "unsupported-ownership";
  return "control-flow";
}

function mergeRepetition(current: RouteOccurrenceRepetition, next: RouteOccurrenceRepetition): RouteOccurrenceRepetition {
  if (current === "unknown" || next === "unknown") return "unknown";
  if (current === "single") return next;
  if (next === "single" || current === next) return current;
  return "unknown";
}

function withRepetition(context: RouteScanContext, marker: RouteOccurrenceRepetition): RouteScanContext {
  return { ...context, repetition: mergeRepetition(context.repetition, marker), markers: markersFor(context.markers, marker) };
}

function withBoundary(context: RouteScanContext, boundaryId: string, marker: RouteOccurrenceRepetition, boundaryChildKind: "content" | "fallback" = "content"): RouteScanContext {
  return { ...withRepetition(context, marker), parentBoundaryId: boundaryId, boundaryChildKind };
}

function markersFor(current: Array<"conditional" | "collection">, marker: RouteOccurrenceRepetition) {
  const markers = new Set(current);
  if (marker === "conditional") markers.add("conditional");
  if (marker === "collection") markers.add("collection");
  return [...markers];
}

function isUnknownType(checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  const text = safeTypeText(checker, node);
  return text === "any" || text === "unknown";
}

/** Return one direct render function for one compiler-resolved Solid Show. */
function exactSolidShowRenderProp(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  opening: TypeScript.JsxOpeningLikeElement,
): TypeScript.ArrowFunction | null {
  if (!ts.isJsxOpeningElement(opening) || !ts.isJsxElement(opening.parent)) return null;
  if (importModuleFor(ts, checker, opening.tagName) !== "solid-js" || hasSpreadAttribute(ts, opening)) return null;
  const resolved = resolvedSymbol(ts, checker, opening.tagName);
  if (!resolved || resolved.symbol.getName() !== "Show") return null;
  const when = opening.attributes.properties.filter((property): property is TypeScript.JsxAttribute =>
    ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === "when",
  );
  if (when.length !== 1 || !when[0].initializer || !ts.isJsxExpression(when[0].initializer)
    || !when[0].initializer.expression || !ts.isCallExpression(when[0].initializer.expression)) {
    return null;
  }
  const children = opening.parent.children.filter((child) =>
    !ts.isJsxText(child) || child.getText(child.getSourceFile()).trim().length > 0,
  );
  if (children.length !== 1 || !ts.isJsxExpression(children[0])) return null;
  const renderProp = children[0].expression;
  if (!renderProp || !ts.isArrowFunction(renderProp) || renderProp.parameters.length !== 1) return null;
  const parameter = renderProp.parameters[0];
  return parameter.dotDotDotToken || parameter.questionToken || parameter.initializer ? null : renderProp;
}

function containsJsx(ts: typeof TypeScript, node: TypeScript.Node) {
  let result = false;
  const visit = (child: TypeScript.Node) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) result = true;
    else ts.forEachChild(child, visit);
  };
  visit(node);
  return result;
}
