import path from "node:path";
import type * as TypeScript from "typescript";
import {
  NO_ANALYSIS_CANCELLATION,
  isAnalysisCancelledError,
  type AnalysisCancellationToken,
} from "./cancellation";
import { queryEvidenceSlice, type EvidenceSlice } from "./evidence-slice";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import {
  buildSolidRouteSeed,
} from "./scope-adapters/solid-route";
import type {
  EvidenceGap,
  EvidenceProof,
  OriginRole,
  SourceLocation,
  ScopeCandidate,
  ScopeSeed,
  TerminalRole,
} from "./scope-seam";
import {
  buildRouteOccurrenceSurface,
  type RouteOccurrenceSurface,
} from "./route-occurrence-surface";
import {
  buildRouteTotalityBridges,
  routeTotalityBridgeCounts,
  type RouteTotalityBridge,
  type RouteTotalityBridgeCounts,
} from "./route-totality-bridge";
import {
  unavailableRouteTotalityFieldLineage,
  type RouteTotalityFieldLineage,
} from "./route-totality-field-lineage";
import {
  buildSelectedRouteTotalityFieldProof,
  NO_SELECTED_SOURCE_FIELD_LINEAGE_REASON,
  SELECTED_ORIGIN_UNAVAILABLE_REASON,
} from "./route-totality-field-proof";
import {
  mergeSelectedRouteSource,
  type RouteTotalitySelectedSource,
} from "./route-totality-selected-source";
import type { RouteRecord } from "./route-data";
import {
  buildSolidRouteContextContinuity,
} from "./solid-route-context-continuity";
import {
  unavailableContextContinuity,
  type RouteContextContinuity,
} from "./context-continuity";
import { stableHash } from "./scope-seam";

export type RouteTotalityUnavailable = {
  status: "unavailable";
  reason: string;
};

export type RouteTotalityGap = {
  id: string;
  source: "route-selection" | "occurrence-surface" | "evidence-slice" | "context-continuity";
  reason: string;
  label: string;
  status: "partial" | "unsupported";
  location: SourceLocation | null;
  proof: EvidenceProof[];
};

export type RouteTotalityFindingTarget =
  | {
      source: "evidence-slice";
      kind: "element";
      id: string;
      role: null;
      family: string;
    }
  | {
      source: "evidence-slice";
      kind: "origin";
      id: string;
      role: OriginRole;
      family: string;
    }
  | {
      source: "evidence-slice";
      kind: "terminal";
      id: string;
      role: TerminalRole;
      family: string;
    }
  | {
      source: "occurrence-surface";
      kind: "terminal";
      id: string;
      role: null;
      family: string;
    };

export type RouteTotalityFindingAttachment = {
  id: string;
  findingId: string;
  expressionId: string;
  target: RouteTotalityFindingTarget;
  location: SourceLocation;
  status: "proven" | "partial";
  proof: EvidenceProof;
};

export type RouteTotalityFindingIndexEntry = {
  findingId: string;
  label: string;
  family: string | null;
  file: string;
  location: SourceLocation;
  expressionIds: string[];
  detailRef: {
    source: "file-page";
    kind: "finding-detail";
    id: string;
    file: string;
  };
};

export type RouteTotalityCounts = {
  definitions: number;
  emittedDefinitions: number;
  totalOccurrences: number;
  emittedOccurrences: number;
  repeatedSites: number;
  conditionalSites: number;
  collectionSites: number;
  frameworkBoundaries: number;
  hiddenWrapperCompatibilityOccurrences: number;
  terminalOccurrences: number;
  namedOmissions: number;
  omittedItems: number;
  evidenceElements: number;
  evidenceRelations: number;
  evidenceOrigins: number;
  evidenceTerminals: number;
  evidenceGaps: number;
};

export type RouteTotalityRecord = {
  key: string;
  routeKey: string;
  route: Pick<RouteRecord, "key" | "pathPattern" | "file">;
  status: "complete" | "partial" | "unavailable";
  candidate: ScopeCandidate | null;
  seed: ScopeSeed | null;
  scopeProof: EvidenceProof[];
  occurrenceSurface: RouteOccurrenceSurface | RouteTotalityUnavailable;
  evidenceSlice: EvidenceSlice | RouteTotalityUnavailable;
  contextContinuity: RouteContextContinuity;
  bridges: RouteTotalityBridge[];
  bridgeCounts: RouteTotalityBridgeCounts;
  fieldLineage: RouteTotalityFieldLineage;
  findingAttachments: RouteTotalityFindingAttachment[];
  findingIndex: RouteTotalityFindingIndexEntry[];
  counts: RouteTotalityCounts;
  gaps: RouteTotalityGap[];
  omissions: string[];
};

