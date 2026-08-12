export type FieldProofConsumerSelector = {
  kind: "render" | "condition" | "handler";
  label: string;
  directConsumer: boolean;
  componentName?: string;
  propName?: string;
  tagName?: string;
  tagModule?: string;
  actionName?: string;
  argumentName?: string;
  handlerReceiverName?: string;
  conditionOperator?: string;
  conditionLiteral?: string;
  nestedShow?: boolean;
  collectionName?: string;
};

export type FieldProofTargetSelector = {
  collectionFieldName: string;
  predicateFieldName: string;
  consumerFieldName: string;
  consumer: FieldProofConsumerSelector;
  chain?: "direct" | "whole-object" | "scalar-alias";
  componentName?: string;
  componentPropName?: string;
};

/** Build one target identity from compiler-discovered consumer facts. */
export function fieldProofTargetForConsumer(input: {
  collectionFieldName: string;
  predicateFieldName: string;
  consumerFieldName: string;
  chain?: "direct" | "whole-object" | "scalar-alias";
  componentName?: string | null;
  componentPropName?: string | null;
  consumer: FieldProofConsumerSelector;
}): FieldProofTargetSelector {
  return {
    collectionFieldName: input.collectionFieldName,
    predicateFieldName: input.predicateFieldName,
    consumerFieldName: input.consumerFieldName,
    chain: input.chain,
    componentName: input.componentName ?? undefined,
    componentPropName: input.componentPropName ?? undefined,
    consumer: input.consumer,
  };
}

export function fieldProofTargetKey(target: FieldProofTargetSelector): string {
  return JSON.stringify({
    collectionFieldName: target.collectionFieldName,
    predicateFieldName: target.predicateFieldName,
    consumerFieldName: target.consumerFieldName,
    chain: target.chain ?? "direct",
    componentName: target.componentName ?? null,
    componentPropName: target.componentPropName ?? null,
    consumer: {
      kind: target.consumer.kind,
      directConsumer: target.consumer.directConsumer,
      componentName: target.consumer.componentName ?? null,
      propName: target.consumer.propName ?? null,
      tagName: target.consumer.tagName ?? null,
      tagModule: target.consumer.tagModule ?? null,
      actionName: target.consumer.actionName ?? null,
      argumentName: target.consumer.argumentName ?? null,
      handlerReceiverName: target.consumer.handlerReceiverName ?? null,
      conditionOperator: target.consumer.conditionOperator ?? null,
      conditionLiteral: target.consumer.conditionLiteral ?? null,
      nestedShow: target.consumer.nestedShow ?? null,
      collectionName: target.consumer.collectionName ?? null,
    },
  });
}
