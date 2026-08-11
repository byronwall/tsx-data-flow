import type { AnalysisCancellationToken } from "./cancellation";
import type { RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import type {
  ExactFieldTargetPolicy,
  FieldTransferElement,
  FieldTransferGraph,
  FieldTransferRelation,
  FieldTransferVerification,
} from "./route-totality-field-transfer-verifier";
import { buildTargetConsumerDescriptor, sameTargetConsumerDescriptor } from "./route-totality-field-target-consumer";

export function deriveComponentTargetPolicy(
  transfers: readonly RouteTotalityFieldTransformation[],
  graph: FieldTransferGraph,
  chain: "whole-object" | "scalar-alias",
): ExactFieldTargetPolicy | null {
  const collection = graph.element(transfers[1].toElementIds[0]);
  const predicateRelations = transfers[4].evidenceRelationIds.map((id) => graph.relation(id));
  const predicate = predicateRelations.length === 3 && predicateRelations[1] ? graph.element(predicateRelations[1].to) : undefined;
  const boundary = transfers[chain === "whole-object" ? 10 : 11];
  const final = transfers.at(-1)!;
  const consumerField = graph.element(chain === "whole-object" ? transfers[11].toElementIds[0] : final.fromElementIds[0]);
  const binding = graph.element(final.toElementIds[0]);
  const boundaryRelations = boundary.evidenceRelationIds.map((id) => graph.relation(id)).filter(Boolean) as FieldTransferRelation[];
  if (boundaryRelations.length !== 2) return null;
  const boundaryBinding = graph.element(boundaryRelations[0].to);
  const receiver = graph.element(boundaryRelations[1].to);
  const metadata = boundaryBinding?.componentBinding;
  const support = [...boundary.supportingElementIds, ...final.supportingElementIds]
    .map((id) => graph.element(id)).filter((element): element is FieldTransferElement => Boolean(element));
  const occurrence = metadata?.componentOccurrenceElementId ? graph.element(metadata.componentOccurrenceElementId) : undefined;
  const definition = metadata?.componentDefinitionId ? graph.element(metadata.componentDefinitionId) : undefined;
  const parameter = metadata?.parameterElementId ? graph.element(metadata.parameterElementId) : undefined;
  const sourceField = chain === "scalar-alias" ? graph.element(transfers[10].toElementIds[0]) : undefined;
  const renderTerminals = support.filter((element) => element.kind === "render-terminal");
  const consumerKind = consumerKindOf(binding);
  if (!collection?.fieldName || !predicate?.fieldName || !consumerField?.fieldName || !binding || binding.kind !== "field-consumer"
    || !metadata || metadata.candidateCount !== 1 || !metadata.componentOccurrenceElementId || !metadata.componentDefinitionId
    || !metadata.parameterElementId || !metadata.receiverElementId || boundaryBinding?.kind !== "component-prop-binding"
    || !occurrence || occurrence.kind !== "component-occurrence" || !definition || definition.kind !== "component-definition"
    || !parameter || parameter.kind !== "parameter" || !occurrence.symbol || occurrence.symbol !== definition.symbol
    || metadata.receiverElementId !== receiver?.id || receiver.kind !== "field-read" || receiver.fieldName !== metadata.propName
    || renderTerminals.length !== 1 || !consumerKind || (chain === "scalar-alias" && (!sourceField?.fieldName || metadata.valueMode !== "scalar-alias"))
    || (chain === "whole-object" && metadata.valueMode !== "whole-object")
    || boundaryRelations[0].from !== boundary.fromElementIds[0] || boundaryRelations[0].to !== boundaryBinding.id
    || boundaryRelations[1].from !== boundaryBinding.id || boundaryRelations[1].to !== receiver.id
    || !uniqueRelation(boundaryRelations[0], graph, NO_CANCEL) || !uniqueRelation(boundaryRelations[1], graph, NO_CANCEL)) return null;
  const ownership = [...boundary.supportingRelationIds, ...final.supportingRelationIds]
    .map((id) => graph.relation(id)).filter(Boolean) as FieldTransferRelation[];
  const occurrenceDefinitions = ownership.filter((relation) => relation.from === occurrence.id && relation.to === definition.id
    && relation.kind === "component-occurrence" && relation.proof.kind === "compiler-symbol" && exactRelation(relation));
  const consumerTerminalRelations = ownership.filter((relation) => relation.from === binding.id
    && relation.to === renderTerminals[0]?.id && relation.kind === "render-terminal"
    && relation.proof.kind === "field-consumer-terminal" && exactRelation(relation)
    && uniqueRelation(relation, graph, NO_CANCEL));
  const targetConsumer = buildTargetConsumerDescriptor(final.targetConsumer?.targetKey ?? "", {
    consumerField,
    consumerValue: binding,
    binding,
    occurrence: definition,
    definition,
    renderTerminal: renderTerminals[0],
    directConsumer: true,
  });
  if (occurrenceDefinitions.length !== 1 || consumerTerminalRelations.length !== 1
    || !ownedByDefinition(binding, definition, graph) || renderTerminals[0]?.ownerId !== binding.ownerId
    || !targetConsumer || !sameTargetConsumerDescriptor(final.targetConsumer, targetConsumer)) return null;
  return {
    transferKinds: transfers.map((transfer) => transfer.kind),
    chain,
    collectionFieldElementId: collection.id,
    collectionFieldName: collection.fieldName,
    predicateFieldElementId: predicate.id,
    predicateFieldName: predicate.fieldName,
    consumerFieldElementId: consumerField.id,
    consumerFieldName: consumerField.fieldName,
    consumerValueElementId: consumerField.id,
    bindingElementId: binding.id,
    componentOccurrenceElementId: occurrence.id,
    componentDefinitionElementId: definition.id,
    componentSymbol: occurrence.symbol,
    componentLabel: definition.label,
    propName: metadata.propName ?? "",
    renderTerminalElementId: renderTerminals[0].id,
    consumerKind,
    consumerLabel: consumerLabelOf(binding) ?? "",
    directConsumer: true,
    targetConsumer,
    consumerTerminalRelationId: consumerTerminalRelations[0].id,
    sourceFieldElementId: sourceField?.id,
    sourceFieldName: sourceField?.fieldName ?? undefined,
    currentValueElementId: transfers[9].toElementIds[0],
    componentReceiverElementId: receiver.id,
  };
}

function ownedByDefinition(
  element: FieldTransferElement,
  definition: FieldTransferElement,
  graph: FieldTransferGraph,
): boolean {
  let ownerId = element.ownerId;
  const visited = new Set<string>();
  while (ownerId && !visited.has(ownerId)) {
    if (ownerId === definition.id) return true;
    visited.add(ownerId);
    ownerId = graph.element(ownerId)?.ownerId;
  }
  return false;
}

export function verifyComponentBoundaryPattern(
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  transfer: RouteTotalityFieldTransformation,
  graph: FieldTransferGraph,
  cancellation: AnalysisCancellationToken,
  policy: ExactFieldTargetPolicy | null,
): FieldTransferVerification {
  if ((source.kind !== "call" && source.kind !== "field-read") || target.kind !== "field-read") return failure("Component boundary endpoints are not exact compiler values.");
  if (relations.length !== 2 || relations.some((relation) => relation.kind !== "component-prop-binding" || relation.proof.kind !== "component-prop-binding")) return failure("Component boundary requires two exact component-prop-binding relations.");
  const binding = graph.element(relations[0].to);
  const receiver = graph.element(relations[1].to);
  const metadata = binding?.componentBinding;
  const support = transfer.supportingElementIds.map((id) => graph.element(id)).filter(Boolean) as FieldTransferElement[];
  const occurrences = support.filter((element) => element.kind === "component-occurrence");
  const definitions = support.filter((element) => element.kind === "component-definition");
  const occurrence = occurrences.length === 1 ? occurrences[0] : undefined;
  const definition = definitions.length === 1 ? definitions[0] : undefined;
  const parameter = metadata?.parameterElementId ? graph.element(metadata.parameterElementId) : undefined;
  const metadataOccurrence = metadata?.componentOccurrenceElementId ? graph.element(metadata.componentOccurrenceElementId) : undefined;
  const metadataDefinition = metadata?.componentDefinitionId ? graph.element(metadata.componentDefinitionId) : undefined;
  if (!binding || binding.kind !== "component-prop-binding" || !metadata || metadata.candidateCount !== 1
    || !metadata.componentOccurrenceElementId || !metadata.componentDefinitionId || !metadata.parameterElementId || !metadata.receiverElementId
    || !receiver || receiver.kind !== "field-read" || receiver.id !== metadata.receiverElementId || receiver.fieldName !== metadata.propName
    || !parameter || parameter.kind !== "parameter" || !occurrence || occurrence.id !== metadataOccurrence?.id
    || !definition || definition.id !== metadataDefinition?.id || occurrence.kind !== "component-occurrence"
    || definition.kind !== "component-definition" || !occurrence.symbol || occurrence.symbol !== definition.symbol
    || !uniqueRelation(relations[0], graph, cancellation) || !uniqueRelation(relations[1], graph, cancellation)) return failure("Component boundary ownership is incomplete or ambiguous.");
  const ownership = transfer.supportingRelationIds.map((id) => graph.relation(id)).filter(Boolean) as FieldTransferRelation[];
  const exactOwnership = ownership.filter((relation) => relation.from === occurrence.id && relation.to === definition.id
    && relation.kind === "component-occurrence" && relation.proof.kind === "compiler-symbol" && exactRelation(relation));
  if (exactOwnership.length !== 1) return failure("Component boundary lacks one exact occurrence-definition relation.");
  if (policy && (policy.chain === "direct" || source.id !== (policy.sourceFieldElementId ?? policy.currentValueElementId)
    || target.id !== policy.componentReceiverElementId || occurrence.id !== policy.componentOccurrenceElementId
    || definition.id !== policy.componentDefinitionElementId)) return failure("Component boundary does not match the compiler-derived target policy.");
  cancellation.throwIfCancelled();
  return { ok: true };
}

const NO_CANCEL: AnalysisCancellationToken = { throwIfCancelled() {} };

function uniqueRelation(relation: FieldTransferRelation, graph: FieldTransferGraph, cancellation: AnalysisCancellationToken): boolean {
  let matches = 0;
  for (const candidate of graph.outgoing(relation.from)) {
    cancellation.throwIfCancelled();
    if (candidate.to === relation.to && candidate.kind === relation.kind && candidate.proof.kind === relation.proof.kind && candidate.status === "proven") matches += 1;
  }
  return matches === 1;
}

function exactRelation(relation: FieldTransferRelation): boolean {
  return relation.status === "proven" && relation.proof.status === "proven" && relation.proof.locations.length > 0;
}

function consumerKindOf(element: FieldTransferElement | undefined): "render" | "condition" | "handler" | null {
  const value = element?.consumerKind ?? element?.attributes?.consumerKind;
  return value === "render" || value === "condition" || value === "handler" ? value : null;
}

function consumerLabelOf(element: FieldTransferElement | undefined): string | null {
  const value = element?.consumerLabel ?? element?.attributes?.label;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function failure(detail: string): FieldTransferVerification { return { ok: false, detail }; }
