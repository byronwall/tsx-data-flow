import { For, Show, type JSX } from "solid-js";
import type { RouteTotalityLocation, RouteTotalityProof } from "./route-totality-model";
import { contextDensityDescription } from "./route-context-continuity-density";
import {
  contextLinkMappingMessage,
  contextStatusLabel,
  contextStatusSymbol,
  type ContextVisualRecord,
} from "./route-context-continuity-index";
import { sourceTargetForLocation } from "./route-source-targets";
import type { SourceEvidenceTarget } from "./source-evidence-model";
import type { RouteTotalityInspectorSelection } from "./route-totality-inspector-model";
import {
  routeInvestigationSelectionForContextDeclaration,
  routeInvestigationSelectionForContextLink,
  routeInvestigationSelectionForContextOccurrence,
} from "./route-investigation-selection";

export function RouteContextContinuityInspector(props: {
  record: ContextVisualRecord;
  onClear: () => void;
  onOpenSource: (target: SourceEvidenceTarget, contextTargets?: readonly SourceEvidenceTarget[]) => void;
  onSelect: (selection: RouteTotalityInspectorSelection) => void;
}) {
  const defaultValue = () => props.record.declaration?.defaultValueId
    ? props.record.records.values.find((value) => value.id === props.record.declaration?.defaultValueId) ?? null
    : null;
  const proofs = () => collectProofs(props.record);
  const proofTargets = () => createTraceTargets(proofs());

  const openContextLocation = (location: RouteTotalityLocation) => {
    const target = sourceTargetForLocation(location, proofTargets().length);
    props.onOpenSource(target, proofTargets());
  };

  return <div class="route-context-detail">
    <header class="route-context-detail-header">
      <div>
        <span class={`route-context-status status-${props.record.status}`}>
          <b aria-hidden="true">{contextStatusSymbol(props.record.status)}</b> {contextStatusLabel(props.record.status)}
        </span>
        <h3><code>{props.record.label}</code></h3>
        <p>{contextDensityDescription(props.record.density)}</p>
      </div>
      <button type="button" onClick={() => props.onSelect(routeInvestigationSelectionForContextDeclaration(props.record.id))}>Select context</button>
      <button type="button" onClick={() => props.onClear()}>Clear focus</button>
    </header>

    <DetailSection title="Declaration">
      <Show when={props.record.declaration} fallback={<p>No declaration record was returned for this context identity.</p>}>
        {(declaration) => <dl class="route-context-facts">
          <Fact label="Identity" value={declaration().id} mono />
          <Fact label="Default" value={defaultValue() ? `Available · ${defaultValue()!.expression}` : "No default value"} mono={Boolean(defaultValue())} />
          <Fact label="Location" value={locationLabel(declaration().location)} href={locationHref(declaration().location)} mono />
        </dl>}
      </Show>
    </DetailSection>

    <DetailSection title="Provider occurrences" count={props.record.providers.length}>
      <Show when={props.record.providers.length} fallback={<p>No Provider occurrence was returned. Default-backed reads and missing-Provider gaps remain separate below.</p>}>
        <div class="route-context-evidence-list"><For each={props.record.providers}>{(provider) => {
          const value = () => props.record.records.values.find((item) => item.id === provider.valueId);
          const mapped = () => props.record.marks.some((mark) => mark.role === "provider" && mark.occurrenceId === provider.id);
          return <article>
            <div><strong><span class="route-context-role-symbol role-provider" aria-hidden="true" /> Provider</strong><span>{provider.status} · {provider.ownership} · {provider.repetition}</span></div>
            <code>{value()?.expression ?? "Provided value record unavailable"}</code>
            <small>
              {mapped() ? "Mapped to a visible route node" : "Route node unmapped"} ·
              <button type="button" onClick={() => props.onSelect(routeInvestigationSelectionForContextOccurrence(props.record.id, provider.id, "provider"))}>Select provider</button>
              <button type="button" onClick={() => openContextLocation(provider.location)}>Open code</button>
              <a href={locationHref(provider.location)} title={`Open full file ${provider.location.file}`}>Full file</a>
            </small>
          </article>;
        }}</For></div>
      </Show>
    </DetailSection>

    <DetailSection title="Consumer occurrences" count={props.record.consumers.length}>
      <Show when={props.record.consumers.length} fallback={<p>No consumer occurrence was returned.</p>}>
        <div class="route-context-evidence-list"><For each={props.record.consumers}>{(consumer) => {
            const reads = () => consumer.readIds.flatMap((id) => {
              const read = props.record.records.reads.find((item) => item.id === id);
              return read ? [read] : [];
            });
            const mapped = () => props.record.marks.some((mark) => mark.role === "consumer" && mark.occurrenceId === consumer.id);
            return <article>
              <div><strong><span class="route-context-role-symbol role-consumer" aria-hidden="true" /> Consumer</strong><span>{consumer.status} · {consumer.repetition}</span></div>
              <code>{reads().map((read) => read.expression).join(" / ") || "Read record unavailable"}</code>
              <small>
                {mapped() ? "Mapped to a visible route node" : "Route node unmapped"} ·
                <button type="button" onClick={() => props.onSelect(routeInvestigationSelectionForContextOccurrence(props.record.id, consumer.id, "consumer"))}>Select consumer</button>
                <button type="button" onClick={() => openContextLocation(consumer.location)}>Open code</button>
                <a href={locationHref(consumer.location)} title={`Open full file ${consumer.location.file}`}>Full file</a>
              </small>
            </article>;
        }}</For></div>
      </Show>
    </DetailSection>

    <DetailSection title="Continuity links" count={props.record.links.length}>
        <Show when={props.record.links.length} fallback={<p>No Provider-to-consumer continuity link was returned.</p>}>
        <div class="route-context-link-evidence"><For each={props.record.links}>{(link) => <article>
          <div>
            <strong>{link.link.sourceKind === "default" ? "Default → consumer" : "Provider → consumer"}</strong>
            <span class={`status-${link.status}`}>{contextStatusSymbol(link.status)} {contextStatusLabel(link.status)}</span>
          </div>
          <code>{link.read?.expression ?? "Read unavailable"}</code>
          <button type="button" onClick={() => props.onSelect(routeInvestigationSelectionForContextLink(link.link.id, link.from?.nodeId ?? null, link.to?.nodeId ?? null))}>Select link</button>
          <ExactPaths paths={link.link.memberPaths} />
          <Show when={contextLinkMappingMessage(link)}>{(message) => <p>{message()}</p>}</Show>
        </article>}</For></div>
      </Show>
    </DetailSection>

    <DetailSection title="Cross-context relays" count={props.record.relays.length}>
      <Show when={props.record.relays.length} fallback={<p>No cross-context relay was returned.</p>}>
        <div class="route-context-link-evidence"><For each={props.record.relays}>{(relay) => <article>
          <div><strong>Source → factory → target</strong><span class={`status-${relay.status}`}>{contextStatusSymbol(relay.status)} {contextStatusLabel(relay.status)}</span></div>
          <code>{relay.pathLabel}</code>
          <small>
            {relay.relay.factoryCallExpression} ·
            <button type="button" onClick={() => openContextLocation(relay.relay.factoryCallLocation)}>{locationLabel(relay.relay.factoryCallLocation)}</button>
            <a href={locationHref(relay.relay.factoryCallLocation)} title={`Open full file ${relay.relay.factoryCallLocation.file}`}>Full file</a>
          </small>
          <Show when={!relay.from || !relay.to}><p>The relay is proven as evidence, but both graph endpoints could not map. No overlay was guessed.</p></Show>
        </article>}</For></div>
      </Show>
    </DetailSection>

    <DetailSection title="Continuity gaps" count={props.record.gaps.length}>
      <Show when={props.record.gaps.length} fallback={<p>No context gap was returned for this declaration.</p>}>
        <div class="route-context-gap-list"><For each={props.record.gaps}>{(gap) => <article>
          <strong>{gap.label}</strong><span>{gap.status} · {humanize(gap.reason)}</span>
          <small>
            {gap.location
              ? <><button type="button" onClick={() => openContextLocation(gap.location!)}>{locationLabel(gap.location!)}</button><a href={locationHref(gap.location)} title={`Open full file ${gap.location.file}`}>Full file</a></>
              : "No exact gap location returned"}
          </small>
        </article>}</For></div>
      </Show>
    </DetailSection>

    <DetailSection title="Proof and locations" count={proofs().length}>
      <Show when={proofs().length} fallback={<p>No proof record was returned.</p>}>
        <div class="route-context-proof-list"><For each={proofs()}>{(proof, index) => <article>
          <strong>{proof.kind}</strong><span>{proof.status} · {proof.detail}</span>
          <For each={proof.locations}>{(location, locationIndex) => <>
            <button type="button" onClick={() => props.onOpenSource(sourceTargetForLocation(location, index()), proofTargets())}>
              <code>{locationLabel(location)}</code>
            </button>
            <a href={locationHref(location)} title={`Open full file ${location.file}`}>Full file</a>
          </>}</For>
        </article>}</For></div>
      </Show>
    </DetailSection>
  </div>;
}

function DetailSection(props: { title: string; count?: number; children: JSX.Element }) {
  return <section class="route-context-detail-section">
    <h4>{props.title}<Show when={props.count !== undefined}><span>{props.count}</span></Show></h4>
    {props.children}
  </section>;
}

function Fact(props: { label: string; value: string; href?: string; mono?: boolean }) {
  return <div><dt>{props.label}</dt><dd classList={{ mono: props.mono }}><Show when={props.href} fallback={props.value}>{(href) => <a href={href()}>{props.value}</a>}</Show></dd></div>;
}

function ExactPaths(props: { paths: readonly (readonly string[])[] }) {
  return <Show when={props.paths.length} fallback={<p>No exact member path was returned.</p>}>
    <div class="route-context-member-paths"><For each={props.paths}>{(path) => <code>{path.join(".")}</code>}</For></div>
  </Show>;
}

function collectProofs(record: ContextVisualRecord): RouteTotalityProof[] {
  const records = [
    ...(record.declaration?.proof ?? []),
    ...record.providers.flatMap((provider) => provider.proof),
    ...record.consumers.flatMap((consumer) => consumer.proof),
    ...record.links.flatMap((link) => link.link.proof),
    ...record.relays.flatMap((relay) => relay.relay.proof),
    ...record.gaps.flatMap((gap) => gap.proof),
  ];
  const unique = new Map<string, RouteTotalityProof>();
  for (const proof of records) {
    const key = `${proof.kind}:${proof.status}:${proof.detail}:${proof.locations.map(locationLabel).join("|")}`;
    if (!unique.has(key)) unique.set(key, proof);
  }
  return [...unique.values()];
}

function createTraceTargets(proofs: readonly RouteTotalityProof[]): readonly SourceEvidenceTarget[] {
  const targets: SourceEvidenceTarget[] = [];
  for (const proof of proofs) {
    for (let index = 0; index < proof.locations.length; index += 1) {
      const location = proof.locations[index];
      targets.push(sourceTargetForLocation(location, targets.length));
    }
  }
  return targets;
}

function locationLabel(location: RouteTotalityLocation): string {
  return `${location.file}:${location.line}:${location.column}`;
}

function locationHref(location: RouteTotalityLocation): string {
  return `/file?path=${encodeURIComponent(location.file)}#L${location.line}`;
}

function humanize(value: string): string {
  return value.replaceAll("-", " ");
}
