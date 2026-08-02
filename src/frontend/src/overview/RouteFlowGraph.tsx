import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import type { RouteDataDetail } from "../../../api/contracts";
import { ComponentTopologyGraph } from "./ComponentTopologyGraph";
import { layoutRouteFlowGraph } from "./route-flow-graph-model";
import { projectSourceGraph, projectTrajectoryGraph, rankComplexTrajectories } from "./route-flow-path-model";
import type { GenericUiMode } from "./trajectory-url-state";

export function RouteFlowGraph(props: { detail: RouteDataDetail; sourceKey: string | null; genericUiMode: GenericUiMode | null; revealResetKey: string; onSource: (key: string | null) => void; onGenericUiMode: (mode: GenericUiMode) => void; onOpenEvidence: () => void; onOpenSource: (id: string) => void }) {
  const [mode, setMode] = createSignal<"topology" | "paths">("topology");
  return <div class="route-flow-mode-shell">
    <Show when={mode() === "topology"} fallback={<DetailedRouteFlowGraph detail={props.detail} sourceKey={props.sourceKey} onOpenEvidence={props.onOpenEvidence} onOpenSource={props.onOpenSource} onShowTopology={() => setMode("topology")} />}>
      <ComponentTopologyGraph detail={props.detail} sourceKey={props.sourceKey} genericUiMode={props.genericUiMode} revealResetKey={props.revealResetKey} onSource={props.onSource} onGenericUiMode={props.onGenericUiMode} onShowPaths={() => setMode("paths")} />
    </Show>
  </div>;
}

