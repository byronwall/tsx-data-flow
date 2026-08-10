import * as TypeScript from "typescript";
import { ProgramEvidenceCollectorComponentBindingSupport } from "./program-evidence-collector-component-binding";
import { asFunctionLike, nodeKey, proof, unwrap } from "./program-evidence-support";
import { exactCallbackReturnExpression } from "./program-callback-return";

/** Collect compiler-backed facts for exact collection and JSX field transfers. */
export class ProgramEvidenceCollectorFieldTransferSupport extends ProgramEvidenceCollectorComponentBindingSupport {
  protected connectFieldTransfers(): void {
    for (const file of this.files) {
      this.checkCancellation();
      this.visit(file, (node) => {
        if (this.ts.isCallExpression(node)) this.connectArrayFind(node);
        if (this.ts.isJsxElement(node)) this.connectSolidShow(node);
        if (this.ts.isJsxElement(node) || this.ts.isJsxSelfClosingElement(node)) this.connectConsumer(node);
      });
    }
  }

  private connectArrayFind(call: TypeScript.CallExpression): void {
    if (!this.ts.isPropertyAccessExpression(call.expression)
      || !this.ts.isIdentifier(call.expression.name)
      || call.expression.name.text !== "find"
      || !this.isArrayFind(call.expression.name)
      || call.arguments.length !== 1
      || !this.ts.isArrowFunction(call.arguments[0])) return;
    const callback = call.arguments[0];
    if (callback.parameters.length !== 1
      || !this.ts.isIdentifier(callback.parameters[0].name)
      || callback.parameters[0].dotDotDotToken
      || callback.parameters[0].questionToken
      || callback.parameters[0].initializer) return;
    const returned = exactCallbackReturnExpression(this.ts, callback);
    const parameterSymbol = this.checker.getSymbolAtLocation(callback.parameters[0].name);
    if (!returned || !parameterSymbol) return;
    const predicateReads = this.directParameterReads(returned, parameterSymbol);
    if (predicateReads.length !== 1) return;

    const ownerId = this.ownerId(call);
    const receiver = call.expression.expression;
    const receiverId = this.expression(receiver, ownerId);
    const parameterId = this.elementFor(callback.parameters[0].name, "parameter");
    const predicateReadId = this.elementFor(predicateReads[0], "field-read");
    const collectionElementId = this.ensureElement(
      receiver,
      "collection-element",
      ownerId,
      { method: "Array.find" },
      this.symbolId(call.expression.name),
      this.moduleFor(call.expression.name),
      null,
      "proven",
      proof("array-find-element", "The compiler resolves Array.prototype.find and its collection element identity.", [this.location(receiver), this.location(call.expression.name)]),
    );
    const predicateResultId = this.ensureElement(
      returned,
      "predicate-result",
      this.ownerId(callback),
      { role: "Array.find predicate return" },
      null,
      null,
      null,
      "proven",
      proof("array-find-predicate-return", "This exact returned expression is the Array.find predicate result.", [this.location(returned)]),
    );
    const findResultId = this.ensureElement(
      call,
      "call-result",
      ownerId,
      { method: "Array.find" },
      this.symbolId(call.expression.name),
      this.moduleFor(call.expression.name),
      null,
      "proven",
      proof("array-find-result", "This exact call result is the value returned by Array.prototype.find.", [this.location(call)]),
    );

    this.addRelation(receiverId, collectionElementId, "collection-element", [this.location(receiver), this.location(call)], proof("array-find-element", "The resolved Array.find receiver supplies one collection element identity.", [this.location(receiver), this.location(call)]), "proven");
    this.addRelation(collectionElementId, parameterId, "callback-parameter", [this.location(receiver), this.location(callback.parameters[0])], proof("array-find-callback", "The collection element binds to this exact Array.find callback parameter.", [this.location(receiver), this.location(callback.parameters[0])]), "proven");
    this.addRelation(predicateReadId, predicateResultId, "predicate-return", [this.location(predicateReads[0]), this.location(returned)], proof("array-find-predicate-return", "The parameter-rooted property read participates in this exact returned predicate expression.", [this.location(predicateReads[0]), this.location(returned)]), "proven");
    this.addRelation(predicateResultId, findResultId, "find-result", [this.location(returned), this.location(call)], proof("array-find-result", "The exact predicate result establishes the distinct Array.find result identity.", [this.location(returned), this.location(call)]), "proven");
    this.connectFunctionReturn(call, findResultId);
  }

