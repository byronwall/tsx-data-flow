import { z } from "zod";

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

export type ApiError = z.infer<typeof apiErrorSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceFileRow = z.infer<typeof workspaceFileRowSchema>;
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
