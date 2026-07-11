import { describe, expect, it } from "vitest";
import { apiErrorSchema, fileRequestSchema, workspaceResponseSchema } from "../../src/api/contracts";

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
});
