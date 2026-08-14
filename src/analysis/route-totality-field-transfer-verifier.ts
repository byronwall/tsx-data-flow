import type { AnalysisCancellationToken } from "./cancellation";
import type { RouteTotalityFieldTargetConsumer, RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import type { ComponentBindingMetadata } from "./program-component-binding-metadata";
import type { EvidenceProof, EvidenceStatus, SourceLocation } from "./scope-seam";
import { deriveComponentTargetPolicy, verifyComponentBoundaryPattern } from "./route-totality-field-transfer-component-verifier";
import { verifyExactSourceCarrier } from "./route-totality-field-transfer-carrier-verifier";
import { deriveTargetConsumerDescriptor, sameTargetConsumerDescriptor } from "./route-totality-field-target-consumer";

export const EXACT_FIELD_TRANSFER_KINDS = [
  "source-carrier",
  "property-read",
  "find-element",
  "callback-parameter",
  "predicate-return",
  "find-result",
  "function-return",
  "show-when",
  "show-render-prop",
  "accessor-call",
  "nested-property-read",
  "occurrence-consumer",
] as const;
export const SCALAR_FIELD_TRANSFER_KINDS = ["source-carrier", "property-read", "scalar-consumer"] as const;

export const COMPONENT_FIELD_TRANSFER_KINDS = [
  ...EXACT_FIELD_TRANSFER_KINDS.slice(0, 10),
  "component-source-field",
  "component-boundary",
  "component-property-read",
  "occurrence-consumer",
] as const;

export type ExactFieldTransferKind = typeof EXACT_FIELD_TRANSFER_KINDS[number]
  | "component-source-field"
  | "component-boundary"
  | "component-property-read"
  | "scalar-consumer";

export type FieldTransferElement = {
  id: string;
  kind: string;
  label: string;
  fieldName: string | null;
  operationKind: string | null;
  symbol: string | null;
  module?: string | null;
  ownerId?: string | null;
  status: EvidenceStatus;
  proof: readonly EvidenceProof[];
  location: SourceLocation;
  componentBinding: ComponentBindingMetadata | null;
  handlerIdentity?: {
    receiverName: string;
    receiverSymbol: string;
    methodSymbol: string;
    calleeSymbol: string | null;
    actionArgumentSymbol: string | null;
    payloadObject: string;
    forwardedParameterSymbol: string | null;
  } | null;
  consumerKind?: "render" | "condition" | "handler" | null;
  consumerLabel?: string | null;
  consumerTagName?: string | null;
  consumerPropName?: string | null;
  consumerActionName?: string | null;
  consumerArgumentName?: string | null;
  consumerConditionOperator?: string | null;
  consumerConditionLiteral?: string | null;
  consumerNestedShow?: boolean | null;
  consumerCollectionName?: string | null;
  attributes?: Record<string, string | number | boolean | null>;
  originRoles?: readonly string[];
};

export type FieldTransferRelation = {
  id: string;
  from: string;
  to: string;
  kind: string;
  status: EvidenceStatus;
  proof: EvidenceProof;
};

export type FieldTransferGraph = {
  element: (id: string) => FieldTransferElement | undefined;
  relation: (id: string) => FieldTransferRelation | undefined;
  outgoing: (id: string) => readonly FieldTransferRelation[];
};

export type FieldTransferVerification = { ok: true } | { ok: false; detail: string };

export type ExactFieldTargetPolicy = {
  transferKinds: readonly string[];
  chain: "direct" | "whole-object" | "scalar-alias" | "direct-scalar";
  sourceFieldElementId?: string;
  sourceFieldName?: string;
  scalarFieldElementId?: string;
  scalarFieldName?: string;
  currentValueElementId?: string;
  componentReceiverElementId?: string;
  collectionFieldElementId: string;
  collectionFieldName: string;
  predicateFieldElementId: string;
  predicateFieldName: string;
  consumerFieldElementId: string;
  consumerFieldName: string;
  consumerValueElementId: string;
  bindingElementId: string;
  componentOccurrenceElementId: string;
  componentDefinitionElementId: string;
  componentSymbol: string;
  componentLabel: string;
  propName: string;
  renderTerminalElementId: string;
  consumerKind: "render" | "condition" | "handler";
  consumerLabel: string;
  directConsumer: boolean;
  targetConsumer: RouteTotalityFieldTargetConsumer;
  consumerTerminalRelationId: string;
};

/** Verify one ledger transfer against exact evidence. Query and API validation share this function. */
export function verifyExactFieldTransfer(
  transfer: RouteTotalityFieldTransformation,
  graph: FieldTransferGraph,
  cancellation: AnalysisCancellationToken,
  policy: ExactFieldTargetPolicy | null = null,
): FieldTransferVerification {
  cancellation.throwIfCancelled();
  if (![...EXACT_FIELD_TRANSFER_KINDS, "component-source-field", "component-boundary", "component-property-read", "scalar-consumer"].includes(transfer.kind as ExactFieldTransferKind)) return failure("The transfer kind is not part of the declared exact ledger.");
  if (transfer.kind === "occurrence-consumer" || transfer.kind === "scalar-consumer" ? !transfer.targetConsumer : transfer.targetConsumer !== null) {
    return failure("Only a consumer transfer can carry one exact target-consumer descriptor.");
  }
  if (transfer.status !== "proven" || transfer.fromElementIds.length !== 1 || transfer.toElementIds.length !== 1) {
    return failure("The transfer requires one proven exact source and target.");
  }
  const source = graph.element(transfer.fromElementIds[0]);
  const target = graph.element(transfer.toElementIds[0]);
  if (!exactElement(source) || !exactElement(target)) return failure("The transfer endpoints are not fully proven exact elements.");
  if (transfer.evidenceRelationIds.length === 0) return failure("The transfer has no exact evidence relation chain.");
  const relations: FieldTransferRelation[] = [];
  for (const id of transfer.evidenceRelationIds) {
    cancellation.throwIfCancelled();
    const relation = graph.relation(id);
    if (!relation || !exactRelation(relation) || !uniqueRelation(relation, graph, cancellation)) {
      return failure(`Evidence relation ${id} is absent, partial, or not unique.`);
    }
    relations.push(relation);
  }
  if (relations[0].from !== source.id || relations.at(-1)?.to !== target.id) return failure("The evidence chain does not match the transfer endpoints.");
  for (let index = 1; index < relations.length; index += 1) {
    if (relations[index - 1].to !== relations[index].from) return failure("The evidence relation chain is not contiguous.");
  }
  for (const relation of relations) {
    if (!exactElement(graph.element(relation.from)) || !exactElement(graph.element(relation.to))) {
      return failure("An evidence relation endpoint is not fully proven.");
    }
  }
  return verifySemantics(transfer.kind as ExactFieldTransferKind, source, target, relations, transfer, graph, cancellation, policy);
}

/** Derive target identity from one exact ordered compiler-backed transfer chain. */
export function deriveExactFieldTargetPolicy(
  transfers: readonly RouteTotalityFieldTransformation[],
  graph: FieldTransferGraph,
): ExactFieldTargetPolicy | null {
  const kinds = transfers.map((transfer) => transfer.kind);
  if (kinds.length === SCALAR_FIELD_TRANSFER_KINDS.length
    && kinds.every((kind, index) => kind === SCALAR_FIELD_TRANSFER_KINDS[index])) {
    const field = graph.element(transfers[1].toElementIds[0]);
    const binding = graph.element(transfers[2].toElementIds[0]);
    const terminal = transfers[2].supportingElementIds
      .map((id) => graph.element(id))
      .find((element) => element?.kind === "render-terminal");
    const terminalRelation = transfers[2].supportingRelationIds
      .map((id) => graph.relation(id))
      .find((relation) => relation?.from === binding?.id && relation?.to === terminal?.id && relation?.kind === "render-terminal");
    if (!field?.fieldName || !binding || !terminal || !terminalRelation || !transfers[2].targetConsumer) return null;
    const definition = transfers[2].supportingElementIds
      .map((id) => graph.element(id))
      .find((element) => element?.kind === "component-definition");
    if (!definition?.symbol) return null;
    return {
      transferKinds: kinds,
      chain: "direct-scalar",
      scalarFieldElementId: field.id,
      scalarFieldName: field.fieldName,
      collectionFieldElementId: field.id,
      collectionFieldName: field.fieldName,
      predicateFieldElementId: field.id,
      predicateFieldName: field.fieldName,
      consumerFieldElementId: field.id,
      consumerFieldName: field.fieldName,
      consumerValueElementId: binding.id,
      bindingElementId: binding.id,
      componentOccurrenceElementId: definition.id,
      componentDefinitionElementId: definition.id,
      componentSymbol: definition.symbol,
      componentLabel: definition.label,
      propName: "",
      renderTerminalElementId: terminal.id,
      consumerKind: "render",
      consumerLabel: transfers[2].targetConsumer.targetKey,
      directConsumer: true,
      targetConsumer: transfers[2].targetConsumer,
      consumerTerminalRelationId: terminalRelation.id,
    };
  }
  const componentWhole = kinds.length === 13 && kinds.every((kind, index) => kind === [
    ...EXACT_FIELD_TRANSFER_KINDS.slice(0, 10), "component-boundary", "component-property-read", "occurrence-consumer",
  ][index]);
  const componentScalar = kinds.length === 13 && kinds.every((kind, index) => kind === [
    ...EXACT_FIELD_TRANSFER_KINDS.slice(0, 10), "component-source-field", "component-boundary", "occurrence-consumer",
  ][index]);
  if (componentWhole || componentScalar) return deriveComponentTargetPolicy(transfers, graph, componentWhole ? "whole-object" : "scalar-alias");
  if (transfers.length !== EXACT_FIELD_TRANSFER_KINDS.length
    || transfers.some((transfer, index) => transfer.kind !== EXACT_FIELD_TRANSFER_KINDS[index])) return null;
  const collection = graph.element(transfers[1].toElementIds[0]);
  const predicateRelations = transfers[4].evidenceRelationIds.map((id) => graph.relation(id));
  const predicate = predicateRelations.length === 3 && predicateRelations[1]
    ? graph.element(predicateRelations[1].to)
    : undefined;
  const consumerField = graph.element(transfers[10].toElementIds[0]);
  const consumerRelations = transfers[11].evidenceRelationIds.map((id) => graph.relation(id));
  const consumerValue = (consumerRelations.length === 2 || consumerRelations.length === 1) && consumerRelations[0]
    ? graph.element(consumerRelations[0].to)
    : undefined;
  const binding = graph.element(transfers[11].toElementIds[0]);
  const metadata = binding?.componentBinding;
  const support = transfers[11].supportingElementIds
    .map((id) => graph.element(id))
    .filter((element): element is FieldTransferElement => Boolean(element));
  const directConsumer = binding?.kind === "field-consumer";
  const directDefinitions = support.filter((element) => element.kind === "component-definition");
  const occurrence = directConsumer
    ? directDefinitions.length === 1 ? directDefinitions[0] : undefined
    : metadata?.componentOccurrenceElementId
      ? graph.element(metadata.componentOccurrenceElementId)
      : undefined;
  const definition = directConsumer
    ? directDefinitions.length === 1 ? directDefinitions[0] : undefined
    : metadata?.componentDefinitionId
      ? graph.element(metadata.componentDefinitionId)
      : undefined;
  const renderTerminals = transfers[11].supportingElementIds
    .map((id) => graph.element(id))
    .filter((element): element is FieldTransferElement => element?.kind === "render-terminal");
  const renderParameter = graph.element(transfers[8].toElementIds[0]);
  const supportRelations = transfers[11].supportingRelationIds
    .map((id) => graph.relation(id))
    .filter((relation): relation is FieldTransferRelation => Boolean(relation));
  const consumerTerminalSource = directConsumer ? binding : consumerValue;
  const consumerTerminalRelations = supportRelations.filter((relation) => (
    relation.from === consumerTerminalSource?.id && relation.kind === "render-terminal"
      && relation.proof.kind === "field-consumer-terminal" && exactRelation(relation)
  ));
  const consumerKind = directConsumer ? consumerKindOf(binding) ?? "render" : "render";
  const consumerLabel = directConsumer ? consumerLabelOf(binding) ?? "" : `${occurrence?.label ?? ""}.${metadata?.propName ?? ""}`;
  if (!collection?.fieldName || !predicate?.fieldName || !consumerField?.fieldName || !consumerValue
    || !binding || !consumerKind || (!directConsumer && !consumerLabel) || !occurrence?.symbol || !definition
    || occurrence.symbol !== definition.symbol || renderTerminals.length !== 1 || !renderParameter
    || consumerTerminalRelations.length !== 1 || consumerTerminalRelations[0].to !== renderTerminals[0].id
    || !uniqueRelation(consumerTerminalRelations[0], graph, NO_CANCELLATION)
    || !containsLocation(renderTerminals[0].location, renderParameter.location)
    || (!directConsumer && !containsLocation(renderTerminals[0].location, occurrence.location))
    || !containsLocation(renderTerminals[0].location, consumerValue.location)) return null;
  const targetConsumer = deriveTargetConsumerDescriptor(transfers[11].targetConsumer?.targetKey ?? "", {
    consumerField,
    consumerValue,
    binding,
    occurrence,
    definition,
    renderTerminal: renderTerminals[0],
    directConsumer,
  });
  if (!targetConsumer || !sameTargetConsumerDescriptor(transfers[11].targetConsumer, targetConsumer)
    || !ownedByTerminal(consumerValue, renderTerminals[0], graph)) return null;
  return {
    transferKinds: kinds,
    chain: "direct",
    collectionFieldElementId: collection.id,
    collectionFieldName: collection.fieldName,
    predicateFieldElementId: predicate.id,
    predicateFieldName: predicate.fieldName,
    consumerFieldElementId: consumerField.id,
    consumerFieldName: consumerField.fieldName,
    consumerValueElementId: consumerValue.id,
    bindingElementId: binding.id,
    componentOccurrenceElementId: occurrence.id,
    componentDefinitionElementId: definition.id,
    componentSymbol: occurrence.symbol,
    componentLabel: occurrence.label,
    propName: directConsumer && typeof binding.attributes?.propName === "string"
      ? binding.attributes.propName
      : metadata?.propName ?? "",
    renderTerminalElementId: renderTerminals[0].id,
    consumerKind: consumerKind as "render" | "condition" | "handler",
    consumerLabel: String(consumerLabel),
    directConsumer,
    targetConsumer,
    consumerTerminalRelationId: consumerTerminalRelations[0].id,
  };
}

function verifySemantics(
  kind: ExactFieldTransferKind,
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  transfer: RouteTotalityFieldTransformation,
  graph: FieldTransferGraph,
  cancellation: AnalysisCancellationToken,
  policy: ExactFieldTargetPolicy | null,
): FieldTransferVerification {
  if (kind === "source-carrier") return verifyExactSourceCarrier(source, target, relations, graph);
  if (kind === "property-read") return policyPattern(exactPattern(source, target, relations, ["field-input"], ["property-access"], "call", "field-read"), target, policy?.collectionFieldElementId, policy?.collectionFieldName, "C02");
  if (kind === "find-element") return exactPattern(source, target, relations, ["collection-element"], ["array-find-element"], "field-read", "collection-element");
  if (kind === "callback-parameter") return exactPattern(source, target, relations, ["callback-parameter"], ["array-find-callback"], "collection-element", "parameter");
  if (kind === "predicate-return") return predicatePattern(source, target, relations, graph, policy);
  if (kind === "find-result") return exactPattern(source, target, relations, ["find-result"], ["array-find-result"], "predicate-result", "call-result");
  if (kind === "function-return") return exactPattern(source, target, relations, ["function-return", "function-call"], ["return-expression", "function-call"], "call-result", "call");
  if (kind === "show-when") return exactPattern(source, target, relations, ["show-when"], ["solid-show-when"], "call", "show-binding");
  if (kind === "show-render-prop") return exactPattern(source, target, relations, ["show-render-parameter"], ["solid-show-render-parameter"], "show-binding", "parameter");
  if (kind === "accessor-call") return exactPattern(source, target, relations, ["accessor-call"], ["accessor-call"], "parameter", "call");
  if (kind === "nested-property-read") return policyPattern(exactPattern(source, target, relations, ["field-input"], ["property-access"], "call", "field-read"), target, policy?.consumerFieldElementId, policy?.consumerFieldName, "C11");
  if (kind === "component-source-field") return policyPattern(exactPattern(source, target, relations, ["field-input"], ["property-access"], "call", "field-read"), target, policy?.sourceFieldElementId, policy?.sourceFieldName, "component source field");
  if (kind === "component-property-read") return policyPattern(exactPattern(source, target, relations, ["field-input"], ["property-access"], "field-read", "field-read"), target, policy?.consumerFieldElementId, policy?.consumerFieldName, "component property read");
  if (kind === "scalar-consumer") return scalarConsumerPattern(source, target, relations, transfer, graph, cancellation, policy);
  if (kind === "component-boundary") return verifyComponentBoundaryPattern(source, target, relations, transfer, graph, cancellation, policy);
  return consumerPattern(source, target, relations, transfer, graph, cancellation, policy);
}

function scalarConsumerPattern(
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  transfer: RouteTotalityFieldTransformation,
  graph: FieldTransferGraph,
  cancellation: AnalysisCancellationToken,
  policy: ExactFieldTargetPolicy | null,
): FieldTransferVerification {
  if (source.kind !== "field-read" || target.kind !== "field-consumer"
    || relations.length !== 1 || relations[0].kind !== "consumer-value" || relations[0].proof.kind !== "render-consumer") {
    return failure("The scalar consumer requires one exact field-read to render-consumer relation.");
  }
  if (!transfer.targetConsumer || transfer.targetConsumer.directConsumer !== true || transfer.targetConsumer.consumerKind !== "render") {
    return failure("The scalar consumer requires one exact direct render target.");
  }
  const terminal = transfer.supportingElementIds.map((id) => graph.element(id)).find((element) => element?.kind === "render-terminal");
  const relation = transfer.supportingRelationIds.map((id) => graph.relation(id)).find((item) => item?.from === target.id && item.to === terminal?.id && item.kind === "render-terminal" && item.proof.kind === "field-consumer-terminal");
  if (!terminal || !relation || !uniqueRelation(relation, graph, cancellation)) return failure("The scalar consumer requires one exact field-lineage terminal relation.");
  if (policy && (policy.chain !== "direct-scalar" || policy.consumerFieldElementId !== source.id || policy.bindingElementId !== target.id || policy.renderTerminalElementId !== terminal.id || policy.consumerTerminalRelationId !== relation.id || !sameTargetConsumerDescriptor(transfer.targetConsumer, policy.targetConsumer))) {
    return failure("The scalar consumer does not match the compiler-derived target policy.");
  }
  return { ok: true };
}

function predicatePattern(
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  graph: FieldTransferGraph,
  policy: ExactFieldTargetPolicy | null,
): FieldTransferVerification {
  const expectedKinds = ["references", "field-input", "predicate-return"];
  const expectedProofs = ["compiler-symbol", "property-access", "array-find-predicate-return"];
  const pattern = exactPattern(source, target, relations, expectedKinds, expectedProofs, "parameter", "predicate-result");
  if (!pattern.ok) return pattern;
  const property = graph.element(relations[1].to);
  return property?.kind === "field-read" && property.fieldName !== null
    && (!policy || property.id === policy.predicateFieldElementId && property.fieldName === policy.predicateFieldName)
    ? { ok: true }
    : failure("C05 requires one exact parameter-rooted predicate property read.");
}

function consumerPattern(
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  transfer: RouteTotalityFieldTransformation,
  graph: FieldTransferGraph,
  cancellation: AnalysisCancellationToken,
  policy: ExactFieldTargetPolicy | null,
): FieldTransferVerification {
  if (target.kind === "field-consumer") {
    if (source.kind !== "field-read" || relations.length !== 1
      || relations[0].kind !== "consumer-value"
      || !["condition-consumer", "render-consumer", "handler-consumer"].includes(relations[0].proof.kind)) {
      return failure("C12 requires one exact direct consumer relation.");
    }
    const kind = consumerKindOf(target) ?? (target.kind === "field-consumer" ? "render" : undefined);
    if (kind !== "condition" && kind !== "render" && kind !== "handler") {
      return failure("C12 requires a typed direct consumer kind.");
    }
    if (kind === "handler" && !completeHandlerIdentity(target)) {
      return failure("C12 handlers require one non-null receiver, method, callee, payload, action, and forwarding identity.");
    }
    if (policy && (!policy.directConsumer || (consumerKindOf(target) && policy.consumerKind !== kind)
      || source.id !== policy.consumerFieldElementId || target.id !== policy.bindingElementId)) {
      return failure("C12 does not match the compiler-derived direct-consumer target policy.");
    }
    const support = transfer.supportingElementIds.map((id) => graph.element(id)).filter(Boolean) as FieldTransferElement[];
    const definition = support.filter((element) => element.kind === "component-definition");
    if (definition.length !== 1 || !definition[0].symbol || definition[0].status !== "proven") {
      return failure("C12 direct consumers require one exact owning component definition.");
    }
    const terminal = support.filter((element) => element.kind === "render-terminal");
    const terminalRelation = exactConsumerTerminalRelation(transfer, target.id, terminal[0]?.id, graph, cancellation);
    if (terminal.length !== 1 || !terminalRelation || target.ownerId !== definition[0].id
      || terminal[0].ownerId !== target.ownerId || !containsLocation(terminal[0].location, target.location)) {
      return failure("C12 requires one exact consumer-owned field-lineage terminal relation.");
    }
    if (policy && (!sameTargetConsumerDescriptor(transfer.targetConsumer, policy.targetConsumer)
      || terminalRelation.id !== policy.consumerTerminalRelationId
      || terminal[0].id !== policy.renderTerminalElementId)) {
      return failure("C12 target identity or consumer terminal does not match the compiler-derived policy.");
    }
    return { ok: true };
  }
  const pattern = exactPattern(source, target, relations, ["consumer-value", "component-prop-binding"], ["jsx-consumer-value", "component-prop-binding"], "field-read", "component-prop-binding");
  if (!pattern.ok) return pattern;
  const metadata = target.componentBinding;
  if (!metadata || metadata.candidateCount !== 1
    || !metadata.componentOccurrenceElementId || !metadata.componentDefinitionId
    || !metadata.parameterElementId || !metadata.receiverElementId) {
    return failure("C12 requires one exact prop binding with complete compiler ownership metadata.");
  }
  const occurrence = graph.element(metadata.componentOccurrenceElementId);
  const definition = graph.element(metadata.componentDefinitionId);
  if (!exactElement(occurrence) || !exactElement(definition)
    || occurrence.kind !== "component-occurrence" || definition.kind !== "component-definition"
    || !occurrence.symbol || occurrence.symbol !== definition.symbol) {
    return failure("C12 requires one compiler-resolved in-project component.");
  }
  const supportIds = new Set(transfer.supportingElementIds);
  if (!supportIds.has(occurrence.id) || !supportIds.has(definition.id)) return failure("C12 omits component occurrence or definition support.");
  const componentRelations = transfer.supportingRelationIds.map((id) => graph.relation(id)).filter(Boolean) as FieldTransferRelation[];
  const exactComponentRelations = componentRelations.filter((relation) => (
    relation.from === occurrence.id && relation.to === definition.id
      && relation.kind === "component-occurrence" && relation.proof.kind === "compiler-symbol"
      && exactRelation(relation) && uniqueRelation(relation, graph, cancellation)
  ));
  if (exactComponentRelations.length !== 1) return failure("C12 requires one exact JSX occurrence-to-component definition relation.");
  const terminal = transfer.supportingElementIds.map((id) => graph.element(id)).filter((element): element is FieldTransferElement => element?.kind === "render-terminal");
  const terminalRelation = exactConsumerTerminalRelation(transfer, relations[0].to, terminal[0]?.id, graph, cancellation);
  if (terminal.length !== 1 || !terminalRelation || !ownedByTerminal(graph.element(relations[0].to), terminal[0], graph)
    || !containsLocation(terminal[0].location, graph.element(relations[0].to)!.location)) {
    return failure("C12 requires one exact consumer-value-to-field-lineage-terminal relation.");
  }
  if (policy && (!policy.directConsumer && (source.id !== policy.consumerFieldElementId || source.fieldName !== policy.consumerFieldName
    || target.id !== policy.bindingElementId || relations[0].to !== policy.consumerValueElementId
    || metadata.propName !== policy.propName || occurrence.id !== policy.componentOccurrenceElementId
    || definition.id !== policy.componentDefinitionElementId || occurrence.symbol !== policy.componentSymbol
    || !sameTargetConsumerDescriptor(transfer.targetConsumer, policy.targetConsumer)
    || terminalRelation.id !== policy.consumerTerminalRelationId || terminal[0].id !== policy.renderTerminalElementId))) {
    return failure("C12 does not match the compiler-derived target policy.");
  }
  return { ok: true };
}

function ownedByTerminal(
  consumer: FieldTransferElement | undefined,
  terminal: FieldTransferElement | undefined,
  graph: FieldTransferGraph,
): boolean {
  if (!consumer?.ownerId || !terminal?.ownerId) return false;
  return consumer.ownerId === terminal.ownerId || graph.element(consumer.ownerId)?.ownerId === terminal.ownerId;
}

function exactConsumerTerminalRelation(
  transfer: RouteTotalityFieldTransformation,
  consumerId: string,
  terminalId: string | undefined,
  graph: FieldTransferGraph,
  cancellation: AnalysisCancellationToken,
): FieldTransferRelation | null {
  if (!terminalId) return null;
  const matches = transfer.supportingRelationIds
    .map((id) => graph.relation(id))
    .filter((relation): relation is FieldTransferRelation => Boolean(relation
      && relation.from === consumerId && relation.to === terminalId
      && relation.kind === "render-terminal" && relation.proof.kind === "field-consumer-terminal"
      && exactRelation(relation) && uniqueRelation(relation, graph, cancellation)));
  return matches.length === 1 ? matches[0] : null;
}

function policyPattern(
  pattern: FieldTransferVerification,
  target: FieldTransferElement,
  expectedId: string | undefined,
  expectedName: string | undefined,
  step: string,
): FieldTransferVerification {
  if (!pattern.ok || expectedId === undefined || expectedName === undefined) return pattern;
  return target.id === expectedId && target.fieldName === expectedName
    ? { ok: true }
    : failure(`${step} does not match the compiler-derived target policy.`);
}

function exactPattern(
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  relationKinds: readonly string[],
  proofKinds: readonly string[],
  sourceKind: string,
  targetKind: string,
): FieldTransferVerification {
  if (source.kind !== sourceKind || target.kind !== targetKind) return failure(`C01-C12 expected ${sourceKind} to ${targetKind}.`);
  if (relations.length !== relationKinds.length) return failure("The semantic transfer has an incorrect evidence relation count.");
  for (let index = 0; index < relations.length; index += 1) {
    if (relations[index].kind !== relationKinds[index] || relations[index].proof.kind !== proofKinds[index]) {
      return failure(`The semantic transfer rejects ${relations[index].kind}/${relations[index].proof.kind}.`);
    }
  }
  return { ok: true };
}

function uniqueRelation(relation: FieldTransferRelation, graph: FieldTransferGraph, cancellation: AnalysisCancellationToken): boolean {
  let matches = 0;
  for (const candidate of graph.outgoing(relation.from)) {
    cancellation.throwIfCancelled();
    if (candidate.to === relation.to && candidate.kind === relation.kind && candidate.proof.kind === relation.proof.kind && candidate.status === "proven") matches += 1;
  }
  return matches === 1;
}

function exactElement(element: FieldTransferElement | undefined): element is FieldTransferElement {
  return Boolean(element && element.status === "proven" && element.proof.length > 0
    && element.proof.every((item) => item.status === "proven" && item.locations.length > 0));
}

function consumerKindOf(element: FieldTransferElement | undefined): "render" | "condition" | "handler" | null {
  if (!element) return null;
  if (element.consumerKind) return element.consumerKind;
  const value = element.attributes?.consumerKind;
  return value === "render" || value === "condition" || value === "handler" ? value : null;
}

function consumerLabelOf(element: FieldTransferElement | undefined): string | null {
  if (!element) return null;
  if (typeof element.consumerLabel === "string") return element.consumerLabel;
  const value = element.attributes?.label;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function completeHandlerIdentity(element: FieldTransferElement): boolean {
  const identity = element.handlerIdentity;
  const attributes = element.attributes ?? {};
  const receiverName = identity?.receiverName ?? attributes.handlerReceiverName;
  const receiver = identity?.receiverSymbol ?? attributes.handlerReceiverSymbol;
  const method = identity?.methodSymbol ?? attributes.handlerMethodSymbol;
  const callee = identity?.calleeSymbol ?? attributes.handlerCalleeSymbol;
  const action = identity?.actionArgumentSymbol ?? attributes.handlerActionArgumentSymbol;
  const payload = identity?.payloadObject ?? attributes.handlerPayloadObject;
  const forwarded = identity
    ? identity.forwardedParameterSymbol
    : attributes.handlerForwardedParameterSymbol;
  return typeof receiverName === "string" && receiverName.length > 0
    && typeof receiver === "string" && receiver.length > 0
    && typeof method === "string" && method.length > 0
    && typeof callee === "string" && callee.length > 0
    && typeof action === "string" && action.length > 0
    && typeof payload === "string" && payload.length > 0
    && (forwarded === null || typeof forwarded === "string" && forwarded.length > 0);
}

function exactRelation(relation: FieldTransferRelation): boolean {
  return relation.status === "proven" && relation.proof.status === "proven" && relation.proof.locations.length > 0;
}

function containsLocation(owner: SourceLocation, child: SourceLocation): boolean {
  return owner.file === child.file
    && (owner.span.startLine < child.span.startLine
      || owner.span.startLine === child.span.startLine && owner.span.startColumn <= child.span.startColumn)
    && (owner.span.endLine > child.span.endLine
      || owner.span.endLine === child.span.endLine && owner.span.endColumn >= child.span.endColumn);
}

function failure(detail: string): FieldTransferVerification { return { ok: false, detail }; }

const NO_CANCELLATION: AnalysisCancellationToken = { throwIfCancelled() {} };
