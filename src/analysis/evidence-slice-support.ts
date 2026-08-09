import type {
  ProgramElement as IndexedProgramElement,
  ProgramEvidence,
  ProgramEvidenceGap,
  ProgramRelation as IndexedProgramRelation,
  ProgramProof,
} from "./program-evidence";
import type {
  BoundaryKind,
  BoundaryPolicy,
  EvidenceGap,
  EvidenceProof,
  EvidenceStatus,
  OriginRole,
  ProgramElement,
  ProgramRelation,
  SliceDirection,
  SourceLocation,
  TerminalPolicy,
  TerminalRole,
} from "./scope-seam";
import type { AnalysisCancellationToken } from "./cancellation";
import { indexReadMetadataFromElement } from "./program-index-read-metadata";

export type NormalizedProgramEvidence = {
  elements: ProgramElement[];
  relations: ProgramRelation[];
  gaps: ProgramEvidenceGap[];
};

export type GapInput = {
  from: string | null;
  to: string | null;
  label: string;
  reason: EvidenceGap["reason"];
  status?: "partial" | "unsupported";
  location?: ProgramElement["location"] | null;
  proof?: EvidenceProof[];
};

export type RelationCandidate = {
  relation: ProgramRelation;
  targetId: string;
};

/**
 * Narrow provider boundary used by the slice query.
 *
 * The provider owns raw collector records and decides when a relation endpoint
 * is expanded. The query only needs source-backed facts, endpoint relations,
 * and gaps attached to an included element.
 */
export type EvidenceRelationSource = {
  readonly factIndex: {
    getElement: (elementId: string) => IndexedProgramElement | undefined;
    comparePriority: (leftId: string, rightId: string, direction: SliceDirection) => number;
    priorityFor: (elementId: string, direction: SliceDirection) => number;
  };
  getRelations: (elementId: string, direction: SliceDirection, cancellation?: AnalysisCancellationToken) => readonly IndexedProgramRelation[];
  getGaps: (elementId: string) => readonly ProgramEvidenceGap[];
};

export type IndexedEvidence = {
  elements: ProgramElement[];
  relations: ProgramRelation[];
  gaps: ProgramEvidenceGap[];
  elementsById: Map<string, ProgramElement[]>;
  outgoing: Map<string, ProgramRelation[]>;
  incoming: Map<string, ProgramRelation[]>;
};

export type ProviderEvidence = {
  elementFor: (elementId: string) => ProgramElement | undefined;
};

type EvidenceInput = {
  elements?: unknown;
  relations?: unknown;
  elementById?: unknown;
  relationById?: unknown;
  indexes?: unknown;
  index?: unknown;
};

/** Normalize raw collector records at the generic scope boundary. */
export function normalizeProgramEvidence(evidence: ProgramEvidence): NormalizedProgramEvidence {
  const indexed = indexEvidence(evidence);
  return {
    elements: indexed.elements,
    relations: indexed.relations,
    gaps: indexed.gaps,
  };
}

/** Build eager endpoint indexes. Traversal remains lazy and bounded in the query. */
export function indexEvidence(evidence: ProgramEvidence): IndexedEvidence {
  const raw = evidence as unknown as EvidenceInput;
  const index = asRecord(raw.indexes ?? raw.index);
  const rawElements = records<IndexedProgramElement>(
    raw.elements ?? index.elements ?? raw.elementById,
  ).filter(isIndexedElement);
  const rawRelations = records<IndexedProgramRelation>(
    raw.relations ?? index.relations ?? raw.relationById,
  ).filter(isIndexedRelation);
  const elements = rawElements.map(toSliceElement);
  const relations = rawRelations.map(toSliceRelation);
  const elementsById = new Map<string, ProgramElement[]>();
  for (const element of elements) {
    const existing = elementsById.get(element.id) ?? [];
    existing.push(element);
    elementsById.set(element.id, existing);
  }

  const outgoing = new Map<string, ProgramRelation[]>();
  const incoming = new Map<string, ProgramRelation[]>();
  for (const relation of relations) {
    const from = outgoing.get(relation.from) ?? [];
    from.push(relation);
    outgoing.set(relation.from, from);
    const to = incoming.get(relation.to) ?? [];
    to.push(relation);
    incoming.set(relation.to, to);
  }

  return {
    elements,
    relations,
    gaps: evidence.gaps ?? [],
    elementsById,
    outgoing,
    incoming,
  };
}

