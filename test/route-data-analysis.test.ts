import { describe, expect, it } from "vitest";
import { analyzeProject } from "../src/core";
import { routePatternFromFile, stableHash } from "../src/analysis/route-discovery";
import { buildRouteDataDetail, buildRouteDataInventory } from "../src/api/projections/route-data";
import { createAnalyzerFixtureProject as createFixtureProject } from "./helpers/fixture-project";

describe("route data trajectory analysis", () => {
  it("derives SolidStart route patterns and parameters deterministically", () => {
    expect(routePatternFromFile("src/routes/index.tsx")).toEqual({ pathPattern: "/", parameters: [] });
    expect(routePatternFromFile("src/routes/captures/[captureId].tsx")).toEqual({ pathPattern: "/captures/[captureId]", parameters: [{ name: "captureId", kind: "dynamic" }] });
    expect(routePatternFromFile("src/routes/path/[...segments].tsx")).toEqual({ pathPattern: "/path/[...segments]", parameters: [{ name: "segments", kind: "catch-all" }] });
    expect(stableHash("same source fact")).toBe(stableHash("same source fact"));
  });

  it("assembles a supported Prisma-to-resource-to-render path with shapes and field effects", async () => {
    const project = await createFixtureProject({
      "src/routes/time-blocks.tsx": `
        import { Calendar } from "../Calendar";
        declare const Suspense: (props: { fallback: unknown; children: unknown }) => unknown;
        export default function TimeBlocksPage() { return <Suspense fallback={<p>Loading</p>}><Calendar /></Suspense>; }
      `,
      "src/queries.ts": `
        declare function query<T>(fn: () => T, key: string): () => T;
        declare const prisma: { timeBlock: { findMany(): Promise<Row[]> } };
        type Row = { id: string; startTime: Date; endTime: Date };
        export type Item = { id: string; startTime: string; endTime: string };
        function mapTimeBlock(row: Row): Item { return { id: row.id, startTime: row.startTime.toISOString(), endTime: row.endTime.toISOString() }; }
        export const fetchBlocks = query(async () => (await prisma.timeBlock.findMany()).map(mapTimeBlock), "blocks");
      `,
      "src/Calendar.tsx": `
        import { fetchBlocks, type Item } from "./queries";
        declare function createResource<T>(fetcher: () => Promise<T>): [() => T | undefined];
        declare function createMemo<T>(fn: () => T): () => T;
        export function Calendar() {
          const [blocks] = createResource(fetchBlocks);
          const optimistic = { a: { startTime: "new", endTime: "later" } };
          const merged = createMemo(() => (blocks() ?? []).map((block: Item) => ({ ...block, startTime: optimistic.a.startTime, endTime: optimistic.a.endTime })));
          return <div style={{ top: merged().length + "px" }}>{merged().length}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const route = report.routeData.routes.find((item) => item.pathPattern === "/time-blocks");
    const trajectory = report.routeData.trajectories.find((item) => item.routeKey === route?.key);
    const operations = trajectory?.operationKeys.map((key) => report.routeData.operations.find((item) => item.key === key)! ) ?? [];
    expect(route?.confidence).toBe("high");
    expect(trajectory?.completeness).toBe("partial");
    expect(trajectory?.handoffsProven).toBe(false);
    expect(operations.every((operation) => operation.inputValueIds.length === 0 && operation.inputShapeIds.length === 0)).toBe(true);
    expect(operations.map((item) => item.semanticKind)).toEqual(expect.arrayContaining(["read", "map", "boundary", "augment", "render"]));
    expect(operations.find((item) => item.semanticKind === "read")?.label.toLowerCase()).toContain("time block");
    expect(operations.find((item) => item.semanticKind === "augment")?.fieldEffects.map((item) => item.field)).toEqual(expect.arrayContaining(["startTime", "endTime"]));
    expect(report.routeData.shapes.some((shape) => shape.totalFields > shape.fields.length || shape.totalFields > 0)).toBe(true);
    expect(route?.componentHierarchy.map((component) => component.label)).toEqual(["TimeBlocksPage", "Suspense", "Calendar"]);
    expect(route?.componentHierarchy[1]?.parentId).toBe(route?.componentHierarchy[0]?.id);
    expect(route?.componentHierarchy[2]?.parentId).toBe(route?.componentHierarchy[1]?.id);
    expect(trajectory?.routeReachableTerminalCount).toBeGreaterThanOrEqual(trajectory?.terminalIds.length ?? 0);
    expect(operations.some((operation) => operation.boundary?.kind === "component")).toBe(false);
    expect(operations.find((operation) => operation.boundary?.kind === "resource")?.boundary?.label).toBe("fetchBlocks");
    expect(operations.some((operation) => operation.label.includes("Suspense"))).toBe(false);
  });

  it("keeps arbitrary findMany calls out of Prisma source classification and reports partial paths", async () => {
    const project = await createFixtureProject({
      "src/routes/search.tsx": `
        const collection = { findMany: () => ["a"] };
        export default function Search() { const values = collection.findMany(); return <p style={{ opacity: values.length }}>{values[0]}</p>; }
      `,
    });
    const report = await analyzeProject(project.args);
    const route = report.routeData.routes.find((item) => item.pathPattern === "/search")!;
    const trajectory = report.routeData.trajectories.find((item) => item.routeKey === route.key);
    expect(report.routeData.operations.some((item) => item.label.includes("Prisma"))).toBe(false);
    expect(trajectory?.completeness).not.toBe("complete-for-supported-scope");
    expect(trajectory?.omissions).toContain("No supported persistence source joined to this route.");
  });

  it("keeps dev-support reads out of product routes and preserves route-local source ownership", async () => {
    const project = await createFixtureProject({
      "src/routes/boards/[boardId].tsx": `
        import { getBoardDetail } from "../../queries";
        declare function createResource<T>(source: () => string, fetcher: (id: string) => Promise<T>): [() => T | undefined];
        export default function BoardRoute() {
          const [detail] = createResource(() => "board-1", getBoardDetail);
          return <div style={{ opacity: detail() ? 1 : 0 }}>{detail()?.title}</div>;
        }
      `,
      "src/routes/boards/index.tsx": `
        import { getBoardDetail } from "../../queries";
        export default function BoardsRoute() { void getBoardDetail("default"); return <div style={{ opacity: 1 }}>Boards</div>; }
      `,
      "src/queries.ts": `
        import { readLiveSmokeResult } from "./extension/live-smoke";
        import { readBoardDetail } from "./store/boards";
        void readLiveSmokeResult;
        export const getBoardDetail = (id: string) => readBoardDetail(id);
      `,
      "src/extension/live-smoke.ts": `
        import { readFile } from "node:fs/promises";
        export const readLiveSmokeResult = () => readFile("tmp/evals/smoke.json", "utf8");
      `,
      "src/store/boards.ts": `
        import { readJsonFile } from "./json";
        export type Board = { title: string };
        export const readBoardDetail = (id: string): Promise<Board> => readJsonFile(id + ".json");
      `,
      "src/store/json.ts": `
        import { readFile } from "node:fs/promises";
        export const readJsonFile = async (file: string) => JSON.parse(await readFile(file, "utf8"));
      `,
    });
    const report = await analyzeProject(project.args);
    const route = report.routeData.routes.find((item) => item.pathPattern === "/boards/[boardId]")!;
    const trajectory = report.routeData.trajectories.find((item) => item.routeKey === route.key)!;
    const detail = buildRouteDataDetail(report, route.key, trajectory.key)!;
    const inventory = buildRouteDataInventory(report);

    expect(report.routeData.evidence.some((item) => item.file.includes("live-smoke"))).toBe(false);
    expect(new Set(report.routeData.operations.map((item) => item.key)).size).toBe(report.routeData.operations.length);
    const source = detail.context.nodes.find((item) => item.kind === "source")!;
    expect(source).toMatchObject({ file: "src/store/boards.ts" });
    expect(source.label).not.toBe("Persisted value");
    expect(detail.operations[0].sourceExpressionIds.every((id) => detail.evidence.some((item) => item.id === id))).toBe(true);
    expect(detail.context.nodes.find((item) => item.kind === "component")).toMatchObject({ label: "BoardRoute", role: "route", parentId: null });
    const sourceSummary = inventory.sources.find((item) => item.file === "src/store/boards.ts");
    expect(sourceSummary?.routeKeys).toEqual(expect.arrayContaining(inventory.routes.filter((item) => item.pathPattern.startsWith("/boards")).map((item) => item.key)));
    expect(inventory.routes.find((item) => item.key === route.key)).toMatchObject({ routeKind: "page", unknownGapCount: 0 });
  });

  it("does not pull sibling barrel-exported components into a route through shared UI primitives", async () => {
    const project = await createFixtureProject({
      "src/routes/domain.tsx": `
        import { DomainFeature } from "../components";
        export default function DomainRoute() { return <DomainFeature />; }
      `,
      "src/components/index.ts": `
        export { DomainFeature } from "./DomainFeature";
        export { TableDemo } from "./TableDemo";
      `,
      "src/components/DomainFeature.tsx": `
        import { Button } from "../ui/Button";
        export function DomainFeature() { return <Button>Domain</Button>; }
      `,
      "src/components/TableDemo.tsx": `
        import { Button } from "../ui/Button";
        export function TableDemo() { return <table><tbody><tr><td><Button>Unrelated</Button></td></tr></tbody></table>; }
      `,
      "src/ui/Button.tsx": `
        export function Button(props: { children: unknown }) { return <button style={{ opacity: 1 }}>{props.children}</button>; }
      `,
    });
    const report = await analyzeProject(project.args);
    const route = report.routeData.routes.find((item) => item.pathPattern === "/domain")!;
    expect(route.sinkIds.some((id) => id.includes("TableDemo"))).toBe(false);
    expect(route.renderedComponents?.map((component) => component.label)).toEqual(expect.arrayContaining(["DomainRoute", "DomainFeature", "Button"]));
    expect(route.renderedComponents?.map((component) => component.label)).not.toContain("TableDemo");
    expect(route.renderedComponentEdges).toHaveLength(2);
    const selectedSinks = report.sinks.filter((sink) => route.sinkIds.includes(`${sink.file}:${sink.id}`));
    expect(new Set(selectedSinks.map((sink) => sink.renderContext.component))).toEqual(new Set(["Button"]));
  });

  it("retains a recursive render as a dedicated leaf occurrence instead of a component cycle", async () => {
    const project = await createFixtureProject({
      "src/routes/tree.tsx": `
        import { Branch } from "../Branch";
        export default function TreeRoute() { return <Branch depth={2} />; }
      `,
      "src/Branch.tsx": `
        export function Branch(props: { depth: number }) {
          return <section style={{ opacity: props.depth ? 1 : 0 }}>
            {props.depth > 0 ? <Branch depth={props.depth - 1} /> : "leaf"}
          </section>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const route = report.routeData.routes.find((item) => item.pathPattern === "/tree")!;
    const branchRecords = route.renderedComponents?.filter((component) => component.label === "Branch") ?? [];
    const recursiveOccurrence = branchRecords.find((component) => component.id.startsWith("rendered-component-occurrence:"));

    expect(branchRecords).toHaveLength(2);
    expect(recursiveOccurrence).toMatchObject({ file: "src/Branch.tsx", role: "component" });
    expect(route.renderedComponentEdges).toContainEqual(expect.objectContaining({
      from: expect.stringMatching(/^rendered-component:/),
      to: recursiveOccurrence?.id,
    }));
    expect(route.renderedComponentEdges?.some((edge) => edge.from === edge.to)).toBe(false);
  });
});