type CandidateSelection = {
  candidate: ScopeCandidate;
  proof: EvidenceProof;
};

const EMPTY_COUNTS: RouteTotalityCounts = {
  definitions: 0,
  emittedDefinitions: 0,
  totalOccurrences: 0,
  emittedOccurrences: 0,
  repeatedSites: 0,
  conditionalSites: 0,
  collectionSites: 0,
  frameworkBoundaries: 0,
  hiddenWrapperCompatibilityOccurrences: 0,
  terminalOccurrences: 0,
  namedOmissions: 0,
  omittedItems: 0,
  evidenceElements: 0,
  evidenceRelations: 0,
  evidenceOrigins: 0,
  evidenceTerminals: 0,
  evidenceGaps: 0,
};

const EMPTY_BRIDGE_COUNTS: RouteTotalityBridgeCounts = {
  total: 0,
  originToRender: 0,
  renderTerminalToOrigin: 0,
  proven: 0,
  partial: 0,
};

export function buildRouteTotalityRecords(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  routes: readonly RouteRecord[],
  provider: EvidenceRelationProvider,
  candidates: readonly ScopeCandidate[],
  selectedSource: RouteTotalitySelectedSource | null = null,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteTotalityRecord[] {
  return routes.map((route) => {
    cancellation.throwIfCancelled();
    return buildRouteTotalityRecord(ts, program, root, route, provider, candidates, selectedSource, cancellation);
  });
}

function buildRouteTotalityRecord(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  route: RouteRecord,
  provider: EvidenceRelationProvider,
  candidates: readonly ScopeCandidate[],
  selectedSource: RouteTotalitySelectedSource | null,
  cancellation: AnalysisCancellationToken,
): RouteTotalityRecord {
  cancellation.throwIfCancelled();
  const routeInfo = { key: route.key, pathPattern: route.pathPattern, file: route.file };
  const selection = selectCandidate(root, route, provider, candidates);
  if (!selection) return unavailableRecord(routeInfo, "No unique proven Solid route candidate matched the route source identity and path.");

  const seed = buildSolidRouteSeed(selection.candidate);
  const scopeProof = [
    ...selection.candidate.proof,
    ...seed.proof,
    selection.proof,
  ];
  const occurrenceSurface = buildOccurrenceSurface(ts, program, root, route, selection.candidate.id, seed.entryElementId, cancellation);
  cancellation.throwIfCancelled();
  const contextContinuity = !isUnavailable(occurrenceSurface)
    ? buildSolidRouteContextContinuity(ts, program, root, occurrenceSurface, cancellation)
    : unavailableContextContinuity(occurrenceSurface.reason);
  cancellation.throwIfCancelled();
  const normalEvidenceSlice = buildEvidenceSlice(provider, seed, cancellation);
  const evidenceSlice = isUnavailable(normalEvidenceSlice)
    ? normalEvidenceSlice
    : mergeSelectedRouteSource(provider, normalEvidenceSlice, selectedSource, cancellation);
  cancellation.throwIfCancelled();
  const bridges = !isUnavailable(occurrenceSurface) && !isUnavailable(evidenceSlice)
    ? buildRouteTotalityBridges(evidenceSlice, occurrenceSurface, cancellation)
    : [];
  const selectedProof = !isUnavailable(occurrenceSurface) && !isUnavailable(evidenceSlice) && selectedSource
    ? buildSelectedRouteTotalityFieldProof(ts, program, root, provider, route, evidenceSlice, occurrenceSurface, selectedSource, cancellation)
    : null;
  const fieldLineage = !isUnavailable(occurrenceSurface) && !isUnavailable(evidenceSlice)
    ? selectedSource
      ? selectedProof ?? unavailableRouteTotalityFieldLineage(SELECTED_ORIGIN_UNAVAILABLE_REASON)
      // The broad route graph remains available without a source identity. The
      // ledger cannot prove field identity across multiple sources, so keep
      // field lineage neutral until the user selects one exact source.
      : unavailableRouteTotalityFieldLineage(NO_SELECTED_SOURCE_FIELD_LINEAGE_REASON)
    : unavailableRouteTotalityFieldLineage(
      isUnavailable(occurrenceSurface)
        ? occurrenceSurface.reason
        : isUnavailable(evidenceSlice)
          ? evidenceSlice.reason
          : "Field lineage inputs were unavailable.",
    );
  const gaps = [
    ...route.omissions.map((label, index) => routeGap(route, index, label)),
    ...surfaceGaps(occurrenceSurface),
    ...sliceGaps(evidenceSlice),
    ...contextGaps(contextContinuity),
  ];
  const omissions = [
    ...route.omissions,
    ...(isUnavailable(occurrenceSurface) ? [occurrenceSurface.reason] : occurrenceSurface.omissions.map((omission) => omission.label)),
  ];
  const counts = countsFor(occurrenceSurface, evidenceSlice);
  const status = isUnavailable(occurrenceSurface) || isUnavailable(evidenceSlice)
    ? "unavailable"
    : gaps.length || occurrenceSurface.status === "partial" || !evidenceSlice.coverage.complete || contextContinuity.status !== "complete"
      ? "partial"
      : "complete";
  return {
    key: route.key,
    routeKey: route.key,
    route: routeInfo,
    status,
    candidate: selection.candidate,
    seed,
    scopeProof,
    occurrenceSurface,
    evidenceSlice,
    contextContinuity,
    bridges,
    bridgeCounts: routeTotalityBridgeCounts(bridges),
    fieldLineage,
    findingAttachments: [],
    findingIndex: [],
    counts,
    gaps,
    omissions,
  };
}

function selectCandidate(
  root: string,
  route: RouteRecord,
  provider: EvidenceRelationProvider,
  candidates: readonly ScopeCandidate[],
): CandidateSelection | null {
  const routeEvidence = route.evidence;
  if (!routeEvidence) return null;
  const matches = candidates.filter((candidate) => {
    if (candidate.kind !== "route" || candidate.adapter !== "solid-route") return false;
    if (!candidate.proof.every((item) => item.status === "proven")) return false;
    const entry = provider.facts.getElement(candidate.entryElementId);
    if (!entry || entry.id !== candidate.entryElementId) return false;
    if (!sameFile(root, routeEvidence.file, route.file)) return false;
    if (!sameFile(root, candidate.entry.file, route.file) || !sameFile(root, entry.location.file, route.file)) return false;
    if (candidate.label !== `Solid route ${route.pathPattern}`) return false;
    if (!sameSpan(candidate.entry.span, routeEvidence.span) || !sameSpan(entry.location.span, routeEvidence.span)) return false;
    return true;
  });
  if (matches.length !== 1) return null;
  const candidate = matches[0];
  return {
    candidate,
    proof: {
      kind: "route-candidate-match",
      detail: `The proven ${candidate.adapter} candidate matches ${route.file} and the ${route.pathPattern} route path at the same source span.`,
      locations: [candidate.entry, locationForRouteEvidence(route)],
      status: "proven",
    },
  };
}

function buildOccurrenceSurface(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  route: RouteRecord,
  scopeId: string,
  scopeSeed: string,
  cancellation: AnalysisCancellationToken,
): RouteOccurrenceSurface | RouteTotalityUnavailable {
  try {
    return buildRouteOccurrenceSurface(ts, program, root, route, { scopeId, scopeSeed, cancellation });
  } catch (error) {
    if (isAnalysisCancelledError(error)) throw error;
    return { status: "unavailable", reason: `Route occurrence surface could not be built: ${errorMessage(error)}.` };
  }
}

function buildEvidenceSlice(provider: EvidenceRelationProvider, seed: ScopeSeed, cancellation: AnalysisCancellationToken): EvidenceSlice | RouteTotalityUnavailable {
  try {
    return queryEvidenceSlice(provider, { seed, cancellation });
  } catch (error) {
    if (isAnalysisCancelledError(error)) throw error;
    return { status: "unavailable", reason: `Shared evidence slice could not be queried: ${errorMessage(error)}.` };
  }
}

function countsFor(
  occurrenceSurface: RouteOccurrenceSurface | RouteTotalityUnavailable,
  evidenceSlice: EvidenceSlice | RouteTotalityUnavailable,
): RouteTotalityCounts {
  const counts = { ...EMPTY_COUNTS };
  if (!isUnavailable(occurrenceSurface)) {
    Object.assign(counts, occurrenceSurface.totals);
  }
  if (!isUnavailable(evidenceSlice)) {
    counts.evidenceElements = evidenceSlice.coverage.elements.total;
    counts.evidenceRelations = evidenceSlice.coverage.relations.total;
    counts.evidenceOrigins = evidenceSlice.coverage.origins;
    counts.evidenceTerminals = evidenceSlice.coverage.terminals;
    counts.evidenceGaps = evidenceSlice.coverage.gaps;
  }
  return counts;
}

function surfaceGaps(surface: RouteOccurrenceSurface | RouteTotalityUnavailable): RouteTotalityGap[] {
  if (isUnavailable(surface)) return [unavailableGap("occurrence-surface", surface.reason)];
  return surface.omissions.map((omission) => ({
    id: omission.id,
    source: "occurrence-surface",
    reason: omission.reason,
    label: omission.label,
    status: "partial",
    location: omission.locations[0] ?? null,
    proof: [],
  }));
}

function sliceGaps(slice: EvidenceSlice | RouteTotalityUnavailable): RouteTotalityGap[] {
  if (isUnavailable(slice)) return [unavailableGap("evidence-slice", slice.reason)];
  return slice.gaps.map((gap) => evidenceGap(gap));
}

function contextGaps(context: RouteContextContinuity): RouteTotalityGap[] {
  return context.gaps.map((gap) => ({
    id: gap.id,
    source: "context-continuity",
    reason: gap.reason,
    label: gap.label,
    status: gap.status,
    location: gap.location,
    proof: gap.proof,
  }));
}

function evidenceGap(gap: EvidenceGap): RouteTotalityGap {
  return {
    id: gap.id,
    source: "evidence-slice",
    reason: gap.reason,
    label: gap.label,
    status: gap.status,
    location: gap.location,
    proof: gap.proof,
  };
}

function routeGap(route: RouteRecord, index: number, label: string): RouteTotalityGap {
  return {
    id: `route-totality-gap:${stableHash(`${route.key}:${index}:${label}`)}`,
    source: "route-selection",
    reason: "route-omission",
    label,
    status: "partial",
    location: route.evidence ? locationForRouteEvidence(route) : null,
    proof: [],
  };
}

function unavailableRecord(route: Pick<RouteRecord, "key" | "pathPattern" | "file">, reason: string): RouteTotalityRecord {
  const gap: RouteTotalityGap = {
    id: `route-totality-gap:${stableHash(`${route.key}:${reason}`)}`,
    source: "route-selection",
    reason: "unavailable",
    label: reason,
    status: "unsupported",
    location: null,
    proof: [],
  };
  return {
    key: route.key,
    routeKey: route.key,
    route,
    status: "unavailable",
    candidate: null,
    seed: null,
    scopeProof: [],
    occurrenceSurface: { status: "unavailable", reason },
    evidenceSlice: { status: "unavailable", reason },
    contextContinuity: unavailableContextContinuity(reason),
    bridges: [],
    bridgeCounts: { ...EMPTY_BRIDGE_COUNTS },
    fieldLineage: unavailableRouteTotalityFieldLineage(reason),
    findingAttachments: [],
    findingIndex: [],
    counts: { ...EMPTY_COUNTS },
    gaps: [gap],
    omissions: [reason],
  };
}

function unavailableGap(source: "occurrence-surface" | "evidence-slice", label: string): RouteTotalityGap {
  return {
    id: `route-totality-gap:${stableHash(`${source}:${label}`)}`,
    source,
    reason: "unavailable",
    label,
    status: "unsupported",
    location: null,
    proof: [],
  };
}

function locationForRouteEvidence(route: RouteRecord): SourceLocation {
  const evidence = route.evidence!;
  return {
    file: evidence.file,
    line: evidence.line,
    column: evidence.column,
    span: evidence.span,
  };
}

function sameFile(root: string, left: string, right: string) {
  const leftAbsolute = path.normalize(path.isAbsolute(left) ? left : path.resolve(root, left));
  const rightAbsolute = path.normalize(path.isAbsolute(right) ? right : path.resolve(root, right));
  return leftAbsolute === rightAbsolute;
}

function sameSpan(left: SourceLocation["span"], right: SourceLocation["span"]) {
  return left.startLine === right.startLine
    && left.startColumn === right.startColumn
    && left.endLine === right.endLine
    && left.endColumn === right.endColumn;
}

function isUnavailable(value: RouteOccurrenceSurface | EvidenceSlice | RouteTotalityUnavailable): value is RouteTotalityUnavailable {
  return "reason" in value && value.status === "unavailable";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
