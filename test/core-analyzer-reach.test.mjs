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
    // MD-6: the report shows *why* it's a relay (the evidence), not just a summary row.
    expect(output).toContain("Why these are relays");
    expect(output).toContain("forwards");
    expect(output).toContain("to see the hand-off");
  });

  it("indexes component usages by symbol for a where-used view (XREF-1)", async () => {
    const project = await createFixtureProject({
      "src/Button.tsx": `
        export function Button(props: { label: string }) {
          return <button>{props.label}</button>;
        }
      `,
      "src/Page.tsx": `
        import { Button } from "./Button";
        export function Page() {
          return <div><Button label="a" /><Button label="b" /></div>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const button = (report.componentRefs ?? []).find(
      (r) => r.name === "Button",
    );
    expect(button).toBeTruthy();
    expect(button.file).toBe("src/Button.tsx");
    // Both <Button/> sites resolve to the one definition (by symbol, not name).
    expect(button.useCount).toBe(2);
    expect(button.uses.every((u) => u.file === "src/Page.tsx")).toBe(true);

    const markdown = renderReport(report, {
      ...project.args,
      view: "component-refs",
      format: "markdown",
    });
    expect(markdown).toContain("# References");
    expect(markdown).toContain("Button");
    expect(markdown).toContain("src/Page.tsx:");
  });

  it("does not merge a common prop name across unrelated components (FANOUT-1)", async () => {
    const project = await createFixtureProject({
      "src/TwoComps.tsx": `
        export function Alpha(props: { isOpen: boolean }) {
          return <span>{props.isOpen ? "a" : "b"}{props.isOpen && "c"}</span>;
        }
        export function Beta(props: { isOpen: boolean }) {
          return <span>{props.isOpen ? "x" : "y"}{props.isOpen && "z"}</span>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "fan-out",
      format: "markdown",
    });
    // Each shared source is a `## <root> — …` heading in the network-style report.
    const sources = output
      .split("\n")
      .filter((l) => l.startsWith("## "))
      .map((l) => l.slice(3).split(" — ")[0].trim());
    // Both components read `props.isOpen`, but they are different props — each is
    // its own scoped fan-out entry, never one merged "props.isOpen" entry.
    expect(sources).toContain("Alpha › props.isOpen");
    expect(sources).toContain("Beta › props.isOpen");
    expect(sources).not.toContain("props.isOpen");
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
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3).split(" — ")[0].trim());

    // Literals (0, "", false) and the bare `props` object must not rank as sources.
    expect(sourceCells).not.toContain("0");
    expect(sourceCells).not.toContain('""');
    expect(sourceCells).not.toContain("false");
    expect(sourceCells).not.toContain("props");
    // FANOUT-1: the first concrete property read off the parameter is the real
    // source, and it is scoped to its owning component (`Component › props.x`) so
    // a common prop name is not merged across unrelated components.
    expect(sourceCells.some((cell) => cell.endsWith("props.meta"))).toBe(true);
    expect(sourceCells).toContain("Badge › props.meta");
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

    // MD-7: beyond the aggregate table, the report shows a representative example
    // (the deepest member's path) per family so the recurring shape is concrete.
    expect(output).toContain("## Representative examples");
    expect(output).toContain("Deepest member:");
    expect(output).toMatch(/->.*\[[a-z-]+\]/);
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
    expect(output).toContain("Worst burden score");
    expect(output).toContain("How to read the deltas");
    expect(output).toContain("Treat a spike as a reviewability warning");
    expect(output).toContain("Removed finding families");
    expect(output).toContain("Verdict:");
  });
});
