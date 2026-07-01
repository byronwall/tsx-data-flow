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

function expectSpaShell(response) {
  expect(response.status).toBe(200);
  expect(response.body).toContain('<div id="root"></div>');
  expect(response.body).toMatch(/src="\/assets\/index-[^"]+\.js"/);
}

async function fetchSpaBundle(handler, route = "/report?view=fan-out") {
  const shell = await call(handler, route);
  expectSpaShell(shell);
  const asset = shell.body.match(/src="([^"]+index-[^"]+\.js)"/)?.[1];
  expect(asset).toBeTruthy();
  const bundle = await call(handler, asset);
  expect(bundle.status).toBe(200);
  return bundle.body;
}

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

  it("serves the SPA shell on the Fan-out tab and fan-out data via APIs", async () => {
    const project = await createFixtureProject(FANOUT_FIXTURE);
    const { handler } = createServer(project.args);
    const view = await call(handler, "/report?view=fan-out");
    expectSpaShell(view);

    const data = JSON.parse((await call(handler, "/api/report.json")).body);
    const fanOuts = fanOutEntriesGlobal(data.sinks);
    expect(fanOuts.length).toBeGreaterThan(0);
  });

  it("selects a specific source and sort via URL params (refresh-safe)", async () => {
    const project = await createFixtureProject(FANOUT_FIXTURE);
    const { handler } = createServer(project.args);
    const anchor = fanOutAnchor("Comp › props.mode");
    const picked = await call(
      handler,
      "/report?view=fan-out&fanout=" + anchor + "&fosort=depth",
    );
    expectSpaShell(picked);

    const data = JSON.parse((await call(handler, "/api/report.json")).body);
    const fanOuts = fanOutEntriesGlobal(data.sinks);
    expect(fanOuts.some((entry) => fanOutAnchor(entry.root) === anchor)).toBe(
      true,
    );
  });

  it("serves the fan-out markdown for the Solid report view", async () => {
    const project = await createFixtureProject(FANOUT_FIXTURE);
    const { handler } = createServer(project.args);
    const report = await call(handler, "/report?view=fan-out");
    expectSpaShell(report);

    const markdown = await call(handler, "/api/report.fan-out.md");
    expect(markdown.status).toBe(200);
    expect(markdown.body).toContain("Fan-Out");
  });

  it("bundles the report network viewers with an inline markdown mirror", async () => {
    const project = await createFixtureProject(FANOUT_FIXTURE);
    const { handler } = createServer(project.args);
    const bundle = await fetchSpaBundle(handler);

    expect(bundle).toContain("md-mirror");
    expect(bundle).toContain("Markdown report");
    expect(bundle).toContain("boundary-report");
    expect(bundle).toContain("A <strong>boundary</strong>");
  });

  it("tags single-file fan-outs as candidate splits vs cross-file usage", async () => {
    const project = await createFixtureProject(FANOUT_FIXTURE);
    const { handler } = createServer(project.args);
    const view = await call(handler, "/api/report.fan-out.md");
    // props.isOpen / props.mode are component-scoped → single-file (FANOUT-COPY-1).
    expect(view.body).toContain("single-file (candidate split)");
  });
});
