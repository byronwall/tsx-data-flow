import type {
  Coverage,
  EvidenceGap,
  EvidenceStatus,
  ProgramElement,
  ProgramRelation,
  SliceDirection,
  SliceOrigin,
  SliceTerminal,
} from "./scope-seam";

export type SliceCoverageBucket = {
  total: number;
  elements: number;
  relations: number;
  origins: number;
  terminals: number;
};

export type SliceTruncation = {
  budget: boolean;
  depth: boolean;
  elements: boolean;
  relations: boolean;
  origins: boolean;
  terminals: boolean;
  gaps: boolean;
};

export type SliceCoverage = Coverage & {
  included: SliceCoverageBucket;
  proven: SliceCoverageBucket;
  partial: SliceCoverageBucket;
  gap: { total: number };
  truncation: SliceTruncation;
};

function countStatus<T extends { status: EvidenceStatus }>(
  items: readonly T[],
  status: EvidenceStatus,
) {
  return items.filter((item) => item.status === status).length;
}

function coverageBucket(
  elements: readonly ProgramElement[],
  relations: readonly ProgramRelation[],
  origins: readonly SliceOrigin[],
  terminals: readonly SliceTerminal[],
  status: EvidenceStatus,
): SliceCoverageBucket {
  const elementCount = countStatus(elements, status);
  const relationCount = countStatus(relations, status);
  const originCount = countStatus(origins, status);
  const terminalCount = countStatus(terminals, status);
  return {
    total: elementCount + relationCount + originCount + terminalCount,
    elements: elementCount,
    relations: relationCount,
    origins: originCount,
    terminals: terminalCount,
  };
}

export function coverageFor(
  elements: ProgramElement[],
  relations: ProgramRelation[],
  origins: SliceOrigin[],
  terminals: SliceTerminal[],
  gaps: EvidenceGap[],
  truncation: SliceTruncation,
  direction: SliceDirection,
  budget: number,
  workUsed: number,
  budgetExhausted: boolean,
): SliceCoverage {
  const proven = coverageBucket(elements, relations, origins, terminals, "proven");
  const partial = coverageBucket(elements, relations, origins, terminals, "partial");
  const included = {
    total: elements.length + relations.length + origins.length + terminals.length,
    elements: elements.length,
    relations: relations.length,
    origins: origins.length,
    terminals: terminals.length,
  };
  const unsupported = {
    elements: countStatus(elements, "unsupported"),
    relations: countStatus(relations, "unsupported"),
    origins: countStatus(origins, "unsupported"),
    terminals: countStatus(terminals, "unsupported"),
  };
  const complete = gaps.length === 0 && !Object.values(truncation).some(Boolean);
  const hasUnsupportedGap = gaps.some((gap) => gap.status === "unsupported");
  const status: EvidenceStatus = complete
    ? "proven"
    : hasUnsupportedGap
      ? "unsupported"
      : "partial";
  const notes: string[] = [];
  if (gaps.length > 0) {
    notes.push(`${gaps.length} evidence gap${gaps.length === 1 ? "" : "s"} retained.`);
  }
  if (Object.values(truncation).some(Boolean)) {
    notes.push("The bounded query truncated traversal or output.");
  }
  return {
    status,
    complete,
    direction,
    budget: { limit: budget, used: Math.min(workUsed, budget), exhausted: budgetExhausted },
    budgetExhausted,
    elements: {
      total: elements.length,
      proven: countStatus(elements, "proven"),
      partial: countStatus(elements, "partial"),
      unsupported: unsupported.elements,
    },
    relations: {
      total: relations.length,
      proven: countStatus(relations, "proven"),
      partial: countStatus(relations, "partial"),
      unsupported: unsupported.relations,
    },
    origins: origins.length,
    terminals: terminals.length,
    gaps: gaps.length,
    notes,
    included,
    proven,
    partial,
    gap: { total: gaps.length },
    truncation,
  };
}
