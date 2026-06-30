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
  it("validates CLI formats and report views", () => {
    expect(() => parseArgs(["--format", "xml"])).toThrow(
      "--format must be json or markdown",
    );
    expect(() => parseArgs(["--view", "unknown"])).toThrow(
      "--view must be one of",
    );

    const args = parseArgs(["--view", "findings", "--format", "json"]);
    expect(args.view).toBe("findings");
    expect(args.format).toBe("json");
  });

  it("collects JSX sink categories without ranking event handlers", async () => {
    const project = await createFixtureProject({
      "src/Sinks.tsx": `
        declare function Show(props: { when: boolean; children: unknown }): unknown;
        export function Sinks(props: { active: boolean; url: string; label: string }) {
          const klass = props.active ? "on" : "off";
          return <section class={klass} onClick={() => props.label}>
            <img src={props.url} alt={props.label} />
            <Show when={props.active}>{props.label}</Show>
          </section>;
        }
      `,
    });

    const report = await analyzeProject(project.args);
    expect(report.sinks.map((sink) => sink.category)).toEqual(
      expect.arrayContaining([
        "style",
        "attribute",
        "render-control",
        "rendered-value",
        "event-handler",
      ]),
    );
    expect(
      report.rankings.all.some((sink) => sink.category === "event-handler"),
    ).toBe(false);
  });

  it("builds shared graph nodes, traces local helpers, and marks unknown imported helpers", async () => {
    const project = await createFixtureProject({
      "src/local-flow.tsx": `
        import { externalTitle } from "./external";
        type User = { displayName: string };
        function titleFromUser(user: User) {
          return { title: user.displayName };
        }
        export function UserCard(props: { user: User }) {
          const model = titleFromUser(props.user);
          const title = model.title;
          return <h2>{title ?? "Unknown"} {externalTitle(props.user)}</h2>;
        }
      `,
      "src/external.ts":
        "export function externalTitle(value: unknown) { return String(value); }",
    });

    const report = await analyzeProject(project.args);
    const titleSink = report.rankings.all.find((sink) =>
      sink.expression.includes("title ??"),
    );

    expect(titleSink).toBeTruthy();
    expect(titleSink.metrics.helperHops).toBeGreaterThan(0);
    expect(titleSink.metrics.representationChurn).toBeGreaterThan(0);
    expect(titleSink.metrics.impossibleDefenseCount).toBeGreaterThan(0);
    expect(report.graph.nodes.length).toBeGreaterThan(report.sinks.length);
  });

  it("models createMemo accessors and resource boundaries", async () => {
    const project = await createFixtureProject({
      "src/solid-flow.tsx": `
        declare function createMemo<T>(fn: () => T): () => T;
        declare function createResource<T>(fn: () => Promise<T>): [() => T | undefined];
        export function Profile(props: { first: string; last: string }) {
          const fullName = createMemo(() => props.first + " " + props.last);
          const [user] = createResource(async () => ({ name: fullName() }));
          return <div>{fullName()} {user()?.name ?? "missing"}</div>;
        }
      `,
    });

    const report = await analyzeProject(project.args);
    const memoSink = report.rankings.all.find((sink) =>
      sink.representativePath.join(" ").includes("memo"),
    );
    const resourceSink = report.sinks.find((sink) =>
      sink.representativePath.join(" ").includes("resource"),
    );

    expect(memoSink).toBeTruthy();
    expect(resourceSink).toBeTruthy();
  });

  it("resolves same-named bindings by scope, not file-wide name", async () => {
    // Two `pos` bindings in sibling component scopes: a createMemo in Main and a
    // plain helper in Badge. The file-wide name map collapses them, so without
    // scope-aware resolution Main's `pos()` would trace into Badge's body.
    const project = await createFixtureProject({
      "src/scope-collision.tsx": `
        declare function createMemo<T>(fn: () => T): () => T;
        function Badge(props: { node: { size: number } }) {
          const pos = () => {
            const r = props.node.size / 2;
            return { x: r * 0.75, y: -r * 0.75 };
          };
          return <span data-x={pos().x} />;
        }
        export function Main(props: { source: () => { a: number } }) {
          const pos = createMemo(() => props.source());
          return <div data-a={pos()?.a ?? 0}>{Badge({ node: { size: 4 } })}</div>;
        }
      `,
    });

    const report = await analyzeProject(project.args);
    const mainSink = report.sinks.find(
      (sink) =>
        sink.label?.includes("data-a") || sink.expression === "pos()?.a",
    );

    expect(mainSink).toBeTruthy();
    const path = mainSink.representativePath.join(" ");
    // Main's memo flows from props.source(), NOT Badge's `r * 0.75` geometry.
    expect(path).toContain("source");
    expect(path).not.toContain("0.75");
  });

  it("renders output views and graph dossier JSON", async () => {
    const project = await createFixtureProject({
      "src/metrics.tsx": `
        type User = { displayName: string; avatarUrl?: string };
        function normalizeName(input: string) {
          return input.trim();
        }
        export function UserCard(props: { user: User }) {
          const packed = { rawUser: props.user };
          const model = { title: normalizeName(packed.rawUser.displayName), avatar: packed.rawUser.avatarUrl };
          return <article>
            <h2>{model.title ?? "Unknown"}</h2>
            <img src={model.avatar ?? "/fallback.png"} alt={model.title} />
          </article>;
        }
      `,
    });
    const report = await analyzeProject(project.args);

    const findings = renderReport(report, {
      ...project.args,
      view: "findings",
      format: "markdown",
    });
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    // The dossier markdown view was retired (round 8); its structural payload
    // (summary + bounded graph) stays available on request via `--format json`.
    const json = JSON.parse(
      renderReport(report, {
        ...project.args,
        view: "findings",
        format: "json",
      }),
    );

    expect(findings).toContain("type-impossible defensive render path");
    expect(packets).toContain("WORK ITEM DF-001");
    expect(packets).toContain("Feature Clusters");
    expect(packets).toContain("Candidate edits");
    expect(json.summary.sinks).toBeGreaterThan(0);
    expect(json.graph.nodes.length).toBeGreaterThan(0);
  });

  it("fences code-like blocks and one-lines multi-line expressions in prose renderers", async () => {
    const project = await createFixtureProject({
      "src/MultiLine.tsx": `
        type Props = { start: number; end: number; readings: number[] };
        function buildWindow(input: { readings: number[]; start: number; end: number }) {
          return input.readings;
        }
        export function Chart(props: Props) {
          const allReadings = props.readings;
          const windowed = buildWindow({
            readings: allReadings,
            start: props.start,
            end: props.end,
          });
          return <div>{windowed.length ?? 0}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);

    // Code/path blocks are fenced in the prose renderers.
    for (const view of ["findings", "work-packets"]) {
      const output = renderReport(report, {
        ...project.args,
        view,
        format: "markdown",
      });
      // Every such report opens at least one fenced block.
      expect(output).toContain("```");
      // A balanced number of fences (no dangling open fence).
      expect((output.match(/```/g) ?? []).length % 2).toBe(0);
    }

    // No rendered path step carries a raw newline mid-expression: the
    // object-literal arg must be collapsed onto a single line in every view.
    for (const view of ["findings", "work-packets"]) {
      const output = renderReport(report, {
        ...project.args,
        view,
        format: "markdown",
      });
      const stepLines = output
        .split("\n")
        .filter((line) => /->|readings:/.test(line));
      for (const line of stepLines) {
        expect(line).not.toMatch(/readings:\s*$/);
      }
    }
  });

  it("truncates long expressions on a token boundary with an ellipsis", async () => {
    const longName =
      "averyveryveryverylongidentifiernamethatwillexceedthelimit";
    const project = await createFixtureProject({
      "src/Long.tsx": `
        export function Long(props: { ${longName}: string; other: string }) {
          return <div>{props.${longName} + " " + props.other + " " + props.${longName} + " tail value here"}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "findings",
      format: "markdown",
    });
    const truncated = output.split("\n").filter((line) => line.includes("…"));
    expect(truncated.length).toBeGreaterThan(0);
    // A truncated line must not end mid-identifier (the char before `…` is a
    // boundary, or the whole identifier survived).
    for (const line of truncated) {
      expect(line).not.toMatch(/[A-Za-z0-9_$]…[A-Za-z0-9_$]/);
    }
  });

  it("gives fan-out actionable location detail with per-sink depth (REPORT-RECONCILE-1)", async () => {
    const project = await createFixtureProject({
      "src/fan/A.tsx": `
        export function A(props: { entity: { id: string } }) {
          return <div>{props.entity.id}{props.entity.id}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "fan-out",
      format: "markdown",
    });

    // The report now mirrors the network view: a heading per shared source with its
    // sink count + single/cross-file tag, then every reached sink grouped by file
    // with a concrete file:line and its depth (not the old summary table).
    expect(output).toContain("Consumer Fan-Out");
    expect(output).toContain("A › props.entity");
    expect(output).toContain("single-file (candidate split)");
    expect(output).not.toContain("Operations");
    // MD-1: the full path is printed once on the per-file group header; each sink
    // row carries only the bare `:line` (no repeated path) + depth.
    expect(output).toContain("**src/fan/A.tsx**");
    expect(output).toMatch(/`:\d+`/);
    expect(output).toMatch(/· depth \d+/);
  });

  it("does not treat inert object literals as sinks or fan-out sources (BUG-1)", async () => {
    const project = await createFixtureProject({
      "src/Style.tsx": `
        export function Style(props: { color: string }) {
          return <div style={{}}>
            <span style={{ color: "red", margin: 0 }}>literal</span>
            <span style={{ color: props.color }}>dynamic</span>
          </div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const json = JSON.parse(
      renderReport(report, {
        ...project.args,
        view: "findings",
        format: "json",
      }),
    );
    const rootLabels = json.sinks.flatMap((sink) => sink.roots ?? []);
    // The empty `{}` and the literal-only style object are inert — never ranked.
    expect(rootLabels).not.toContain("{}");
    expect(rootLabels.some((label) => /^\{/.test(label))).toBe(false);
    // The dynamic style (`{ color: props.color }`) is a real sink and is kept.
    expect(rootLabels.some((label) => label.includes("props.color"))).toBe(
      true,
    );

    // And no inert object collapses into a global fan-out source.
    const fanout = renderReport(report, {
      ...project.args,
      view: "fan-out",
      format: "markdown",
    });
    expect(fanout).not.toMatch(/##\s*(\{\}|\(\))\s/);
  });

  it("counts callers for an exported helper used across files (BUG-2 keyed match)", async () => {
    const project = await createFixtureProject({
      "src/format.ts": `
        export function formatLabel(name: string) {
          return name.trim();
        }
      `,
      "src/Card.tsx": `
        import { formatLabel } from "./format";
        export function Card(props: { name: string }) {
          return <div>{formatLabel(props.name)}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const json = JSON.parse(
      renderReport(report, {
        ...project.args,
        view: "inline-preview",
        format: "json",
      }),
    );
    const helper = (json.helpers ?? []).find((h) => h.name === "formatLabel");
    // Caller matching is keyed by file:line:name, so a used helper is never "0".
    expect(helper).toBeTruthy();
    expect(helper.callerCount).toBeGreaterThanOrEqual(1);
  });

  it("renders only actionable sources in findings (no literals, globals, or bare params)", async () => {
    const project = await createFixtureProject({
      "src/Source.tsx": `
        export function Card(props: { meta: { label: string } }) {
          return <span>{props.meta.label ?? "" ?? String(document.title) ?? 0}</span>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "findings",
      format: "markdown",
    });
    const sourceBlock = output.split("**Source**")[1].split("```")[1];

    expect(sourceBlock).toContain("props.meta");
    expect(sourceBlock).not.toContain("document");
    expect(sourceBlock).not.toContain('"string"');
    expect(sourceBlock.trim()).not.toMatch(/(^|,\s*)(0|""|props)(,|$)/);
  });

  it("labels representative-path steps with real operation kinds", async () => {
    const project = await createFixtureProject({
      "src/Ledger.tsx": `
        type User = { displayName?: string };
        function pack(user: User) { return { title: user.displayName }; }
        export function Card(props: { user: User }) {
          const model = pack(props.user);
          return <h2>{model.title ?? "Unknown"}</h2>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    // The representative path (shown in findings) annotates each step with its real
    // operation kind in `[brackets]`, not a constant "data-flow".
    const output = renderReport(report, {
      ...project.args,
      view: "findings",
      format: "markdown",
    });

    const kinds = output
      .split("\n")
      .map((line) => /->.*\[([a-z-]+)\]\s*$/.exec(line)?.[1])
      .filter(Boolean);
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds).not.toContain("data-flow");
    expect(
      kinds.some((kind) =>
        ["fallback", "call", "object-pack", "property-read"].includes(kind),
      ),
    ).toBe(true);
  });

  it("aligns markdown table columns prettier-style", async () => {
    const project = await createFixtureProject({
      "src/Align.tsx": `
        export function Panel(props: { entityName: { id: string }; x: { id: string } }) {
          return <div>{props.entityName.id}{props.x.id}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    // fan-out no longer renders a table (it mirrors the network view), so exercise
    // the prettier-style table aligner against a view that still uses tableReport.
    const output = renderReport(report, {
      ...project.args,
      view: "fan-in",
      format: "markdown",
    });
    const tableLines = output
      .split("\n")
      .filter((line) => line.startsWith("|"));
    // Every rendered table row has the same character width (columns padded).
    const widths = new Set(tableLines.map((line) => line.length));
    expect(widths.size).toBe(1);
    // The separator row's dashes fill the padded column width (more than 3).
    const separator = tableLines[1];
    expect(separator).toMatch(/-{4,}/);
  });
});
