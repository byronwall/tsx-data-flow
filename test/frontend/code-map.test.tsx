// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FilePage } from "../../src/api/contracts";
import { CodeMap } from "../../src/frontend/src/CodeMap";

const finding = {
  id: "F1", label: "derived title", expression: "props.title ?? 'Untitled'", category: "attribute", type: "string",
  location: { path: "src/Card.tsx", line: 2, column: 10 }, span: { startLine: 2, startColumn: 10, endLine: 2, endColumn: 25 },
  context: { component: "Card", tag: "div", attribute: "title" }, burden: 0.7, confidence: 90, confidenceReason: "resolved", queue: "central-leverage",
  roots: [{ label: "props.title", kind: "prop-read", location: null }],
  path: [
    { label: "props", kind: "parameter", detail: "enters Card", location: { path: "src/Card.tsx", line: 1 }, snippet: "function Card(props)" },
    { label: "props.title", kind: "property-read", detail: "reads the title", location: { path: "src/Card.tsx", line: 1 }, snippet: "function Card(props)" },
  ],
  defenses: [{ expression: "props.title ?? 'Untitled'", verdict: "fallback", origin: "render", type: "string", location: { path: "src/Card.tsx", line: 2 } }],
  representationSteps: [], advice: { shape: "uncategorized", firstCut: "default once", headline: "Move the default to the prop boundary" }, reach: [], sameCode: [],
  graph: { nodes: [{ id: "root", label: "props.title", kind: "source", location: null, metric: null }, { id: "sink", label: "title", kind: "sink", location: { path: "src/Card.tsx", line: 2 }, metric: "burden 0.70" }], edges: [{ id: "edge", from: "root", to: "sink", label: null }] },
  debugText: "tsx-dataflow finding F1",
} as const;
const data: FilePage = {
  file: { path: "src/Card.tsx", language: "tsx", lines: [
    { number: 1, text: "function Card(props) {", annotations: [] },
    { number: 2, text: "  return <div title={props.title ?? 'Untitled'} />", annotations: [{ kind: "finding", entityId: "F1", startColumn: 10, endColumn: 25, burden: 0.7 }] },
  ] },
  inventory: [{ id: "F1", kind: "finding", line: 2, label: "derived title", secondaryLabel: null, burden: 0.7, severity: "high", sort: { score: 0.7, line: 2, sources: 1, kindOrder: 0 }, flags: { hasDetails: true, hasDefenses: true } }],
  findingsById: { F1: finding }, reportAvailability: [], debug: { scopePath: "src/Card.tsx", findingCount: 1 },
};

describe("native code map", () => {
  beforeEach(() => { Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value() {} }); window.history.replaceState({}, "", "/file?path=src%2FCard.tsx"); });
  afterEach(cleanup);
  it("selects an annotated finding and renders path/defense evidence", async () => {
    render(() => <CodeMap location={new URL(window.location.href)} data={data} navigate={(href) => window.history.replaceState({}, "", href)} />);
    const source = screen.getByRole("table", { name: /Source for/ });
    expect(source.textContent).toContain("props.title");
    expect(screen.getByText("Identifier")).toBeTruthy();
    expect(screen.getByText("derived title").tagName).toBe("CODE");
    const allEntries = screen.getByRole("button", { name: "All entries" });
    expect(allEntries.getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(screen.getByRole("button", { name: "Defended" }));
    expect(window.location.search).toContain("etype=defended");
    expect(screen.getByRole("button", { name: "Priority" }).getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(screen.getByRole("button", { name: "Line" }));
    expect(window.location.search).toContain("lsort=line");
    const annotatedRow = source.querySelector<HTMLTableRowElement>("[data-line='2']")!;
    expect(annotatedRow.cells[0]?.classList.contains("source-hits")).toBe(true);
    expect(annotatedRow.cells[1]?.classList.contains("ln")).toBe(true);
    await fireEvent.click(screen.getByRole("button", { name: /derived title/i }));
    expect(screen.getByRole("heading", { name: /F1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /List/ }).closest("aside")).toBeNull();
    expect(screen.getByRole("heading", { name: /F1/ }).closest("nav")?.classList.contains("panel-nav")).toBe(true);
    expect(screen.getByText("Card.tsx:2")).toBeTruthy();
    expect(screen.queryByText("uncategorized")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Source" })).toBeNull();
    expect(document.querySelector(".expression")).toBeNull();
    const pathList = screen.getByRole("heading", { name: "Path — 2 steps" }).nextElementSibling!;
    expect(pathList.querySelectorAll("li")).toHaveLength(1);
    expect(pathList.querySelectorAll(".path-operation")).toHaveLength(2);
    expect(pathList.querySelector(".path-location")).toBeTruthy();
    expect(pathList.textContent).toContain("function Card(props)");
    expect(pathList.textContent).toContain("props.title");
    expect(screen.getByText("Move the default to the prop boundary")).toBeTruthy();
    expect(screen.getByText(/Defenses — 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy debug info" }).closest("footer")?.classList.contains("finding-actions")).toBe(true);
    expect(screen.queryByRole("img", { name: /Source-to-sink graph/ })).toBeNull();
    expect(window.location.search).toContain("finding=F1");
  });
  it("restores a finding from the URL", () => {
    window.history.replaceState({}, "", "/file?path=src%2FCard.tsx&finding=F1#L2");
    render(() => <CodeMap location={new URL(window.location.href)} data={data} requestedId="F1" navigate={(href) => window.history.replaceState({}, "", href)} />);
    expect(screen.getByRole("heading", { name: /F1/ })).toBeTruthy();
  });
});
