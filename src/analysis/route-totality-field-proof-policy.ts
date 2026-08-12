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

/** Explicit product targets. Compiler facts establish every selected identity. */
export const DIRECT_FIELD_PROOF_TARGETS: readonly FieldProofTargetSelector[] = [
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "status",
    consumer: {
      kind: "condition",
      label: "PageHeader.eyebrow condition",
      directConsumer: true,
      componentName: "PageHeader",
      propName: "eyebrow",
      tagModule: "./PageHeader",
      conditionOperator: "===",
      conditionLiteral: "completed",
    },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "opponentName",
    consumer: {
      kind: "render",
      label: "PageHeader.title",
      directConsumer: false,
      componentName: "PageHeader",
      propName: "title",
      tagModule: "./PageHeader",
    },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "startsAt",
    consumer: {
      kind: "render",
      label: "PageHeader.description date",
      directConsumer: true,
      componentName: "PageHeader",
      propName: "description",
      tagModule: "./PageHeader",
    },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "venueName",
    consumer: {
      kind: "render",
      label: "PageHeader.description venue",
      directConsumer: true,
      componentName: "PageHeader",
      propName: "description",
      tagModule: "./PageHeader",
    },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "status",
    consumer: {
      kind: "condition",
      label: "Show.when build actions",
      directConsumer: true,
      tagName: "Show",
      propName: "when",
      tagModule: "solid-js",
      conditionOperator: "!==",
      conditionLiteral: "completed",
      nestedShow: true,
    },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "id",
    consumer: {
      kind: "render",
      label: "A.href schedule",
      directConsumer: true,
      tagName: "A",
      propName: "href",
      tagModule: "@solidjs/router",
    },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "status",
    consumer: {
      kind: "condition",
      label: "Show.when edit action",
      directConsumer: true,
      tagName: "Show",
      propName: "when",
      tagModule: "solid-js",
      conditionOperator: "!==",
      conditionLiteral: "completed",
      nestedShow: false,
    },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "id",
    consumer: {
      kind: "handler",
      label: "deleteGame.id",
      directConsumer: true,
      actionName: "deleteGame",
      argumentName: "id",
      handlerReceiverName: "data",
    },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "status",
    consumer: {
      kind: "condition",
      label: "Show.when completed branch",
      directConsumer: true,
      tagName: "Show",
      propName: "when",
      tagModule: "solid-js",
      conditionOperator: "===",
      conditionLiteral: "completed",
      nestedShow: false,
    },
  },
];

/** Component-boundary targets use an explicit whole-object or scalar alias chain. */
export const COMPONENT_FIELD_PROOF_TARGETS: readonly FieldProofTargetSelector[] = [
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "venueName",
    chain: "whole-object",
    componentName: "ScheduledGamePlanningDetails",
    componentPropName: "game",
    consumer: { kind: "render", label: "ScheduledGamePlanningDetails venue", directConsumer: true, tagName: "Text", tagModule: "~/components/ui/text" },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "venueAddress",
    chain: "whole-object",
    componentName: "ScheduledGamePlanningDetails",
    componentPropName: "game",
    consumer: { kind: "render", label: "ScheduledGamePlanningDetails address", directConsumer: true, tagName: "Text", tagModule: "~/components/ui/text" },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "id",
    chain: "whole-object",
    componentName: "ScheduledGamePlanningDetails",
    componentPropName: "game",
    consumer: { kind: "condition", label: "Scheduled availability gameId condition", directConsumer: true, collectionName: "availability" },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "id",
    chain: "whole-object",
    componentName: "ScheduledGamePlanningDetails",
    componentPropName: "game",
    consumer: { kind: "handler", label: "markAllAvailable.gameId", directConsumer: true, actionName: "markAllAvailable", argumentName: "gameId", handlerReceiverName: "data" },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "id",
    chain: "whole-object",
    componentName: "ScheduledGamePlanningDetails",
    componentPropName: "game",
    consumer: { kind: "handler", label: "setAvailability.gameId", directConsumer: true, actionName: "setAvailability", argumentName: "gameId", handlerReceiverName: "data" },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    consumerFieldName: "gameId",
    chain: "scalar-alias",
    componentName: "CompletedGameSummary",
    componentPropName: "gameId",
    consumer: { kind: "condition", label: "Completed schedule gameId condition", directConsumer: true, collectionName: "schedules" },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    chain: "scalar-alias",
    componentName: "CompletedGameSummary",
    componentPropName: "gameId",
    consumerFieldName: "gameId",
    consumer: { kind: "condition", label: "Completed availability gameId condition", directConsumer: true, collectionName: "availability" },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    chain: "scalar-alias",
    componentName: "CompletedGameSummary",
    componentPropName: "gameId",
    consumerFieldName: "gameId",
    consumer: { kind: "condition", label: "Completed live gameId condition", directConsumer: true, collectionName: "liveGames" },
  },
  {
    collectionFieldName: "games",
    predicateFieldName: "id",
    chain: "scalar-alias",
    componentName: "CompletedGameSummary",
    componentPropName: "gameId",
    consumerFieldName: "gameId",
    consumer: { kind: "render", label: "Completed A.href live", directConsumer: true, tagName: "A", propName: "href", tagModule: "@solidjs/router" },
  },
];

export const FIELD_PROOF_TARGETS = [...DIRECT_FIELD_PROOF_TARGETS, ...COMPONENT_FIELD_PROOF_TARGETS] as const;

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

/** G02 remains a stable named export for the exact transfer regression gate. */
export const G02_FIELD_TARGET = DIRECT_FIELD_PROOF_TARGETS[1];
