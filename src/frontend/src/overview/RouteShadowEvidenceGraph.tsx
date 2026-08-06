import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import type { RouteShadowEvidence } from "../../../api/contracts";
import { RouteShadowEvidenceInspector } from "./RouteShadowEvidenceInspector";
import {
  clipShadowLabel,
  layoutShadowEvidence,
  shadowEdgeLabel,
  shadowEdgePath,
  shadowGapPath,
  shadowGapReasonLabel,
  shadowNodeKindLabel,
  shadowProofLocationLabel,
  type ShadowGraphNode,
  type ShadowSelection,
} from "./route-shadow-evidence-model";

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 680;
const MIN_SCALE = 0.55;
const MAX_SCALE = 2.4;
const DEFAULT_CAMERA = { x: 0, y: 0, scale: 1 };

type Camera = typeof DEFAULT_CAMERA;
type PanState = { pointerId: number; startClientX: number; startClientY: number; camera: Camera; moved: boolean };

export function RouteShadowEvidenceGraph(props: { evidence: RouteShadowEvidence | null }) {
  const layout = createMemo(() => layoutShadowEvidence(props.evidence));
  const [selection, setSelection] = createSignal<ShadowSelection>(null);
  const [camera, setCamera] = createSignal<Camera>(DEFAULT_CAMERA);
  const [pan, setPan] = createSignal<PanState | null>(null);
  let svg!: SVGSVGElement;
  let previousEvidenceIdentity: string | undefined;
  createEffect(() => {
    const evidenceIdentity = `${props.evidence?.route.key ?? "none"}:${props.evidence?.status ?? "none"}`;
    if (evidenceIdentity === previousEvidenceIdentity) return;
    previousEvidenceIdentity = evidenceIdentity;
    setSelection(null);
    setCamera(DEFAULT_CAMERA);
    setPan(null);
  });
  const select = (next: ShadowSelection) => {
    if (!next) {
      setSelection(null);
      return;
    }
    setSelection((current) => current?.kind === next.kind && current.id === next.id ? null : next);
  };
  const zoomAt = (nextScale: number, anchor = { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 }) => {
    const current = camera();
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const worldX = (anchor.x - current.x) / current.scale;
    const worldY = (anchor.y - current.y) / current.scale;
    setCamera({ x: anchor.x - worldX * scale, y: anchor.y - worldY * scale, scale });
  };
  const viewPoint = (event: PointerEvent | WheelEvent) => {
    const bounds = svg.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width * VIEW_WIDTH,
      y: (event.clientY - bounds.top) / bounds.height * VIEW_HEIGHT,
    };
  };
  const startPan = (event: PointerEvent) => {
    if (event.button !== 0) return;
    svg.setPointerCapture?.(event.pointerId);
    setPan({ pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, camera: camera(), moved: false });
  };
  const movePan = (event: PointerEvent) => {
    const active = pan();
    if (!active || active.pointerId !== event.pointerId) return;
    const bounds = svg.getBoundingClientRect();
    const dx = (event.clientX - active.startClientX) / bounds.width * VIEW_WIDTH;
    const dy = (event.clientY - active.startClientY) / bounds.height * VIEW_HEIGHT;
    const moved = active.moved || Math.hypot(event.clientX - active.startClientX, event.clientY - active.startClientY) > 4;
    if (!moved) return;
    setPan({ ...active, moved });
    setCamera({ ...active.camera, x: active.camera.x + dx, y: active.camera.y + dy });
  };
  const finishPan = (event: PointerEvent) => {
    const active = pan();
    if (!active || active.pointerId !== event.pointerId) return;
    if (!active.moved) select(null);
    setPan(null);
  };
  const zoomFromWheel = (event: WheelEvent) => {
    event.preventDefault();
    zoomAt(camera().scale * (event.deltaY < 0 ? 1.1 : 0.9), viewPoint(event));
  };
  return <section class="route-shadow-graph" aria-label="Experimental route proof graph">
    <header class="route-shadow-toolbar"><div><strong>Experimental proof graph</strong><span>{graphSummary(props.evidence)}</span></div><div class="route-shadow-camera" role="group" aria-label="Proof graph camera"><button type="button" aria-label="Zoom out proof graph" onClick={() => zoomAt(camera().scale - 0.1)}>−</button><button type="button" aria-label="Reset proof graph zoom" onClick={() => setCamera(DEFAULT_CAMERA)}>{Math.round(camera().scale * 100)}%</button><button type="button" aria-label="Zoom in proof graph" onClick={() => zoomAt(camera().scale + 0.1)}>+</button><button type="button" onClick={() => setCamera(DEFAULT_CAMERA)}>Reset</button></div></header>
    <div class="route-shadow-body"><div class="route-shadow-viewport"><svg ref={svg} classList={{ dragging: Boolean(pan()?.moved) }} class="route-shadow-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} role="img" aria-label="Proven route shadow evidence graph" onPointerDown={startPan} onPointerMove={movePan} onPointerUp={finishPan} onPointerCancel={finishPan} onWheel={zoomFromWheel}>
      <defs><marker id="route-shadow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>
      <g transform={`translate(${camera().x} ${camera().y}) scale(${camera().scale})`}>
        <g class="route-shadow-edges"><For each={layout().edges}>{(edge) => { const selected = () => selection()?.kind === "edge" && selection()?.id === edge.id; const path = () => shadowEdgePath(edge.fromNode, edge.toNode); return <g classList={{ selected: selected() }} role="button" tabindex="0" aria-label={`Select edge ${shadowEdgeLabel(edge)}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); select({ kind: "edge", id: edge.id }); }} onKeyDown={(event) => selectOnKey(event, { kind: "edge", id: edge.id }, select)}><path class="route-shadow-edge-hit" d={path()} /><path class="route-shadow-edge-line" d={path()} marker-end="url(#route-shadow-arrow)"><title>{edge.proof.kind} · {edge.proof.detail}{edge.proof.locations.length ? ` · ${shadowProofLocationLabel(edge.proof.locations[0])}` : ""}</title></path><text class="route-shadow-edge-label" x={(edge.fromNode.x + edge.toNode.x) / 2 + edge.fromNode.width / 2} y={(edge.fromNode.y + edge.toNode.y) / 2 + edge.fromNode.height / 2 - 8}>{clipShadowLabel(shadowEdgeLabel(edge), 22)}</text></g>; }}</For></g>
        <g class="route-shadow-gaps"><For each={layout().gaps}>{(gap) => { const selected = () => selection()?.kind === "gap" && selection()?.id === gap.id; return <g classList={{ selected: selected() }} role="button" tabindex="0" aria-label={`Select gap ${gap.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); select({ kind: "gap", id: gap.id }); }} onKeyDown={(event) => selectOnKey(event, { kind: "gap", id: gap.id }, select)}><path class="route-shadow-gap-line" d={shadowGapPath(gap)} /><polygon class="route-shadow-gap-mark" points={`${gap.x},${gap.y - 10} ${gap.x + 10},${gap.y} ${gap.x},${gap.y + 10} ${gap.x - 10},${gap.y}`} /><text class="route-shadow-gap-label" x={gap.x + 16} y={gap.y + 4}>{clipShadowLabel(shadowGapReasonLabel(gap.reason), 22)}</text><title>{gap.label} · {shadowGapReasonLabel(gap.reason)}{gap.location ? ` · ${shadowProofLocationLabel(gap.location)}` : ""}</title></g>; }}</For></g>
        <g class="route-shadow-nodes"><For each={layout().nodes}>{(node) => <ShadowGraphNodeView node={node} selected={selection()?.kind === "node" && selection()?.id === node.id} onSelect={() => select({ kind: "node", id: node.id })} />}</For></g>
        <Show when={!layout().nodes.length && !layout().gaps.length}><text class="route-shadow-empty-label" x={VIEW_WIDTH / 2} y={VIEW_HEIGHT / 2} text-anchor="middle">No shadow evidence nodes were returned.</text></Show>
      </g>
    </svg><div class="route-shadow-legend" aria-label="Proof graph legend"><LegendMark kind="origin" label="Origin" /><LegendMark kind="component-occurrence" label="Component occurrence" /><LegendMark kind="boundary" label="Boundary" /><LegendMark kind="terminal" label="Terminal" /><LegendMark kind="gap" label="Gap" /></div><Show when={props.evidence?.status === "partial"}><p class="route-shadow-status">This slice is partial. Dashed gap marks show handoffs that have no proven edge.</p></Show><Show when={props.evidence?.status === "unavailable"}><p class="route-shadow-status">The selected route has no proven shadow path. No fallback graph is shown.</p></Show></div><RouteShadowEvidenceInspector evidence={props.evidence} selection={selection()} onClear={() => setSelection(null)} /></div>
  </section>;
}