/** Keep provider indexing lazy. Only requested IDs are hydrated. */
export function indexProvider(provider: EvidenceRelationSource): ProviderEvidence {
  return {
    elementFor: (elementId) => {
      const element = provider.factIndex.getElement(elementId);
      return element ? toSliceElement(element) : undefined;
    },
  };
}

function records<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value instanceof Map) return [...value.values()] as T[];
  if (value && typeof value === "object") return Object.values(value) as T[];
  return [];
}

/** Guard the collector shape before converting records to the scope contract. */
function isIndexedElement(value: unknown): value is IndexedProgramElement {
  const candidate = asRecord(value);
  return typeof candidate.id === "string"
    && typeof candidate.kind === "string"
    && typeof candidate.label === "string"
    && isLocation(candidate.location)
    && isProof(candidate.proof)
    && Boolean(candidate.attributes && typeof candidate.attributes === "object")
    && (candidate.confidence === "proven" || candidate.confidence === "partial");
}

/** Guard the collector relation shape before converting it to the scope contract. */
function isIndexedRelation(value: unknown): value is IndexedProgramRelation {
  const candidate = asRecord(value);
  return typeof candidate.id === "string"
    && typeof candidate.from === "string"
    && typeof candidate.to === "string"
    && typeof candidate.kind === "string"
    && isProof(candidate.proof)
    && (candidate.confidence === "proven" || candidate.confidence === "partial");
}

function isLocation(value: unknown): value is IndexedProgramElement["location"] {
  const candidate = asRecord(value);
  return typeof candidate.file === "string"
    && typeof candidate.line === "number"
    && typeof candidate.column === "number"
    && isSpan(candidate.span);
}

function isSpan(value: unknown): boolean {
  const candidate = asRecord(value);
  return ["startLine", "startColumn", "endLine", "endColumn"]
    .every((key) => typeof candidate[key] === "number");
}

function isProof(value: unknown): value is ProgramProof {
  const candidate = asRecord(value);
  return typeof candidate.kind === "string"
    && typeof candidate.detail === "string"
    && Array.isArray(candidate.locations)
    && candidate.locations.every(isLocation);
}

function toSliceElement(element: IndexedProgramElement): ProgramElement {
  const status = element.confidence;
  return {
    id: element.id,
    kind: element.kind,
    fieldName: element.kind === "field-read" && element.operationKind === "field-read" && typeof element.attributes.property === "string"
      ? element.attributes.property
      : null,
    operationKind: element.operationKind,
    index: indexReadMetadataFromElement(element),
    label: element.label,
    source: sourceIdentityFor(element.location),
    location: toSliceLocation(element.location),
    status,
    proof: [toSliceProof(element.proof, status)],
    symbol: element.symbolId,
    originRoles: originRolesFor(element),
    terminalRoles: terminalRolesFor(element),
    boundary: boundaryFor(element),
  };
}

function toSliceRelation(relation: IndexedProgramRelation): ProgramRelation {
  return {
    id: relation.id,
    from: relation.from,
    to: relation.to,
    kind: relation.kind,
    status: relation.confidence,
    proof: toSliceProof(relation.proof, relation.confidence),
  };
}

function toSliceProof(proof: ProgramProof, status: EvidenceStatus): EvidenceProof {
  return {
    kind: proof.kind,
    detail: proof.detail,
    locations: proof.locations.map(toSliceLocation),
    status,
  };
}

