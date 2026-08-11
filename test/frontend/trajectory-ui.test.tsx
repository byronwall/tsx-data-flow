// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteDataDetail, RouteDataInventory } from "../../src/api/contracts";
import { DataTrajectoryDialog } from "../../src/frontend/src/overview/DataTrajectoryDialog";
import { ComponentTopologyGraph } from "../../src/frontend/src/overview/ComponentTopologyGraph";
import { RouteFlowGraph } from "../../src/frontend/src/overview/RouteFlowGraph";
import { RouteTrajectoryWorkspace } from "../../src/frontend/src/overview/RouteTrajectoryWorkspace";
import type { TrajectoryUrlState } from "../../src/frontend/src/overview/trajectory-url-state";

const evidence = ["read", "map", "render"].map((kind, index) => ({ id: `e${index}`, expression: `${kind}Expression()`, operationKind: kind, file: `src/${kind}.tsx`, line: index + 2, column: 1, span: { startLine: index + 2, startColumn: 1, endLine: index + 2, endColumn: 12 }, inputType: "Item", outputType: "Item", compilerIdentity: `symbol:${kind}`, confidence: "high" as const, unknownReason: null }));
const source: RouteDataInventory["sources"][number] = { key: "source:a", label: "readA", kind: "file", file: "src/read.ts", line: 2, routeKeys: ["route:a"], consumerLabel: null, handoffProven: false, typeName: "Item", typeText: "Item", shapeKind: "object", fields: [{ key: "name", typeText: "string", optional: false }], totalFields: 1, evidenceId: "e0", handoffFields: [] };
const detail: RouteDataDetail = {
  route: { key: "route:a", pathPattern: "/a", file: "src/routes/a.tsx", componentIdentityId: null, parameters: [], confidence: "high", componentNames: ["RouteA"], routeKind: "page", sourceMethodKeys: ["source:a"], apiRouteKeys: [], trajectoryCount: 1, completeTrajectoryCount: 1, totalPathSteps: 3, uniqueStepCount: 3, substitutionStepCount: 0, unknownGapCount: 1, omissions: [] },
  trajectory: { key: "flow:a", routeKey: "route:a", label: "A flow", sourceValueIds: ["v0"], operationKeys: ["op0", "op1", "op2"], terminalIds: ["t0"], supportingComponentIds: [], routeReachableTerminalCount: 7, terminalSelectionLimit: 4, ordering: "semantic-stage", handoffsProven: false, completeness: "partial", omissions: ["Cross-operation handoffs are not yet proven."] },
  operations: ["read", "map", "render"].map((kind, index) => ({ key: `op${index}`, semanticKind: kind as "read" | "map" | "render", effect: (kind === "read" ? "preserve" : kind === "map" ? "project" : "render") as "preserve" | "project" | "render", label: `${kind} operation`, inputValueIds: index ? [`v${index - 1}`] : [], outputValueIds: [`v${index}`], inputShapeIds: index ? [`s${index - 1}`] : [], outputShapeIds: [`s${index}`], fieldEffects: [{ kind: kind === "read" ? "preserve" : kind === "map" ? "project" : "render", field: null, detail: `${kind} fields` }], sourceExpressionIds: [`e${index}`], boundary: null, boundaryId: null, consumerHandoff: null, owner: null, confidence: "high", completeness: "complete", completenessReason: "Retained evidence." })),
  values: [0, 1, 2].map((index) => ({ id: `v${index}`, label: `value ${index}`, shapeId: `s${index}`, sourceOperationKey: `op${index}` })),
  shapes: [0, 1, 2].map((index) => ({ id: `s${index}`, typeName: index === 1 ? null : "Item", typeText: index === 1 ? 'import("/Users/example/src/store/capture-detail").CaptureDetail | null | undefined' : "Item", kind: index === 1 ? "union" as const : "object" as const, fields: [{ key: "name", typeText: "string", optional: false }], totalFields: index === 1 ? 12 : 1, opacityReason: null })),
  evidence,
  terminals: [{ id: "t0", label: "title", file: "src/render.tsx", line: 4, component: "RouteA", operationKey: "op2" }],
  sources: [source],
  context: { nodes: [{ id: "v0", kind: "source", label: "saved item", file: "src/read.ts", line: 2, group: "persistence", parentId: null, role: "persistence" }, { id: "c0", kind: "component", label: "RouteA", file: "src/routes/a.tsx", line: 1, group: "route", parentId: null, role: "route" }, { id: "c1", kind: "component", label: "Show", file: "src/routes/a.tsx", line: 2, group: "route", parentId: "c0", role: "framework" }, { id: "t0", kind: "terminal", label: "title", file: "src/render.tsx", line: 4, group: "render", parentId: null, role: "terminal" }], edges: [{ id: "ce0", from: "v0", to: "c0", kind: "data" }, { id: "ce1", from: "c0", to: "c1", kind: "component" }] },
  exhaustiveGraph: {
    nodes: [{ key: "n0", label: "saved item", snippet: "const saved = readItem(id)", kind: "source", file: "src/read.ts", line: 2, column: 1, boundaryId: null, pathCount: 2, minimumDepth: 0, component: "RouteA", components: ["RouteA"] }, { key: "n1", label: "map item", snippet: "saved.map((item) => item.title)", kind: "call", file: "src/map.ts", line: 3, column: 1, boundaryId: null, pathCount: 2, minimumDepth: 1, component: "RouteA", components: ["RouteA"] }, { key: "n2", label: "title", snippet: "<h1>{title}</h1>", kind: "jsx-child", file: "src/render.tsx", line: 4, column: 1, boundaryId: null, pathCount: 1, minimumDepth: 2, component: "RouteA", components: ["RouteA"] }, { key: "n3", label: "style", snippet: "style={{ color: titleColor }}", kind: "jsx-attribute", file: "src/render.tsx", line: 5, column: 1, boundaryId: null, pathCount: 1, minimumDepth: 2, component: "RouteA", components: ["RouteA"] }],
    edges: [{ key: "ge0", from: "n0", to: "n1", kind: "read", unknown: false, pathCount: 2 }, { key: "ge1", from: "n1", to: "n2", kind: "render", unknown: false, pathCount: 1 }, { key: "ge2", from: "n1", to: "n3", kind: "render", unknown: true, pathCount: 1 }],
    trajectories: [{ key: "p0", sinkId: "t0", terminalLabel: "title", stepKeys: ["n0", "n1", "n2"], stepComponents: ["RouteA", "RouteA", "RouteA"], sourceMethodKeys: [source.key], sourceHandoffKeys: [], substitutionStepCount: 0, completeness: "complete-for-supported-scope" }, { key: "p1", sinkId: "t1", terminalLabel: "style", stepKeys: ["n0", "n1", "n3"], stepComponents: ["RouteA", "RouteA", "RouteA"], sourceMethodKeys: [source.key], sourceHandoffKeys: [], substitutionStepCount: 0, completeness: "partial" }],
    totals: { sinks: 2, trajectories: 2, nodes: 4, edges: 3, components: 1, unknownTrajectories: 1 }, truncated: false, cycleCount: 0, pathBudget: 100000,
  },
  hiddenComponentPolicy: { enabledByDefault: false, include: [], exclude: [], configPath: null },
  totality: null,
};
const inventory: RouteDataInventory = {
  routes: [detail.route],
  sources: [source],
  trajectories: [{ key: detail.trajectory.key, routeKey: detail.trajectory.routeKey, label: detail.trajectory.label, operationCount: detail.operations.length, terminalCount: detail.terminals.length, sourceMethodKeys: [source.key], substitutionStepCount: 0, routeReachableTerminalCount: detail.trajectory.routeReachableTerminalCount, terminalSelectionLimit: detail.trajectory.terminalSelectionLimit, ordering: detail.trajectory.ordering, handoffsProven: detail.trajectory.handoffsProven, completeness: detail.trajectory.completeness, omissions: detail.trajectory.omissions }],
  totals: { routes: 1, sources: 1, trajectories: 1, complete: 1 },
};

describe("route trajectory workspace interactions", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const data = url.startsWith("/api/route-data?") ? detail : { path: "src/read.tsx", focus: { line: 2, column: 1, endLine: 2, endColumn: 12 }, lines: [{ number: 2, text: "readExpression()", focus: true }] };
      return new Response(JSON.stringify({ apiVersion: 1, analysisVersion: 1, generation: 1, generatedAt: "2026-07-13T00:00:00.000Z", data }), { status: 200, headers: { "content-type": "application/json" } });
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("keeps topology labels at a viewport-readable size independent of viewBox fitting", () => {
    const bounds = { width: 600, height: 380, top: 0, right: 600, bottom: 380, left: 0, x: 0, y: 0, toJSON: () => ({}) };
    const boundsSpy = vi.spyOn(SVGSVGElement.prototype, "getBoundingClientRect").mockReturnValue(bounds);
    const { container } = render(() => <ComponentTopologyGraph detail={detail} sourceKey={null} onSource={() => undefined} onShowPaths={() => undefined} />);
    const labels = [...container.querySelectorAll(".component-topology-node text")];
    expect(labels.length).toBeGreaterThan(0);
    const labelScales = new Set(labels.map((label) => label.getAttribute("transform")));
    expect(labelScales.size).toBe(1);
    expect(Number(labelScales.values().next().value?.match(/^scale\((.+)\)$/)?.[1])).toBeGreaterThan(1);
    boundsSpy.mockRestore();
  });

  it("explains topology node background colors in the shared legend", () => {
    const { container } = render(() => <ComponentTopologyGraph detail={detail} sourceKey={null} onSource={() => undefined} onShowPaths={() => undefined} />);
    const legend = screen.getByLabelText("Topology legend");
    expect(legend.textContent).toContain("Nodes");
    expect(legend.textContent).toContain("ComponentRouteSourceResourceContextTransform ringComponent leafHub");
    expect(legend.querySelectorAll(".component-topology-key")).toHaveLength(8);
    expect(container.querySelectorAll(".component-topology-hub-legend")).toHaveLength(1);
  });

  it("opens debug controls as an overlay without replacing the mounted graph surfaces", async () => {
    const { container } = render(() => <ComponentTopologyGraph detail={detail} sourceKey={null} onSource={() => undefined} onShowPaths={() => undefined} />);
    const overlay = container.querySelector<HTMLElement>(".component-topology-debug-overlay")!;
    const svg = container.querySelector(".component-topology-svg");
    const inspector = container.querySelector(".component-topology-inspector");

    expect(overlay.hidden).toBe(true);
    await fireEvent.keyDown(document, { key: "d" });
    expect(overlay.hidden).toBe(false);
    expect(container.querySelector(".component-topology-svg")).toBe(svg);
    expect(container.querySelector(".component-topology-inspector")).toBe(inspector);
    expect(screen.getByLabelText("Topology layout debug controls")).toBeTruthy();

    await fireEvent.keyDown(document, { key: "d" });
    expect(overlay.hidden).toBe(true);
    expect(container.querySelector(".component-topology-svg")).toBe(svg);
  });

  it("steps and tunes the temporary topology layout debugger and copies its current state", async () => {
    const { container } = render(() => <ComponentTopologyGraph detail={detail} sourceKey={null} onSource={() => undefined} onShowPaths={() => undefined} />);
    await fireEvent.keyDown(document, { key: "d" });
    const controls = screen.getByLabelText("Topology layout debug controls");
    const firstNode = container.querySelector(".component-topology-node");
    const firstTransform = firstNode?.getAttribute("transform");
    expect(controls.textContent).toContain("Ticks456");
    const forcesButton = screen.getByRole("button", { name: "Forces" });
    expect(forcesButton.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector(".component-topology-forces")?.classList.contains("visible")).toBe(false);
    await fireEvent.click(forcesButton);
    expect(forcesButton.getAttribute("aria-pressed")).toBe("true");
    const forceLayer = container.querySelector(".component-topology-forces");
    expect(forceLayer?.classList.contains("visible")).toBe(true);
    expect(forceLayer?.previousElementSibling?.classList.contains("component-topology-nodes")).toBe(true);
    expect(container.querySelector(".component-topology-forces")).toBe(forceLayer);
    const editButton = screen.getByRole("button", { name: "Edit positions" });
    const svg = container.querySelector(".component-topology-svg")!;
    const cameraLayer = container.querySelector(".component-topology-camera-layer")!;
    const cameraBeforeEdit = cameraLayer.getAttribute("transform");
    await fireEvent.click(editButton);
    expect(editButton.getAttribute("aria-pressed")).toBe("true");
    expect(forcesButton.getAttribute("aria-pressed")).toBe("false");
    await fireEvent.pointerDown(firstNode!, { button: 0, pointerId: 31, clientX: 100, clientY: 100 });
    await fireEvent.pointerMove(svg, { pointerId: 31, clientX: 140, clientY: 125 });
    await fireEvent.pointerUp(svg, { pointerId: 31, clientX: 140, clientY: 125 });
    expect(firstNode?.getAttribute("transform")).not.toBe(firstTransform);
    expect(cameraLayer.getAttribute("transform")).toBe(cameraBeforeEdit);
    await fireEvent.click(screen.getByRole("button", { name: "Done editing" }));
    expect(editButton.getAttribute("aria-pressed")).toBe("false");
    expect(controls.textContent).toContain("1 manual move");
    await fireEvent.input(screen.getByRole("slider", { name: "Ticks" }), { target: { value: "1000" } });
    expect(controls.textContent).toContain("Ticks1000");
    expect(container.querySelector(".component-topology-node")).toBe(firstNode);
    expect(firstNode?.getAttribute("transform")).not.toBe(firstTransform);
    await fireEvent.click(screen.getByRole("button", { name: "Run one separation pass" }));
    expect(controls.textContent).toContain("1 separation pass");
    await fireEvent.input(screen.getByRole("slider", { name: "Mark gap" }), { target: { value: "20" } });
    expect(controls.textContent).toContain("Mark gap20");
    await fireEvent.input(screen.getByRole("slider", { name: "Link distance" }), { target: { value: "240" } });
    expect(controls.textContent).toContain("Link distance240");
    await fireEvent.input(screen.getByRole("slider", { name: "Fringe push" }), { target: { value: "5" } });
    expect(controls.textContent).toContain("Fringe push5");
    await fireEvent.click(screen.getByRole("button", { name: "Copy state" }));
    const clipboard = vi.mocked(navigator.clipboard.writeText);
    expect(clipboard).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(clipboard.mock.calls[0][0]));
    expect(payload).toMatchObject({
      kind: "component-topology-layout-debug",
      settings: { simulationTicks: 1000, separationPasses: 1, targetLinkDistance: 240, markGap: 20, fringeStrength: 5 },
      manualPositions: { editing: false, movedNodeCount: 1 },
    });
    expect(payload.manualPositions.changes).toEqual([
      expect.objectContaining({ id: expect.any(String), dx: expect.any(Number), dy: expect.any(Number), distance: expect.any(Number) }),
    ]);
    expect(payload.nodes).toHaveLength(container.querySelectorAll(".component-topology-node").length);
    expect(payload.edges).toEqual(expect.any(Array));
  });

  it("accents selection, isolates with boundary context, expands evidence, and preserves the mounted canvas under source", async () => {
    const initial: TrajectoryUrlState = { open: true, route: "route:a", flow: "flow:a", item: "op0", expand: [], isolate: false, mode: "detail", kind: "pages", sort: "steps", source: null, filter: null, view: "trajectory", pan: null, zoom: 1, packet: null };
    const [state, setState] = createSignal(initial);
    const { container } = render(() => <RouteTrajectoryWorkspace detail={detail} generation={1} state={state()} onState={(patch) => setState((value) => ({ ...value, ...patch }))} onCloseTransient={() => undefined} />);
    expect(container.textContent).toContain("OutputCaptureDetail12 fields · may be empty");
    expect(container.textContent).not.toContain("/Users/example");
    expect(container.querySelectorAll(".trajectory-operation.dimmed")).toHaveLength(0);
    expect(container.querySelector('.trajectory-operation-main[aria-pressed="true"]')).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Isolate contributor slice" }));
    expect(container.querySelectorAll(".trajectory-operation")).toHaveLength(2);
    expect(container.textContent).toContain("1 later evidence cards");
    await fireEvent.click(screen.getAllByRole("button", { name: "Expand evidence (1)" })[0]);
    expect(container.textContent).toContain("readExpression()");
    await fireEvent.click(container.querySelector(".trajectory-evidence-children button")!);
    expect(screen.getByRole("dialog", { name: "Trajectory source evidence" })).toBeTruthy();
    await waitFor(() => expect(container.textContent).toContain("readExpression()"));
    expect(container.querySelector(".trajectory-canvas")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Close source evidence" }));
    expect(container.querySelector(".trajectory-source-modal")?.hasAttribute("hidden")).toBe(true);
  });

  it("keeps context and operation interactions local without refetching or resetting horizontal scroll", async () => {
    const fetchMock = vi.mocked(fetch);
    const { container } = render(() => <DataTrajectoryDialog inventory={inventory} generation={1} open={true} initialSearch="?trajectoryMode=detail&route=route%3Aa&flow=flow%3Aa&view=context" onClose={() => undefined} />);
    await waitFor(() => expect(container.querySelector(".component-topology")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Topology" }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".component-topology-summary")?.textContent).toContain("no field lineage selected");
    expect(container.querySelectorAll(".component-topology-node")).toHaveLength(1);
    expect(container.querySelector(".component-topology-inspector")?.textContent).toContain("Select a data source");
    const routeNode = screen.getByRole("button", { name: "Inspect RouteA" });
    await fireEvent.pointerDown(routeNode, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    await fireEvent.pointerUp(container.querySelector(".component-topology-svg")!, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(container.querySelector(".component-topology-inspector")?.textContent).toContain("RouteA");
    expect(container.querySelector(".component-topology-inspector")?.textContent).toContain("Proven data path; field identity not established");
    expect(container.querySelector(".component-topology-node.selected")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    const copiedSelection = JSON.parse(vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)?.[0] ?? "{}");
    expect(copiedSelection).toMatchObject({
      kind: "component-topology-selection",
      route: { key: "route:a", path: "/a", file: "src/routes/a.tsx" },
      trajectory: { key: "flow:a", completeness: "partial" },
      selection: { id: "component-source:c0", label: "RouteA", kind: "component" },
      focus: { rule: "direct neighbors plus cycle-safe upstream lineage", truncated: false },
      graph: { visibleNodes: 1, visibleEdges: 0 },
    });
    expect(copiedSelection.connections).toEqual([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied JSON" })).toBeTruthy());
    const cameraLayer = container.querySelector(".component-topology-camera-layer")!;
    const cameraBeforeDrag = cameraLayer.getAttribute("transform");
    await fireEvent.pointerDown(routeNode, { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
    await fireEvent.pointerMove(container.querySelector(".component-topology-svg")!, { pointerId: 2, clientX: 140, clientY: 125 });
    await fireEvent.pointerUp(container.querySelector(".component-topology-svg")!, { pointerId: 2, clientX: 140, clientY: 125 });
    expect(cameraLayer.getAttribute("transform")).not.toBe(cameraBeforeDrag);
    expect(container.querySelector(".component-topology-inspector")?.textContent).toContain("RouteA");
    expect(screen.getByRole("button", { name: "Reset topology view" }).textContent).toBe("100%");
    await fireEvent.click(screen.getByRole("button", { name: "Zoom in topology" }));
    expect(screen.getByRole("button", { name: "Reset topology view" }).textContent).toBe("125%");
    expect(container.querySelector(".component-topology-camera-layer")?.getAttribute("transform")).toContain("scale(1.25)");
    await fireEvent.click(screen.getByRole("button", { name: "Reset topology view" }));
    expect(screen.getByRole("button", { name: "Reset topology view" }).textContent).toBe("100%");
    await fireEvent.wheel(container.querySelector(".component-topology-svg")!, { deltaY: -100, clientX: 100, clientY: 100 });
    expect(screen.getByRole("button", { name: "Reset topology view" }).textContent).toBe("107%");
    await fireEvent.click(screen.getByRole("button", { name: "Detailed paths" }));
    expect(container.querySelector(".route-flow-toolbar")?.textContent).toContain("2 paths");
    expect(container.querySelector(".route-flow-toolbar")?.textContent).toContain("1 components · 2 sinks · 4 nodes");
    expect(container.querySelector(".route-flow-components")?.textContent).toContain("RouteA");
    expect(container.querySelector(".route-flow-inspector-paths h3")?.textContent).toContain("All source paths");
    const rankedPaths = container.querySelectorAll<HTMLButtonElement>(".route-flow-inspector-paths button");
    expect(rankedPaths[0].textContent).toContain("style");
    await fireEvent.click(rankedPaths[0]);
    expect(container.querySelectorAll(".route-flow-node")).toHaveLength(3);
    expect(container.querySelectorAll(".route-flow-edges path")).toHaveLength(2);
    expect(container.textContent).toContain("Focused · 3 nodes");
    expect(container.querySelector(".route-flow-component-marker")?.textContent).toBe("ROUTE ENTRY · TRACE START");
    await fireEvent.click(container.querySelectorAll(".route-flow-node")[0]);
    expect(container.querySelectorAll(".route-flow-node")).toHaveLength(3);
    expect(container.querySelectorAll(".route-flow-edges path")).toHaveLength(2);
    expect(container.querySelectorAll(".route-flow-node.selected")).toHaveLength(1);
    expect(container.textContent).toContain("Focused · 3 nodes");
    await fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(container.querySelectorAll(".route-flow-node")).toHaveLength(4);
    await fireEvent.pointerEnter(container.querySelectorAll(".route-flow-node")[0]);
    expect(container.querySelector(".route-flow-node-popover")?.textContent).toContain("saved item");
    expect(container.querySelector(".route-flow-node-popover")?.textContent).toContain("read.ts:2:1 · source · 2 paths");
    expect(container.querySelector(".route-flow-node-popover")?.textContent).toContain("const saved = readItem(id)");
    expect(container.querySelector(".route-flow-node title")).toBeNull();
    await fireEvent.click(container.querySelectorAll(".route-flow-node")[2]);
    expect(container.querySelectorAll(".route-flow-node.dimmed").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByRole("button", { name: "Evidence" }));
    const viewport = container.querySelector<HTMLElement>(".trajectory-canvas")!;
    viewport.scrollLeft = 180;
    await fireEvent.click(container.querySelectorAll(".trajectory-operation-main")[1]);
    expect(viewport.scrollLeft).toBe(180);
    await fireEvent.click(screen.getAllByRole("button", { name: "Expand evidence (1)" })[1]);
    await new Promise((resolve) => queueMicrotask(resolve));
    expect(viewport.scrollLeft).toBe(180);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll(".trajectory-edge")).toHaveLength(0);
    expect(container.textContent).toContain("ordered by semantic stage, not call/argument order");
    expect(container.textContent).not.toContain("shape:s");
  });

  it("distinguishes the route entry from a later retained trace start", async () => {
    const nestedDetail: RouteDataDetail = {
      ...detail,
      route: { ...detail.route, componentNames: ["RouteEntry", "RouteA"] },
      context: { ...detail.context, nodes: detail.context.nodes.map((node) => node.role === "route" ? { ...node, label: "RouteEntry" } : node) },
    };
    const { container } = render(() => <RouteFlowGraph detail={nestedDetail} sourceKey={null} onSource={() => undefined} onOpenEvidence={() => undefined} onOpenSource={() => undefined} />);
    await fireEvent.click(screen.getByRole("button", { name: "Detailed paths" }));
    await fireEvent.click(container.querySelector(".route-flow-inspector-paths button")!);
    expect(container.querySelector(".route-flow-component-marker")?.textContent).toBe("TRACE START");
  });
});