function DetailedRouteFlowGraph(props: { detail: RouteDataDetail; sourceKey: string | null; onOpenEvidence: () => void; onOpenSource: (id: string) => void; onShowTopology: () => void }) {
  const source = createMemo(() => props.detail.sources.find((item) => item.key === props.sourceKey) ?? null);
  const exactSourcePathCount = createMemo(() => props.detail.exhaustiveGraph.trajectories.filter((trajectory) => source() && trajectory.sourceMethodKeys.includes(source()!.key)).length);
  const graph = createMemo(() => projectSourceGraph(props.detail.exhaustiveGraph, source()?.key ?? null));
  const sourceMatchMode = createMemo(() => exactSourcePathCount() ? "exact" as const : "unavailable" as const);
  const [selectedNode, setSelectedNode] = createSignal<string | null>(null);
  const [selectedTrajectory, setSelectedTrajectory] = createSignal<string | null>(null);
  const [hoveredNode, setHoveredNode] = createSignal<string | null>(null);
  const displayedGraph = createMemo(() => projectTrajectoryGraph(graph(), selectedTrajectory()));
  const layout = createMemo(() => layoutRouteFlowGraph(displayedGraph(), Boolean(selectedTrajectory())));
  const complexTrajectories = createMemo(() => rankComplexTrajectories(graph().trajectories));
  const focusedTrajectory = createMemo(() => graph().trajectories.find((item) => item.key === selectedTrajectory()) ?? null);
  const selectedNodeDetail = createMemo(() => graph().nodes.find((item) => item.key === selectedNode()) ?? null);
  const selectedEvidence = createMemo(() => {
    const node = selectedNodeDetail();
    return node ? only(props.detail.evidence.filter((item) => item.file === node.file && item.line === node.line && item.column === node.column)) : null;
  });
  const selectedOperation = createMemo(() => {
    const evidence = selectedEvidence();
    return evidence ? only(props.detail.operations.filter((item) => item.sourceExpressionIds.includes(evidence.id))) : null;
  });
  const routeEntry = createMemo(() => {
    const node = props.detail.context.nodes.find((item) => item.kind === "component" && item.role === "route");
    return { label: node?.label ?? props.detail.route.componentNames[0] ?? "Route module", file: node?.file ?? props.detail.route.file };
  });
  const traceStartComponent = createMemo(() => focusedTrajectory()?.stepComponents[0] ?? null);
  const hoverDetail = createMemo(() => layout().nodes.find((node) => node.key === hoveredNode()) ?? null);
  const activeSteps = createMemo(() => {
    const node = selectedNode(); if (!node) return null;
    return new Set(graph().trajectories.filter((item) => item.stepKeys.includes(node)).flatMap((item) => item.stepKeys));
  });
  let viewport: HTMLDivElement | undefined;
  const resetViewport = () => queueMicrotask(() => viewport?.scrollTo?.({ left: 0, top: 0 }));
  const clear = () => { setSelectedNode(null); setSelectedTrajectory(null); resetViewport(); };
  const resetForSource = (_sourceKey: string | null) => clear();
  const selectTrajectory = (key: string) => {
    setSelectedNode(null);
    setHoveredNode(null);
    setSelectedTrajectory((current) => current === key ? null : key);
    resetViewport();
  };
  createEffect(() => resetForSource(source()?.key ?? null));
  return <section class="route-flow-graph" aria-label="Exhaustive route flow graph">
    <header class="route-flow-toolbar">
      <div class="route-flow-mode-toolbar" role="group" aria-label="Route flow view"><button type="button" aria-pressed="false" onClick={() => props.onShowTopology()}>Topology</button><button type="button" aria-pressed="true">Detailed paths</button></div>
      <div><strong><code>{source()?.typeName ?? source()?.typeText ?? "All route data"}</code> · {graph().totals.trajectories.toLocaleString()} paths</strong><span>{graph().totals.components.toLocaleString()} components · {graph().totals.sinks.toLocaleString()} sinks · {graph().totals.nodes.toLocaleString()} nodes</span></div>
      <Show when={sourceMatchMode() === "unavailable"}><span class="route-flow-warning">No proven source path</span></Show><Show when={focusedTrajectory()}>{(trajectory) => <span class="route-flow-focus">Focused · {trajectory().stepKeys.length} nodes</span>}</Show><Show when={graph().totals.unknownTrajectories}><span class="route-flow-warning">{graph().totals.unknownTrajectories.toLocaleString()} incomplete</span></Show><Show when={graph().truncated}><span class="route-flow-warning">Limit {graph().pathBudget.toLocaleString()}</span></Show><button type="button" onClick={clear}>Show all</button><button type="button" onClick={() => props.onOpenEvidence()}>Evidence</button>
    </header>
    <div class="route-flow-body">
      <div class="route-flow-viewport" ref={viewport}>
        <svg class="route-flow-svg" width={layout().width} height={layout().height} viewBox={`0 0 ${layout().width} ${layout().height}`} role="img" aria-label={`${graph().totals.trajectories} retained data-flow paths`}>
          <g class="route-flow-components"><For each={layout().components}>{(component) => {
            const marker = () => {
              const isRouteEntry = component.label === routeEntry().label;
              const isTraceStart = component.label === traceStartComponent();
              return isRouteEntry && isTraceStart ? "ROUTE ENTRY · TRACE START" : isRouteEntry ? "ROUTE ENTRY" : isTraceStart ? "TRACE START" : null;
            };
            return <g classList={{ shared: component.label.startsWith("Shared across"), unowned: component.label === "Unowned / external" }}><rect x={component.x} y={component.y} width={component.width} height={component.height} rx="7" /><text x={component.x + 10} y={component.y + 20}>{component.label}</text><text class="route-flow-component-meta" x={component.x + 10 + Math.min(220, component.label.length * 7.5)} y={component.y + 20}>{component.nodeCount.toLocaleString()} nodes · up to {component.pathCount.toLocaleString()} paths</text><Show when={marker()}>{(label) => <text class="route-flow-component-marker" x={component.x + component.width - 10} y={component.y + 20}>{label()}</text>}</Show></g>;
          }}</For></g>
          <g class="route-flow-edges"><For each={layout().edges}>{(edge) => { const active = () => !activeSteps() || activeSteps()!.has(edge.from) && activeSteps()!.has(edge.to); return <path classList={{ unknown: edge.unknown, dimmed: !active(), "component-prop": edge.kind === "component-prop" }} d={edgePath(edge.fromNode, edge.toNode, Boolean(selectedTrajectory()))} stroke-width={Math.min(6, 1 + Math.log2(edge.pathCount + 1))}><title>{edge.kind} · {edge.pathCount} paths</title></path>; }}</For></g>
          <g class="route-flow-nodes"><For each={layout().nodes}>{(node) => { const active = () => !activeSteps() || activeSteps()!.has(node.key); const selected = () => selectedNode() === node.key; return <g class={`route-flow-node kind-${kindClass(node.kind)}`} classList={{ dimmed: !active(), selected: selected() }} transform={`translate(${node.x} ${node.y})`} role="button" tabindex="0" onPointerEnter={() => setHoveredNode(node.key)} onPointerLeave={() => setHoveredNode((value) => value === node.key ? null : value)} onFocus={() => setHoveredNode(node.key)} onBlur={() => setHoveredNode((value) => value === node.key ? null : value)} onClick={() => setSelectedNode(selected() ? null : node.key)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedNode(selected() ? null : node.key); } }}><rect width={node.width} height={node.height} rx="4" /><text x="7" y="16">{clip(node.label, 18)}</text><text class="route-flow-node-count" x={node.width - 6} y="16">{node.pathCount}</text></g>; }}</For></g>
          <Show when={hoverDetail()}>{(node) => <g class="route-flow-node-popover" transform={`translate(${Math.min(node().x, layout().width - 444)} ${node().y + node().height + 4})`}><rect width="440" height="84" rx="6" /><text x="10" y="17">{clip(node().label, 62)}</text><text class="route-flow-popover-meta" x="10" y="34">{location(node())} · {node().kind} · {node().pathCount.toLocaleString()} paths</text><text class="route-flow-popover-meta" x="10" y="50">{clip(componentContext(node()), 68)}</text><text class="route-flow-popover-code" x="10" y="70">{clip(node().snippet ?? node().label, 72)}</text></g>}</Show>
        </svg>
        <Show when={!graph().trajectories.length}><div class="route-flow-empty"><strong>No path was joined to this source</strong><p>The typed source is real, but the current static graph did not retain a source-location handoff into a rendered sink.</p></div></Show>
      </div>
      <aside class="route-flow-inspector" aria-label="Selected data flow inspector">
        <Show when={selectedNodeDetail()} fallback={<SourceOverview source={source()} pathCount={graph().totals.trajectories} matchMode={sourceMatchMode()} onOpenSource={props.onOpenSource} />}>{(node) => <>
          <header><span class={`trajectory-effect effect-${kindClass(node().kind)}`}>{node().kind}</span><h2>{node().label}</h2><p>{node().component}</p></header>
          <section><h3>Overview</h3><dl><div><dt>Paths</dt><dd>{node().pathCount.toLocaleString()}</dd></div><div><dt>Location</dt><dd><code>{location(node())}</code></dd></div><div><dt>Field provenance</dt><dd>Not established for this path node</dd></div></dl></section>
          <Show when={node().snippet}><section><h3>Expression</h3><code class="route-flow-inspector-code">{node().snippet}</code></section></Show>
          <Show when={selectedEvidence()}>{(evidence) => <section><h3>Compiler evidence</h3><div class="route-flow-type-pair"><span>Input</span><code>{evidence().inputType}</code><span>Output</span><code>{evidence().outputType}</code></div><p>{evidence().confidence} confidence{evidence().unknownReason ? ` · ${evidence().unknownReason}` : ""}</p><button type="button" onClick={() => props.onOpenSource(evidence().id)}>Open source</button></section>}</Show>
          <Show when={selectedOperation()}>{(operation) => <section><h3>Field change</h3><For each={operation().fieldEffects}>{(effect) => <div class="route-flow-field-effect"><b>{effect.kind}</b><code>{effect.field ?? "shape"}</code><span>{effect.detail}</span></div>}</For></section>}</Show>
        </>}</Show>
        <section class="route-flow-inspector-paths"><h3>All source paths</h3><p>Longest paths first. Selecting one focuses the graph without changing its layout model.</p><For each={complexTrajectories()}>{(trajectory, index) => <button type="button" classList={{ selected: selectedTrajectory() === trajectory.key }} aria-pressed={selectedTrajectory() === trajectory.key} onClick={() => selectTrajectory(trajectory.key)}><b>{index() + 1}</b><span><strong>{trajectory.terminalLabel}</strong><small>{trajectory.stepKeys.length} nodes · {trajectory.substitutionStepCount} transforms · {trajectory.completeness === "partial" ? "incomplete" : "traced"}</small></span></button>}</For></section>
      </aside>
    </div>
  </section>;
}