  private connectFunctionReturn(call: TypeScript.CallExpression, findResultId: string): void {
    const returned = this.returnedByFunction(call);
    if (!returned) return;
    const { expression, declaration } = returned;
    const name = declaration.parent && this.ts.isVariableDeclaration(declaration.parent)
      && this.ts.isIdentifier(declaration.parent.name) ? declaration.parent.name : declaration.name;
    if (!name) return;
    const symbol = this.checker.getSymbolAtLocation(name);
    if (!symbol) return;
    const returnId = this.ensureElement(
      expression,
      "return-expression",
      this.ownerId(declaration),
      { role: "function return" },
      this.symbolId(name),
      null,
      null,
      "proven",
      proof("return-expression", "This exact expression is returned by the compiler-resolved accessor.", [this.location(expression), this.location(declaration)]),
    );
    this.addRelation(findResultId, returnId, "function-return", [this.location(call), this.location(declaration)], proof("return-expression", "The distinct Array.find result is this accessor's exact return expression.", [this.location(call), this.location(declaration)]), "proven");

    this.visit(declaration.getSourceFile(), (node) => {
      if (!this.ts.isCallExpression(node) || this.checker.getSymbolAtLocation(node.expression) !== symbol) return;
      const callId = this.elementFor(node, "call");
      this.addRelation(returnId, callId, "function-call", [this.location(expression), this.location(node)], proof("function-call", "The compiler resolves this exact call to the accessor with the exact return expression.", [this.location(expression), this.location(node)]), "proven");
    });
  }

  private connectSolidShow(node: TypeScript.JsxElement): void {
    const opening = node.openingElement;
    if (!this.isSolidShow(opening.tagName)) return;
    const whenAttributes = opening.attributes.properties.filter((item): item is TypeScript.JsxAttribute => (
      this.ts.isJsxAttribute(item) && this.staticAttributeName(item) === "when"
    ));
    if (whenAttributes.length !== 1) return;
    const initializer = whenAttributes[0].initializer;
    const when = initializer && this.ts.isJsxExpression(initializer) ? initializer.expression : null;
    if (!when || !this.ts.isCallExpression(when)) return;
    const renderExpressions = node.children.flatMap((child) => (
      this.ts.isJsxExpression(child) && child.expression && this.ts.isArrowFunction(child.expression) ? [child] : []
    ));
    if (renderExpressions.length !== 1) return;
    const render = renderExpressions[0].expression as TypeScript.ArrowFunction;
    if (render.parameters.length !== 1
      || !this.ts.isIdentifier(render.parameters[0].name)
      || render.parameters[0].dotDotDotToken
      || render.parameters[0].questionToken
      || render.parameters[0].initializer) return;
    const whenId = this.elementFor(when, "call");
    const parameterId = this.elementFor(render.parameters[0].name, "parameter");
    const bindingId = this.ensureElement(
      opening,
      "show-binding",
      this.ownerId(opening),
      { module: "solid-js", component: "Show" },
      this.symbolId(opening.tagName),
      "solid-js",
      null,
      "proven",
      proof("solid-show-binding", "The compiler resolves this exact JSX occurrence to solid-js Show.", [this.location(opening.tagName)]),
    );
    this.addRelation(whenId, bindingId, "show-when", [this.location(when), this.location(opening)], proof("solid-show-when", "This exact call is the when expression of the resolved solid-js Show occurrence.", [this.location(when), this.location(opening)]), "proven");
    this.addRelation(bindingId, parameterId, "show-render-parameter", [this.location(opening), this.location(render.parameters[0])], proof("solid-show-render-parameter", "The resolved Show binding supplies its exact direct render callback parameter.", [this.location(opening), this.location(render.parameters[0])]), "proven");
    const parameterSymbol = this.checker.getSymbolAtLocation(render.parameters[0].name);
    if (!parameterSymbol) return;
    this.visit(render.body, (child) => {
      if (!this.ts.isCallExpression(child) || this.checker.getSymbolAtLocation(child.expression) !== parameterSymbol) return;
      const callId = this.elementFor(child, "call");
      this.addRelation(parameterId, callId, "accessor-call", [this.location(render.parameters[0]), this.location(child)], proof("accessor-call", "The compiler resolves this exact accessor call to the Show render callback parameter.", [this.location(render.parameters[0]), this.location(child)]), "proven");
    });
  }

