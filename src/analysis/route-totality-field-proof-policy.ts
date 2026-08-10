export type FieldProofTargetSelector = {
  collectionFieldName: string;
  predicateFieldName: string;
  consumerFieldName: string;
  componentName: string;
  propName: string;
};

/** Product target input for G02. Compiler facts establish every selected identity. */
export const G02_FIELD_TARGET: FieldProofTargetSelector = {
  collectionFieldName: "games",
  predicateFieldName: "id",
  consumerFieldName: "opponentName",
  componentName: "PageHeader",
  propName: "title",
};
