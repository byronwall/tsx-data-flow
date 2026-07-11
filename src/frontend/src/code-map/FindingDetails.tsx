import { For, Show, createSignal } from "solid-js";
import type { FindingDetail, InventoryEntry } from "../../../api/contracts";
import { SemanticGraph } from "../reports/SemanticGraph";

export function EntryDetails(props: { entry: InventoryEntry; finding?: FindingDetail; close: () => void; jump: (line: number) => void }) {
  return (
    <section class="entry-details">
      <button class="panel-back" type="button" onClick={() => props.close()}>← Back to list</button>
      <Show when={props.finding} fallback={<GenericDetails entry={props.entry} jump={props.jump} />}>
        {(finding) => <FindingView finding={finding()} jump={props.jump} />}
      </Show>
    </section>
  );
}

function FindingView(props: { finding: FindingDetail; jump: (line: number) => void }) {
  const [copied, setCopied] = createSignal(false);
  const copy = async () => {
    await copyText(props.finding.debugText); setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  };
  return <article class="finding-detail">
    <header><h3>{props.finding.id} <span class="badge">{props.finding.category}</span></h3>
      <button type="button" onClick={() => void copy()}>{copied() ? "Copied" : "Copy debug info"}</button></header>
    <p class="meta">{props.finding.location.path}:<button class="link-button" onClick={() => props.jump(props.finding.location.line)}>{props.finding.location.line}</button> · burden {props.finding.burden.toFixed(2)} · confidence {props.finding.confidence}%</p>
    <pre class="expression"><code>{props.finding.expression}</code></pre>
    <Show when={props.finding.advice.headline || props.finding.advice.firstCut}><div class="advice"><strong>{props.finding.advice.shape}</strong><p>{props.finding.advice.headline || props.finding.advice.firstCut}</p></div></Show>
    <SemanticGraph graph={props.finding.graph} label={`Source-to-sink graph for ${props.finding.label}`} />
    <DetailSection title={`Path — ${props.finding.path.length} steps`}>
      <ol class="path-list"><For each={props.finding.path}>{(step, index) => <li>
        <span class="path-number">{index() + 1}</span><strong>{step.kind}</strong> {step.label}
        <Show when={step.location}>{(location) => <> <a href={location().path === props.finding.location.path ? `#L${location().line}` : `/file?path=${encodeURIComponent(location().path)}#L${location().line}`}
          onClick={(event) => { if (location().path === props.finding.location.path) { event.preventDefault(); props.jump(location().line); } }}>{location().path}:{location().line}</a></>}</Show>
        <Show when={step.snippet}><pre><code>{step.snippet}</code></pre></Show>
      </li>}</For></ol>
    </DetailSection>
    <Show when={props.finding.defenses.length}><DetailSection title={`Defenses — ${props.finding.defenses.length}`}><ul><For each={props.finding.defenses}>{(defense) => <li><code>{defense.expression}</code> → {defense.verdict} <span class="meta">{defense.origin} · :{defense.location.line}</span></li>}</For></ul></DetailSection></Show>
    <Show when={props.finding.representationSteps.length}><DetailSection title={`Representation changes — ${props.finding.representationSteps.length}`}><ul><For each={props.finding.representationSteps}>{(step) => <li>{step.kind}: {step.label} <span class="meta">{step.location.path}:{step.location.line}</span></li>}</For></ul></DetailSection></Show>
    <Show when={props.finding.roots.length}><DetailSection title={`Sources — ${props.finding.roots.length}`}><ul><For each={props.finding.roots}>{(root) => <li><code>{root.label}</code> <span class="meta">{root.kind}</span></li>}</For></ul></DetailSection></Show>
    <Show when={props.finding.reach.length}><DetailSection title="Reach"><ul><For each={props.finding.reach}>{(group) => <li>{group.source} → {group.total} sinks</li>}</For></ul></DetailSection></Show>
    <Show when={props.finding.sameCode.length}><DetailSection title="Same code elsewhere"><ul><For each={props.finding.sameCode}>{(peer) => <li><a href={`/file?path=${encodeURIComponent(peer.path)}&finding=${encodeURIComponent(peer.id)}#L${peer.line}`}>{peer.path}:{peer.line} — {peer.label}</a></li>}</For></ul></DetailSection></Show>
  </article>;
}

function GenericDetails(props: { entry: InventoryEntry; jump: (line: number) => void }) {
  return <article><h3>{props.entry.label} <span class="badge">{props.entry.kind}</span></h3>
    <Show when={props.entry.line}><button class="link-button" onClick={() => props.jump(props.entry.line!)}>Jump to line {props.entry.line}</button></Show>
    <pre><code>{JSON.stringify(props.entry, null, 2)}</code></pre></article>;
}
function DetailSection(props: { title: string; children: unknown }) { return <section class="detail-section"><h4>{props.title}</h4>{props.children as never}</section>; }
async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* use the local fallback */ }
  }
  const textarea = document.createElement("textarea"); textarea.value = value; textarea.style.position = "fixed"; textarea.style.opacity = "0";
  document.body.appendChild(textarea); textarea.select();
  try { if (!document.execCommand("copy")) throw new Error("Copy command was rejected"); } finally { textarea.remove(); }
}
