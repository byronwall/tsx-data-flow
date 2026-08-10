import { For, Show, createMemo } from "solid-js";
import type { RouteShadowEvidence, RouteTotality } from "../../../api/contracts";
import type { RouteTotalityFieldInspectorResult } from "./route-totality-field-inspector-model";
import type { RouteTotalityInspectorRecord } from "./route-totality-inspector-model";
import type { SourceEvidenceTarget } from "./source-evidence-model";
import { sourceTargetForLocation } from "./route-source-targets";
import { buildRouteTotalityEvidenceModel, type EvidencePathStep } from "./route-totality-evidence-model";

export function RouteTotalityEvidenceSection(props: {
  shadowEvidence: RouteShadowEvidence | null | undefined;
  totality: RouteTotality | null;
  selected: RouteTotalityInspectorRecord | null;
  fieldResult: RouteTotalityFieldInspectorResult | null;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  const model = createMemo(() => buildRouteTotalityEvidenceModel(
    props.shadowEvidence,
    props.totality,
    props.selected,
    props.fieldResult,
  ));
  return <section class="route-totality-inspector-section route-totality-evidence-section">
    <h3>Evidence <span>{shadowStatusLabel(model().shadow.status)}</span></h3>
    <Show when={model().shadow.status !== "missing"} fallback={<p>No retained shadow evidence was returned for this route.</p>}>
      <p class="route-totality-evidence-note">Retained proof is summarized here. The full evidence graph is not rendered.</p>
      <dl class="route-totality-evidence-counts">
        <div><dt>Nodes</dt><dd>{model().shadow.nodes.length}</dd></div>
        <div><dt>Proven edges</dt><dd>{model().shadow.edges.length}</dd></div>
        <div><dt>Gaps</dt><dd>{model().shadow.gaps.length}</dd></div>
      </dl>
      <Show when={model().shadow.path.length}>
        <div class="route-totality-evidence-path">
          <h4>Meaningful path <span>{model().shadow.path.length}</span></h4>
          <ol><For each={model().shadow.path}>{(step) => <PathStep step={step} onOpenSource={props.onOpenSource} />}</For></ol>
        </div>
      </Show>
      <Show when={model().focus.matched}>
        <RouteEvidenceFocus model={model()} onOpenSource={props.onOpenSource} />
      </Show>
      <details class="route-totality-evidence-details">
        <summary>Show retained evidence</summary>
        <div class="route-totality-evidence-records">
          <EvidenceNodeList model={model()} onOpenSource={props.onOpenSource} />
          <EvidenceEdgeList model={model()} onOpenSource={props.onOpenSource} />
          <EvidenceGapList model={model()} onOpenSource={props.onOpenSource} />
        </div>
      </details>
    </Show>
    <Show when={!model().focus.matched && model().route.elements.length > 0}>
      <RouteEvidenceSummary model={model()} />
    </Show>
  </section>;
}

function PathStep(props: {
  step: EvidencePathStep;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <li>
    <span><b>{props.step.role}</b><strong title={props.step.label}>{clip(props.step.label, 52)}</strong></span>
    <Show when={props.step.location} fallback={<small>Location unavailable</small>}>
      {(location) => <button type="button" onClick={() => props.onOpenSource(sourceTargetForLocation(location()))}>
        <code title={formatLocation(location())}>{clip(formatLocation(location()), 48)}</code><small>Open exact code</small>
      </button>}
    </Show>
  </li>;
}

function RouteEvidenceFocus(props: {
  model: ReturnType<typeof buildRouteTotalityEvidenceModel>;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <div class="route-totality-evidence-focus">
    <h4>Exact Route Totality evidence <span>{props.model.focus.elements.length + props.model.focus.relations.length + props.model.focus.gaps.length}</span></h4>
    <p>Matched by retained evidence IDs for this selection or field path.</p>
    <Show when={props.model.focus.elements.length}>
      <ul><For each={props.model.focus.elements}>{(element) => <li><strong title={element.label}>{clip(element.label, 42)}</strong><span>{element.kind} · {element.status}</span><EvidenceLocation location={element.location} onOpenSource={props.onOpenSource} /></li>}</For></ul>
    </Show>
    <Show when={props.model.focus.relations.length}>
      <ul><For each={props.model.focus.relations}>{(relation) => <li><strong>{humanize(relation.kind)}</strong><span>{relation.proof.kind} · {relation.status}</span><EvidenceLocation location={relation.proof.locations[0] ?? null} onOpenSource={props.onOpenSource} /></li>}</For></ul>
    </Show>
    <Show when={props.model.focus.gaps.length}>
      <ul><For each={props.model.focus.gaps}>{(gap) => <li><strong title={gap.label}>{clip(gap.label, 42)}</strong><span>{humanize(gap.reason)} · {gap.status}</span><EvidenceLocation location={gap.location} onOpenSource={props.onOpenSource} /></li>}</For></ul>
    </Show>
  </div>;
}

function RouteEvidenceSummary(props: { model: ReturnType<typeof buildRouteTotalityEvidenceModel> }) {
  return <div class="route-totality-evidence-route-summary">
    <h4>Route evidence summary</h4>
    <span>{props.model.route.status} · {props.model.route.elements.length} nodes · {props.model.route.relations.filter((relation) => relation.status === "proven").length} proven relations · {props.model.route.gaps.length} gaps</span>
  </div>;
}

function EvidenceNodeList(props: {
  model: ReturnType<typeof buildRouteTotalityEvidenceModel>;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <div>
    <h4>Nodes <span>{props.model.shadow.nodes.length}</span></h4>
    <ul class="route-totality-evidence-list"><For each={props.model.shadow.nodes}>{(node) => <li><strong title={node.label}>{clip(node.label, 48)}</strong><span>{node.role} · {node.kind}</span><EvidenceLocation location={node.location} onOpenSource={props.onOpenSource} /></li>}</For></ul>
  </div>;
}

function EvidenceEdgeList(props: {
  model: ReturnType<typeof buildRouteTotalityEvidenceModel>;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <div>
    <h4>Proven edges <span>{props.model.shadow.edges.length}</span></h4>
    <ul class="route-totality-evidence-list"><For each={props.model.shadow.edges}>{(edge) => <li><strong>{edge.proof.kind}</strong><span title={edge.proof.detail}>{clip(edge.proof.detail, 54)}</span><For each={edge.proof.locations}>{(location) => <EvidenceLocation location={location} onOpenSource={props.onOpenSource} />}</For></li>}</For></ul>
  </div>;
}

function EvidenceGapList(props: {
  model: ReturnType<typeof buildRouteTotalityEvidenceModel>;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <div>
    <h4>Gaps <span>{props.model.shadow.gaps.length}</span></h4>
    <Show when={props.model.shadow.gaps.length} fallback={<p>No retained evidence gaps were returned.</p>}>
      <ul class="route-totality-evidence-list"><For each={props.model.shadow.gaps}>{(gap) => <li><strong title={gap.label}>{clip(gap.label, 48)}</strong><span>{humanize(gap.reason)}</span><EvidenceLocation location={gap.location} onOpenSource={props.onOpenSource} /></li>}</For></ul>
    </Show>
  </div>;
}

function EvidenceLocation(props: {
  location: { file: string; line: number; column: number; span: { startLine: number; startColumn: number; endLine: number; endColumn: number } } | null;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <Show when={props.location} fallback={<small>Location unavailable</small>}>
    {(location) => <button type="button" class="route-totality-evidence-location" onClick={() => props.onOpenSource(sourceTargetForLocation(location()))}>
      <code title={formatLocation(location())}>{clip(formatLocation(location()), 48)}</code><small>Open exact code</small>
    </button>}
  </Show>;
}

function shadowStatusLabel(status: ReturnType<typeof buildRouteTotalityEvidenceModel>["shadow"]["status"]) {
  return status === "missing" ? "missing" : status;
}

function formatLocation(location: { file: string; line: number; column: number }) {
  return location.file + ":" + location.line + ":" + location.column;
}

function clip(value: string, limit: number) {
  return value.length > limit ? value.slice(0, limit - 1) + "…" : value;
}

function humanize(value: string) {
  return value.replaceAll("-", " ");
}
