import { For, Show, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";
import type { Workspace } from "../../../api/contracts";
import { ComponentStructureInspector } from "./ComponentStructureInspector";

type ComponentMap = Workspace["semanticMap"]["components"];
type ComponentNode = ComponentMap["nodes"][number];
type PositionedNode = ComponentNode & { depth: number; x: number; y: number };
type Viewport = { x: number; y: number; width: number; height: number };

const NODE_WIDTH = 238;
const NODE_HEIGHT = 48;
const COLUMN_GAP = 72;
const ROW_GAP = 10;
const PADDING = 24;
const MIN_VIEW_WIDTH = 520;
const MAX_LEVEL_SUBCOLUMNS = 3;
const TARGET_ROWS_PER_SUBCOLUMN = 18;
const WHEEL_ZOOM_OUT = 1.0735;
const WHEEL_ZOOM_IN = 0.9363;

export function ComponentStructureMap(props: { components: ComponentMap; active?: boolean }) {
  const graph = createMemo(() => layoutComponentGraph(props.components));
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [isolationTargetId, setIsolationTargetId] = createSignal<string | null>(null);
  const [viewport, setViewport] = createSignal<Viewport>(untrack(() => graph().bounds));
  const [drag, setDrag] = createSignal<{ x: number; y: number; viewport: Viewport } | null>(null);
  const [suppressClick, setSuppressClick] = createSignal(false);
  const familyIds = createMemo(() => {
    const target = isolationTargetId(); if (!target) return new Set<string>();
    return new Set([target, ...props.components.edges.filter((edge) => edge.from === target || edge.to === target).flatMap((edge) => [edge.from, edge.to])]);
  });
  const isolatedGraph = createMemo(() => {
    const ids = familyIds();
    return layoutComponentGraph({ nodes: props.components.nodes.filter((node) => ids.has(node.id)), edges: props.components.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)), totals: { nodes: ids.size, edges: 0 } });
  });
  const activeGraph = createMemo(() => isolationTargetId() ? isolatedGraph() : graph());
  const activePositions = createMemo(() => new Map(activeGraph().nodes.map((node) => [node.id, node])));
  const byId = createMemo(() => new Map(graph().nodes.map((node) => [node.id, node])));
  const selected = createMemo(() => byId().get(selectedId() ?? "") ?? null);
  const callers = createMemo(() => props.components.edges.filter((edge) => edge.to === selectedId()).map((edge) => byId().get(edge.from)).filter((node): node is PositionedNode => Boolean(node)));
  const children = createMemo(() => props.components.edges.filter((edge) => edge.from === selectedId()).map((edge) => byId().get(edge.to)).filter((node): node is PositionedNode => Boolean(node)));
  const edges = createMemo(() => {
    const retained = props.components.edges.filter((edge) => byId().has(edge.from) && byId().has(edge.to));
    if (isolationTargetId()) return retained.filter((edge) => familyIds().has(edge.from) && familyIds().has(edge.to));
    return selectedId() ? retained.filter((edge) => edge.from === selectedId() || edge.to === selectedId()) : retained;
  });
  const connected = createMemo(() => new Set(edges().flatMap((edge) => [edge.from, edge.to])));
  const zoom = (factor: number, centerX = viewport().x + viewport().width / 2, centerY = viewport().y + viewport().height / 2) => {
    const current = viewport();
    const width = clamp(current.width * factor, Math.min(MIN_VIEW_WIDTH, activeGraph().bounds.width), activeGraph().bounds.width);
    const height = width * current.height / current.width;
    const xRatio = (centerX - current.x) / current.width;
    const yRatio = (centerY - current.y) / current.height;
    setViewport(constrainViewport({ x: centerX - width * xRatio, y: centerY - height * yRatio, width, height }, activeGraph().bounds));
  };
  const reset = () => setViewport(activeGraph().bounds);
  const toggleIsolate = () => {
    const selected = selectedId();
    if (!selected) {
      if (!isolationTargetId()) return;
      setIsolationTargetId(null);
      reset();
      return;
    }
    setIsolationTargetId((target) => target === selected ? null : selected);
    reset();
  };
  const selectNode = (id: string) => {
    if (selectedId() === id) { setSelectedId(null); return; }
    setSelectedId(id);
  };
  onMount(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!props.active || event.key.toLowerCase() !== "i" || (target instanceof Element && target.matches("input, textarea, select, [contenteditable=true]"))) return;
      event.preventDefault(); toggleIsolate();
    };
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  });
  return <div class="component-structure-shell">
    <div class="component-map-canvas">
      <div class="component-map-toolbar" aria-label="Component map navigation"><button type="button" aria-label="Zoom out" onClick={() => zoom(1.25)}>−</button><button type="button" aria-label="Zoom in" onClick={() => zoom(.8)}>+</button><button type="button" onClick={reset}>Fit</button><button type="button" disabled={!selectedId()} aria-pressed={Boolean(selectedId()) && isolationTargetId() === selectedId()} title="Isolate selected component and its direct family (I)" onClick={toggleIsolate}>{isolationTargetId() === selectedId() ? "Unisolate" : "Isolate"} <kbd>I</kbd></button></div>
      <div class="component-map-legend" aria-label="Component map legend"><span><i class="component-legend-arrow" aria-hidden="true" />Parent renders child</span><span><i class="component-legend-shared" aria-hidden="true" />Shared by 4+ components</span></div>
      <svg class="world-graph component-structure-graph" viewBox={`${viewport().x} ${viewport().y} ${viewport().width} ${viewport().height}`} role="img" aria-label="Component render hierarchy"
      on:wheel={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const current = viewport(); zoom(event.deltaY > 0 ? WHEEL_ZOOM_OUT : WHEEL_ZOOM_IN, current.x + (event.clientX - rect.left) / rect.width * current.width, current.y + (event.clientY - rect.top) / rect.height * current.height); }}
      on:pointerdown={(event) => { if (event.button !== 0) return; setSuppressClick(false); setDrag({ x: event.clientX, y: event.clientY, viewport: viewport() }); }}
      on:pointermove={(event) => { const start = drag(); if (!start) return; if (!gestureMoved(start, event)) return; event.currentTarget.setPointerCapture?.(event.pointerId); setSuppressClick(true); const rect = event.currentTarget.getBoundingClientRect(); if (!rect.width || !rect.height) return; setViewport(constrainViewport({ ...start.viewport, x: start.viewport.x - (event.clientX - start.x) / rect.width * start.viewport.width, y: start.viewport.y - (event.clientY - start.y) / rect.height * start.viewport.height }, activeGraph().bounds)); }}
      on:pointerup={(event) => { const start = drag(); if (start && gestureMoved(start, event)) setSuppressClick(true); setDrag(null); }} on:pointercancel={() => { setDrag(null); setSuppressClick(false); }} on:click={() => { if (!suppressClick()) setSelectedId(null); setSuppressClick(false); }}>
      <defs><marker id="component-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker></defs>
      <rect class="world-graph-hit-area" width={activeGraph().bounds.width} height={activeGraph().bounds.height} />
      <g class="component-depth-labels" aria-hidden="true"><For each={activeGraph().columns}>{(column) => <text x={column.x} y="18">{column.depth === 0 ? "ROOTS / ROUTE SHELLS" : `LEVEL ${column.depth}`}</text>}</For></g>
      <g class="world-graph-edges"><For each={edges()}>{(edge) => <Show when={byId().get(edge.from) && byId().get(edge.to)}><path d={edgePath(activePositions().get(edge.from) ?? byId().get(edge.from)!, activePositions().get(edge.to) ?? byId().get(edge.to)!)}><title>{edge.useCount} render site{edge.useCount === 1 ? "" : "s"}</title></path></Show>}</For></g>
      <g class="world-graph-nodes"><For each={graph().nodes}>{(node) => { const position = () => activePositions().get(node.id) ?? node; return <g class={`component-node component-${node.role}`} classList={{ selected: selectedId() === node.id, dimmed: !isolationTargetId() && Boolean(selectedId()) && !connected().has(node.id) && selectedId() !== node.id, isolatedOut: Boolean(isolationTargetId()) && !familyIds().has(node.id) }} data-node-id={node.id} role="button" tabindex={isolationTargetId() && !familyIds().has(node.id) ? -1 : 0} aria-label={`${node.name}, level ${position().depth}, rendered by ${node.incomingCount}, renders ${node.outgoingCount}`} transform={`translate(${position().x} ${position().y})`} on:click={(event) => { event.stopPropagation(); if (!suppressClick()) selectNode(node.id); setSuppressClick(false); }} on:keydown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); selectNode(node.id); }}>
        <title>{node.path}:{node.line}</title>
        <rect class="component-node-surface" width={NODE_WIDTH} height={NODE_HEIGHT} rx="5" />
        <text class="component-node-label" x="10" y="20">{trim(node.name, 28)}</text>
        <text class="component-node-metric" x="10" y="36">{node.incomingCount} callers · {node.outgoingCount} children · {node.useCount} uses</text>
      </g>; }}</For></g>
      </svg>
    </div>
    <ComponentStructureInspector selected={selected()} callers={callers()} children={children()} onSelect={selectNode} />
  </div>;
}

