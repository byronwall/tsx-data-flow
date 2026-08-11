import * as TypeScript from "typescript";
import { ProgramEvidenceCollectorComponentBindingSupport } from "./program-evidence-collector-component-binding";
import { nodeKey, proof } from "./program-evidence-support";
import { resolveHandlerAction } from "./program-evidence-handler-resolution";
import {
  conditionAttributes,
  conditionExpression,
  containsJsx,
  propertyReads,
} from "./program-evidence-collector-field-consumer-support";

/** Collect exact field consumers for JSX targets without component prop bindings. */
export class ProgramEvidenceCollectorDirectConsumerSupport extends ProgramEvidenceCollectorComponentBindingSupport {
  protected connectDirectConsumers(node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement): void {
    const opening = this.ts.isJsxElement(node) ? node.openingElement : node;
    const tagName = opening.tagName.getText(opening.getSourceFile());
    for (const attribute of opening.attributes.properties) {
      if (!this.ts.isJsxAttribute(attribute) || !this.ts.isIdentifier(attribute.name)) continue;
      const initializer = attribute.initializer;
      const value = initializer && this.ts.isJsxExpression(initializer) ? initializer.expression : null;
      if (!value) continue;
      const attributeName = attribute.name.text;
      const attributeLocation = this.location(attribute);
      const componentBindingKey = `${attributeLocation.file}:${attributeLocation.span.startLine}:${attributeLocation.span.startColumn}:${attributeLocation.span.endLine}:${attributeLocation.span.endColumn}:component-prop-binding`;
      const hasComponentBinding = this.elementIdsByNodeKind.has(componentBindingKey);
      const handler = /^on[A-Z]/.test(attributeName);
      const reads = propertyReads(this.ts, value);
      if (reads.length === 0 || (this.targetFunction(opening.tagName) && containsJsx(this.ts, value))) continue;
      if (handler && reads.length !== 1) continue;
      const read = reads[0];
      const conditionValue = conditionExpression(this.ts, read, value);
      const condition = Boolean(conditionValue);
      if (!condition && !handler && this.targetFunction(opening.tagName) && hasComponentBinding) continue;
      const action = handler ? resolveHandlerAction(this.ts, this.checker, this.root, read, value) : null;
      if (handler && !action) continue;
      const kind = condition ? "condition" : handler ? "handler" : "render";
      const actionCall = action ? this.elementFor(action.call, "call") : null;
      for (const fieldRead of handler ? [read] : reads) {
        const consumerId = this.ensureElement(
          fieldRead,
          "field-consumer",
          this.componentOwnerId(opening),
          {
            consumerKind: kind,
            tagName,
            propName: attributeName,
            label: action ? `${action.name}.${action.property}` : `${tagName}.${attributeName}`,
            ...(condition ? conditionAttributes(this.ts, conditionValue!, node) : {}),
            ...(action ? {
              actionName: action.name,
              argumentName: action.property,
              handlerReceiverSymbol: action.receiverSymbolId,
              handlerMethodSymbol: action.methodSymbolId,
              handlerReceiverName: action.receiverName,
              handlerPayloadObject: action.payloadObjectIdentity,
              handlerCalleeSymbol: action.calleeSymbolId,
              handlerActionArgumentSymbol: action.actionArgumentSymbolId,
              handlerForwardedParameterSymbol: action.forwardedParameterSymbolId,
            } : {}),
          },
          this.symbolId(opening.tagName),
          this.moduleFor(opening.tagName),
          this.targetFunction(opening.tagName)?.id ?? null,
          "proven",
          proof(
            condition ? "condition-consumer" : handler ? "handler-consumer" : "render-consumer",
            "The compiler identifies one exact field expression at this consumer site.",
            [this.location(fieldRead), this.location(value)],
          ),
        );
        this.addRelation(
          this.elementFor(fieldRead, "field-read"),
          consumerId,
          "consumer-value",
          [this.location(fieldRead), this.location(value)],
          proof(
            condition ? "condition-consumer" : handler ? "handler-consumer" : "render-consumer",
            "The exact field expression is used by this occurrence-owned consumer.",
            [this.location(fieldRead), this.location(value)],
          ),
          "proven",
        );
        if (actionCall) {
          this.addRelation(
            consumerId,
            actionCall,
            "argument",
            [this.location(fieldRead), this.location(action!.call)],
            proof("handler-consumer", "The exact handler field expression reaches the resolved action call.", [this.location(fieldRead), this.location(action!.call)]),
            "proven",
          );
        }
      }
    }
  }

  protected componentOwnerId(node: TypeScript.Node): string | null {
    let current: TypeScript.Node | undefined = node;
    while (current) {
      const info = this.functionsByNode.get(nodeKey(this.root, current));
      if (info?.component) return info.id;
      current = current.parent;
    }
    return this.ownerId(node);
  }

  protected ownerId(node: TypeScript.Node): string | null {
    let current: TypeScript.Node | undefined = node;
    while (current) {
      const info = this.functionsByNode.get(nodeKey(this.root, current));
      if (info) return info.id;
      current = current.parent;
    }
    return null;
  }
}
