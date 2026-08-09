import { z } from "zod";
import { validateRouteOccurrenceSurface, validateRouteTotality } from "./route-occurrence-validation";
import { routeContextContinuitySchema } from "./route-context-continuity-contracts";
import {
  routeTotalityBridgeCountsSchema,
  routeTotalityBridgeSchema,
} from "./route-totality-bridge-contracts";
import { routeTotalityFieldLineageSchema } from "./route-totality-field-lineage-contracts";
import {
  routeTotalityFindingAttachmentSchema,
  routeTotalityFindingIndexEntrySchema,
} from "./route-totality-finding-contracts";
import {
  evidenceProofSchema,
  evidenceSliceSchema,
  nonEmptyStringSchema,
  nonNegativeIntegerSchema,
  positiveIntegerSchema,
  routeTotalityCandidateSchema,
  routeTotalitySeedSchema,
  sliceOriginSchema,
  sourceLocationSchema,
} from "./route-totality-contract-primitives";
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
