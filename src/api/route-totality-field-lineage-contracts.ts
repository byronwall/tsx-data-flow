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
  kind: z.enum(["property", "string-index", "numeric-index"]),
  value: z.string(),
});
const fieldOriginSchema = z.strictObject({
  elementId: nonEmptyStringSchema,
  role: originRoleSchema,
});
const fieldSchema = z.strictObject({
  elementIds: z.array(nonEmptyStringSchema).min(1),
  segments: z.array(fieldSegmentSchema).min(1),
  label: nonEmptyStringSchema,
  location: sourceLocationSchema,
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
  })),
  frontiers: z.array(z.strictObject({
    id: nonEmptyStringSchema,
    origin: fieldOriginSchema,
    field: fieldSchema.omit({ location: true }).nullable(),
    occurrenceId: nonEmptyStringSchema.nullable(),
    reason: z.enum([
      "partial-proof",
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
  })),
  counts: z.strictObject({
    origins: z.number().int().nonnegative(),
    fields: z.number().int().nonnegative(),
    occurrences: z.number().int().nonnegative(),
    terminals: z.number().int().nonnegative(),
    frontiers: z.number().int().nonnegative(),
  }),
  omissions: z.array(nonEmptyStringSchema),
});
