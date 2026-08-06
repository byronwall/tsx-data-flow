import { z } from "zod";
import { REPORT_VIEWS } from "./report-views";
import { routeTotalitySchema, routeTotalityStructureSchema } from "./route-totality-contracts";
import { validateNestedOccurrenceEvidence } from "./route-shadow-evidence-validation";
import type {
  RouteOccurrenceSurface as RouteOccurrenceSurfaceContract,
  RouteTotality as RouteTotalityContract,
} from "./route-totality-contracts";

export type RouteOccurrenceSurface = RouteOccurrenceSurfaceContract;
export type RouteTotality = RouteTotalityContract;

export const comparisonStateSchema = z.enum(["new", "worsened", "resolved", "unchanged"]);
export const reviewScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("project") }),
  z.strictObject({ kind: z.literal("file-set"), paths: z.array(z.string()) }),
  z.strictObject({ kind: z.literal("scope"), query: z.string() }),
]);

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const apiMetadataSchema = z.strictObject({
  apiVersion: z.literal(1),
  analysisVersion: z.number().int().nonnegative(),
  generation: z.number().int().nonnegative(),
  generatedAt: z.string(),
});

export const workspaceFileRowSchema = z.strictObject({
  path: z.string(),
  findings: z.strictObject({
    count: z.number().int().nonnegative(),
    worstBurden: z.number(),
    maxDepth: z.number().int().nonnegative(),
  }),
  entries: z.strictObject({
    boundaries: z.number().int().nonnegative(),
    relays: z.number().int().nonnegative(),
    unknownEdges: z.number().int().nonnegative(),
    fanOutSources: z.number().int().nonnegative(),
  }),
  classification: z.strictObject({
    primaryShape: z.string(),
    ownership: z.string(),
    firstCut: z.string(),
  }),
  flags: z.strictObject({ graphParticipant: z.boolean() }),
  comparisonState: comparisonStateSchema.nullable(),
  worstFinding: z.strictObject({
    id: z.string(),
    label: z.string(),
    line: z.number().int().nonnegative(),
    burden: z.number(),
  }).nullable(),
  searchText: z.string(),
});

const mapLocationSchema = z.strictObject({ path: z.string(), line: z.number().int().nonnegative() });
const semanticMapAreaSchema = z.strictObject({
  id: z.string(), label: z.string(), path: z.string(),
  sourceCount: z.number().int().nonnegative(), sinkCount: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(), worstBurden: z.number(),
  boundaryCount: z.number().int().nonnegative(), unknownCount: z.number().int().nonnegative(),
  landmarks: z.array(z.strictObject({ kind: z.enum(["boundary", "context", "source", "terminal", "opaque"]), label: z.string(), location: mapLocationSchema.nullable() })),
});
const semanticMapEdgeSchema = z.strictObject({
  id: z.string(), from: z.string(), to: z.string(),
  flowCount: z.number().int().positive(), unknownCount: z.number().int().nonnegative(),
  kinds: z.array(z.string()),
});
const semanticMapTrajectorySchema = z.strictObject({
  id: z.string(), label: z.string(), sourceLabels: z.array(z.string()),
  areaIds: z.array(z.string()), terminal: mapLocationSchema,
  burden: z.number(), depth: z.number().int().nonnegative(), traceComplete: z.boolean(),
});
const componentMapNodeSchema = z.strictObject({
  id: z.string(), name: z.string(), path: z.string(), line: z.number().int().nonnegative(),
  incomingCount: z.number().int().nonnegative(), outgoingCount: z.number().int().nonnegative(),
  useCount: z.number().int().nonnegative(), role: z.enum(["root", "branch", "leaf", "shared"]),
});
const componentMapEdgeSchema = z.strictObject({
  id: z.string(), from: z.string(), to: z.string(), useCount: z.number().int().positive(),
});
const cleanupOpportunitySchema = z.strictObject({
  id: z.string(), label: z.string(), location: mapLocationSchema,
  burden: z.number(), sinkCount: z.number().int().positive(), fileCount: z.number().int().positive(),
  pivots: z.array(z.string()), causes: z.array(z.string()), shape: z.string(),
  evidenceLevel: z.enum(["proven-unnecessary", "suspicious-transformation", "trace-incomplete", "fact"]),
  recommendation: z.string(), memberLocations: z.array(mapLocationSchema),
});
export const semanticMapSchema = z.strictObject({
  areas: z.array(semanticMapAreaSchema), edges: z.array(semanticMapEdgeSchema),
  trajectories: z.array(semanticMapTrajectorySchema), cleanup: z.array(cleanupOpportunitySchema),
  components: z.strictObject({ nodes: z.array(componentMapNodeSchema), edges: z.array(componentMapEdgeSchema), totals: z.strictObject({ nodes: z.number().int().nonnegative(), edges: z.number().int().nonnegative() }) }),
  totals: z.strictObject({
    areas: z.number().int().nonnegative(), edges: z.number().int().nonnegative(),
    trajectories: z.number().int().nonnegative(), cleanupOpportunities: z.number().int().nonnegative(),
  }),
  caps: z.strictObject({ areas: z.number().int().positive(), edges: z.number().int().positive(), trajectories: z.number().int().positive(), cleanup: z.number().int().positive() }),
});

