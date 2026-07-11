import { For, Show, createMemo } from "solid-js";
import type { ReportData } from "../../../api/contracts";

type Graph = Extract<ReportData, { view: "fan-out" }>["items"][number]["graph"];
export function SemanticGraph(props: { graph: Graph; label: string }) {
  const nodeIds = createMemo(() => new Set(props.graph.nodes.map((node) => node.id)));
  const edges = createMemo(() => props.graph.edges.filter((edge) => nodeIds().has(edge.from) && nodeIds().has(edge.to)));
  const connectedNodeIds = createMemo(() => new Set(edges().flatMap((edge) => [edge.from, edge.to])));
  const nodes = createMemo(() => props.graph.nodes.filter((node) => connectedNodeIds().has(node.id)));
  const sources = createMemo(() => nodes().filter((node) => node.kind === "source"));
  const boundaries = createMemo(() => nodes().filter((node) => node.kind === "boundary"));
  const sinks = createMemo(() => nodes().filter((node) => node.kind === "sink"));
  const positions = createMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    place(map, sources(), 20); place(map, boundaries(), 310); place(map, sinks(), 600); return map;
  });
  const height = createMemo(() => Math.max(140, Math.max(sources().length, boundaries().length, sinks().length) * 48 + 36));
  return <Show when={edges().length > 0}><svg class="semantic-graph" viewBox={`0 0 840 ${height()}`} role="img" aria-label={props.label}>
    <For each={edges()}>{(edge) => { const from = () => positions().get(edge.from)!; const to = () => positions().get(edge.to)!; return <path d={`M${from().x + 210} ${from().y} C${from().x + 255} ${from().y},${to().x - 45} ${to().y},${to().x} ${to().y}`} />; }}</For>
    <For each={nodes()}>{(node) => { const point = () => positions().get(node.id)!; const body = <g class={`graph-node node-${node.kind}`}><rect x={point().x} y={point().y - 16} width="210" height="32" rx="7" /><text x={point().x + 10} y={point().y + 4}>{truncate(node.label)}</text></g>; return node.location ? <a href={`/file?path=${encodeURIComponent(node.location.path)}#L${node.location.line}`}>{body}</a> : body; }}</For>
  </svg></Show>;
}
function place(map: Map<string, { x: number; y: number }>, nodes: Graph["nodes"], x: number) { const block = (nodes.length - 1) * 48; nodes.forEach((node, index) => map.set(node.id, { x, y: 70 - block / 2 + index * 48 + Math.max(0, block / 2) })); }
function truncate(value: string) { return value.length > 28 ? `${value.slice(0, 27)}…` : value; }
