import type { EvidenceSlice as DomainEvidenceSlice } from "../../analysis/evidence-slice";
import type {
  RouteOccurrenceLocation as DomainOccurrenceLocation,
} from "../../analysis/route-occurrence-surface";
import type { EvidenceProof as DomainEvidenceProof } from "../../analysis/scope-seam";
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { projectItems } from "./cancellable-projection";
import type {
  EvidenceSlice,
  RouteCount,
  RouteTotality,
} from "../route-totality-contracts";
import type { RouteTotalityUnavailable } from "../../analysis/route-data-totality";

type DomainEvidenceValue = DomainEvidenceSlice | RouteTotalityUnavailable;

export function projectEvidenceSlice(slice: DomainEvidenceValue, cancellation: AnalysisCancellationToken): EvidenceSlice | RouteTotality["evidenceSlice"] {
  if (isUnavailable(slice)) return { status: "unavailable", reason: slice.reason };
  return {
    elements: projectItems(slice.elements, (element) => ({
      id: element.id,
      kind: element.kind,
      fieldName: element.fieldName,
      operationKind: element.operationKind,
      index: element.index,
      label: element.label,
      source: {
        file: element.source.file,
        start: element.source.start,
        end: element.source.end,
      },
      location: projectLocation(element.location),
      status: element.status,
      proof: projectProofs(element.proof, cancellation),
      symbol: element.symbol,
      componentBinding: element.componentBinding
        ? { ...element.componentBinding }
        : null,
      consumerKind: element.kind === "field-consumer"
        ? (typeof element.attributes?.consumerKind === "string" ? element.attributes.consumerKind as "render" | "condition" | "handler" : null)
        : null,
      consumerLabel: element.kind === "field-consumer"
        ? (typeof element.attributes?.label === "string" && element.attributes.label.length > 0 ? element.attributes.label : null)
        : null,
      originRoles: [...element.originRoles],
      terminalRoles: [...element.terminalRoles],
      boundary: element.boundary,
    }), cancellation),
    relations: projectItems(slice.relations, (relation) => ({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      kind: relation.kind,
      status: relation.status,
      proof: projectProof(relation.proof, cancellation),
    }), cancellation),
    origins: projectItems(slice.origins, (origin) => projectOrigin(origin, cancellation), cancellation),
    terminals: projectItems(slice.terminals, (terminal) => ({
      elementId: terminal.elementId,
      role: terminal.role,
      label: terminal.label,
      status: terminal.status,
      proof: projectProofs(terminal.proof, cancellation),
    }), cancellation),
    gaps: projectItems(slice.gaps, (gap) => ({
      id: gap.id,
      from: gap.from,
      to: gap.to,
      label: gap.label,
      reason: gap.reason,
      status: gap.status,
      location: gap.location ? projectLocation(gap.location) : null,
      proof: projectProofs(gap.proof, cancellation),
    }), cancellation),
    coverage: {
      status: slice.coverage.status,
      complete: slice.coverage.complete,
      direction: slice.coverage.direction,
      budget: {
        limit: slice.coverage.budget.limit,
        used: slice.coverage.budget.used,
        exhausted: slice.coverage.budget.exhausted,
      },
      budgetExhausted: slice.coverage.budgetExhausted,
      elements: { ...slice.coverage.elements },
      relations: { ...slice.coverage.relations },
      origins: slice.coverage.origins,
      terminals: slice.coverage.terminals,
      gaps: slice.coverage.gaps,
      notes: [...slice.coverage.notes],
      included: { ...slice.coverage.included },
      proven: { ...slice.coverage.proven },
      partial: { ...slice.coverage.partial },
      gap: { ...slice.coverage.gap },
      truncation: { ...slice.coverage.truncation },
    },
  };
}

export function projectCounts(
  surface: RouteTotality["occurrenceSurface"],
  evidence: RouteTotality["evidenceSlice"],
): RouteTotality["counts"] {
  const occurrenceCounts = isUnavailable(surface)
    ? unavailableOccurrenceCounts()
    : surface.totals;
  const evidenceCounts = isUnavailable(evidence)
    ? unavailableEvidenceCounts()
    : evidenceCountsFor(evidence);
  return {
    ...occurrenceCounts,
    ...evidenceCounts,
  };
}

