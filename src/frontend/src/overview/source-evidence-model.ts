import type { RouteDataDetail, SourceExcerptSpan } from "../../../api/contracts";

export type SourceLocationTarget = {
  file: string;
  line: number;
  column: number;
  span: SourceExcerptSpan;
};

export type SourceEvidenceTarget = {
  id: string;
  path: string;
  line: number;
  column: number;
  span: SourceExcerptSpan;
  label: string;
  expression: string | null;
  kind: string | null;
  scopeKey: string | null;
  order: number;
};

export type SourceTargetInput = RouteDataDetail["evidence"][number] | SourceLocationTarget | SourceEvidenceTarget;

export type SourceTargetGroup = {
  path: string;
  targets: SourceEvidenceTarget[];
};

export function sourceTargetFromEvidence(
  evidence: RouteDataDetail["evidence"][number],
  order = 0,
): SourceEvidenceTarget {
  return {
    id: evidence.id,
    path: evidence.file,
    line: evidence.line,
    column: evidence.column,
    span: evidence.span,
    label: evidence.expression,
    expression: evidence.expression,
    kind: evidence.operationKind,
    scopeKey: null,
    order,
  };
}

export function sourceTargetFromLocation(
  id: string,
  location: SourceLocationTarget,
  metadata: Partial<Pick<SourceEvidenceTarget, "label" | "expression" | "kind" | "scopeKey" | "order">> = {},
): SourceEvidenceTarget {
  return {
    id,
    path: location.file,
    line: location.line,
    column: location.column,
    span: location.span,
    label: metadata.label ?? `${location.file}:${location.line}`,
    expression: metadata.expression ?? null,
    kind: metadata.kind ?? null,
    scopeKey: metadata.scopeKey ?? null,
    order: metadata.order ?? 0,
  };
}

export function normalizeSourceTarget(input: SourceTargetInput, order = 0): SourceEvidenceTarget {
  if ("path" in input) return { ...input, order: input.order ?? order };
  if ("id" in input) return sourceTargetFromEvidence(input, order);
  return sourceTargetFromLocation(`source:${input.file}:${input.span.startLine}:${input.span.startColumn}:${order}`, input, { order });
}

export function normalizeSourceTargets(inputs: readonly SourceTargetInput[]): SourceEvidenceTarget[] {
  return inputs.map((input, index) => normalizeSourceTarget(input, index));
}

export function groupSourceTargets(targets: readonly SourceEvidenceTarget[]): SourceTargetGroup[] {
  const groups = new Map<string, SourceTargetGroup>();
  for (const target of targets) {
    const group = groups.get(target.path);
    if (group) group.targets.push(target);
    else groups.set(target.path, { path: target.path, targets: [target] });
  }
  return [...groups.values()];
}

export function sourceTargetsForNavigation(
  targets: readonly SourceEvidenceTarget[],
  selected: SourceEvidenceTarget | null,
): SourceEvidenceTarget[] {
  if (!selected) return [];
  if (selected.scopeKey) {
    const scoped = targets.filter((target) => target.scopeKey === selected.scopeKey);
    if (scoped.length > 0) return scoped;
  }
  return targets.filter((target) => target.path === selected.path);
}

export function adjacentSourceTarget(
  targets: readonly SourceEvidenceTarget[],
  selected: SourceEvidenceTarget | null,
  direction: -1 | 1,
): SourceEvidenceTarget | null {
  const navigation = sourceTargetsForNavigation(targets, selected);
  const index = navigation.findIndex((target) => target.id === selected?.id);
  return index < 0 ? null : navigation[index + direction] ?? null;
}