export function layoutComponentGraph(components: ComponentMap) {
  const nodeById = new Map(components.nodes.map((node) => [node.id, node]));
  const incoming = new Map(components.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of components.edges) if (nodeById.has(edge.from) && nodeById.has(edge.to)) incoming.get(edge.to)!.push(edge.from);
  const depths = new Map<string, number>();
  const depthOf = (id: string, visiting = new Set<string>()): number => {
    const cached = depths.get(id); if (cached != null) return cached;
    if (visiting.has(id)) return 0;
    const next = new Set(visiting); next.add(id);
    const parents = incoming.get(id) ?? [];
    const depth = parents.length ? Math.max(...parents.map((parent) => depthOf(parent, next) + 1)) : 0;
    depths.set(id, depth); return depth;
  };
  for (const node of components.nodes) depthOf(node.id);
  const maxDepth = Math.max(0, ...depths.values());
  let nextX = PADDING;
  const columns = Array.from({ length: maxDepth + 1 }, (_, depth) => {
    const count = components.nodes.filter((node) => depths.get(node.id) === depth).length;
    const span = Math.min(MAX_LEVEL_SUBCOLUMNS, Math.max(1, Math.ceil(count / TARGET_ROWS_PER_SUBCOLUMN)));
    const column = { depth, x: nextX, span };
    nextX += span * NODE_WIDTH + span * COLUMN_GAP;
    return column;
  });
  const nodes = columns.flatMap((column) => {
    const levelNodes = components.nodes.filter((node) => depths.get(node.id) === column.depth).sort(nodeSort);
    const rows = Math.max(1, Math.ceil(levelNodes.length / column.span));
    return levelNodes.map((node, index) => ({ ...node, depth: column.depth, x: column.x + Math.floor(index / rows) * (NODE_WIDTH + COLUMN_GAP), y: 34 + (index % rows) * (NODE_HEIGHT + ROW_GAP) }));
  });
  const largestColumn = Math.max(1, ...columns.map((column) => Math.ceil(nodes.filter((node) => node.depth === column.depth).length / column.span)));
  return { nodes, columns, depthCount: columns.length, bounds: { x: 0, y: 0, width: Math.max(1120, nextX - COLUMN_GAP + PADDING), height: Math.max(620, 46 + largestColumn * (NODE_HEIGHT + ROW_GAP)) } };
}

function edgePath(from: PositionedNode, to: PositionedNode) { const x1 = from.x + NODE_WIDTH; const y1 = from.y + NODE_HEIGHT / 2; const x2 = to.x; const y2 = to.y + NODE_HEIGHT / 2; const bend = Math.max(30, Math.abs(x2 - x1) * .4); return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`; }
export function constrainViewport(view: Viewport, bounds: Viewport) { const overpanX = view.width * .5; const overpanY = view.height * .5; return { ...view, x: clamp(view.x, bounds.x - overpanX, bounds.x + bounds.width - view.width + overpanX), y: clamp(view.y, bounds.y - overpanY, bounds.y + bounds.height - view.height + overpanY) }; }
export function gestureMoved(start: { x: number; y: number }, end: { clientX: number; clientY: number }) { return Math.abs(end.clientX - start.x) + Math.abs(end.clientY - start.y) > 3; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function nodeSort(a: ComponentNode, b: ComponentNode) { return b.outgoingCount - a.outgoingCount || b.incomingCount - a.incomingCount || lexical(a.name, b.name); }
function lexical(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function trim(value: string, max: number) { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }
