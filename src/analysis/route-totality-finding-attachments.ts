import path from "node:path";
import type * as TypeScript from "typescript";
import type { Sink, ExpressionIdentityEvidence } from "../types";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "./cancellation";
import { expressionIdFor } from "./identity";
import type {
  RouteTotalityFindingAttachment,
  RouteTotalityFindingIndexEntry,
  RouteTotalityFindingTarget,
  RouteTotalityRecord,
} from "./route-data-totality";
import type { SourceLocation } from "./scope-seam";
import { stableHash } from "./scope-seam";

type FindingTarget = RouteTotalityFindingAttachment["target"] & {
  location: SourceLocation;
};

type FindingIdentity = {
  findingId: string;
  identity: ExpressionIdentityEvidence;
};

type ExpressionResolver = (location: SourceLocation) => string | null;

export function attachRouteTotalityFindings(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  records: readonly RouteTotalityRecord[],
  findings: readonly Sink[],
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteTotalityRecord[] {
  return records.map((record) => {
    cancellation.throwIfCancelled();
    const resolver = expressionResolver(ts, program, root, cancellation);
    const targets = targetsFor(record, cancellation);
    const attachments = buildAttachments(targets, findings, resolver, cancellation);
    return {
      ...record,
      findingAttachments: attachments,
      findingIndex: findingIndexFor(attachments, findings, cancellation),
    };
  });
}

function buildAttachments(
  targets: FindingTarget[],
  findings: readonly Sink[],
  resolveExpressionId: ExpressionResolver,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFindingAttachment[] {
  const byIdentity = new Map<string, FindingIdentity>();
  cancellation.throwIfCancelled();
  for (const finding of [...findings].sort((left, right) => {
    cancellation.throwIfCancelled();
    return left.id.localeCompare(right.id);
  })) {
    cancellation.throwIfCancelled();
    for (const identity of [finding.identity, ...(finding.traceIdentities ?? [])]) {
      cancellation.throwIfCancelled();
      if (!identity || !identity.expressionId || !identity.attachedFindingIds.includes(finding.id)) continue;
      const key = `${finding.id}:${identity.expressionId}`;
      const current = byIdentity.get(key);
      if (!current || Number(identity.traceComplete) > Number(current.identity.traceComplete)) {
        byIdentity.set(key, { findingId: finding.id, identity });
      }
    }
  }

  const attachments: RouteTotalityFindingAttachment[] = [];
  cancellation.throwIfCancelled();
  for (const { findingId, identity } of [...byIdentity.entries()]
    .sort(([left], [right]) => {
      cancellation.throwIfCancelled();
      return left.localeCompare(right);
    })
    .map(([, value]) => value)) {
    cancellation.throwIfCancelled();
    for (const target of targets) {
      cancellation.throwIfCancelled();
      const resolvedId = resolveExpressionId(target.location);
      if (resolvedId !== identity.expressionId || !sameIdentityLocation(identity, target.location)) continue;
      const status: "proven" | "partial" = identity.traceComplete ? "proven" : "partial";
      const proofLocations = uniqueLocations([target.location, identityLocation(identity)]);
      const attachmentWithoutId: Omit<RouteTotalityFindingAttachment, "id"> = {
        findingId,
        expressionId: identity.expressionId,
        target: targetWithoutLocation(target),
        location: target.location,
        status,
        proof: {
          kind: "finding-identity-bridge",
          detail: `Finding ${findingId} identity ${identity.expressionId} resolves to the exact ${target.source} ${target.kind} target ${target.id}.`,
          locations: proofLocations,
          status,
        },
      };
      attachments.push({
        ...attachmentWithoutId,
        id: `route-totality-finding:${stableHash(JSON.stringify({
          findingId,
          expressionId: identity.expressionId,
          target: attachmentWithoutId.target,
        }))}`,
      });
    }
  }
  const unique = new Map<string, RouteTotalityFindingAttachment>();
  for (const attachment of attachments) {
    cancellation.throwIfCancelled();
    unique.set(attachment.id, attachment);
  }
  cancellation.throwIfCancelled();
  return [...unique.values()].sort((left, right) => {
    cancellation.throwIfCancelled();
    return left.id.localeCompare(right.id);
  });
}

function findingIndexFor(
  attachments: readonly RouteTotalityFindingAttachment[],
  findings: readonly Sink[],
  cancellation: AnalysisCancellationToken,
): RouteTotalityFindingIndexEntry[] {
  cancellation.throwIfCancelled();
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  const expressionIdsByFinding = new Map<string, Set<string>>();
  for (const attachment of attachments) {
    cancellation.throwIfCancelled();
    const ids = expressionIdsByFinding.get(attachment.findingId) ?? new Set<string>();
    ids.add(attachment.expressionId);
    expressionIdsByFinding.set(attachment.findingId, ids);
  }
  return [...expressionIdsByFinding.entries()]
    .sort(([left], [right]) => {
      cancellation.throwIfCancelled();
      return left.localeCompare(right);
    })
    .flatMap(([findingId, expressionIds]) => {
      cancellation.throwIfCancelled();
      const finding = findingsById.get(findingId);
      if (!finding) return [];
      return [{
        findingId,
        label: finding.label,
        family: typeof finding.family === "string" ? finding.family : null,
        file: finding.file,
        location: findingLocation(finding),
        expressionIds: [...expressionIds].sort((left, right) => left.localeCompare(right)),
        detailRef: {
          source: "file-page" as const,
          kind: "finding-detail" as const,
          id: finding.id,
          file: finding.file,
        },
      } satisfies RouteTotalityFindingIndexEntry];
    });
}

function targetsFor(record: RouteTotalityRecord, cancellation: AnalysisCancellationToken): FindingTarget[] {
  if (isUnavailable(record.evidenceSlice) || isUnavailable(record.occurrenceSurface)) return [];
  const targets: FindingTarget[] = [];
  for (const element of record.evidenceSlice.elements) {
    cancellation.throwIfCancelled();
    targets.push({ source: "evidence-slice", kind: "element", id: element.id, role: null, family: element.kind, location: element.location });
  }
  for (const origin of record.evidenceSlice.origins) {
    cancellation.throwIfCancelled();
    const element = record.evidenceSlice.elements.find((candidate) => candidate.id === origin.elementId);
    if (element) targets.push({ source: "evidence-slice", kind: "origin", id: origin.elementId, role: origin.role, family: origin.role, location: element.location });
  }
  for (const terminal of record.evidenceSlice.terminals) {
    cancellation.throwIfCancelled();
    const element = record.evidenceSlice.elements.find((candidate) => candidate.id === terminal.elementId);
    if (element) targets.push({ source: "evidence-slice", kind: "terminal", id: terminal.elementId, role: terminal.role, family: terminal.role, location: element.location });
  }
  for (const terminal of record.occurrenceSurface.terminals) {
    cancellation.throwIfCancelled();
    targets.push({ source: "occurrence-surface", kind: "terminal", id: terminal.id, role: null, family: terminal.kind, location: terminal.location });
  }
  return targets.sort((left, right) => targetKey(left).localeCompare(targetKey(right)));
}

function expressionResolver(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  cancellation: AnalysisCancellationToken,
): ExpressionResolver {
  const cache = new Map<string, string | null>();
  return (location) => {
    cancellation.throwIfCancelled();
    const key = locationKey(location);
    if (cache.has(key)) return cache.get(key) ?? null;
    const sourceFile = sourceFileFor(program, root, location.file);
    if (!sourceFile) {
      cache.set(key, null);
      return null;
    }
    let start: number;
    let end: number;
    try {
      start = sourceFile.getPositionOfLineAndCharacter(location.span.startLine - 1, location.span.startColumn - 1);
      end = sourceFile.getPositionOfLineAndCharacter(location.span.endLine - 1, location.span.endColumn - 1);
    } catch {
      cache.set(key, null);
      return null;
    }
    const ids = new Set<string>();
    const visit = (node: TypeScript.Node) => {
      cancellation.throwIfCancelled();
      if (ts.isExpression(node) && node.getStart(sourceFile) === start && node.getEnd() === end) ids.add(expressionIdFor(root, node));
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    cancellation.throwIfCancelled();
    const result = ids.size === 1 ? [...ids][0] ?? null : null;
    cache.set(key, result);
    return result;
  };
}

function targetWithoutLocation(target: FindingTarget): RouteTotalityFindingTarget {
  if (target.source === "evidence-slice" && target.kind === "element") {
    return {
      source: target.source,
      kind: target.kind,
      id: target.id,
      role: target.role,
      family: target.family,
    };
  }
  if (target.source === "evidence-slice" && target.kind === "origin") {
    return {
      source: target.source,
      kind: target.kind,
      id: target.id,
      role: target.role,
      family: target.family,
    };
  }
  if (target.source === "evidence-slice" && target.kind === "terminal") {
    return {
      source: target.source,
      kind: target.kind,
      id: target.id,
      role: target.role,
      family: target.family,
    };
  }
  return {
    source: target.source,
    kind: target.kind,
    id: target.id,
    role: target.role,
    family: target.family,
  };
}

function sourceFileFor(program: TypeScript.Program, root: string, file: string): TypeScript.SourceFile | undefined {
  const absolute = path.normalize(path.resolve(root, file));
  return program.getSourceFile(absolute) ?? program.getSourceFiles().find((candidate) => path.normalize(candidate.fileName) === absolute);
}

function sameIdentityLocation(identity: ExpressionIdentityEvidence, location: SourceLocation): boolean {
  return path.normalize(identity.location.file) === path.normalize(location.file)
    && identity.location.line === location.line
    && identity.location.column === location.column
    && sameSpan(identity.span, location.span);
}

function identityLocation(identity: ExpressionIdentityEvidence): SourceLocation {
  return { file: identity.location.file, line: identity.location.line, column: identity.location.column, span: identity.span };
}

function findingLocation(finding: Sink): SourceLocation {
  return { file: finding.file, line: finding.line, column: finding.column, span: finding.span };
}

function uniqueLocations(locations: SourceLocation[]): SourceLocation[] {
  return [...new Map(locations.map((location) => [locationKey(location), location])).values()]
    .sort((left, right) => locationKey(left).localeCompare(locationKey(right)));
}

function targetKey(target: FindingTarget): string {
  return `${target.source}:${target.kind}:${target.id}:${target.role ?? ""}:${target.family}`;
}

function locationKey(location: SourceLocation): string {
  return `${path.normalize(location.file)}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}

function sameSpan(left: SourceLocation["span"], right: SourceLocation["span"]): boolean {
  return left.startLine === right.startLine
    && left.startColumn === right.startColumn
    && left.endLine === right.endLine
    && left.endColumn === right.endColumn;
}

function isUnavailable(value: unknown): value is { status: "unavailable"; reason: string } {
  return Boolean(value && typeof value === "object" && "reason" in value && (value as { status?: unknown }).status === "unavailable");
}
