import * as TypeScript from "typescript";
import type { ProgramElementKind } from "./program-evidence";
import { ProgramEvidenceCollectorBoundaryProcessing } from "./program-evidence-collector-boundary-processing";
import {
  firstBindingIdentifier,
  isExitStatusAssignment,
  isSelectionOperator,
  jsxOpeningAncestor,
  nodeKey,
  proof,
} from "./program-evidence-support";

export class ProgramEvidenceCollectorJsxSupport extends ProgramEvidenceCollectorBoundaryProcessing {
  protected collectNodes(file: TypeScript.SourceFile): void {
    const visit = (node: TypeScript.Node, ownerId: string | null) => {
      this.noteAstUnit();
      const info = this.functionsByNode.get(nodeKey(this.root, node));
      const nextOwner = info?.id ?? ownerId;
      if (this.ts.isVariableDeclaration(node) && node.initializer) {
        this.processVariable(node, nextOwner);
      }
      if (this.ts.isCallExpression(node)) {
        this.processCall(node, nextOwner);
      }
      if (this.ts.isNewExpression(node)) {
        this.processNew(node, nextOwner);
      }
      if (this.ts.isPropertyAccessExpression(node)) {
        this.processProperty(node, nextOwner);
      }
      if (this.ts.isElementAccessExpression(node)) {
        this.processIndex(node, nextOwner);
      }
      if (this.ts.isObjectLiteralExpression(node)) {
        this.processObject(node, nextOwner);
      }
      if (this.ts.isConditionalExpression(node)) {
        this.processSelection(node, nextOwner);
      }
      if (
        this.ts.isBinaryExpression(node) &&
        isSelectionOperator(this.ts, node.operatorToken.kind)
      ) {
        this.processSelection(node, nextOwner);
      }
      if (
        this.ts.isBinaryExpression(node) &&
        isExitStatusAssignment(this.ts, node)
      ) {
        this.processExitStatusAssignment(node, nextOwner);
      }
      if (this.ts.isReturnStatement(node)) {
        this.processReturn(node, nextOwner);
      }
      if (this.ts.isJsxElement(node) || this.ts.isJsxSelfClosingElement(node)) {
        this.measurePhase("renderComponents", 1, () => this.processJsx(node, nextOwner));
      }
      if (this.ts.isJsxExpression(node) && node.expression) {
        this.measurePhase("renderComponents", 1, () => this.processJsxExpression(node, nextOwner));
      }
      this.ts.forEachChild(node, (child) => visit(child, nextOwner));
    };
    visit(file, null);
  }

  protected processJsx(
    node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement,
    ownerId: string | null,
  ): void {
    const opening = this.ts.isJsxElement(node) ? node.openingElement : node;
    const tag = opening.tagName.getText(node.getSourceFile());
    const target = this.targetFunction(opening.tagName);
    const kind: ProgramElementKind = target
      ? "component-occurrence"
      : "jsx-occurrence";
    const occurrenceId = this.ensureElement(
      opening,
      kind,
      ownerId,
      { tag, intrinsic: !target },
      this.symbolId(opening.tagName),
      null,
      target?.id ?? null,
      target ? "proven" : "partial",
      proof(
        target ? "compiler-symbol" : "jsx-tag",
        target
          ? "The JSX tag resolves to an in-project component definition."
          : "The JSX tag is a source-backed render occurrence.",
        [this.location(opening)],
      ),
    );
    if (ownerId) {
      this.addRelation(
        ownerId,
        occurrenceId,
        "renders",
        [this.location(opening)],
        proof(
          "jsx-tag",
          "The containing function owns this JSX occurrence.",
          [this.location(opening)],
        ),
        "proven",
      );
    }
    if (target) {
      this.addRelation(
        occurrenceId,
        target.id,
        "component-occurrence",
        [this.location(opening.tagName)],
        proof(
          "compiler-symbol",
          "The JSX tag resolves to the component definition.",
          [this.location(opening.tagName)],
        ),
        "proven",
      );
    }
    for (const attribute of opening.attributes.properties) {
      this.checkCancellation();
      if (
        !this.ts.isJsxAttribute(attribute) ||
        !attribute.initializer ||
        !this.ts.isJsxExpression(attribute.initializer) ||
        !attribute.initializer.expression
      ) {
        continue;
      }
      const valueId = this.expression(attribute.initializer.expression, ownerId);
      this.addRelation(
        valueId,
        occurrenceId,
        target ? "component-prop" : "render-terminal",
        [this.location(attribute)],
        proof(
          "jsx-tag",
          target
            ? "The JSX attribute binds a component prop."
            : "The JSX attribute reaches an intrinsic render occurrence.",
          [this.location(attribute)],
        ),
        target ? "proven" : "partial",
      );
      if (!target) {
        this.addTerminal(
          attribute.initializer.expression,
          ownerId,
          "dom-attribute",
          attribute.name.getText(),
          valueId,
        );
      }
    }
  }

