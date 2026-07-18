import { For, Show, createMemo } from "solid-js";
import type { RouteDataDetail } from "../../../api/contracts";
import { layoutTrajectory } from "./trajectory-layout";
import { TrajectoryOperationNode } from "./TrajectoryOperationNode";

export function DataTrajectoryCanvas(props: {
  detail: RouteDataDetail; selectedKey: string | null; expanded: ReadonlySet<string>; isolated: boolean; zoom: number; onSelect: (key: string | null) => void; onPreview: (value: RouteDataDetail["operations"][number] | null) => void; onToggleExpand: (key: string) => void; onOpenEvidence: (id: string) => void; onZoom: (zoom: number) => void;
}) {
  const layout = createMemo(() => layoutTrajectory(props.detail, props.expanded));
  const shapes = createMemo(() => new Map(props.detail.shapes.map((shape) => [shape.id, shape])));
  let viewport!: HTMLDivElement;
  const toggleExpanded = (key: string) => {
    const scrollLeft = viewport.scrollLeft;
    const scrollTop = viewport.scrollTop;
    props.onToggleExpand(key);
    queueMicrotask(() => { viewport.scrollLeft = scrollLeft; viewport.scrollTop = scrollTop; });
  };
  return <div class="trajectory-canvas-shell">
    <div class="trajectory-canvas-toolbar"><button type="button" aria-label="Zoom out trajectory" onClick={() => props.onZoom(Math.max(.6, props.zoom - .1))}>−</button><button type="button" aria-label="Zoom in trajectory" onClick={() => props.onZoom(Math.min(1.6, props.zoom + .1))}>+</button><button type="button" onClick={() => props.onZoom(1)}>100%</button><span>{props.detail.operations.length} retained evidence cards · ordered by semantic stage, not call/argument order · handoffs are not proven</span></div>
    <div ref={viewport} class="trajectory-canvas" onClick={(event) => { if (event.target === event.currentTarget) props.onSelect(null); }}>
      <div class="trajectory-canvas-content" style={{ width: `${layout().width}px`, height: `${layout().height}px`, transform: `scale(${props.zoom})`, "transform-origin": "top left" }}>
        <For each={layout().items}>{(item) => <TrajectoryOperationNode item={item} shape={shapes().get(item.outputShapeIds[0]) ?? null} selected={props.selectedKey === item.key} onSelect={() => props.onSelect(item.key)} onPreview={props.onPreview} onToggleExpand={() => toggleExpanded(item.key)} onOpenEvidence={props.onOpenEvidence} />}</For>
        <Show when={!layout().items.length}><p class="trajectory-empty">No supported semantic operations were retained for this path.</p></Show>
      </div>
    </div>
  </div>;
}
