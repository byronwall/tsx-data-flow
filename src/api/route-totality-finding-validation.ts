import type { RouteTotality } from "./route-totality-contracts";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "../analysis/cancellation";
import {
  addIssue,
  type ValidationIssue,
} from "./route-occurrence-validation-graph";
import { stableHash } from "../analysis/scope-seam";

type RouteLocation = RouteTotality["scopeProof"][number]["locations"][number];
type RouteAttachment = RouteTotality["findingAttachments"][number];
type RouteTarget = RouteAttachment["target"];
type EvidenceSlicePayload = Exclude<RouteTotality["evidenceSlice"], { status: "unavailable" }>;
type OccurrenceSurfacePayload = Exclude<RouteTotality["occurrenceSurface"], { status: "unavailable" }>;

type ResolvedTarget = {
  location: RouteLocation;
  family: string;
};

export function validateRouteTotalityFindingAttachments(
  totality: RouteTotality,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): ValidationIssue[] {
  cancellation.throwIfCancelled();
  const issues: ValidationIssue[] = [];
  const attachments = totality.findingAttachments;
  const index = totality.findingIndex;
  const surface = totality.occurrenceSurface;
  const evidence = totality.evidenceSlice;
  const surfaceUnavailable = isUnavailable(surface);
  const evidenceUnavailable = isUnavailable(evidence);

  if (surfaceUnavailable || evidenceUnavailable) {
    if (attachments.length > 0) {
      addIssue(issues, ["findingAttachments"], "unavailable totality cannot contain finding attachments");
    }
    if (index.length > 0) addIssue(issues, ["findingIndex"], "unavailable totality cannot contain a finding index");
    return issues;
  }

  const findingIds = validateFindingIndex(index, attachments, issues, cancellation);
  const targetSignatureIds = new Map<string, string>();
  const attachmentIds = new Set<string>();
  const evidenceElements = indexBy(evidence.elements, (element) => element.id, cancellation);
  const evidenceOrigins = indexBy(evidence.origins, (origin) => `${origin.elementId}:${origin.role}`, cancellation);
  const evidenceTerminals = indexBy(evidence.terminals, (terminal) => `${terminal.elementId}:${terminal.role}`, cancellation);
  const occurrenceTerminals = indexBy(surface.terminals, (terminal) => terminal.id, cancellation);

  attachments.forEach((attachment, indexPosition) => {
    cancellation.throwIfCancelled();
    const path = ["findingAttachments", indexPosition] as Array<string | number>;
    if (attachmentIds.has(attachment.id)) addIssue(issues, [...path, "id"], `duplicate attachment id "${attachment.id}"`);
    attachmentIds.add(attachment.id);
    if (indexPosition > 0 && attachments[indexPosition - 1].id.localeCompare(attachment.id) > 0) {
      addIssue(issues, path, "finding attachments must be sorted by stable id for byte-stable projection");
    }

    const signature = attachmentSignature(attachment);
    const previousId = targetSignatureIds.get(signature);
    if (previousId !== undefined && previousId !== attachment.id) {
      addIssue(issues, [...path, "target"], "the same finding identity and target cannot map to multiple attachment ids");
    } else {
      targetSignatureIds.set(signature, attachment.id);
    }
    const expectedId = stableAttachmentId(attachment);
    if (attachment.id !== expectedId) addIssue(issues, [...path, "id"], "attachment id is not the stable identity hash for its finding and target");

    if (!findingIds.has(attachment.findingId)) {
      addIssue(issues, [...path, "findingId"], `attachment references unknown finding "${attachment.findingId}"`);
    } else {
      const finding = index.find((entry) => entry.findingId === attachment.findingId);
      if (finding && !finding.expressionIds.includes(attachment.expressionId)) {
        addIssue(issues, [...path, "expressionId"], "attachment expressionId is missing from its finding index entry");
      }
    }

    const resolved = resolveTarget(
      attachment.target,
      evidenceElements,
      evidenceOrigins,
      evidenceTerminals,
      occurrenceTerminals,
    );
    if (!resolved) {
      addIssue(issues, [...path, "target"], "attachment target does not exist in the route totality payload");
      return;
    }
    if (attachment.target.family !== resolved.family) {
      addIssue(issues, [...path, "target", "family"], `target family must be ${resolved.family}`);
    }
    if (!sameLocation(attachment.location, resolved.location)) {
      addIssue(issues, [...path, "location"], "attachment location must exactly match its target location");
    }
    if (attachment.status !== attachment.proof.status) {
      addIssue(issues, [...path, "proof", "status"], "proof status must match attachment status");
    }
    if (attachment.proof.kind !== "finding-identity-bridge") {
      addIssue(issues, [...path, "proof", "kind"], "finding proof must identify an explicit finding identity bridge");
    }
    const expectedLocations = [locationKey(attachment.location)];
    const actualLocations = attachment.proof.locations.map(locationKey);
    if (JSON.stringify(actualLocations) !== JSON.stringify(expectedLocations)) {
      addIssue(issues, [...path, "proof", "locations"], "finding proof locations must contain the exact target location once");
    }
    const expectedDetail = `Finding ${attachment.findingId} identity ${attachment.expressionId} resolves to the exact ${attachment.target.source} ${attachment.target.kind} target ${attachment.target.id}.`;
    if (attachment.proof.detail !== expectedDetail) {
      addIssue(issues, [...path, "proof", "detail"], "finding proof detail must name the exact finding identity and target");
    }
  });

  return issues;
}