  private connectConsumer(node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement): void {
    const opening = this.ts.isJsxElement(node) ? node.openingElement : node;
    if (!this.targetFunction(opening.tagName)) return;
    for (const attribute of opening.attributes.properties) {
      if (!this.ts.isJsxAttribute(attribute) || !this.staticAttributeName(attribute)) continue;
      const initializer = attribute.initializer;
      const value = initializer && this.ts.isJsxExpression(initializer) ? initializer.expression : null;
      if (!value) continue;
      const valueId = this.expression(value, this.ownerId(opening));
      this.visit(value, (child) => {
        if (!this.ts.isPropertyAccessExpression(child)) return;
        const fieldId = this.elementFor(child, "field-read");
        this.addRelation(fieldId, valueId, "consumer-value", [this.location(child), this.location(value)], proof("jsx-consumer-value", "This exact field read participates in this exact JSX prop value expression.", [this.location(child), this.location(value)]), "proven");
      });
    }
  }

  private directParameterReads(expression: TypeScript.Expression, parameter: TypeScript.Symbol): TypeScript.PropertyAccessExpression[] {
    const matches: TypeScript.PropertyAccessExpression[] = [];
    this.visit(expression, (node) => {
      if (this.ts.isPropertyAccessExpression(node)
        && this.ts.isIdentifier(node.expression)
        && this.checker.getSymbolAtLocation(node.expression) === parameter) matches.push(node);
    });
    return matches;
  }

  private returnedByFunction(expression: TypeScript.Expression): { expression: TypeScript.Expression; declaration: TypeScript.FunctionLikeDeclaration } | null {
    const parent = expression.parent;
    if (this.ts.isArrowFunction(parent) && unwrap(this.ts, parent.body as TypeScript.Expression) === expression) {
      return { expression, declaration: parent };
    }
    if (this.ts.isReturnStatement(parent) && parent.expression === expression) {
      let current: TypeScript.Node | undefined = parent.parent;
      while (current) {
        const declaration = asFunctionLike(this.ts, current);
        if (declaration) return { expression, declaration };
        current = current.parent;
      }
    }
    return null;
  }

  private isArrayFind(name: TypeScript.Identifier): boolean {
    const symbol = this.checker.getSymbolAtLocation(name);
    return Boolean(symbol?.declarations?.some((declaration) => (
      declaration.getSourceFile().isDeclarationFile && /lib\.es\d+\.core\.d\.ts$/.test(declaration.getSourceFile().fileName)
    )));
  }

  private isSolidShow(tag: TypeScript.JsxTagNameExpression): boolean {
    const symbol = this.checker.getSymbolAtLocation(tag);
    const target = symbol && symbol.flags & this.ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol;
    return Boolean(target?.declarations?.some((declaration) => (
      declaration.getSourceFile().fileName.includes("/solid-js/") && target.getName() === "Show"
    )));
  }

  private staticAttributeName(attribute: TypeScript.JsxAttribute): string | null {
    return this.ts.isIdentifier(attribute.name) ? attribute.name.text : null;
  }

  private ownerId(node: TypeScript.Node): string | null {
    let current: TypeScript.Node | undefined = node;
    while (current) {
      const info = this.functionsByNode.get(nodeKey(this.root, current));
      if (info) return info.id;
      current = current.parent;
    }
    return null;
  }

  private visit(node: TypeScript.Node, callback: (node: TypeScript.Node) => void): void {
    callback(node);
    this.ts.forEachChild(node, (child) => this.visit(child, callback));
  }
}
