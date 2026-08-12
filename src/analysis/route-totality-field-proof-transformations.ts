import type { AnalysisCancellationToken } from "./cancellation";
import type { RouteTotalityFieldOrigin, RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import type { FieldProofCandidate } from "./route-totality-field-proof-candidate";
import type { FieldCarrierPath } from "./route-totality-field-proof-carrier";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { fieldTransformation } from "./route-totality-field-proof-result";
import { deriveTargetConsumerDescriptor } from "./route-totality-field-target-consumer";
import type { ExactFieldTransferKind } from "./route-totality-field-transfer-verifier";
import type { ProgramElement, ProgramRelation } from "./scope-seam";

export function assembleFieldProofTransformations(
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidate: FieldProofCandidate,
  carrier: FieldCarrierPath,
  cancellation: AnalysisCancellationToken,
): Array<RouteTotalityFieldTransformation | null> {
  if (candidate.boundary) return assembleComponentBoundaryTransformations(index, origin, candidate, carrier, cancellation);
  const source = index.byId(origin.elementId)!;
  const occurrenceRelation = candidate.directConsumer ? null : one(index.exactRelations(
    candidate.occurrence.id,
    candidate.definition.id,
    "component-occurrence",
    "compiler-symbol",
    cancellation,
  ));
  return [
    fieldTransformation("source-carrier", source, carrier.call, carrier.relations, [], [], cancellation),
    step(index, "property-read", carrier.call, candidate.collectionField, [["field-input", "property-access"]], cancellation),
    step(index, "find-element", candidate.collectionField, candidate.collectionElement, [["collection-element", "array-find-element"]], cancellation),
    step(index, "callback-parameter", candidate.collectionElement, candidate.parameter, [["callback-parameter", "array-find-callback"]], cancellation),
    chainedStep(index, "predicate-return", candidate.parameter, candidate.predicateResult, [
      [candidate.parameter, candidate.parameterValue, "references", "compiler-symbol"],
      [candidate.parameterValue, candidate.predicateField, "field-input", "property-access"],
      [candidate.predicateField, candidate.predicateResult, "predicate-return", "array-find-predicate-return"],
    ], cancellation),
    step(index, "find-result", candidate.predicateResult, candidate.findResult, [["find-result", "array-find-result"]], cancellation),
    chainedStep(index, "function-return", candidate.findResult, candidate.accessorCall, [
      [candidate.findResult, candidate.returnExpression, "function-return", "return-expression"],
      [candidate.returnExpression, candidate.accessorCall, "function-call", "function-call"],
    ], cancellation),
    step(index, "show-when", candidate.accessorCall, candidate.showBinding, [["show-when", "solid-show-when"]], cancellation),
    step(index, "show-render-prop", candidate.showBinding, candidate.currentParameter, [["show-render-parameter", "solid-show-render-parameter"]], cancellation),
    step(index, "accessor-call", candidate.currentParameter, candidate.currentCall, [["accessor-call", "accessor-call"]], cancellation),
    step(index, "nested-property-read", candidate.currentCall, candidate.consumerField, [["field-input", "property-access"]], cancellation),
    candidate.directConsumer
      ? directConsumerStep(index, candidate, cancellation)
      : componentConsumerStep(index, candidate, occurrenceRelation, cancellation),
  ];
}

function assembleComponentBoundaryTransformations(
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidate: FieldProofCandidate,
  carrier: FieldCarrierPath,
  cancellation: AnalysisCancellationToken,
): Array<RouteTotalityFieldTransformation | null> {
  const source = index.byId(origin.elementId)!;
  const boundary = candidate.boundary!;
  const occurrenceRelation = one(index.exactRelations(
    boundary.occurrence.id,
    boundary.definition.id,
    "component-occurrence",
    "compiler-symbol",
    cancellation,
  ));
  const valueToBinding = one(index.exactRelations(
    candidate.sourceField?.id ?? candidate.currentCall.id,
    boundary.binding.id,
    "component-prop-binding",
    "component-prop-binding",
    cancellation,
  ));
  const bindingToReceiver = boundary.receiver
    ? one(index.exactRelations(boundary.binding.id, boundary.receiver.id, "component-prop-binding", "component-prop-binding", cancellation))
    : null;
  const base: Array<RouteTotalityFieldTransformation | null> = [
    fieldTransformation("source-carrier", source, carrier.call, carrier.relations, [], [], cancellation),
    step(index, "property-read", carrier.call, candidate.collectionField, [["field-input", "property-access"]], cancellation),
    step(index, "find-element", candidate.collectionField, candidate.collectionElement, [["collection-element", "array-find-element"]], cancellation),
    step(index, "callback-parameter", candidate.collectionElement, candidate.parameter, [["callback-parameter", "array-find-callback"]], cancellation),
    chainedStep(index, "predicate-return", candidate.parameter, candidate.predicateResult, [
      [candidate.parameter, candidate.parameterValue, "references", "compiler-symbol"],
      [candidate.parameterValue, candidate.predicateField, "field-input", "property-access"],
      [candidate.predicateField, candidate.predicateResult, "predicate-return", "array-find-predicate-return"],
    ], cancellation),
    step(index, "find-result", candidate.predicateResult, candidate.findResult, [["find-result", "array-find-result"]], cancellation),
    chainedStep(index, "function-return", candidate.findResult, candidate.accessorCall, [
      [candidate.findResult, candidate.returnExpression, "function-return", "return-expression"],
      [candidate.returnExpression, candidate.accessorCall, "function-call", "function-call"],
    ], cancellation),
    step(index, "show-when", candidate.accessorCall, candidate.showBinding, [["show-when", "solid-show-when"]], cancellation),
    step(index, "show-render-prop", candidate.showBinding, candidate.currentParameter, [["show-render-parameter", "solid-show-render-parameter"]], cancellation),
    step(index, "accessor-call", candidate.currentParameter, candidate.currentCall, [["accessor-call", "accessor-call"]], cancellation),
  ];
  if (boundary.mode === "scalar-alias") {
    base.push(step(index, "component-source-field", candidate.currentCall, candidate.sourceField!, [["field-input", "property-access"]], cancellation));
    base.push(valueToBinding && bindingToReceiver
      ? fieldTransformation("component-boundary", candidate.sourceField!, boundary.receiver!, [valueToBinding, bindingToReceiver], [boundary.binding, boundary.occurrence, boundary.definition], occurrenceRelation ? [occurrenceRelation] : [], cancellation)
      : null);
  } else {
    base.push(valueToBinding && bindingToReceiver
      ? fieldTransformation("component-boundary", candidate.currentCall, boundary.receiver!, [valueToBinding, bindingToReceiver], [boundary.binding, boundary.occurrence, boundary.definition], occurrenceRelation ? [occurrenceRelation] : [], cancellation)
      : null);
  }
  if (boundary.mode === "whole-object") {
    base.push(step(index, "component-property-read", boundary.receiver!, candidate.consumerField, [["field-input", "property-access"]], cancellation));
  }
  base.push(candidate.directConsumer
    ? directConsumerStep(index, candidate, cancellation)
    : null);
  return base;
}

function directConsumerStep(
  index: RouteTotalityFieldProofIndex,
  candidate: FieldProofCandidate,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldTransformation | null {
  const relation = one(index.exactRelations(
    candidate.consumerField.id,
    candidate.binding.id,
    "consumer-value",
    candidate.binding.attributes?.consumerKind === "condition"
      ? "condition-consumer"
      : candidate.binding.attributes?.consumerKind === "handler" ? "handler-consumer" : "render-consumer",
    cancellation,
  ));
  const terminalRelation = index.consumerRenderTerminal(candidate.binding.id, candidate.renderTerminal.id);
  const targetConsumer = targetConsumerDescriptor(candidate);
  return relation && terminalRelation && targetConsumer
    ? fieldTransformation("occurrence-consumer", candidate.consumerField, candidate.binding, [relation], [candidate.occurrence, candidate.renderTerminal], [terminalRelation], cancellation, targetConsumer)
    : null;
}

function componentConsumerStep(
  index: RouteTotalityFieldProofIndex,
  candidate: FieldProofCandidate,
  occurrenceRelation: ProgramRelation | null,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldTransformation | null {
  const nestedConsumerRelations = [
    one(index.exactRelations(candidate.consumerField.id, candidate.consumerValue.id, "consumer-value", "jsx-consumer-value", cancellation)),
    one(index.exactRelations(candidate.consumerValue.id, candidate.binding.id, "component-prop-binding", "component-prop-binding", cancellation)),
  ];
  const wholeObjectConsumerRelation = candidate.boundary?.mode === "whole-object"
    ? one(index.exactRelations(candidate.consumerField.id, candidate.binding.id, "consumer-value", "render-consumer", cancellation))
    : null;
  const consumerRelations = nestedConsumerRelations.every(Boolean)
    ? nestedConsumerRelations
    : wholeObjectConsumerRelation ? [wholeObjectConsumerRelation] : nestedConsumerRelations;
  const terminalRelation = index.consumerRenderTerminal(candidate.consumerValue.id, candidate.renderTerminal.id);
  const targetConsumer = targetConsumerDescriptor(candidate);
  return consumerRelations.every(Boolean) && occurrenceRelation && terminalRelation && targetConsumer
    ? fieldTransformation(
      "occurrence-consumer",
      candidate.consumerField,
      candidate.binding,
      consumerRelations as ProgramRelation[],
      [candidate.occurrence, candidate.definition, candidate.renderTerminal],
      [occurrenceRelation, terminalRelation],
      cancellation,
      targetConsumer,
    )
    : null;
}

function targetConsumerDescriptor(candidate: FieldProofCandidate) {
  const descriptor = deriveTargetConsumerDescriptor(candidate.targetKey, {
    consumerField: candidate.consumerField,
    consumerValue: candidate.directConsumer ? candidate.binding : candidate.consumerValue,
    binding: candidate.binding,
    occurrence: candidate.occurrence,
    definition: candidate.definition,
    renderTerminal: candidate.renderTerminal,
    directConsumer: candidate.directConsumer,
  });
  return descriptor?.targetKey === candidate.targetKey ? descriptor : null;
}

function step(
  index: RouteTotalityFieldProofIndex,
  kind: ExactFieldTransferKind,
  from: ProgramElement,
  to: ProgramElement,
  relations: readonly (readonly [string, string])[],
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldTransformation | null {
  if (relations.length !== 1) return null;
  const relation = one(index.exactRelations(from.id, to.id, relations[0][0], relations[0][1], cancellation));
  return relation ? fieldTransformation(kind, from, to, [relation], [], [], cancellation) : null;
}

function chainedStep(
  index: RouteTotalityFieldProofIndex,
  kind: ExactFieldTransferKind,
  from: ProgramElement,
  to: ProgramElement,
  definitions: readonly (readonly [ProgramElement, ProgramElement, string, string])[],
  cancellation: AnalysisCancellationToken,
  supportElements: readonly ProgramElement[] = [],
  supportRelations: readonly ProgramRelation[] = [],
): RouteTotalityFieldTransformation | null {
  const relations = definitions.map(([source, target, relationKind, proofKind]) => one(
    index.exactRelations(source.id, target.id, relationKind, proofKind, cancellation),
  ));
  return relations.every(Boolean)
    ? fieldTransformation(kind, from, to, relations as ProgramRelation[], supportElements, supportRelations, cancellation)
    : null;
}

function one<T>(values: readonly T[]): T | null {
  return values.length === 1 ? values[0] : null;
}
