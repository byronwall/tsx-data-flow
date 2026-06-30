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
    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      maxItems: 20,
      format: "markdown",
    });

    expect(packets).toContain("compute cohesive render-item geometry");
    expect(packets).toContain("extract rendered items");
    expect(packets).toContain("name the scalar predicate");
    expect(packets).toContain("split style/class values");
    expect(packets).toContain("Resolve defaults, optional reads");
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
    for (const banned of bannedSuggestionIdentifiers) {
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
    expect(widthSink).toBeTruthy();
    expect(transformSink).toBeTruthy();

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

  it("recommends local scalar geometry instead of helper extraction for fixed circles", async () => {
    const project = await createFixtureProject({
      "src/CircularProgress.tsx": `
        export function CircularProgress(props: { size?: number; strokeWidth?: number; progress: number }) {
          const size = props.size ?? 32;
          const strokeWidth = props.strokeWidth ?? 4;
          const radius = (size - strokeWidth) / 2;
          const circumference = 2 * Math.PI * radius;
          const progressLength = circumference * props.progress;
          return <svg width={size} height={size} viewBox={\`0 0 \${size} \${size}\`}>
            <circle cx={size / 2} cy={size / 2} r={radius} stroke-dasharray={\`\${circumference} \${circumference}\`} />
            <circle cx={size / 2} cy={size / 2} r={radius} stroke-dasharray={\`\${progressLength} \${circumference}\`} />
          </svg>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const centerSink = report.sinks.find(
      (sink) =>
        sink.renderContext?.attribute === "cx" &&
        sink.expression.includes("size / 2"),
    );

    expect(centerSink).toBeTruthy();

    const packets = renderReport(report, {
      ...project.args,
      view: "work-packets",
      maxItems: 20,
      format: "markdown",
    });

    expect(packets).toContain(
      "verdict: repeated scalar; prefer local variable",
    );
    expect(packets).toContain("center, radius, circumference");
    expect(packets).toContain(
      "do not introduce a helper type/function just to avoid repeated arithmetic",
    );
    expect(packets).toContain("name repeated local scalars");
    expect(packets).not.toContain("proposed: function computeCircularCircle");
    expect(packets).not.toContain("Extract circular circles");
    expect(packets).not.toContain("extract render item data");

    const hotspots = renderReport(report, {
      ...project.args,
      view: "overview",
      maxItems: 20,
      format: "markdown",
    });
    expect(hotspots).toContain("name repeated local scalars");
    expect(hotspots).not.toContain("extract render item data");
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

    expect(packets).toContain(
      "Use Solid mergeProps once near the component boundary",
    );
    expect(packets).toContain("for label");
    expect(packets).toContain("props.foo ?? default");
    expect(packets).toContain(
      "Do not move valid prop defaults into helper arguments merely to shorten the analyzer path",
    );
  });
});
