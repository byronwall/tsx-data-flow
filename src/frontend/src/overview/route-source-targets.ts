import type { RouteDataDetail } from "../../../api/contracts";
import {
  sourceTargetFromEvidence,
  sourceTargetFromLocation,
  type SourceEvidenceTarget,
  type SourceLocationTarget,
} from "./source-evidence-model";

export function routeSourceEvidenceTargets(
  detail: RouteDataDetail,
  operationKey: string | null,
): SourceEvidenceTarget[] {
  const evidenceById = new Map(detail.evidence.map((item) => [item.id, item]));
  const selectedOperation = detail.operations.find((operation) => operation.key === operationKey);
  const orderedIds = selectedOperation
    ? selectedOperation.sourceExpressionIds
    : detail.operations.flatMap((operation) => operation.sourceExpressionIds);
  const seen = new Set<string>();
  const orderedEvidence = orderedIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is RouteDataDetail["evidence"][number] => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  const operationPaths = new Set(orderedEvidence.map((item) => item.file));
  const remaining = detail.evidence.filter((item) => !seen.has(item.id) && operationPaths.has(item.file));
  const all = [...orderedEvidence, ...remaining];
  return all.map((evidence, order) => ({
    ...sourceTargetFromEvidence(evidence, order),
    scopeKey: `path:${evidence.file}`,
    order,
  }));
}

export function sourceTargetForLocation(
  location: SourceLocationTarget,
  order = 0,
): SourceEvidenceTarget {
  const key = locationKey(location);
  return sourceTargetFromLocation(`source-location:${key}`, location, {
    label: `${location.file}:${location.line}:${location.column}`,
    kind: "exact location",
    scopeKey: `path:${location.file}`,
    order,
  });
}

export function mergeSourceTargets(
  primary: readonly SourceEvidenceTarget[],
  fallback: readonly SourceEvidenceTarget[],
): SourceEvidenceTarget[] {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((target) => {
    if (seen.has(target.id)) return false;
    seen.add(target.id);
    return true;
  });
}

function locationKey(location: SourceLocationTarget): string {
  return `${location.file}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}
