import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BANNED_SUGGESTION_IDENTIFIERS,
  REPORT_VIEWS,
  analyzeProject,
  classifyPathShape,
  findDefaultSource,
  findDefaultTsconfig,
  helpText,
  parseArgs,
  renderAllReports,
  renderReport,
  sinkFamilyOf,
} from "../src/core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = resolve(__dirname, "..");

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
    const ledger = renderReport(report, {
      ...project.args,
      view: "transformation-ledger",
      format: "markdown",
    });
    const dossier = JSON.parse(
      renderReport(report, {
        ...project.args,
        view: "dossier",
        format: "json",
      }),
    );

    expect(findings).toContain("type-impossible defensive render path");
    expect(packets).toContain("WORK ITEM DF-001");
    expect(packets).toContain("Feature Clusters");
    expect(packets).toContain("Candidate edits");
    expect(ledger).toContain("representation-only steps");
    expect(dossier.summary.sinks).toBeGreaterThan(0);
    expect(dossier.graph.nodes.length).toBeGreaterThan(0);
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

    // Code/path blocks are fenced; the transformation ledger renders steps as a
    // table with code-tick cells instead, so it carries no fences.
    for (const view of ["findings", "work-packets", "path-gallery"]) {
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
    for (const view of [
      "findings",
      "work-packets",
      "path-gallery",
      "transformation-ledger",
    ]) {
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

  it("gives fan-out actionable location detail with an example sink and file count", async () => {
    const project = await createFixtureProject({
      "src/fan/A.tsx": `
        export function A(props: { entity: { id: string } }) {
          return <div>{props.entity.id}</div>;
        }
      `,
      "src/fan/B.tsx": `
        export function B(props: { entity: { id: string } }) {
          return <span>{props.entity.id}</span>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "fan-out",
      format: "markdown",
    });

    expect(output).toContain("Example sink");
    expect(output).toContain("Files");
    expect(output).not.toContain("Operations");
    // The example-sink column points at a concrete file:line a reader can open.
    expect(output).toMatch(/src\/fan\/[AB]\.tsx:\d+/);
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

  it("labels transformation-ledger steps with real operation kinds", async () => {
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
    const output = renderReport(report, {
      ...project.args,
      view: "transformation-ledger",
      format: "markdown",
    });

    // The third column carries real operation kinds, not a constant "data-flow".
    const kinds = output
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("| ") &&
          !line.includes("---") &&
          !line.includes("Operation"),
      )
      .map((line) => line.split("|").at(-2).trim());
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
    const output = renderReport(report, {
      ...project.args,
      view: "fan-out",
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

  it("reports same-feature prop relay from context-aware parents", async () => {
    const project = await createFixtureProject({
      "src/feature/Feature.context.tsx": `
        export function useFeatureModel() {
          return {
            detail: () => ({ id: "one" }),
            selection: () => ({ id: "selected" }),
            onSelect: (id: string) => id,
          };
        }
      `,
      "src/feature/FeatureShell.tsx": `
        import { useFeatureModel } from "./Feature.context";
        import { FeaturePanel } from "./FeaturePanel";
        export function FeatureShell() {
          const feature = useFeatureModel();
          return <FeaturePanel
            detail={feature.detail()}
            selection={feature.selection()}
            onSelect={feature.onSelect}
          />;
        }
      `,
      "src/feature/FeaturePanel.tsx": `
        export function FeaturePanel(props: {
          detail: { id: string };
          selection: { id: string };
          onSelect: (id: string) => string;
        }) {
          return <div>{props.detail.id}{props.selection.id}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "context-relay",
      format: "markdown",
    });

    expect(output).toContain("Context Relay");
    expect(output).toContain("FeaturePanel");
    expect(output).toContain("useFeatureModel");
    expect(output).toContain("detail, selection, onSelect");
  });

  it("excludes literals and bare parameters from fan-out, refining props to property reads", async () => {
    const project = await createFixtureProject({
      "src/FanOut.tsx": `
        export function Badge(props: { meta: { label: string }; count: number }) {
          return <span>
            {props.meta.label}
            {props.count ?? 0}
            {props.meta.label || ""}
            {false ? "a" : "b"}
            {props.meta.label}
          </span>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "fan-out",
      format: "markdown",
    });

    const sourceCells = output
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("| ") &&
          !line.includes("---") &&
          !line.includes("Source"),
      )
      .map((line) => line.split("|")[1].trim());

    // Literals (0, "", false) and the bare `props` object must not rank as sources.
    expect(sourceCells).not.toContain("0");
    expect(sourceCells).not.toContain('""');
    expect(sourceCells).not.toContain("false");
    expect(sourceCells).not.toContain("props");
    // The first concrete property read off the parameter is the real source.
    expect(sourceCells).toContain("props.meta");
  });

  it("splits path families by depth band so trivial and deep paths differ", async () => {
    const project = await createFixtureProject({
      "src/Families.tsx": `
        type User = { name: string };
        function pack(user: User) { return { title: user.name }; }
        export function Card(props: { user: User; label: string }) {
          const model = pack(props.user);
          const deep = { wrap: { inner: model.title ?? "x" } };
          return <article>
            <span>{props.label}</span>
            <h2>{deep.wrap.inner}</h2>
          </article>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "path-families",
      format: "markdown",
    });

    const signatures = output
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("| ") &&
          !line.includes("---") &&
          !line.includes("Signature"),
      )
      // Signatures are wrapped in backticks (code) and padded for alignment;
      // strip both to read the bare signature.
      .map((line) => line.split("|")[1].trim().replaceAll("`", ""));

    // The shallow direct read and the deeper packed/defended path must not
    // collapse into one bare `jsx-sink` family.
    expect(signatures.some((sig) => sig.startsWith("shallow"))).toBe(true);
    expect(signatures.some((sig) => /^(medium|deep)/.test(sig))).toBe(true);
    expect(signatures).not.toContain("jsx-sink");
  });

  it("grounds centrality in real reach so a many-sink source outranks an isolated one", async () => {
    const project = await createFixtureProject({
      "src/Reach.tsx": `
        export function Panel(props: { shared: string; lonely: string }) {
          return <div>
            <span>{props.shared}</span>
            <span>{props.shared}</span>
            <span>{props.shared}</span>
            <span>{props.shared}</span>
            <p>{props.lonely}</p>
          </div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const shared = report.rankings.all.find(
      (sink) => sink.expression === "props.shared",
    );
    const lonely = report.rankings.all.find(
      (sink) => sink.expression === "props.lonely",
    );

    expect(shared.metrics.reachableSinks).toBe(4);
    expect(lonely.metrics.reachableSinks).toBe(1);
    // Equal-depth paths: the widely-reaching source must score more central.
    expect(shared.scores.centrality).toBeGreaterThan(lonely.scores.centrality);
    // ...and land in the central-leverage queue while the isolated one is a quick win.
    expect(shared.queue).toBe("central-leverage");
    expect(lonely.queue).toBe("peripheral-quick-win");
  });

  it("compares baseline reports and marks regressions when requested", async () => {
    const project = await createFixtureProject({
      "src/baseline.tsx": `
        type User = { displayName: string };
        export function UserCard(props: { user: User }) {
          const a = { user: props.user };
          const b = { title: a.user.displayName };
          const c = { model: b };
          return <h2>{c.model.title ?? "Unknown"}</h2>;
        }
      `,
    });
    const baselinePath = resolve(project.root, "baseline.json");
    await writeFile(
      baselinePath,
      JSON.stringify({ sinks: [{ scores: { burden: 0 } }] }),
    );

    const report = await analyzeProject({
      ...project.args,
      baseline: baselinePath,
    });

    expect(report.baseline.regressed).toBe(true);
    expect(report.baseline.currentWorst).toBeGreaterThan(0);
  });

  it("renders markdown compare output from a prior report directory", async () => {
    const project = await createFixtureProject({
      "src/CompareChart.tsx": `
        export function CompareChart(props: { width: number; height: number }) {
          const x = props.width / 2;
          return <svg><line x1={x} x2={props.width} y1={props.height} /></svg>;
        }
      `,
    });
    const baselineDir = resolve(project.root, "baseline-reports");
    await mkdir(baselineDir, { recursive: true });
    await writeFile(
      resolve(baselineDir, "dossier.md"),
      "| Nodes | Edges | Sources | Sinks | Path families | Unknown edges |\n| --- | --- | --- | --- | --- | --- |\n| 1 | 1 | 1 | 9 | 1 | 0 |\n\n| Pivot | Sink reach | Burden score |\n| --- | --- | --- |\n| `props.width` | 9 | 0.73 |\n",
    );
    await writeFile(
      resolve(baselineDir, "defensive-ledger.md"),
      "| Location | Expression | Type | Sinks | Verdict | Origin |\n| --- | --- | --- | --- | --- | --- |\n| src/a.tsx:1 | x ?? 0 | number | 1 | impossible | local |\n",
    );
    await writeFile(
      resolve(baselineDir, "transformation-ledger.md"),
      "| Metric | Value |\n| --- | --- |\n| representation-only steps | 4 |\n",
    );
    await writeFile(
      resolve(baselineDir, "work-packets.md"),
      "type-impossible fallback\nProvider/Context audit\n",
    );
    await writeFile(
      resolve(baselineDir, "findings.md"),
      "## RPF-001 · HIGH · type-impossible defensive render path\n",
    );

    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      compare: baselineDir,
      view: "work-packets",
      format: "markdown",
    });

    expect(output).toContain("# tsx-dataflow Compare");
    expect(output).toContain("Worst score");
    expect(output).toContain("Removed finding families");
    expect(output).toContain("Verdict:");
  });
});

describe("shape-aware suggestions, sink-family grouping, and explainability", () => {
  it("classifies render-path shapes from the trace (Phase 1)", async () => {
    const project = await createFixtureProject({
      "src/Shapes.tsx": `
        declare function createMemo<T>(fn: () => T): () => T;
        declare function Show(props: { when: unknown; children: unknown }): unknown;
        declare function For<T>(props: { each: T[]; children: unknown }): unknown;
        export function Shapes(props: {
          w: number; count: number; rows: number[]; show: boolean; active: boolean;
          meta: { label?: string };
        }) {
          const x = (props.w / props.count) * 2;
          return <svg>
            <g transform={\`translate(\${x},0)\`} />
            <For each={props.rows.map((r) => r + 1)}>{(r) => <i>{r}</i>}</For>
            <Show when={props.show}>ok</Show>
            <span class={props.active ? "on" : "off"}>x</span>
            <b>{props.meta.label ?? "n/a"}</b>
          </svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const shapeOf = (match) =>
      classifyPathShape(
        report.sinks.find((sink) => sink.expression.includes(match)),
      );

    expect(shapeOf("translate")).toContain("geometry-chain");
    expect(shapeOf(".map(")).toContain("collection-render-model");
    expect(shapeOf("props.show")).toContain("control-flow-gate");
    expect(shapeOf('"on"')).toContain("presentation-pack");
    expect(shapeOf('?? "n/a"')).toContain("domain-normalization");
  });

  it("suggests shape-matched edits and never leaks analyzer jargon as code names (Phase 2)", async () => {
    const project = await createFixtureProject({
      "src/Geo.tsx": `
        export function Geo(props: { w: number; count: number }) {
          const x = (props.w / props.count) * 2;
          return <svg><g transform={\`translate(\${x},0)\`} /></svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });

    const edits = packets.split("**Candidate edits**")[1].split("**Risk**")[0];
    expect(edits).toContain("geometry");
    // Generic Provider/Context advice must not appear for a local geometry path.
    expect(edits).not.toContain("Provider/Context");
    // No banned identifier is suggested as a code name.
    for (const banned of BANNED_SUGGESTION_IDENTIFIERS) {
      expect(edits).not.toContain(`\`${banned}\``);
    }
  });

  it("keeps Provider/Context advice for genuine cross-component relays", async () => {
    const project = await createFixtureProject({
      "src/feature/Ctx.context.tsx": `
        export function useFeature() { return { detail: () => ({ id: "1" }) }; }
      `,
      "src/feature/Shell.tsx": `
        import { useFeature } from "./Ctx.context";
        export function Shell() {
          const feature = useFeature();
          return <div>{feature.detail().id}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    expect(packets).toContain("Provider/Context");
  });

  it("assigns sink families and flags an overpacked object split (Phase 3)", async () => {
    const project = await createFixtureProject({
      "src/Chart.tsx": `
        declare function createMemo<T>(fn: () => T): () => T;
        declare function Show(props: { when: unknown; children: unknown }): unknown;
        export function Chart(props: { w: number; h: number; show: boolean; count: number }) {
          const layout = createMemo(() => ({ w: props.w, h: props.h, show: props.show, x: props.w / props.count }));
          return <svg width={layout().w} height={layout().h}>
            <Show when={layout().show}><g transform={\`translate(\${layout().x},0)\`} /></Show>
          </svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);

    const widthSink = report.sinks.find((sink) =>
      sink.label.startsWith("width="),
    );
    const transformSink = report.sinks.find((sink) =>
      sink.label.startsWith("transform="),
    );
    expect(sinkFamilyOf(widthSink)).toBe("svg-shell");
    expect(sinkFamilyOf(transformSink)).toBe("geometry");

    const overpacked = report.packGroups.find(
      (group) => group.verdict === "overpacked-bag",
    );
    expect(overpacked).toBeTruthy();
    expect(overpacked.families).toEqual(
      expect.arrayContaining(["svg-shell", "geometry", "control-flow"]),
    );

    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    expect(packets).toContain("Pack verdict");
    expect(packets).toContain("Sink-family split");
    expect(packets).toContain("feeds 3 sink families");
  });

  it("treats a single-family object as a render model, not an overpacked bag", async () => {
    const project = await createFixtureProject({
      "src/Text.tsx": `
        declare function createMemo<T>(fn: () => T): () => T;
        export function Text(props: { a: string; b: string }) {
          const view = createMemo(() => ({ title: props.a, subtitle: props.b }));
          return <div><h1>{view().title}</h1><h2>{view().subtitle}</h2></div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const overpacked = report.packGroups.find(
      (group) => group.verdict === "overpacked-bag",
    );
    expect(overpacked).toBeUndefined();
    const renderModel = report.packGroups.find(
      (group) => group.verdict === "cohesive-render-model",
    );
    expect(renderModel).toBeTruthy();
    expect(renderModel.families).toEqual(["text"]);
  });

  it("keeps parser-owned object packs as normalization boundaries", async () => {
    const project = await createFixtureProject({
      "src/ParserPack.tsx": `
        declare function createMemo<T>(fn: () => T): () => T;
        function parseToken(value: string) {
          const parts = value.match(/[a-z]+/gi) ?? [];
          return {
            color: parts[0] ?? "red",
            label: parts[1] ?? "missing",
          };
        }
        export function Chip(props: { value: string }) {
          const parsed = createMemo(() => parseToken(props.value));
          return <div title={parsed().label} style={{ color: parsed().color }}>{parsed().label}</div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const boundary = report.packGroups.find(
      (group) => group.verdict === "normalization-boundary",
    );
    expect(boundary).toBeTruthy();
    expect(boundary.families.length).toBeGreaterThan(1);

    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    expect(packets).toContain("normalization boundary");
    expect(packets).toContain("keep this as a named boundary");
    expect(packets).toContain("proposed: function parsedValue(");
    expect(packets).not.toContain("item models");
  });

  it("adds extraction shape checks for repeated SVG items and mirror singleton risks", async () => {
    const project = await createFixtureProject({
      "src/BarRects.tsx": `
        declare function For<T>(props: { each: T[]; children: unknown }): unknown;
        export function BarRects(props: { values: number[]; width: number; height: number }) {
          const barWidth = props.width / props.values.length;
          const axisModel = {
            y: props.height - 10,
            endX: props.width,
            titleX: props.width / 2,
          };
          return <svg>
            <For each={props.values}>{(value, index) => <rect x={index() * barWidth} y={props.height - value} width={barWidth} height={value} />}</For>
            <line y1={axisModel.y} y2={axisModel.y} x2={axisModel.endX} />
          </svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      maxItems: 20,
      format: "markdown",
    });

    expect(packets).toContain("Extract bar rectangles");
    expect(packets).toContain("verdict: cohesive repeated item");
    expect(packets).toContain("BarRectangle[]");
    expect(packets).toContain("verdict: mirror singleton risk");
  });

  it("treats SVG shell attributes as inline root values, not helper extraction targets", async () => {
    const project = await createFixtureProject({
      "src/Circular.tsx": `
        export function Circular(props: { size?: number; progress: number }) {
          const size = props.size ?? 32;
          const viewBox = \`0 0 \${size} \${size}\`;
          const radius = (size - 4) / 2;
          return <svg width={size} height={size} viewBox={viewBox}>
            <circle cx={size / 2} cy={size / 2} r={radius} />
          </svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const viewBoxSink = report.sinks.find(
      (sink) => sink.renderContext?.attribute === "viewBox",
    );

    expect(viewBoxSink).toBeTruthy();
    expect(sinkFamilyOf(viewBoxSink)).toBe("svg-shell");

    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      maxItems: 20,
      format: "markdown",
    });

    expect(packets).toContain("verdict: root shell scalar");
    expect(packets).toContain(
      "prefer a simple inline expression or a tiny local thunk",
    );
    expect(packets).not.toContain("proposed: function computeViewBox");
  });

  it("keeps fallback advice focused on certainty boundaries instead of helper args", async () => {
    const project = await createFixtureProject({
      "src/FallbackBoundary.tsx": `
        export function FallbackBoundary(props: { label?: string; prefix: string }) {
          const label = props.label ?? "unknown";
          const display = props.prefix + ": " + label;
          return <section aria-label={display}>{display}</section>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      maxItems: 20,
      format: "markdown",
    });

    expect(packets).toContain("boundary that truly owns the uncertainty");
    expect(packets).toContain(
      "do not contort the code so the fallback becomes a helper argument",
    );
  });

  it("downranks harmless scalar helpers into background findings", async () => {
    const project = await createFixtureProject({
      "src/ScalarChart.tsx": `
        export function ScalarChart(props: { top: number; height: number; label?: string }) {
          const axisY = () => props.top + props.height;
          const tickY = () => axisY() + 4;
          const titleX = () => props.height / 2;
          const label = props.label ?? "missing";
          return <svg><line y1={tickY()} y2={tickY()} /><text x={titleX()}>{label}</text></svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const scalar = report.rankings.all.find((sink) =>
      sink.expression.includes("tickY"),
    );
    const fallback = report.rankings.all.find(
      (sink) => sink.expression === "label",
    );

    expect(scalar.background?.label).toBe("already readable");
    expect(scalar.scores.burden).toBeLessThan(scalar.scores.rawBurden);
    expect(fallback.background).toBeFalsy();

    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      maxItems: 20,
      format: "markdown",
    });
    expect(packets).toContain("## Background Findings");
    expect(packets).toContain("already readable");
  });

  it("treats cohesive shared layout helpers as background boundaries", async () => {
    const project = await createFixtureProject({
      "src/layout.ts": `
        export type ChartLayout = { innerWidth: number; innerHeight: number; innerLeft: number; innerTop: number };
        export function computeChartLayout(width: number, height: number): ChartLayout {
          return { innerWidth: width - 20, innerHeight: height - 20, innerLeft: 10, innerTop: 10 };
        }
      `,
      "src/Chart.tsx": `
        import { computeChartLayout } from "./layout";
        export function Chart(props: { width: number; height: number }) {
          const layout = computeChartLayout(props.width, props.height);
          return <svg width={layout.innerWidth} height={layout.innerHeight} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const layoutSink = report.rankings.all.find((sink) =>
      sink.expression.includes("innerWidth"),
    );

    expect(layoutSink.background?.label).toBe("healthy shared boundary");
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      maxItems: 20,
      format: "markdown",
    });
    expect(packets).toContain("healthy shared boundary");
    expect(packets).toContain("computeChartLayout");
  });

  it("adds a stop recommendation when remaining work is low-value background", async () => {
    const project = await createFixtureProject({
      "src/StopChart.tsx": `
        export function StopChart(props: { top: number; height: number }) {
          const axisY = () => props.top + props.height;
          const tickY = () => axisY() + 4;
          const titleY = () => axisY() + 12;
          return <svg><line y1={tickY()} y2={tickY()} /><text y={titleY()}>ok</text></svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      maxItems: 20,
      format: "markdown",
    });

    expect(packets).toContain("## Stop Recommendation");
    expect(packets).toContain("Stop recommendation: yes");
  });

  it("flags broad item view packs that mix render responsibilities", async () => {
    const project = await createFixtureProject({
      "src/Legend.tsx": `
        declare function createMemo<T>(fn: () => T): () => T;
        declare function Show(props: { when: unknown; children: unknown }): unknown;
        export function LegendItem(props: { active: boolean; item: { label: string; color: string; size: number } }) {
          const view = createMemo(() => ({
            ariaLabel: \`Highlight \${props.item.label}\`,
            buttonShadow: props.active ? \`0 0 0 2px \${props.item.color}\` : "none",
            label: props.item.label,
            swatchColor: props.item.color,
            swatchSize: props.item.size,
            visible: props.active,
          }));
          return <button aria-label={view().ariaLabel} style={{ "box-shadow": view().buttonShadow }}>
            <span style={{ width: \`\${view().swatchSize}px\`, color: view().swatchColor }}>{view().label}</span>
            <Show when={view().visible}>active</Show>
          </button>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const suspicious = report.packGroups.find((group) =>
      ["overpacked-bag", "relay-bag"].includes(group.verdict),
    );
    expect(suspicious).toBeTruthy();
    expect(suspicious.families).toEqual(
      expect.arrayContaining(["style", "text", "control-flow"]),
    );
    expect(suspicious.evidence.familyCount).toBeGreaterThanOrEqual(3);

    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    expect(packets).toContain("Pack verdict");
    expect(packets).toMatch(/overpacked bag|relay bag/);
    expect(packets).toContain("avoid broadening");
  });

  it("steers control-flow gates toward scalar values instead of ready bags", async () => {
    const project = await createFixtureProject({
      "src/Ready.tsx": `
        declare function Show(props: { when: unknown; children: unknown }): unknown;
        function choose<T>(items: T[], fallback: T | undefined) {
          return items[0] ?? fallback;
        }
        export function Ready(props: { sizes: string[]; weights: string[] }) {
          const selectedSize = choose(props.sizes, props.sizes[0]);
          const selectedWeight = choose(props.weights, props.weights[0]);
          return <Show when={selectedSize}>{selectedWeight}</Show>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });

    expect(packets).toContain("Prefer a scalar predicate or selected value");
    expect(packets).toContain("avoid creating a broad ready object");
    expect(packets).toContain("proposed: function selectedSize(");
    expect(packets).not.toContain("renderModel");
    expect(packets).not.toContain("selectedValue");
  });

  it("renders human-readable confidence, reviewer summary, ownership, and boundaries", async () => {
    const project = await createFixtureProject({
      "src/Work.tsx": `
        type User = { displayName?: string };
        function pack(user: User) { return { title: user.displayName }; }
        export function Card(props: { user: User }) {
          const model = pack(props.user);
          // Normalize first, then alias — so a step follows the fallback and an
          // extraction boundary can be marked after it.
          const title = model.title ?? "Unknown";
          const shown = title;
          return <h2>{shown}</h2>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });

    expect(packets).toContain("Review summary");
    expect(packets).toContain("confidence reason:");
    expect(packets).toContain("ownership:");
    // Extraction boundaries are marked inline on the (numbered) path, not via an
    // opaque "(step N)" reference the reader cannot resolve.
    expect(packets).toContain("▸ marks recommended extraction boundaries");
    expect(packets).toContain("▸ boundary:");
    expect(packets).not.toMatch(/\(step \d+\)/);

    const findings = renderReport(report, {
      ...project.args,
      view: "findings",
      format: "markdown",
    });
    expect(findings).toContain("Reason:");
    expect(findings).toContain("Risk:");
    expect(findings).toContain("Metric contributions");
  });

  it("glosses helper, method, and memo steps with what they evaluate", async () => {
    const project = await createFixtureProject({
      "src/Gloss.tsx": `
        declare function createMemo<T>(fn: () => T): () => T;
        export function Card(props: { name: string }) {
          const shout = () => props.name.toUpperCase();
          const title = createMemo(() => shout() + "!");
          return <h2>{title()}</h2>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    const path = packets
      .split("Representative path")[1]
      .split("**Candidate edits**")[0];

    // A local helper shows what it returns; a method call shows its full shape;
    // a memo shows its body. Each carries the `— ` gloss separator.
    expect(path).toContain("— returns");
    expect(path).toContain(".toUpperCase()");
    expect(path).toMatch(/memo\s+title\(\)\s+— =/);
    // The redundant trailing " memo" is stripped from the memo label.
    expect(path).not.toContain("title() memo");
  });

  it("marks the traced sub-expression « » inside a multi-part inline expression", async () => {
    const project = await createFixtureProject({
      "src/Flow.tsx": `
        export function Card(props: { kind: string; a: string; b: string }) {
          const chosen = props.kind === "a" ? props.a : props.b;
          return <h2>{chosen}</h2>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    const path = packets
      .split("Representative path")[1]
      .split("**Candidate edits**")[0];

    // The traced sub-expression (here the ternary condition, the deepest branch)
    // is marked in place; the rest of the ternary stays visible around it rather
    // than being truncated from the front.
    expect(path).toContain('«props.kind === "a"»');
    expect(path).toContain("? props.a : props.b");
    expect(path).toContain("«marked» is the piece that flowed in");
  });

  it("traces into first-party imported helpers with enter/return markers and a 2-file legend", async () => {
    const project = await createFixtureProject({
      "src/series.ts": `
        export function barWidth(total: number, count: number): number {
          return (total - 10) / Math.max(1, count) - 2;
        }
      `,
      "src/Chart.tsx": `
        import { barWidth } from "./series";
        export function Chart(props: { width: number; count: number }) {
          const w = barWidth(props.width ?? 300, props.count);
          return <svg><rect width={w} x={w * 2} /></svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    const path = packets
      .split("Representative path")[1]
      .split("**Candidate edits**")[0];

    // The path crosses into series.ts (F2), with enter/return markers and both
    // files in the legend.
    expect(path).toMatch(/F2:\d+/);
    expect(path).toContain("↘ enter F2");
    expect(path).toContain("↙ return to F1");
    expect(path).toMatch(/F2 = .*series\.ts/);
  });

  it("does not descend when --no-trace-helpers is set", async () => {
    const project = await createFixtureProject({
      "src/series.ts": `export function barWidth(t: number): number { return t - 2; }`,
      "src/Chart.tsx": `
        import { barWidth } from "./series";
        export function Chart(props: { width: number }) {
          return <svg><rect width={barWidth(props.width)} /></svg>;
        }
      `,
    });
    const report = await analyzeProject({
      ...project.args,
      traceHelpers: false,
    });
    const packets = renderReport(report, {
      ...project.args,
      traceHelpers: false,
      view: "work-packets",
      format: "markdown",
    });
    const path = packets
      .split("Representative path")[1]
      .split("**Candidate edits**")[0];
    expect(path).not.toContain("F2");
    expect(path).not.toContain("↘ enter");
  });

  it("does not dissolve useX hook boundaries even with helper tracing on", () => {
    const args = parseArgs(["--no-trace-helpers"]);
    expect(args.traceHelpers).toBe(false);
    expect(parseArgs(["--trace-helpers"]).traceHelpers).toBe(true);
    expect(parseArgs(["--max-helper-depth", "2"]).maxHelperDepth).toBe(2);
    expect(() => parseArgs(["--max-helper-depth", "-1"])).toThrow(
      "non-negative",
    );
  });

  it("classifies functions in the boundary report (junction, pass-through)", async () => {
    const project = await createFixtureProject({
      "src/series.ts": `
        export type Bar = { name: string; color: string; value: number };
        export function groupBarSeries(rows: { k: string; v: number }[], field: string, palette: string[]): Bar[] {
          return rows.filter((r) => r.k != null).map((r, i) => ({ name: r.k + field, color: palette[i], value: r.v }));
        }
        export function identity<T>(x: T): T { return x; }
      `,
      "src/Chart.tsx": `
        import { groupBarSeries, identity } from "./series";
        const palette = ["#a", "#b"];
        export function Chart(props: { rows: { k: string; v: number }[]; field: string }) {
          const bars = groupBarSeries(props.rows, props.field ?? "x", palette);
          const legend = groupBarSeries(props.rows, "L", palette);
          return <svg>
            {bars.map((b) => <text fill={identity(b.color)}>{b.name}</text>)}
            {legend.map((b) => <rect width={b.value} />)}
          </svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);

    const group = report.helpers.find((h) => h.name === "groupBarSeries");
    const ident = report.helpers.find((h) => h.name === "identity");
    expect(group.verdict).toBe("confluence / junction");
    expect(group.callerCount).toBe(2);
    expect(ident.verdict).toContain("pass-through");

    const boundary = renderReport(report, {
      ...project.args,
      view: "boundary-report",
      format: "markdown",
    });
    expect(boundary).toContain("Boundary Report");
    expect(boundary).toContain("groupBarSeries");
    expect(boundary).toContain("confluence / junction");

    const junctions = renderReport(report, {
      ...project.args,
      view: "junctions",
      format: "markdown",
    });
    expect(junctions).toContain("tributaries");
    expect(junctions).toContain("distributaries");
    expect(junctions).toMatch(/3 in × 2 out/);

    const inline = renderReport(report, {
      ...project.args,
      view: "inline-preview",
      format: "markdown",
    });
    expect(inline).toContain("KEEP & FORMALIZE");
    expect(inline).toContain("INLINE");
  });

  it("proposes a clean helper signature for a deep render path (Approach 4)", async () => {
    const project = await createFixtureProject({
      "src/series.ts": `
        export function barWidth(total: number, count: number): number {
          return (total - 10) / Math.max(1, count) - 2;
        }
      `,
      "src/Chart.tsx": `
        import { barWidth } from "./series";
        export function Chart(props: { width: number; count: number }) {
          const w = barWidth(props.width ?? 300, props.count);
          return <svg><rect width={w} x={w * 2} /></svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    expect(packets).toContain("Extraction proposal");
    expect(packets).toMatch(/proposed: function \w+\(/);
    // Inputs are named from the source lineages crossing the cut.
    expect(packets).toMatch(/width: \/\* type \*\//);
  });

  it("backlinks each step to F#:line and lists a Files legend", async () => {
    const project = await createFixtureProject({
      "src/Loc.tsx": `
        export function Card(props: { name: string }) {
          return <h2>{props.name ?? "n/a"}</h2>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    const path = packets
      .split("Representative path")[1]
      .split("**Candidate edits**")[0];

    // Every step carries an F#:line backlink, F1 is the sink's own file, and a
    // Files legend maps the id back to a grep-able path.
    expect(path).toMatch(/F1:\d+\s+\d+\.\s+source\s+props/);
    expect(path).toContain("Files:");
    expect(path).toMatch(/F1 = .*Loc\.tsx/);
  });

  it("labels defensive fallback origin and adds an Origin column (Phase 9)", async () => {
    const project = await createFixtureProject({
      "src/Defenses.tsx": `
        export function Card(props: { sure: string; maybe?: string }) {
          return <div>
            <span>{props.sure ?? "stale"}</span>
            <span>{props.maybe ?? "compat"}</span>
          </div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "defensive-ledger",
      format: "markdown",
    });

    expect(output).toContain("Origin");
    expect(output).toContain("stale (type-impossible)");
    expect(output).toContain("compatibility (optional)");
  });

  it("does not call parser-boundary indexed extraction fallbacks type-impossible", async () => {
    const project = await createFixtureProject({
      "src/ParserBoundary.tsx": `
        function extractCssColorValues(value: string) {
          return value.match(/#[0-9a-f]+/gi) ?? [];
        }
        function parseBoxShadow(value: string) {
          const rawColor = extractCssColorValues(value)[0];
          const color = rawColor ?? "rgba(0, 0, 0, 0.25)";
          const parts = value.match(/-?\\d+(?:\\.\\d+)?(?:px|rem|em|%)?/gu) ?? [];
          const spread = parts[3] ?? "0px";
          return { color, spread };
        }
        export function ShadowChip(props: { value: string }) {
          const shadow = parseBoxShadow(props.value);
          return <div style={{ color: shadow.color }} data-spread={shadow.spread} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "defensive-ledger",
      format: "markdown",
    });

    expect(output).toContain("parser-boundary fallback");
    expect(output).not.toContain("stale (type-impossible)");
    expect(
      report.sinks.every((sink) => sink.metrics.impossibleDefenseCount === 0),
    ).toBe(true);
  });

  it("dedupes a defense across reachable sinks into one row with a Sinks count", async () => {
    const project = await createFixtureProject({
      "src/Fanout.tsx": `
        export function Button(props: { size?: string }) {
          const size = props.size ?? "default";
          return <button class={size} data-size={size}>{size}</button>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "defensive-ledger",
      format: "markdown",
    });

    expect(output).toContain("Sinks");
    // The single `?? "default"` fallback reaches multiple JSX sinks but appears once.
    const occurrences = output.split('props.size ?? "default"').length - 1;
    expect(occurrences).toBe(1);
  });

  it("diffs a baseline into removed/improved/regressed/new-top (Phase 10)", async () => {
    const project = await createFixtureProject({
      "src/Diff.tsx": `
        type User = { displayName: string };
        export function UserCard(props: { user: User }) {
          const a = { user: props.user };
          const b = { title: a.user.displayName };
          return <h2>{b.title ?? "Unknown"}</h2>;
        }
      `,
    });
    // A baseline with a sink that no longer exists (different file/signature) and
    // an inflated burden for the current top, so it reads as "improved" + "removed".
    const liveReport = await analyzeProject(project.args);
    const top = liveReport.rankings.all[0];
    const baselinePath = resolve(project.root, "baseline.json");
    await writeFile(
      baselinePath,
      JSON.stringify({
        sinks: [
          { ...top, scores: { burden: 0.99 } },
          {
            file: "src/Gone.tsx",
            signature: "deep call -> jsx-sink",
            label: "gone={...}",
            metrics: { maximumPathDepth: 9 },
            scores: { burden: 0.5 },
          },
        ],
      }),
    );

    const report = await analyzeProject({
      ...project.args,
      baseline: baselinePath,
    });
    expect(report.baseline.improved.length).toBeGreaterThan(0);
    expect(
      report.baseline.removed.some((item) => item.label === "gone={...}"),
    ).toBe(true);

    const output = renderReport(report, {
      ...project.args,
      view: "work-packets",
      format: "markdown",
    });
    expect(output).toContain("Removed:");
    expect(output).toContain("Improved:");
  });
});

describe("general CLI defaults and project discovery", () => {
  it("defaults the project root to the current working directory", () => {
    const args = parseArgs([]);
    expect(args.root).toBe(resolve(process.cwd()));
  });

  it("prefers ./src over ./app/src when discovering the source root", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-src-"));
    await mkdir(resolve(root, "src"), { recursive: true });
    await mkdir(resolve(root, "app", "src"), { recursive: true });
    expect(findDefaultSource(root)).toBe(resolve(root, "src"));
  });

  it("falls back to ./app/src, then the root, when ./src is absent", async () => {
    const appOnly = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-app-"));
    await mkdir(resolve(appOnly, "app", "src"), { recursive: true });
    expect(findDefaultSource(appOnly)).toBe(resolve(appOnly, "app", "src"));

    const bare = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-bare-"));
    expect(findDefaultSource(bare)).toBe(bare);
  });

  it("discovers the nearest tsconfig next to the source root", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-tsconfig-"));
    const source = resolve(root, "src");
    await mkdir(source, { recursive: true });
    await writeFile(resolve(root, "tsconfig.json"), "{}");
    expect(findDefaultTsconfig(root, source)).toBe(
      resolve(root, "tsconfig.json"),
    );
  });

  it("emits help text naming the CLI and listing every view", () => {
    const text = helpText();
    expect(text).toContain("tsx-dataflow");
    for (const view of [
      "work-packets",
      "prop-relay",
      "context-relay",
      "fan-out",
      "dossier",
    ]) {
      expect(text).toContain(view);
    }
  });

  it("analyzes a project end-to-end using only --root (auto-discovered source and tsconfig)", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tsx-dataflow-discover-"));
    await mkdir(resolve(root, "src"), { recursive: true });
    await writeFile(
      resolve(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "preserve",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["src"],
      }),
    );
    await writeFile(
      resolve(root, "src", "Widget.tsx"),
      `type Item = { label: string };
       export function Widget(props: { item: Item }) {
         const view = { title: props.item.label };
         return <span>{view.title ?? "n/a"}</span>;
       }`,
    );

    // Only --root is provided; --source and --tsconfig must auto-discover.
    const args = parseArgs([
      "--root",
      root,
      "--typescript-from",
      appRoot,
      "--format",
      "json",
    ]);
    expect(args.source).toBe(resolve(root, "src"));
    expect(args.tsconfig).toBe(resolve(root, "tsconfig.json"));

    const report = await analyzeProject(args);
    expect(report.sinks.length).toBeGreaterThan(0);
  });
});

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
    expect(parseArgs(["--view", "coverage"]).view).toBe("hotspots");
    expect(parseArgs(["--by", "feature"]).by).toBe("feature");

    expect(() => parseArgs(["--sort", "nope"])).toThrow(
      "--sort must be one of",
    );
    expect(() => parseArgs(["--diversity", "2"])).toThrow(
      "--diversity must be between 0 and 1",
    );
    expect(() => parseArgs(["--by", "module"])).toThrow("--by must be file");
  });

  it("hotspots is a first-class view with one row per file and a concentration footer", async () => {
    const project = await spreadProject();
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "hotspots",
      maxItems: 20,
      format: "markdown",
    });
    expect(output).toContain("# Hotspots  (by file)");
    expect(output).toContain("chart-bar.tsx");
    expect(output).toContain("badge.tsx");
    expect(output).toContain("## Concentration");
    // hotspots ships in REPORT_VIEWS, so --view all emits it.
    expect(REPORT_VIEWS).toContain("hotspots");

    const json = JSON.parse(
      renderReport(report, {
        ...project.args,
        view: "hotspots",
        maxItems: 20,
        format: "json",
      }),
    );
    expect(json.hotspots.length).toBeGreaterThan(1);
    expect(json.hotspots[0]).toHaveProperty("count");
    expect(json.concentration).toHaveProperty("fileCount");
  });

  it("by feature rolls up to feature areas", async () => {
    const project = await spreadProject();
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "hotspots",
      by: "feature",
      maxItems: 20,
      format: "markdown",
    });
    expect(output).toContain("# Hotspots  (by feature)");
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
      view: "hotspots",
      format: "markdown",
    });
    expect(spread).toContain("Focus on one file or region:");
    expect(spread).toContain("--file");

    const focused = renderReport(report, {
      ...project.args,
      view: "hotspots",
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
      view: "hotspots",
      format: "markdown",
      file: ["src/widgets/Card.tsx"],
    });
    expect(focusedText).not.toContain("Focus on one file or region:");
    // Regenerate command still round-trips the active --file filter.
    expect(focused).toContain("--file src/widgets/Card.tsx");
  });
});

async function createFixtureProject(files) {
  const root = await mkdtemp(resolve(tmpdir(), "render-path-dataflow-"));
  await mkdir(resolve(root, "src"), { recursive: true });
  await writeFile(
    resolve(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "preserve",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["src"],
    }),
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const target = resolve(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return {
    root,
    args: parseArgs([
      "--root",
      root,
      "--source",
      "src",
      "--tsconfig",
      "tsconfig.json",
      "--typescript-from",
      appRoot,
      "--format",
      "json",
      "--view",
      "work-packets",
    ]),
  };
}
