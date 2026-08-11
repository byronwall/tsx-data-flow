import { describe, expect, it } from "vitest";
import type { RouteDataDetail } from "../../src/api/contracts";
import type { ComponentTopology } from "../../src/frontend/src/overview/component-topology-model";
import { buildTopologyNodeSourceTouches, buildTopologySourceLens } from "../../src/frontend/src/overview/topology-source-lens";

const source = {
  key: "source:doc",
  label: "Doc row",
  kind: "prisma" as const,
  file: "src/docs.queries.ts",
  line: 71,
  routeKeys: ["route:doc"],
  consumerLabel: "fetchDoc",
  handoffProven: true,
  typeName: "DocDetail",
  typeText: "DocDetail",
  shapeKind: "object" as const,
  fields: [
    { key: "id", typeText: "string", optional: false },
    { key: "html", typeText: "string | null", optional: false },
    { key: "markdown", typeText: "string | null", optional: false },
  ],
  totalFields: 3,
  evidenceId: "e:doc",
};

const detail = {
  sources: [source],
  exhaustiveGraph: {
    nodes: [
      graphNode("read", "Doc row", "source", "src/docs.queries.ts", 71, "fetchDoc"),
      graphNode("html", "html", "property-read", "src/DocumentEditor.tsx", 95, "DocumentEditor"),
      graphNode("fallback", "html ?? markdown", "fallback", "src/DocumentEditor.tsx", 95, "DocumentEditor"),
      graphNode("markdown", "markdown", "property-read", "src/DocumentEditor.tsx", 95, "DocumentEditor"),
      graphNode("render", "initialHTML", "jsx-attribute", "src/DocumentEditor.tsx", 416, "TiptapEditor"),
      graphNode("other-id", "id", "property-read", "src/UnrelatedList.tsx", 22, "UnrelatedList"),
    ],
    edges: [],
    trajectories: [
      trajectory("doc-html", ["read", "html", "fallback", "render"], ["fetchDoc", "DocumentEditor", "DocumentEditor", "TiptapEditor"], [source.key]),
      trajectory("doc-markdown", ["read", "markdown", "fallback", "render"], ["fetchDoc", "DocumentEditor", "DocumentEditor", "TiptapEditor"], [source.key]),
      trajectory("unrelated", ["other-id"], ["UnrelatedList"], ["source:other"]),
    ],
    totals: { sinks: 3, trajectories: 3, nodes: 6, edges: 0, components: 4, unknownTrajectories: 0 },
    truncated: false,
    cycleCount: 0,
    pathBudget: 100_000,
  },
} as unknown as RouteDataDetail;

const topology: ComponentTopology = {
  nodes: [
    topologyNode("handler", "source", "fetchDoc", "src/docs.queries.ts"),
    topologyNode("resource", "boundary", "doc resource", "src/DocumentEditor.tsx"),
    topologyNode("editor", "component", "DocumentEditor", "src/DocumentEditor.tsx"),
    topologyNode("tiptap", "component", "TiptapEditor", "src/TiptapEditor.tsx"),
    topologyNode("unrelated", "component", "UnrelatedList", "src/UnrelatedList.tsx"),
  ],
  edges: [
    topologyEdge("handler-resource", "handler", "resource", "loads"),
    topologyEdge("resource-editor", "resource", "editor", "loads"),
    topologyEdge("editor-tiptap", "editor", "tiptap", "renders"),
  ],
  totals: { components: 3, contexts: 0, sources: 1, inferredEdges: 0 },
};

describe("topology source lens", () => {
  it("labels fields and transforms only from exact source-rooted trajectories", () => {
    const lens = buildTopologySourceLens(detail, topology, source.key);

    expect(lens.matchMode).toBe("exact");
    expect(lens.pathCount).toBe(2);
    expect([...lens.componentIds]).toEqual(expect.arrayContaining(["handler", "resource", "editor", "tiptap"]));
    expect(lens.fieldsByNodeId.get("editor")?.map((field) => field.label)).toEqual(["html", "markdown"]);
    expect(lens.fieldsByNodeId.get("tiptap")?.map((field) => field.label)).toEqual(["html", "markdown"]);
    expect(lens.fieldsByNodeId.has("unrelated")).toBe(false);
    expect(lens.transforms).toEqual([
      expect.objectContaining({ label: "html ?? markdown", effect: "Fallback", pathCount: 2, nodeIds: ["editor"] }),
    ]);
  });

  it("keeps source activation distinct from resource-only inspection", () => {
    const exactTouches = buildTopologyNodeSourceTouches(detail, topology, "editor");
    expect(exactTouches[0]).toMatchObject({ mode: "path", source: { key: source.key }, targetId: "editor" });
    expect(exactTouches[0].fields.map((field) => field.key)).toEqual(["id", "html", "markdown"]);

    const resourceOnlyDetail = {
      ...detail,
      sources: [],
      exhaustiveGraph: { ...detail.exhaustiveGraph, trajectories: [] },
    } as unknown as RouteDataDetail;
    const resourceTouches = buildTopologyNodeSourceTouches(resourceOnlyDetail, topology, "editor");

    expect(resourceTouches).toEqual([
      expect.objectContaining({ mode: "resource", source: null, targetId: "resource", fields: [] }),
    ]);
  });
});

function graphNode(key: string, label: string, kind: string, file: string, line: number, component: string) {
  return { key, label, snippet: label, kind, file, line, column: 1, boundaryId: null, pathCount: 1, minimumDepth: 0, component, components: [component] };
}

function trajectory(key: string, stepKeys: string[], stepComponents: string[], sourceMethodKeys: string[]) {
  return { key, sinkId: `sink:${key}`, terminalLabel: "initialHTML", stepKeys, stepComponents, sourceMethodKeys, sourceHandoffKeys: [], substitutionStepCount: 0, completeness: "complete-for-supported-scope" as const };
}

function topologyNode(id: string, kind: ComponentTopology["nodes"][number]["kind"], label: string, file: string) {
  return { id, kind, label, file, line: 1, routeEntry: false, incomingCount: 1, outgoingCount: 1, depth: 1 };
}

function topologyEdge(id: string, from: string, to: string, kind: ComponentTopology["edges"][number]["kind"]) {
  return { id, from, to, kind, confidence: "proven" as const, count: 1 };
}
