import { describe, expect, it } from "vitest";
import { reportResponseSchema } from "../src/api/contracts";
import { createServer } from "../src/server";
import { createServerFixtureProject as createFixtureProject } from "./helpers/fixture-project";
import { call } from "./helpers/http";

const FIXTURE = { "src/Two.tsx": `export function Comp(props: { isOpen: boolean; mode: string }) { return <div>{props.isOpen ? "a" : "b"}{props.isOpen && "c"}{props.mode === "x" ? "y" : "z"}{props.mode}</div>; }` };

describe("native fan-out report", () => {
  it("serves semantic graph data and keeps Markdown available", async () => {
    const project = await createFixtureProject(FIXTURE); const { handler } = createServer(project.args);
    const response = reportResponseSchema.parse(JSON.parse((await call(handler, "/api/reports/fan-out")).body));
    expect(response.data.view).toBe("fan-out");
    if (response.data.view !== "fan-out") throw new Error("unexpected report");
    expect(response.data.items.length).toBeGreaterThan(0);
    expect(response.data.items[0].graph.nodes.some((node) => node.kind === "sink")).toBe(true);
    expect((await call(handler, "/api/report.fan-out.md")).body).toContain("Fan-Out");
  });
});
