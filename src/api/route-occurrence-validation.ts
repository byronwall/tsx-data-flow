import type {
  EvidenceSlice,
  RouteOccurrenceSurface,
  RouteTotality,
} from "./route-totality-contracts";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "../analysis/cancellation";
import {
  addIssue,
  prefixIssues,
  validateEvidenceReferences,
  validateOccurrenceReferences,
  type ValidationIssue,
} from "./route-occurrence-validation-graph";
import {
  compareCount,
  validateEvidenceCoverage,
  validateSurfaceTotals,
} from "./route-occurrence-validation-totality";
import { validateRouteTotalityBridges } from "./route-totality-bridge-validation";
import { validateRouteTotalityFindingAttachments } from "./route-totality-finding-validation";
import { validateRouteTotalityFieldLineage } from "./route-totality-field-lineage-validation";
import { validateRouteContextContinuity } from "./route-context-continuity-validation";

export type RouteOccurrenceValidationIssue = ValidationIssue;

const isUnavailable = (
  value: RouteTotality["occurrenceSurface"] | RouteTotality["evidenceSlice"],
): value is { status: "unavailable"; reason: string } => "reason" in value;

const evidenceCountStatus = (slice: EvidenceSlice): "exact" | "lower-bound" =>
  Object.values(slice.coverage.truncation).some(Boolean) || slice.coverage.budgetExhausted
    ? "lower-bound"
    : "exact";