  protected processJsxExpression(
    node: TypeScript.JsxExpression,
    ownerId: string | null,
  ): void {
    if (!node.expression) return;
    const valueId = this.expression(node.expression, ownerId);
    const opening = jsxOpeningAncestor(this.ts, node);
    if (!opening) return;
    const target = this.targetFunction(opening.tagName);
    if (target) {
      this.addRelation(
        valueId,
        this.elementFor(opening, "component-occurrence"),
        "component-prop",
        [this.location(node)],
        proof(
          "jsx-tag",
          "The JSX child binds a component occurrence.",
          [this.location(node)],
        ),
        "proven",
      );
    } else {
      this.addTerminal(
        node.expression,
        ownerId,
        "jsx-text",
        opening.tagName.getText(node.getSourceFile()),
        valueId,
      );
    }
  }

  protected addTerminal(
    node: TypeScript.Expression,
    ownerId: string | null,
    terminalKind: "jsx-text" | "dom-attribute" | "style",
    label: string,
    valueId: string,
  ): void {
    const kind: ProgramElementKind = terminalKind === "jsx-text"
      ? "render-terminal"
      : "dom-terminal";
    const terminalId = this.ensureElement(
      node,
      kind,
      ownerId,
      { terminalKind, label },
      null,
      null,
      null,
      "proven",
      proof(
        "jsx-tag",
        "The intrinsic JSX expression is a render terminal.",
        [this.location(node)],
      ),
    );
    this.addRelation(
      valueId,
      terminalId,
      "render-terminal",
      [this.location(node)],
      proof(
        "jsx-tag",
        "The value expression reaches the intrinsic DOM terminal.",
        [this.location(node)],
      ),
      "proven",
    );
  }

  protected connectCalls(): void {
    for (const call of this.calls) {
      this.checkCancellation();
      if (call.target) {
        for (const parameter of call.target.declaration.parameters) {
          this.checkCancellation();
          const index = call.target.declaration.parameters.indexOf(parameter);
          const argument = call.node.arguments?.[index];
          const binding = firstBindingIdentifier(this.ts, parameter.name);
          const parameterId = binding
            ? this.parametersBySymbol.get(this.symbolId(binding) ?? "")
            : null;
          if (!argument || !parameterId) continue;
          const argumentId = this.expression(argument, call.ownerId);
          this.addRelation(
            argumentId,
            parameterId,
            "argument-binding",
            [this.location(argument), this.location(parameter)],
            proof(
              "argument-binding",
              "The compiler-resolved call argument binds to the target parameter.",
              [this.location(argument), this.location(parameter)],
            ),
            "proven",
          );
        }
        for (const returnId of this.returnsByFunction.get(call.target.id) ?? []) {
          this.checkCancellation();
          this.addRelation(
            returnId,
            call.id,
            "return-value",
            [this.location(call.node)],
            proof(
              "return-expression",
              "The call target has a source-backed return expression.",
              [this.location(call.node)],
            ),
            "proven",
          );
        }
      }
    }
  }

  protected connectPendingReferences(): void {
    for (const reference of this.references) {
      this.checkCancellation();
      const target = reference.symbolId
        ? this.variablesBySymbol.get(reference.symbolId)
        : null;
      if (target) {
        this.addRelation(
          target,
          reference.id,
          "references",
          [this.location(reference.node)],
          proof(
            "compiler-symbol",
            "The reference resolves to a source variable declaration.",
            [this.location(reference.node)],
          ),
          "proven",
        );
      }
    }
  }
}
