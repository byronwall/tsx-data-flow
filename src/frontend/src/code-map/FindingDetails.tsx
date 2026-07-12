import { For, Show, createSignal } from "solid-js";
import type { FindingDetail, InventoryEntry } from "../../../api/contracts";
import { identitySymbolLabel, identityTypeLabel } from "./identity-display";
import { SymbolUses } from "./SymbolUses";

export function ExpressionNavigation(props: { expression: FindingDetail["identity"]; close: () => void; jump: (line: number) => void }) {
  return <nav class="panel-nav" aria-label="Expression navigation">
    <button class="panel-back" type="button" onClick={() => props.close()}>← List</button>
    <div class="panel-nav-detail"><h3><code class="panel-nav-label">{props.expression.expression}</code> <span class="badge">expression</span></h3>
      <div class="finding-context"><button class="finding-location" type="button" title={props.expression.location.path} onClick={() => props.jump(props.expression.location.line)}><code>{fileName(props.expression.location.path)}:{props.expression.location.line}</code></button></div>
    </div>
  </nav>;
}

export function ExpressionDetails(props: { expression: FindingDetail["identity"]; findings: Record<string, FindingDetail>; jump: (line: number) => void }) {
  const attachedFindings = () => props.expression.attachedFindingIds.flatMap((id) => props.findings[id] ? [props.findings[id]] : []);
  return <section class="entry-details"><article class="finding-detail expression-detail">
    <IdentityEvidence identity={props.expression} currentPath={props.expression.location.path} jump={props.jump} />
    <FindingBasis identity={props.expression} findings={attachedFindings()} />
    <EvidencePath title="Upstream path" steps={props.expression.upstreamPath} currentPath={props.expression.location.path} jump={props.jump} />
    <EvidencePath title="Downstream path" steps={props.expression.downstreamPath} currentPath={props.expression.location.path} jump={props.jump} />
    <TerminalDestinations identity={props.expression} />
    <CopyActions value={() => expressionCopySummary(props.expression, attachedFindings())} />
  </article></section>;
}

export function EntryNavigation(props: { entry: InventoryEntry; finding?: FindingDetail; close: () => void; jump: (line: number) => void }) {
  return <nav class="panel-nav" aria-label="Finding navigation">
    <button class="panel-back" type="button" onClick={() => props.close()}>← List</button>
    <Show when={props.finding} fallback={<div class="panel-nav-detail"><h3><code class="panel-nav-label">{props.entry.label}</code> <span class="badge">{props.entry.kind}</span></h3><Show when={props.entry.line}>{(line) => <button class="finding-location" type="button" onClick={() => props.jump(line())}>line {line()}</button>}</Show></div>}>{(finding) => <div class="panel-nav-detail">
      <h3>{finding().id} <span class="badge">{finding().category}</span></h3>
      <div class="finding-context"><button class="finding-location" type="button" title={finding().location.path} onClick={() => props.jump(finding().location.line)}><code>{fileName(finding().location.path)}:{finding().location.line}</code></button><span>{contextLabel(finding())}</span></div>
    </div>}</Show>
  </nav>;
}

export function EntryDetails(props: { entry: InventoryEntry; finding?: FindingDetail; jump: (line: number) => void; selectExpression: (id: string) => void }) {
  return (
    <section class="entry-details">
      <Show when={props.finding} fallback={<>{inventoryEntryDetails(props.entry, props.jump)}<CopyActions value={() => ({ kind: props.entry.kind, selection: props.entry })} /></>}>
        {(finding) => <FindingView finding={finding()} jump={props.jump} selectExpression={props.selectExpression} />}
      </Show>
    </section>
  );
}

function FindingView(props: { finding: FindingDetail; jump: (line: number) => void; selectExpression: (id: string) => void }) {
  return <article class="finding-detail">
    <dl class="finding-summary">
      <div class="finding-summary-row"><dt>burden</dt><dd class="finding-summary-value">{props.finding.burden.toFixed(3)}</dd>
        <Show when={props.finding.burdenBreakdown}>{(breakdown) => <dd class="burden-breakdown"><ul><For each={positiveBurdenTerms(props.finding)}>{(term) => <li>{term.label} {term.contribution.toFixed(3)} · {Math.round(term.contribution / Math.max(breakdown().rawSum, 0.001) * 100)}%</li>}</For></ul></dd>}</Show>
      </div>
      <div class="finding-summary-row"><dt>confidence</dt><dd class="finding-summary-detail">{props.finding.confidence}%</dd></div>
      <div class="finding-summary-row"><dt>risk</dt><dd class="finding-summary-detail">{props.finding.confidenceRisk || props.finding.confidenceReason}</dd></div>
      <Show when={props.finding.advice.headline || props.finding.advice.firstCut}><div class="finding-summary-row"><dt>recommendation</dt><dd class="finding-summary-detail">{props.finding.advice.headline || props.finding.advice.firstCut}<Show when={props.finding.advice.shape !== "uncategorized"}> <code>{props.finding.advice.shape}</code></Show></dd></div></Show>
    </dl>
    <FindingExpressionSummary finding={props.finding} selectExpression={props.selectExpression} />
    <DetailSection title={`Path — ${props.finding.path.length} steps`}>
      <ol class="path-list"><For each={compactPath(props.finding.path)}>{(group) => <li>
        <code class="path-code">{pathSourceLabel(group)}</code>
        <div class="path-explanation"><Show when={group.inputLabel}>{(input) => <span class="path-input">from <code>{input()}</code></span>}</Show>
          <For each={group.steps}>{(step) => <span class="path-operation"><span aria-hidden="true">→</span> <strong>{step.kind}</strong> <code>{operationLabel(group, step)}</code><Show when={operationDetail(group, step)}>{(detail) => <span class="path-operation-detail"> {detail()}</span>}</Show></span>}</For>
          <Show when={group.location}>{(location) => <a class="path-location" title={location().path} href={location().path === props.finding.location.path ? `#L${location().line}` : `/file?path=${encodeURIComponent(location().path)}#L${location().line}`}
            onClick={(event) => { if (location().path === props.finding.location.path) { event.preventDefault(); props.jump(location().line); } }}>{locationLabel(location(), props.finding.location.path)}</a>}</Show>
        </div>
      </li>}</For></ol>
    </DetailSection>
    <Show when={props.finding.defenses.length}><DetailSection title={`Defenses — ${props.finding.defenses.length}`}><ul><For each={props.finding.defenses}>{(defense) => <li><code>{defense.expression}</code> → {defense.verdict} <span class="meta">{defense.origin} · :{defense.location.line}</span></li>}</For></ul></DetailSection></Show>
    <RepresentationChanges steps={props.finding.representationSteps} currentPath={props.finding.location.path} jump={props.jump} />
    <TraceInputs roots={props.finding.roots} />
    <Show when={props.finding.reach.length}><DetailSection title="Reach"><ul><For each={props.finding.reach}>{(group) => <li>{group.source} → {group.total} sinks</li>}</For></ul></DetailSection></Show>
    <Show when={props.finding.sameCode.length}><DetailSection title="Same code elsewhere"><ul><For each={props.finding.sameCode}>{(peer) => <li><a href={`/file?path=${encodeURIComponent(peer.path)}&finding=${encodeURIComponent(peer.id)}#L${peer.line}`}>{peer.path}:{peer.line} — {peer.label}</a></li>}</For></ul></DetailSection></Show>
    <CopyActions value={() => findingCopySummary(props.finding)} />
  </article>;
}

function FindingExpressionSummary(props: { finding: FindingDetail; selectExpression: (id: string) => void }) {
  return <>
    <DetailSection title="Selected sink expression">
      <dl class="selected-expression">
        <dt>expression</dt><dd><code>{props.finding.expression}</code></dd>
        <dt>expression type</dt><dd><code>{props.finding.type}</code></dd>
        <dt>render role</dt><dd>{props.finding.category}<Show when={props.finding.context.tag}> in <code>{props.finding.context.tag}</code></Show><Show when={props.finding.context.attribute}> <code>{props.finding.context.attribute}</code></Show></dd>
        <dt>terminal reach</dt><dd>{props.finding.identity.totalReach} {props.finding.identity.totalReach === 1 ? "sink" : "sinks"}</dd>
      </dl>
    </DetailSection>
    <Show when={props.finding.participants.length}><DetailSection title="Values in this expression"><ul class="expression-participants"><For each={props.finding.participants}>{(participant) => <li>
      <a title={participant.focusText} href={`/file?path=${encodeURIComponent(props.finding.location.path)}&expression=${encodeURIComponent(participant.expressionId)}`} onClick={(event) => { event.preventDefault(); props.selectExpression(participant.expressionId); }}><code>{participant.focusText}</code></a>
      <span class="participant-expression" title={participant.expression}><code>{participant.expression}</code></span>
      <span class="participant-type" title={participant.typeText}><code>{participant.typeText}</code></span>
      <span class="meta">{participantRoleLabel(participant.role)}</span>
    </li>}</For></ul></DetailSection></Show>
  </>;
}

function RepresentationChanges(props: { steps: FindingDetail["representationSteps"]; currentPath: string; jump: (line: number) => void }) {
  const [expanded, setExpanded] = createSignal(false);
  const summary = () => summarizeRepresentationSteps(props.steps);
  return <Show when={props.steps.length}><DetailSection title={`Representation changes — ${props.steps.length} operations`}>
    <p class="evidence-explanation">Assignments and object repacking across the full dependency slice traced for this expression. This is an operation count, not a count of shared data structures.</p>
    <div class="representation-summary"><For each={summary()}>{(item) => <div><strong>{item.count}</strong><span>{representationKindLabel(item.kind)}</span><span class="meta">{item.fileCount} {item.fileCount === 1 ? "file" : "files"}</span></div>}</For></div>
    <button class="representation-toggle" type="button" aria-expanded={expanded()} onClick={() => setExpanded((value) => !value)}>{expanded() ? "Hide operation ledger" : `Show ${props.steps.length} individual operations`}</button>
    <Show when={expanded()}><ul class="representation-ledger"><For each={props.steps}>{(step) => <li><span class="type-tag">{step.kind}</span><code>{step.label}</code><LocationLink location={step.location} currentPath={props.currentPath} jump={props.jump} /></li>}</For></ul></Show>
  </DetailSection></Show>;
}

function TraceInputs(props: { roots: FindingDetail["roots"] }) {
  const inputs = () => actionableRoots(props.roots);
  return <Show when={inputs().length}><DetailSection title={`Trace inputs — ${inputs().length}`}>
    <p class="evidence-explanation">Ownable values at the edge of this dependency slice. Constants, platform globals, and helper-local parameters are omitted.</p>
    <ul class="trace-inputs"><For each={inputs()}>{(root) => <li><code>{root.label}</code><span class="meta">{root.kind}</span></li>}</For></ul>
  </DetailSection></Show>;
}

function LocationLink(props: { location: { path: string; line: number }; currentPath: string; jump: (line: number) => void }) {
  const local = () => props.location.path === props.currentPath;
  return <a class="path-location" title={props.location.path} href={local() ? `#L${props.location.line}` : `/file?path=${encodeURIComponent(props.location.path)}#L${props.location.line}`} onClick={(event) => { if (local()) { event.preventDefault(); props.jump(props.location.line); } }}>{locationLabel(props.location, props.currentPath)}</a>;
}

const NON_ACTIONABLE_ROOTS = new Set(["undefined", "null", "NaN", "Infinity", "Math", "JSON", "Object", "Array", "Number", "String", "Boolean", "Date", "console", "window", "document", "globalThis"]);
function actionableRoots(roots: FindingDetail["roots"]) {
  return roots.filter((root) => root.kind !== "literal" && root.kind !== "parameter" && root.kind !== "operation" && !NON_ACTIONABLE_ROOTS.has(root.label));
}
function summarizeRepresentationSteps(steps: FindingDetail["representationSteps"]) {
  const byKind = new Map<string, { kind: string; count: number; files: Set<string> }>();
  for (const step of steps) {
    const item = byKind.get(step.kind) ?? { kind: step.kind, count: 0, files: new Set<string>() };
    item.count += 1; item.files.add(step.location.path); byKind.set(step.kind, item);
  }
  return [...byKind.values()].map((item) => ({ kind: item.kind, count: item.count, fileCount: item.files.size })).sort((left, right) => right.count - left.count || (left.kind < right.kind ? -1 : 1));
}
function representationKindLabel(kind: string) {
  if (kind === "alias") return "local aliases";
  if (kind === "object-pack") return "object packs";
  if (kind === "object-spread") return "object spreads";
  return kind;
}

export function IdentityEvidence(props: { identity: FindingDetail["identity"]; currentPath: string; jump: (line: number) => void }) {
  const locationLink = (location: FindingDetail["identity"]["usages"][number], label: string) => {
    const local = location.path === props.currentPath;
    return <a href={local ? `#L${location.line}` : `/file?path=${encodeURIComponent(location.path)}#L${location.line}`}
      title={location.path} onClick={(event) => { if (local) { event.preventDefault(); props.jump(location.line); } }}><code>{label}</code></a>;
  };
  return <DetailSection title="Selected value">
    <dl class="identity-evidence">
      <dt>value</dt><dd><code>{props.identity.expression}</code></dd>
      <dt>referenced symbol</dt><dd><code title={props.identity.symbolName ?? undefined}>{identitySymbolLabel(props.identity)}</code></dd>
      <dt>value type</dt><dd><code title={props.identity.typeText}>{identityTypeLabel(props.identity)}</code></dd>
      <dt>type definition</dt><dd><Show keyed when={props.identity.typeDefinition} fallback={<Show when={props.identity.externalOrigin} fallback={<span class="meta">unavailable</span>}>{(origin) => <span>external type from <code>{origin().module ?? origin().package}</code></span>}</Show>}>{(definition) => locationLink(definition, locationLabel(definition, props.currentPath))}</Show></dd>
      <dt>path status</dt><dd><span class={`badge evidence-${props.identity.evidenceLevel}`}>{evidenceLabel(props.identity.evidenceLevel)}</span></dd>
      <dt>symbol definition</dt><dd><Show keyed when={props.identity.definition} fallback={<span class="meta">unavailable</span>}>{(definition) => locationLink(definition, locationLabel(definition, props.currentPath))}</Show></dd>
      <Show when={props.identity.externalOrigin}>{(origin) => <><dt>import/package origin</dt><dd><code>{origin().module ?? origin().package}</code><Show when={origin().module && origin().package !== origin().module}> <span class="meta">package {origin().package}</span></Show></dd></>}</Show>
      <dt>symbol uses</dt><dd><SymbolUses usages={props.identity.usages} currentPath={props.currentPath} jump={props.jump} /></dd>
      <dt>terminal reach</dt><dd>{props.identity.totalReach} {props.identity.totalReach === 1 ? "sink" : "sinks"}</dd>
      <dt>analysis</dt><dd>{props.identity.attachedFindingIds.length ? `${props.identity.attachedFindingIds.length} attached finding` : "browsable fact"}<Show when={props.identity.boundaryIds.length}> · {props.identity.boundaryIds.length} {props.identity.boundaryIds.length === 1 ? "boundary" : "boundaries"}</Show><Show when={props.identity.unknownBoundaries.length}> · {props.identity.unknownBoundaries.length} unknown</Show></dd>
      <dt>trace</dt><dd>{props.identity.traceCompletenessReason}</dd>
    </dl>
  </DetailSection>;
}

function TerminalDestinations(props: { identity: FindingDetail["identity"] }) {
  return <Show when={props.identity.terminalSinks.length}><DetailSection title={`Rendered destinations — ${props.identity.totalReach}`}>
    <p class="evidence-explanation">Where this selected value reaches TSX. Barrel re-exports are pass-throughs and are not shown as destinations.</p>
    <ul class="identity-locations"><For each={props.identity.terminalSinks.slice(0, 12)}>{(sink) => <li><a href={`/file?path=${encodeURIComponent(sink.path)}&finding=${encodeURIComponent(sink.id)}#L${sink.line}`} title={sink.path}><code>{sink.label}</code> <span class="meta">{fileName(sink.path)}:{sink.line}</span></a></li>}</For></ul>
    <Show when={props.identity.terminalSinks.length > 12}><p class="meta">Showing 12 of {props.identity.terminalSinks.length} retained destinations.</p></Show>
  </DetailSection></Show>;
}

function evidenceLabel(level: FindingDetail["identity"]["evidenceLevel"]) {
  if (level === "suspicious-transformation") return "included in flagged finding";
  if (level === "proven-unnecessary") return "included in proven finding";
  if (level === "trace-incomplete") return "trace incomplete";
  return "browsable fact";
}

function FindingBasis(props: { identity: FindingDetail["identity"]; findings: FindingDetail[] }) {
  return <Show when={props.findings.length}><DetailSection title="Why this path is flagged">
    <p class="evidence-explanation">This selected value is not independently classified as suspicious. It participates in the path to the attached {props.findings.length === 1 ? "finding" : "findings"} below. The analyzer scores each terminal path as a whole; it has not identified one individual path step as the problem.</p>
    <ul class="finding-basis-list"><For each={props.findings}>{(finding) => <li>
      <a href={`/file?path=${encodeURIComponent(finding.location.path)}&finding=${encodeURIComponent(finding.id)}`}><code>{finding.id}</code> · <code>{finding.expression}</code></a>
      <span>burden {finding.burden.toFixed(3)} · {finding.category}</span>
      <Show when={positiveBurdenTerms(finding).length}><span>basis: {positiveBurdenTerms(finding).map((term) => `${term.label} ${term.contribution.toFixed(3)}`).join(" · ")}</span></Show>
      <Show when={finding.advice.headline || finding.advice.firstCut}><span>recommendation: {finding.advice.headline || finding.advice.firstCut}</span></Show>
    </li>}</For></ul>
  </DetailSection></Show>;
}
function participantRoleLabel(role: FindingDetail["participants"][number]["role"]) { return role === "symbol" ? "binding" : role === "property" ? "property value" : role === "call" ? "call result" : role; }

function EvidencePath(props: { title: string; steps: FindingDetail["identity"]["upstreamPath"]; currentPath: string; jump: (line: number) => void }) {
  return <Show when={props.steps.length}><DetailSection title={`${props.title} — ${props.steps.length} steps`}><ol class="identity-path"><For each={props.steps}>{(step) => <li><strong>{step.kind}</strong> <code>{step.label}</code><Show when={step.location}>{(location) => <a title={location().path} href={location().path === props.currentPath ? `#L${location().line}` : `/file?path=${encodeURIComponent(location().path)}#L${location().line}`} onClick={(event) => { if (location().path === props.currentPath) { event.preventDefault(); props.jump(location().line); } }}>{locationLabel(location(), props.currentPath)}</a>}</Show></li>}</For></ol></DetailSection></Show>;
}

function contextLabel(finding: FindingDetail) { return [finding.context.component, finding.context.tag, finding.context.attribute].filter(Boolean).join(" / ") || finding.type; }
function fileName(path: string) { return path.split("/").at(-1) || path; }
function locationLabel(location: { path: string; line: number }, currentPath: string) { return location.path === currentPath ? `line ${location.line}` : `${fileName(location.path)}:${location.line}`; }
function positiveBurdenTerms(finding: FindingDetail) { return finding.burdenBreakdown?.terms.filter((term) => term.contribution > 0) ?? []; }

type TraceStep = FindingDetail["path"][number];
type PathGroup = { snippet: string | null; location: TraceStep["location"]; steps: TraceStep[]; inputLabel: string | null; packedResultLabel: string | null };

function compactPath(steps: FindingDetail["path"]): PathGroup[] {
  const groups = steps.reduce<PathGroup[]>((groups, step) => {
    const previous = groups.at(-1);
    if (previous && sameSourceLine(previous, step)) previous.steps.push(step);
    else groups.push({ snippet: step.snippet, location: step.location, steps: [step], inputLabel: null, packedResultLabel: null });
    return groups;
  }, []);
  for (const [index, group] of groups.entries()) {
    const previous = groups[index - 1];
    group.inputLabel = previous ? handoffLabel(previous.steps) : null;
    if (group.steps.some((step) => step.kind === "object-pack")) {
      const receivingCall = groups[index + 1]?.steps.find((step) => step.kind === "call");
      group.packedResultLabel = receivingCall ? `${receivingCall.label} result` : "returned object";
    }
  }
  return groups;
}

function handoffLabel(steps: TraceStep[]) {
  const namedKinds = new Set(["alias", "call", "property-read", "solid-accessor", "source"]);
  return steps.findLast((step) => namedKinds.has(step.kind))?.label ?? steps.at(-1)?.label ?? null;
}

function pathSourceLabel(group: PathGroup) {
  if (group.snippet?.trim() === "return {" && group.packedResultLabel) return `return { … } as ${group.packedResultLabel}`;
  return group.snippet || group.steps[0]?.label;
}

function operationLabel(group: PathGroup, step: TraceStep) {
  return step.kind === "object-pack" && group.packedResultLabel ? group.packedResultLabel : step.label;
}

function operationDetail(group: PathGroup, step: TraceStep) {
  if (step.detail) return step.detail;
  if (step.kind === "object-pack" && group.inputLabel) return `packs ${group.inputLabel} into the returned object`;
  return null;
}

function sameSourceLine(group: PathGroup, step: TraceStep) {
  if (group.location && step.location) return group.location.path === step.location.path && group.location.line === step.location.line;
  return Boolean(group.snippet && step.snippet && group.snippet === step.snippet);
}

function inventoryEntryDetails(entry: InventoryEntry, jump: (line: number) => void) {
  switch (entry.kind) {
    case "fan-out": return <article class="entry-overview"><p class="entry-description"><code>{entry.label}</code> feeds {entry.sinkCount} rendered sinks across {entry.fileCount} {entry.fileCount === 1 ? "file" : "files"}.</p><dl class="entry-facts"><dt>sinks</dt><dd>{entry.sinkCount}</dd><dt>files</dt><dd>{entry.fileCount}</dd><dt>source kind</dt><dd><code>{entry.secondaryLabel || "source"}</code></dd></dl></article>;
    case "boundary": return <article class="entry-overview"><p class="entry-description">This boundary receives {entry.inboundSources} inbound sources from {entry.callers} {entry.callers === 1 ? "caller" : "callers"}.</p><dl class="entry-facts"><dt>verdict</dt><dd>{entry.verdict}</dd><dt>inbound sources</dt><dd>{entry.inboundSources}</dd><dt>callers</dt><dd>{entry.callers}</dd><dt>value</dt><dd><code>{entry.secondaryLabel || entry.label}</code></dd></dl></article>;
    case "fork": return <article class="entry-overview"><p class="entry-description">The discriminant <code>{entry.discriminant}</code> controls {entry.siteLines.length} branch sites in this file.</p><dl class="entry-facts"><dt>discriminant</dt><dd><code>{entry.discriminant}</code></dd><dt>branch sites</dt><dd><span class="entry-site-list"><For each={entry.siteLines}>{(line) => <button type="button" class="link-button" onClick={() => jump(line)}>line {line}</button>}</For></span></dd></dl></article>;
    case "relay": return <article class="entry-overview"><p class="entry-description">This component relays {entry.props.length} {entry.props.length === 1 ? "prop" : "props"} to <code>{entry.childPath}</code>.</p><dl class="entry-facts"><dt>child</dt><dd><code>{entry.childPath}</code></dd><dt>props</dt><dd><span class="entry-pill-list"><For each={entry.props}>{(prop) => <code>{prop}</code>}</For></span></dd><dt>context hooks</dt><dd><Show when={entry.contextHooks.length} fallback={<span class="meta">none</span>}><span class="entry-pill-list"><For each={entry.contextHooks}>{(hook) => <code>{hook}</code>}</For></span></Show></dd></dl></article>;
    case "unknown-edge": return <article class="entry-overview"><p class="entry-description">The analyzer could not resolve <code>{entry.label}</code> at {entry.occurrences} {entry.occurrences === 1 ? "occurrence" : "occurrences"}.</p><dl class="entry-facts"><dt>occurrences</dt><dd>{entry.occurrences}</dd><dt>edge</dt><dd><code>{entry.secondaryLabel || entry.label}</code></dd><dt>next step</dt><dd>Confirm the binding or imported implementation.</dd></dl></article>;
    case "finding": return <article class="entry-overview"><p class="entry-description">Detailed trace data is unavailable for this finding.</p><dl class="entry-facts"><dt>burden</dt><dd>{entry.burden.toFixed(3)}</dd><dt>severity</dt><dd>{entry.severity}</dd></dl></article>;
  }
}
function DetailSection(props: { title: string; children: unknown }) { return <section class="detail-section"><h4>{props.title}</h4>{props.children as never}</section>; }
function CopyActions(props: { value: () => unknown }) {
  const [copied, setCopied] = createSignal(false);
  const copy = async () => {
    await copyText(JSON.stringify(props.value(), null, 2)); setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  };
  return <footer class="finding-actions"><span>Actions</span><button type="button" onClick={() => void copy()}>{copied() ? "Copied JSON" : "Copy JSON"}</button></footer>;
}
function expressionCopySummary(expression: FindingDetail["identity"], findings: FindingDetail[]) {
  return {
    kind: "expression",
    selection: { expression: expression.expression, symbol: expression.symbolName, type: expression.typeText, location: expression.location, definition: expression.definition },
    pathStatus: evidenceLabel(expression.evidenceLevel),
    symbolUses: { total: expression.usages.length, sample: expression.usages.slice(0, 12) },
    reach: { terminalSinks: expression.totalReach, boundaries: expression.boundaryIds.length, unknownBoundaries: expression.unknownBoundaries.length },
    upstreamPath: expression.upstreamPath,
    downstreamPath: expression.downstreamPath,
    attachedFindings: findings.map(findingCopySummary),
  };
}
function findingCopySummary(finding: FindingDetail) {
  return {
    kind: "finding", id: finding.id, expression: finding.expression, type: finding.type, category: finding.category, location: finding.location,
    burden: finding.burden, confidence: finding.confidence,
    burdenBasis: positiveBurdenTerms(finding).map((term) => ({ label: term.label, contribution: term.contribution })),
    recommendation: finding.advice.headline || finding.advice.firstCut,
    path: finding.path,
  };
}
async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* use the local fallback */ }
  }
  const textarea = document.createElement("textarea"); textarea.value = value; textarea.style.position = "fixed"; textarea.style.opacity = "0";
  document.body.appendChild(textarea); textarea.select();
  try { if (!document.execCommand("copy")) throw new Error("Copy command was rejected"); } finally { textarea.remove(); }
}
