import { z } from "zod";
import { REPORT_VIEWS } from "./report-views";

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
  kind: z.enum(["finding", "fork", "boundary", "relay", "unknown-edge", "fan-out"]),
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
const traceStepSchema = z.strictObject({ label: z.string(), kind: z.string(), detail: z.string().nullable(), location: sourcePointSchema.nullable(), snippet: z.string().nullable() });
const defenseSchema = z.strictObject({ expression: z.string(), verdict: z.string(), origin: z.string(), type: z.string().nullable(), location: sourcePointSchema });
export const findingDetailSchema = z.strictObject({
  id: z.string(), label: z.string(), expression: z.string(), category: z.string(), type: z.string(),
  location: sourcePointSchema, span: z.strictObject({ startLine: z.number().int(), startColumn: z.number().int(), endLine: z.number().int(), endColumn: z.number().int() }),
  context: z.strictObject({ component: z.string().nullable(), tag: z.string().nullable(), attribute: z.string().nullable() }),
  burden: z.number(), confidence: z.number(), confidenceReason: z.string(), queue: z.string(),
  confidenceRisk: z.string(),
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
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type FilePage = z.infer<typeof filePageSchema>;
export type FilePageResponse = z.infer<typeof filePageResponseSchema>;
export type InventoryEntry = z.infer<typeof inventoryEntrySchema>;
export type FindingDetail = z.infer<typeof findingDetailSchema>;
export type ReportData = z.infer<typeof reportDataSchema>;
export type ReportResponse = z.infer<typeof reportResponseSchema>;