export const routeDataConfidenceSchema = z.enum(["high", "medium", "low"]);
const routeShadowLocationSchema = z.strictObject({
  file: z.string(), line: z.number().int().positive(), column: z.number().int().positive(),
  span: z.strictObject({ startLine: z.number().int().positive(), startColumn: z.number().int().positive(), endLine: z.number().int().positive(), endColumn: z.number().int().positive() }),
});
const routeShadowProofSchema = z.strictObject({
  kind: z.enum(["compiler-symbol", "return-expression", "argument-binding", "resource-result", "component-prop", "context-member", "property-read", "render-sink", "parent-occurrence", "transparent-wrapper-splice"]),
  detail: z.string(), locations: z.array(routeShadowLocationSchema).min(1),
});
const routeShadowOccurrenceDefinitionSchema = z.strictObject({
  id: z.string(), name: z.string(), compilerIdentity: z.string(), importModule: z.string().nullable(), declaration: routeShadowLocationSchema.nullable(),
});
const routeShadowOccurrenceSchema = z.strictObject({
  id: z.string(), callSiteId: z.string(), definitionId: z.string(), definitionCompilerIdentity: z.string(), name: z.string(),
  parentOccurrenceId: z.string().nullable(), callerOwnedChildOccurrenceIds: z.array(z.string()).max(96), scopeId: z.string(), callSite: routeShadowLocationSchema,
  ownership: z.enum(["scope-entry", "caller-owned"]), repetition: z.literal("single"),
});
const routeShadowOccurrenceProjectionEdgeSchema = z.strictObject({
  fromOccurrenceId: z.string(), toOccurrenceId: z.string(), kind: z.enum(["render", "transparent-splice"]), hiddenWrapperOccurrenceId: z.string().nullable(),
  evidence: z.strictObject({ kind: z.enum(["parent-occurrence", "transparent-wrapper-splice"]), detail: z.string(), locations: z.array(routeShadowLocationSchema).min(1) }),
});
const routeShadowHiddenPathSchema = z.strictObject({
  wrapperOccurrenceId: z.string(), definitionId: z.string(), parentOccurrenceId: z.string().nullable(), callerOwnedChildOccurrenceIds: z.array(z.string()).max(96),
  sourcePathParticipates: z.boolean(), callSite: routeShadowLocationSchema,
  hiddenEdges: z.array(z.strictObject({ fromOccurrenceId: z.string(), toOccurrenceId: z.string(), locations: z.array(routeShadowLocationSchema).min(1) })).max(128),
});
const routeShadowOccurrenceProjectionSchema = z.strictObject({
  hiddenOccurrenceId: z.string(),
  visibleEdges: z.array(routeShadowOccurrenceProjectionEdgeSchema).max(128),
  hiddenPaths: z.array(routeShadowHiddenPathSchema).max(16),
  reattachedChildOccurrenceIds: z.array(z.string()).max(96),
});
const routeShadowOccurrenceEvidenceSchema = z.strictObject({
  status: z.enum(["proven", "partial", "unavailable"]), scopeId: z.string(), route: z.strictObject({ pathPattern: z.string(), entryFile: z.string() }),
  component: z.strictObject({ definition: routeShadowOccurrenceDefinitionSchema, occurrence: routeShadowOccurrenceSchema }).nullable(),
  terminal: routeShadowLocationSchema.nullable(),
  definitions: z.array(routeShadowOccurrenceDefinitionSchema).max(24), occurrences: z.array(routeShadowOccurrenceSchema).max(96),
  sourcePath: z.strictObject({
    status: z.enum(["proven", "unavailable", "invalid"]), sourceOccurrenceId: z.string().nullable(), sourceCompilerIdentity: z.string().nullable(),
    sourceLocation: routeShadowLocationSchema.nullable(), terminalLocation: routeShadowLocationSchema.nullable(), scopeId: z.string().nullable(),
    occurrenceIds: z.array(z.string()).max(96), detail: z.string(),
  }),
  selectedWrapperOccurrenceId: z.string().nullable(), projection: routeShadowOccurrenceProjectionSchema.nullable(),
  siblingIsolation: z.strictObject({
    selectedWrapperOccurrenceId: z.string(), siblingWrapperOccurrenceId: z.string(), sameDefinition: z.boolean(),
    selectedChildOccurrenceIds: z.array(z.string()).max(96), siblingChildOccurrenceIds: z.array(z.string()).max(96),
    siblingReceivedSelectedChildren: z.boolean(), siblingInSourcePath: z.boolean(),
  }).nullable(),
  gaps: z.array(z.strictObject({ reason: z.enum(["unresolved-symbol", "identity-lost", "unsupported-syntax"]), label: z.string(), location: routeShadowLocationSchema.nullable() })).max(16),
  truncation: z.strictObject({ definitions: z.boolean(), occurrences: z.boolean(), edges: z.boolean(), hiddenPaths: z.boolean(), gaps: z.boolean() }),
});

export type RouteShadowOccurrenceEvidenceContract = z.infer<typeof routeShadowOccurrenceEvidenceSchema>;
export type RouteShadowOccurrenceContract = z.infer<typeof routeShadowOccurrenceSchema>;
export type RouteShadowOccurrenceDefinitionContract = z.infer<typeof routeShadowOccurrenceDefinitionSchema>;
export type RouteShadowOccurrenceLocationContract = z.infer<typeof routeShadowLocationSchema>;

