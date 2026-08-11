export type FieldProofConsumerSelector = {
  kind: "render" | "condition" | "handler";
  label: string;
  directConsumer: boolean;
  componentName?: string;
  propName?: string;
  tagName?: string;
  actionName?: string;
  argumentName?: string;
  conditionOperator?: string;
  conditionLiteral?: string;
  nestedShow?: boolean;
};

export type FieldProofTargetSelector = {
  collectionFieldName: string;
  predicateFieldName: string;
  consumerFieldName: string;
  consumer: FieldProofConsumerSelector;
};

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
      conditionOperator: "===",
      conditionLiteral: "completed",
      nestedShow: false,
    },
  },
];

/** G02 remains a stable named export for the exact transfer regression gate. */
export const G02_FIELD_TARGET = DIRECT_FIELD_PROOF_TARGETS[1];
