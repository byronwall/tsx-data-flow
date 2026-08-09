import * as TypeScript from "typescript";
import { ProgramEvidenceCollectorCallSupport } from "./program-evidence-collector-call-support";
import {
  propertyBase,
  proof,
  responseReturnRole,
} from "./program-evidence-support";
import { indexReadAttributes } from "./program-index-read-metadata";

export class ProgramEvidenceCollectorBoundaryProcessing extends ProgramEvidenceCollectorCallSupport {
  protected processProperty(
    node: TypeScript.PropertyAccessExpression,
    ownerId: string | null,
  ): void {
    const fieldId = this.ensureElement(
      node,
      "field-read",
      ownerId,
      { property: node.name.text },
      this.symbolId(node.name),
      this.moduleFor(node.name),
      null,
      "proven",
      proof(
        "property-access",
        "The property access is compiler-backed syntax.",
        [this.location(node)],
      ),
      "field-read",
    );
    const receiverId = this.expression(node.expression, ownerId);
    this.addRelation(
      receiverId,
      fieldId,
      "field-input",
      [this.location(node.expression)],
      proof(
        "property-access",
        "The receiver supplies the property-read value.",
        [this.location(node)],
      ),
      "proven",
    );
    const environmentBase = propertyBase(this.ts, node, [
      "process.env",
      "import.meta.env",
    ]);
    if (environmentBase) {
      const baseIsValue = environmentBase === node;
      const inputId = this.specialInput(
        environmentBase,
        "environment-input",
        ownerId,
        { key: null },
        "host-api",
        "The exact environment property is a source-backed process input.",
      );
      this.addRelation(
        inputId,
        fieldId,
        "references",
        [this.location(environmentBase), this.location(node)],
        proof(
          "host-api",
          "The environment input is connected to its property occurrence.",
          [this.location(environmentBase), this.location(node)],
        ),
        "proven",
      );
      if (!baseIsValue) {
        const propertyInputId = this.specialInput(
          node,
          "environment-input",
          ownerId,
          { key: node.name.text },
          "host-api",
          "The environment property value is a source-backed input.",
        );
        this.addRelation(
          propertyInputId,
          fieldId,
          "references",
          [this.location(node)],
          proof(
            "host-api",
            "The environment property value is connected to its field occurrence.",
            [this.location(node)],
          ),
          "proven",
        );
      }
    }
    const processBase = propertyBase(this.ts, node, [
      "process.argv",
      "process.stdin",
    ]);
    if (processBase) {
      const inputId = this.specialInput(
        processBase,
        "process-input",
        ownerId,
        { name: processBase.getText(node.getSourceFile()) },
        "host-api",
        "The exact process property is a source-backed process input.",
      );
      this.addRelation(
        inputId,
        fieldId,
        "references",
        [this.location(processBase), this.location(node)],
        proof(
          "host-api",
          "The process input is connected to its property occurrence.",
          [this.location(processBase), this.location(node)],
        ),
        "proven",
      );
    }
  }

  protected processIndex(
    node: TypeScript.ElementAccessExpression,
    ownerId: string | null,
  ): void {
    const id = this.ensureElement(
      node,
      "index-read",
      ownerId,
      indexReadAttributes(this.ts, node),
      this.symbolId(node.expression),
      null,
      null,
      "proven",
      proof(
        "property-access",
        "The element access is source-backed syntax.",
        [this.location(node)],
      ),
      "index-read",
    );
    this.addRelation(
      this.expression(node.expression, ownerId),
      id,
      "field-input",
      [this.location(node.expression)],
      proof(
        "property-access",
        "The indexed receiver supplies the read value.",
        [this.location(node)],
      ),
      "proven",
    );
    const receiverText = node.expression.getText(node.getSourceFile());
    if (receiverText === "process.env") {
      const inputId = this.specialInput(
        node.expression,
        "environment-input",
        ownerId,
        { key: null },
        "host-api",
        "The exact process.env property is a source-backed input.",
      );
      this.addRelation(
        inputId,
        id,
        "references",
        [this.location(node.expression), this.location(node)],
        proof(
          "host-api",
          "The environment input is connected to its indexed value occurrence.",
          [this.location(node.expression), this.location(node)],
        ),
        "proven",
      );
    } else if (receiverText === "process.argv" || receiverText === "process.stdin") {
      const inputId = this.specialInput(
        node.expression,
        "process-input",
        ownerId,
        { name: receiverText },
        "host-api",
        "The exact process property is a source-backed input.",
      );
      this.addRelation(
        inputId,
        id,
        "references",
        [this.location(node.expression), this.location(node)],
        proof(
          "host-api",
          "The process input is connected to its indexed value occurrence.",
          [this.location(node.expression), this.location(node)],
        ),
        "proven",
      );
    }
    if (
      !node.argumentExpression ||
      (!this.ts.isStringLiteral(node.argumentExpression) &&
        !this.ts.isNumericLiteral(node.argumentExpression))
    ) {
      this.gap(
        id,
        "forward",
        "unsupported-syntax",
        "The computed index is not a static source key.",
        node.argumentExpression ?? node,
      );
    }
  }

