import * as TypeScript from "typescript";
import type {
  ProgramElementKind,
} from "./program-evidence";
import { ProgramEvidenceCollectorSupport } from "./program-evidence-collector-support";
import {
  asFunctionLike,
  bindingIdentifiers,
  containsJsx,
  firstBindingIdentifier,
  functionNameNode,
  functionOperation,
  isHandlerLike,
  nodeKey,
  parameterOriginRole,
  proof,
} from "./program-evidence-support";

export class ProgramEvidenceCollectorDeclarations extends ProgramEvidenceCollectorSupport {
  protected collectDeclarations(file: TypeScript.SourceFile): void {
    const visit = (node: TypeScript.Node, ownerId: string | null) => {
      this.noteAstUnit();
      let nextOwner = ownerId;
      const functionLike = asFunctionLike(this.ts, node);
      if (functionLike) {
        const info = this.addFunction(functionLike, ownerId);
        nextOwner = info.id;
        this.functionsByNode.set(nodeKey(this.root, node), info);
        const parentVariable =
          node.parent && this.ts.isVariableDeclaration(node.parent)
            ? node.parent
            : null;
        if (parentVariable) {
          const variableId = this.variableId(parentVariable);
          if (variableId) {
            this.addRelation(
              variableId,
              info.id,
              "definition",
              [this.location(node)],
              proof(
                "compiler-symbol",
                "The variable initializer is a compiler-resolved function declaration.",
                [this.location(node)],
              ),
              "proven",
            );
          }
        }
      }
      if (this.ts.isVariableDeclaration(node) && node.initializer) {
        this.addVariable(node, nextOwner);
      }
      this.ts.forEachChild(node, (child) => visit(child, nextOwner));
    };
    visit(file, null);
  }

  protected addFunction(
    node: TypeScript.FunctionLikeDeclaration,
    ownerId: string | null,
  ) {
    const nameNode = functionNameNode(this.ts, node);
    const name = nameNode?.getText(node.getSourceFile()) ?? "<anonymous>";
    const symbolId = nameNode ? this.symbolId(nameNode) : null;
    const component = /^[A-Z]/.test(name) && containsJsx(this.ts, node);
    const handler = !component && isHandlerLike(this.ts, this.checker, node, name);
    const kind: ProgramElementKind = component
      ? "component-definition"
      : handler
        ? "handler-entry"
        : "function-entry";
    const roles = [
      "function",
      ...(component ? ["component"] : []),
      ...(handler ? ["handler"] : []),
    ].join(",");
    const id = this.ensureElement(
      node,
      kind,
      ownerId,
      { role: roles, name },
      symbolId,
      null,
      null,
      component || handler ? "partial" : "proven",
      proof(
        symbolId ? "compiler-symbol" : "ast-node",
        "The source declaration identifies a function entry.",
        [this.location(node)],
      ),
    );
    const info = {
      declaration: node,
      id,
      symbolId,
      name,
      sourceFile: node.getSourceFile(),
      kind,
      component,
      handler,
    };
    this.functionsById.set(id, info);
    if (symbolId) this.functionsBySymbol.set(symbolId, info);
    for (const parameter of node.parameters) {
      for (const binding of bindingIdentifiers(this.ts, parameter.name)) {
        const originRole = parameterOriginRole(this.checker, parameter, handler);
        const bindingLocation = this.location(binding);
        const parameterId = this.ensureElement(
          binding,
          "parameter",
          id,
          {
            name: binding.text,
            ...(originRole ? { originRole } : {}),
          },
          this.symbolId(binding),
          null,
          null,
          "proven",
          proof(
            "compiler-symbol",
            "The parameter binding is declared by the function entry.",
            [bindingLocation],
          ),
        );
        const bindingSymbol = this.symbolId(binding);
        if (bindingSymbol) this.parametersBySymbol.set(bindingSymbol, parameterId);
        this.addRelation(
          id,
          parameterId,
          "declares-parameter",
          [bindingLocation],
          proof(
            "compiler-symbol",
            "The function declaration owns this parameter binding.",
            [bindingLocation],
          ),
          "proven",
        );
      }
    }
    const operation = functionOperation(name);
    if (operation) {
      const operationKind =
        operation === "validate"
          ? "validation"
          : operation === "serialize"
            ? "serialization"
            : operation === "parse"
              ? "parse"
              : operation === "selection"
                ? "selection"
                : "alias";
      const operationId = this.ensureElement(
        node,
        operationKind,
        id,
        { operation },
        symbolId,
        null,
        null,
        "partial",
        proof(
          "partial-classification",
          `The function name provides ${operation} evidence.`,
          [this.location(node)],
        ),
        operation,
      );
      this.addRelation(
        id,
        operationId,
        "performs",
        [this.location(node)],
        proof(
          "partial-classification",
          "The function declaration is classified as a named operation.",
          [this.location(node)],
        ),
        "partial",
      );
    }
    return info;
  }

  protected addVariable(
    node: TypeScript.VariableDeclaration,
    ownerId: string | null,
  ): void {
    const symbol = firstBindingIdentifier(this.ts, node.name);
    const symbolId = symbol ? this.symbolId(symbol) : null;
    const aliasId = this.ensureElement(
      node,
      "alias",
      ownerId,
      { name: node.name.getText(node.getSourceFile()) },
      symbolId,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The variable declaration names an aliased initializer.",
        [this.location(node)],
      ),
    );
    for (const binding of bindingIdentifiers(this.ts, node.name)) {
      const bindingId = this.symbolId(binding);
      if (bindingId) this.variablesBySymbol.set(bindingId, aliasId);
    }
  }
}
