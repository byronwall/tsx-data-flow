// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import type { Workspace } from "../../src/api/contracts";
import { CleanupQueue } from "../../src/frontend/src/overview/CleanupQueue";
import { WorldMap } from "../../src/frontend/src/overview/WorldMap";
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
    expect(container.querySelectorAll(".world-graph-edges path")).toHaveLength(1);
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
    await waitFor(() => expect(container.querySelectorAll(".landmark-source-card pre span")).toHaveLength(5));
    expect(container.querySelector(".landmark-row")?.getAttribute("href")).toContain("src%2Fstore.ts#L4");
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
});