export const routeShadowEvidenceSchema = z.strictObject({
  status: z.enum(["proven", "partial", "unavailable"]),
  route: z.strictObject({ key: z.string(), pathPattern: z.string(), file: z.string() }),
  origin: z.strictObject({
    id: z.string(), kind: z.literal("filesystem"), label: z.string(),
    definition: z.strictObject({ id: z.string(), name: z.string(), module: z.string().nullable(), compilerIdentity: z.string(), location: routeShadowLocationSchema.nullable() }),
    occurrence: z.strictObject({ id: z.string(), expression: z.string(), compilerIdentity: z.string(), location: routeShadowLocationSchema }),
  }).nullable(),
  terminal: z.strictObject({ id: z.string(), kind: z.enum(["jsx-text", "dom-attribute", "style"]), label: z.string(), component: z.string().nullable(), location: routeShadowLocationSchema }).nullable(),
  nodes: z.array(z.strictObject({ id: z.string(), role: z.enum(["origin", "handoff", "terminal"]), kind: z.string(), label: z.string(), location: routeShadowLocationSchema.nullable() })),
  edges: z.array(z.strictObject({
    id: z.string(), from: z.string(), to: z.string(),
    kind: z.enum(["origin-read", "call-return", "resource-result", "component-prop", "context-member", "property-read", "render-terminal", "render-occurrence", "transparent-splice"]),
    proof: routeShadowProofSchema,
  })),
  gaps: z.array(z.strictObject({
    id: z.string(), from: z.string(), to: z.string().nullable(), label: z.string(),
    reason: z.enum(["unsupported-syntax", "dynamic-dispatch", "external-code", "identity-lost", "unresolved-symbol"]),
    location: routeShadowLocationSchema.nullable(),
  })),
  truncation: z.strictObject({ nodes: z.boolean(), edges: z.boolean(), gaps: z.boolean() }),
  occurrenceEvidence: routeShadowOccurrenceEvidenceSchema.nullable(),
}).superRefine((evidence, context) => {
  const nodeIds = new Set(evidence.nodes.map((node) => node.id));
  evidence.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.from)) context.addIssue({ code: "custom", path: ["edges", index, "from"], message: `Edge source does not reference an emitted node: ${edge.from}` });
    if (!nodeIds.has(edge.to)) context.addIssue({ code: "custom", path: ["edges", index, "to"], message: `Edge target does not reference an emitted node: ${edge.to}` });
  });
  evidence.gaps.forEach((gap, index) => {
    if (!nodeIds.has(gap.from)) context.addIssue({ code: "custom", path: ["gaps", index, "from"], message: `Gap source does not reference an emitted node: ${gap.from}` });
    if (gap.to && !nodeIds.has(gap.to)) context.addIssue({ code: "custom", path: ["gaps", index, "to"], message: `Gap target does not reference an emitted node: ${gap.to}` });
  });
  if (evidence.occurrenceEvidence) {
    for (const issue of validateNestedOccurrenceEvidence(evidence.occurrenceEvidence)) {
      context.addIssue({ code: "custom", path: ["occurrenceEvidence", ...issue.path], message: issue.message });
    }
  }
});
const routeParameterSchema = z.strictObject({ name: z.string(), kind: z.enum(["dynamic", "catch-all"]) });
const routeDataEvidenceSchema = z.strictObject({
  id: z.string(), expression: z.string(), operationKind: z.string(), file: z.string(),
  line: z.number().int().positive(), column: z.number().int().positive(),
  span: z.strictObject({ startLine: z.number().int().positive(), startColumn: z.number().int().positive(), endLine: z.number().int().positive(), endColumn: z.number().int().positive() }),
  inputType: z.string(), outputType: z.string(), compilerIdentity: z.string().nullable(), confidence: routeDataConfidenceSchema, unknownReason: z.string().nullable(),
});
const routeSummarySchema = z.strictObject({
  key: z.string(), pathPattern: z.string(), file: z.string(), componentIdentityId: z.string().nullable(),
  parameters: z.array(routeParameterSchema), confidence: routeDataConfidenceSchema, componentNames: z.array(z.string()),
  routeKind: z.enum(["page", "api"]), sourceMethodKeys: z.array(z.string()), apiRouteKeys: z.array(z.string()),
  trajectoryCount: z.number().int().nonnegative(), completeTrajectoryCount: z.number().int().nonnegative(),
  totalPathSteps: z.number().int().nonnegative(), uniqueStepCount: z.number().int().nonnegative(), substitutionStepCount: z.number().int().nonnegative(), unknownGapCount: z.number().int().nonnegative(),
  omissions: z.array(z.string()),
});
const sourceMethodSummarySchema = z.strictObject({
  key: z.string(), label: z.string(), kind: z.enum(["prisma", "file", "validated-json", "other"]), file: z.string(), line: z.number().int().positive(), routeKeys: z.array(z.string()),
  consumerLabel: z.string().nullable(), handoffProven: z.boolean(),
  typeName: z.string().nullable(), typeText: z.string(), shapeKind: z.enum(["primitive", "object", "collection", "union", "opaque"]),
  fields: z.array(z.strictObject({ key: z.string(), typeText: z.string(), optional: z.boolean() })), totalFields: z.number().int().nonnegative(), evidenceId: z.string(),
  handoffFields: z.array(z.string()), consumerLabels: z.array(z.string()).optional(), transportBridgeIds: z.array(z.string()).optional(),
});
const trajectorySummarySchema = z.strictObject({
  key: z.string(), routeKey: z.string(), label: z.string(), operationCount: z.number().int().nonnegative(), terminalCount: z.number().int().nonnegative(),
  sourceMethodKeys: z.array(z.string()), substitutionStepCount: z.number().int().nonnegative(),
  routeReachableTerminalCount: z.number().int().nonnegative(), terminalSelectionLimit: z.number().int().positive(),
  ordering: z.literal("semantic-stage"), handoffsProven: z.boolean(),
  completeness: z.enum(["complete-for-supported-scope", "partial", "unknown"]), omissions: z.array(z.string()),
});
export const routeDataInventorySchema = z.strictObject({ routes: z.array(routeSummarySchema), sources: z.array(sourceMethodSummarySchema), trajectories: z.array(trajectorySummarySchema), totals: z.strictObject({ routes: z.number().int().nonnegative(), sources: z.number().int().nonnegative(), trajectories: z.number().int().nonnegative(), complete: z.number().int().nonnegative() }) });

