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
  it("promotes repeated optional Solid prop defaults to mergeProps", async () => {
    const project = await createFixtureProject({
      "src/Avatar.tsx": `
        export function Avatar(props: { label?: string; variant?: "primary" | "secondary" }) {
          return <div title={props.label ?? "?"} data-variant={props.variant ?? "secondary"}>{props.label ?? "?"}</div>;
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
    const ledger = renderReport(report, {
      ...project.args,
      view: "defensive-ledger",
      maxItems: 20,
      format: "markdown",
    });
    const hotspots = renderReport(report, {
      ...project.args,
      view: "overview",
      maxItems: 20,
      format: "markdown",
    });

    expect(packets).toContain(
      "mergeProps({ size: 32, strokeWidth: 4 }, props)",
    );
    expect(ledger).toContain('props.label ?? "?"');
    expect(ledger).toContain('props.variant ?? "secondary"');
    expect(ledger).toContain("solid prop default (optional prop)");
    expect(ledger).toContain("promote to mergeProps default");
    expect(hotspots).toContain("promote prop defaults to mergeProps");
  });

  it("counts a guard reached through many sub-paths once (no double-counting)", async () => {
    // `props.size ?? 32` is reached through `size()` directly and through the
    // radius -> circumference helper chain. The deep sink should record the
    // guard ONCE, not once per sub-path that crosses it.
    const project = await createFixtureProject({
      "src/Gauge.tsx": `
        export function Gauge(props: { size?: number }) {
          const size = () => props.size ?? 32;
          const radius = () => size() / 2;
          const circumference = () => 2 * 3.14 * radius();
          return <svg width={size()} viewBox={\`0 0 \${size()} \${size()}\`} data-c={circumference()} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);

    // No sink lists the same physical guard site twice.
    for (const sink of report.sinks) {
      const keys = sink.defenses.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
    }

    // The deepest sink (data-c, via the helper chain) sees the size guard once.
    const deepSink = report.sinks.reduce((a, b) =>
      b.metrics.maximumPathDepth > a.metrics.maximumPathDepth ? b : a,
    );
    const sizeDefenses = deepSink.defenses.filter((d) =>
      d.expression.includes("props.size"),
    );
    expect(sizeDefenses.length).toBe(1);
    expect(deepSink.metrics.defensiveOperationCount).toBe(1);

    // Reach is enumerable: the size source feeds several sinks, listed by source.
    const reachable = report.sinks.find((s) => s.metrics.reachableSinks >= 3);
    expect(reachable).toBeTruthy();
    const viaSize = (reachable.reachedVia ?? []).find((g) =>
      g.source.includes("size"),
    );
    expect(viaSize).toBeTruthy();
    expect(viaSize.sinks.length).toBeGreaterThanOrEqual(2);
    expect(viaSize.sinks[0]).toHaveProperty("line");
  });

  it("counts a representation-only hop once across sub-paths", async () => {
    const project = await createFixtureProject({
      "src/Packed.tsx": `
        export function Packed(props: { a: number; b: number }) {
          const model = { x: props.a, y: props.b };
          return <g data-x={model.x} data-sum={model.x + model.y} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    for (const sink of report.sinks) {
      const keys = (sink.representationSteps ?? []).map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(sink.metrics.representationChurn).toBe(
        (sink.representationSteps ?? []).length,
      );
    }
  });

  it("does not flag constant literals fed straight to a prop", async () => {
    const project = await createFixtureProject({
      "src/Dial.tsx": `
        export function Dial(props: { class?: string }) {
          return <svg width={32} stroke-dashoffset={0} aria-hidden={true} class={props.class} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const ranked = report.rankings.all;
    // The constant attributes (32, 0, true) carry no data flow — none ranked.
    expect(ranked.some((s) => s.expression === "0")).toBe(false);
    expect(ranked.some((s) => s.expression === "32")).toBe(false);
    expect(ranked.some((s) => s.expression === "true")).toBe(false);
    // The real source-fed attribute still surfaces.
    expect(ranked.some((s) => s.expression.includes("props.class"))).toBe(true);
  });

  it("keeps API-choice fallbacks instead of promoting them to mergeProps", async () => {
    const project = await createFixtureProject({
      "src/UserAvatar.tsx": `
        export function UserAvatar(props: { tooltipContent?: string; user: { displayName: string } }) {
          return <span title={props.tooltipContent ?? props.user.displayName}>{props.user.displayName}</span>;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const ledger = renderReport(report, {
      ...project.args,
      view: "defensive-ledger",
      maxItems: 20,
      format: "markdown",
    });

    expect(ledger).toContain("api-choice fallback");
    expect(ledger).toContain("keep caller-precedence fallback");
    expect(ledger).not.toContain("promote to mergeProps default");
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

  it("labels small same-component scalar helpers as local scalar math boundaries", async () => {
    const project = await createFixtureProject({
      "src/CircularMath.tsx": `
        function progressLength(circumference: number, progress: number): number {
          return circumference * progress;
        }
        export function CircularMath(props: { circumference: number; progress: number }) {
          return <circle stroke-dasharray={\`\${progressLength(props.circumference, props.progress)} \${props.circumference}\`} />;
        }
      `,
    });
    const report = await analyzeProject(project.args);
    const output = renderReport(report, {
      ...project.args,
      view: "boundary-report",
      maxItems: 20,
      format: "markdown",
    });

    expect(output).toContain("local scalar math");
    expect(output).toContain("small same-component scalar calculation");
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
});