function toSliceLocation(location: IndexedProgramElement["location"]): SourceLocation {
  return {
    file: location.file,
    line: location.line,
    column: location.column,
    span: location.span,
  };
}

function sourceIdentityFor(location: IndexedProgramElement["location"]) {
  return {
    file: location.file,
    start: sourceOffset(location.span.startLine, location.span.startColumn),
    end: sourceOffset(location.span.endLine, location.span.endColumn),
  };
}

function sourceOffset(line: number, column: number) {
  return line * 1_000_000 + column;
}

function originRolesFor(element: IndexedProgramElement): OriginRole[] {
  switch (element.kind) {
    case "parameter":
      if (element.attributes.originRole === "request" || element.attributes.originRole === "event") {
        return [element.attributes.originRole];
      }
      switch (element.attributes.name) {
        case "argv":
          return ["argument"];
        case "env":
          return ["environment"];
        case "cwd":
          return ["working-directory"];
        default:
          return [];
      }
    case "environment-input":
      return ["environment"];
    case "process-input":
      return String(element.attributes.name ?? "").includes("stdin")
        ? ["stdin"]
        : ["argument"];
    case "file-input":
      return ["filesystem"];
    case "fetch-input":
      return ["fetch", "network"];
    case "resource-input":
      return ["resource"];
    case "external-read":
      return ["external-read"];
    default:
      return [];
  }
}

function terminalRolesFor(element: IndexedProgramElement): TerminalRole[] {
  switch (element.kind) {
    case "render-terminal":
    case "dom-terminal":
      return ["render"];
    case "stdout":
      return isStderrExpression(element) ? ["side-effect"] : ["stdout"];
    case "stderr":
      return ["side-effect"];
    case "exit-status":
      return ["exit"];
    case "file-write":
      return ["file-write"];
    case "http-response":
      return ["http-response"];
    case "message":
      return ["message"];
    case "return":
      if (element.attributes.terminalRole === "http-response") return ["http-response"];
      if (element.attributes.terminalRole === "response") return ["response", "return"];
      return element.attributes.terminalRole === "return" ? ["return"] : [];
    case "external-effect":
    case "network-request":
      return ["side-effect"];
    case "component-occurrence":
      return ["component-occurrence"];
    default:
      return [];
  }
}

function boundaryFor(element: IndexedProgramElement): BoundaryKind | null {
  switch (element.kind) {
    case "file-input":
    case "file-write":
      return "filesystem";
    case "fetch-input":
    case "network-request":
    case "http-response":
      return "network";
    case "external-read":
    case "message":
      return "external-code";
    case "environment-input":
    case "process-input":
    case "stdout":
    case "stderr":
    case "exit-status":
      return "process";
    case "resource-input":
    case "resource-result":
      return "framework-runtime";
    case "external-effect":
      return "external-code";
    default:
      return null;
  }
}

export function appendProgramGaps(
  programGaps: readonly ProgramEvidenceGap[],
  includedElements: ReadonlyMap<string, ProgramElement>,
  addGap: (input: GapInput) => void,
) {
  for (const gap of programGaps) {
    if (!includedElements.has(gap.from)) continue;
    addGap({
      from: gap.from,
      to: gap.to,
      label: gap.detail,
      reason: scopeGapReason(gap.reason),
      location: gap.location ? toSliceLocation(gap.location) : null,
      status: "partial",
    });
  }
}

/** Append only gaps owned by elements already included in the slice. */
export function appendProviderGaps(
  provider: EvidenceRelationSource,
  includedElements: ReadonlyMap<string, ProgramElement>,
  addGap: (input: GapInput) => void,
) {
  for (const element of includedElements.values()) {
    for (const gap of provider.getGaps(element.id)) {
      addGap({
        from: gap.from,
        to: gap.to,
        label: gap.detail,
        reason: scopeGapReason(gap.reason),
        location: gap.location ? toSliceLocation(gap.location) : null,
        status: "partial",
      });
    }
  }
}