function unavailableOccurrenceCounts(): Pick<RouteTotality["counts"], "definitions" | "occurrences" | "edges" | "boundaries" | "origins" | "terminals" | "hiddenWrappers" | "repeated" | "conditional" | "collection" | "omissions" | "omittedItems"> {
  return {
    definitions: unknownCount(),
    occurrences: unknownCount(),
    edges: unknownCount(),
    boundaries: unknownCount(),
    origins: unknownCount(),
    terminals: unknownCount(),
    hiddenWrappers: unknownCount(),
    repeated: unknownCount(),
    conditional: unknownCount(),
    collection: unknownCount(),
    omissions: unknownCount(),
    omittedItems: unknownCount(),
  };
}

function unavailableEvidenceCounts(): Pick<RouteTotality["counts"], "evidenceElements" | "evidenceRelations" | "evidenceOrigins" | "evidenceTerminals" | "evidenceGaps"> {
  return {
    evidenceElements: unknownCount(),
    evidenceRelations: unknownCount(),
    evidenceOrigins: unknownCount(),
    evidenceTerminals: unknownCount(),
    evidenceGaps: unknownCount(),
  };
}

function evidenceCountsFor(slice: EvidenceSlice): Pick<RouteTotality["counts"], "evidenceElements" | "evidenceRelations" | "evidenceOrigins" | "evidenceTerminals" | "evidenceGaps"> {
  const lowerBound = slice.coverage.budgetExhausted || Object.values(slice.coverage.truncation).some(Boolean);
  const totalStatus = lowerBound ? "lower-bound" : "exact";
  return {
    evidenceElements: evidenceCount(slice.coverage.included.elements, slice.coverage.elements.total, totalStatus),
    evidenceRelations: evidenceCount(slice.coverage.included.relations, slice.coverage.relations.total, totalStatus),
    evidenceOrigins: evidenceCount(slice.coverage.included.origins, slice.coverage.origins, totalStatus),
    evidenceTerminals: evidenceCount(slice.coverage.included.terminals, slice.coverage.terminals, totalStatus),
    evidenceGaps: evidenceCount(slice.gaps.length, slice.coverage.gap.total, totalStatus),
  };
}

function evidenceCount(emitted: number, total: number, totalStatus: "exact" | "lower-bound"): RouteCount {
  return { emitted, total, totalStatus };
}

type ProjectableSourceLocation = {
  file: string;
  line: number;
  column: number;
  span: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
};

export function projectLocation(location: ProjectableSourceLocation) {
  return {
    file: location.file,
    line: location.line,
    column: location.column,
    span: {
      startLine: location.span.startLine,
      startColumn: location.span.startColumn,
      endLine: location.span.endLine,
      endColumn: location.span.endColumn,
    },
  };
}

export function projectOccurrenceLocation(location: DomainOccurrenceLocation) {
  return projectLocation(location);
}

export function projectSourceLocations(
  locations: readonly ProjectableSourceLocation[],
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  const projected: ReturnType<typeof projectLocation>[] = [];
  for (const location of locations) {
    cancellation.throwIfCancelled();
    projected.push(projectLocation(location));
  }
  cancellation.throwIfCancelled();
  return projected;
}

export function projectProofs(proofs: DomainEvidenceProof[], cancellation: AnalysisCancellationToken): Array<RouteTotality["scopeProof"][number]> {
  return projectItems(proofs, (proof) => ({
    kind: proof.kind,
    detail: proof.detail,
    locations: projectSourceLocations(proof.locations, cancellation),
    status: proof.status,
  }), cancellation);
}

export function projectProof(proof: DomainEvidenceProof, cancellation: AnalysisCancellationToken): EvidenceSlice["relations"][number]["proof"] {
  cancellation.throwIfCancelled();
  return {
    kind: proof.kind,
    detail: proof.detail,
    locations: projectSourceLocations(proof.locations, cancellation),
    status: proof.status,
  };
}

export function projectOrigin(origin: NonNullable<DomainEvidenceSlice["origins"]>[number], cancellation: AnalysisCancellationToken) {
  return {
    elementId: origin.elementId,
    role: origin.role,
    label: origin.label,
    status: origin.status,
    proof: projectProofs(origin.proof, cancellation),
  };
}

function unknownCount(): RouteCount {
  return { emitted: 0, total: null, totalStatus: "unknown" };
}

export function isUnavailable(value: unknown): value is RouteTotalityUnavailable {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { status?: unknown; reason?: unknown };
  return candidate.status === "unavailable" && typeof candidate.reason === "string";
}
