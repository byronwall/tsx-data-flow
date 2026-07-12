// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilePage } from "../../src/api/contracts";
import { CodeMap } from "../../src/frontend/src/CodeMap";
import { IdentityEvidence } from "../../src/frontend/src/code-map/FindingDetails";
import { FileWorldContext } from "../../src/frontend/src/code-map/FileWorldContext";
import { installPopoverController } from "../../src/frontend/src/popover-controller";

const finding = {
  id: "F1", label: "derived title", expression: "props.title ?? 'Untitled'", category: "attribute", type: "string",
  location: { path: "src/Card.tsx", line: 2, column: 10 }, span: { startLine: 2, startColumn: 10, endLine: 2, endColumn: 25 },
  context: { component: "Card", tag: "div", attribute: "title" }, burden: 0.7, confidence: 90, confidenceReason: "resolved", queue: "central-leverage",
  identity: { expressionId: "expression:src/Card.tsx:42:53", expression: "props.title", location: { path: "src/Card.tsx", line: 2, column: 28 }, span: { startLine: 2, startColumn: 28, endLine: 2, endColumn: 39 }, focusText: "title", focusSpan: { startLine: 2, startColumn: 34, endLine: 2, endColumn: 39 }, symbolId: "symbol:1", symbolName: "title", typeId: "type:1", typeText: "CaptureAnnotationInventoryResponse", typeDefinition: { path: "src/captures.ts", line: 25, column: 1 }, definition: { path: "src/Card.tsx", line: 1, column: 15 }, usages: [{ path: "src/Card.tsx", line: 2, column: 28 }, { path: "src/index.ts", line: 1, column: 4 }, { path: "src/Other.tsx", line: 7, column: 4 }], traceComplete: true, traceCompletenessReason: "Definition and project-local usages resolved by the TypeScript checker.", evidenceLevel: "fact", upstreamPath: [], downstreamPath: [], terminalSinks: [{ id: "terminal:src/Card.tsx:42:53", path: "src/Card.tsx", line: 2, label: "derived title" }], totalReach: 1, defenses: [], representationSteps: [], unknownBoundaries: [], attachedFindingIds: ["F1"], graphNodeIds: ["n1"], boundaryIds: [] },
  participants: [{ expressionId: "expression:src/Card.tsx:21:32", expression: "props.title", focusText: "title", symbolName: "title", typeText: "string", role: "property" }, { expressionId: "expression:src/Card.tsx:40:80", expression: "STRUCTURE_INVENTORY_ALL_SITE_TYPES", focusText: "STRUCTURE_INVENTORY_ALL_SITE_TYPES", symbolName: "STRUCTURE_INVENTORY_ALL_SITE_TYPES", typeText: "Accessor<CaptureStructureInventoryFilters>", role: "symbol" }],
  burdenBreakdown: { backgroundPenalty: 0, rawSum: 0.7, total: 0.7, terms: [{ key: "path-depth", label: "path depth", weight: 1, raw: 0.7, normalized: 0.7, contribution: 0.7 }] },
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
const tracedExpression = {
  ...finding.identity,
  expressionId: "expression:src/Card.tsx:14:19",
  expression: "props",
  location: { path: "src/Card.tsx", line: 1, column: 15 },
  span: { startLine: 1, startColumn: 15, endLine: 1, endColumn: 20 },
  focusText: "props",
  focusSpan: { startLine: 1, startColumn: 15, endLine: 1, endColumn: 20 },
  symbolName: "props",
  definition: { path: "src/Card.tsx", line: 1, column: 15 },
  upstreamPath: [{ label: "props", kind: "parameter", detail: null, location: { path: "src/Card.tsx", line: 1 } }],
  downstreamPath: [{ label: "props.title", kind: "property-read", detail: null, location: { path: "src/Card.tsx", line: 2 } }],
} as const;
const titleExpression = {
  ...finding.identity,
  expressionId: "expression:src/Card.tsx:21:32",
  expression: "props.title",
  location: { path: "src/Card.tsx", line: 2, column: 22 },
  span: { startLine: 2, startColumn: 22, endLine: 2, endColumn: 33 },
  focusText: "title",
  focusSpan: { startLine: 2, startColumn: 28, endLine: 2, endColumn: 33 },
} as const;
const data: FilePage = {
  file: { path: "src/Card.tsx", language: "tsx", lines: [
    { number: 1, text: "function Card(props) {", annotations: [{ kind: "expression", entityId: tracedExpression.expressionId, startColumn: 15, endColumn: 20, burden: null }] },
    { number: 2, text: "  return <div title={props.title ?? 'Untitled'} />", annotations: [{ kind: "finding", entityId: "F1", startColumn: 10, endColumn: 25, burden: 0.7 }, { kind: "expression", entityId: titleExpression.expressionId, startColumn: 28, endColumn: 33, burden: null }] },
  ] },
  inventory: [
    { id: "F1", kind: "finding", line: 2, label: "derived title", secondaryLabel: null, burden: 0.7, severity: "high", sort: { score: 0.7, line: 2, sources: 1, kindOrder: 0 }, flags: { hasDetails: true, hasDefenses: true } },
    { id: "fan", kind: "fan-out", line: 7, label: "sharedValue", secondaryLabel: "prop-read", sinkCount: 8, fileCount: 2, sort: { score: 8, line: 7, sources: 8, kindOrder: 5 }, flags: { hasDetails: false, hasDefenses: false } },
    { id: "boundary", kind: "boundary", line: 8, label: "normalizeTitle", secondaryLabel: "string", verdict: "local boundary", inboundSources: 3, callers: 2, sort: { score: 3, line: 8, sources: 3, kindOrder: 2 }, flags: { hasDetails: false, hasDefenses: false } },
    { id: "fork", kind: "fork", line: 9, label: "mode", secondaryLabel: "Card", siteLines: [9, 12], discriminant: "props.mode", sort: { score: 2, line: 9, sources: 1, kindOrder: 1 }, flags: { hasDetails: false, hasDefenses: false } },
    { id: "relay", kind: "relay", line: 10, label: "CardWrapper", secondaryLabel: "Card", childPath: "src/Card.tsx", props: ["title", "size"], contextHooks: ["useTheme"], sort: { score: 2, line: 10, sources: 2, kindOrder: 3 }, flags: { hasDetails: false, hasDefenses: false } },
    { id: "unknown", kind: "unknown-edge", line: 11, label: "formatTitle", secondaryLabel: "unresolved call", occurrences: 3, sort: { score: 3, line: 11, sources: 1, kindOrder: 4 }, flags: { hasDetails: false, hasDefenses: false } },
  ],
  findingsById: { F1: finding }, expressionsById: { [tracedExpression.expressionId]: tracedExpression, [titleExpression.expressionId]: titleExpression }, reportAvailability: [], debug: { scopePath: "src/Card.tsx", findingCount: 1 },
  worldContext: {
    area: { id: "area:src/Card.tsx", label: "Card.tsx", path: "src/Card.tsx", sourceCount: 2, sinkCount: 1, findingCount: 1, worstBurden: 0.7, boundaryCount: 1, unknownCount: 0, landmarks: [] },
    incoming: [{ path: "src/model.ts", label: "model.ts", flowCount: 3, incompleteCount: 0, relationship: "trajectory-contributor", via: ["adapter.ts"] }],
    outgoing: [{ path: "src/View.tsx", label: "View.tsx", flowCount: 2, incompleteCount: 1, relationship: "traced-edge", via: [] }],
    trajectories: [{ id: "F1", label: "derived title", sourceLabels: ["props.title"], areaIds: ["area:src/Card.tsx"], terminal: { path: "src/Card.tsx", line: 2 }, burden: 0.7, depth: 2, traceComplete: true }],
    totals: { repositoryAreas: 12, connectedAreas: 2, crossingTrajectories: 1 },
  },
};

describe("native code map", () => {
  beforeEach(() => { Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value() {} }); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } }); window.history.replaceState({}, "", "/file?path=src%2FCard.tsx"); });
  afterEach(cleanup);
  it("keeps repository orientation available and collapses barrel hops", async () => {
    const removePopovers = installPopoverController(document);
    const { container } = render(() => <><FileWorldContext context={data.worldContext} /><CodeMap location={new URL(window.location.href)} data={data} navigate={(href) => window.history.replaceState({}, "", href)} requestedId={titleExpression.expressionId} /></>);
    const summary = screen.getByRole("button", { name: /Repository context/ });
    expect(summary.textContent).toContain("1↑");
    await fireEvent.click(summary);
    expect(screen.getByText(/2 related areas in a 12-area repository/)).toBeTruthy();
    expect(screen.getByText(/trajectory contributor · 2 retained area hops/)).toBeTruthy();
    expect(screen.getByText(/via/).textContent).toContain("adapter.ts");
    expect(screen.getByText("Representative render paths")).toBeTruthy();
    expect(screen.getByText("1 barrel re-export hop collapsed")).toBeTruthy();
    expect(screen.getByText(/Where this selected value reaches TSX/)).toBeTruthy();
    expect(summary.closest("[data-popover]")?.classList.contains("open")).toBe(true);
    container.addEventListener("click", (event) => event.preventDefault());
    await fireEvent.click(container.querySelector(".file-world-trajectories a")!);
    expect(summary.closest("[data-popover]")?.classList.contains("open")).toBe(false);
    removePopovers();
  });
  it("reacts to an in-place route hash by jumping to the selected finding line", async () => {
    const scroll = vi.fn(); Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
    const [location, setLocation] = createSignal(new URL(window.location.href));
    const navigate = (href: string) => { window.history.replaceState({}, "", href); setLocation(new URL(window.location.href)); };
    render(() => <CodeMap location={location()} data={data} requestedId={location().searchParams.get("finding")} navigate={navigate} />);
    setLocation(new URL("/file?path=src%2FCard.tsx&finding=F1#L2", window.location.origin));
    await vi.waitFor(() => expect(document.querySelector("[data-line='2']")?.classList.contains("jump-target")).toBe(true));
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });
  it("selects an annotated finding and renders path/defense evidence", async () => {
    render(() => <CodeMap location={new URL(window.location.href)} data={data} navigate={(href) => window.history.replaceState({}, "", href)} />);
    const source = screen.getByRole("table", { name: /Source for/ });
    expect(source.textContent).toContain("props.title");
    expect(screen.getByText("Identifier")).toBeTruthy();
    expect(screen.getByText("derived title", { selector: ".inventory-name" }).tagName).toBe("CODE");
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
    expect(screen.getAllByText("Card.tsx:2").length).toBeGreaterThan(0);
    expect(screen.queryByText("uncategorized")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Source" })).toBeNull();
    expect(document.querySelector(".expression")).toBeNull();
    const pathList = screen.getByRole("heading", { name: "Path — 2 steps" }).nextElementSibling!;
    expect(pathList.querySelectorAll("li")).toHaveLength(1);
    expect(pathList.querySelectorAll(".path-operation")).toHaveLength(2);
    expect(pathList.querySelectorAll(".path-input")).toHaveLength(0);
    expect(pathList.querySelector(".path-operation")?.textContent).toContain("→ parameter props");
    expect(pathList.querySelector(".path-location")).toBeTruthy();
    expect(pathList.textContent).toContain("function Card(props)");
    expect(pathList.textContent).toContain("props.title");
    expect(screen.getByText("Move the default to the prop boundary")).toBeTruthy();
    const selectedSink = screen.getByRole("heading", { name: "Selected sink expression" }).closest("section")!;
    expect(selectedSink.textContent).toContain("props.title ?? 'Untitled'");
    expect(selectedSink.textContent).toContain("expression type");
    const values = screen.getByRole("heading", { name: "Values in this expression" }).closest("section")!;
    expect(values.textContent).toContain("props.title");
    expect(values.textContent).toContain("string");
    expect(screen.getByRole("link", { name: "STRUCTURE_INVENTORY_ALL_SITE_TYPES" }).getAttribute("title")).toBe("STRUCTURE_INVENTORY_ALL_SITE_TYPES");
    expect(screen.queryByRole("heading", { name: "Selected value" })).toBeNull();
    expect(screen.getByText("Move the default to the prop boundary").closest(".finding-summary-row")).toBeTruthy();
    expect(screen.getByText(/path depth 0.700/).closest(".burden-breakdown")).toBeTruthy();
    expect(screen.queryByText(/burden breakdown/i)).toBeNull();
    expect(document.querySelector(".advice")).toBeNull();
    expect(screen.getByText(/Defenses — 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy JSON" }).closest("footer")?.classList.contains("finding-actions")).toBe(true);
    expect(screen.queryByRole("img", { name: /Source-to-sink graph/ })).toBeNull();
    expect(window.location.search).toContain("finding=F1");
  });
  it("restores a finding from the URL", () => {
    window.history.replaceState({}, "", "/file?path=src%2FCard.tsx&finding=F1#L2");
    render(() => <CodeMap location={new URL(window.location.href)} data={data} requestedId="F1" navigate={(href) => window.history.replaceState({}, "", href)} />);
    expect(screen.getByRole("heading", { name: /F1/ })).toBeTruthy();
  });
  it("names the input and result of a multiline returned object", async () => {
    const flowFinding = { ...finding, path: [
      { label: "ariaDescription", kind: "property-read", detail: null, location: { path: "src/model.ts", line: 118 }, snippet: "ariaDescription: `OKLCH ...`," },
      { label: "…large template expression…", kind: "template", detail: null, location: { path: "src/model.ts", line: 118 }, snippet: "ariaDescription: `OKLCH ...`," },
      { label: "{ ariaDescription: «large template expression» }", kind: "object-pack", detail: null, location: { path: "src/model.ts", line: 117 }, snippet: "return {" },
      { label: "paletteWheelPointView", kind: "call", detail: "returns { ariaDescription: ... }", location: { path: "src/Card.tsx", line: 1 }, snippet: "const point = createMemo(() => paletteWheelPointView(candidate));" },
    ] } as unknown as FilePage["findingsById"][string];
    const flowData = { ...data, findingsById: { F1: flowFinding } };
    render(() => <CodeMap location={new URL(window.location.href)} data={flowData} navigate={(href) => window.history.replaceState({}, "", href)} />);
    await fireEvent.click(screen.getByRole("button", { name: /derived title/i }));
    const rows = screen.getByRole("heading", { name: "Path — 4 steps" }).nextElementSibling!.querySelectorAll("li");
    expect(rows[1]?.querySelector(".path-code")?.textContent).toBe("return { … } as paletteWheelPointView result");
    expect(rows[1]?.querySelector(".path-input")?.textContent).toBe("from ariaDescription");
    expect(rows[1]?.querySelector(".path-operation")?.textContent).toContain("object-pack paletteWheelPointView result packs ariaDescription into the returned object");
  });
  it("summarizes representation operations and shows only actionable trace inputs", async () => {
    const evidenceFinding = { ...finding,
      representationSteps: [
        { kind: "alias", label: "red", location: { path: "src/model.ts", line: 155 } },
        { kind: "alias", label: "green", location: { path: "src/model.ts", line: 155 } },
        { kind: "object-pack", label: "{ red, green }", location: { path: "src/model.ts", line: 169 } },
      ],
      roots: [
        { label: "props.candidate", kind: "prop-read", location: null },
        { label: "Math", kind: "literal", location: null },
        { label: "0.4122214708", kind: "literal", location: null },
        { label: "hex", kind: "parameter", location: null },
      ],
    } as unknown as FilePage["findingsById"][string];
    render(() => <CodeMap location={new URL(window.location.href)} data={{ ...data, findingsById: { F1: evidenceFinding } }} navigate={(href) => window.history.replaceState({}, "", href)} />);
    await fireEvent.click(screen.getByRole("button", { name: /derived title/i }));
    const representations = screen.getByRole("heading", { name: "Representation changes — 3 operations" }).closest("section")!;
    expect(representations.textContent).toContain("2local aliases1 file");
    expect(representations.textContent).toContain("1object packs1 file");
    expect(representations.textContent).not.toContain("redgreen");
    await fireEvent.click(screen.getByRole("button", { name: "Show 3 individual operations" }));
    expect(representations.textContent).toContain("red");
    const inputs = screen.getByRole("heading", { name: "Trace inputs — 1" }).closest("section")!;
    expect(inputs.textContent).toContain("props.candidate");
    expect(inputs.textContent).not.toContain("Math");
    expect(inputs.textContent).not.toContain("hex");
  });
  it("selects a traced expression independently from its attached finding", async () => {
    render(() => <CodeMap location={new URL(window.location.href)} data={data} navigate={(href) => window.history.replaceState({}, "", href)} />);
    const expressionButton = screen.getByRole("button", { name: "Inspect props" });
    await fireEvent.click(expressionButton);
    expect(screen.getByRole("navigation", { name: "Expression navigation" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Upstream path — 1 steps" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Downstream path — 1 steps" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Why this path is flagged" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Selected value" })).toBeTruthy();
    expect(window.location.search).toContain("expression=expression%3Asrc%2FCard.tsx%3A14%3A19");
  });
  it("uses the namespace binding instead of absolute compiler module paths", () => {
    const absoluteModule = "/Users/example/Projects/app/src/components/ui/switch";
    const namespaceIdentity = {
      ...tracedExpression,
      expression: "Switch",
      focusText: "Switch",
      symbolName: `"${absoluteModule}"`,
      typeText: `typeof import("${absoluteModule}")`,
    } as unknown as FilePage["expressionsById"][string];
    render(() => <IdentityEvidence identity={namespaceIdentity} currentPath="src/Card.tsx" jump={() => {}} />);
    const selectedValue = screen.getByRole("heading", { name: "Selected value" }).closest("section")!;
    expect(selectedValue.textContent).toContain("referenced symbolSwitch");
    expect(selectedValue.textContent).toContain("value typetypeof Switch");
    expect(selectedValue.textContent).not.toContain(absoluteModule);
    expect(screen.getAllByText("Switch", { selector: "code" }).some((element) => element.getAttribute("title") === `"${absoluteModule}"`)).toBe(true);
    expect(screen.getByText("typeof Switch").getAttribute("title")).toBe(`typeof import("${absoluteModule}")`);
  });
  it("collapses long symbol-use lists and expands them on request", async () => {
    const usages = Array.from({ length: 14 }, (_, index) => ({ path: `src/Consumer${index + 1}.tsx`, line: index + 1, column: 1 }));
    const busyIdentity = { ...tracedExpression, usages } as unknown as FilePage["expressionsById"][string];
    render(() => <IdentityEvidence identity={busyIdentity} currentPath="src/Card.tsx" jump={() => {}} />);

    const list = document.querySelector(".symbol-uses")!;
    const toggle = screen.getByRole("button", { name: "Show all 14 uses" });
    expect(list.classList.contains("expanded")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(list.querySelectorAll("li")).toHaveLength(14);

    await fireEvent.click(toggle);
    expect(list.classList.contains("expanded")).toBe(true);
    expect(screen.getByRole("button", { name: "Show fewer uses" }).getAttribute("aria-expanded")).toBe("true");
  });
  it("selects the referenced property token directly without an anonymous gutter marker", async () => {
    render(() => <CodeMap location={new URL(window.location.href)} data={data} navigate={(href) => window.history.replaceState({}, "", href)} />);
    const title = screen.getByRole("button", { name: "Inspect title" });
    expect(title.textContent).toBe("title");
    expect(title.getAttribute("title")).toBe("Inspect title · CaptureAnnotationInventoryResponse");
    expect(document.querySelectorAll(".hit-expression")).toHaveLength(0);
    await fireEvent.click(title);
    expect(document.querySelector("[data-line='2']")?.classList.contains("jump-target")).toBe(false);
    expect(screen.getByRole("button", { name: "Inspect title" }).classList.contains("active")).toBe(true);
    const selectedValue = screen.getByRole("heading", { name: "Selected value" }).closest("section")!;
    expect(selectedValue.textContent).toContain("props.title");
    expect(selectedValue.textContent).toContain("value typeCaptureAnnotationInventoryResponse");
    expect(screen.getByRole("link", { name: "captures.ts:25" }).getAttribute("href")).toBe("/file?path=src%2Fcaptures.ts#L25");
    expect(selectedValue.textContent).toContain("referenced symboltitle");
    const basis = screen.getByRole("heading", { name: "Why this path is flagged" }).closest("section")!;
    expect(basis.textContent).toContain("not independently classified as suspicious");
    expect(basis.textContent).toContain("path depth 0.700");
    await fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)?.[0] ?? "";
    expect(JSON.parse(copied)).toMatchObject({ kind: "expression", selection: { expression: "props.title", symbol: "title" }, attachedFindings: [{ id: "F1" }] });
    await fireEvent.click(screen.getAllByRole("link", { name: "line 1" })[0]!);
    expect(document.querySelector("[data-line='1']")?.classList.contains("jump-target")).toBe(true);
    expect(document.querySelector("[data-line='2']")?.classList.contains("jump-target")).toBe(false);
    expect(screen.getByRole("button", { name: "Inspect title" }).classList.contains("active")).toBe(true);
  });
  it("switches from a selected finding to a value linked inside that finding", async () => {
    const [location, setLocation] = createSignal(new URL(window.location.href));
    const navigate = (href: string) => { window.history.replaceState({}, "", href); setLocation(new URL(window.location.href)); };
    render(() => <CodeMap location={location()} data={data} requestedId={location().searchParams.get("expression") ?? location().searchParams.get("finding")} navigate={navigate} />);
    await fireEvent.click(screen.getByRole("button", { name: /derived title/i }));
    expect(screen.getByRole("heading", { name: /F1/ })).toBeTruthy();
    await fireEvent.click(screen.getByRole("link", { name: "title" }));
    expect(screen.getByRole("heading", { name: "Selected value" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /F1/ })).toBeNull();
    expect(window.location.search).toContain("expression=expression%3Asrc%2FCard.tsx%3A21%3A32");
  });
  it("renders semantic details for every non-finding inventory kind", async () => {
    render(() => <CodeMap location={new URL(window.location.href)} data={data} navigate={(href) => window.history.replaceState({}, "", href)} />);

    await fireEvent.click(document.querySelector<HTMLElement>("[data-entry-id='fan']")!);
    expect(screen.getByText(/feeds 8 rendered sinks across 2 files/)).toBeTruthy();
    expect(document.querySelector(".entry-overview pre")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: /List/ }));

    await fireEvent.click(document.querySelector<HTMLElement>("[data-entry-id='boundary']")!);
    expect(screen.getByText(/receives 3 inbound sources from 2 callers/)).toBeTruthy();
    expect(screen.getByText("local boundary")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /List/ }));

    await fireEvent.click(document.querySelector<HTMLElement>("[data-entry-id='fork']")!);
    expect(screen.getByText(/controls 2 branch sites/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "line 12" })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /List/ }));

    await fireEvent.click(document.querySelector<HTMLElement>("[data-entry-id='relay']")!);
    expect(screen.getByText(/relays 2 props/)).toBeTruthy();
    expect(screen.getByText("useTheme")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /List/ }));

    await fireEvent.click(document.querySelector<HTMLElement>("[data-entry-id='unknown']")!);
    expect(screen.getByText(/could not resolve/)).toBeTruthy();
    expect(screen.getByText(/Confirm the binding/)).toBeTruthy();
    expect(document.querySelector(".entry-overview pre")).toBeNull();
  });

  it("labels and links a definition in another file", () => {
    const identity = {
      ...finding.identity,
      definition: { path: "src/create-view-model.ts", line: 235, column: 17 },
    };
    render(() => <IdentityEvidence identity={identity} currentPath="src/Page.tsx" jump={() => undefined} />);

    const definition = screen.getByRole("link", { name: "create-view-model.ts:235" });
    expect(definition.getAttribute("title")).toBe("src/create-view-model.ts");
    expect(definition.getAttribute("href")).toBe("/file?path=src%2Fcreate-view-model.ts#L235");
  });

  it("updates the definition link when selection changes between resolved symbols", async () => {
    const local = { ...finding.identity, definition: { path: "src/Page.tsx", line: 68, column: 5 } };
    const imported = { ...finding.identity, definition: { path: "src/create-view-model.ts", line: 235, column: 17 } };
    const [identity, setIdentity] = createSignal(local);
    render(() => <>
      <button type="button" onClick={() => setIdentity(imported)}>Select imported function</button>
      <IdentityEvidence identity={identity()} currentPath="src/Page.tsx" jump={() => undefined} />
    </>);

    expect(screen.getByRole("link", { name: "line 68" })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Select imported function" }));
    expect(screen.queryByRole("link", { name: "line 68" })).toBeNull();
    expect(screen.getByRole("link", { name: "create-view-model.ts:235" }).getAttribute("href"))
      .toBe("/file?path=src%2Fcreate-view-model.ts#L235");
  });
});
