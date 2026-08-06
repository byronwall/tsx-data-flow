import type { ProgramEvidence } from "./program-evidence";
import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "./cancellation";
import {
  providerForProgramEvidence,
} from "./evidence-relation-provider";
import {
  boundaryPolicy as normalizeBoundaryPolicy,
  stableHash,
  terminalPolicy as normalizeTerminalPolicy,
  type BoundaryPolicyInput,
  type EvidenceGap,
  type EvidenceSlice as SeamEvidenceSlice,
  type EvidenceStatus,
  type ProgramElement,
  type ProgramRelation,
  type ScopeSeed,
  type SliceDirection,
  type SliceOrigin,
  type SliceTerminal,
  type TerminalPolicyInput,
} from "./scope-seam";
import {
  appendProgramGaps,
  appendProviderGaps,
  assertGapEndpointReferences,
  blockedBoundary,
  dequeueProviderPriorityQueue,
  gapStatus,
  hasBoundary,
  hasSliceRole,
  indexProvider,
  normalizeProgramEvidence as normalizeProgramEvidenceSupport,
  normalizeGapEndpoints,
  positiveLimit,
  relationLocation,
  relationProof,
  relationsForProvider,
  removeQueuedElement,
  shouldStopAtTerminal,
  type EvidenceRelationSource,
} from "./evidence-slice-support";
import { coverageFor } from "./evidence-slice-coverage";
import type {
  GapInput,
  NormalizedProgramEvidence as SupportNormalizedProgramEvidence,
} from "./evidence-slice-support";
import type {
  SliceCoverage as SupportSliceCoverage,
  SliceCoverageBucket as SupportSliceCoverageBucket,
  SliceTruncation as SupportSliceTruncation,
} from "./evidence-slice-coverage";

export type SliceQuery = {
  seed: ScopeSeed;
  direction?: SliceDirection;
  boundaryPolicy?: BoundaryPolicyInput;
  terminalPolicy?: TerminalPolicyInput;
  /** Maximum relation visits. The query reports a gap when this is exhausted. */
  budget?: number;
  cancellation?: AnalysisCancellationToken;
};

export type EvidenceSliceSource = ProgramEvidence | EvidenceRelationSource;

/** Compatibility form for callers using the original plan's `scope` name. */
export type ScopeSliceQuery = Omit<SliceQuery, "seed"> & { scope: ScopeSeed };

export type SliceCoverage = SupportSliceCoverage;
export type SliceCoverageBucket = SupportSliceCoverageBucket;
export type SliceTruncation = SupportSliceTruncation;

export type EvidenceSlice = Omit<SeamEvidenceSlice, "coverage"> & {
  coverage: SliceCoverage;
};

export type NormalizedProgramEvidence = SupportNormalizedProgramEvidence;

export function normalizeProgramEvidence(evidence: ProgramEvidence): NormalizedProgramEvidence {
  return normalizeProgramEvidenceSupport(evidence);
}

type QueueItem = { elementId: string; depth: number };

const ACCEPTED_RELATION_STATUSES = new Set<EvidenceStatus>(["proven", "partial"]);
const GAP_LIMIT_FALLBACK = 16;

/**
 * Query one bounded slice from a source-backed relation provider.
 *
 * The query only follows indexed relation endpoints. It does not know about
 * routes, frameworks, fixtures, URLs, CLI commands, or JSX.
 */
