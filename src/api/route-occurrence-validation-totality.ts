import type {
  EvidenceSlice,
  RouteCount,
  RouteOccurrenceSurface,
} from "./route-totality-contracts";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "../analysis/cancellation";
import {
  addIssue,
  type ValidationIssue,
} from "./route-occurrence-validation-graph";

const statusCounts = (
  values: Array<{ status: "proven" | "partial" | "unsupported" }>,
  cancellation: AnalysisCancellationToken,
): { total: number; proven: number; partial: number; unsupported: number } =>
  values.reduce(
    (counts, value) => {
      cancellation.throwIfCancelled();
      counts.total += 1;
      counts[value.status] += 1;
      return counts;
    },
    { total: 0, proven: 0, partial: 0, unsupported: 0 },
  );

const equalCount = (
  issues: ValidationIssue[],
  path: Array<string | number>,
  label: string,
  actual: number,
  expected: number,
): void => {
  if (actual !== expected) addIssue(issues, [...path, label], `count must equal ${expected}`);
};

export const validateTotalCount = (
  count: RouteCount,
  path: Array<string | number>,
  issues: ValidationIssue[],
): void => {
  if (count.totalStatus === "unknown" && count.total !== null) addIssue(issues, path, "unknown totals require total: null");
  if (count.totalStatus !== "unknown" && count.total === null) addIssue(issues, path, "known totals require a numeric total");
  if (count.total !== null && count.total < count.emitted) addIssue(issues, path, "total cannot be smaller than emitted");
};

const validateCollectionCount = (
  count: RouteCount,
  length: number,
  truncated: boolean,
  namedOmission: boolean,
  path: Array<string | number>,
  issues: ValidationIssue[],
): void => {
  validateTotalCount(count, path, issues);
  if (count.emitted !== length) addIssue(issues, path, `emitted must equal serialized length ${length}`);
  if (count.total !== null && count.total > count.emitted && !truncated && !namedOmission) {
    addIssue(issues, path, "a total above emitted requires truncation or a named omission");
  }
};

export const compareCount = (
  left: RouteCount,
  right: RouteCount,
  path: Array<string | number>,
  issues: ValidationIssue[],
): void => {
  validateTotalCount(left, path, issues);
  if (left.emitted !== right.emitted || left.total !== right.total || left.totalStatus !== right.totalStatus) {
    addIssue(issues, path, "count does not match its nested total");
  }
};

export const validateEvidenceCoverage = (
  slice: EvidenceSlice,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const { coverage } = slice;
  const elements = statusCounts(slice.elements, cancellation);
  const relations = statusCounts(slice.relations, cancellation);
  const origins = statusCounts(slice.origins, cancellation);
  const terminals = statusCounts(slice.terminals, cancellation);
  const all = statusCounts([...slice.elements, ...slice.relations, ...slice.origins, ...slice.terminals], cancellation);
  const included = {
    total: slice.elements.length + slice.relations.length + slice.origins.length + slice.terminals.length,
    elements: slice.elements.length,
    relations: slice.relations.length,
    origins: slice.origins.length,
    terminals: slice.terminals.length,
  };
  const proven = {
    total: all.proven,
    elements: elements.proven,
    relations: relations.proven,
    origins: origins.proven,
    terminals: terminals.proven,
  };
  const partial = {
    total: all.partial,
    elements: elements.partial,
    relations: relations.partial,
    origins: origins.partial,
    terminals: terminals.partial,
  };
  const comparisons: Array<[string, number, number]> = [
    ["elements.total", coverage.elements.total, elements.total],
    ["elements.proven", coverage.elements.proven, elements.proven],
    ["elements.partial", coverage.elements.partial, elements.partial],
    ["elements.unsupported", coverage.elements.unsupported, elements.unsupported],
    ["relations.total", coverage.relations.total, relations.total],
    ["relations.proven", coverage.relations.proven, relations.proven],
    ["relations.partial", coverage.relations.partial, relations.partial],
    ["relations.unsupported", coverage.relations.unsupported, relations.unsupported],
    ["origins", coverage.origins, origins.total],
    ["terminals", coverage.terminals, terminals.total],
    ["gaps", coverage.gaps, slice.gaps.length],
    ["included.total", coverage.included.total, included.total],
    ["included.elements", coverage.included.elements, included.elements],
    ["included.relations", coverage.included.relations, included.relations],
    ["included.origins", coverage.included.origins, included.origins],
    ["included.terminals", coverage.included.terminals, included.terminals],
    ["proven.total", coverage.proven.total, proven.total],
    ["proven.elements", coverage.proven.elements, proven.elements],
    ["proven.relations", coverage.proven.relations, proven.relations],
    ["proven.origins", coverage.proven.origins, proven.origins],
    ["proven.terminals", coverage.proven.terminals, proven.terminals],
    ["partial.total", coverage.partial.total, partial.total],
    ["partial.elements", coverage.partial.elements, partial.elements],
    ["partial.relations", coverage.partial.relations, partial.relations],
    ["partial.origins", coverage.partial.origins, partial.origins],
    ["partial.terminals", coverage.partial.terminals, partial.terminals],
    ["gap.total", coverage.gap.total, slice.gaps.length],
  ];
  for (const [label, actual, expected] of comparisons) {
    cancellation.throwIfCancelled();
    equalCount(issues, ["coverage"], label, actual, expected);
  }
  if (coverage.budget.used > coverage.budget.limit) addIssue(issues, ["coverage", "budget", "used"], "budget used cannot exceed limit");
  if (coverage.budget.exhausted !== coverage.budgetExhausted) addIssue(issues, ["coverage", "budgetExhausted"], "budget exhaustion flags must agree");
  const hasTruncation = Object.values(coverage.truncation).some(Boolean);
  if (hasTruncation && coverage.complete) addIssue(issues, ["coverage", "complete"], "truncated evidence cannot be complete");
  if (coverage.complete && (slice.gaps.length > 0 || coverage.budgetExhausted)) addIssue(issues, ["coverage", "complete"], "complete evidence cannot contain gaps or exhausted budget");
  if (coverage.status === "proven" && !coverage.complete) addIssue(issues, ["coverage", "status"], "proven evidence must be complete");
  if (coverage.truncation.budget && !coverage.budgetExhausted) addIssue(issues, ["coverage", "truncation", "budget"], "budget truncation requires budgetExhausted");
  return issues;
};

