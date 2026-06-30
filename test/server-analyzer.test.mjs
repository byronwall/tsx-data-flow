import { describe, expect, it } from "vitest";
import {
  FIXTURE,
  REPORT_VIEWS,
  analyzeProject,
  call,
  createAnalyzer,
  createFixtureProject,
  createServer,
  fanOutAnchor,
  fanOutEntriesForFile,
  fanOutEntriesGlobal,
  parseArgs,
  peekReferences,
  readFile,
  renderCodeMap,
  resolve,
} from "./helpers/server-test-context.mjs";

describe("createAnalyzer", () => {
  it("reprojects the same report as analyzeProject", async () => {
    const project = await createFixtureProject(FIXTURE);
    const direct = await analyzeProject(project.args);
    const analyzer = createAnalyzer(project.args);
    const reused = analyzer.report();
    expect(reused.rankings.all.map((s) => s.id)).toEqual(
      direct.rankings.all.map((s) => s.id),
    );
  });

  it("focuses on a single file via the file override", async () => {
    const project = await createFixtureProject({
      ...FIXTURE,
      "src/Other.tsx": `
        export function Other(props: { name: string }) {
          return <span>{props.name ?? "anon"}</span>;
        }
      `,
    });
    const analyzer = createAnalyzer(project.args);
    const full = analyzer.report();
    const focused = analyzer.report({ file: ["src/Card.tsx"] });
    expect(new Set(full.sinks.map((s) => s.file)).size).toBeGreaterThan(1);
    expect(new Set(focused.sinks.map((s) => s.file))).toEqual(
      new Set(["src/Card.tsx"]),
    );
  });
});