function validateFindingIndex(
  entries: RouteTotality["findingIndex"],
  attachments: RouteTotality["findingAttachments"],
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): Set<string> {
  const ids = new Set<string>();
  const attachmentFindingIds = new Set<string>();
  for (const attachment of attachments) {
    cancellation.throwIfCancelled();
    attachmentFindingIds.add(attachment.findingId);
  }
  const attachmentExpressions = new Map<string, string[]>();
  for (const attachment of attachments) {
    cancellation.throwIfCancelled();
    const expressions = attachmentExpressions.get(attachment.findingId) ?? [];
    expressions.push(attachment.expressionId);
    attachmentExpressions.set(attachment.findingId, expressions);
  }
  entries.forEach((entry, index) => {
    cancellation.throwIfCancelled();
    const path = ["findingIndex", index] as Array<string | number>;
    if (ids.has(entry.findingId)) addIssue(issues, [...path, "findingId"], `duplicate finding index id "${entry.findingId}"`);
    ids.add(entry.findingId);
    if (index > 0 && entries[index - 1].findingId.localeCompare(entry.findingId) > 0) {
      addIssue(issues, path, "finding index must be sorted by findingId for byte-stable projection");
    }
    if (entry.detailRef.source !== "file-page" || entry.detailRef.kind !== "finding-detail") {
      addIssue(issues, [...path, "detailRef"], "finding index must reference a file-page finding detail");
    }
    if (entry.detailRef.id !== entry.findingId) addIssue(issues, [...path, "detailRef", "id"], "finding detail reference id must match findingId");
    if (entry.detailRef.file !== entry.file) addIssue(issues, [...path, "detailRef", "file"], "finding detail reference file must match the finding file");
    if (entry.location.file !== entry.file) addIssue(issues, [...path, "location", "file"], "finding location file must match the finding file");
    validateSortedUnique(entry.expressionIds, [...path, "expressionIds"], "expressionId", issues, cancellation);
    const expectedExpressions = [...new Set(attachmentExpressions.get(entry.findingId) ?? [])].sort((left, right) => left.localeCompare(right));
    if (JSON.stringify(entry.expressionIds) !== JSON.stringify(expectedExpressions)) {
      addIssue(issues, [...path, "expressionIds"], "finding index expressionIds must exactly match its attachments");
    }
    if (!attachmentFindingIds.has(entry.findingId)) addIssue(issues, path, "finding index entry is not referenced by an attachment");
  });
  return ids;
}

function indexBy<T>(values: readonly T[], key: (value: T) => string, cancellation: AnalysisCancellationToken): Map<string, T> {
  const index = new Map<string, T>();
  for (const value of values) {
    cancellation.throwIfCancelled();
    index.set(key(value), value);
  }
  return index;
}

function resolveTarget(
  target: RouteTarget,
  elements: Map<string, EvidenceSlicePayload["elements"][number]>,
  origins: Map<string, EvidenceSlicePayload["origins"][number]>,
  terminals: Map<string, EvidenceSlicePayload["terminals"][number]>,
  occurrenceTerminals: Map<string, OccurrenceSurfacePayload["terminals"][number]>,
): ResolvedTarget | null {
  if (target.source === "evidence-slice" && target.kind === "element") {
    const element = elements.get(target.id);
    return element ? { location: element.location, family: element.kind } : null;
  }
  if (target.source === "evidence-slice" && target.kind === "origin") {
    const origin = origins.get(`${target.id}:${target.role}`);
    const element = elements.get(target.id);
    return origin && element ? { location: element.location, family: origin.role } : null;
  }
  if (target.source === "evidence-slice" && target.kind === "terminal") {
    const terminal = terminals.get(`${target.id}:${target.role}`);
    const element = elements.get(target.id);
    return terminal && element ? { location: element.location, family: terminal.role } : null;
  }
  const terminal = occurrenceTerminals.get(target.id);
  return terminal ? { location: terminal.location, family: terminal.kind } : null;
}

function stableAttachmentId(attachment: RouteAttachment): string {
  return `route-totality-finding:${stableHash(JSON.stringify({
    findingId: attachment.findingId,
    expressionId: attachment.expressionId,
    target: attachment.target,
  }))}`;
}

function attachmentSignature(attachment: RouteAttachment): string {
  const { target } = attachment;
  return `${attachment.findingId}:${attachment.expressionId}:${target.source}:${target.kind}:${target.id}:${target.role ?? ""}`;
}

function validateSortedUnique(
  values: string[],
  path: Array<string | number>,
  label: string,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    cancellation.throwIfCancelled();
    if (seen.has(value)) addIssue(issues, [...path, index], `duplicate ${label} "${value}"`);
    seen.add(value);
    if (index > 0 && values[index - 1].localeCompare(value) > 0) addIssue(issues, path, `${label} values must be sorted`);
  });
}

function locationKey(location: RouteLocation): string {
  return `${location.file}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}

function sameLocation(left: RouteLocation, right: RouteLocation): boolean {
  return locationKey(left) === locationKey(right);
}

function isUnavailable(value: unknown): value is { status: "unavailable"; reason: string } {
  return Boolean(value && typeof value === "object" && "reason" in value && (value as { status?: unknown }).status === "unavailable");
}
