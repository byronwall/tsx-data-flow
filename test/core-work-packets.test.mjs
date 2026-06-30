import { describe, expect, it } from "vitest";
import {
  REPORT_VIEWS,
  analyzeProject,
  appRoot,
  bannedSuggestionIdentifiers,
  createFixtureProject,
  createTwoAppProject,
  helpText,
  mkdir,
  mkdtemp,
  parseArgs,
  renderAllReports,
  renderReport,
  resolve,
  tmpdir,
  writeFile,
} from "./helpers/core-test-context.mjs";

describe("work-packet variety & coverage", () => {
  // A heavy chart file (many geometry sinks off the same props) plus several
  // light single-sink files — the clustering shape the plan targets.
  async function spreadProject() {
    return createFixtureProject({
      "src/charts/chart-bar.tsx": `
        export function ChartBar(props: { width: number; count: number }) {
          return <svg>
            <rect x={props.width / props.count} width={props.width / props.count} transform={\`translate(\${props.width / props.count})\`} />
            <line x1={props.width / props.count} x2={props.width / props.count} />
          </svg>;
        }
      `,
      "src/widgets/badge.tsx": `
        export function Badge(props: { label?: string }) {
          return <span>{props.label ?? "none"}</span>;
        }
      `,
      "src/widgets/avatar.tsx": `
        export function Avatar(props: { name?: string }) {
          return <div title={props.name ?? "anon"}>{props.name ?? "?"}</div>;
        }
      `,
      "src/panels/header.tsx": `
        export function Header(props: { title?: string }) {
          return <h1>{props.title ?? "Untitled"}</h1>;
        }
      `,
    });
  }

  it("parses and validates the new selection flags", () => {
    expect(parseArgs(["--spread"]).sort).toBe("spread");
    expect(parseArgs(["--sort", "coverage"]).sort).toBe("coverage");
    expect(parseArgs(["--diversity", "0.6"]).diversity).toBeCloseTo(0.6);
    expect(parseArgs(["--per-file", "3"]).perFile).toBe(3);
    expect(parseArgs(["--units"]).units).toBe(true);
    expect(parseArgs(["--view", "coverage"]).view).toBe("overview");
    expect(parseArgs(["--by", "feature"]).by).toBe("feature");

    expect(() => parseArgs(["--sort", "nope"])).toThrow(
      "--sort must be one of",
    );
    expect(() => parseArgs(["--diversity", "2"])).toThrow(
      "--diversity must be between 0 and 1",
    );
    expect(() => parseArgs(["--by", "module"])).toThrow("--by must be file");
  });

  it("overview report carries the hotspots section (one row per file) and a concentration footer", async () => {
    const project = await spreadProject();
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "overview",
      maxItems: 20,
      format: "markdown",
    });
    // MD-5: hotspots + concentration are sections of the consolidated overview report.
    expect(output).toContain("## Hotspots");
    expect(output).toContain("chart-bar.tsx");
    expect(output).toContain("badge.tsx");
    // Concentration footer (the "Coverage" line summarizing how clustered burden is).
    expect(output).toContain("concentrated");
    // The consolidated report ships in REPORT_VIEWS; the old aggregators were retired.
    expect(REPORT_VIEWS).toContain("overview");
    expect(REPORT_VIEWS).not.toContain("hotspots");
    expect(REPORT_VIEWS).not.toContain("repair-map");
    expect(REPORT_VIEWS).not.toContain("unknown-edges");

    const json = JSON.parse(
      renderReport(report, {
        ...project.args,
        view: "overview",
        maxItems: 20,
        format: "json",
      }),
    );
    expect(json.hotspots.length).toBeGreaterThan(1);
    expect(json.hotspots[0]).toHaveProperty("count");
    expect(json.concentration).toHaveProperty("fileCount");
  });

  it("overview report rolls hotspots up to feature areas with --by feature", async () => {
    const project = await spreadProject();
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "overview",
      by: "feature",
      maxItems: 20,
      format: "markdown",
    });
    expect(output).toContain("## Hotspots");
    expect(output).toContain("| Feature |");
  });

  it("spread mode caps per file and keeps suppressed siblings visible", async () => {
    const project = await spreadProject();
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "work-packets",
      sort: "spread",
      perFile: 2,
      maxItems: 20,
      format: "markdown",
    });
    expect(output).toContain("Spread mode: ≤2 per file");
    // The heavy chart file has >2 sinks; the rest collapse into a "+N" note.
    expect(output).toMatch(/Suppressed \(still hot.*chart-bar\.tsx \+\d/);
    // No single file appears in more than two work-item headings.
    const chartHeadings = output
      .split("\n")
      .filter((line) => line.startsWith("## WORK ITEM")).length;
    expect(chartHeadings).toBeLessThanOrEqual(report.rankings.all.length);
  });

  it("coverage sort reaches more distinct files than pure burden", async () => {
    const project = await spreadProject();
    const report = await analyzeProject(project.args);
    const filesIn = (sort) => {
      const out = renderReport(report, {
        ...project.args,
        view: "work-packets",
        sort,
        maxItems: 4,
        format: "markdown",
      });
      return new Set(
        out
          .split("\n")
          .filter((line) => line.startsWith("Simplify "))
          .map((line) => line.split(" in ").at(-1)),
      ).size;
    };
    expect(filesIn("coverage")).toBeGreaterThanOrEqual(filesIn("burden"));
  });

  it("units mode collapses shared-cause sinks into one packet", async () => {
    const project = await spreadProject();
    const report = await analyzeProject(project.args);
    expect(report.workUnits.length).toBeGreaterThan(0);
    expect(report.workUnits.length).toBeLessThanOrEqual(
      report.rankings.all.length,
    );
    const output = renderReport(report, {
      ...project.args,
      view: "work-packets",
      units: true,
      maxItems: 20,
      format: "markdown",
    });
    expect(output).toContain("## WORK UNIT DF-001");
    // The chart file's many geometry sinks collapse to a single unit covering >1.
    expect(output).toMatch(/fix once, \d+ sinks/);
    expect(output).toContain("covers:");
  });

  it("work-packets header reports concentration without changing the default sort", async () => {
    const project = await spreadProject();
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "work-packets",
      maxItems: 20,
      format: "markdown",
    });
    expect(output).toContain("**Coverage**");
    expect(output).toMatch(/top \d+ files? = \d+%/);
    // Default (burden) sort emits no selection banner.
    expect(output).not.toContain("Spread mode");
  });

  it("diversity re-ranking annotates the header and never drops the worst sink", async () => {
    const project = await spreadProject();
    const report = await analyzeProject(project.args);
    const worst = report.rankings.all[0];
    const output = renderReport(report, {
      ...project.args,
      view: "work-packets",
      diversity: 0.7,
      maxItems: 20,
      format: "markdown",
    });
    expect(output).toContain("diversified (--diversity 0.7)");
    expect(output).toContain(worst.id);
  });
});
