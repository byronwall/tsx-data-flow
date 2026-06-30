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

describe("render path data-flow analyzer", () => {
  it("appends a copy-pasteable regenerate command to every markdown view", async () => {
    const project = await createFixtureProject({
      "src/Foot.tsx": `
        export function Card(props: { name: string }) {
          return <h2>{props.name}</h2>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    for (const view of REPORT_VIEWS) {
      const output = renderReport(report, {
        ...project.args,
        view,
        maxItems: 5,
        format: "markdown",
      });
      expect(output).toContain("_Regenerate this report:_");
      expect(output).toContain("```sh");
      expect(output).toContain(`--view ${view}`);
      expect(output).toContain("--max-items 5");
    }
    // The footer is markdown-only; JSON payloads stay clean.
    const json = renderReport(report, {
      ...project.args,
      view: "findings",
      format: "json",
    });
    expect(json).not.toContain("Regenerate this report");
  });

  it("regenerate command includes --out so re-running overwrites the same file", async () => {
    const project = await createFixtureProject({
      "src/Out.tsx": `
        export function Card(props: { name: string }) {
          return <h2>{props.name}</h2>;
        }
      `,
    });
    const report = await analyzeProject(project.args);

    // Single view written to a file → the regen command targets that file.
    const single = renderReport(report, {
      ...project.args,
      view: "work-packets",
      out: resolve(project.root, "reports/work-packets.md"),
      format: "markdown",
    });
    expect(single).toMatch(
      /--view work-packets\b.*--out \S*reports\/work-packets\.md/,
    );

    // --view all written to a directory → each file regenerates the whole set
    // into that directory (so it overwrites itself), not just one view.
    const all = renderAllReports(report, {
      ...project.args,
      view: "all",
      out: resolve(project.root, "reports"),
      format: "markdown",
    });
    const wp = all.find((entry) => entry.view === "work-packets");
    expect(wp.text).toMatch(/--view all\b.*--out \S*reports\b/);
    expect(wp.text).not.toContain("--view work-packets --out");

    // No --out (stdout) → no --out flag, so the command reproduces stdout.
    const stdoutRun = renderReport(report, {
      ...project.args,
      view: "fan-out",
      format: "markdown",
    });
    expect(stdoutRun).not.toContain("--out");
  });

  it("renders every view in one pass with --view all", async () => {
    const project = await createFixtureProject({
      "src/All.tsx": `
        export function Card(props: { name: string }) {
          return <h2>{props.name}</h2>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const reports = renderAllReports(report, {
      ...project.args,
      view: "all",
      maxItems: 5,
      format: "markdown",
    });

    expect(reports.map((entry) => entry.view)).toEqual(REPORT_VIEWS);
    expect(reports.every((entry) => entry.filename.endsWith(".md"))).toBe(true);
    expect(
      reports.every((entry) =>
        entry.text.includes("_Regenerate this report:_"),
      ),
    ).toBe(true);
    // JSON format yields .json filenames and parseable payloads.
    const jsonReports = renderAllReports(report, {
      ...project.args,
      view: "all",
      format: "json",
    });
    expect(jsonReports.every((entry) => entry.filename.endsWith(".json"))).toBe(
      true,
    );
    expect(() => JSON.parse(jsonReports[0].text)).not.toThrow();
  });

  it("accepts --view all", () => {
    expect(parseArgs(["--view", "all"]).view).toBe("all");
  });

  it("reports unresolved imported calls and unknown identifiers as unknown-edge rows", async () => {
    const project = await createFixtureProject({
      "src/Unknowns.tsx": `
        import { externalTitle } from "./missing";
        export function Unknowns(props: { user: { name: string } }) {
          return <section>
            <h2>{externalTitle(props.user)}</h2>
            <p>{mysteryValue}</p>
          </section>;
        }
      `,
    });
    const report = await analyzeProject(project.args);

    expect(report.unknownEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "src/Unknowns.tsx",
          kind: "call",
          label: "externalTitle",
          affectedSinks: expect.arrayContaining([
            expect.objectContaining({ file: "src/Unknowns.tsx" }),
          ]),
        }),
        expect.objectContaining({
          file: "src/Unknowns.tsx",
          kind: "unknown-source",
          label: "mysteryValue",
          affectedSinks: expect.arrayContaining([
            expect.objectContaining({ file: "src/Unknowns.tsx" }),
          ]),
        }),
      ]),
    );

    // MD-5: unknown edges are folded into the consolidated `overview` report (JSON
    // payload + a diagnostic markdown section), not a standalone view.
    const json = JSON.parse(
      renderReport(report, {
        ...project.args,
        view: "overview",
        format: "json",
      }),
    );
    expect(json.unknownEdges.map((row) => row.label)).toEqual(
      expect.arrayContaining(["externalTitle", "mysteryValue"]),
    );

    const markdown = renderReport(report, {
      ...project.args,
      view: "overview",
      format: "markdown",
    });
    expect(markdown).toContain("## Unknown edges (diagnostic)");
    expect(markdown).toContain("externalTitle");
    expect(markdown).toContain("mysteryValue");
    expect(markdown).toContain("Affected sinks");
  });

  it("dedupes one physical unknown edge crossed by several sinks into a single row", async () => {
    const project = await createFixtureProject({
      "src/FanOut.tsx": `
        import { decorate } from "./missing";
        export function FanOut(props: { user: { name: string } }) {
          const label = decorate(props.user.name);
          return <section data-a={label} title={label}>
            <h2>{label}</h2>
            <p>{label}</p>
          </section>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const decorateRows = report.unknownEdges.filter(
      (row) => row.label === "decorate" && row.kind === "call",
    );
    // One row, not one-per-sink — and the path multiplicity is preserved.
    expect(decorateRows).toHaveLength(1);
    expect(decorateRows[0].occurrences).toBeGreaterThan(1);
  });

  it("treats undefined/NaN/Infinity as literals, not unknown sources", async () => {
    const project = await createFixtureProject({
      "src/Keywords.tsx": `
        export function Keywords(props: { value?: string }) {
          return <section>
            <h2>{props.value ?? undefined}</h2>
            <p>{NaN}</p>
          </section>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const labels = report.unknownEdges
      .filter((row) => row.kind === "unknown-source")
      .map((row) => row.label);
    expect(labels).not.toContain("undefined");
    expect(labels).not.toContain("NaN");
  });

  it("treats imported values as known sources, not unknown edges", async () => {
    const project = await createFixtureProject({
      "src/MissingConst.tsx": `
        import { SCOPE } from "./tokens";
        export function Scoped(props: { id: string }) {
          return <div data-scope={SCOPE} data-id={props.id} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const scopeUnknown = report.unknownEdges.find(
      (row) => row.label === "SCOPE",
    );
    expect(scopeUnknown).toBeUndefined();
  });

  it("descends into first-party method calls instead of leaving them unknown", async () => {
    const project = await createFixtureProject({
      "src/manager.ts": `
        export class EntityManager {
          getName(id: string) {
            return id.toUpperCase();
          }
        }
        export const manager = new EntityManager();
      `,
      "src/MethodCall.tsx": `
        import { manager } from "./manager";
        export function MethodCall(props: { id: string }) {
          return <h2>{manager.getName(props.id)}</h2>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const methodUnknown = report.unknownEdges.find(
      (row) => row.label === "getName",
    );
    expect(methodUnknown).toBeUndefined();
  });

  it("does not report host/global/Solid calls as unresolved unknown edges", async () => {
    const project = await createFixtureProject({
      "src/Hosts.tsx": `
        declare function splitProps<T>(props: T, keys: string[]): [T, T];
        export function Hosts(props: { items: string[]; name: string }) {
          const [local] = splitProps(props, ["name"]);
          const upper = props.name.toUpperCase();
          const joined = props.items.map((x) => x).filter(Boolean).join(",");
          const indexes = Array.from({ length: props.items.length });
          return <ul data-a={upper} data-b={joined} data-c={String(indexes.length)}>
            {local.name}
          </ul>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const labels = report.unknownEdges.map((row) => row.label);
    for (const known of [
      "splitProps",
      "toUpperCase",
      "map",
      "filter",
      "join",
      "from",
      "String",
      "Array",
    ]) {
      expect(labels).not.toContain(known);
    }
  });

  it("classifies reactive accessor reads as known, not unknown calls", async () => {
    const project = await createFixtureProject({
      "src/Accessor.tsx": `
        export function Accessor(props: {
          value: () => string;
          data: { current: () => number };
        }) {
          return <section>
            <h2>{props.value()}</h2>
            <p>{String(props.data.current())}</p>
          </section>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const labels = report.unknownEdges.map((row) => row.label);
    expect(labels).not.toContain("value");
    expect(labels).not.toContain("current");
  });

  it("classifies DOM/library method calls as known, not unknown", async () => {
    const project = await createFixtureProject({
      "src/Dom.tsx": `
        export function Dom() {
          const el = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
          ) as SVGPathElement;
          return <p>{String(el.getTotalLength())}</p>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    expect(report.unknownEdges.map((row) => row.label)).not.toContain(
      "getTotalLength",
    );
  });

  it("classifies factory-produced callables as known, not unknown", async () => {
    const project = await createFixtureProject({
      "src/Factory.tsx": `
        import { fmt } from "./factory";
        export function Factory(props: { n: number }) {
          return <p>{fmt(props.n)}</p>;
        }
      `,
      "src/factory.ts": `
        function make() {
          return (x: number) => String(x);
        }
        export const fmt = make();
      `,
    });
    const report = await analyzeProject(project.args);
    expect(report.unknownEdges.map((row) => row.label)).not.toContain("fmt");
  });

  it("binds destructured <For> callback params to the iterated source", async () => {
    const project = await createFixtureProject({
      "src/Entries.tsx": `
        declare function For<T>(props: {
          each: T[];
          children: (item: T) => unknown;
        }): unknown;
        export function Entries(props: { map: Record<string, string> }) {
          return <ul>
            <For each={Object.entries(props.map)}>
              {([key, value]) => <li data-k={key}>{value}</li>}
            </For>
          </ul>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const labels = report.unknownEdges
      .filter((row) => row.kind === "unknown-source")
      .map((row) => row.label);
    expect(labels).not.toContain("key");
    expect(labels).not.toContain("value");
  });

  it("binds custom render-prop child params to the component's iterable prop", async () => {
    const project = await createFixtureProject({
      "src/RowList.tsx": `
        function RowList<T>(props: { items: T[]; children: (item: T) => unknown }) {
          return <div>{props.items.map(props.children)}</div>;
        }
        export function Uses(props: { rows: string[] }) {
          return <RowList items={props.rows}>
            {(item) => <span>{item}</span>}
          </RowList>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const labels = report.unknownEdges
      .filter((row) => row.kind === "unknown-source")
      .map((row) => row.label);
    expect(labels).not.toContain("item");
  });

  it("binds array higher-order callback params to the receiver array", async () => {
    const project = await createFixtureProject({
      "src/Mapped.tsx": `
        export function Mapped(props: { rows: { name: string }[] }) {
          return <ul>{props.rows.map((row) => <li>{row.name}</li>)}</ul>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const labels = report.unknownEdges
      .filter((row) => row.kind === "unknown-source")
      .map((row) => row.label);
    expect(labels).not.toContain("row");
  });

  it("treats enum and DOM-global references as known sources, not unknown", async () => {
    const project = await createFixtureProject({
      "src/EnumGlobal.tsx": `
        enum Color { Red, Blue }
        export function EnumGlobal(props: { on: boolean; node: unknown }) {
          return <section>
            <p>{props.on ? Color.Red : Color.Blue}</p>
            <b>{props.node instanceof SVGElement ? "svg" : "no"}</b>
          </section>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const labels = report.unknownEdges
      .filter((row) => row.kind === "unknown-source")
      .map((row) => row.label);
    expect(labels).not.toContain("Color");
    expect(labels).not.toContain("SVGElement");
  });

  it("resolves path-alias imports per owning tsconfig across multiple apps", async () => {
    const project = await createTwoAppProject();
    const report = await analyzeProject(project.args);
    const callLabels = report.unknownEdges
      .filter((row) => row.kind === "call")
      .map((row) => row.label);
    // Each app imports a first-party helper via its own `~/*` alias, which only
    // resolves under that app's tsconfig paths. With per-config program routing
    // both descend instead of dead-ending as unknown calls.
    expect(callLabels).not.toContain("badge");
    expect(callLabels).not.toContain("tag");
  });
});
