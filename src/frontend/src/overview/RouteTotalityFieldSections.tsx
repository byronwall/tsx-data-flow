import { For, Show } from "solid-js";
import type { RouteTotalityFieldInspectorGroup, RouteTotalityFieldInspectorResult } from "./route-totality-field-inspector-model";
import { routeTotalityFieldFrontierReason } from "./route-totality-field-inspector-model";
import type { SourceEvidenceTarget } from "./source-evidence-model";
import { sourceTargetForLocation } from "./route-source-targets";
import type { RouteTotalityLocation } from "./route-totality-model";

export function RouteTotalityFieldSections(props: {
  result: RouteTotalityFieldInspectorResult | null;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <Show when={props.result}>
    {(result) => <>
      <section class="route-totality-inspector-section route-totality-field-section">
        <h3>{fieldSectionHeading(result().scope)} <span>{result().attachments.length}</span></h3>
        <Show when={result().status === "no-origin"}>
          <p>Select an origin to show proven fields.</p>
        </Show>
        <Show when={result().status === "unavailable"}>
          <p>{result().unavailableReason ?? "Field lineage is unavailable for this route."}</p>
        </Show>
        <Show when={result().status === "no-fields"}>
          <p>{noProvenFieldsMessage(result())}</p>
        </Show>
        <Show when={result().status === "proven" || result().status === "partial"}>
          <Show when={result().attachments.length > 0} fallback={<p>{noProvenFieldsMessage(result())}</p>}>
            <For each={result().groups.filter((group) => group.attachments.length > 0)}>{(group) => <FieldGroup group={group} onOpenSource={props.onOpenSource} />}</For>
          </Show>
        </Show>
      </section>
      <Show when={result().frontiers.length > 0}>
        <section class="route-totality-inspector-section route-totality-field-frontier-section">
          <h3>Field continuity stopped <span>{result().frontiers.length}</span></h3>
          <For each={result().groups}>{(group) => <Show when={group.frontiers.length > 0}>
            <FieldFrontierGroup group={group} onOpenSource={props.onOpenSource} />
          </Show>}</For>
        </section>
      </Show>
    </>}
  </Show>;
}

function FieldGroup(props: {
  group: RouteTotalityFieldInspectorGroup;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <div class="route-totality-field-group">
    <FieldGroupHeading group={props.group} />
    <div class="route-totality-field-list">
      <For each={props.group.attachments}>{(item) => {
        const location = item.attachment.field.location;
        return <article class="route-totality-field-item">
          <strong><code>{item.attachment.field.label}</code></strong>
          <span>{item.attachment.proof[0]?.status ?? "unknown"} · {item.terminalCount} render terminal{item.terminalCount === 1 ? "" : "s"}</span>
          <button type="button" onClick={() => props.onOpenSource(sourceTargetForLocation(location))}>
            <code>Field read · {formatLocation(location)}</code><span>Open exact code</span>
          </button>
        </article>;
      }}</For>
    </div>
  </div>;
}

function FieldFrontierGroup(props: {
  group: RouteTotalityFieldInspectorGroup;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <div class="route-totality-field-group">
    <FieldGroupHeading group={props.group} />
    <div class="route-totality-field-list">
      <For each={props.group.frontiers}>{(item) => {
        const location = item.frontier.location ?? item.frontier.proof[0]?.locations[0] ?? null;
        return <article class="route-totality-field-item">
          <Show when={item.frontier.field}>{(field) => <strong><code>{field().label}</code></strong>}</Show>
          <span>{routeTotalityFieldFrontierReason(item.frontier.reason)}</span>
          <Show when={location} fallback={<span>No exact stop location was returned.</span>}>
            {(stopLocation) => <button type="button" onClick={() => props.onOpenSource(sourceTargetForLocation(stopLocation()))}>
              <code>Stopped at · {formatLocation(stopLocation())}</code><span>Open proof/source</span>
            </button>}
          </Show>
        </article>;
      }}</For>
    </div>
  </div>;
}

function FieldGroupHeading(props: { group: RouteTotalityFieldInspectorGroup }) {
  return <header class="route-totality-field-group-heading">
    <strong>{props.group.label}</strong>
    <Show when={props.group.occurrenceId !== null}>
      <Show when={props.group.location} fallback={<small>Original occurrence · {props.group.occurrenceId}</small>}>
        {(location) => <small>Call site · {formatLocation(location())}</small>}
      </Show>
    </Show>
  </header>;
}

function formatLocation(location: RouteTotalityLocation) {
  const span = `${location.span.startLine}:${location.span.startColumn}–${location.span.endLine}:${location.span.endColumn}`;
  return `${location.file}:${location.line}:${location.column} · ${span}`;
}

function fieldSectionHeading(scope: RouteTotalityFieldInspectorResult["scope"]): string {
  return scope.kind === "origin"
    ? "Source fields from this origin"
    : "Source fields through this occurrence";
}

function noProvenFieldsMessage(result: RouteTotalityFieldInspectorResult): string {
  return result.scope.kind === "origin"
    ? "No proven fields continue from this origin."
    : "No proven fields reach this occurrence.";
}