/** Keep bounded gaps endpoint-valid without retaining out-of-slice elements. */
export function normalizeGapEndpoints(
  gaps: readonly EvidenceGap[],
  includedElements: ReadonlyMap<string, ProgramElement>,
): EvidenceGap[] {
  return gaps.map((gap) => ({
    ...gap,
    from: gap.from !== null && includedElements.has(gap.from) ? gap.from : null,
    to: gap.to !== null && includedElements.has(gap.to) ? gap.to : null,
  }));
}

/** Assert the domain gap-reference invariant before downstream totality work. */
export function assertGapEndpointReferences(
  gaps: readonly EvidenceGap[],
  includedElements: ReadonlyMap<string, ProgramElement>,
): void {
  for (const gap of gaps) {
    if (gap.from !== null && !includedElements.has(gap.from)) {
      throw new Error(`Evidence gap ${gap.id} references unknown from endpoint ${gap.from}.`);
    }
    if (gap.to !== null && !includedElements.has(gap.to)) {
      throw new Error(`Evidence gap ${gap.id} references unknown to endpoint ${gap.to}.`);
    }
  }
}

function isStderrExpression(element: IndexedProgramElement) {
  const sourceText = `${element.expression ?? ""} ${element.label}`;
  return /\bprocess\.stderr\.write\b/.test(sourceText);
}

function scopeGapReason(reason: string): EvidenceGap["reason"] {
  if (
    reason === "unsupported-syntax"
    || reason === "dynamic-dispatch"
    || reason === "external-code"
    || reason === "identity-lost"
    || reason === "unresolved-symbol"
    || reason === "runtime-only"
    || reason === "disconnected"
    || reason === "unsupported-boundary"
    || reason === "ambiguous-target"
    || reason === "unproven-handoff"
    || reason === "budget-exhausted"
  ) {
    return reason;
  }
  return "unresolved-symbol";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function relationsFor(
  evidence: IndexedEvidence,
  elementId: string,
  direction: SliceDirection,
): RelationCandidate[] {
  const candidates: RelationCandidate[] = [];
  if (direction === "forward" || direction === "both") {
    for (const relation of evidence.outgoing.get(elementId) ?? []) {
      candidates.push({ relation, targetId: relation.to });
    }
  }
  if (direction === "backward" || direction === "both") {
    for (const relation of evidence.incoming.get(elementId) ?? []) {
      candidates.push({ relation, targetId: relation.from });
    }
  }
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      priority: relationPriority(evidence, candidate.targetId, direction),
    }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .map(({ candidate }) => candidate);
}

/** Expand one provider endpoint and retain only relations touching the frontier. */
export function relationsForProvider(
  provider: EvidenceRelationSource,
  elementId: string,
  direction: SliceDirection,
  cancellation?: AnalysisCancellationToken,
): RelationCandidate[] {
  const candidates: Array<RelationCandidate & { index: number }> = [];
  for (const [index, relation] of provider.getRelations(elementId, direction, cancellation).entries()) {
    cancellation?.throwIfCancelled();
    const targetId = targetFor(relation, elementId, direction);
    if (!targetId) continue;
    candidates.push({ relation: toSliceRelation(relation), targetId, index });
  }
  return candidates
    .sort((left, right) => provider.factIndex.comparePriority(left.targetId, right.targetId, direction) || left.index - right.index)
    .map(({ relation, targetId }) => ({ relation, targetId }));
}

function targetFor(
  relation: IndexedProgramRelation,
  elementId: string,
  direction: SliceDirection,
) {
  if ((direction === "forward" || direction === "both") && relation.from === elementId) return relation.to;
  if ((direction === "backward" || direction === "both") && relation.to === elementId) return relation.from;
  return null;
}

