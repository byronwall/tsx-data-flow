import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { workspaceResponseSchema } from "../../src/api/contracts";
import { createAnalyzer } from "../../src/core";
import { createServer } from "../../src/server";
import { createServerFixtureProject } from "../helpers/fixture-project";
import { call } from "../helpers/http";
import { FIXTURE } from "../helpers/server-test-context";

describe("workspace comparison transport", () => {
  it("projects baseline states without exposing analyzer sinks", async () => {
    const project = await createServerFixtureProject(FIXTURE);
    const current = createAnalyzer(project.args).report();
    const baselinePath = path.join(project.root, "baseline.json");
    await writeFile(baselinePath, JSON.stringify({ sinks: current.rankings.all.map((sink) => ({ ...sink, scores: { ...sink.scores, burden: (sink.scores?.burden ?? 0) + 0.2 } })) }));
    const { handler } = createServer({ ...project.args, baseline: baselinePath });
    const workspace = workspaceResponseSchema.parse(JSON.parse((await call(handler, "/api/workspace")).body));
    expect(workspace.data.comparison).not.toBeNull();
    expect(workspace.data.comparison?.improved).toBeGreaterThan(0);
    expect("sinks" in workspace.data.files[0]).toBe(false);
  });
});
