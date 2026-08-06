import { z } from "zod";

const nonEmptyStringSchema = z.string().min(1);
const positiveIntegerSchema = z.number().int().positive();
const sourceSpanSchema = z.strictObject({
  startLine: positiveIntegerSchema,
  startColumn: positiveIntegerSchema,
  endLine: positiveIntegerSchema,
  endColumn: positiveIntegerSchema,
});
const sourceLocationSchema = z.strictObject({
  file: nonEmptyStringSchema,
  line: positiveIntegerSchema,
  column: positiveIntegerSchema,
  span: sourceSpanSchema,
});
const contextRecordStatusSchema = z.enum(["proven", "partial", "unsupported"]);
const contextMemberCertaintySchema = z.enum(["proven", "unknown"]);
const contextRepetitionSchema = z.enum(["single", "conditional", "collection", "unknown"]);
const occurrenceOwnershipSchema = z.enum(["scope-entry", "caller-owned", "definition-owned"]);
const evidenceStatusSchema = z.enum(["proven", "partial", "unsupported"]);
const evidenceProofSchema = z.strictObject({
  kind: nonEmptyStringSchema,
  detail: nonEmptyStringSchema,
  locations: z.array(sourceLocationSchema).min(1),
  status: evidenceStatusSchema,
});

const contextDeclarationSchema = z.strictObject({
  id: nonEmptyStringSchema,
  compilerIdentity: nonEmptyStringSchema,
  sourceIdentity: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  location: sourceLocationSchema,
  defaultValueId: nonEmptyStringSchema.nullable(),
  status: contextRecordStatusSchema,
  proof: z.array(evidenceProofSchema).min(1),
});

const contextProvidedValueSchema = z.strictObject({
  id: nonEmptyStringSchema,
  contextDeclarationId: nonEmptyStringSchema,
  providerOccurrenceId: nonEmptyStringSchema.nullable(),
  sourceKind: z.enum(["provider", "default"]),
  expression: nonEmptyStringSchema,
  location: sourceLocationSchema,
  memberNames: z.array(nonEmptyStringSchema),
  memberCertainty: contextMemberCertaintySchema,
  status: contextRecordStatusSchema,
  proof: z.array(evidenceProofSchema).min(1),
});

const contextProviderOccurrenceSchema = z.strictObject({
  id: nonEmptyStringSchema,
  contextDeclarationId: nonEmptyStringSchema,
  renderOccurrenceId: nonEmptyStringSchema,
  ownership: occurrenceOwnershipSchema,
  repetition: contextRepetitionSchema,
  location: sourceLocationSchema,
  valueId: nonEmptyStringSchema,
  status: contextRecordStatusSchema,
  proof: z.array(evidenceProofSchema).min(1),
});

const contextReadSchema = z.strictObject({
  id: nonEmptyStringSchema,
  contextDeclarationId: nonEmptyStringSchema,
  consumerOccurrenceId: nonEmptyStringSchema,
  expression: nonEmptyStringSchema,
  location: sourceLocationSchema,
  members: z.array(nonEmptyStringSchema),
  memberCertainty: contextMemberCertaintySchema,
  status: contextRecordStatusSchema,
  proof: z.array(evidenceProofSchema).min(1),
});

const contextConsumerOccurrenceSchema = z.strictObject({
  id: nonEmptyStringSchema,
  contextDeclarationId: nonEmptyStringSchema,
  renderOccurrenceId: nonEmptyStringSchema,
  readIds: z.array(nonEmptyStringSchema).min(1),
  terminalIds: z.array(nonEmptyStringSchema),
  repetition: contextRepetitionSchema,
  location: sourceLocationSchema,
  status: contextRecordStatusSchema,
  proof: z.array(evidenceProofSchema).min(1),
});

const contextContinuityLinkSchema = z.strictObject({
  id: nonEmptyStringSchema,
  contextDeclarationId: nonEmptyStringSchema,
  providerOccurrenceId: nonEmptyStringSchema.nullable(),
  providedValueId: nonEmptyStringSchema,
  readId: nonEmptyStringSchema,
  consumerOccurrenceId: nonEmptyStringSchema,
  terminalIds: z.array(nonEmptyStringSchema),
  members: z.array(nonEmptyStringSchema),
  memberCertainty: contextMemberCertaintySchema,
  sourceKind: z.enum(["provider", "default"]),
  renderAncestry: z.array(nonEmptyStringSchema),
  nearestProvider: z.boolean(),
  repetition: contextRepetitionSchema,
  status: contextRecordStatusSchema,
  proof: z.array(evidenceProofSchema).min(1),
});

const contextGapReasonSchema = z.enum([
  "missing-provider",
  "ambiguous-provider",
  "dynamic-context-identity",
  "dynamic-provider-identity",
  "unsupported-wrapper",
  "ambiguous-ownership",
  "unproven-member-identity",
  "unsupported-syntax",
  "unresolved-symbol",
]);

const contextContinuityGapSchema = z.strictObject({
  id: nonEmptyStringSchema,
  contextDeclarationId: nonEmptyStringSchema.nullable(),
  providerOccurrenceId: nonEmptyStringSchema.nullable(),
  readId: nonEmptyStringSchema.nullable(),
  consumerOccurrenceId: nonEmptyStringSchema.nullable(),
  reason: contextGapReasonSchema,
  label: nonEmptyStringSchema,
  status: z.enum(["partial", "unsupported"]),
  location: sourceLocationSchema.nullable(),
  proof: z.array(evidenceProofSchema),
});

const contextContinuityCountsSchema = z.strictObject({
  declarations: z.number().int().nonnegative(),
  providers: z.number().int().nonnegative(),
  values: z.number().int().nonnegative(),
  reads: z.number().int().nonnegative(),
  consumers: z.number().int().nonnegative(),
  links: z.number().int().nonnegative(),
  gaps: z.number().int().nonnegative(),
});

export const routeContextContinuitySchema = z.strictObject({
  status: z.enum(["complete", "partial", "unavailable"]),
  counts: contextContinuityCountsSchema,
  declarations: z.array(contextDeclarationSchema),
  providers: z.array(contextProviderOccurrenceSchema),
  values: z.array(contextProvidedValueSchema),
  reads: z.array(contextReadSchema),
  consumers: z.array(contextConsumerOccurrenceSchema),
  links: z.array(contextContinuityLinkSchema),
  gaps: z.array(contextContinuityGapSchema),
});