function relationPriority(
  evidence: IndexedEvidence,
  targetId: string,
  direction: SliceDirection,
) {
  const target = evidence.elementsById.get(targetId)?.[0];
  if (!target) return 0;
  const origin = target.originRoles.length > 0 ? 4 : 0;
  const terminal = target.terminalRoles.length > 0 ? 3 : 0;
  const boundary = target.boundary ? 2 : 0;
  return Math.max(origin, terminal, boundary) * 1_000;
}

export function dequeuePriorityQueue(
  queue: { elementId: string; depth: number }[],
  evidence: IndexedEvidence,
  direction: SliceDirection,
) {
  let bestIndex = 0;
  let bestPriority = queuePriority(evidence, queue[0].elementId, direction);
  for (let index = 1; index < queue.length; index += 1) {
    const priority = queuePriority(evidence, queue[index].elementId, direction);
    if (priority > bestPriority) {
      bestIndex = index;
      bestPriority = priority;
    }
  }
  return queue.splice(bestIndex, 1)[0];
}

function queuePriority(
  evidence: IndexedEvidence,
  elementId: string,
  direction: SliceDirection,
) {
  const element = evidence.elementsById.get(elementId)?.[0];
  if (!element) return 0;
  const origin = element.originRoles.length > 0 ? 4 : 0;
  const terminal = element.terminalRoles.length > 0 ? 3 : 0;
  const boundary = element.boundary ? 2 : 0;
  return Math.max(origin, terminal, boundary) * 1_000;
}

/** Select the next frontier item using the provider's local fact priority. */
export function dequeueProviderPriorityQueue(
  queue: { elementId: string; depth: number }[],
  provider: EvidenceRelationSource,
  direction: SliceDirection,
) {
  let bestIndex = 0;
  let bestPriority = provider.factIndex.priorityFor(queue[0].elementId, direction);
  for (let index = 1; index < queue.length; index += 1) {
    const priority = provider.factIndex.priorityFor(queue[index].elementId, direction);
    if (priority > bestPriority) {
      bestIndex = index;
      bestPriority = priority;
    }
  }
  return queue.splice(bestIndex, 1)[0];
}

export function blockedBoundary(
  element: ProgramElement,
  policy: BoundaryPolicy,
): BoundaryKind | null {
  const boundary = element.boundary;
  if (boundary === "external-code" && !policy.includeExternal) return boundary;
  if (boundary === "framework-runtime" && !policy.includeFramework) return boundary;
  if (boundary === "unknown" && !policy.includeUnsupported) return boundary;
  return null;
}

export function hasBoundary(element: ProgramElement) {
  return element.boundary !== null;
}

export function hasSliceRole(element: ProgramElement, policy: TerminalPolicy) {
  return element.originRoles.length > 0
    || element.terminalRoles.some((role) => policy.roles.includes(role));
}

export function shouldStopAtTerminal(element: ProgramElement, policy: TerminalPolicy) {
  const isTerminal = element.terminalRoles.some((role) => policy.roles.includes(role));
  return isTerminal && (policy.stopAtTerminal || !policy.includeIntermediate);
}

export function removeQueuedElement(
  queue: { elementId: string; depth: number }[],
  elementId: string,
) {
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    if (queue[index].elementId === elementId) queue.splice(index, 1);
  }
}

export function relationProof(relation: ProgramRelation): EvidenceProof[] {
  return relation.proof ? [relation.proof] : [];
}

export function relationLocation(relation: ProgramRelation): ProgramElement["location"] | null {
  return relation.proof?.locations[0] ?? null;
}

export function gapStatus(reason: EvidenceGap["reason"]): "partial" | "unsupported" {
  return reason === "unsupported-boundary" || reason === "ambiguous-target"
    ? "unsupported"
    : "partial";
}

export function positiveLimit(value: number | undefined, fallback: number) {
  return value != null && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : Math.max(1, Math.floor(fallback));
}
