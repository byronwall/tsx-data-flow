import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type {
  RouteOccurrenceSurface,
  RouteRenderOccurrence,
  RouteTerminalOccurrence,
} from "./route-occurrence-surface";
import { normalizeFile, type SourceLocation } from "./scope-seam";

export type RouteTotalityOccurrenceAnchor = {
  endpoint: RouteRenderOccurrence;
  evidenceElementId: string;
  routeLocation: SourceLocation;
};

export type RouteTotalityTerminalAnchor = {
  endpoint: RouteTerminalOccurrence;
  evidenceElementId: string;
  routeLocation: SourceLocation;
};

export type RouteTotalityAnchorIssue = {
  kind: "occurrence" | "terminal";
  endpointId: string;
  reason: "missing" | "ambiguous";
  candidateEvidenceElementIds: string[];
};

export type RouteTotalityAnchorIndex = {
  occurrenceAnchors: RouteTotalityOccurrenceAnchor[];
  terminalAnchors: RouteTotalityTerminalAnchor[];
  occurrenceAnchorsByEvidenceElementId: ReadonlyMap<string, readonly RouteTotalityOccurrenceAnchor[]>;
  terminalAnchorsByEvidenceElementId: ReadonlyMap<string, readonly RouteTotalityTerminalAnchor[]>;
  occurrenceIssuesByEndpointId: ReadonlyMap<string, RouteTotalityAnchorIssue>;
  terminalIssuesByEndpointId: ReadonlyMap<string, RouteTotalityAnchorIssue>;
  issues: RouteTotalityAnchorIssue[];
};

/**
 * Return one Solid Show render-prop terminal anchor for one exact evidence terminal.
 *
 * The caller must already hold the exact Solid Show carrier proof. This does
 * not infer a route owner from a definition, name, or broad route reach.
 */