export const validateEvidenceSliceTotals = (slice: EvidenceSlice): ValidationIssue[] => validateEvidenceCoverage(slice);

export const validateSurfaceTotals = (
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const hasNamedOmission = surface.omissions.length > 0;
  const truncation = surface.truncation;
  const checks: Array<[keyof RouteOccurrenceSurface["totals"], number, boolean]> = [
    ["definitions", surface.definitions.length, truncation.definitions],
    ["occurrences", surface.occurrences.length, truncation.occurrences],
    ["edges", surface.renderEdges.length, truncation.edges],
    ["boundaries", surface.frameworkBoundaries.length, truncation.boundaries],
    ["origins", surface.origins.length, truncation.origins],
    ["terminals", surface.terminals.length, truncation.terminals],
    ["hiddenWrappers", surface.hiddenWrapperCompatibility.length, truncation.hiddenWrappers],
    ["repeated", countMatching(surface.occurrences, (value) => value.repetition === "collection" || value.repetition === "unknown", cancellation), truncation.repeated],
    ["conditional", countMatching(surface.occurrences, (value) => value.repetitionMarkers.includes("conditional"), cancellation), truncation.conditional],
    ["collection", countMatching(surface.occurrences, (value) => value.repetitionMarkers.includes("collection"), cancellation), truncation.collection],
    ["omissions", surface.omissions.length, truncation.omissions],
  ];
  for (const [key, length, truncated] of checks) {
    cancellation.throwIfCancelled();
    validateCollectionCount(surface.totals[key], length, truncated, hasNamedOmission, ["totals", key], issues);
  }
  validateTotalCount(surface.totals.omittedItems, ["totals", "omittedItems"], issues);
  const omittedItemSum = surface.omissions.reduce((sum, omission) => {
    cancellation.throwIfCancelled();
    return sum + omission.count;
  }, 0);
  if (surface.totals.omittedItems.total !== omittedItemSum) addIssue(issues, ["totals", "omittedItems", "total"], `total must equal named omission count ${omittedItemSum}`);
  const incomplete = surface.omissions.length > 0 || Object.values(truncation).some(Boolean);
  const hasNonExactTotal = Object.values(surface.totals).some((count) => count.totalStatus !== "exact");
  if (incomplete) {
    for (const [key, count] of Object.entries(surface.totals)) {
      cancellation.throwIfCancelled();
      if (count.totalStatus === "exact") addIssue(issues, ["totals", key], "truncated or omitted data cannot have an exact total");
    }
  }
  if (surface.status === "partial" && !incomplete && !hasNonExactTotal) addIssue(issues, ["status"], "partial surfaces require lower-bound totals or a named omission");
  if (surface.status === "complete") {
    if (surface.omissions.length > 0 || Object.values(truncation).some(Boolean)) addIssue(issues, ["status"], "complete surfaces cannot contain omissions or truncation");
    for (const [key, count] of Object.entries(surface.totals)) {
      cancellation.throwIfCancelled();
      if (key !== "omittedItems" && count.totalStatus !== "exact") addIssue(issues, ["totals", key], "complete surfaces require exact totals");
    }
  }
  return issues;
};

function countMatching<T>(values: readonly T[], include: (value: T) => boolean, cancellation: AnalysisCancellationToken): number {
  let count = 0;
  for (const value of values) {
    cancellation.throwIfCancelled();
    if (include(value)) count += 1;
  }
  return count;
}
