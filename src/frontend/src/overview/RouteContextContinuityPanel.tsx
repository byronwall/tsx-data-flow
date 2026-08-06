import { For, Show } from "solid-js";
import { contextDensityLabel, type ContextDisplayMode } from "./route-context-continuity-density";
import {
  contextMatchesFilter,
  contextStatusLabel,
  contextStatusSymbol,
  type ContextStatusFilter,
  type ContextVisualRecord,
} from "./route-context-continuity-index";
import type { RouteContextContinuityUiState } from "./route-context-continuity-state";
import { RouteContextContinuityInspector } from "./RouteContextContinuityInspector";

const FILTERS: readonly { value: ContextStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "proven", label: "Proven" },
  { value: "partial", label: "Partial" },
  { value: "unsupported", label: "Unsupported" },
  { value: "gaps", label: "Gaps" },
];

const DISPLAY_MODES: readonly { value: ContextDisplayMode; label: string }[] = [
  { value: "automatic", label: "Automatic" },
  { value: "overlay", label: "Links" },
  { value: "marks", label: "Marks" },
];

export function RouteContextContinuityPanel(props: {
  state: RouteContextContinuityUiState;
}) {
  const visibleCount = () => props.state.visibleRecords().length;
  const globalLabel = () => {
    const status = props.state.index().status;
    if (status === "complete") return "Complete continuity";
    if (status === "partial") return "Partial continuity";
    return "Continuity unavailable";
  };
  return <section class="route-context-panel" aria-labelledby="route-context-panel-title">
    <header class="route-context-panel-header">
      <div>
        <h2 id="route-context-panel-title">Context continuity</h2>
        <span class={`route-context-global-status status-${props.state.index().status}`}>{globalLabel()}</span>
      </div>
      <dl class="route-context-counts">
        <Count label="Contexts" value={props.state.index().counts.declarations} />
        <Count label="Providers" value={props.state.index().counts.providers} />
        <Count label="Consumers" value={props.state.index().counts.consumers} />
        <Count label="Links" value={props.state.index().counts.links} />
        <Count label="Gaps" value={props.state.index().counts.gaps} />
      </dl>
    </header>

    <div class="route-context-controls">
      <div>
        <span>Status</span>
        <div class="route-context-toggle-group" role="group" aria-label="Filter contexts by continuity status">
          <For each={FILTERS}>{(item) => <button
            type="button"
            aria-pressed={props.state.filter() === item.value}
            onClick={() => props.state.setFilter(item.value)}
          >{item.label} <b>{filterCount(props.state.index().records, item.value)}</b></button>}</For>
        </div>
      </div>
      <div>
        <span>Display</span>
        <div class="route-context-toggle-group" role="group" aria-label="Choose context graph display">
          <For each={DISPLAY_MODES}>{(item) => <button
            type="button"
            aria-pressed={props.state.displayMode() === item.value}
            onClick={() => props.state.setDisplayMode(item.value)}
          >{item.label}</button>}</For>
        </div>
      </div>
      <p class="route-context-display-note">Automatic shows links when a context has at most 3 consumers and 2 Providers. It uses marks otherwise. Focus always shows explicit links.</p>
    </div>

    <Show when={props.state.index().status !== "unavailable"} fallback={<p class="route-context-empty">The analyzer did not return context continuity for this route.</p>}>
      <Show when={props.state.index().records.length} fallback={<p class="route-context-empty">No context declaration was returned. Unmapped context gaps remain visible in the global gap count.</p>}>
        <Show when={visibleCount()} fallback={<p class="route-context-empty">No context matches this status filter.</p>}>
          <ul class="route-context-list" aria-label={`${visibleCount()} visible contexts`}>
            <For each={props.state.visibleRecords()}>{(record) => <ContextRow
              record={record}
              focused={props.state.focusedId() === record.id}
              onFocus={() => props.state.focus(record.id)}
              onClear={props.state.clearFocus}
            />}</For>
          </ul>
        </Show>
      </Show>
    </Show>

    <Show when={props.state.index().unassignedGaps.length}>
      <p class="route-context-unassigned-gaps">{props.state.index().unassignedGaps.length} gap{props.state.index().unassignedGaps.length === 1 ? "" : "s"} could not map to a context declaration. No relation was guessed.</p>
    </Show>
    <Show when={props.state.focused()}>{(record) => <RouteContextContinuityInspector record={record()} onClear={props.state.clearFocus} />}</Show>
  </section>;
}

function ContextRow(props: {
  record: ContextVisualRecord;
  focused: boolean;
  onFocus: () => void;
  onClear: () => void;
}) {
  return <li class={`context-color-${props.record.colorIndex}`} classList={{ focused: props.focused }}>
    <div class="route-context-row-main">
      <span class="route-context-swatch" aria-hidden="true"><i /></span>
      <div>
        <strong><code>{props.record.label}</code></strong>
        <span class={`route-context-status status-${props.record.status}`}><b aria-hidden="true">{contextStatusSymbol(props.record.status)}</b> {contextStatusLabel(props.record.status)}</span>
      </div>
      <dl>
        <Count label="Providers" value={props.record.providers.length} />
        <Count label="Consumers" value={props.record.consumers.length} />
        <Count label="Links" value={props.record.links.length} />
        <Count label="Density" value={contextDensityLabel(props.record.density)} />
        <Count label="Gaps" value={props.record.gaps.length} />
      </dl>
    </div>
    <div class="route-context-row-actions">
      <Show when={props.focused} fallback={<button type="button" aria-pressed="false" onClick={props.onFocus}>Focus</button>}>
        <button type="button" aria-pressed="true" onClick={() => props.onClear()}>Clear focus</button>
      </Show>
    </div>
  </li>;
}

function Count(props: { label: string; value: number | string }) {
  return <div><dt>{props.label}</dt><dd>{props.value}</dd></div>;
}

function filterCount(records: readonly ContextVisualRecord[], filter: ContextStatusFilter): number {
  return records.filter((record) => contextMatchesFilter(record, filter)).length;
}
