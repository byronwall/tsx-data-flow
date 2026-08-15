import { For, Show } from "solid-js";
import type {
  RouteTotalityFieldInspectorGroup,
  RouteTotalityFieldInspectorResult,
  RouteTotalityFieldSummary,
  RouteTotalityFieldUse,
} from "./route-totality-field-inspector-model";
import { routeTotalityFieldFrontierReason } from "./route-totality-field-inspector-model";
import type { SourceEvidenceTarget } from "./source-evidence-model";
import { sourceTargetForLocation } from "./route-source-targets";
import type { RouteTotalityLocation } from "./route-totality-model";

export function RouteTotalityFieldSections(props: {
  result: RouteTotalityFieldInspectorResult | null;
  selectedFieldPath: string | null;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
  onFieldFocusChange: (fieldFocus: string | null, consumerFocus?: string | null) => void;
  onClearFieldFocus: () => void;
}) {
  const result = () => narrowFieldResult(props.result, props.selectedFieldPath);
  return <Show when={result()}>
    {(result) => <>
      <section class="route-totality-inspector-section route-totality-field-section">
        <div class="route-totality-field-heading">
          <div>
            <h3>{fieldSectionHeading(result())} <span>{fieldCountLabel(result().fields.length)} · {result().attachments.length} {result().attachments.length === 1 ? "use" : "uses"}</span></h3>
            <p>{fieldSectionDescription(result())}</p>
          </div>
          <Show when={result().selectedField}>
            <Show when={result().selectedConsumer}>
              <button type="button" class="route-totality-field-clear" onClick={() => props.onFieldFocusChange(result().selectedField, null)}>Show all uses</button>
            </Show>
            <button type="button" class="route-totality-field-clear" onClick={props.onClearFieldFocus}>Show all fields</button>
          </Show>
        </div>
        <Show when={result().status === "no-origin"}>
          <p>Select an origin to show proven fields.</p>
        </Show>
        <Show when={result().status === "unavailable"}>
          <p>{result().unavailableReason ?? "Field lineage is unavailable for this route."}</p>
        </Show>
        <Show when={result().status === "no-fields" && result().fields.length === 0}>
          <p>{noProvenFieldsMessage(result())}</p>
        </Show>
        <Show when={result().fields.length > 0} fallback={<Show when={result().status === "proven" || result().status === "partial"}><p>{noProvenFieldsMessage(result())}</p></Show>}>
          <div class="route-totality-proven-fields" aria-label="Available fields">
            <For each={result().fields}>{(field) => <FieldSummary field={field} availableFieldPaths={result().availableFieldPaths} onOpenSource={props.onOpenSource} onFieldFocusChange={props.onFieldFocusChange} />}</For>
          </div>
          <Show when={result().selectedField}><WholeObjectHandoffs handoffs={buildWholeObjectHandoffs(result().fields)} /></Show>
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

function narrowFieldResult(
  result: RouteTotalityFieldInspectorResult | null,
  selectedFieldPath: string | null,
): RouteTotalityFieldInspectorResult | null {
  if (!result || !selectedFieldPath || result.selectedField === selectedFieldPath) return result;
  const attachments = result.attachments.filter((item) => item.attachment.field.label === selectedFieldPath);
  const frontiers = result.frontiers.filter((item) => item.frontier.field?.label === selectedFieldPath);
  const groups = result.groups.map((group) => ({
    ...group,
    attachments: group.attachments.filter((item) => item.attachment.field.label === selectedFieldPath),
    frontiers: group.frontiers.filter((item) => item.frontier.field?.label === selectedFieldPath),
  })).filter((group) => group.attachments.length > 0 || group.frontiers.length > 0);
  return {
    ...result,
    groups,
    attachments,
    frontiers,
    fields: result.fields.filter((field) => field.label === selectedFieldPath),
    selectedField: selectedFieldPath,
  };
}

function FieldSummary(props: {
  field: RouteTotalityFieldSummary;
  availableFieldPaths: readonly string[];
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
  onFieldFocusChange: (fieldFocus: string | null, consumerFocus?: string | null) => void;
}) {
  const nestedFields = () => countNestedFields(props.availableFieldPaths, props.field.label);
  return <article class="route-totality-field-summary" classList={{ selected: props.field.selected && props.field.proven, unproven: props.field.selected && !props.field.proven }}>
    <button
      type="button"
      class="route-totality-field-summary-trigger"
      aria-pressed={props.field.selected}
      aria-label={`${props.field.selected ? "Clear" : "Focus"} ${props.field.proven ? "proven" : "available"} field ${props.field.label}`}
      onClick={() => props.onFieldFocusChange(props.field.selected ? null : props.field.label, null)}
    >
      <code>{props.field.label}</code>
      <span>{fieldSummaryLabel(props.field, nestedFields())}</span>
    </button>
    <Show when={props.field.selected && props.field.proven}><div class="route-totality-field-occurrences">
      <For each={props.field.occurrences}>{(occurrence) => <section class="route-totality-field-occurrence">
        <header>
          <strong>{occurrence.componentName}</strong>
          <Show when={occurrence.location}>
            {(location) => <a href={locationHref(location())} title={location().file}><code>{shortLocation(location())}</code></a>}
          </Show>
        </header>
        <For each={occurrence.uses}>{(use) => <FieldUse use={use} fieldLabel={props.field.label} onOpenSource={props.onOpenSource} onFieldFocusChange={props.onFieldFocusChange} />}</For>
      </section>}</For>
    </div></Show>
  </article>;
}

function FieldUse(props: {
  use: RouteTotalityFieldUse;
  fieldLabel: string;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
  onFieldFocusChange: (fieldFocus: string | null, consumerFocus?: string | null) => void;
}) {
  const location = () => props.use.consumerLocation ?? props.use.attachment.field.location;
  return <div class="route-totality-field-use-row">
    <details class="route-totality-field-use" open={props.use.selected}>
      <summary onClick={() => props.onFieldFocusChange(props.fieldLabel, props.use.key)}>
        <span><b>{props.use.consumerLabel}</b><small>{props.use.consumerKind}</small><Show when={props.use.aliasLabel}><small class="route-totality-field-alias-step">Alias · <code>{props.use.aliasLabel}</code></small></Show></span>
        <span class="route-totality-field-use-meta"><code title={formatLocation(location())}>{shortLocation(location())}</code></span>
      </summary>
      <div class="route-totality-field-proof">
        <dl>
          <div><dt>Component occurrence</dt><dd>{props.use.componentName} · <code>{props.use.occurrenceId}</code></dd></div>
          <div><dt>Field read</dt><dd><ProofLocation location={props.use.attachment.field.location} label="Open field read" onOpenSource={props.onOpenSource} /></dd></div>
          <div><dt>Consumer</dt><dd><ProofLocation location={location()} label="Open exact consumer" onOpenSource={props.onOpenSource} /></dd></div>
          <Show when={props.use.aliasLabel}><div><dt>Alias</dt><dd><code>{props.use.aliasLabel}</code></dd></div></Show>
        </dl>
        <details class="route-totality-proof-steps">
          <summary>Proof steps <span>{props.use.attachment.transformationKinds.length}</span></summary>
          <ol><For each={props.use.attachment.transformationKinds}>{(kind) => <li><code>{kind}</code></li>}</For></ol>
        </details>
      </div>
    </details>
    <Show when={props.use.attachment.consumer && props.use.attachment.terminalIds.length > 0}>
      <button
        type="button"
        class="route-totality-field-use-isolate"
        aria-label={`${props.use.selected ? "Show all uses instead of isolating" : "Isolate exact path for"} ${props.use.consumerLabel}`}
        aria-pressed={props.use.selected}
        onClick={() => props.onFieldFocusChange(props.fieldLabel, props.use.selected ? null : props.use.key)}
      >{props.use.selected ? "Show all uses" : "Isolate path"}</button>
    </Show>
  </div>;
}

type WholeObjectHandoff = { componentName: string; fieldLabel: string; occurrenceId: string };

function buildWholeObjectHandoffs(fields: readonly RouteTotalityFieldSummary[]): WholeObjectHandoff[] {
  const handoffs = new Map<string, WholeObjectHandoff>();
  for (const field of fields) {
    for (const occurrence of field.occurrences) {
      for (const use of occurrence.uses) {
        if (!use.attachment.transformationKinds.includes("jsx-component-prop") || use.aliasLabel) continue;
        const key = `${use.occurrenceId}:${use.componentName}`;
        if (!handoffs.has(key)) handoffs.set(key, { componentName: use.componentName, fieldLabel: objectPath(field.label), occurrenceId: use.occurrenceId });
      }
    }
  }
  return [...handoffs.values()];
}

function WholeObjectHandoffs(props: { handoffs: WholeObjectHandoff[] }) {
  return <Show when={props.handoffs.length}>
    <div class="route-totality-whole-object">
      <h4>Whole-object handoff <span>{props.handoffs.length}</span></h4>
      <p>The object handoff is separate from scalar field lineage.</p>
      <ul><For each={props.handoffs}>{(handoff) => <li><code>{handoff.fieldLabel}</code><span>→ {handoff.componentName} · <code>{handoff.occurrenceId}</code></span></li>}</For></ul>
    </div>
  </Show>;
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
            {(stopLocation) => <ProofLocation location={stopLocation()} label="Open proof/source" onOpenSource={props.onOpenSource} />}
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

function ProofLocation(props: {
  location: RouteTotalityLocation;
  label: string;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
}) {
  return <span class="route-totality-proof-location-inline">
    <button type="button" onClick={() => props.onOpenSource(sourceTargetForLocation(props.location))}>
      <code title={formatLocation(props.location)}>{formatLocation(props.location)}</code><small>{props.label}</small>
    </button>
    <a href={locationHref(props.location)} title={`Open full file ${props.location.file}`}>Full file</a>
  </span>;
}

function formatLocation(location: RouteTotalityLocation) {
  const span = `${location.span.startLine}:${location.span.startColumn}–${location.span.endLine}:${location.span.endColumn}`;
  return `${location.file}:${location.line}:${location.column} · ${span}`;
}

function shortLocation(location: RouteTotalityLocation) {
  return `${location.file.split("/").at(-1) ?? location.file}:${location.line}`;
}

function locationHref(location: RouteTotalityLocation) {
  return `/file?path=${encodeURIComponent(location.file)}#L${location.line}`;
}

function objectPath(label: string) {
  const lastDot = label.lastIndexOf(".");
  return lastDot > 0 ? label.slice(0, lastDot) : label;
}

function countNestedFields(fields: readonly string[], label: string) {
  const prefix = `${label}[*].`;
  return fields.filter((field) => field.startsWith(prefix)).length;
}

function fieldSummaryLabel(field: RouteTotalityFieldSummary, nestedFields: number) {
  if (field.proven) return `${field.useCount} ${field.useCount === 1 ? "use" : "uses"} · ${field.componentCount} ${field.componentCount === 1 ? "component" : "components"}`;
  if (nestedFields > 0) return `Collection · ${nestedFields} item ${nestedFields === 1 ? "field" : "fields"}`;
  return "Available · no proven route use";
}

function fieldSectionHeading(result: RouteTotalityFieldInspectorResult): string {
  if (result.selectedField) return "Selected field";
  if (result.fields.some((field) => !field.proven)) return "Available fields";
  return result.scope.kind === "origin" ? "Proven fields" : "Fields through occurrence";
}

function fieldSectionDescription(result: RouteTotalityFieldInspectorResult) {
  if (!result.selectedField) return "Choose a field to show its consumers and proof.";
  const field = result.fields[0];
  if (field && !field.proven && countNestedFields(result.availableFieldPaths, field.label) > 0) return "This collection contains the item fields listed in the picker.";
  return field?.proven ? "Consumers and proof for this field." : "No proven consumer for this field.";
}

function fieldCountLabel(count: number) {
  return `${count} ${count === 1 ? "field" : "fields"}`;
}

function noProvenFieldsMessage(result: RouteTotalityFieldInspectorResult): string {
  return result.scope.kind === "origin" ? "No proven fields continue from this source." : "No proven fields reach this occurrence.";
}
