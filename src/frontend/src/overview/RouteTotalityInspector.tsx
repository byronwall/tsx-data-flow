import { For, Show, type Accessor } from "solid-js";
import type { RouteTotality } from "../../../api/contracts";
import { routeTotalityNodeKindLabel, type RouteTotalityCountSummary, type RouteTotalityGraphSummary, type RouteTotalityLocation } from "./route-totality-model";
import type {
  RouteTotalityInspectorLink,
  RouteTotalityInspectorRecord,
  RouteTotalityInspectorSelection,
} from "./route-totality-inspector-model";
import type {
  RouteTotalityEmphasis,
  RouteTotalityEmphasisMode,
} from "./route-totality-emphasis";
import type { SourceEvidenceTarget } from "./source-evidence-model";
import { sourceTargetForLocation } from "./route-source-targets";
import type {
  RouteTotalityFindingMatch,
  RouteTotalityFindingSummary,
} from "./route-totality-finding-model";
import type { RouteTotalityLedgerSection } from "./route-totality-graph-state";
import { RouteTotalityOverview } from "./RouteTotalityOverview";

export function RouteTotalityInspector(props: {
  totality: RouteTotality | null;
  summary: RouteTotalityGraphSummary;
  counts: readonly RouteTotalityCountSummary[];
  evidenceVisible: boolean;
  evidenceDetailEnabled: boolean;
  evidenceNodeCount: number;
  ledgerItems: readonly RouteTotalityLedgerSection[];
  startSelectionAvailable: boolean;
  selected: Accessor<RouteTotalityInspectorRecord | null>;
  emphasis: RouteTotalityEmphasis;
  emphasisMode: RouteTotalityEmphasisMode | null;
  isolated: boolean;
  onClear: () => void;
  onSelect: (selection: RouteTotalityInspectorSelection) => void;
  onEmphasize: (mode: RouteTotalityEmphasisMode) => void;
  onClearEmphasis: () => void;
  onIsolate: () => void;
  onRestore: () => void;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
  findings: RouteTotalityFindingSummary;
  onSelectStart: () => void;
  onToggleEvidence: () => void;
}) {
  return <aside class="route-totality-inspector" aria-label="Route totality proof inspector">
    <div class="route-totality-inspector-scroll">
      <Show when={props.selected()} fallback={<RouteTotalityOverview totality={props.totality} summary={props.summary} counts={props.counts} evidenceVisible={props.evidenceVisible} evidenceDetailEnabled={props.evidenceDetailEnabled} evidenceNodeCount={props.evidenceNodeCount} ledgerItems={props.ledgerItems} startSelectionAvailable={props.startSelectionAvailable} onSelectStart={props.onSelectStart} onToggleEvidence={props.onToggleEvidence} />}>
        {(record) => <>
          <header class="route-totality-inspector-header">
            <div>
              <span class={`route-totality-record-kind kind-${record().kind}`}>{recordKindLabel(record().kind, record().family)}</span>
              <h2>{record().label}</h2>
              <p>{record().detail || "No concise detail was returned for this selection."}</p>
            </div>
            <button type="button" class="route-totality-inspector-close" aria-label="Clear totality selection" onClick={props.onClear}>×</button>
          </header>
          <section class="route-totality-inspector-section">
            <h3>Selected evidence</h3>
            <dl class="route-totality-facts">
              <Fact label="Kind" value={recordKindLabel(record().kind, record().family)} />
              <Fact label="Status" value={record().status} />
              <Fact label="Record" value={record().selection.recordId} mono />
              <Show when={record().from}><Fact label="From" value={record().from?.label ?? "Unavailable"} /></Show>
              <Show when={record().to}><Fact label="To" value={record().to?.label ?? "Unavailable"} /></Show>
            </dl>
          </section>
          <EmphasisSection record={record()} emphasis={props.emphasis} emphasisMode={props.emphasisMode} isolated={props.isolated} onEmphasize={props.onEmphasize} onClearEmphasis={props.onClearEmphasis} onIsolate={props.onIsolate} onRestore={props.onRestore} />
          <SourceLocations locations={record().locations} onOpenSource={props.onOpenSource} />
          <ProofRecords proofs={record().proof} onOpenSource={props.onOpenSource} />
          <FindingSection findings={props.findings} />
          <NeighborSection title="Incoming neighbors" items={record().incoming} empty="No incoming neighbor was returned." onSelect={props.onSelect} />
          <NeighborSection title="Outgoing neighbors" items={record().outgoing} empty="No outgoing neighbor was returned." onSelect={props.onSelect} />
          <NeighborSection title="Framework boundaries" items={record().boundaries} empty="No linked framework boundary was returned." onSelect={props.onSelect} />
          <NeighborSection title="Adjacent gaps" items={record().gaps} empty="No explicitly adjacent gap was returned." onSelect={props.onSelect} />
          <Show when={record().routeGlobalGaps.length}>
            <NeighborSection title="Route-global gaps" items={record().routeGlobalGaps} empty="No route-global gap was returned." onSelect={props.onSelect} />
          </Show>
          <OccurrenceLinks record={record()} onSelect={props.onSelect} onOpenSource={props.onOpenSource} />
          <section class="route-totality-inspector-section route-totality-inspector-actions">
            <button type="button" onClick={props.onClear}>Clear selection</button>
          </section>
        </>}
      </Show>
    </div>
  </aside>;
}

