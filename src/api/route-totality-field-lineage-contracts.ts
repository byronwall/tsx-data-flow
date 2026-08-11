import { z } from "zod";

const nonEmptyStringSchema = z.string().min(1);
const positiveIntegerSchema = z.number().int().positive();
const evidenceStatusSchema = z.enum(["proven", "partial", "unsupported"]);
const sourceLocationSchema = z.strictObject({
  file: nonEmptyStringSchema,
  line: positiveIntegerSchema,
  column: positiveIntegerSchema,
  span: z.strictObject({
    startLine: positiveIntegerSchema,
    startColumn: positiveIntegerSchema,
    endLine: positiveIntegerSchema,
    endColumn: positiveIntegerSchema,
  }),
});
const evidenceProofSchema = z.strictObject({
  kind: nonEmptyStringSchema,
  detail: nonEmptyStringSchema,
  locations: z.array(sourceLocationSchema).min(1),
  status: evidenceStatusSchema,
});
const originRoleSchema = z.enum([
  "argument",
  "environment",
  "working-directory",
  "stdin",
  "request",
  "event",
  "filesystem",
  "fetch",
  "resource",
  "network",
  "external-read",
  "input-boundary",
]);
const fieldSegmentSchema = z.strictObject({
  kind: z.enum(["property", "string-index", "numeric-index", "collection-element"]),
  value: z.string(),
});
const fieldOriginSchema = z.strictObject({
  elementId: nonEmptyStringSchema,
  role: originRoleSchema,
  selectedEvidenceId: nonEmptyStringSchema.nullable(),
});
const fieldSchema = z.strictObject({
  elementIds: z.array(nonEmptyStringSchema).min(1),
  segments: z.array(fieldSegmentSchema).min(1),
  label: nonEmptyStringSchema,
  location: sourceLocationSchema,
});
const targetConsumerSchema = z.strictObject({
  targetKey: nonEmptyStringSchema,
  consumerKind: z.enum(["render", "condition", "handler"]),
  consumerFieldElementId: nonEmptyStringSchema,
  consumerValueElementId: nonEmptyStringSchema,
  bindingElementId: nonEmptyStringSchema,
  ownerDefinitionElementId: nonEmptyStringSchema,
  consumerOwnerElementId: nonEmptyStringSchema,
  jsx: z.strictObject({
    tagName: nonEmptyStringSchema,
    tagSymbol: nonEmptyStringSchema,
    tagModule: nonEmptyStringSchema,
    propName: nonEmptyStringSchema.nullable(),
    identity: z.enum(["intrinsic", "component"]),
  }).nullable(),
  handler: z.strictObject({
    receiverName: nonEmptyStringSchema,
    receiverSymbol: nonEmptyStringSchema,
    methodSymbol: nonEmptyStringSchema,
    calleeSymbol: nonEmptyStringSchema,
    actionName: nonEmptyStringSchema,
    actionArgumentSymbol: nonEmptyStringSchema,
    payloadObject: nonEmptyStringSchema,
    argumentField: nonEmptyStringSchema,
    forwardedParameterSymbol: nonEmptyStringSchema.nullable(),
  }).nullable(),
  condition: z.strictObject({
    operator: nonEmptyStringSchema.nullable(),
    literal: nonEmptyStringSchema.nullable(),
    nestedShow: z.boolean().nullable(),
    collectionName: nonEmptyStringSchema.nullable(),
  }).nullable(),
});
const fieldConsumerSchema = z.strictObject({
  id: nonEmptyStringSchema,
  elementId: nonEmptyStringSchema,
  occurrenceElementId: nonEmptyStringSchema,
  kind: z.enum(["render", "condition", "handler"]),
  label: nonEmptyStringSchema,
  occurrenceId: nonEmptyStringSchema,
  routeTerminalId: nonEmptyStringSchema.nullable(),
  fieldLineageTerminalElementId: nonEmptyStringSchema,
  fieldLineageTerminalRelationId: nonEmptyStringSchema,
  target: targetConsumerSchema,
  location: sourceLocationSchema,
});
const fieldTransformationSchema = z.strictObject({
  id: nonEmptyStringSchema,
  kind: nonEmptyStringSchema,
  fromElementIds: z.array(nonEmptyStringSchema),
  toElementIds: z.array(nonEmptyStringSchema),
  evidenceRelationIds: z.array(nonEmptyStringSchema).min(1),
  supportingElementIds: z.array(nonEmptyStringSchema),
  supportingRelationIds: z.array(nonEmptyStringSchema),
  targetConsumer: targetConsumerSchema.nullable(),
  locations: z.array(sourceLocationSchema).min(1),
  proof: z.array(evidenceProofSchema).min(1),
  status: evidenceStatusSchema,
});

export const routeTotalityFieldLineageSchema = z.strictObject({
  status: z.enum(["complete", "partial", "unavailable"]),
  unavailableReason: nonEmptyStringSchema.nullable(),
  attachments: z.array(z.strictObject({
    id: nonEmptyStringSchema,
    origin: fieldOriginSchema,
    field: fieldSchema,
    occurrenceId: nonEmptyStringSchema,
    terminalIds: z.array(nonEmptyStringSchema).length(1),
    evidencePathElementIds: z.array(nonEmptyStringSchema).min(1),
    evidencePathRelationIds: z.array(nonEmptyStringSchema),
    proof: z.array(evidenceProofSchema).min(1),
    locations: z.array(sourceLocationSchema).min(1),
    consumer: fieldConsumerSchema.nullable(),
    alias: nonEmptyStringSchema.nullable(),
    transformationIds: z.array(nonEmptyStringSchema),
    transformationKinds: z.array(nonEmptyStringSchema),
  })),
  frontiers: z.array(z.strictObject({
    id: nonEmptyStringSchema,
    origin: fieldOriginSchema,
    field: fieldSchema.omit({ location: true }).nullable(),
    occurrenceId: nonEmptyStringSchema.nullable(),
    reason: z.enum([
      "partial-proof",
      "budget-exhausted",
      "identity-lost",
      "ambiguous-target",
      "unsupported-relation",
      "unsupported-transform",
      "dynamic-index",
      "renamed-prop",
      "multiple-origins",
      "evidence-truncated",
      "unmapped-occurrence",
      "unmapped-terminal",
    ]),
    gapId: nonEmptyStringSchema.nullable(),
    stoppedAtElementId: nonEmptyStringSchema.nullable(),
    stoppedAtRelationId: nonEmptyStringSchema.nullable(),
    evidencePathElementIds: z.array(nonEmptyStringSchema),
    evidencePathRelationIds: z.array(nonEmptyStringSchema),
    location: sourceLocationSchema.nullable(),
    proof: z.array(evidenceProofSchema),
    missingTransformationKind: nonEmptyStringSchema.nullable(),
    transformationIds: z.array(nonEmptyStringSchema),
  })),
  counts: z.strictObject({
    origins: z.number().int().nonnegative(),
    fields: z.number().int().nonnegative(),
    occurrences: z.number().int().nonnegative(),
    terminals: z.number().int().nonnegative(),
    frontiers: z.number().int().nonnegative(),
    transformations: z.number().int().nonnegative(),
  }),
  omissions: z.array(nonEmptyStringSchema),
  transformations: z.array(fieldTransformationSchema),
});
