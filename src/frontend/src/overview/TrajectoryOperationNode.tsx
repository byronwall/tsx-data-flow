import { For, Show } from "solid-js";
import type { RouteDataDetail } from "../../../api/contracts";
import { TRAJECTORY_STAGES, type TrajectoryLayoutItem } from "./trajectory-layout";
import { cleanCompilerType, trajectoryShapeLabel, trajectoryShapeMeta } from "./trajectory-shape-label";

export function TrajectoryOperationNode(props: {
  item: TrajectoryLayoutItem; shape: RouteDataDetail["shapes"][number] | null; selected: boolean; onSelect: () => void; onPreview: (value: RouteDataDetail["operations"][number] | null) => void; onToggleExpand: () => void; onOpenEvidence: (evidenceId: string) => void;
}) {
  const shapeLabel = () => trajectoryShapeLabel(props.shape);
  const shapeMeta = () => trajectoryShapeMeta(props.shape);
  return <article class="trajectory-operation" classList={{ selected: props.selected, expanded: props.item.children.length > 0 }} style={{ left: `${props.item.x}px` }}>
    <span class="trajectory-node-stage">{TRAJECTORY_STAGES[props.item.stage]}</span>
    <button type="button" class="trajectory-operation-main" aria-pressed={props.selected} onClick={() => props.onSelect()} onDblClick={() => props.onToggleExpand()} onPointerEnter={() => props.onPreview(props.item)} onPointerLeave={() => props.onPreview(null)} onFocus={() => props.onPreview(props.item)} onBlur={() => props.onPreview(null)}>
      <span class="trajectory-effect">{props.item.effect}</span><strong>{props.item.label}</strong><span class="trajectory-output" title={props.shape ? cleanCompilerType(props.shape.typeText) : shapeLabel()}><span>Output</span><code>{shapeLabel()}</code><small>{shapeMeta()}</small></span>
      <span class={`trajectory-completeness state-${props.item.completeness}`}>Evidence {props.item.completeness}</span>
    </button>
    <Show when={props.item.sourceExpressionIds.length}><button type="button" class="trajectory-expand" aria-expanded={props.item.children.length > 0} onClick={() => props.onToggleExpand()}>{props.item.children.length ? "Collapse evidence" : `Expand evidence (${props.item.sourceExpressionIds.length})`}</button></Show>
    <Show when={props.item.children.length}><div class="trajectory-evidence-children"><For each={props.item.children}>{(evidence) => <button type="button" onClick={() => props.onOpenEvidence(evidence.id)}><code>{evidence.expression}</code><span>{evidence.operationKind} · {evidence.file}:{evidence.line}</span></button>}</For></div></Show>
  </article>;
}