function ShadowGraphNodeView(props: { node: ShadowGraphNode; selected: boolean; onSelect: () => void }) {
  const centerX = createMemo(() => props.node.width / 2);
  const centerY = createMemo(() => props.node.height / 2);
  return <g class={`route-shadow-node node-${props.node.visualKind}`} classList={{ selected: props.selected }} transform={`translate(${props.node.x} ${props.node.y})`} role="button" tabindex="0" aria-label={`Select ${shadowNodeKindLabel(props.node.visualKind)} ${props.node.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); props.onSelect(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onSelect(); } }}><NodeSurface kind={props.node.visualKind} width={props.node.width} height={props.node.height} centerX={centerX()} centerY={centerY()} /><text class="route-shadow-node-label" x="16" y="25">{clipShadowLabel(props.node.label, 25)}</text><text class="route-shadow-node-kind" x="16" y="47">{shadowNodeKindLabel(props.node.visualKind)}</text><text class="route-shadow-node-location" x="16" y="67">{clipShadowLabel(props.node.location?.file ? `${props.node.location.file}:${props.node.location.line}` : "Location unavailable", 29)}</text><title>{props.node.label} · {shadowNodeKindLabel(props.node.visualKind)}</title></g>;
}

function NodeSurface(props: { kind: ShadowGraphNode["visualKind"]; width: number; height: number; centerX: number; centerY: number }) {
  return <Show when={props.kind === "origin"} fallback={<Show when={props.kind === "terminal"} fallback={<Show when={props.kind === "boundary"} fallback={<rect class="route-shadow-node-surface" width={props.width} height={props.height} rx="7" />}><polygon class="route-shadow-node-surface" points={`${props.centerX},6 ${props.width - 8},${props.centerY} ${props.centerX},${props.height - 6} 8,${props.centerY}`} /></Show>}><polygon class="route-shadow-node-surface" points={`14,8 ${props.width - 14},8 ${props.width - 8},${props.centerY} ${props.width - 14},${props.height - 8} 14,${props.height - 8} 8,${props.centerY}`} /></Show>}><circle class="route-shadow-node-surface" cx={props.centerX} cy={props.centerY} r="22" /><rect class="route-shadow-node-surface-origin-card" x="36" y="6" width={props.width - 44} height={props.height - 12} rx="7" /></Show>;
}

function LegendMark(props: { kind: "origin" | "component-occurrence" | "boundary" | "terminal" | "gap"; label: string }) {
  return <span class={`route-shadow-legend-mark mark-${props.kind}`}><i aria-hidden="true" />{props.label}</span>;
}

function graphSummary(evidence: RouteShadowEvidence | null) {
  if (!evidence) return "No shadow evidence";
  return `${evidence.status} · ${evidence.nodes.length} nodes · ${evidence.edges.length} proven edges · ${evidence.gaps.length} gaps`;
}

function selectOnKey(event: KeyboardEvent, selection: Exclude<ShadowSelection, null>, select: (selection: ShadowSelection) => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  select(selection);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
