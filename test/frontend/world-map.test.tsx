// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import type { Workspace } from "../../src/api/contracts";
import { CleanupQueue } from "../../src/frontend/src/overview/CleanupQueue";
import { WorldMap } from "../../src/frontend/src/overview/WorldMap";
import { constrainViewport, gestureMoved, layoutComponentGraph } from "../../src/frontend/src/overview/ComponentStructureMap";
import { buildFolderTree } from "../../src/frontend/src/overview/FolderScopeTree";
import { folderScopes, scopeWorldMap } from "../../src/frontend/src/overview/world-map-model";
import { selectRepresentativeEdges, selectRepresentativeTrajectories } from "../../src/api/projections/semantic-map";

const map: Workspace["semanticMap"] = {
  areas: [
    { id: "area:src/store.ts", label: "store.ts", path: "src/store.ts", sourceCount: 2, sinkCount: 0, findingCount: 0, worstBurden: 0, boundaryCount: 1, unknownCount: 0, landmarks: [{ kind: "context", label: "AppDataContext", location: { path: "src/store.ts", line: 4 } }] },
    { id: "area:src/Card.tsx", label: "Card.tsx", path: "src/Card.tsx", sourceCount: 0, sinkCount: 2, findingCount: 1, worstBurden: .7, boundaryCount: 0, unknownCount: 0, landmarks: [{ kind: "terminal", label: "story.title", location: { path: "src/Card.tsx", line: 12 } }] },
  ],
  edges: [{ id: "edge", from: "area:src/store.ts", to: "area:src/Card.tsx", flowCount: 2, unknownCount: 0, kinds: ["property-read"] }],
  trajectories: [{ id: "finding-1", label: "story.title", sourceLabels: ["context.story", "useSearchParams", "\"\"", "\"stable\""], areaIds: ["area:src/store.ts", "area:src/Card.tsx"], terminal: { path: "src/Card.tsx", line: 12 }, burden: .7, depth: 5, traceComplete: true }],
  cleanup: [{ id: "finding-1", label: "story.title", location: { path: "src/Card.tsx", line: 12 }, burden: .7, sinkCount: 2, fileCount: 1, pivots: ["context.story"], causes: ["formatStory"], shape: "call", evidenceLevel: "suspicious-transformation", recommendation: "Inspect the shared formatter.", memberLocations: [{ path: "src/Card.tsx", line: 12 }] }],
  components: { nodes: [{ id: "component:src/App.tsx:4:App", name: "App", path: "src/App.tsx", line: 4, incomingCount: 0, outgoingCount: 1, useCount: 0, role: "root" }, { id: "component:src/Card.tsx:3:Card", name: "Card", path: "src/Card.tsx", line: 3, incomingCount: 1, outgoingCount: 0, useCount: 1, role: "leaf" }], edges: [{ id: "component-edge", from: "component:src/App.tsx:4:App", to: "component:src/Card.tsx:3:Card", useCount: 1 }], totals: { nodes: 2, edges: 1 } },
  totals: { areas: 2, edges: 1, trajectories: 1, cleanupOpportunities: 1 },
  caps: { areas: 80, edges: 160, trajectories: 40, cleanup: 40 },
};

