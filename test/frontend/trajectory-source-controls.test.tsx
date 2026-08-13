// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RouteDataInventory } from "../../src/api/contracts";
import { ComponentTopologyInspector } from "../../src/frontend/src/overview/ComponentTopologyInspector";
import type { ComponentTopologyLayoutNode } from "../../src/frontend/src/overview/component-topology-model";
import { TrajectorySourcePicker } from "../../src/frontend/src/overview/TrajectorySourcePicker";
import type { TopologyNodeSourceTouch, TopologySourceLens } from "../../src/frontend/src/overview/topology-source-lens";

const source: RouteDataInventory["sources"][number] = {
  key: "source:doc",
  label: "Doc row",
  kind: "prisma",
  file: "src/services/docs.queries.ts",
  line: 71,
  routeKeys: ["route:doc"],
  consumerLabel: "fetchDoc",
  handoffProven: true,
  typeName: null,
  typeText: "{ id: string; html: string | null; markdown: string | null }",
  shapeKind: "object",
  fields: [
    { key: "id", typeText: "string", optional: false },
    { key: "html", typeText: "string | null", optional: false },
    { key: "markdown", typeText: "string | null", optional: false },
  ],
  totalFields: 3,
  evidenceId: "e:doc",
  handoffFields: [],
};

afterEach(cleanup);

describe("trajectory source controls", () => {
  it("presents readable source identity and dismisses the picker without changing selection", async () => {
    const onSelect = vi.fn();
    const { container } = render(() => <div><TrajectorySourcePicker sources={[source]} selectedKey={source.key} onSelect={onSelect} /><button type="button">Outside</button></div>);
    const details = container.querySelector("details")!;

    await fireEvent.click(screen.getByLabelText("Choose route data source"));
    expect(details.open).toBe(true);
    expect(container.textContent).toContain("fetchDoc");
    expect(container.textContent).toContain("docs.queries.ts:71");
    expect(container.querySelector(".trajectory-source-picker > summary code")?.textContent).toBe("id, html, markdown");
    expect(container.textContent).not.toContain("Source shape");
    expect([...container.querySelectorAll(".trajectory-source-fields button")].map((button) => button.textContent)).toEqual([
      "idstring",
      "htmlstring | null",
      "markdownstring | null",
    ]);

    await fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(details.open).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByLabelText("Choose route data source"));
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText("Choose route data source"));
  });

  it("renders source activation and resource inspection as different actions", async () => {
    const onSource = vi.fn();
    const onSelect = vi.fn();
    const node: ComponentTopologyLayoutNode = {
      id: "editor",
      kind: "component",
      label: "DocumentEditor",
      file: "src/DocumentEditor.tsx",
      line: 50,
      routeEntry: false,
      incomingCount: 1,
      outgoingCount: 1,
      depth: 2,
      sourceIdentity: null,
      x: 0,
      y: 0,
      radius: 10,
      terminal: false,
    };
    const touches: TopologyNodeSourceTouch[] = [
      { key: "path", source, label: "fetchDoc", detail: "Doc row · 6 paths", mode: "path", pathCount: 6, targetId: node.id, fields: source.fields },
      { key: "resource", source: null, label: "modalInventory", detail: "modal resource", mode: "resource", pathCount: 0, targetId: "resource:modal", fields: [] },
    ];

    const topology = { nodes: [node], edges: [], totals: { components: 1, contexts: 0, sources: 0, inferredEdges: 0 } };
    const emptyProjection = { topology, hidden: [], uiRingsByNode: new Map(), hiddenNodeIds: new Set(), hiddenEdgeIds: new Set(), originalToVisibleAncestorIds: new Map() };
    render(() => <ComponentTopologyInspector
      lens={emptyLens()}
      selectedNode={node}
      selectedLayoutNode={node}
      allSourceTouches={touches}
      connections={[]}
      selectionCopied={false}
      policy={{ enabledByDefault: false, include: [], exclude: [], configPath: null }}
      topology={topology}
      hiddenProjection={emptyProjection}
      allHiddenProjection={emptyProjection}
      genericUiMode="hidden"
      revealedComponentIds={new Set()}
      inspectorMode="selection"
      onSelect={onSelect}
      onSource={onSource}
      onCopy={() => undefined}
      onInspectorMode={() => undefined}
      onReveal={() => undefined}
      onHideAgain={() => undefined}
      onShowAll={() => undefined}
    />);

    await fireEvent.click(screen.getByText("Activate source →"));
    expect(onSource).toHaveBeenCalledWith(source.key);
    expect(onSelect).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByText("Inspect resource →"));
    expect(onSelect).toHaveBeenCalledWith("resource:modal");
    expect(onSource).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Resource load only; no persisted source is available to activate")).toBeTruthy();
  });
});

function emptyLens(): TopologySourceLens {
  return {
    source: null,
    matchMode: "none",
    pathCount: 0,
    componentIds: new Set(),
    resourceParticipantIds: new Set(),
    handoffComponentIds: new Set(),
    handoffFieldProven: false,
    resources: [],
    transforms: [],
    transformsByNodeId: new Map(),
    fieldsByNodeId: new Map(),
    terminalsByNodeId: new Map(),
    terminalCount: 0,
    transformMatchMode: "unavailable",
  };
}