function EmphasisSection(props: {
  record: RouteTotalityInspectorRecord;
  emphasis: RouteTotalityEmphasis;
  emphasisMode: RouteTotalityEmphasisMode | null;
  isolated: boolean;
  onEmphasize: (mode: RouteTotalityEmphasisMode) => void;
  onClearEmphasis: () => void;
  onIsolate: () => void;
  onRestore: () => void;
}) {
  const isNode = () => props.record.selection.target === "node";
  const canIsolate = () => props.emphasis.active && props.emphasis.focusNodeIds.size > 0;
  return <section class="route-totality-inspector-section route-totality-emphasis-section">
    <h3>Reach emphasis</h3>
    <div class="route-totality-emphasis-controls">
      <button type="button" disabled={!isNode()} aria-pressed={isNode() && props.emphasisMode === "both"} onClick={() => props.onEmphasize("both")}>Both directions</button>
      <button type="button" disabled={!isNode()} aria-pressed={isNode() && props.emphasisMode === "forward"} onClick={() => props.onEmphasize("forward")}>Forward only</button>
      <button type="button" disabled={!isNode()} aria-pressed={isNode() && props.emphasisMode === "backward"} onClick={() => props.onEmphasize("backward")}>Backward only</button>
    </div>
    <Show when={props.emphasis.active} fallback={<p>Select a node to emphasize its upstream and downstream connections.</p>}>
      <p class={`route-totality-emphasis-status status-${props.emphasis.status}`}>{props.emphasis.note}</p>
      <dl class="route-totality-emphasis-facts">
        <Fact label="Proven marks" value={String(props.emphasis.provenNodeCount)} />
        <Fact label="Proven links" value={String(props.emphasis.provenEdgeCount)} />
        <Fact label="Bridges" value={String(props.emphasis.provenBridgeCount)} />
        <Fact label="Frontiers" value={String(props.emphasis.frontiers.length)} />
      </dl>
      <Show when={props.emphasis.originContributors.length}>
        <div class="route-totality-emphasis-list">
          <h4>Proven origin roles <span>{props.emphasis.originContributors.length}</span></h4>
          <ul><For each={props.emphasis.originContributors}>{(origin) => <li><b>{origin.label}</b><span>{origin.role} · {origin.status}</span></li>}</For></ul>
        </div>
      </Show>
      <Show when={props.emphasis.frontierOriginContributors.length}>
        <div class="route-totality-emphasis-list route-totality-emphasis-frontier-list">
          <h4>Partial contributors <span>{props.emphasis.frontierOriginContributors.length}</span></h4>
          <ul><For each={props.emphasis.frontierOriginContributors}>{(origin) => <li><b>{origin.label}</b><span>Partial boundary · {origin.role} · {origin.status}</span></li>}</For></ul>
        </div>
      </Show>
      <Show when={props.emphasis.frontiers.length}>
        <div class="route-totality-emphasis-list route-totality-emphasis-frontier-list">
          <h4>Uncertain frontiers <span>{props.emphasis.frontiers.length}</span></h4>
          <ul><For each={props.emphasis.frontiers}>{(frontier) => <li><b>{frontier.label}</b><span>{frontier.status} · {frontier.detail}</span></li>}</For></ul>
        </div>
      </Show>
      <div class="route-totality-emphasis-controls route-totality-emphasis-actions">
        <button type="button" disabled={!canIsolate()} onClick={() => props.onIsolate()}>Isolate focus</button>
        <Show when={props.isolated}><button type="button" onClick={() => props.onRestore()}>Restore full route</button></Show>
        <button type="button" onClick={() => props.onClearEmphasis()}>Clear emphasis</button>
      </div>
    </Show>
  </section>;
}

