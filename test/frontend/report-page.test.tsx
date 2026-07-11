// @vitest-environment jsdom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import type { ReportData } from "../../src/api/contracts";
import { NativeReport } from "../../src/frontend/src/ReportPage";

describe("native reports", () => {
  afterEach(cleanup);
  it("renders context relay evidence without generated HTML", () => {
    const data: ReportData = { view: "context-relay", items: [{ id: "relay-1", label: "Child", location: { path: "src/Parent.tsx", line: 12 }, child: { label: "Child", path: "src/Child.tsx" }, props: ["account", "permissions", "theme"], sharedProps: ["account"], contextHooks: ["useAccount"], signal: "shared prop names", score: 6 }] };
    const { container } = render(() => <NativeReport data={data} />);
    expect(screen.getByText("useAccount")).toBeTruthy();
    expect(screen.getByText(/account, permissions, theme/)).toBeTruthy();
    expect(container.querySelector("[innerHTML]")).toBeNull();
  });
  it("keeps semantic graph markup stable", () => {
    const graph = { nodes: [{ id: "source", label: "props.account", kind: "source" as const, location: null, metric: null }, { id: "sink", label: "Child / account", kind: "sink" as const, location: { path: "src/Child.tsx", line: 8 }, metric: "depth 4" }], edges: [{ id: "edge", from: "source", to: "sink", label: null }] };
    const data: ReportData = { view: "fan-in", items: [{ id: "fanin-1", label: "Child / account", location: { path: "src/Child.tsx", line: 8 }, rootCount: 2, predicateCount: 0, maxDepth: 4, graph }] };
    const { container } = render(() => <NativeReport data={data} />);
    expect(container.querySelector("svg")?.outerHTML).toMatchSnapshot();
  });
  it("omits incomplete graph relationships instead of drawing them from the origin", () => {
    const graph = { nodes: [{ id: "source", label: "props.account", kind: "source" as const, location: null, metric: null }], edges: [{ id: "edge", from: "source", to: "missing", label: null }] };
    const data: ReportData = { view: "fan-in", items: [{ id: "fanin-1", label: "Child / account", location: null, rootCount: 1, predicateCount: 0, maxDepth: 1, graph }] };
    const { container } = render(() => <NativeReport data={data} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
