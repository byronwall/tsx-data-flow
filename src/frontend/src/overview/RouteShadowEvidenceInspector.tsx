import { For, Show, createMemo } from "solid-js";
import type { RouteShadowEvidence } from "../../../api/contracts";
import {
  shadowEdgeLabel,
  shadowGapReasonLabel,
  shadowLocationLabel,
  shadowNodeKindLabel,
  shadowNodeVisualKind,
  shadowProofKindsForNode,
  shadowProofLocationLabel,
  type ShadowSelection,
} from "./route-shadow-evidence-model";

export function RouteShadowEvidenceInspector(props: {
  evidence: RouteShadowEvidence | null;
  selection: ShadowSelection;
  onClear: () => void;
}) {
  const selectedNode = createMemo(() => props.evidence?.nodes.find((node) => props.selection?.kind === "node" && node.id === props.selection.id) ?? null);
  const selectedEdge = createMemo(() => props.evidence?.edges.find((edge) => props.selection?.kind === "edge" && edge.id === props.selection.id) ?? null);
  const selectedGap = createMemo(() => props.evidence?.gaps.find((gap) => props.selection?.kind === "gap" && gap.id === props.selection.id) ?? null);
  const nodeProofKinds = createMemo(() => {
    const node = selectedNode();
    return node && props.evidence ? shadowProofKindsForNode(props.evidence, node.id) : [];
  });
  return <aside class="route-shadow-inspector" aria-label="Selected proof inspector">
    <Show when={props.evidence} fallback={<ShadowInspectorEmpty message="No shadow evidence was returned for this route." />}>
      {(evidence) => <Show when={selectedNode() || selectedEdge() || selectedGap()} fallback={<ShadowInspectorEmpty evidence={evidence()} message="Select an origin, component occurrence, boundary, terminal, edge, or gap." />}>
        <Show when={selectedNode()}>{(node) => <ShadowNodeDetails evidence={evidence()} node={node()} proofKinds={nodeProofKinds()} onClear={props.onClear} />}</Show>
        <Show when={selectedEdge()}>{(edge) => <ShadowEdgeDetails evidence={evidence()} edge={edge()} onClear={props.onClear} />}</Show>
        <Show when={selectedGap()}>{(gap) => <ShadowGapDetails evidence={evidence()} gap={gap()} onClear={props.onClear} />}</Show>
      </Show>}
    </Show>
  </aside>;
}

function ShadowInspectorEmpty(props: { evidence?: RouteShadowEvidence; message: string }) {
  return <div class="route-shadow-inspector-empty"><span class="micro-label">Proof inspector</span><strong>{props.evidence?.status === "unavailable" ? "Proof unavailable" : "Nothing selected"}</strong><p>{props.message}</p><Show when={props.evidence}><span>{props.evidence?.nodes.length ?? 0} nodes · {props.evidence?.edges.length ?? 0} proven edges · {props.evidence?.gaps.length ?? 0} gaps</span></Show></div>;
}

function ShadowNodeDetails(props: {
  evidence: RouteShadowEvidence;
  node: RouteShadowEvidence["nodes"][number];
  proofKinds: string[];
  onClear: () => void;
}) {
  const visualKind = () => shadowNodeVisualKind(props.node);
  const location = () => nodeLocation(props.evidence, props.node);
  return <>
    <ShadowInspectorHeader kind={shadowNodeKindLabel(visualKind())} title={props.node.label} onClear={props.onClear} />
    <section class="route-shadow-inspector-section"><h3>Code location</h3><code class="route-shadow-location">{shadowLocationLabel(location())}</code></section>
    <section class="route-shadow-inspector-section"><h3>Proof kind</h3><div class="route-shadow-proof-kinds"><For each={props.proofKinds}>{(kind) => <code>{kind}</code>}</For><Show when={!props.proofKinds.length}><span>No adjacent proof edge.</span></Show></div></section>
    <section class="route-shadow-inspector-section"><h3>Node record</h3><dl class="route-shadow-facts"><div><dt>Role</dt><dd>{props.node.role}</dd></div><div><dt>Kind</dt><dd>{props.node.kind}</dd></div></dl></section>
    <Show when={props.node.role === "origin" && props.evidence.origin}>{(origin) => <section class="route-shadow-inspector-section"><h3>Occurrence identity</h3><code class="route-shadow-code">{origin().occurrence.expression}</code><p>Compiler symbol <code>{origin().occurrence.compilerIdentity}</code></p><p>Definition <code>{origin().definition.name}</code> · {origin().definition.module ?? "module unavailable"}</p></section>}</Show>
    <Show when={props.node.role === "terminal" && props.evidence.terminal}>{(terminal) => <section class="route-shadow-inspector-section"><h3>Render sink</h3><p>{terminal().component ?? "Component unavailable"} · {terminal().kind}</p></section>}</Show>
  </>;
}

