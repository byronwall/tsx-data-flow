import type { RouteTotalityFieldTargetConsumer } from "./route-totality-field-lineage";
import {
  FIELD_PROOF_TARGETS,
  fieldProofTargetKey,
  type FieldProofTargetSelector,
} from "./route-totality-field-proof-policy";

type TargetElement = {
  id: string;
  kind: string;
  label: string;
  fieldName: string | null;
  symbol: string | null;
  module?: string | null;
  ownerId?: string | null;
  componentBinding: { propName: string | null } | null;
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
  consumerTagName?: string | null;
  consumerPropName?: string | null;
  consumerActionName?: string | null;
  consumerArgumentName?: string | null;
  consumerConditionOperator?: string | null;
  consumerConditionLiteral?: string | null;
  consumerNestedShow?: boolean | null;
  consumerCollectionName?: string | null;
  attributes?: Record<string, string | number | boolean | null>;
};

export type TargetConsumerEvidence = {
  consumerField: TargetElement;
  consumerValue: TargetElement;
  binding: TargetElement;
  occurrence: TargetElement;
  definition: TargetElement;
  renderTerminal: TargetElement;
  directConsumer: boolean;
};

/** Build one strict target descriptor from the declared target and exact compiler evidence. */
export function buildTargetConsumerDescriptor(
  targetKey: string,
  evidence: TargetConsumerEvidence,
): RouteTotalityFieldTargetConsumer | null {
  const target = targetForKey(targetKey);
  if (!target || !matchesTargetChain(target, evidence) || !evidence.renderTerminal.ownerId) return null;
  const kind = evidence.directConsumer ? consumerKind(evidence.binding) : target.consumer.kind;
  if (!kind || kind !== target.consumer.kind) return null;
  const jsx = jsxIdentity(target, evidence);
  if ((target.consumer.tagName || target.consumer.componentName || !evidence.directConsumer) && !jsx) return null;
  const handler = handlerIdentity(target, evidence.binding, kind);
  if (kind === "handler" && !handler) return null;
  const condition = conditionIdentity(target, evidence.binding, kind);
  if (kind === "condition" && !condition) return null;
  return {
    targetKey,
    directConsumer: evidence.directConsumer,
    consumerKind: kind,
    consumerFieldElementId: evidence.consumerField.id,
    consumerValueElementId: evidence.consumerValue.id,
    bindingElementId: evidence.binding.id,
    ownerDefinitionElementId: evidence.definition.id,
    consumerOwnerElementId: evidence.renderTerminal.ownerId,
    jsx,
    handler,
    condition,
  };
}

/** Derive one declared target from compiler evidence without trusting a submitted target key. */
export function deriveTargetConsumerDescriptor(
  evidence: TargetConsumerEvidence,
): RouteTotalityFieldTargetConsumer | null {
  const matches = FIELD_PROOF_TARGETS
    .map((target) => buildTargetConsumerDescriptor(fieldProofTargetKey(target), evidence))
    .filter((descriptor): descriptor is RouteTotalityFieldTargetConsumer => descriptor !== null);
  return matches.length === 1 ? matches[0] : null;
}

function conditionIdentity(
  target: FieldProofTargetSelector,
  binding: TargetElement,
  kind: "render" | "condition" | "handler",
): RouteTotalityFieldTargetConsumer["condition"] {
  if (kind !== "condition") return null;
  const operator = projectedOrAttribute(binding, "consumerConditionOperator", "conditionOperator");
  const literal = projectedOrAttribute(binding, "consumerConditionLiteral", "conditionLiteral");
  const nestedShow = booleanProjectedOrAttribute(binding, "consumerNestedShow", "nestedShow");
  const collectionName = projectedOrAttribute(binding, "consumerCollectionName", "consumerCollection");
  if (target.consumer.conditionOperator !== undefined && operator !== target.consumer.conditionOperator
    || target.consumer.conditionLiteral !== undefined && literal !== target.consumer.conditionLiteral
    || target.consumer.nestedShow !== undefined && nestedShow !== target.consumer.nestedShow
    || target.consumer.collectionName !== undefined && collectionName !== target.consumer.collectionName) return null;
  return { operator, literal, nestedShow, collectionName };
}

export function sameTargetConsumerDescriptor(
  left: RouteTotalityFieldTargetConsumer | null | undefined,
  right: RouteTotalityFieldTargetConsumer | null | undefined,
): boolean {
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}

function targetForKey(key: string): FieldProofTargetSelector | null {
  const matches = FIELD_PROOF_TARGETS.filter((target) => fieldProofTargetKey(target) === key);
  return matches.length === 1 ? matches[0] : null;
}

function matchesTargetChain(target: FieldProofTargetSelector, evidence: TargetConsumerEvidence): boolean {
  const expectedChain = target.chain ?? "direct";
  if (evidence.directConsumer !== target.consumer.directConsumer) return false;
  if (evidence.consumerField.fieldName !== target.consumerFieldName) return false;
  if (expectedChain !== "direct") {
    if (!evidence.directConsumer || evidence.definition.label !== target.componentName) return false;
  }
  const propName = evidence.directConsumer
    ? stringAttribute(evidence.binding, "propName")
    : evidence.binding.componentBinding?.propName ?? null;
  if (target.consumer.propName && propName !== target.consumer.propName) return false;
  return true;
}

