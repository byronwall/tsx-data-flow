import { z } from "zod";
import {
  evidenceProofSchema,
  nonEmptyStringSchema,
  originRoleSchema,
  sourceLocationSchema,
  terminalRoleSchema,
} from "./route-totality-contract-primitives";

const routeTotalityFindingTargetSchema = z.union([
  z.strictObject({
    source: z.literal("evidence-slice"),
    kind: z.literal("element"),
    id: nonEmptyStringSchema,
    role: z.null(),
    family: nonEmptyStringSchema,
  }),
  z.strictObject({
    source: z.literal("evidence-slice"),
    kind: z.literal("origin"),
    id: nonEmptyStringSchema,
    role: originRoleSchema,
    family: nonEmptyStringSchema,
  }),
  z.strictObject({
    source: z.literal("evidence-slice"),
    kind: z.literal("terminal"),
    id: nonEmptyStringSchema,
    role: terminalRoleSchema,
    family: nonEmptyStringSchema,
  }),
  z.strictObject({
    source: z.literal("occurrence-surface"),
    kind: z.literal("terminal"),
    id: nonEmptyStringSchema,
    role: z.null(),
    family: nonEmptyStringSchema,
  }),
]);

export const routeTotalityFindingAttachmentSchema = z.strictObject({
  id: nonEmptyStringSchema,
  findingId: nonEmptyStringSchema,
  expressionId: nonEmptyStringSchema,
  target: routeTotalityFindingTargetSchema,
  location: sourceLocationSchema,
  status: z.enum(["proven", "partial"]),
  proof: evidenceProofSchema,
});

export const routeTotalityFindingIndexEntrySchema = z.strictObject({
  findingId: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  family: nonEmptyStringSchema.nullable(),
  file: nonEmptyStringSchema,
  location: sourceLocationSchema,
  expressionIds: z.array(nonEmptyStringSchema).min(1),
  detailRef: z.strictObject({
    source: z.literal("file-page"),
    kind: z.literal("finding-detail"),
    id: nonEmptyStringSchema,
    file: nonEmptyStringSchema,
  }),
});
