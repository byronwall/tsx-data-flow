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
  path: [{ label: "props.title", kind: "source", detail: null, location: { path: "src/Card.tsx", line: 1 }, snippet: "function Card(props)" }],
  defenses: [{ expression: "props.title ?? 'Untitled'", verdict: "fallback", origin: "render", type: "string", location: { path: "src/Card.tsx", line: 2 } }],
  representationSteps: [], advice: { shape: "certainty-boundary", firstCut: "default once", headline: "Move the default to the prop boundary" }, reach: [], sameCode: [],
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
    expect(screen.getByRole("table", { name: /Source for/ }).textContent).toContain("props.title");
    await fireEvent.click(screen.getByRole("button", { name: /derived title/i }));
    expect(screen.getByRole("heading", { name: /F1/ })).toBeTruthy();
    expect(screen.getByText("Move the default to the prop boundary")).toBeTruthy();
    expect(screen.getByText(/Defenses — 1/)).toBeTruthy();
    expect(window.location.search).toContain("finding=F1");
  });
  it("restores a finding from the URL", () => {
    window.history.replaceState({}, "", "/file?path=src%2FCard.tsx&finding=F1#L2");
    render(() => <CodeMap location={new URL(window.location.href)} data={data} requestedId="F1" navigate={(href) => window.history.replaceState({}, "", href)} />);
    expect(screen.getByRole("heading", { name: /F1/ })).toBeTruthy();
  });
});