export const hiddenComponentPolicySchema = z.strictObject({
  enabledByDefault: z.boolean(),
  include: z.array(z.string()),
  exclude: z.array(z.string()),
  configPath: z.string().nullable(),
});

const routeDataShapeSchema = z.strictObject({
  id: z.string(), typeName: z.string().nullable(), typeText: z.string(), kind: z.enum(["primitive", "object", "collection", "union", "opaque"]),
  fields: z.array(z.strictObject({ key: z.string(), typeText: z.string(), optional: z.boolean() })), totalFields: z.number().int().nonnegative(), opacityReason: z.string().nullable(),
});
const routeDataValueSchema = z.strictObject({ id: z.string(), label: z.string(), shapeId: z.string(), sourceOperationKey: z.string().nullable() });
const routeDataTransportBridgeSchema = z.strictObject({
  id: z.string(), path: z.string(), method: z.literal("GET"), apiRouteKey: z.string(), apiRouteFile: z.string(),
  handlerName: z.string(), handlerIdentity: z.string(), handlerFile: z.string(), handlerLine: z.number().int().positive(),
});
const routeDataOperationSchema = z.strictObject({
  key: z.string(), semanticKind: z.enum(["read", "parse", "validate", "map", "project", "augment", "derive", "select", "group", "normalize", "boundary", "render", "opaque"]),
  effect: z.enum(["preserve", "project", "augment", "derive", "select", "group", "normalize", "opaque", "render"]), label: z.string(),
  inputValueIds: z.array(z.string()), outputValueIds: z.array(z.string()), inputShapeIds: z.array(z.string()), outputShapeIds: z.array(z.string()),
  fieldEffects: z.array(z.strictObject({ kind: z.enum(["preserve", "project", "augment", "derive", "select", "group", "normalize", "opaque", "render"]), field: z.string().nullable(), detail: z.string() })),
  sourceExpressionIds: z.array(z.string()), boundary: z.strictObject({ kind: z.enum(["query", "resource", "component", "prop", "context", "call"]), label: z.string() }).nullable(),
  boundaryId: z.string().nullable(), transportBridge: routeDataTransportBridgeSchema.nullable().optional(), consumerHandoff: z.strictObject({
    kind: z.literal("return"),
    outputShapeId: z.string(),
    fieldPaths: z.array(z.string()),
  }).nullable(),
  owner: z.strictObject({ label: z.string(), file: z.string(), line: z.number().int().positive() }).nullable(),
  confidence: routeDataConfidenceSchema, completeness: z.enum(["complete", "partial", "opaque"]), completenessReason: z.string(),
});
const routeDataTerminalSchema = z.strictObject({ id: z.string(), label: z.string(), file: z.string(), line: z.number().int().positive(), component: z.string().nullable(), operationKey: z.string() });
const routeDataTrajectorySchema = z.strictObject({
  key: z.string(), routeKey: z.string(), label: z.string(), sourceValueIds: z.array(z.string()), operationKeys: z.array(z.string()), terminalIds: z.array(z.string()), supportingComponentIds: z.array(z.string()),
  routeReachableTerminalCount: z.number().int().nonnegative(), terminalSelectionLimit: z.number().int().positive(),
  ordering: z.literal("semantic-stage"), handoffsProven: z.boolean(),
  completeness: z.enum(["complete-for-supported-scope", "partial", "unknown"]), omissions: z.array(z.string()),
});
const routeContextNodeSchema = z.strictObject({ id: z.string(), aliases: z.array(z.string()).optional(), kind: z.enum(["source", "component", "terminal"]), label: z.string(), file: z.string().nullable(), line: z.number().int().positive().nullable(), group: z.enum(["persistence", "route", "render"]), parentId: z.string().nullable(), role: z.enum(["persistence", "route", "component", "framework", "terminal"]) });
const routeContextEdgeSchema = z.strictObject({ id: z.string(), from: z.string(), to: z.string(), kind: z.enum(["data", "component"]), relationship: z.enum(["hierarchy", "rendered"]).optional() });
const exhaustiveRouteGraphSchema = z.strictObject({
  nodes: z.array(z.strictObject({ key: z.string(), label: z.string(), snippet: z.string().nullable(), kind: z.string(), file: z.string().nullable(), line: z.number().int().positive().nullable(), column: z.number().int().positive().nullable(), boundaryId: z.string().nullable(), pathCount: z.number().int().positive(), minimumDepth: z.number().int().nonnegative(), component: z.string(), components: z.array(z.string()).min(1) })),
  edges: z.array(z.strictObject({ key: z.string(), from: z.string(), to: z.string(), kind: z.string(), unknown: z.boolean(), pathCount: z.number().int().positive() })),
  trajectories: z.array(z.strictObject({
    key: z.string(), sinkId: z.string(), terminalLabel: z.string(),
    stepKeys: z.array(z.string()), stepComponents: z.array(z.string()),
    sourceMethodKeys: z.array(z.string()), sourceHandoffKeys: z.array(z.string()),
    substitutionStepCount: z.number().int().nonnegative(),
    completeness: z.enum(["complete-for-supported-scope", "partial"]),
  })),
  totals: z.strictObject({ sinks: z.number().int().nonnegative(), trajectories: z.number().int().nonnegative(), nodes: z.number().int().nonnegative(), edges: z.number().int().nonnegative(), components: z.number().int().nonnegative(), unknownTrajectories: z.number().int().nonnegative() }),
  truncated: z.boolean(), cycleCount: z.number().int().nonnegative(), pathBudget: z.number().int().positive(),
});
const routeDataDetailBaseShape = {
  route: routeSummarySchema, trajectory: routeDataTrajectorySchema, operations: z.array(routeDataOperationSchema), values: z.array(routeDataValueSchema), shapes: z.array(routeDataShapeSchema), evidence: z.array(routeDataEvidenceSchema), terminals: z.array(routeDataTerminalSchema),
  sources: z.array(sourceMethodSummarySchema),
  context: z.strictObject({ nodes: z.array(routeContextNodeSchema), edges: z.array(routeContextEdgeSchema) }), exhaustiveGraph: exhaustiveRouteGraphSchema,
};
export const routeDataDetailTransportSchema = z.strictObject({ ...routeDataDetailBaseShape, hiddenComponentPolicy: hiddenComponentPolicySchema, totality: routeTotalityStructureSchema.nullable(), shadowEvidence: routeShadowEvidenceSchema.nullable().optional() });
export const routeDataDetailSchema = z.strictObject({ ...routeDataDetailBaseShape, hiddenComponentPolicy: hiddenComponentPolicySchema, totality: routeTotalitySchema.nullable(), shadowEvidence: routeShadowEvidenceSchema.nullable().optional() });
export const routeDataDetailRequestSchema = z.strictObject({ route: z.string().trim().min(1), flow: z.string().trim().min(1), generation: z.coerce.number().int().nonnegative().optional() });
export const routeDataDetailResponseSchema = apiMetadataSchema.extend({ data: routeDataDetailSchema });
export const routeDataDetailTransportResponseSchema = apiMetadataSchema.extend({ data: routeDataDetailTransportSchema });
export const SOURCE_EXCERPT_MAX_PATH_LENGTH = 512;
export const SOURCE_EXCERPT_DEFAULT_CONTEXT_LINES = 5;
export const SOURCE_EXCERPT_MAX_CONTEXT_LINES = 40;
export const SOURCE_EXCERPT_MAX_SPAN_LINES = 256;
export const SOURCE_EXCERPT_MAX_LINES = SOURCE_EXCERPT_MAX_SPAN_LINES + SOURCE_EXCERPT_MAX_CONTEXT_LINES * 2;