function jsxIdentity(
  target: FieldProofTargetSelector,
  evidence: TargetConsumerEvidence,
): RouteTotalityFieldTargetConsumer["jsx"] {
  const tagName = evidence.directConsumer
    ? stringAttribute(evidence.binding, "tagName")
    : evidence.occurrence.label;
  const tagSymbol = evidence.directConsumer ? evidence.binding.symbol : evidence.occurrence.symbol;
  const tagModule = evidence.directConsumer ? evidence.binding.module : evidence.occurrence.module;
  const propName = evidence.directConsumer
    ? stringAttribute(evidence.binding, "propName")
    : evidence.binding.componentBinding?.propName ?? null;
  if (!tagName || !tagSymbol || !tagModule || (target.consumer.propName && !propName)) return null;
  const expectedTag = target.consumer.tagName ?? target.consumer.componentName ?? null;
  if (expectedTag && tagName !== expectedTag) return null;
  if (target.consumer.tagModule && propName && tagModule !== target.consumer.tagModule) return null;
  return {
    tagName,
    tagSymbol,
    tagModule,
    propName,
    identity: /^[a-z]/.test(tagName) ? "intrinsic" : "component",
  };
}

function handlerIdentity(
  target: FieldProofTargetSelector,
  binding: TargetElement,
  kind: "render" | "condition" | "handler",
): RouteTotalityFieldTargetConsumer["handler"] {
  if (kind !== "handler") return null;
  const identity = binding.handlerIdentity ?? handlerIdentityFromAttributes(binding);
  const actionName = stringAttribute(binding, "actionName");
  const argumentField = stringAttribute(binding, "argumentName");
  if (!identity || !actionName || !argumentField
    || !identity.receiverName || !identity.receiverSymbol || !identity.methodSymbol
    || !identity.calleeSymbol || !identity.actionArgumentSymbol || !identity.payloadObject
    || target.consumer.handlerReceiverName !== identity.receiverName
    || target.consumer.actionName !== actionName || target.consumer.argumentName !== argumentField) return null;
  return {
    receiverName: identity.receiverName,
    receiverSymbol: identity.receiverSymbol,
    methodSymbol: identity.methodSymbol,
    calleeSymbol: identity.calleeSymbol,
    actionName,
    actionArgumentSymbol: identity.actionArgumentSymbol,
    payloadObject: identity.payloadObject,
    argumentField,
    forwardedParameterSymbol: identity.forwardedParameterSymbol,
  };
}

function handlerIdentityFromAttributes(binding: TargetElement): NonNullable<TargetElement["handlerIdentity"]> | null {
  const receiverName = stringAttribute(binding, "handlerReceiverName");
  const receiverSymbol = stringAttribute(binding, "handlerReceiverSymbol");
  const methodSymbol = stringAttribute(binding, "handlerMethodSymbol");
  const calleeSymbol = stringAttribute(binding, "handlerCalleeSymbol");
  const actionArgumentSymbol = stringAttribute(binding, "handlerActionArgumentSymbol");
  const payloadObject = stringAttribute(binding, "handlerPayloadObject");
  const forwarded = binding.attributes?.handlerForwardedParameterSymbol;
  if (!receiverName || !receiverSymbol || !methodSymbol || !calleeSymbol || !actionArgumentSymbol || !payloadObject) return null;
  return {
    receiverName,
    receiverSymbol,
    methodSymbol,
    calleeSymbol,
    actionArgumentSymbol,
    payloadObject,
    forwardedParameterSymbol: typeof forwarded === "string" ? forwarded : null,
  };
}

function consumerKind(element: TargetElement): "render" | "condition" | "handler" | null {
  const value = element.consumerKind ?? element.attributes?.consumerKind;
  return value === "render" || value === "condition" || value === "handler" ? value : null;
}

function stringAttribute(element: TargetElement, key: string): string | null {
  const projected = key === "tagName" ? element.consumerTagName
    : key === "propName" ? element.consumerPropName
    : key === "actionName" ? element.consumerActionName
    : key === "argumentName" ? element.consumerArgumentName
    : null;
  if (typeof projected === "string" && projected.length > 0) return projected;
  const value = element.attributes?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function projectedOrAttribute(
  element: TargetElement,
  projectedKey: "consumerConditionOperator" | "consumerConditionLiteral" | "consumerCollectionName",
  attributeKey: string,
): string | null {
  const projected = element[projectedKey];
  if (typeof projected === "string") return projected;
  const attribute = element.attributes?.[attributeKey];
  return typeof attribute === "string" ? attribute : null;
}

function booleanProjectedOrAttribute(
  element: TargetElement,
  projectedKey: "consumerNestedShow",
  attributeKey: string,
): boolean | null {
  const projected = element[projectedKey];
  if (typeof projected === "boolean") return projected;
  const attribute = element.attributes?.[attributeKey];
  return typeof attribute === "boolean" ? attribute : null;
}
