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

describe("fan-out viewer + report tab strip (round 7)", () => {
  const FANOUT_FIXTURE = {
    "src/Two.tsx": `
      export function Comp(props: { isOpen: boolean; mode: string }) {
        return <div>
          {props.isOpen ? "a" : "b"}
          {props.isOpen && "c"}
          {props.mode === "x" ? "y" : "z"}
          {props.mode}
        </div>;
      }
    `,
  };

  it("renders the selectable fan-out viewer (not a stack of graphs) on the Fan-out tab", async () => {
    const project = await createFixtureProject(FANOUT_FIXTURE);
    const { handler } = createServer(project.args);
    // SHELL-4: the viewer lives on the Fan-out report tab, not inline on the overview.
    const view = await call(handler, "/report?view=fan-out");
    // ARCH-1: the page-level report tab strip is present.
    expect(view.body).toContain('class="report-tabs"');
    // FANOUT-LIST-1: the selector + explanatory copy + a sort control.
    expect(view.body).toContain("fo-explain");
    expect(view.body).toContain('class="fo-tab');
    expect(view.body).toContain('class="fo-sort-btn');
    // Exactly ONE graph renders at a time, even with multiple detected sources.
    expect((view.body.match(/class="fanout-graph"/g) ?? []).length).toBe(1);
  });

  it("selects a specific source and sort via URL params (refresh-safe)", async () => {
    const project = await createFixtureProject(FANOUT_FIXTURE);
    const { handler } = createServer(project.args);
    const anchor = fanOutAnchor("Comp › props.mode");
    const picked = await call(
      handler,
      "/report?view=fan-out&fanout=" + anchor + "&fosort=depth",
    );
    // The chosen source's graph is the one rendered.
    expect(picked.body).toContain(`id="${anchor}"`);
    expect(picked.body).toContain("Comp › props.mode");
    // The active sort is reflected (FANOUT-SORT-1).
    expect(picked.body).toContain('class="fo-sort-btn active"');
  });

  it("fan-out report shows the network view with the raw markdown beneath it", async () => {
    const project = await createFixtureProject(FANOUT_FIXTURE);
    const { handler } = createServer(project.args);
    const report = await call(handler, "/report?view=fan-out");
    expect(report.body).toContain('class="report-tab active"');
    expect(report.body).toContain('class="fo-tabs"');
    // REPORT-RECONCILE-1: the agent-facing markdown is rendered below the view.
    expect(report.body).toContain('class="body md-mirror"');
    expect(report.body).toContain("Markdown report");
  });

  it("tags single-file fan-outs as candidate splits vs cross-file usage", async () => {
    const project = await createFixtureProject(FANOUT_FIXTURE);
    const { handler } = createServer(project.args);
    const view = await call(handler, "/report?view=fan-out");
    // props.isOpen / props.mode are component-scoped → single-file (FANOUT-COPY-1).
    expect(view.body).toContain("single-file · candidate split");
  });
});