const sourceExcerptInteger = z.union([
  z.number().int(),
  z.string().trim().min(1).regex(/^\d+$/).transform(Number),
]);
const sourceExcerptPositiveInteger = sourceExcerptInteger.refine((value) => value > 0, "Must be a positive integer");
const sourceExcerptNonnegativeInteger = sourceExcerptInteger.refine((value) => value >= 0, "Must be a non-negative integer");
const sourceExcerptContextInteger = sourceExcerptInteger.pipe(z.number().int().nonnegative().max(SOURCE_EXCERPT_MAX_CONTEXT_LINES));
const sourceExcerptPathSchema = z.string().trim().min(1).max(SOURCE_EXCERPT_MAX_PATH_LENGTH).refine((value) => !value.includes("\0"), "NUL bytes are not valid in source paths");
export const sourceExcerptSpanSchema = z.strictObject({
  startLine: sourceExcerptPositiveInteger,
  startColumn: sourceExcerptPositiveInteger,
  endLine: sourceExcerptPositiveInteger,
  endColumn: sourceExcerptPositiveInteger,
}).superRefine((span, context) => {
  if (span.endLine < span.startLine) context.addIssue({ code: "custom", path: ["endLine"], message: "End line must not precede start line" });
  if (span.endLine === span.startLine && span.endColumn < span.startColumn) context.addIssue({ code: "custom", path: ["endColumn"], message: "End column must not precede start column" });
});

const sourceExcerptRequestInputSchema = z.strictObject({
  path: sourceExcerptPathSchema,
  generation: sourceExcerptNonnegativeInteger,
  span: sourceExcerptSpanSchema.optional(),
  startLine: sourceExcerptPositiveInteger.optional(),
  startColumn: sourceExcerptPositiveInteger.optional(),
  line: sourceExcerptPositiveInteger.optional(),
  column: sourceExcerptPositiveInteger.optional(),
  endLine: sourceExcerptPositiveInteger.optional(),
  endColumn: sourceExcerptPositiveInteger.optional(),
  contextBefore: sourceExcerptContextInteger.default(SOURCE_EXCERPT_DEFAULT_CONTEXT_LINES),
  contextAfter: sourceExcerptContextInteger.default(SOURCE_EXCERPT_DEFAULT_CONTEXT_LINES),
});

export const sourceExcerptRequestSchema = sourceExcerptRequestInputSchema.superRefine((input, context) => {
  const startLine = input.span?.startLine ?? input.startLine ?? input.line;
  const startColumn = input.span?.startColumn ?? input.startColumn ?? input.column ?? 1;
  const endLine = input.span?.endLine ?? input.endLine ?? startLine;
  const endColumn = input.span?.endColumn ?? input.endColumn ?? startColumn;
  if (startLine === undefined) context.addIssue({ code: "custom", path: ["span", "startLine"], message: "A start line is required" });
  if (endLine === undefined) context.addIssue({ code: "custom", path: ["span", "endLine"], message: "An end line is required" });
  if (startLine !== undefined && endLine !== undefined && endLine - startLine + 1 > SOURCE_EXCERPT_MAX_SPAN_LINES) context.addIssue({ code: "custom", path: ["span"], message: `The selected span cannot exceed ${SOURCE_EXCERPT_MAX_SPAN_LINES} lines` });
  if (startLine !== undefined && endLine !== undefined && endLine < startLine) context.addIssue({ code: "custom", path: ["span", "endLine"], message: "End line must not precede start line" });
  if (startLine !== undefined && endLine !== undefined && endLine === startLine && endColumn < startColumn) context.addIssue({ code: "custom", path: ["span", "endColumn"], message: "End column must not precede start column" });
}).transform((input) => {
  const startLine = input.span?.startLine ?? input.startLine ?? input.line ?? 0;
  const startColumn = input.span?.startColumn ?? input.startColumn ?? input.column ?? 1;
  const endLine = input.span?.endLine ?? input.endLine ?? startLine;
  const endColumn = input.span?.endColumn ?? input.endColumn ?? startColumn;
  return {
    path: input.path,
    generation: input.generation,
    span: { startLine, startColumn, endLine, endColumn },
    contextBefore: input.contextBefore,
    contextAfter: input.contextAfter,
  };
});