  protected processObject(
    node: TypeScript.ObjectLiteralExpression,
    ownerId: string | null,
  ): void {
    const packId = this.ensureElement(
      node,
      "object-pack",
      ownerId,
      { operation: "object-pack" },
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The object literal packs source-backed fields.",
        [this.location(node)],
      ),
      "object-pack",
    );
    for (const property of node.properties) {
      if (this.ts.isPropertyAssignment(property)) {
        this.addRelation(
          this.expression(property.initializer, ownerId),
          packId,
          "pack-field",
          [this.location(property)],
          proof(
            "ast-node",
            "The property assignment contributes to the object pack.",
            [this.location(property)],
          ),
          "proven",
        );
      } else if (this.ts.isSpreadAssignment(property)) {
        this.addRelation(
          this.expression(property.expression, ownerId),
          packId,
          "pack-field",
          [this.location(property)],
          proof(
            "ast-node",
            "The spread assignment contributes to the object pack.",
            [this.location(property)],
          ),
          "proven",
        );
      }
    }
  }

  protected processSelection(
    node: TypeScript.ConditionalExpression | TypeScript.BinaryExpression,
    ownerId: string | null,
  ): void {
    const operator = this.ts.isConditionalExpression(node)
      ? "conditional"
      : node.operatorToken.getText(node.getSourceFile());
    const id = this.ensureElement(
      node,
      "selection",
      ownerId,
      { operator },
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The source expression selects between values or branches.",
        [this.location(node)],
      ),
      "selection",
    );
    const parts = this.ts.isConditionalExpression(node)
      ? [node.condition, node.whenTrue, node.whenFalse]
      : [node.left, node.right];
    for (const part of parts) {
      this.addRelation(
        this.expression(part, ownerId),
        id,
        "references",
        [this.location(part)],
        proof(
          "ast-node",
          "The branch expression contributes to the selection.",
          [this.location(part)],
        ),
        "proven",
      );
    }
  }

  protected processExitStatusAssignment(
    node: TypeScript.BinaryExpression,
    ownerId: string | null,
  ): void {
    const terminalId = this.specialInput(
      node,
      "exit-status",
      ownerId,
      {
        property: "process.exitCode",
        operator: node.operatorToken.getText(node.getSourceFile()),
      },
      "host-api",
      "Assignment to process.exitCode is an exit-status terminal.",
    );
    const valueId = this.expression(node.right, ownerId);
    this.addRelation(
      valueId,
      terminalId,
      "effect-input",
      [this.location(node.right), this.location(node)],
      proof(
        "host-api",
        "The assigned value reaches process.exitCode at this source assignment.",
        [this.location(node.right), this.location(node)],
      ),
      "proven",
    );
  }

  protected processReturn(
    node: TypeScript.ReturnStatement,
    ownerId: string | null,
  ): void {
    if (!ownerId) return;
    const terminalRole = node.expression
      ? responseReturnRole(this.ts, node.expression)
      : null;
    const returnId = this.ensureElement(
      node,
      "return",
      ownerId,
      {
        name: "return",
        ...(terminalRole ? { terminalRole } : {}),
      },
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The return statement is owned by the containing function.",
        [this.location(node)],
      ),
    );
    const values = this.returnsByFunction.get(ownerId) ?? [];
    if (!values.includes(returnId)) values.push(returnId);
    this.returnsByFunction.set(ownerId, values);
    if (node.expression) {
      this.addRelation(
        this.expression(node.expression, ownerId),
        returnId,
        "return-expression",
        [this.location(node.expression)],
        proof(
          "return-expression",
          "The return expression supplies the function return.",
          [this.location(node)],
        ),
        "proven",
      );
    }
  }
}
