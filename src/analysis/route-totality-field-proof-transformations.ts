import type { AnalysisCancellationToken } from "./cancellation";
import type { RouteTotalityFieldOrigin, RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import type { FieldProofCandidate } from "./route-totality-field-proof-candidate";
import type { FieldCarrierPath } from "./route-totality-field-proof-carrier";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { fieldTransformation } from "./route-totality-field-proof-result";
import type { ExactFieldTransferKind } from "./route-totality-field-transfer-verifier";
import type { ProgramElement, ProgramRelation } from "./scope-seam";

export function assembleFieldProofTransformations(
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidate: FieldProofCandidate,
  carrier: FieldCarrierPath,
  cancellation: AnalysisCancellationToken,
): Array<RouteTotalityFieldTransformation | null> {
  const source = index.byId(origin.elementId)!;
  const occurrenceRelation = one(index.exactRelations(
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
    chainedStep(index, "occurrence-consumer", candidate.consumerField, candidate.binding, [
      [candidate.consumerField, candidate.consumerValue, "consumer-value", "jsx-consumer-value"],
      [candidate.consumerValue, candidate.binding, "component-prop-binding", "component-prop-binding"],
    ], cancellation, [candidate.occurrence, candidate.definition, candidate.renderTerminal], occurrenceRelation ? [occurrenceRelation] : []),
  ];
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
