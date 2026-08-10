import { For, Show } from "solid-js";
import type { RouteDataDetail, RouteTotality } from "../../../api/contracts";
import type { RouteTotalityCountSummary, RouteTotalityGraphSummary } from "./route-totality-model";
import type { RouteTotalityLedgerSection } from "./route-totality-graph-state";
import { DisplayLegendMark } from "./RouteTotalityDisplayMarks";
import { RouteTotalityCoverageLedger } from "./RouteTotalityCoverageLedger";
import { RouteTotalityEvidenceSection } from "./RouteTotalityEvidenceSection";
import type { RouteTotalityFieldInspectorResult } from "./route-totality-field-inspector-model";
import type { SourceEvidenceTarget } from "./source-evidence-model";

export function RouteTotalityOverview(props: {
  totality: RouteTotality | null;
  shadowEvidence: RouteDataDetail["shadowEvidence"];
  summary: RouteTotalityGraphSummary;
  counts: readonly RouteTotalityCountSummary[];
  ledgerItems: readonly RouteTotalityLedgerSection[];
  fieldResult: RouteTotalityFieldInspectorResult | null;
  startSelectionAvailable: boolean;
  onSelectStart: () => void;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <div class="route-totality-overview">
    <header class="route-totality-overview-header">
      <span class={`route-totality-status status-${props.summary.status}`} role="status">{props.summary.statusLabel}</span>
      <strong>{props.summary.status === "unavailable" ? "Totality unavailable" : "Route overview"}</strong>
      <p>{overviewMessage(props.totality, props.summary)}</p>
      <div class="route-totality-overview-actions">
        <button type="button" disabled={!props.startSelectionAvailable} onClick={() => props.onSelectStart()}>Select first route entry</button>
      </div>
    </header>
    <section class="route-totality-inspector-section">
      <h3>Route surface</h3>
      <dl class="route-totality-overview-counts">
        <For each={props.counts}>{(count) => <div><dt>{count.label}</dt><dd>{count.text}</dd></div>}</For>
        <Show when={props.totality?.bridgeCounts}>{(counts) => <div><dt>Proven handoffs</dt><dd>{counts().proven}/{counts().total}</dd></div>}</Show>
      </dl>
      <Show when={props.summary.status !== "complete"}><p class="route-totality-overview-note">{props.summary.note}</p></Show>
    </section>
    <section class="route-totality-inspector-section">
      <h3>Legend</h3>
      <div class="route-totality-overview-legend" aria-label="Route totality legend">
        <DisplayLegendMark kind="origin" label="Origin" /><DisplayLegendMark kind="occurrence" label="Occurrence" /><DisplayLegendMark kind="boundary" label="Framework boundary" /><DisplayLegendMark kind="terminal" label="Terminal" /><DisplayLegendMark kind="gap" label="Gap" />
        <DisplayLegendMark kind="edge-render" label="Render edge" /><DisplayLegendMark kind="edge-data" label="Data edge" /><DisplayLegendMark kind="edge-boundary" label="Boundary edge" /><DisplayLegendMark kind="field-path" label="Proven field path" />
      </div>
    </section>
    <RouteTotalityCoverageLedger items={props.ledgerItems} inspector />
    <RouteTotalityEvidenceSection shadowEvidence={props.shadowEvidence} totality={props.totality} selected={null} fieldResult={props.fieldResult} onOpenSource={props.onOpenSource} />
  </div>;
}

function overviewMessage(totality: RouteTotality | null, summary: RouteTotalityGraphSummary) {
  if (!totality) return "The server returned no route totality record for this route.";
  if (totality.status === "unavailable") {
    if ("reason" in totality.occurrenceSurface) return `The occurrence surface is unavailable: ${totality.occurrenceSurface.reason}`;
    if ("reason" in totality.evidenceSlice) return `The evidence slice is unavailable: ${totality.evidenceSlice.reason}`;
    return "The route totality record is unavailable for this route.";
  }
  return summary.status === "complete"
    ? "Select a mark or edge to inspect its proof and connections."
    : "Select a mark or edge to inspect proof. Coverage limits appear below.";
}