const sourceExcerptFunctionSchema = z.strictObject({ label: z.string().min(1), kind: z.string().min(1), span: sourceExcerptSpanSchema });
export const sourceExcerptResponseSchema = apiMetadataSchema.extend({ data: z.strictObject({
  path: z.string(),
  focus: z.strictObject({ line: z.number().int().positive(), column: z.number().int().positive(), endLine: z.number().int().positive(), endColumn: z.number().int().positive() }),
  lines: z.array(z.strictObject({ number: z.number().int().positive(), text: z.string(), focus: z.boolean() })).max(SOURCE_EXCERPT_MAX_LINES),
  containingFunction: sourceExcerptFunctionSchema.nullable(),
  file: z.strictObject({ lineCount: z.number().int().positive() }),
}) });

export const workspaceSchema = z.strictObject({
  workspace: z.strictObject({
    displayRoot: z.string(),
    source: z.string(),
    typescriptVersion: z.string().nullable(),
    configPaths: z.array(z.string()),
    warnings: z.array(z.string()),
    reviewScope: reviewScopeSchema,
  }),
  summary: z.strictObject({
    sources: z.number().int().nonnegative(),
    sinks: z.number().int().nonnegative(),
    nodes: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
    unknownEdges: z.number().int().nonnegative(),
    pathFamilies: z.number().int().nonnegative(),
  }),
  concentration: z.strictObject({
    fileCount: z.number().int().nonnegative(),
    top5: z.number(),
    hot4Plus: z.number().int().nonnegative(),
  }),
  comparison: z.strictObject({
    currentWorst: z.number(), baselineWorst: z.number(), worsened: z.number().int(), improved: z.number().int(), resolved: z.array(z.string()), newTop: z.strictObject({ label: z.string(), path: z.string(), line: z.number().int() }).nullable(),
    metricDeltas: z.strictObject({ fallbacks: z.number().int(), hops: z.number().int(), transformations: z.number().int(), packing: z.number().int(), conditionals: z.number().int() }),
  }).nullable(),
  semanticMap: semanticMapSchema,
  routeData: routeDataInventorySchema,
  files: z.array(workspaceFileRowSchema),
});

export const workspaceResponseSchema = apiMetadataSchema.extend({
  data: workspaceSchema,
});

export const refreshResponseSchema = apiMetadataSchema.extend({
  data: z.strictObject({ refreshed: z.literal(true) }),
});

export const fileRequestSchema = z.strictObject({
  path: z.string().trim().min(1),
});
export const reportRequestSchema = z.strictObject({ view: z.enum(REPORT_VIEWS), path: z.string().trim().min(1).nullable() });

