import { describe, expect, it } from "vitest";
import { apiErrorSchema, expressionEvidenceSchema, fileRequestSchema, semanticMapSchema, workspaceResponseSchema } from "../../src/api/contracts";

describe("API contracts", () => {
  it("rejects unknown workspace response fields", () => {
    const result = workspaceResponseSchema.safeParse({
      apiVersion: 1, analysisVersion: 1, generation: 1,
      generatedAt: "2026-07-10T00:00:00.000Z", extra: true,
      data: { workspace: {}, summary: {}, concentration: {}, files: [] },
    });
    expect(result.success).toBe(false);
  });

  it("requires a non-empty file path", () => {
    expect(fileRequestSchema.safeParse({ path: "" }).success).toBe(false);
    expect(fileRequestSchema.parse({ path: "src/App.tsx" }).path).toBe("src/App.tsx");
  });

  it("keeps errors structured", () => {
    expect(apiErrorSchema.parse({ error: { code: "invalid_path", message: "Bad path" } }))
      .toEqual({ error: { code: "invalid_path", message: "Bad path" } });
  });

  it("rejects malformed semantic-map caps and analyzer-only fields", () => {
    const valid = { areas: [], edges: [], trajectories: [], cleanup: [], components: { nodes: [], edges: [], totals: { nodes: 0, edges: 0 } }, totals: { areas: 0, edges: 0, trajectories: 0, cleanupOpportunities: 0 }, caps: { areas: 80, edges: 160, trajectories: 40, cleanup: 40 } };
    expect(semanticMapSchema.parse(valid)).toEqual(valid);
    expect(semanticMapSchema.safeParse({ ...valid, caps: { ...valid.caps, areas: 0 } }).success).toBe(false);
    expect(semanticMapSchema.safeParse({ ...valid, analyzerGraph: {} }).success).toBe(false);
  });

  it("rejects malformed or embellished expression evidence", () => {
    const valid = {
      expressionId: "expression:src/App.tsx:12:17", expression: "title", location: { path: "src/App.tsx", line: 3, column: 9 }, span: { startLine: 3, startColumn: 9, endLine: 3, endColumn: 14 }, focusText: "title", focusSpan: { startLine: 3, startColumn: 9, endLine: 3, endColumn: 14 }, symbolId: "symbol:1", symbolName: "title", typeId: "type:1", typeText: "string",
      typeDefinition: null, definition: { path: "src/model.ts", line: 1, column: 14 }, usages: [{ path: "src/App.tsx", line: 3, column: 9 }],
      traceComplete: true, traceCompletenessReason: "Resolved.", evidenceLevel: "fact" as const,
      upstreamPath: [], downstreamPath: [], terminalSinks: [], totalReach: 0,
      defenses: [], representationSteps: [], unknownBoundaries: [], attachedFindingIds: [], graphNodeIds: [], boundaryIds: [],
    };
    expect(expressionEvidenceSchema.parse(valid)).toEqual(valid);
    expect(expressionEvidenceSchema.safeParse({ ...valid, evidenceLevel: "certain" }).success).toBe(false);
    expect(expressionEvidenceSchema.safeParse({ ...valid, analyzerNode: {} }).success).toBe(false);
    expect(expressionEvidenceSchema.safeParse({ ...valid, traceCompletenessReason: "" }).success).toBe(false);
  });
});
