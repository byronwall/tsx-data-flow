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

describe("fanOutEntriesForFile (ARCH-2)", () => {
  it("keeps roots that fan out (>=2 sinks) and touch the target file", () => {
    const mk = (id, file, root) => ({
      id,
      file,
      line: 1,
      metrics: { maximumPathDepth: 3 },
      rootInfos: [{ label: root, kind: "property-read" }],
    });
    const all = [
      mk("a", "src/App.tsx", "props.user"),
      mk("b", "src/Other.tsx", "props.user"),
      mk("c", "src/App.tsx", "props.lonely"),
    ];
    const rows = fanOutEntriesForFile(all, "src/App.tsx");
    const user = rows.find((r) => r.root === "props.user");
    expect(user).toBeTruthy();
    expect(user.sinkCount).toBe(2);
    expect(user.fileCount).toBe(2);
    // A root feeding only one sink is not fan-out.
    expect(rows.find((r) => r.root === "props.lonely")).toBeFalsy();
  });
});

describe("fanOutEntriesGlobal (HOME-1)", () => {
  const mk = (id, file, root) => ({
    id,
    file,
    line: 1,
    metrics: { maximumPathDepth: 3 },
    rootInfos: [{ label: root, kind: "property-read" }],
  });

  it("returns every fan-out source (>=2 sinks) with no per-file filter", () => {
    const all = [
      mk("a", "src/App.tsx", "props.user"),
      mk("b", "src/Other.tsx", "props.user"),
      mk("c", "src/Far.tsx", "props.theme"),
      mk("d", "src/Edge.tsx", "props.theme"),
      mk("e", "src/Solo.tsx", "props.lonely"),
    ];
    const rows = fanOutEntriesGlobal(all);
    // both multi-sink sources are present even though no relPath was given
    expect(rows.map((r) => r.root).sort()).toEqual([
      "props.theme",
      "props.user",
    ]);
    const user = rows.find((r) => r.root === "props.user");
    expect(user.sinkCount).toBe(2);
    expect(user.fileCount).toBe(2);
    // the full cross-file sink set is retained for the graph (uncapped)
    expect(user.graphSinks.length).toBe(2);
    // single-sink sources are not fan-out
    expect(rows.find((r) => r.root === "props.lonely")).toBeFalsy();
  });
});
