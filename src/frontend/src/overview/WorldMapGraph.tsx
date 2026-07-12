import { For, Show, createMemo } from "solid-js";
import type { Workspace } from "../../../api/contracts";
import { GRAPH_HEIGHT, GRAPH_WIDTH, NODE_HEIGHT, NODE_WIDTH, mapSubsetLabel, visibleMapEdges, worldMapLayout } from "./world-map-model";

type MapData = Workspace["semanticMap"];

export function WorldMapGraph(props: { map: MapData; selectedId: string | null; onSelect: (id: string) => void; onClear: () => void }) {
  const nodes = createMemo(() => worldMapLayout(props.map));
  const edges = createMemo(() => visibleMapEdges(props.map, nodes(), props.selectedId));
  const selectedConnectionCount = createMemo(() => props.selectedId ? props.map.edges.filter((edge) => edge.from === props.selectedId || edge.to === props.selectedId).length : null);
  const byId = createMemo(() => new Map(nodes().map((node) => [node.id, node])));
  return <div class="world-graph-shell">
    <div class="world-graph-summary"><span>{mapSubsetLabel(props.map, nodes().length)} · ordered by connection volume, then finding burden</span><span>{props.selectedId ? `${edges().length} of ${selectedConnectionCount()} selected connections visible` : `${edges().length} visible connections`}</span></div>
    <svg class="world-graph" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="img" aria-label="Repository data-flow network" onClick={() => props.onClear()}>
      <defs><marker id="world-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker></defs>
      <rect class="world-graph-hit-area" width={GRAPH_WIDTH} height={GRAPH_HEIGHT} />
      <g class="world-graph-lanes" aria-hidden="true"><text x="28" y="18">SOURCE ONLY</text><text class="lane-detail" x="28" y="31">defines inputs · no TSX</text><text x="464" y="18">TRANSFORM + RENDER</text><text class="lane-detail" x="464" y="31">defines inputs · renders TSX</text><text x="900" y="18">RENDER ONLY</text><text class="lane-detail" x="900" y="31">no upstream definitions · renders TSX</text></g>
      <g class="world-graph-edges"><For each={edges()}>{(edge) => { const from = () => byId().get(edge.from); const to = () => byId().get(edge.to); return <Show when={from() && to()}><path classList={{ incomplete: edge.unknownCount > 0 }} d={edgePath(from()!, to()!)}><title>{edge.flowCount} retained flow{edge.flowCount === 1 ? "" : "s"}{edge.unknownCount ? ` · ${edge.unknownCount} incomplete` : ""}</title></path></Show>; }}</For></g>
      <g class="world-graph-nodes"><For each={nodes()}>{(node) => <g class={`world-node node-${node.role}`} classList={{ selected: props.selectedId === node.id, dimmed: Boolean(props.selectedId) && edges().length > 0 && !edges().some((edge) => edge.from === node.id || edge.to === node.id) && props.selectedId !== node.id }} role="button" tabindex="0" aria-label={`${node.label}, ${node.sourceCount} inputs, ${node.sinkCount} terminals`} onClick={(event) => { event.stopPropagation(); props.onSelect(node.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.stopPropagation(); props.onSelect(node.id); } }} transform={`translate(${node.x} ${node.y})`}><rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="5" /><text class="world-node-label" x="11" y="19">{trim(node.label, 27)}</text><text class="world-node-metric" x="11" y="36">{node.sourceCount} in · {node.sinkCount} out{node.unknownCount ? ` · ${node.unknownCount} opaque` : ""}</text><title>{node.path}</title></g>}</For></g>
    </svg>
    <div class="world-graph-legend" aria-label="Map legend"><span class="legend-source">Source-only file</span><span class="legend-flow">Transforms and renders</span><span class="legend-terminal">Render-only file</span><span class="legend-incomplete">Dashed: trace crosses an unresolved or opaque boundary</span></div>
  </div>;
}

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }) { const x1 = from.x + NODE_WIDTH; const y1 = from.y + NODE_HEIGHT / 2; const x2 = to.x; const y2 = to.y + NODE_HEIGHT / 2; const bend = Math.max(40, Math.abs(x2 - x1) * .45); return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`; }
function trim(value: string, max: number) { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }
