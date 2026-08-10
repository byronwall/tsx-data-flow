import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import { coverageFor } from "./evidence-slice-coverage";
import type { EvidenceSlice } from "./evidence-slice";
import {
  toSliceElement,
  toSliceRelation,
} from "./evidence-slice-normalization";
import type {
  ProgramElement as IndexedProgramElement,
  ProgramRelation as IndexedProgramRelation,
} from "./program-evidence";
import type { CompactProgramFact } from "./program-evidence-compact-facts";
import type {
  EvidenceGap,
  ProgramElement,
  SliceOrigin,
  SourceLocation,
} from "./scope-seam";
import { stableHash } from "./scope-seam";
import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "./cancellation";

export type RouteTotalitySelectedSource = {
  key: string;
  evidence: {
    id: string;
    file: string;
    line: number;
    column: number;
    span: SourceLocation["span"];
  } | null;
};

type ConnectorPath = {
  elementIds: string[];
  relations: IndexedProgramRelation[];
  hasField: boolean;
};

type ConnectorResult =
  | { kind: "path"; path: ConnectorPath }
  | { kind: "gap"; reason: EvidenceGap["reason"]; label: string };

type SelectedInputResult =
  | { kind: "input"; input: IndexedProgramElement }
  | { kind: "gap"; reason: EvidenceGap["reason"]; label: string };

type SelectedCarrierResult =
  | { kind: "carrier"; carrier: IndexedProgramRelation }
  | { kind: "gap"; reason: EvidenceGap["reason"]; label: string };

const MAX_CONNECTOR_STATES = 128;
const MAX_CONNECTOR_DEPTH = 24;

/**
 * Add one selected filesystem origin through a bounded, exact carrier lane.
 *
 * The normal route slice stays unchanged. This lane only connects the selected
 * file input to the first exact field element that the normal slice owns.
 */
export function mergeSelectedRouteSource(
  provider: EvidenceRelationProvider,
  normal: EvidenceSlice,
  selected: RouteTotalitySelectedSource | null,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): EvidenceSlice {
  cancellation.throwIfCancelled();
  if (!selected) return normal;
  const input = selectedInput(provider, selected, cancellation);
  if (input.kind === "gap") return withSelectedGap(normal, selected, input.reason, input.label);
  const carrier = selectedInputCarrier(provider, input.input, cancellation);
  if (carrier.kind === "gap") return withSelectedGap(normal, selected, carrier.reason, carrier.label);
  const connector = findConnector(provider, normal, input.input, carrier.carrier, cancellation);
  if (connector.kind === "gap") return withSelectedGap(normal, selected, connector.reason, connector.label);
  return mergeConnector(normal, provider, input.input, connector.path, cancellation);
}

function selectedInput(
  provider: EvidenceRelationProvider,
  selected: RouteTotalitySelectedSource,
  cancellation: AnalysisCancellationToken,
): SelectedInputResult {
  const evidence = selected.evidence;
  if (!evidence) return { kind: "gap", reason: "unresolved-symbol", label: "The selected source has no exact evidence location." };
  const matchesById = new Map<string, IndexedProgramElement>();
  for (const fact of provider.facts.fileCandidates(evidence.file)) {
    cancellation.throwIfCancelled();
    if (!matchesSelectedFileFact(fact, evidence)) continue;
    const element = provider.facts.getElement(fact.id);
    if (element && matchesSelectedFileInput(element, evidence)) matchesById.set(element.id, element);
  }
  const matches = [...matchesById.values()];
  if (matches.length === 1) return { kind: "input", input: matches[0] };
  return matches.length === 0
    ? { kind: "gap", reason: "unresolved-symbol", label: "No proven filesystem input matches the selected source evidence." }
    : { kind: "gap", reason: "ambiguous-target", label: "Multiple proven filesystem inputs match the selected source evidence." };
}

function matchesSelectedFileFact(
  fact: CompactProgramFact,
  evidence: NonNullable<RouteTotalitySelectedSource["evidence"]>,
): boolean {
  return fact.kind === "file-input"
    && fact.confidence === "proven"
    && fact.proofKind === "host-api"
    && fact.attributes.operation === "readFile"
    && fact.attributes.module === "node:fs/promises"
    && sameLocation(fact.location, evidence);
}

function matchesSelectedFileInput(
  element: Pick<IndexedProgramElement, "kind" | "confidence" | "proof" | "attributes" | "location">,
  evidence: NonNullable<RouteTotalitySelectedSource["evidence"]>,
): boolean {
  return element.kind === "file-input"
    && element.confidence === "proven"
    && element.proof.kind === "host-api"
    && element.attributes.operation === "readFile"
    && element.attributes.module === "node:fs/promises"
    && sameLocation(element.location, evidence);
}

function selectedInputCarrier(
  provider: EvidenceRelationProvider,
  input: IndexedProgramElement,
  cancellation: AnalysisCancellationToken,
): SelectedCarrierResult {
  const candidatesById = new Map<string, IndexedProgramRelation>();
  for (const relation of provider.getRelations(input.id, "forward", cancellation)) {
    cancellation.throwIfCancelled();
    const target = provider.facts.getElement(relation.to);
    if (
      target
      && isExactConnectorRelation(provider, relation, input, target, cancellation)
      && relation.kind === "carrier"
      && relation.proof.kind === "carrier-boundary"
      && target.kind === "call"
    ) candidatesById.set(relation.id, relation);
  }
  const candidates = [...candidatesById.values()];
  if (candidates.length === 1) return { kind: "carrier", carrier: candidates[0] };
  return candidates.length === 0
    ? { kind: "gap", reason: "unproven-handoff", label: "No proven input carrier continues from the selected filesystem input." }
    : { kind: "gap", reason: "ambiguous-target", label: "Multiple proven input carriers continue from the selected filesystem input." };
}

function findConnector(
  provider: EvidenceRelationProvider,
  normal: EvidenceSlice,
  input: IndexedProgramElement,
  inputCarrier: IndexedProgramRelation,
  cancellation: AnalysisCancellationToken,
): ConnectorResult {
  const first = provider.facts.getElement(inputCarrier.to);
  if (!first || !isExactConnectorRelation(provider, inputCarrier, input, first, cancellation)) {
    return { kind: "gap", reason: "unproven-handoff", label: "The selected input carrier has no proven call endpoint." };
  }
  const normalIds = new Set(normal.elements.map((element) => element.id));
  const queue: ConnectorPath[] = [{ elementIds: [input.id, first.id], relations: [inputCarrier], hasField: false }];
  const matches: ConnectorPath[] = [];
  let states = 0;
  let boundedOut = false;

  while (queue.length > 0) {
    cancellation.throwIfCancelled();
    if (states >= MAX_CONNECTOR_STATES) {
      boundedOut = true;
      break;
    }
    states += 1;
    const current = queue.shift()!;
    const currentId = current.elementIds.at(-1)!;
    if (current.hasField && normalIds.has(currentId)) {
      matches.push(current);
      if (matches.length > 1) return { kind: "gap", reason: "ambiguous-target", label: "The selected source has multiple bounded proven connectors to the route slice." };
      continue;
    }
    if (current.relations.length >= MAX_CONNECTOR_DEPTH) {
      boundedOut = true;
      continue;
    }
    const source = provider.facts.getElement(currentId);
    if (!source) return { kind: "gap", reason: "unproven-handoff", label: "The selected source connector lost its exact source endpoint." };
    for (const relation of provider.getRelations(currentId, "forward", cancellation)) {
      cancellation.throwIfCancelled();
      if (current.elementIds.includes(relation.to)) continue;
      const target = provider.facts.getElement(relation.to);
      if (!target || !isExactConnectorRelation(provider, relation, source, target, cancellation)) continue;
      if (relation.kind === "field-input" && !normalIds.has(target.id)) continue;
      if (isContextCarrier(relation) && !hasOneNormalConsumerField(provider, target, normalIds, cancellation)) continue;
      queue.push({
        elementIds: [...current.elementIds, target.id],
        relations: [...current.relations, relation],
        hasField: current.hasField || relation.kind === "field-input",
      });
    }
  }

  if (boundedOut) return { kind: "gap", reason: "budget-exhausted", label: "The selected source connector exceeded its fixed bounded lane." };
  if (matches.length !== 1) return { kind: "gap", reason: "disconnected", label: "No bounded proven connector reaches the normal route slice from the selected source." };
  return { kind: "path", path: matches[0] };
}

function isContextCarrier(relation: IndexedProgramRelation): boolean {
  return relation.kind === "carrier" && relation.proof.kind === "context-continuity";
}

function hasOneNormalConsumerField(
  provider: EvidenceRelationProvider,
  call: IndexedProgramElement,
  normalIds: ReadonlySet<string>,
  cancellation: AnalysisCancellationToken,
): boolean {
  let matches = 0;
  for (const relation of provider.getRelations(call.id, "forward", cancellation)) {
    cancellation.throwIfCancelled();
    if (relation.kind !== "field-input" || relation.proof.kind !== "property-access") continue;
    const target = provider.facts.getElement(relation.to);
    if (!target || target.kind !== "field-read" || !normalIds.has(target.id)) continue;
    if (!isExactConnectorRelation(provider, relation, call, target, cancellation)) continue;
    matches += 1;
  }
  return matches === 1;
}

function isExactConnectorRelation(
  provider: EvidenceRelationProvider,
  relation: IndexedProgramRelation,
  source: IndexedProgramElement,
  target: IndexedProgramElement,
  cancellation: AnalysisCancellationToken,
): boolean {
  if (relation.from !== source.id || relation.to !== target.id || relation.confidence !== "proven") return false;
  if (source.confidence !== "proven" || target.confidence !== "proven") return false;
  if (!hasUniqueExactPair(provider, relation, cancellation)) return false;
  if (relation.kind === "references") return isExactReference(source, target);
  if (relation.kind === "return-expression") return source.kind === "value" && target.kind === "return";
  if (relation.kind === "return-value") return source.kind === "return" && target.kind === "call";
  if (relation.kind === "http-bridge") return source.kind === "http-response" && target.kind === "resource-input" && relation.proof.kind === "http-bridge";
  if (relation.kind === "resource-result") return source.kind === "resource-input" && target.kind === "alias" && relation.proof.kind === "resource-boundary";
  if (relation.kind === "field-input") return source.kind === "call" && target.kind === "field-read" && relation.proof.kind === "property-access";
  return relation.kind === "carrier" && isExactCarrier(source, target, relation);
}

function hasUniqueExactPair(
  provider: EvidenceRelationProvider,
  relation: IndexedProgramRelation,
  cancellation: AnalysisCancellationToken,
): boolean {
  let matches = 0;
  for (const candidate of provider.getRelations(relation.from, "forward", cancellation)) {
    cancellation.throwIfCancelled();
    if (
      candidate.from === relation.from
      && candidate.to === relation.to
      && candidate.kind === relation.kind
      && candidate.confidence === "proven"
    ) matches += 1;
  }
  return matches === 1;
}

function isExactReference(source: IndexedProgramElement, target: IndexedProgramElement): boolean {
  return (source.kind === "call" || source.kind === "alias")
    && (target.kind === "alias" || target.kind === "value");
}

function isExactCarrier(
  source: IndexedProgramElement,
  target: IndexedProgramElement,
  relation: IndexedProgramRelation,
): boolean {
  if (relation.proof.kind === "awaited-call-alias") return source.kind === "call" && target.kind === "alias";
  if (relation.proof.kind === "resource-boundary") {
    return source.kind === "alias" && target.kind === "field-read" && target.attributes.property === "latest";
  }
  if (relation.proof.kind === "context-continuity") {
    return source.kind === "field-read" && source.attributes.property === "latest" && target.kind === "call";
  }
  if (relation.proof.kind !== "carrier-boundary") return false;
  if (source.kind === "file-input" && target.kind === "call") return true;
  if (source.kind === "call" && target.kind === "call") return true;
  if (source.kind === "alias" && target.kind === "return") return true;
  return source.kind === "call" && target.kind === "http-response";
}

function mergeConnector(
  normal: EvidenceSlice,
  provider: EvidenceRelationProvider,
  input: IndexedProgramElement,
  path: ConnectorPath,
  cancellation: AnalysisCancellationToken,
): EvidenceSlice {
  const elements = new Map(normal.elements.map((element) => [element.id, element]));
  for (const id of path.elementIds) {
    cancellation.throwIfCancelled();
    const element = provider.facts.getElement(id);
    if (element) elements.set(element.id, toSliceElement(element));
  }
  const relations = new Map(normal.relations.map((relation) => [relation.id, relation]));
  for (const relation of path.relations) relations.set(relation.id, toSliceRelation(relation));
  const inputElement = toSliceElement(input);
  const origins = mergeOrigins(normal.origins, inputElement);
  return rebuildSlice(normal, [...elements.values()], [...relations.values()], origins, normal.gaps);
}

function mergeOrigins(origins: EvidenceSlice["origins"], input: ProgramElement): SliceOrigin[] {
  const selected: SliceOrigin = {
    elementId: input.id,
    role: "filesystem",
    label: input.label,
    status: input.status,
    proof: input.proof,
  };
  const records = new Map(origins.map((origin) => [`${origin.elementId}:${origin.role}`, origin]));
  records.set(`${selected.elementId}:${selected.role}`, selected);
  return [...records.values()];
}

function withSelectedGap(
  normal: EvidenceSlice,
  selected: RouteTotalitySelectedSource,
  reason: EvidenceGap["reason"],
  label: string,
): EvidenceSlice {
  const evidence = selected.evidence;
  const gap: EvidenceGap = {
    id: `selected-source-gap:${stableHash(`${selected.key}:${reason}:${label}`)}`,
    from: null,
    to: null,
    label,
    reason,
    status: "unsupported",
    location: evidence ? toLocation(evidence) : null,
    proof: [],
  };
  return rebuildSlice(normal, normal.elements, normal.relations, normal.origins, [...normal.gaps, gap]);
}

function rebuildSlice(
  normal: EvidenceSlice,
  elements: ProgramElement[],
  relations: EvidenceSlice["relations"],
  origins: EvidenceSlice["origins"],
  gaps: EvidenceSlice["gaps"],
): EvidenceSlice {
  const coverage = coverageFor(
    elements,
    relations,
    origins,
    normal.terminals,
    gaps,
    normal.coverage.truncation,
    normal.coverage.direction,
    normal.coverage.budget.limit,
    normal.coverage.budget.used,
    normal.coverage.budget.exhausted,
  );
  return { ...normal, elements, relations, origins, gaps, coverage };
}

function sameLocation(
  left: Pick<SourceLocation, "file" | "line" | "column" | "span">,
  right: NonNullable<RouteTotalitySelectedSource["evidence"]>,
): boolean {
  return left.file === right.file
    && left.line === right.line
    && left.column === right.column
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}

function toLocation(evidence: NonNullable<RouteTotalitySelectedSource["evidence"]>): SourceLocation {
  return { file: evidence.file, line: evidence.line, column: evidence.column, span: evidence.span };
}
