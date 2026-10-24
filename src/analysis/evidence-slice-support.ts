import type {
  ProgramElement as IndexedProgramElement,
  ProgramEvidenceGap,
  ProgramRelation as IndexedProgramRelation,
} from "./program-evidence";
import type {
  BoundaryKind,
  BoundaryPolicy,
  EvidenceGap,
  EvidenceProof,
  ProgramElement,
  ProgramRelation,
  SliceDirection,
  TerminalPolicy,
} from "./scope-seam";
import type { AnalysisCancellationToken } from "./cancellation";
import {
  scopeGapReason,
  toSliceElement,
  toSliceLocation,
  toSliceRelation,
} from "./evidence-slice-normalization";

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

export type ProviderEvidence = {
  elementFor: (elementId: string) => ProgramElement | undefined;
};

/** Keep provider indexing lazy. Only requested IDs are hydrated. */
export function indexProvider(provider: EvidenceRelationSource): ProviderEvidence {
  return {
    elementFor: (elementId) => {
      const element = provider.factIndex.getElement(elementId);
      return element ? toSliceElement(element) : undefined;
    },
  };
}

/* Normalization helpers live in evidence-slice-normalization.ts. */

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
