import * as TypeScript from "typescript";
import type { CollectorFunctionInfo } from "./program-evidence-collector-support";
import { ProgramEvidenceCollectorBoundaryProcessing } from "./program-evidence-collector-boundary-processing";
import { proof } from "./program-evidence-support";

type PendingComponentPropBinding = {
  opening: TypeScript.JsxOpeningLikeElement;
  attribute: TypeScript.JsxAttribute;
  valueId: string;
  occurrenceId: string;
  ownerId: string | null;
  target: CollectorFunctionInfo;
};

type ComponentPropReceiver = {
  node: TypeScript.PropertyAccessExpression;
  elementId: string;
  parameterId: string;
  parameter: TypeScript.ParameterDeclaration;
};

/** Collect exact JSX-to-component parameter member evidence after node facts exist. */
export class ProgramEvidenceCollectorComponentBindingSupport extends ProgramEvidenceCollectorBoundaryProcessing {
  protected readonly pendingComponentPropBindings: PendingComponentPropBinding[] = [];

  protected queueComponentPropBinding(
    opening: TypeScript.JsxOpeningLikeElement,
    attribute: TypeScript.JsxAttribute,
    valueId: string,
    occurrenceId: string,
    ownerId: string | null,
    target: CollectorFunctionInfo,
  ): void {
    this.pendingComponentPropBindings.push({ opening, attribute, valueId, occurrenceId, ownerId, target });
  }

  protected connectComponentPropBindings(): void {
    for (const pending of this.pendingComponentPropBindings) {
      this.checkCancellation();
      const propName = staticPropName(this.ts, pending.attribute);
      if (!propName) continue;
      const receivers = this.componentPropReceivers(pending.target, propName);
      if (receivers.length === 0) continue;
      const bindingId = this.ensureElement(
        pending.attribute,
        "component-prop-binding",
        pending.ownerId,
        {
          propName,
          componentOccurrenceElementId: pending.occurrenceId,
          componentDefinitionId: pending.target.id,
          parameterElementId: receivers.length === 1 ? receivers[0].parameterId : null,
          receiverElementId: receivers.length === 1 ? receivers[0].elementId : null,
          candidateCount: receivers.length,
        },
        null,
        null,
        pending.target.id,
        "proven",
        proof(
          "component-prop-binding",
          "The static JSX prop has explicit in-project component parameter member evidence.",
          [
            this.location(pending.opening),
            this.location(pending.attribute),
            ...receivers.flatMap((receiver) => [this.location(receiver.parameter), this.location(receiver.node)]),
          ],
        ),
      );
      this.addRelation(
        pending.valueId,
        bindingId,
        "component-prop-binding",
        [this.location(pending.attribute), ...receivers.map((receiver) => this.location(receiver.node))],
        proof(
          "component-prop-binding",
          "The component-prop value reaches one occurrence-specific binding element with compiler-backed receiver evidence.",
          [this.location(pending.attribute), ...receivers.flatMap((receiver) => [this.location(receiver.parameter), this.location(receiver.node)])],
        ),
        "proven",
      );
      for (const receiver of receivers) {
        this.checkCancellation();
        this.addRelation(
          bindingId,
          receiver.elementId,
          "component-prop-binding",
          [this.location(pending.attribute), this.location(receiver.node), this.location(receiver.parameter)],
          proof(
            "component-prop-binding",
            "The binding element points to the parameter-rooted receiver by compiler symbol and property evidence.",
            [this.location(pending.attribute), this.location(receiver.node), this.location(receiver.parameter)],
          ),
          "proven",
        );
      }
    }
    this.pendingComponentPropBindings.length = 0;
    this.checkCancellation();
  }

  private componentPropReceivers(
    target: CollectorFunctionInfo,
    propName: string,
  ): ComponentPropReceiver[] {
    this.checkCancellation();
    if (target.declaration.parameters.length !== 1) return [];
    const parameter = target.declaration.parameters[0];
    if (!this.ts.isIdentifier(parameter.name) || parameter.dotDotDotToken || parameter.questionToken || parameter.initializer) return [];
    const parameterSymbol = this.checker.getSymbolAtLocation(parameter.name);
    const parameterId = parameterSymbol
      ? this.parametersBySymbol.get(this.symbolId(parameter.name) ?? "") ?? null
      : null;
    if (!parameterSymbol || !parameterId) return [];
    const parameterType = this.checker.getTypeAtLocation(parameter.name);
    const expectedProperty = this.checker.getPropertyOfType(parameterType, propName);
    if (!expectedProperty || expectedProperty.flags & this.ts.SymbolFlags.Optional) return [];

    const receivers: ComponentPropReceiver[] = [];
    const visit = (node: TypeScript.Node) => {
      this.checkCancellation();
      if (node !== target.declaration && this.ts.isFunctionLike(node)) return;
      if (
        this.ts.isPropertyAccessExpression(node)
        && !node.questionDotToken
        && this.ts.isIdentifier(node.expression)
        && node.name.text === propName
        && sameCompilerSymbol(this.checker, this.checker.getSymbolAtLocation(node.expression), parameterSymbol)
        && sameCompilerSymbol(this.checker, this.checker.getSymbolAtLocation(node.name), expectedProperty)
      ) {
        receivers.push({
          node,
          elementId: this.elementFor(node, "field-read"),
          parameterId,
          parameter,
        });
      }
      this.ts.forEachChild(node, visit);
    };
    visit(target.declaration);
    this.checkCancellation();
    return receivers;
  }
}

function staticPropName(ts: typeof TypeScript, attribute: TypeScript.JsxAttribute): string | null {
  return ts.isIdentifier(attribute.name) ? attribute.name.text : null;
}

function sameCompilerSymbol(
  checker: TypeScript.TypeChecker,
  left: TypeScript.Symbol | undefined,
  right: TypeScript.Symbol | undefined,
): boolean {
  return Boolean(left && right && (left === right || checker.getFullyQualifiedName(left) === checker.getFullyQualifiedName(right)));
}
