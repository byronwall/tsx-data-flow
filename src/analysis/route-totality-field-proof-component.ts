import path from "node:path";
import type * as TypeScript from "typescript";
import { visitTypeScript } from "./route-totality-field-proof-ast";

export type ExactShowUse = {
  opening: TypeScript.JsxOpeningLikeElement;
  when: TypeScript.CallExpression;
  render: TypeScript.ArrowFunction;
  parameter: TypeScript.Symbol;
};

export type ExactComponentConsumer = {
  call: TypeScript.CallExpression;
  access: TypeScript.PropertyAccessExpression;
  opening: TypeScript.JsxOpeningLikeElement;
  attribute: TypeScript.JsxAttribute;
  value: TypeScript.Expression;
  propName: string;
  componentName: string;
};

export function uniqueShowUse(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  file: TypeScript.SourceFile,
  accessor: TypeScript.Symbol | undefined,
): ExactShowUse | null {
  const values: ExactShowUse[] = [];
  visitTypeScript(ts, file, (node) => {
    if (!ts.isJsxElement(node) || !isSolidShow(ts, checker, node.openingElement)) return;
    const attributes = node.openingElement.attributes.properties.filter((item): item is TypeScript.JsxAttribute => (
      ts.isJsxAttribute(item) && ts.isIdentifier(item.name) && item.name.text === "when"
    ));
    const initializer = attributes.length === 1 ? attributes[0].initializer : null;
    const expression = initializer && ts.isJsxExpression(initializer) ? initializer.expression : null;
    const renders = node.children.flatMap((child) => (
      ts.isJsxExpression(child) && child.expression && ts.isArrowFunction(child.expression) ? [child] : []
    ));
    if (!expression || !ts.isCallExpression(expression)
      || checker.getSymbolAtLocation(expression.expression) !== accessor || renders.length !== 1) return;
    const render = renders[0].expression as TypeScript.ArrowFunction;
    if (render.parameters.length !== 1 || !ts.isIdentifier(render.parameters[0].name)) return;
    const parameter = checker.getSymbolAtLocation(render.parameters[0].name);
    if (parameter) values.push({ opening: node.openingElement, when: expression, render, parameter });
  });
  return values.length === 1 ? values[0] : null;
}

export function componentConsumers(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  render: TypeScript.ArrowFunction,
  parameter: TypeScript.Symbol,
): ExactComponentConsumer[] {
  const values: ExactComponentConsumer[] = [];
  visitTypeScript(ts, render.body, (node) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxElement(node)) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const componentName = inProjectComponentName(ts, checker, root, opening.tagName);
    if (!componentName) return;
    for (const attribute of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
      const propName = attribute.name.text;
      const initializer = attribute.initializer;
      const value = initializer && ts.isJsxExpression(initializer) ? initializer.expression : null;
      if (!value) continue;
      visitTypeScript(ts, value, (child) => {
        if (!ts.isPropertyAccessExpression(child) || !ts.isCallExpression(child.expression)
          || checker.getSymbolAtLocation(child.expression.expression) !== parameter) return;
        values.push({ call: child.expression, access: child, opening, attribute, value, propName, componentName });
      });
    }
  });
  return values.sort((left, right) => left.opening.getStart() - right.opening.getStart()
    || left.attribute.getStart() - right.attribute.getStart()
    || left.access.getStart() - right.access.getStart());
}

function isSolidShow(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  opening: TypeScript.JsxOpeningLikeElement,
): boolean {
  const symbol = checker.getSymbolAtLocation(opening.tagName);
  const target = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return Boolean(target?.getName() === "Show" && target.declarations?.some((declaration) => (
    declaration.getSourceFile().fileName.includes("/solid-js/")
  )));
}

function inProjectComponentName(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  tag: TypeScript.JsxTagNameExpression,
): string | null {
  const symbol = checker.getSymbolAtLocation(tag);
  const target = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declarations = target?.declarations ?? [];
  if (declarations.length !== 1 || declarations[0].getSourceFile().isDeclarationFile) return null;
  const relative = path.relative(root, declarations[0].getSourceFile().fileName);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    ? target?.getName() ?? null
    : null;
}