const sourceAnnotationSchema = z.strictObject({
  kind: z.enum(["finding", "expression", "fork", "boundary", "relay", "unknown-edge", "fan-out"]),
  entityId: z.string(),
  startColumn: z.number().int().nonnegative().nullable(),
  endColumn: z.number().int().nonnegative().nullable(),
  burden: z.number().nullable(),
});
const inventoryBase = {
  id: z.string(), line: z.number().int().nonnegative().nullable(), label: z.string(),
  secondaryLabel: z.string().nullable(),
  sort: z.strictObject({ score: z.number(), line: z.number(), sources: z.number(), kindOrder: z.number() }),
  flags: z.strictObject({ hasDetails: z.boolean(), hasDefenses: z.boolean() }),
};
export const inventoryEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...inventoryBase, kind: z.literal("finding"), burden: z.number(), severity: z.enum(["high", "medium", "low"]) }),
  z.strictObject({ ...inventoryBase, kind: z.literal("fork"), siteLines: z.array(z.number().int().nonnegative()), discriminant: z.string() }),
  z.strictObject({ ...inventoryBase, kind: z.literal("boundary"), verdict: z.string(), inboundSources: z.number().int().nonnegative(), callers: z.number().int().nonnegative() }),
  z.strictObject({ ...inventoryBase, kind: z.literal("relay"), childPath: z.string(), props: z.array(z.string()), contextHooks: z.array(z.string()) }),
  z.strictObject({ ...inventoryBase, kind: z.literal("unknown-edge"), occurrences: z.number().int().nonnegative() }),
  z.strictObject({ ...inventoryBase, kind: z.literal("fan-out"), sinkCount: z.number().int().nonnegative(), fileCount: z.number().int().nonnegative() }),
]);
const sourcePointSchema = z.strictObject({ path: z.string(), line: z.number().int().nonnegative(), column: z.number().int().nonnegative().optional() });
const evidencePathStepSchema = z.strictObject({ label: z.string(), kind: z.string(), detail: z.string().nullable(), location: sourcePointSchema.nullable() });
const evidenceDefenseSchema = z.strictObject({ expression: z.string(), verdict: z.string(), origin: z.string(), type: z.string().nullable(), location: sourcePointSchema });
const evidenceRepresentationSchema = z.strictObject({ kind: z.string(), label: z.string(), location: sourcePointSchema });
export const expressionEvidenceSchema = z.strictObject({
  expressionId: z.string().min(1),
  expression: z.string(),
  location: sourcePointSchema,
  span: z.strictObject({ startLine: z.number().int(), startColumn: z.number().int(), endLine: z.number().int(), endColumn: z.number().int() }),
  focusText: z.string(),
  focusSpan: z.strictObject({ startLine: z.number().int(), startColumn: z.number().int(), endLine: z.number().int(), endColumn: z.number().int() }),
  symbolId: z.string().min(1).nullable(),
  symbolName: z.string().nullable(),
  typeId: z.string().min(1),
  typeText: z.string(),
  typeDefinition: sourcePointSchema.nullable(),
  externalOrigin: z.strictObject({ module: z.string().nullable(), package: z.string(), declarationFile: z.string().nullable() }).nullable().optional(),
  definition: sourcePointSchema.nullable(),
  usages: z.array(sourcePointSchema),
  traceComplete: z.boolean(),
  traceCompletenessReason: z.string().min(1),
  evidenceLevel: z.enum(["proven-unnecessary", "suspicious-transformation", "trace-incomplete", "fact"]),
  upstreamPath: z.array(evidencePathStepSchema),
  downstreamPath: z.array(evidencePathStepSchema),
  terminalSinks: z.array(z.strictObject({ id: z.string(), path: z.string(), line: z.number().int().nonnegative(), label: z.string() })),
  totalReach: z.number().int().nonnegative(),
  defenses: z.array(evidenceDefenseSchema),
  representationSteps: z.array(evidenceRepresentationSchema),
  unknownBoundaries: z.array(evidencePathStepSchema),
  attachedFindingIds: z.array(z.string()),
  graphNodeIds: z.array(z.string()),
  boundaryIds: z.array(z.string()),
});
const traceStepSchema = z.strictObject({ label: z.string(), kind: z.string(), detail: z.string().nullable(), location: sourcePointSchema.nullable(), snippet: z.string().nullable() });
const defenseSchema = z.strictObject({ expression: z.string(), verdict: z.string(), origin: z.string(), type: z.string().nullable(), location: sourcePointSchema });
export const findingDetailSchema = z.strictObject({
  id: z.string(), label: z.string(), expression: z.string(), category: z.string(), type: z.string(),
  location: sourcePointSchema, span: z.strictObject({ startLine: z.number().int(), startColumn: z.number().int(), endLine: z.number().int(), endColumn: z.number().int() }),
  context: z.strictObject({ component: z.string().nullable(), tag: z.string().nullable(), attribute: z.string().nullable() }),
  burden: z.number(), confidence: z.number(), confidenceReason: z.string(), queue: z.string(),
  confidenceRisk: z.string(),
  identity: expressionEvidenceSchema,
  participants: z.array(z.strictObject({
    expressionId: z.string(), expression: z.string(), focusText: z.string(), symbolName: z.string().nullable(), typeText: z.string(), role: z.enum(["accessor", "call", "property", "symbol", "value"]),
  })),
  burdenBreakdown: z.strictObject({
    backgroundPenalty: z.number(), rawSum: z.number(), total: z.number(),
    terms: z.array(z.strictObject({ key: z.string(), label: z.string(), weight: z.number(), raw: z.number(), normalized: z.number(), contribution: z.number() })),
  }).nullable(),
  roots: z.array(z.strictObject({ label: z.string(), kind: z.string(), location: sourcePointSchema.nullable() })),
  path: z.array(traceStepSchema), defenses: z.array(defenseSchema),
  representationSteps: z.array(z.strictObject({ kind: z.string(), label: z.string(), location: sourcePointSchema })),
  advice: z.strictObject({ shape: z.string(), firstCut: z.string(), headline: z.string() }),
  reach: z.array(z.strictObject({ source: z.string(), total: z.number().int(), sinks: z.array(z.strictObject({ id: z.string(), path: z.string(), line: z.number().int(), label: z.string(), depth: z.number().int() })) })),
  sameCode: z.array(z.strictObject({ id: z.string(), path: z.string(), line: z.number().int(), label: z.string() })),
  graph: z.strictObject({
    nodes: z.array(z.strictObject({ id: z.string(), label: z.string(), kind: z.enum(["source", "boundary", "sink"]), location: sourcePointSchema.omit({ column: true }).nullable(), metric: z.string().nullable() })),
    edges: z.array(z.strictObject({ id: z.string(), from: z.string(), to: z.string(), label: z.string().nullable() })),
  }),
  debugText: z.string(),
});
export const filePageSchema = z.strictObject({
  file: z.strictObject({
    path: z.string(), language: z.enum(["tsx", "ts", "jsx", "js", "other"]),
    lines: z.array(z.strictObject({ number: z.number().int().positive(), text: z.string(), annotations: z.array(sourceAnnotationSchema) })),
  }),
  inventory: z.array(inventoryEntrySchema),
  findingsById: z.record(z.string(), findingDetailSchema),
  expressionsById: z.record(z.string(), expressionEvidenceSchema),
  worldContext: z.strictObject({
    area: semanticMapAreaSchema,
    incoming: z.array(z.strictObject({ path: z.string(), label: z.string(), flowCount: z.number().int().positive(), incompleteCount: z.number().int().nonnegative(), relationship: z.enum(["traced-edge", "trajectory-contributor", "mixed"]), via: z.array(z.string()) })),
    outgoing: z.array(z.strictObject({ path: z.string(), label: z.string(), flowCount: z.number().int().positive(), incompleteCount: z.number().int().nonnegative(), relationship: z.enum(["traced-edge", "trajectory-contributor", "mixed"]), via: z.array(z.string()) })),
    trajectories: z.array(semanticMapTrajectorySchema),
    totals: z.strictObject({ repositoryAreas: z.number().int().nonnegative(), connectedAreas: z.number().int().nonnegative(), crossingTrajectories: z.number().int().nonnegative() }),
  }),
  reportAvailability: z.array(z.strictObject({ view: z.enum(REPORT_VIEWS), label: z.string() })),
  debug: z.strictObject({ scopePath: z.string(), findingCount: z.number().int().nonnegative() }),
});
export const filePageResponseSchema = apiMetadataSchema.extend({ data: filePageSchema });

