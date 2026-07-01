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

describe("shape-aware suggestions, sink-family grouping, and explainability", () => {
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
    // INLINE-1: each helper lists its consumers (call sites) so the inline decision
    // is answerable — you can see where a fold would land.
    expect(inline).toContain("Consumers");
    expect(inline).toContain("Helper body (capped at 10 lines)");
    expect(inline).toContain("Call-site samples");
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

  it("labels defensive fallback origin and action (Phase 9)", async () => {
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
    expect(output).toContain("Action");
    expect(output).toContain("stale (type-impossible)");
    expect(output).toContain("solid prop default (optional prop)");
    expect(output).toContain("remove after contract check");
    expect(output).toContain("promote to mergeProps default");
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
    expect(output).toContain("keep as certainty boundary");
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
    expect(output).toContain("Action");
    expect(output).toContain("promote to mergeProps default");
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