function SourceOverview(props: { source: RouteDataDetail["sources"][number] | null; pathCount: number; matchMode: "exact" | "unavailable"; onOpenSource: (id: string) => void }) {
  return <Show when={props.source} fallback={<div class="inspector-empty"><span class="micro-label">Tracked data</span><strong>No typed source</strong><p>This route has no supported persistence read available for selection.</p></div>}>{(source) => <>
    <header><span class={`trajectory-effect source-${source().kind}`}>{source().kind}</span><h2 class="mono">{source().typeName ?? source().typeText}</h2><p>{source().label}</p></header>
    <section><h3>Tracked TypeScript value</h3><code class="route-flow-inspector-code">{source().typeText}</code><dl><div><dt>Shape</dt><dd>{source().shapeKind}</dd></div><div><dt>Fields</dt><dd>{source().totalFields}</dd></div><div><dt>Paths</dt><dd>{props.pathCount.toLocaleString()}</dd></div></dl><Show when={props.matchMode === "unavailable"}><p class="route-flow-match-note">This read is consumed on the route, but the static graph did not prove its handoff into a rendered sink.</p></Show></section>
    <section><h3>Source shape fields</h3><table><thead><tr><th>Field</th><th>Type</th></tr></thead><tbody><For each={source().fields}>{(field) => <tr><td><code>{field.key}{field.optional ? "?" : ""}</code></td><td><code>{field.typeText}</code></td></tr>}</For></tbody></table><Show when={!source().fields.length}><p>No named object fields were available from the compiler type.</p></Show></section>
    <section><h3>Origin</h3><code>{source().file}:{source().line}</code><button type="button" onClick={() => props.onOpenSource(source().evidenceId)}>Open source</button></section>
  </>}</Show>;
}
function kindClass(kind: string) { return /unknown|opaque/i.test(kind) ? "unknown" : /jsx|sink|terminal/i.test(kind) ? "terminal" : /source|root|literal|parameter/i.test(kind) ? "source" : /call|helper|boundary|resource|context/i.test(kind) ? "boundary" : "operation"; }
function clip(value: string, limit: number) { return value.length > limit ? `${value.slice(0, limit - 1)}…` : value; }
function location(node: RouteDataDetail["exhaustiveGraph"]["nodes"][number]) { const file = node.file?.split("/").at(-1) ?? node.kind; return `${file}${node.line ? `:${node.line}${node.column ? `:${node.column}` : ""}` : ""}`; }
function componentContext(node: RouteDataDetail["exhaustiveGraph"]["nodes"][number]) { return node.components.length > 1 ? `${node.component} · ${node.components.length} path components total` : node.component; }
function only<T>(items: T[]) { return items.length === 1 ? items[0] : null; }
function edgePath(from: { x: number; y: number; width: number; height: number }, to: { x: number; y: number; width: number; height: number }, focused: boolean) {
  if (!focused) {
    const startX = from.x + from.width; const startY = from.y + from.height / 2; const endX = to.x; const endY = to.y + to.height / 2;
    const middle = Math.max(20, Math.abs(endX - startX) / 2);
    return `M ${startX} ${startY} C ${startX + middle} ${startY}, ${endX - middle} ${endY}, ${endX} ${endY}`;
  }
  if (from.y === to.y) {
    const forward = to.x > from.x;
    const startX = forward ? from.x + from.width : from.x;
    const endX = forward ? to.x : to.x + to.width;
    const startY = from.y + from.height / 2;
    const endY = to.y + to.height / 2;
    const middle = Math.max(20, Math.abs(endX - startX) / 2);
    return `M ${startX} ${startY} C ${startX + (forward ? middle : -middle)} ${startY}, ${endX + (forward ? -middle : middle)} ${endY}, ${endX} ${endY}`;
  }
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height;
  const endX = to.x + to.width / 2;
  const endY = to.y;
  const middle = Math.max(18, Math.abs(endY - startY) / 2);
  return `M ${startX} ${startY} C ${startX} ${startY + middle}, ${endX} ${endY - middle}, ${endX} ${endY}`;
}