describe("repository world map", () => {
  afterEach(cleanup);
  it("drills from an area through a value and trajectory to responsible source", async () => {
    const { container } = render(() => <WorldMap map={map} loadSourceLines={async () => [
      { number: 2, text: "export const before = true;" }, { number: 3, text: "const value = createContext();" },
      { number: 4, text: "export const AppDataContext = value;" }, { number: 5, text: "export const after = true;" }, { number: 6, text: "export default value;" },
    ]} />);
    expect(screen.getByRole("img", { name: "Repository data-flow network" })).toBeTruthy();
    expect(container.querySelectorAll(".world-map-workspace .world-graph-edges path")).toHaveLength(1);
    expect(container.querySelectorAll(".world-node.node-source")).toHaveLength(1);
    expect(container.querySelectorAll(".world-node.node-terminal")).toHaveLength(1);
    expect(container.textContent).toContain("Source-only file");
    expect(container.textContent).toContain("ordered by connection volume, then finding burden");
    expect(container.textContent).toContain("Showing 2 of 2 available areas in this view");
    expect(screen.getByRole("tree")).toBeTruthy();
    const cardNode = container.querySelector('[aria-label^="Card.tsx"]')!;
    const cardPosition = cardNode.getAttribute("transform");
    await fireEvent.click(screen.getByRole("button", { name: /store.ts/ }));
    expect(cardNode.getAttribute("transform")).toBe(cardPosition);
    expect(screen.getAllByText("AppDataContext")).toHaveLength(1);
    await waitFor(() => expect(document.body.querySelectorAll(".landmark-source-card pre span")).toHaveLength(5));
    expect(container.querySelector(".landmark-row")?.getAttribute("href")).toContain("src%2Fstore.ts#L4");
    await fireEvent.focus(container.querySelector(".landmark-row")!);
    const sourceCard = document.body.querySelector(".landmark-source-card")!;
    expect(container.contains(sourceCard)).toBe(false);
    expect(document.body.contains(sourceCard)).toBe(true);
    expect(sourceCard.classList.contains("active")).toBe(true);
    expect(sourceCard.getAttribute("style")).toContain("left:");
    expect(container.textContent).toContain("Hover or focus a row for nearby source");
    expect(screen.queryByRole("button", { name: '""' })).toBeNull();
    expect(screen.queryByRole("button", { name: '"stable"' })).toBeNull();
    expect(screen.getByRole("button", { name: "useSearchParams" })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "context.story" }));
    await fireEvent.click(screen.getByRole("button", { name: /story.title/ }));
    const link = screen.getByRole("link", { name: "Open responsible source" });
    expect(link.getAttribute("href")).toContain("src%2FCard.tsx");
    expect(link.getAttribute("href")).toContain("finding-1");
    await fireEvent.click(container.querySelector(".world-graph-hit-area")!);
    expect(screen.getByText("Select an area in the network")).toBeTruthy();
  });
  it("links one cleanup row to its representative finding", () => {
    render(() => <CleanupQueue cleanup={map.cleanup} total={1} />);
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("src/Card.tsx:12")).toBeTruthy();
    expect(screen.getByText("Showing 1 of 1 opportunities")).toBeTruthy();
    expect(screen.queryByText("Files")).toBeNull();
    expect(screen.getByRole("link", { name: "story.title" }).getAttribute("href")).toContain("finding-1");
  });
  it("builds ancestor folder scopes and keeps directly connected context", () => {
    const panel = { ...map.areas[1], id: "area:src/features/Panel.tsx", label: "Panel.tsx", path: "src/features/Panel.tsx" };
    const nested = { ...map, areas: [...map.areas, panel], edges: [...map.edges, { id: "panel-edge", from: map.areas[0].id, to: panel.id, flowCount: 1, unknownCount: 0, kinds: ["trajectory"] }] };
    expect(folderScopes(nested)).toContainEqual({ path: "src", count: 3 });
    expect(folderScopes(nested)).toContainEqual({ path: "src/features", count: 1 });
    expect(buildFolderTree(folderScopes(nested))[0].children.map((child) => child.path)).toContain("src/features");
    expect(scopeWorldMap(nested, "src/features").areas.map((area) => area.id)).toEqual([map.areas[0].id, panel.id]);
  });
  it("retains at least one strongest relationship for every connected indexed area", () => {
    const edges = [
      { id: "popular", from: "a", to: "b", flowCount: 100 },
      { id: "board", from: "c", to: "d", flowCount: 2 },
      { id: "other", from: "e", to: "f", flowCount: 1 },
    ];
    expect(selectRepresentativeEdges(edges, ["a", "b", "c", "d"], 2, null).map((edge) => edge.id)).toEqual(["popular", "board"]);
    const trajectories = [
      { id: "top", areaIds: ["a", "b"], burden: .9 },
      { id: "board-path", areaIds: ["c", "d"], burden: .2 },
    ];
    expect(selectRepresentativeTrajectories(trajectories, ["a", "b", "c", "d"], 2, null).map((trajectory) => trajectory.id)).toEqual(["top", "board-path"]);
  });
  it("lays a component progression across every required hierarchy level", () => {
    const nodes = Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, name: `C${index}`, path: `src/C${index}.tsx`, line: 1, incomingCount: index ? 1 : 0, outgoingCount: index < 4 ? 1 : 0, useCount: index ? 1 : 0, role: index === 0 ? "root" as const : index === 4 ? "leaf" as const : "branch" as const }));
    const edges = nodes.slice(1).map((node, index) => ({ id: `e${index}`, from: nodes[index].id, to: node.id, useCount: 1 }));
    const graph = layoutComponentGraph({ nodes, edges, totals: { nodes: 5, edges: 4 } });
    expect(graph.depthCount).toBe(5);
    expect(graph.nodes.map((node) => node.depth)).toEqual([0, 1, 2, 3, 4]);
    expect(graph.nodes.map((node) => node.x)).toEqual([...graph.nodes.map((node) => node.x)].sort((a, b) => a - b));
  });
  it("spreads a dense hierarchy level across up to three adjacent subcolumns", () => {
    const root = { id: "root", name: "Root", path: "src/Root.tsx", line: 1, incomingCount: 0, outgoingCount: 55, useCount: 0, role: "root" as const };
    const children = Array.from({ length: 55 }, (_, index) => ({ id: `child-${index}`, name: `Child${index}`, path: `src/Child${index}.tsx`, line: 1, incomingCount: 1, outgoingCount: 0, useCount: 1, role: "leaf" as const }));
    const edges = children.map((node, index) => ({ id: `edge-${index}`, from: root.id, to: node.id, useCount: 1 }));
    const graph = layoutComponentGraph({ nodes: [root, ...children], edges, totals: { nodes: 56, edges: 55 } });
    const levelOne = graph.nodes.filter((node) => node.depth === 1);
    expect(new Set(levelOne.map((node) => node.x)).size).toBe(3);
    expect(Math.max(...levelOne.map((node) => node.y))).toBeLessThan(1200);
  });
  it("opens component structure full-screen and offers deterministic zoom controls", async () => {
    const { container } = render(() => <WorldMap map={map} />);
    expect(screen.getByRole("img", { name: "Repository data-flow network" })).toBeTruthy();
    expect(container.querySelector(".component-modal")?.hasAttribute("hidden")).toBe(true);
    await fireEvent.click(screen.getByRole("button", { name: "Component structure" }));
    expect(screen.getByRole("dialog", { name: "Component structure" })).toBeTruthy();
    const svg = screen.getByRole("img", { name: "Component render hierarchy" });
    const before = svg.getAttribute("viewBox");
    await fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(svg.getAttribute("viewBox")).not.toBe(before);
    expect(container.querySelectorAll(".component-node")).toHaveLength(2);
    await fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(svg.getAttribute("viewBox")).toBe(before);
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector(".component-modal")?.hasAttribute("hidden")).toBe(true);
  });
  it("keeps isolation stable across selection changes and switches it only with the I shortcut", async () => {
    const orphan = { id: "component:src/Orphan.tsx:1:Orphan", name: "Orphan", path: "src/Orphan.tsx", line: 1, incomingCount: 0, outgoingCount: 0, useCount: 0, role: "root" as const };
    const grandchild = { id: "component:src/Leaf.tsx:1:Leaf", name: "Leaf", path: "src/Leaf.tsx", line: 1, incomingCount: 1, outgoingCount: 0, useCount: 1, role: "leaf" as const };
    const isolatedMap = { ...map, components: { nodes: [...map.components.nodes.map((node) => node.name === "Card" ? { ...node, outgoingCount: 1, role: "branch" as const } : node), grandchild, orphan], edges: [...map.components.edges, { id: "component-edge-leaf", from: map.components.nodes[1].id, to: grandchild.id, useCount: 1 }], totals: { nodes: 4, edges: 2 } } };
    const { container } = render(() => <WorldMap map={isolatedMap} />);
    await fireEvent.click(screen.getByRole("button", { name: "Component structure" }));
    await fireEvent.click(screen.getByRole("button", { name: /^App, level/ }));
    const isolate = screen.getByRole("button", { name: /Isolate I/ });
    expect(isolate.getAttribute("aria-pressed")).toBe("false");
    await fireEvent.keyDown(document, { key: "i" });
    expect(isolate.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll(".component-node.isolatedOut")).toHaveLength(2);
    await fireEvent.click(container.querySelector(".component-depth-labels text")!);
    expect(isolate.hasAttribute("disabled")).toBe(true);
    expect(container.querySelectorAll(".component-node.isolatedOut")).toHaveLength(2);
    await fireEvent.keyDown(document, { key: "i" });
    expect(container.querySelectorAll(".component-node.isolatedOut")).toHaveLength(0);
    await fireEvent.click(screen.getByRole("button", { name: /^App, level/ }));
    await fireEvent.keyDown(document, { key: "i" });
    expect(container.querySelectorAll(".component-node.isolatedOut")).toHaveLength(2);
    await fireEvent.click(screen.getByRole("button", { name: /^Card, level/ }));
    expect(isolate.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector('[data-node-id="component:src/Leaf.tsx:1:Leaf"]')?.classList.contains("isolatedOut")).toBe(true);
    await fireEvent.keyDown(document, { key: "I" });
    expect(isolate.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-node-id="component:src/Leaf.tsx:1:Leaf"]')?.classList.contains("isolatedOut")).toBe(false);
    expect(container.querySelectorAll(".component-node.isolatedOut")).toHaveLength(1);
    await fireEvent.keyDown(document, { key: "i" });
    expect(isolate.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelectorAll(".component-node.isolatedOut")).toHaveLength(0);
  });
  it("distinguishes node clicks, node drags, and dead-space clicks while allowing half-screen overpan", async () => {
    render(() => <WorldMap map={map} />);
    await fireEvent.click(screen.getByRole("button", { name: "Component structure" }));
    const svg = screen.getByRole("img", { name: "Component render hierarchy" }) as SVGSVGElement;
    const app = screen.getByRole("button", { name: /^App, level/ });
    const appNode = app.closest(".component-node")!;
    await fireEvent.pointerDown(app, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    await fireEvent.pointerMove(svg, { pointerId: 1, clientX: 120, clientY: 100 });
    await fireEvent.pointerUp(svg, { pointerId: 1, clientX: 120, clientY: 100 });
    await fireEvent.click(app);
    expect(appNode.classList.contains("selected")).toBe(false);
    await fireEvent.click(app);
    expect(appNode.classList.contains("selected")).toBe(true);
    await fireEvent.click(svg.querySelector(".component-depth-labels text")!);
    expect(appNode.classList.contains("selected")).toBe(false);
    expect(gestureMoved({ x: 100, y: 100 }, { clientX: 102, clientY: 101 })).toBe(false);
    expect(gestureMoved({ x: 100, y: 100 }, { clientX: 660, clientY: 100 })).toBe(true);
    expect(constrainViewport({ x: -900, y: -500, width: 1000, height: 600 }, { x: 0, y: 0, width: 2000, height: 1200 })).toEqual({ x: -500, y: -300, width: 1000, height: 600 });
  });
  it("keeps a thin inspector visible and navigates selected component relationships", async () => {
    render(() => <WorldMap map={map} />);
    await fireEvent.click(screen.getByRole("button", { name: "Component structure" }));
    expect(screen.getByLabelText("Component selection inspector").textContent).toContain("Select a component");
    const svg = screen.getByRole("img", { name: "Component render hierarchy" });
    await fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const zoomedViewport = svg.getAttribute("viewBox");
    await fireEvent.click(screen.getByRole("button", { name: /^App, level/ }));
    expect(svg.getAttribute("viewBox")).toBe(zoomedViewport);
    const inspector = screen.getByLabelText("Component selection inspector");
    expect(inspector.textContent).toContain("App");
    expect(inspector.textContent).not.toContain("Select a component");
    expect(inspector.textContent).toContain("Renders1");
    expect(screen.getByRole("link", { name: "Open source" }).getAttribute("href")).toBe("/file?path=src%2FApp.tsx#L4");
    await fireEvent.click(screen.getByRole("button", { name: "CardCard.tsx" }));
    expect(inspector.textContent).toContain("src/Card.tsx:3");
  });
});