export function queryEvidenceSlice(
  evidence: EvidenceSliceSource,
  query: SliceQuery | ScopeSliceQuery,
): EvidenceSlice;
export function queryEvidenceSlice(
  evidence: EvidenceSliceSource,
  seed: ScopeSeed,
  direction?: SliceDirection,
  boundaryPolicy?: BoundaryPolicyInput,
  terminalPolicy?: TerminalPolicyInput,
  budget?: number,
): EvidenceSlice;
export function queryEvidenceSlice(
  evidence: EvidenceSliceSource,
  request: SliceQuery | ScopeSliceQuery | ScopeSeed,
  direction?: SliceDirection,
  boundaryOverrides: BoundaryPolicyInput = {},
  terminalOverrides: TerminalPolicyInput = {},
  requestedBudget?: number,
): EvidenceSlice {
  const normalizedRequest = normalizeRequest(
    request,
    direction,
    boundaryOverrides,
    terminalOverrides,
    requestedBudget,
  );
  const cancellation = normalizedRequest.cancellation ?? NO_ANALYSIS_CANCELLATION;
  cancellation.throwIfCancelled();
  const boundary = normalizeBoundaryPolicy(normalizedRequest.boundaryPolicy);
  const terminals = normalizeTerminalPolicy(normalizedRequest.terminalPolicy);
  const budget = positiveLimit(
    normalizedRequest.budget,
    boundary.maxElements + boundary.maxRelations,
  );
  const provider = relationProviderFor(evidence);
  const indexed = indexProvider(provider);
  const includedElements = new Map<string, ProgramElement>();
  const includedRelations = new Map<string, ProgramRelation>();
  const origins: SliceOrigin[] = [];
  const sliceTerminals: SliceTerminal[] = [];
  const gaps: EvidenceGap[] = [];
  const gapKeys = new Set<string>();
  const queues: QueueItem[] = [];
  const queued = new Set<string>();
  const visited = new Set<string>();
  const visitedRelations = new Set<string>();
  const terminalKeys = new Set<string>();
  const truncation: SliceTruncation = {
    budget: false,
    depth: false,
    elements: false,
    relations: false,
    origins: false,
    terminals: false,
    gaps: false,
  };
  let workUsed = 0;
  let budgetExhausted = false;

  const addGap = (input: GapInput) => {
    const key = `${input.from ?? ""}:${input.to ?? ""}:${input.reason}:${input.label}`;
    if (gapKeys.has(key)) return;
    const gapLimit = Math.max(GAP_LIMIT_FALLBACK, Math.min(256, boundary.maxRelations));
    if (gaps.length >= gapLimit) {
      truncation.gaps = true;
      return;
    }
    gapKeys.add(key);
    gaps.push({
      id: `gap:${stableHash(key)}`,
      from: input.from,
      to: input.to,
      label: input.label,
      reason: input.reason,
      status: input.status ?? gapStatus(input.reason),
      location: input.location ?? null,
      proof: input.proof ?? [],
    });
  };

  const addOriginRoles = (element: ProgramElement) => {
    for (const role of element.originRoles) {
      const key = `${element.id}:${role}`;
      if (terminalKeys.has(`origin:${key}`)) continue;
      origins.push({
        elementId: element.id,
        role,
        label: element.label,
        status: element.status,
        proof: element.proof,
      });
      terminalKeys.add(`origin:${key}`);
    }
  };

  const addTerminalRoles = (element: ProgramElement) => {
    for (const role of element.terminalRoles) {
      if (!terminals.roles.includes(role)) continue;
      const key = `${element.id}:${role}`;
      if (terminalKeys.has(`terminal:${key}`)) continue;
      if (sliceTerminals.length >= terminals.maxTerminals) {
        truncation.terminals = true;
        addGap({
          from: element.id,
          to: null,
          label: `Terminal limit reached before ${element.label}.`,
          reason: "budget-exhausted",
          location: element.location,
          proof: element.proof,
        });
        continue;
      }
      sliceTerminals.push({
        elementId: element.id,
        role,
        label: element.label,
        status: element.status,
        proof: element.proof,
      });
      terminalKeys.add(`terminal:${key}`);
    }
  };

  const addElement = (element: ProgramElement, depth: number) => {
    if (includedElements.has(element.id)) return true;
    if (includedElements.size >= boundary.maxElements) {
      truncation.elements = true;
      addGap({
        from: includedElements.keys().next().value ?? null,
        to: element.id,
        label: `Element limit reached before ${element.label}.`,
        reason: "budget-exhausted",
        location: element.location,
        proof: element.proof,
      });
      return false;
    }
    includedElements.set(element.id, element);
    addOriginRoles(element);
    addTerminalRoles(element);
    if (shouldStopAtTerminal(element, terminals)) return true;
    const key = `${element.id}:${depth}`;
    if (!queued.has(key)) {
      queued.add(key);
      queues.push({ elementId: element.id, depth });
    }
    return true;
  };

  const entry = indexed.elementFor(normalizedRequest.seed.entryElementId);
  if (!entry) {
    addGap({
      from: normalizedRequest.seed.entryElementId,
      to: null,
      label: `Scope entry ${normalizedRequest.seed.entryElementId} is not in the evidence index.`,
      reason: "disconnected",
      status: "unsupported",
      location: null,
    });
  } else {
    addElement(entry, 0);
  }

  while (queues.length > 0 && !budgetExhausted) {
    cancellation.throwIfCancelled();
    const current = dequeueProviderPriorityQueue(queues, provider, normalizedRequest.direction);
    const stateKey = `${current.elementId}:${normalizedRequest.direction}`;
    if (visited.has(stateKey)) continue;
    visited.add(stateKey);
    const element = includedElements.get(current.elementId);
    if (!element) continue;

    if (workUsed >= budget) {
      budgetExhausted = true;
      truncation.budget = true;
      addGap({
        from: element.id,
        to: null,
        label: "Traversal budget exhausted before the frontier could be expanded.",
        reason: "budget-exhausted",
        location: element.location,
        proof: element.proof,
      });
      break;
    }

    const candidates = relationsForProvider(provider, current.elementId, normalizedRequest.direction, cancellation);
    if (candidates.length === 0 && !hasSliceRole(element, terminals)) {
      addGap({
        from: element.id,
        to: null,
        label: `No indexed relation continues from ${element.label}.`,
        reason: "disconnected",
        location: element.location,
        proof: element.proof,
      });
      continue;
    }

    let acceptedCandidate = false;
    for (const candidate of candidates) {
      cancellation.throwIfCancelled();
      const travelKey = `${element.id}:${candidate.relation.id}:${candidate.targetId}`;
      if (visitedRelations.has(travelKey)) continue;
      visitedRelations.add(travelKey);
      if (workUsed >= budget) {
        budgetExhausted = true;
        truncation.budget = true;
        addGap({
          from: element.id,
          to: candidate.targetId,
          label: "Traversal budget exhausted before the relation could be inspected.",
          reason: "budget-exhausted",
          location: relationLocation(candidate.relation),
          proof: relationProof(candidate.relation),
        });
        break;
      }
      workUsed += 1;

      const target = indexed.elementFor(candidate.targetId);
      if (!target) {
        addGap({
          from: element.id,
          to: candidate.targetId,
          label: `Relation ${candidate.relation.id} has no indexed target element.`,
          reason: "unproven-handoff",
          location: relationLocation(candidate.relation),
          proof: relationProof(candidate.relation),
        });
        continue;
      }

      const boundaryReason = blockedBoundary(target, boundary);
      if (boundaryReason) {
        addGap({
          from: element.id,
          to: target.id,
          label: `Boundary policy stopped at ${target.label}.`,
          reason: "unsupported-boundary",
          location: target.location,
          proof: [...relationProof(candidate.relation), ...target.proof],
          status: "unsupported",
        });
        continue;
      }
      if (!ACCEPTED_RELATION_STATUSES.has(candidate.relation.status)) {
        addGap({
          from: element.id,
          to: target.id,
          label: `Relation ${candidate.relation.id} does not have a proven or partial handoff.`,
          reason: "unproven-handoff",
          location: relationLocation(candidate.relation),
          proof: relationProof(candidate.relation),
        });
        continue;
      }
      if (target.status === "unsupported") {
        addGap({
          from: element.id,
          to: target.id,
          label: `Target ${target.label} is unsupported evidence.`,
          reason: "unproven-handoff",
          location: target.location,
          proof: target.proof,
        });
        continue;
      }
      if (current.depth >= boundary.maxDepth && !includedElements.has(target.id)) {
        truncation.depth = true;
        addGap({
          from: element.id,
          to: target.id,
          label: `Depth limit reached before ${target.label}.`,
          reason: "budget-exhausted",
          location: target.location,
          proof: relationProof(candidate.relation),
        });
        continue;
      }
      if (includedRelations.size >= boundary.maxRelations && !includedRelations.has(candidate.relation.id)) {
        truncation.relations = true;
        addGap({
          from: element.id,
          to: target.id,
          label: `Relation limit reached before ${candidate.relation.id}.`,
          reason: "budget-exhausted",
          location: relationLocation(candidate.relation),
          proof: relationProof(candidate.relation),
        });
        continue;
      }

      acceptedCandidate = true;
      const targetAdded = addElement(target, current.depth + 1);
      if (!targetAdded) continue;
      includedRelations.set(candidate.relation.id, candidate.relation);

      if (hasBoundary(target) && boundary.stopAtBoundary) {
        addGap({
          from: target.id,
          to: null,
          label: `Boundary policy stopped traversal beyond ${target.label}.`,
          reason: "unsupported-boundary",
          location: target.location,
          proof: target.proof,
          status: "partial",
        });
        removeQueuedElement(queues, target.id);
      }
    }
    if (!acceptedCandidate && candidates.length > 0 && !hasSliceRole(element, terminals)) {
      // Individual relation failures already explain the cut. Do not add a
      // second disconnected gap for the same frontier.
      continue;
    }
  }

  if (budgetExhausted && queues.length > 0) {
    const remaining = queues[0];
    addGap({
      from: remaining.elementId,
      to: null,
      label: "Additional indexed relations were not visited after the budget was exhausted.",
      reason: "budget-exhausted",
      location: includedElements.get(remaining.elementId)?.location ?? null,
    });
  }

  const elements = [...includedElements.values()];
  const relations = [...includedRelations.values()];
  if (isEvidenceRelationProvider(evidence)) {
    appendProviderGaps(provider, includedElements, addGap);
  } else {
    appendProgramGaps(evidence.gaps, includedElements, addGap);
  }
  const normalizedGaps = normalizeGapEndpoints(gaps, includedElements);
  cancellation.throwIfCancelled();
  assertGapEndpointReferences(normalizedGaps, includedElements);
  cancellation.throwIfCancelled();
  return {
    elements,
    relations,
    origins,
    terminals: sliceTerminals,
    gaps: normalizedGaps,
    coverage: coverageFor(
      elements,
      relations,
      origins,
      sliceTerminals,
      normalizedGaps,
      truncation,
      normalizedRequest.direction,
      budget,
      workUsed,
      budgetExhausted,
    ),
  };
}

