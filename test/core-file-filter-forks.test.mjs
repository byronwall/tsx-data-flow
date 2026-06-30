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

describe("--file path filtering", () => {
  it("accumulates repeated --file patterns", () => {
    const args = parseArgs(["--file", "src/a.tsx", "--file", "src/b.tsx"]);
    expect(args.file).toEqual(["src/a.tsx", "src/b.tsx"]);
    expect(parseArgs([]).file).toEqual([]);
  });

  async function twoFileProject() {
    return createFixtureProject({
      "src/widgets/Card.tsx": `
        export function Card(props: { label: string }) {
          const text = props.label.trim();
          return <div title={text}>{text}</div>;
        }
      `,
      "src/panels/Panel.tsx": `
        export function Panel(props: { name: string }) {
          const shown = props.name.toUpperCase();
          return <section aria-label={shown}>{shown}</section>;
        }
      `,
    });
  }

  it("limits the report to an exact file path", async () => {
    const project = await twoFileProject();
    const report = await analyzeProject({
      ...project.args,
      file: ["src/widgets/Card.tsx"],
    });
    expect(report.sinks.length).toBeGreaterThan(0);
    expect(
      report.sinks.every((sink) => sink.file === "src/widgets/Card.tsx"),
    ).toBe(true);
    expect(report.meta.file).toEqual(["src/widgets/Card.tsx"]);
  });

  it("matches a bare filename at a path-segment boundary", async () => {
    const project = await twoFileProject();
    const report = await analyzeProject({
      ...project.args,
      file: ["Panel.tsx"],
    });
    expect(report.sinks.length).toBeGreaterThan(0);
    expect(
      report.sinks.every((sink) => sink.file === "src/panels/Panel.tsx"),
    ).toBe(true);
  });

  it("supports glob patterns and directory prefixes", async () => {
    const project = await twoFileProject();
    const glob = await analyzeProject({
      ...project.args,
      file: ["src/**/*.tsx"],
    });
    expect(new Set(glob.sinks.map((sink) => sink.file)).size).toBe(2);

    const dir = await analyzeProject({
      ...project.args,
      file: ["src/widgets"],
    });
    expect(
      dir.sinks.every((sink) => sink.file === "src/widgets/Card.tsx"),
    ).toBe(true);
  });

  it("ORs multiple patterns and yields nothing when none match", async () => {
    const project = await twoFileProject();
    const both = await analyzeProject({
      ...project.args,
      file: ["Card.tsx", "Panel.tsx"],
    });
    expect(new Set(both.sinks.map((sink) => sink.file)).size).toBe(2);

    const none = await analyzeProject({
      ...project.args,
      file: ["Missing.tsx"],
    });
    expect(none.sinks).toEqual([]);
    expect(none.rankings.all).toEqual([]);
  });

  it("hints at --file on multi-file aggregate reports and drops the hint once focused", async () => {
    const project = await twoFileProject();
    const report = await analyzeProject(project.args);

    const spread = renderReport(report, {
      ...project.args,
      view: "overview",
      format: "markdown",
    });
    expect(spread).toContain("Focus on one file or region:");
    expect(spread).toContain("--file");

    const focused = renderReport(report, {
      ...project.args,
      view: "overview",
      format: "markdown",
      file: ["src/widgets/Card.tsx"],
    });
    // The hint keys off how many files the report spans, not the args, so a
    // genuinely focused report (built with the filter) suppresses it.
    const focusedReport = await analyzeProject({
      ...project.args,
      file: ["src/widgets/Card.tsx"],
    });
    const focusedText = renderReport(focusedReport, {
      ...project.args,
      view: "overview",
      format: "markdown",
      file: ["src/widgets/Card.tsx"],
    });
    expect(focusedText).not.toContain("Focus on one file or region:");
    // Regenerate command still round-trips the active --file filter.
    expect(focused).toContain("--file src/widgets/Card.tsx");
  });

  it("detects a discriminant forked across sibling branch sites", async () => {
    const project = await createFixtureProject({
      "src/Chart.tsx": `
        declare function Switch(props: { children: unknown }): unknown;
        declare function Match(props: { when: boolean; children: unknown }): unknown;
        export function Chart(props: { type: "bar" | "line"; values: number[] }) {
          const barData = () => props.values.map((v) => v * 2);
          const lineData = () => props.values.map((v) => v + 1);
          const active = () => (props.type === "bar" ? barData() : lineData());
          return (
            <figure>
              <p>{active().length}</p>
              <Switch>
                <Match when={props.type === "bar"}><span>{barData().length}</span></Match>
                <Match when={props.type === "line"}><span>{lineData().length}</span></Match>
              </Switch>
            </figure>
          );
        }
      `,
    });

    const report = await analyzeProject(project.args);
    expect(Array.isArray(report.repeatedForks)).toBe(true);
    const fork = report.repeatedForks.find(
      (entry) => entry.component === "Chart",
    );
    expect(fork).toBeTruthy();
    expect(fork.discriminant).toBe("props.type");
    expect(fork.siteCount).toBeGreaterThanOrEqual(3);
    expect(fork.branchValues).toEqual(expect.arrayContaining(["bar", "line"]));
    expect(fork.confidence).toBe("high");
    // barData is eager but read only under the "bar" branch; lineData under line.
    const exclusiveNames = fork.branchExclusive.map((decl) => decl.name);
    expect(exclusiveNames).toEqual(
      expect.arrayContaining(["barData", "lineData"]),
    );
    // Related sinks in the same component are attached for "fix once" framing.
    expect(fork.relatedSinks.length).toBeGreaterThan(0);

    const markdown = renderReport(report, {
      ...project.args,
      view: "repeated-forks",
      format: "markdown",
    });
    expect(markdown).toContain("Repeated Fork");
    expect(markdown).toContain("props.type");
    expect(markdown).toContain("BarChart"); // pascalish split suggestion
  });

  it("does not flag a single isolated branch as a repeated fork", async () => {
    const project = await createFixtureProject({
      "src/Once.tsx": `
        export function Once(props: { ready: boolean; label: string }) {
          return <div>{props.ready ? props.label : "..."}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    expect(
      (report.repeatedForks ?? []).some((fork) => fork.component === "Once"),
    ).toBe(false);
  });

  it("ignores branches inside event handlers and effect callbacks", async () => {
    const project = await createFixtureProject({
      "src/Keys.tsx": `
        declare function createEffect(fn: () => void): void;
        export function Keys(props: { onPick: (k: string) => void }) {
          const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Enter") props.onPick("enter");
            else if (e.key === "ArrowDown") props.onPick("down");
            else if (e.key === "Escape") props.onPick("escape");
          };
          createEffect(() => {
            const mode = "x";
            if (mode === "a") props.onPick("a");
            else if (mode === "b") props.onPick("b");
          });
          return <input onKeyDown={onKeyDown} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    // e.key lives in onKeyDown; mode in a createEffect — neither is a render fork.
    expect(
      (report.repeatedForks ?? []).some((fork) => fork.component === "Keys"),
    ).toBe(false);
  });

  it("ignores repeated guard clauses and nullish/boolean discriminants", async () => {
    const project = await createFixtureProject({
      "src/Guards.tsx": `
        export function Guards(props: { box?: string; phase?: string | null; open: boolean }) {
          const a = () => { const box = props.box; if (!box) return ""; return box.toUpperCase(); };
          const b = () => { const box = props.box; if (!box) return 0; return box.length; };
          const nullish = props.phase === undefined ? "u" : props.phase === null ? "n" : props.phase;
          return <div data-open={props.open ? "y" : "n"} data-also={props.open ? "1" : "0"}>{nullish}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    // `box` guards (early returns), nullish sentinels, and the boolean `open`
    // toggle are all control flow, not discriminated splits.
    expect(
      (report.repeatedForks ?? []).some((fork) => fork.component === "Guards"),
    ).toBe(false);
  });

  it("ranks a real prop union above weaker candidates and orders globally", async () => {
    const project = await createFixtureProject({
      "src/Kinds.tsx": `
        export function Shape(props: { kind: "circle" | "square" | "line" }) {
          const a = props.kind === "circle" ? "c" : props.kind === "square" ? "s" : "l";
          const b = props.kind === "circle" ? 1 : props.kind === "square" ? 2 : 3;
          return <div data-a={a} data-b={b}>{props.kind === "line" ? "L" : "?"}</div>;
        }
      `,
      "src/Single.tsx": `
        export function Single(props: { level?: "group" }) {
          const s = () => props.level === "group" ? "g" : "s";
          return <div data-s={s()} data-t={props.level === "group" ? "1" : "0"} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const forks = report.repeatedForks ?? [];
    const shape = forks.find((fork) => fork.component === "Shape");
    const single = forks.find((fork) => fork.component === "Single");
    expect(shape).toBeTruthy();
    expect(shape.confidence).toBe("high");
    expect(shape.namedValues).toEqual(
      expect.arrayContaining(["circle", "square", "line"]),
    );
    expect(single).toBeTruthy();
    expect(single.confidence).toBe("medium");
    // Global ordering is severity-descending: the 3-value union outranks the
    // single-value binary split, regardless of file discovery order.
    expect(forks.indexOf(shape)).toBeLessThan(forks.indexOf(single));
  });
});

// A monorepo with two apps, each with its OWN tsconfig that maps the same `~/*`
// alias to its own `src`. No root tsconfig, so discovery finds both app configs
// and one becomes primary — under whose `paths` the other app's alias imports
// cannot resolve in a single program. Exercises per-config program routing.