export const validateEvidenceSlice = (
  slice: EvidenceSlice,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteOccurrenceValidationIssue[] => [
  ...validateEvidenceReferences(slice, cancellation),
  ...validateEvidenceCoverage(slice, cancellation),
];

export const validateRouteOccurrenceSurface = (
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteOccurrenceValidationIssue[] => [
  ...validateOccurrenceReferences(surface, cancellation),
  ...validateSurfaceTotals(surface, cancellation),
];

export const validateRouteTotality = (
  totality: RouteTotality,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteOccurrenceValidationIssue[] => {
  cancellation.throwIfCancelled();
  const issues: RouteOccurrenceValidationIssue[] = [];
  const surface = totality.occurrenceSurface;
  const evidence = totality.evidenceSlice;
  const surfaceUnavailable = isUnavailable(surface);
  const evidenceUnavailable = isUnavailable(evidence);

  if ((totality.candidate === null) !== (totality.seed === null)) {
    addIssue(issues, ["seed"], "candidate and seed must be present together");
  }
  if (totality.candidate !== null && totality.seed !== null) {
    const { candidate, seed } = totality;
    if (seed.candidateId !== candidate.id) addIssue(issues, ["seed", "candidateId"], "seed candidateId must match candidate.id");
    if (seed.entryElementId !== candidate.entryElementId) addIssue(issues, ["seed", "entryElementId"], "seed entryElementId must match candidate.entryElementId");
    if (seed.adapter !== candidate.adapter) addIssue(issues, ["seed", "adapter"], "seed adapter must match candidate.adapter");
    if (seed.label !== candidate.label) addIssue(issues, ["seed", "label"], "seed label must match candidate.label");
    if (seed.framework !== candidate.framework) addIssue(issues, ["seed", "framework"], "seed framework must match candidate.framework");
    if (JSON.stringify(seed.defaults) !== JSON.stringify(candidate.defaults)) addIssue(issues, ["seed", "defaults"], "seed defaults must match candidate defaults");
    if (candidate.proof.length === 0 || seed.proof.length === 0 || totality.scopeProof.length === 0) addIssue(issues, ["scopeProof"], "proven identity requires candidate, seed, and scope proof");
  } else if (totality.scopeProof.length > 0) {
    addIssue(issues, ["scopeProof"], "scope proof requires a candidate and seed");
  }

  if (!surfaceUnavailable) {
    prefixIssues(issues, ["occurrenceSurface"], validateRouteOccurrenceSurface(surface, cancellation));
    if (surface.route.key !== totality.route.key || surface.route.pathPattern !== totality.route.pathPattern || surface.route.file !== totality.route.file) addIssue(issues, ["occurrenceSurface", "route"], "surface route identity does not match totality route");
    const surfaceKeys = ["definitions", "occurrences", "edges", "boundaries", "origins", "terminals", "hiddenWrappers", "repeated", "conditional", "collection", "omissions", "omittedItems"] as const;
    for (const key of surfaceKeys) {
      cancellation.throwIfCancelled();
      compareCount(totality.counts[key], surface.totals[key], ["counts", key], issues);
    }
    if ((surface.omissions.length > 0 || Object.values(surface.truncation).some(Boolean)) && totality.omissions.length === 0) addIssue(issues, ["omissions"], "surface omissions or truncation require named route omissions");
  }

  if (!evidenceUnavailable) {
    prefixIssues(issues, ["evidenceSlice"], validateEvidenceSlice(evidence, cancellation));
    const status = evidenceCountStatus(evidence);
    const coverage = evidence.coverage;
    const expected = {
      evidenceElements: { emitted: coverage.included.elements, total: coverage.elements.total, totalStatus: status },
      evidenceRelations: { emitted: coverage.included.relations, total: coverage.relations.total, totalStatus: status },
      evidenceOrigins: { emitted: coverage.included.origins, total: coverage.origins, totalStatus: status },
      evidenceTerminals: { emitted: coverage.included.terminals, total: coverage.terminals, totalStatus: status },
      evidenceGaps: { emitted: evidence.gaps.length, total: coverage.gap.total, totalStatus: status },
    };
    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      cancellation.throwIfCancelled();
      compareCount(totality.counts[key], expected[key], ["counts", key], issues);
    }
    compareCount(totality.counts.origins, expected.evidenceOrigins, ["counts", "origins"], issues);
    if (!surfaceUnavailable) {
      const evidenceElementIds = new Set<string>();
      for (const element of evidence.elements) {
        cancellation.throwIfCancelled();
        evidenceElementIds.add(element.id);
      }
      surface.origins.forEach((origin, index) => {
        cancellation.throwIfCancelled();
        if (!evidenceElementIds.has(origin.elementId)) addIssue(issues, ["occurrenceSurface", "origins", index, "elementId"], "origin references an unknown evidence element");
      });
      if (surface.origins.length !== evidence.origins.length) addIssue(issues, ["occurrenceSurface", "origins"], "serialized origins must match evidence origins");
      const evidenceOrigins = new Map<string, EvidenceSlice["origins"][number]>();
      for (const origin of evidence.origins) {
        cancellation.throwIfCancelled();
        evidenceOrigins.set(`${origin.elementId}:${origin.role}`, origin);
      }
      surface.origins.forEach((origin, index) => {
        cancellation.throwIfCancelled();
        const expectedOrigin = evidenceOrigins.get(`${origin.elementId}:${origin.role}`);
        if (expectedOrigin === undefined) {
          addIssue(issues, ["occurrenceSurface", "origins", index], "origin is not present in the shared evidence slice");
        } else if (origin.label !== expectedOrigin.label || origin.status !== expectedOrigin.status) {
          addIssue(issues, ["occurrenceSurface", "origins", index], "origin does not match the shared evidence slice");
        }
      });
    }
  } else {
    if (totality.counts.evidenceElements.totalStatus !== "unknown") addIssue(issues, ["counts", "evidenceElements"], "unavailable evidence requires unknown evidence totals");
    if (!surfaceUnavailable && surface.origins.length > 0) addIssue(issues, ["occurrenceSurface", "origins"], "origins require an available shared evidence slice");
  }

  issues.push(...validateRouteTotalityBridges(totality, cancellation));
  issues.push(...validateRouteTotalityFieldLineage(totality, cancellation));
  issues.push(...validateRouteTotalityFindingAttachments(totality, cancellation));
  issues.push(...validateRouteContextContinuity(totality, cancellation));

  const gapIds = new Set<string>();
  totality.gaps.forEach((gap, index) => {
    cancellation.throwIfCancelled();
    if (gapIds.has(gap.id)) addIssue(issues, ["gaps", index, "id"], "duplicate route totality gap id");
    gapIds.add(gap.id);
  });

  if (totality.status === "complete") {
    if (totality.candidate === null || totality.seed === null || surfaceUnavailable || evidenceUnavailable || totality.gaps.length > 0 || totality.omissions.length > 0) addIssue(issues, ["status"], "complete totality requires proven identity and complete payloads");
    if (totality.contextContinuity.status !== "complete") addIssue(issues, ["contextContinuity", "status"], "complete totality requires complete context continuity");
    if (!surfaceUnavailable && surface.status !== "complete") addIssue(issues, ["occurrenceSurface", "status"], "complete totality requires a complete occurrence surface");
    if (!evidenceUnavailable && !evidence.coverage.complete) addIssue(issues, ["evidenceSlice", "coverage", "complete"], "complete totality requires complete evidence coverage");
  }
  if (totality.status === "unavailable" && (totality.candidate !== null || totality.seed !== null)) addIssue(issues, ["status"], "unavailable totality cannot claim a candidate or seed");
  cancellation.throwIfCancelled();
  return issues;
};