function SourceLocations(props: {
  locations: RouteTotalityLocation[];
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  const targets = () => props.locations.map((location, index) => sourceTargetForLocation(location, index));
  return <section class="route-totality-inspector-section">
    <h3>Exact code locations <span>{props.locations.length}</span></h3>
    <Show when={props.locations.length} fallback={<p>No exact code location was returned.</p>}>
      <div class="route-totality-source-list"><For each={props.locations}>{(location, index) => <div class="route-totality-source-item">
        <button type="button" onClick={() => props.onOpenSource(sourceTargetForLocation(location, index()), targets())}>
          <code>{formatLocation(location)}</code><span>Open exact code</span>
        </button>
        <a href={locationHref(location)} title={`Open full file ${location.file}`}>Full file</a>
      </div>}</For></div>
    </Show>
  </section>;
}

function ProofRecords(props: {
  proofs: RouteTotalityInspectorRecord["proof"];
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <section class="route-totality-inspector-section">
    <h3>Proof records <span>{props.proofs.length}</span></h3>
    <Show when={props.proofs.length} fallback={<p>No proof record was returned for this selection.</p>}>
      <div class="route-totality-proof-list"><For each={props.proofs}>{(proof) => <ProofRecord proof={proof} onOpenSource={props.onOpenSource} />}</For></div>
    </Show>
  </section>;
}

function ProofRecord(props: {
  proof: RouteTotalityInspectorRecord["proof"][number];
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  const targets = () => props.proof.locations.map((location, index) => sourceTargetForLocation(location, index));
  return <article>
    <strong>{props.proof.kind}</strong>
    <span>{props.proof.status} · {props.proof.detail}</span>
    <For each={props.proof.locations}>{(location, index) => <div class="route-totality-proof-location">
      <button type="button" onClick={() => props.onOpenSource(sourceTargetForLocation(location, index()), targets())}>
        <code>{formatLocation(location)}</code><span>Open exact code</span>
      </button>
      <a href={locationHref(location)} title={`Open full file ${location.file}`}>Full file</a>
    </div>}</For>
  </article>;
}

function FindingSection(props: { findings: RouteTotalityFindingSummary }) {
  return <Show when={props.findings.count > 0}>
    <section class="route-totality-inspector-section route-totality-finding-section">
      <h3>Indexed findings <span>{props.findings.count}</span></h3>
      <p>These findings attach to this selection through an exact DTO identity.</p>
      <div class="route-totality-finding-list"><For each={props.findings.matches}>{(match) => <FindingRecord match={match} />}</For></div>
    </section>
  </Show>;
}

function FindingRecord(props: { match: RouteTotalityFindingMatch }) {
  const entry = () => props.match.entry;
  return <article class="route-totality-finding-item">
    <strong>{entry().label}</strong>
    <span>{entry().family ?? "Unclassified finding"} · {props.match.statuses.join(" / ")}</span>
    <small>Exact target · {props.match.targetDetails.map((target) => `${target.kind}${target.role ? ` · ${target.role}` : ""} · ${target.status}`).join(" / ")}</small>
    <small>{entry().file}:{entry().location.line}:{entry().location.column}</small>
    <a class="route-totality-finding-link" target="_blank" rel="noreferrer" href={findingHref(entry())}>Open finding detail <span>(new tab)</span></a>
  </article>;
}

function NeighborSection(props: { title: string; items: RouteTotalityInspectorLink[]; empty: string; onSelect: (selection: RouteTotalityInspectorSelection) => void }) {
  return <section class="route-totality-inspector-section">
    <h3>{props.title} <span>{props.items.length}</span></h3>
    <Show when={props.items.length} fallback={<p>{props.empty}</p>}>
      <div class="route-totality-link-list"><For each={props.items}>{(item) => <SelectionLink item={item} onSelect={props.onSelect} />}</For></div>
    </Show>
  </section>;
}

function SelectionLink(props: { item: RouteTotalityInspectorLink; onSelect: (selection: RouteTotalityInspectorSelection) => void }) {
  return <button type="button" class="route-totality-inspector-link" onClick={() => props.onSelect(props.item.selection)}>
    <span><b>{props.item.label}</b><small>{routeTotalityNodeKindLabel(props.item.kind)}</small></span>
    <Show when={props.item.location}><code>{formatLocation(props.item.location!)}</code></Show>
    <small>{props.item.detail}</small>
  </button>;
}

function OccurrenceLinks(props: {
  record: RouteTotalityInspectorRecord;
  onSelect: (selection: RouteTotalityInspectorSelection) => void;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <Show when={props.record.definition || props.record.otherCallSites.length}>
    <section class="route-totality-inspector-section">
      <h3>Occurrence links</h3>
      <Show when={props.record.definition}>
        {(definition) => <div class="route-totality-definition">
          <strong>Shared definition · {definition().name}</strong>
          <Show when={definition().location} fallback={<code>Definition location unavailable</code>}>
            {(location) => <div class="route-totality-source-item">
              <button type="button" onClick={() => props.onOpenSource(sourceTargetForLocation(location()))}>
                <code>{formatLocation(location())}</code><span>Open exact code</span>
              </button>
              <a href={locationHref(location())} title={`Open full file ${location().file}`}>Full file</a>
            </div>}
          </Show>
          <p>{definition().external ? "External definition." : `${definition().sourceFile ?? "Source file unavailable"} · ${definition().importModule ?? "local module"}`}</p>
        </div>}
      </Show>
      <Show when={props.record.otherCallSites.length} fallback={<Show when={props.record.definition}><p>No other call site was returned for this definition.</p></Show>}>
        <h4>Other call sites <span>{props.record.otherCallSites.length}</span></h4>
        <div class="route-totality-link-list"><For each={props.record.otherCallSites}>{(item) => <SelectionLink item={item} onSelect={props.onSelect} />}</For></div>
      </Show>
    </section>
  </Show>;
}

function Fact(props: { label: string; value: string; mono?: boolean }) {
  return <div><dt>{props.label}</dt><dd classList={{ mono: props.mono }}>{props.value}</dd></div>;
}

function formatLocation(location: RouteTotalityLocation) {
  const span = `${location.span.startLine}:${location.span.startColumn}–${location.span.endLine}:${location.span.endColumn}`;
  return `${location.file}:${location.line}:${location.column} · ${span}`;
}

function locationHref(location: RouteTotalityLocation) {
  return `/file?path=${encodeURIComponent(location.file)}#L${location.line}`;
}

function findingHref(entry: RouteTotalityFindingMatch["entry"]) {
  return `/file?path=${encodeURIComponent(entry.detailRef.file)}&finding=${encodeURIComponent(entry.detailRef.id)}#L${entry.location.line}`;
}

function recordKindLabel(kind: RouteTotalityInspectorRecord["kind"], family?: RouteTotalityInspectorRecord["family"]) {
  return kind === "edge" ? `${family ?? "unknown"} edge` : routeTotalityNodeKindLabel(kind);
}