export function solidShowRenderPropTerminalAnchor(
  anchors: RouteTotalityAnchorIndex,
  surface: RouteOccurrenceSurface,
  evidenceElementId: string,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteTotalityTerminalAnchor | null {
  cancellation.throwIfCancelled();
  const terminalAnchors = anchors.terminalAnchorsByEvidenceElementId.get(evidenceElementId) ?? [];
  if (terminalAnchors.length !== 1) return null;
  const anchor = terminalAnchors[0];
  if (!anchor.endpoint.ownerOccurrenceId) return null;
  let ownerCount = 0;
  for (const occurrence of surface.occurrences) {
    cancellation.throwIfCancelled();
    if (occurrence.id === anchor.endpoint.ownerOccurrenceId && occurrence.scopeSeed === surface.scope.seed) {
      ownerCount += 1;
    }
  }
  return ownerCount === 1 ? anchor : null;
}

/**
 * Map source-backed evidence endpoints to exact route-surface endpoints.
 *
 * The forward arrays keep one bridge per route endpoint. Reverse maps keep all
 * endpoints because one source location can anchor repeated route occurrences.
 */
export function buildRouteTotalityAnchorIndex(
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteTotalityAnchorIndex {
  cancellation.throwIfCancelled();
  const elementsById = new Map<string, EvidenceSlice["elements"][number]>();
  for (const element of slice.elements) {
    cancellation.throwIfCancelled();
    elementsById.set(element.id, element);
  }
  cancellation.throwIfCancelled();
  const occurrenceAnchors: RouteTotalityOccurrenceAnchor[] = [];
  const terminalAnchors: RouteTotalityTerminalAnchor[] = [];
  const occurrenceIssuesByEndpointId = new Map<string, RouteTotalityAnchorIssue>();
  const terminalIssuesByEndpointId = new Map<string, RouteTotalityAnchorIssue>();

  for (const occurrence of surface.occurrences) {
    cancellation.throwIfCancelled();
    const candidates = occurrenceEvidenceCandidates(
      occurrence,
      surface.scope.seed,
      elementsById,
      slice,
      cancellation,
    );
    if (candidates.length === 1) {
      occurrenceAnchors.push({
        endpoint: occurrence,
        evidenceElementId: candidates[0].id,
        routeLocation: occurrence.callSite,
      });
    } else {
      occurrenceIssuesByEndpointId.set(occurrence.id, issueFor(
        "occurrence",
        occurrence.id,
        candidates,
        cancellation,
      ));
    }
  }

  for (const terminal of surface.terminals) {
    cancellation.throwIfCancelled();
    const candidates = terminalEvidenceCandidates(terminal, elementsById, slice, cancellation);
    if (candidates.length === 1) {
      terminalAnchors.push({
        endpoint: terminal,
        evidenceElementId: candidates[0].id,
        routeLocation: terminal.location,
      });
    } else {
      terminalIssuesByEndpointId.set(terminal.id, issueFor(
        "terminal",
        terminal.id,
        candidates,
        cancellation,
      ));
    }
  }

  const sortedOccurrenceAnchors = cancellableStableSort(
    occurrenceAnchors,
    (left, right) => left.endpoint.id.localeCompare(right.endpoint.id),
    cancellation,
  );
  const sortedTerminalAnchors = cancellableStableSort(
    terminalAnchors,
    (left, right) => left.endpoint.id.localeCompare(right.endpoint.id),
    cancellation,
  );
  const occurrenceAnchorsByEvidenceElementId = reverseOccurrenceAnchors(
    sortedOccurrenceAnchors,
    occurrenceIssuesByEndpointId,
    cancellation,
  );
  const terminalAnchorsByEvidenceElementId = reverseTerminalAnchors(
    sortedTerminalAnchors,
    terminalIssuesByEndpointId,
    cancellation,
  );
  const issues: RouteTotalityAnchorIssue[] = [];
  for (const issue of occurrenceIssuesByEndpointId.values()) {
    cancellation.throwIfCancelled();
    issues.push(issue);
  }
  for (const issue of terminalIssuesByEndpointId.values()) {
    cancellation.throwIfCancelled();
    issues.push(issue);
  }
  cancellation.throwIfCancelled();

  return {
    occurrenceAnchors: sortedOccurrenceAnchors,
    terminalAnchors: sortedTerminalAnchors,
    occurrenceAnchorsByEvidenceElementId,
    terminalAnchorsByEvidenceElementId,
    occurrenceIssuesByEndpointId,
    terminalIssuesByEndpointId,
    issues: cancellableStableSort(
      issues,
      (left, right) => `${left.kind}:${left.endpointId}`.localeCompare(`${right.kind}:${right.endpointId}`),
      cancellation,
    ),
  };
}

function reverseOccurrenceAnchors(
  anchors: readonly RouteTotalityOccurrenceAnchor[],
  issuesByEndpointId: Map<string, RouteTotalityAnchorIssue>,
  cancellation: AnalysisCancellationToken,
): ReadonlyMap<string, readonly RouteTotalityOccurrenceAnchor[]> {
  cancellation.throwIfCancelled();
  const grouped = new Map<string, RouteTotalityOccurrenceAnchor[]>();
  for (const anchor of anchors) {
    cancellation.throwIfCancelled();
    const current = grouped.get(anchor.evidenceElementId) ?? [];
    current.push(anchor);
    grouped.set(anchor.evidenceElementId, current);
  }
  const result = new Map<string, readonly RouteTotalityOccurrenceAnchor[]>();
  for (const [evidenceElementId, endpoints] of grouped) {
    cancellation.throwIfCancelled();
    const sorted = cancellableStableSort(
      endpoints,
      (left, right) => left.endpoint.id.localeCompare(right.endpoint.id),
      cancellation,
    );
    result.set(evidenceElementId, sorted);
    if (sorted.length > 1) {
      for (const anchor of sorted) {
        cancellation.throwIfCancelled();
        issuesByEndpointId.set(anchor.endpoint.id, {
          kind: "occurrence",
          endpointId: anchor.endpoint.id,
          reason: "ambiguous",
          candidateEvidenceElementIds: [evidenceElementId],
        });
      }
    }
  }
  cancellation.throwIfCancelled();
  return result;
}

function reverseTerminalAnchors(
  anchors: readonly RouteTotalityTerminalAnchor[],
  issuesByEndpointId: Map<string, RouteTotalityAnchorIssue>,
  cancellation: AnalysisCancellationToken,
): ReadonlyMap<string, readonly RouteTotalityTerminalAnchor[]> {
  cancellation.throwIfCancelled();
  const grouped = new Map<string, RouteTotalityTerminalAnchor[]>();
  for (const anchor of anchors) {
    cancellation.throwIfCancelled();
    const current = grouped.get(anchor.evidenceElementId) ?? [];
    current.push(anchor);
    grouped.set(anchor.evidenceElementId, current);
  }
  const result = new Map<string, readonly RouteTotalityTerminalAnchor[]>();
  for (const [evidenceElementId, endpoints] of grouped) {
    cancellation.throwIfCancelled();
    const sorted = cancellableStableSort(
      endpoints,
      (left, right) => left.endpoint.id.localeCompare(right.endpoint.id),
      cancellation,
    );
    result.set(evidenceElementId, sorted);
    if (sorted.length > 1) {
      for (const anchor of sorted) {
        cancellation.throwIfCancelled();
        issuesByEndpointId.set(anchor.endpoint.id, {
          kind: "terminal",
          endpointId: anchor.endpoint.id,
          reason: "ambiguous",
          candidateEvidenceElementIds: [evidenceElementId],
        });
      }
    }
  }
  cancellation.throwIfCancelled();
  return result;
}

function issueFor(
  kind: RouteTotalityAnchorIssue["kind"],
  endpointId: string,
  candidates: readonly EvidenceSlice["elements"][number][],
  cancellation: AnalysisCancellationToken,
): RouteTotalityAnchorIssue {
  const candidateEvidenceElementIds: string[] = [];
  for (const candidate of candidates) {
    cancellation.throwIfCancelled();
    candidateEvidenceElementIds.push(candidate.id);
  }
  return {
    kind,
    endpointId,
    reason: candidateEvidenceElementIds.length === 0 ? "missing" : "ambiguous",
    candidateEvidenceElementIds: cancellableStableSort(
      candidateEvidenceElementIds,
      (left, right) => left.localeCompare(right),
      cancellation,
    ),
  };
}

function occurrenceEvidenceCandidates(
  occurrence: RouteRenderOccurrence,
  entryElementId: string,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
  cancellation: AnalysisCancellationToken,
): EvidenceSlice["elements"][number][] {
  cancellation.throwIfCancelled();
  if (occurrence.parentOccurrenceId === null && occurrence.scopeSeed === entryElementId) {
    const entry = elementsById.get(entryElementId);
    if (entry && entry.proof.length > 0 && sameLocation(entry.location, occurrence.callSite)) return [entry];
  }
  const candidates: EvidenceSlice["elements"][number][] = [];
  for (const element of slice.elements) {
    cancellation.throwIfCancelled();
    if (element.kind === "component-occurrence"
      && element.proof.length > 0
      && sameLocation(element.location, occurrence.callSite)) {
      candidates.push(element);
    }
  }
  return cancellableStableSort(candidates, (left, right) => left.id.localeCompare(right.id), cancellation);
}

function terminalEvidenceCandidates(
  terminal: RouteTerminalOccurrence,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
  cancellation: AnalysisCancellationToken,
): EvidenceSlice["elements"][number][] {
  const expectedKind = terminal.kind === "jsx-text" || terminal.kind === "render-expression"
    ? "render-terminal"
    : "dom-terminal";
  const candidatesById = new Map<string, EvidenceSlice["elements"][number]>();
  for (const item of slice.terminals) {
    cancellation.throwIfCancelled();
    if (item.role !== "render" || item.proof.length === 0) continue;
    const element = elementsById.get(item.elementId);
    if (!element
      || element.kind !== expectedKind
      || element.proof.length === 0
      || !hasRole(element.terminalRoles, "render", cancellation)
      || !sameLocation(element.location, terminal.location)) {
      continue;
    }
    candidatesById.set(element.id, element);
  }
  for (const element of slice.elements) {
    cancellation.throwIfCancelled();
    if (!element
      || element.kind !== expectedKind
      || element.proof.length === 0
      || !hasRole(element.terminalRoles, "render", cancellation)
      || !sameLocation(element.location, terminal.location)) {
      continue;
    }
    candidatesById.set(element.id, element);
  }
  const candidates: EvidenceSlice["elements"][number][] = [];
  for (const candidate of candidatesById.values()) {
    cancellation.throwIfCancelled();
    candidates.push(candidate);
  }
  return cancellableStableSort(candidates, (left, right) => left.id.localeCompare(right.id), cancellation);
}

function sameLocation(left: SourceLocation, right: SourceLocation): boolean {
  return normalizeFile(left.file) === normalizeFile(right.file)
    && left.line === right.line
    && left.column === right.column
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}

function hasRole(
  roles: readonly string[],
  expected: string,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  for (const role of roles) {
    cancellation.throwIfCancelled();
    if (role === expected) return true;
  }
  cancellation.throwIfCancelled();
  return false;
}
