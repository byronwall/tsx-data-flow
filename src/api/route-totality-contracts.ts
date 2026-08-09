import { z } from "zod";
import { validateRouteOccurrenceSurface, validateRouteTotality } from "./route-occurrence-validation";
import { routeContextContinuitySchema } from "./route-context-continuity-contracts";
import { routeTotalityFieldLineageSchema } from "./route-totality-field-lineage-contracts";
const nonEmptyStringSchema = z.string().min(1);
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const positiveIntegerSchema = z.number().int().positive();
const evidenceStatusSchema = z.enum(["proven", "partial", "unsupported"]);
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
const terminalRoleSchema = z.enum([
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
const routeTotalityCandidateSchema = z.strictObject({
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
const routeTotalitySeedSchema = z.strictObject({
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
const sliceOriginSchema = z.strictObject({
  elementId: nonEmptyStringSchema,
  role: originRoleSchema,
  label: nonEmptyStringSchema,
  status: evidenceStatusSchema,
  proof: z.array(evidenceProofSchema),
});
const sliceTerminalSchema = z.strictObject({
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
const routeTotalityBridgeOriginEndpointSchema = z.strictObject({
  layer: z.literal("evidence-slice"),
  kind: z.literal("origin"),
  elementId: nonEmptyStringSchema,
  role: originRoleSchema,
});
const routeTotalityBridgeOccurrenceEndpointSchema = z.strictObject({
  layer: z.literal("occurrence-surface"),
  kind: z.literal("occurrence"),
  occurrenceId: nonEmptyStringSchema,
});
const routeTotalityBridgeTerminalEndpointSchema = z.strictObject({
  layer: z.literal("occurrence-surface"),
  kind: z.literal("terminal"),
  terminalId: nonEmptyStringSchema,
});
const routeTotalityBridgeCommonSchema = {
  id: nonEmptyStringSchema,
  status: z.enum(["proven", "partial"]),
  proof: evidenceProofSchema,
  locations: z.array(sourceLocationSchema).min(1),
  evidencePathElementIds: z.array(nonEmptyStringSchema).min(1),
  evidencePathRelationIds: z.array(nonEmptyStringSchema),
};
const routeTotalityBridgeSchema = z.discriminatedUnion("direction", [
  z.strictObject({
    ...routeTotalityBridgeCommonSchema,
    direction: z.literal("origin-to-render"),
    from: routeTotalityBridgeOriginEndpointSchema,
    to: routeTotalityBridgeOccurrenceEndpointSchema,
  }),
  z.strictObject({
    ...routeTotalityBridgeCommonSchema,
    direction: z.literal("render-terminal-to-origin"),
    from: routeTotalityBridgeTerminalEndpointSchema,
    to: routeTotalityBridgeOriginEndpointSchema,
  }),
]);
const routeTotalityBridgeCountsSchema = z.strictObject({
  total: nonNegativeIntegerSchema,
  originToRender: nonNegativeIntegerSchema,
  renderTerminalToOrigin: nonNegativeIntegerSchema,
  proven: nonNegativeIntegerSchema,
  partial: nonNegativeIntegerSchema,
});
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
const routeTotalityFindingAttachmentSchema = z.strictObject({
  id: nonEmptyStringSchema,
  findingId: nonEmptyStringSchema,
  expressionId: nonEmptyStringSchema,
  target: routeTotalityFindingTargetSchema,
  location: sourceLocationSchema,
  status: z.enum(["proven", "partial"]),
  proof: evidenceProofSchema,
});
const routeTotalityFindingIndexEntrySchema = z.strictObject({
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
const routeOccurrenceRepetitionSchema = z.enum([
  "single",
  "conditional",
  "collection",
  "unknown",
]);
const repetitionMarkerSchema = z.enum(["conditional", "collection"]);
const occurrenceOwnershipSchema = z.enum([
  "scope-entry",
  "caller-owned",
  "definition-owned",
]);
const frameworkBoundaryKindSchema = z.enum([
  "portal",
  "control-flow",
  "collection",
  "suspense-async",
  "unsupported-ownership",
]);
const edgeKindSchema = z.enum([
  "render",
  "framework-boundary",
  "slot-forward",
  "transparent-splice",
]);
const slotExpressionKindSchema = z.enum([
  "props.children",
  "children-parameter",
  "named-slot",
]);
const routeOccurrenceDefinitionSchema = z.strictObject({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  compilerIdentity: nonEmptyStringSchema,
  sourceIdentity: nonEmptyStringSchema,
  sourceFile: nonEmptyStringSchema.nullable(),
  importModule: nonEmptyStringSchema.nullable(),
  declaration: sourceLocationSchema.nullable(),
  external: z.boolean(),
});
const routeRenderOccurrenceSchema = z.strictObject({
  id: nonEmptyStringSchema,
  key: nonEmptyStringSchema,
  callSiteId: nonEmptyStringSchema,
  definitionId: nonEmptyStringSchema,
  definitionSourceIdentity: nonEmptyStringSchema,
  definitionCompilerIdentity: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  expression: nonEmptyStringSchema.optional(),
  parentOccurrenceId: nonEmptyStringSchema.nullable(),
  renderParentId: nonEmptyStringSchema.nullable(),
  scopeId: nonEmptyStringSchema,
  scopeSeed: nonEmptyStringSchema,
  callSite: sourceLocationSchema,
  ownership: occurrenceOwnershipSchema,
  repetition: routeOccurrenceRepetitionSchema,
  repetitionMarkers: z.array(repetitionMarkerSchema),
  runtimeMultiplicity: z.literal("unknown"),
  staticCallSiteCount: z.literal(1),
  callerOwnedChildOccurrenceIds: z.array(nonEmptyStringSchema),
  definitionOwnedChildOccurrenceIds: z.array(nonEmptyStringSchema),
  slotForwardingIds: z.array(nonEmptyStringSchema),
  frameworkBoundaryIds: z.array(nonEmptyStringSchema),
  hiddenWrapperCompatibility: z.boolean(),
});
const routeFrameworkBoundarySchema = z.strictObject({
  id: nonEmptyStringSchema,
  key: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  kind: frameworkBoundaryKindSchema,
  scopeId: nonEmptyStringSchema,
  scopeSeed: nonEmptyStringSchema,
  parentOccurrenceId: nonEmptyStringSchema.nullable(),
  renderParentId: nonEmptyStringSchema.nullable(),
  location: sourceLocationSchema,
  repetition: routeOccurrenceRepetitionSchema,
  repetitionMarkers: z.array(repetitionMarkerSchema),
  runtimeMultiplicity: z.literal("unknown"),
  childOccurrenceIds: z.array(nonEmptyStringSchema),
  fallbackChildOccurrenceIds: z.array(nonEmptyStringSchema),
  sourceExpression: nonEmptyStringSchema.nullable(),
  sourceLocation: sourceLocationSchema.nullable(),
  sourceBacked: z.boolean().nullable(),
  condition: z.strictObject({ outcome: z.enum(["truthy", "falsey", "unknown"]), detail: nonEmptyStringSchema, locations: z.array(sourceLocationSchema).min(1) }).nullable(),
  ownership: z.literal("framework-owned"),
});
const routeOccurrenceEdgeSchema = z.strictObject({
  id: nonEmptyStringSchema,
  from: nonEmptyStringSchema,
  to: nonEmptyStringSchema,
  kind: edgeKindSchema,
  locations: z.array(sourceLocationSchema),
  detail: nonEmptyStringSchema,
});
const routeSlotForwardingSchema = z.strictObject({
  id: nonEmptyStringSchema,
  occurrenceId: nonEmptyStringSchema,
  kind: slotExpressionKindSchema,
  evidence: z.strictObject({
    kind: slotExpressionKindSchema,
    label: nonEmptyStringSchema,
  }),
  definitionSourceIdentity: nonEmptyStringSchema,
  sourceLocation: sourceLocationSchema,
  callerChildOccurrenceIds: z.array(nonEmptyStringSchema),
  sourceBacked: z.boolean(),
  detail: nonEmptyStringSchema,
});
const routeTerminalOccurrenceSchema = z.strictObject({
  id: nonEmptyStringSchema,
  kind: z.enum(["jsx-text", "dom-attribute", "style", "render-expression"]),
  ownerOccurrenceId: nonEmptyStringSchema.nullable(),
  renderParentId: nonEmptyStringSchema.nullable(),
  location: sourceLocationSchema,
  label: nonEmptyStringSchema,
  expression: nonEmptyStringSchema.nullable(),
  repetition: routeOccurrenceRepetitionSchema,
  runtimeMultiplicity: z.literal("unknown"),
});
const routeOccurrenceOmissionReasonSchema = z.enum([
  "budget-exhausted",
  "recursion-limit",
  "unsupported-syntax",
  "unsupported-ownership",
  "unresolved-symbol",
  "dynamic-dispatch",
  "external-code",
  "identity-lost",
]);
const routeOccurrenceOmissionSchema = z.strictObject({
  id: nonEmptyStringSchema,
  reason: routeOccurrenceOmissionReasonSchema,
  label: nonEmptyStringSchema,
  count: positiveIntegerSchema,
  locations: z.array(sourceLocationSchema),
});
const hiddenWrapperCompatibilityOccurrenceSchema = z.strictObject({
  occurrenceId: nonEmptyStringSchema,
  definitionId: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  callSite: sourceLocationSchema,
  detail: nonEmptyStringSchema,
});
const totalStatusSchema = z.enum(["exact", "lower-bound", "unknown"]);
const totalCountSchema = z.strictObject({
  emitted: nonNegativeIntegerSchema,
  total: nonNegativeIntegerSchema.nullable(),
  totalStatus: totalStatusSchema,
});
const routeOccurrenceTotalsSchema = z.strictObject({
  definitions: totalCountSchema,
  occurrences: totalCountSchema,
  edges: totalCountSchema,
  boundaries: totalCountSchema,
  origins: totalCountSchema,
  terminals: totalCountSchema,
  hiddenWrappers: totalCountSchema,
  repeated: totalCountSchema,
  conditional: totalCountSchema,
  collection: totalCountSchema,
  omissions: totalCountSchema,
  omittedItems: totalCountSchema,
});
const routeOccurrenceTruncationSchema = z.strictObject({
  definitions: z.boolean(),
  occurrences: z.boolean(),
  edges: z.boolean(),
  boundaries: z.boolean(),
  origins: z.boolean(),
  terminals: z.boolean(),
  hiddenWrappers: z.boolean(),
  repeated: z.boolean(),
  conditional: z.boolean(),
  collection: z.boolean(),
  omissions: z.boolean(),
});
export const routeOccurrenceSurfaceStructureSchema = z.strictObject({
  id: nonEmptyStringSchema,
  status: z.enum(["complete", "partial", "unavailable"]),
  route: z.strictObject({
    key: nonEmptyStringSchema,
    pathPattern: nonEmptyStringSchema,
    file: nonEmptyStringSchema,
  }),
  scope: z.strictObject({
    id: nonEmptyStringSchema,
    seed: nonEmptyStringSchema,
  }),
  definitions: z.array(routeOccurrenceDefinitionSchema),
  occurrences: z.array(routeRenderOccurrenceSchema),
  renderEdges: z.array(routeOccurrenceEdgeSchema),
  frameworkBoundaries: z.array(routeFrameworkBoundarySchema),
  slotForwarding: z.array(routeSlotForwardingSchema),
  origins: z.array(sliceOriginSchema),
  terminals: z.array(routeTerminalOccurrenceSchema),
  hiddenWrapperCompatibility: z.array(hiddenWrapperCompatibilityOccurrenceSchema),
  omissions: z.array(routeOccurrenceOmissionSchema),
  totals: routeOccurrenceTotalsSchema,
  truncation: routeOccurrenceTruncationSchema,
});
export const routeOccurrenceSurfaceSchema = routeOccurrenceSurfaceStructureSchema
  .superRefine((surface, context) => {
    for (const issue of validateRouteOccurrenceSurface(surface)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.path,
        message: issue.message,
      });
    }
  });
const routeTotalityUnavailableSchema = z.strictObject({
  status: z.literal("unavailable"),
  reason: nonEmptyStringSchema,
});
const routeTotalityGapSchema = z.strictObject({
  id: nonEmptyStringSchema,
  source: z.enum(["route-selection", "occurrence-surface", "evidence-slice", "context-continuity"]),
  reason: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  status: z.enum(["partial", "unsupported"]),
  location: sourceLocationSchema.nullable(),
  proof: z.array(evidenceProofSchema),
});
const routeTotalityCountsSchema = z.strictObject({
  definitions: totalCountSchema,
  occurrences: totalCountSchema,
  edges: totalCountSchema,
  boundaries: totalCountSchema,
  origins: totalCountSchema,
  terminals: totalCountSchema,
  hiddenWrappers: totalCountSchema,
  repeated: totalCountSchema,
  conditional: totalCountSchema,
  collection: totalCountSchema,
  omissions: totalCountSchema,
  omittedItems: totalCountSchema,
  evidenceElements: totalCountSchema,
  evidenceRelations: totalCountSchema,
  evidenceOrigins: totalCountSchema,
  evidenceTerminals: totalCountSchema,
  evidenceGaps: totalCountSchema,
});
function routeTotalityObject<Surface extends z.ZodType>(surfaceSchema: Surface) {
  return z.strictObject({
    status: z.enum(["complete", "partial", "unavailable"]),
    route: z.strictObject({
      key: nonEmptyStringSchema,
      pathPattern: nonEmptyStringSchema,
      file: nonEmptyStringSchema,
    }),
    candidate: routeTotalityCandidateSchema.nullable(),
    seed: routeTotalitySeedSchema.nullable(),
    scopeProof: z.array(evidenceProofSchema),
    occurrenceSurface: z.union([
      surfaceSchema,
      routeTotalityUnavailableSchema,
    ]),
    evidenceSlice: z.union([evidenceSliceSchema, routeTotalityUnavailableSchema]),
    contextContinuity: routeContextContinuitySchema,
    bridges: z.array(routeTotalityBridgeSchema),
    bridgeCounts: routeTotalityBridgeCountsSchema,
    fieldLineage: routeTotalityFieldLineageSchema,
    findingAttachments: z.array(routeTotalityFindingAttachmentSchema),
    findingIndex: z.array(routeTotalityFindingIndexEntrySchema),
    counts: routeTotalityCountsSchema,
    gaps: z.array(routeTotalityGapSchema),
    omissions: z.array(nonEmptyStringSchema),
  });
}
export const routeTotalityStructureSchema = routeTotalityObject(routeOccurrenceSurfaceStructureSchema);
export const routeTotalitySchema = routeTotalityObject(routeOccurrenceSurfaceSchema)
  .superRefine((totality, context) => {
    for (const issue of validateRouteTotality(totality)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.path,
        message: issue.message,
      });
    }
  });
export type EvidenceSlice = z.infer<typeof evidenceSliceSchema>; export type RouteCount = z.infer<typeof totalCountSchema>;
export type RouteOccurrenceSurface = z.infer<typeof routeOccurrenceSurfaceSchema>; export type RouteTotality = z.infer<typeof routeTotalitySchema>;