function ShadowEdgeDetails(props: {
  evidence: RouteShadowEvidence;
  edge: RouteShadowEvidence["edges"][number];
  onClear: () => void;
}) {
  const fromLabel = () => props.evidence.nodes.find((node) => node.id === props.edge.from)?.label ?? props.edge.from;
  const toLabel = () => props.evidence.nodes.find((node) => node.id === props.edge.to)?.label ?? props.edge.to;
  return <>
    <ShadowInspectorHeader kind="Proven edge" title={`${fromLabel()} → ${toLabel()}`} onClear={props.onClear} />
    <section class="route-shadow-inspector-section"><h3>Proof kind</h3><code class="route-shadow-proof-kind">{props.edge.proof.kind}</code><p>{props.edge.proof.detail}</p></section>
    <section class="route-shadow-inspector-section"><h3>Code locations</h3><div class="route-shadow-location-list"><For each={props.edge.proof.locations}>{(location) => <code>{shadowProofLocationLabel(location)}</code>}</For></div></section>
    <section class="route-shadow-inspector-section"><h3>Relationship</h3><dl class="route-shadow-facts"><div><dt>Edge</dt><dd>{shadowEdgeLabel(props.edge)}</dd></div><div><dt>From</dt><dd>{fromLabel()}</dd></div><div><dt>To</dt><dd>{toLabel()}</dd></div></dl></section>
  </>;
}

function ShadowGapDetails(props: {
  evidence: RouteShadowEvidence;
  gap: RouteShadowEvidence["gaps"][number];
  onClear: () => void;
}) {
  const fromLabel = () => props.evidence.nodes.find((node) => node.id === props.gap.from)?.label ?? props.gap.from;
  const toLabel = () => props.gap.to ? props.evidence.nodes.find((node) => node.id === props.gap.to)?.label ?? props.gap.to : "No proven next node";
  return <>
    <ShadowInspectorHeader kind="Gap" title={props.gap.label} onClear={props.onClear} />
    <section class="route-shadow-inspector-section"><h3>Reason</h3><p class="route-shadow-gap-reason">{shadowGapReasonLabel(props.gap.reason)}</p><p>This handoff is not rendered as a proven edge.</p></section>
    <section class="route-shadow-inspector-section"><h3>Code location</h3><code class="route-shadow-location">{shadowLocationLabel(props.gap.location)}</code></section>
    <section class="route-shadow-inspector-section"><h3>Unproven connection</h3><dl class="route-shadow-facts"><div><dt>From</dt><dd>{fromLabel()}</dd></div><div><dt>To</dt><dd>{toLabel()}</dd></div></dl></section>
  </>;
}

function ShadowInspectorHeader(props: { kind: string; title: string; onClear: () => void }) {
  return <header class="route-shadow-inspector-header"><div><span class="route-shadow-kind">{props.kind}</span><h2>{props.title}</h2></div><button type="button" aria-label="Clear proof selection" onClick={() => props.onClear()}>×</button></header>;
}

function nodeLocation(evidence: RouteShadowEvidence, node: RouteShadowEvidence["nodes"][number]) {
  if (node.location) return node.location;
  if (node.role === "origin") return evidence.origin?.occurrence.location ?? evidence.origin?.definition.location ?? null;
  if (node.role === "terminal") return evidence.terminal?.location ?? null;
  return null;
}