function relationProviderFor(source: EvidenceSliceSource): EvidenceRelationSource {
  return isEvidenceRelationProvider(source)
    ? source
    : providerForProgramEvidence(source);
}

function isEvidenceRelationProvider(source: EvidenceSliceSource): source is EvidenceRelationSource {
  return "factIndex" in source
    && typeof source.getRelations === "function"
    && typeof source.getGaps === "function";
}

/** Alias for callers that describe the operation as building a slice. */
export const buildEvidenceSlice = queryEvidenceSlice;

function normalizeRequest(
  request: SliceQuery | ScopeSliceQuery | ScopeSeed,
  direction: SliceDirection | undefined,
  boundaryPolicy: BoundaryPolicyInput,
  terminalPolicy: TerminalPolicyInput,
  budget: number | undefined,
): Required<Pick<SliceQuery, "seed" | "direction" | "boundaryPolicy" | "terminalPolicy">> & Pick<SliceQuery, "budget" | "cancellation"> {
  if (isSeed(request)) {
    return {
      seed: request,
      direction: direction ?? request.defaults.direction,
      boundaryPolicy: { ...request.defaults.boundaryPolicy, ...boundaryPolicy },
      terminalPolicy: { ...request.defaults.terminalPolicy, ...terminalPolicy },
      budget,
      cancellation: undefined,
    };
  }
  const seed = "seed" in request ? request.seed : request.scope;
  return {
    seed,
    direction: request.direction ?? seed.defaults.direction,
    boundaryPolicy: { ...seed.defaults.boundaryPolicy, ...request.boundaryPolicy },
    terminalPolicy: { ...seed.defaults.terminalPolicy, ...request.terminalPolicy },
    budget: request.budget,
    cancellation: request.cancellation,
  };
}

function isSeed(request: SliceQuery | ScopeSliceQuery | ScopeSeed): request is ScopeSeed {
  return "entryElementId" in request;
}
