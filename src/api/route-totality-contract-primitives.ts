import { z } from "zod";

export const nonEmptyStringSchema = z.string().min(1);
export const nonNegativeIntegerSchema = z.number().int().nonnegative();
export const positiveIntegerSchema = z.number().int().positive();
export const evidenceStatusSchema = z.enum(["proven", "partial", "unsupported"]);
const sourceSpanSchema = z.strictObject({
  startLine: positiveIntegerSchema,
  startColumn: positiveIntegerSchema,
  endLine: positiveIntegerSchema,
  endColumn: positiveIntegerSchema,
});
export const sourceLocationSchema = z.strictObject({
  file: nonEmptyStringSchema,
  line: positiveIntegerSchema,
  column: positiveIntegerSchema,
  span: sourceSpanSchema,
});
const sourceRangeSchema = z.strictObject({
  file: nonEmptyStringSchema,
  start: nonNegativeIntegerSchema,
  end: nonNegativeIntegerSchema,
});
export const evidenceProofSchema = z.strictObject({
  kind: nonEmptyStringSchema,
  detail: nonEmptyStringSchema,
  locations: z.array(sourceLocationSchema).min(1),
  status: evidenceStatusSchema,
});
const scopeDirectionSchema = z.enum(["forward", "backward", "both"]);
const boundaryKindSchema = z.enum([
  "external-code",
  "framework-runtime",
  "filesystem",
  "network",
  "process",
  "unknown",
]);
export const originRoleSchema = z.enum([
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
export const terminalRoleSchema = z.enum([
  "render",
  "component-occurrence",
  "stdout",
  "file-write",
  "exit",
  "side-effect",
  "return",
  "http-response",
  "response",
  "message",
  "child-process",
  "completion",
]);
const boundaryPolicySchema = z.strictObject({
  maxDepth: nonNegativeIntegerSchema,
  maxElements: positiveIntegerSchema,
  maxRelations: positiveIntegerSchema,
  includeExternal: z.boolean(),
  includeUnsupported: z.boolean(),
  includeFramework: z.boolean(),
  stopAtBoundary: z.boolean(),
});
const terminalPolicySchema = z.strictObject({
  roles: z.array(terminalRoleSchema),
  maxTerminals: positiveIntegerSchema,
  includeIntermediate: z.boolean(),
  stopAtTerminal: z.boolean(),
});
const scopePolicySchema = z.strictObject({
  direction: scopeDirectionSchema,
  boundaryPolicy: boundaryPolicySchema,
  terminalPolicy: terminalPolicySchema,
});
export const routeTotalityCandidateSchema = z.strictObject({
  id: nonEmptyStringSchema,
  kind: nonEmptyStringSchema,
  adapter: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  entryElementId: nonEmptyStringSchema,
  entry: sourceLocationSchema,
  framework: nonEmptyStringSchema.nullable(),
  proof: z.array(evidenceProofSchema),
  defaults: scopePolicySchema,
});
export const routeTotalitySeedSchema = z.strictObject({
  candidateId: nonEmptyStringSchema,
  entryElementId: nonEmptyStringSchema,
  adapter: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  framework: nonEmptyStringSchema.nullable(),
  proof: z.array(evidenceProofSchema),
  defaults: scopePolicySchema,
});
const programElementSchema = z.strictObject({
  id: nonEmptyStringSchema,
  kind: nonEmptyStringSchema,
  fieldName: nonEmptyStringSchema.nullable(),
  operationKind: nonEmptyStringSchema.nullable(),
  index: z.union([z.strictObject({ kind: z.literal("string-literal"), value: z.string() }), z.strictObject({ kind: z.literal("numeric-literal"), value: z.string() }), z.strictObject({ kind: z.literal("dynamic"), value: z.null() })]).nullable(),
  label: nonEmptyStringSchema,
  source: sourceRangeSchema,
  location: sourceLocationSchema,
  status: evidenceStatusSchema,
  proof: z.array(evidenceProofSchema),
  symbol: nonEmptyStringSchema.nullable(),
  originRoles: z.array(originRoleSchema),
  terminalRoles: z.array(terminalRoleSchema),
  boundary: boundaryKindSchema.nullable(),
});
const programRelationSchema = z.strictObject({
  id: nonEmptyStringSchema,
  from: nonEmptyStringSchema,
  to: nonEmptyStringSchema,
  kind: nonEmptyStringSchema,
  status: evidenceStatusSchema,
  proof: evidenceProofSchema,
});
export const sliceOriginSchema = z.strictObject({
  elementId: nonEmptyStringSchema,
  role: originRoleSchema,
  label: nonEmptyStringSchema,
  status: evidenceStatusSchema,
  proof: z.array(evidenceProofSchema),
});
export const sliceTerminalSchema = z.strictObject({
  elementId: nonEmptyStringSchema,
  role: terminalRoleSchema,
  label: nonEmptyStringSchema,
  status: evidenceStatusSchema,
  proof: z.array(evidenceProofSchema),
});
const evidenceGapReasonSchema = z.enum([
  "unsupported-syntax",
  "dynamic-dispatch",
  "external-code",
  "identity-lost",
  "unresolved-symbol",
  "runtime-only",
  "disconnected",
  "unsupported-boundary",
  "ambiguous-target",
  "unproven-handoff",
  "budget-exhausted",
]);
const evidenceGapSchema = z.strictObject({
  id: nonEmptyStringSchema,
  from: nonEmptyStringSchema.nullable(),
  to: nonEmptyStringSchema.nullable(),
  label: nonEmptyStringSchema,
  reason: evidenceGapReasonSchema,
  status: z.enum(["partial", "unsupported"]),
  location: sourceLocationSchema.nullable(),
  proof: z.array(evidenceProofSchema),
});
const coverageStatusCountSchema = z.strictObject({
  total: nonNegativeIntegerSchema,
  proven: nonNegativeIntegerSchema,
  partial: nonNegativeIntegerSchema,
  unsupported: nonNegativeIntegerSchema,
});
const coverageSetCountSchema = z.strictObject({
  total: nonNegativeIntegerSchema,
  elements: nonNegativeIntegerSchema,
  relations: nonNegativeIntegerSchema,
  origins: nonNegativeIntegerSchema,
  terminals: nonNegativeIntegerSchema,
});
const coverageSchema = z.strictObject({
  status: evidenceStatusSchema,
  complete: z.boolean(),
  direction: scopeDirectionSchema,
  budget: z.strictObject({
    limit: positiveIntegerSchema,
    used: nonNegativeIntegerSchema,
    exhausted: z.boolean(),
  }),
  budgetExhausted: z.boolean(),
  elements: coverageStatusCountSchema,
  relations: coverageStatusCountSchema,
  origins: nonNegativeIntegerSchema,
  terminals: nonNegativeIntegerSchema,
  gaps: nonNegativeIntegerSchema,
  notes: z.array(nonEmptyStringSchema),
  included: coverageSetCountSchema,
  proven: coverageSetCountSchema,
  partial: coverageSetCountSchema,
  gap: z.strictObject({ total: nonNegativeIntegerSchema }),
  truncation: z.strictObject({
    budget: z.boolean(),
    depth: z.boolean(),
    elements: z.boolean(),
    relations: z.boolean(),
    origins: z.boolean(),
    terminals: z.boolean(),
    gaps: z.boolean(),
  }),
});
export const evidenceSliceSchema = z.strictObject({
  elements: z.array(programElementSchema),
  relations: z.array(programRelationSchema),
  origins: z.array(sliceOriginSchema),
  terminals: z.array(sliceTerminalSchema),
  gaps: z.array(evidenceGapSchema),
  coverage: coverageSchema,
});