const locationRefSchema = z.strictObject({ path: z.string(), line: z.number().int().nonnegative() });
const reportItemBase = { id: z.string(), label: z.string(), location: locationRefSchema.nullable() };
const graphNodeSchema = z.strictObject({ id: z.string(), label: z.string(), kind: z.enum(["source", "boundary", "sink"]), location: locationRefSchema.nullable(), metric: z.string().nullable() });
const graphEdgeSchema = z.strictObject({ id: z.string(), from: z.string(), to: z.string(), label: z.string().nullable() });
const semanticGraphSchema = z.strictObject({ nodes: z.array(graphNodeSchema), edges: z.array(graphEdgeSchema) });
export const reportDataSchema = z.discriminatedUnion("view", [
  z.strictObject({ view: z.literal("findings"), items: z.array(z.strictObject({ ...reportItemBase, burden: z.number(), depth: z.number().int(), shape: z.string(), firstCut: z.string() })) }),
  z.strictObject({ view: z.literal("work-packets"), items: z.array(z.strictObject({ ...reportItemBase, burden: z.number(), sinkCount: z.number().int(), pivots: z.array(z.string()), causes: z.array(z.string()), shape: z.string() })) }),
  z.strictObject({ view: z.literal("fan-out"), items: z.array(z.strictObject({ ...reportItemBase, sinkCount: z.number().int(), fileCount: z.number().int(), maxDepth: z.number().int(), graph: semanticGraphSchema })) }),
  z.strictObject({ view: z.literal("fan-in"), items: z.array(z.strictObject({ ...reportItemBase, rootCount: z.number().int(), predicateCount: z.number().int(), maxDepth: z.number().int(), graph: semanticGraphSchema })) }),
  z.strictObject({ view: z.literal("path-families"), items: z.array(z.strictObject({ id: z.string(), label: z.string(), findingCount: z.number().int(), maxBurden: z.number(), paths: z.array(locationRefSchema) })) }),
  z.strictObject({ view: z.literal("defensive-ledger"), items: z.array(z.strictObject({ ...reportItemBase, expression: z.string(), verdict: z.string(), origin: z.string(), affectedFindings: z.number().int() })) }),
  z.strictObject({ view: z.literal("prop-relay"), items: z.array(z.strictObject({ ...reportItemBase, roots: z.array(z.string()), wrapperSteps: z.number().int(), boundaries: z.number().int(), helperHops: z.number().int(), maxDepth: z.number().int(), graph: semanticGraphSchema })) }),
  z.strictObject({ view: z.literal("context-relay"), items: z.array(z.strictObject({ ...reportItemBase, child: z.strictObject({ label: z.string(), path: z.string() }), props: z.array(z.string()), sharedProps: z.array(z.string()), contextHooks: z.array(z.string()), signal: z.string(), score: z.number() })) }),
  z.strictObject({ view: z.literal("boundary-report"), items: z.array(z.strictObject({ ...reportItemBase, verdict: z.string(), inboundSources: z.array(z.string()), callers: z.array(locationRefSchema), graph: semanticGraphSchema })) }),
  z.strictObject({ view: z.literal("component-refs"), items: z.array(z.strictObject({ ...reportItemBase, component: z.string(), uses: z.array(locationRefSchema) })) }),
  z.strictObject({ view: z.literal("repeated-forks"), disposition: z.literal("merged"), target: z.literal("file-explorer"), message: z.string() }),
  z.strictObject({ view: z.literal("junctions"), disposition: z.literal("merged"), target: z.literal("file-explorer"), message: z.string() }),
  z.strictObject({ view: z.literal("inline-preview"), disposition: z.literal("merged"), target: z.literal("file-explorer"), message: z.string() }),
]);
export const reportResponseSchema = apiMetadataSchema.extend({ data: reportDataSchema });

export type ApiError = z.infer<typeof apiErrorSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceFileRow = z.infer<typeof workspaceFileRowSchema>;
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;
export type RouteDataInventory = z.infer<typeof routeDataInventorySchema>;
export type RouteDataDetail = z.infer<typeof routeDataDetailSchema>;
export type RouteShadowEvidence = z.infer<typeof routeShadowEvidenceSchema>;
export type RouteDataDetailResponse = z.infer<typeof routeDataDetailResponseSchema>;
export type SourceExcerptSpan = z.infer<typeof sourceExcerptSpanSchema>;
export type SourceExcerptRequest = z.infer<typeof sourceExcerptRequestSchema>;
export type SourceExcerptData = z.infer<typeof sourceExcerptResponseSchema>["data"];
export type SourceExcerptResponse = z.infer<typeof sourceExcerptResponseSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type FilePage = z.infer<typeof filePageSchema>;
export type FilePageResponse = z.infer<typeof filePageResponseSchema>;
export type InventoryEntry = z.infer<typeof inventoryEntrySchema>;
export type FindingDetail = z.infer<typeof findingDetailSchema>;
export type ReportData = z.infer<typeof reportDataSchema>;
export type ReportResponse = z.infer<typeof reportResponseSchema>;
