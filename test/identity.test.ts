import { describe, expect, it } from "vitest";
import { analyzeProject } from "../src/core";
import { createAnalyzerFixtureProject as createFixtureProject } from "./helpers/fixture-project";

describe("generation-local expression identity", () => {
  it("separates same-name symbols and resolves aliased imports", async () => {
    const project = await createFixtureProject({
      "src/model.ts": `export const title = "shared";`,
      "src/Page.tsx": `
        import { title as importedTitle } from "./model";
        export function First() { const title = "local"; return <p>{title ?? "fallback"}</p>; }
        export function Second() { return <p>{importedTitle}</p>; }
      `,
    });
    const report = await analyzeProject(project.args);
    const local = report.sinks.find((sink) => sink.expression.includes("title ??"))!;
    const imported = report.sinks.find((sink) => sink.expression === "importedTitle")!;

    expect(local.identity?.symbolId).toBeTruthy();
    expect(imported.identity?.symbolId).toBeTruthy();
    expect(local.identity?.symbolId).not.toBe(imported.identity?.symbolId);
    expect(local.identity?.definition?.file).toBe("src/Page.tsx");
    expect(imported.identity?.definition?.file).toBe("src/model.ts");
    expect(imported.identity?.symbolName).toBe("title");
    expect(imported.identity?.traceComplete).toBe(true);
    expect(imported.identity?.evidenceLevel).toBe("fact");
    expect(local.identity?.upstreamPath.length).toBeGreaterThan(0);
    expect(local.identity?.terminalSinks).toEqual([expect.objectContaining({ id: local.terminalIdentityId, file: "src/Page.tsx" })]);
    expect(local.identity?.totalReach).toBeGreaterThanOrEqual(1);
    expect(local.identity?.evidenceLevel).toBe("proven-unnecessary");
    expect(local.identity?.graphNodeIds).toEqual([local.nodeId]);
    expect(local.identity?.typeId).toMatch(/^type:/);
    expect(local.identity?.typeText).toContain("local");
    expect(report.graph.nodes.find((node) => node.id === local.nodeId)?.identityId).toBe(local.identity?.expressionId);
    const tracedTitle = local.traceIdentities?.find((evidence) => evidence.expression === "title");
    expect(tracedTitle).toMatchObject({ symbolName: "title", definition: { file: "src/Page.tsx" }, traceComplete: true });
    expect(tracedTitle?.span.startColumn).toBeGreaterThan(0);
    expect(tracedTitle?.attachedFindingIds).toContain(local.id);
    expect(local.traceIdentities?.some((evidence) => evidence.expression === '"fallback"')).toBe(true);
  });

  it("resolves a directly imported function to its exported declaration", async () => {
    const project = await createFixtureProject({
      "src/create-view-model.ts": `
        export function createViewModel(value: string) { return { value }; }
      `,
      "src/Page.tsx": `
        import { createViewModel } from "./create-view-model";
        export function Page(props: { value: string }) {
          const model = createViewModel(props.value);
          return <p>{model.value}</p>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const sink = report.sinks.find((candidate) => candidate.expression === "model.value")!;
    const importedCall = sink.traceIdentities?.find((evidence) =>
      evidence.expression === "createViewModel(props.value)" && evidence.symbolName === "createViewModel",
    );

    expect(importedCall).toMatchObject({
      definition: { file: "src/create-view-model.ts", line: 2 },
      traceComplete: true,
    });
    expect(importedCall?.usages).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: "src/Page.tsx", line: 2 }),
      expect.objectContaining({ file: "src/Page.tsx", line: 4 }),
    ]));
    expect(importedCall?.definition?.file).not.toBe(importedCall?.location.file);
  });

  it("resolves an imported named value type to its declaration", async () => {
    const project = await createFixtureProject({
      "src/captures.ts": `export interface CaptureAnnotationInventoryResponse { items: string[] }`,
      "src/Page.tsx": `
        import type { CaptureAnnotationInventoryResponse } from "./captures";
        export function Page(props: { inventory: CaptureAnnotationInventoryResponse }) {
          return <p>{props.inventory}</p>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const sink = report.sinks.find((candidate) => candidate.expression === "props.inventory")!;

    expect(sink.identity).toMatchObject({
      typeText: "CaptureAnnotationInventoryResponse",
      typeDefinition: { file: "src/captures.ts", line: 1 },
      definition: { file: "src/Page.tsx", line: 3 },
    });
  });

  it("marks expressions without a resolvable subject as trace incomplete", async () => {
    const project = await createFixtureProject({
      "src/Page.tsx": `export function Page(props: { items: string[] }) { return <p>{"literal"}{props.items.length}</p>; }`,
    });
    const report = await analyzeProject(project.args);
    const sink = report.sinks.find((candidate) => candidate.expression === '"literal"')!;
    expect(sink.identity).toMatchObject({ symbolId: null, traceComplete: false, evidenceLevel: "trace-incomplete" });
    const external = report.sinks.find((candidate) => candidate.expression === "props.items.length")!;
    expect(external.identity).toMatchObject({ symbolName: "length", traceComplete: false, evidenceLevel: "trace-incomplete" });
    expect(external.identity?.definition).toBeNull();
  });

  it("does not index ambient platform symbols as project identities", async () => {
    const project = await createFixtureProject({
      "src/Page.tsx": `export function Page(props: { value: number }) { return <p>{Math.round(props.value)}</p>; }`,
    });
    const report = await analyzeProject(project.args);
    const sink = report.sinks.find((candidate) => candidate.expression === "Math.round(props.value)")!;
    const platformEvidence = [sink.identity, ...(sink.traceIdentities ?? [])].filter((evidence) => evidence?.symbolName === "Math" || evidence?.symbolName === "round");
    expect(platformEvidence.length).toBeGreaterThan(0);
    expect(platformEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbolId: null, definition: null, usages: [] }),
    ]));
    expect(platformEvidence.every((evidence) => evidence?.symbolId === null && evidence.usages.length === 0)).toBe(true);
    expect(sink.traceIdentities?.some((evidence) => evidence.symbolName === "value" && evidence.symbolId)).toBe(true);
  });
});
