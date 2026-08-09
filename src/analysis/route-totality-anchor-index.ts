import path from "node:path";
import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "./cancellation";
import type { EvidenceSlice } from "./evidence-slice";
import type {
  RouteOccurrenceSurface,
  RouteRenderOccurrence,
  RouteTerminalOccurrence,
} from "./route-occurrence-surface";
import type { SourceLocation } from "./scope-seam";

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
  occurrenceByEvidenceElementId: ReadonlyMap<string, RouteRenderOccurrence>;
  terminalByEvidenceElementId: ReadonlyMap<string, RouteTerminalOccurrence>;
  issues: RouteTotalityAnchorIssue[];
};

/**
 * Map source-backed evidence endpoints to the exact route occurrence surface.
 *
 * An anchor is usable only when its source location has one proven evidence
 * element. The route seed is the only exception: it anchors the root
 * occurrence at the selected scope entry.
 */
export function buildRouteTotalityAnchorIndex(
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteTotalityAnchorIndex {
  const elementsById = new Map(slice.elements.map((element) => [element.id, element]));
  const occurrenceAnchors: RouteTotalityOccurrenceAnchor[] = [];
  const terminalAnchors: RouteTotalityTerminalAnchor[] = [];
  const issues: RouteTotalityAnchorIssue[] = [];

  for (const occurrence of surface.occurrences) {
    cancellation.throwIfCancelled();
    const candidates = occurrenceEvidenceCandidates(occurrence, surface.scope.seed, elementsById, slice);
    if (candidates.length === 1) {
      occurrenceAnchors.push({
        endpoint: occurrence,
        evidenceElementId: candidates[0].id,
        routeLocation: occurrence.callSite,
      });
    } else {
      issues.push({
        kind: "occurrence",
        endpointId: occurrence.id,
        reason: candidates.length === 0 ? "missing" : "ambiguous",
        candidateEvidenceElementIds: candidates.map((candidate) => candidate.id).sort(),
      });
    }
  }

  for (const terminal of surface.terminals) {
    cancellation.throwIfCancelled();
    const candidates = terminalEvidenceCandidates(terminal, elementsById, slice);
    if (candidates.length === 1) {
      terminalAnchors.push({
        endpoint: terminal,
        evidenceElementId: candidates[0].id,
        routeLocation: terminal.location,
      });
    } else {
      issues.push({
        kind: "terminal",
        endpointId: terminal.id,
        reason: candidates.length === 0 ? "missing" : "ambiguous",
        candidateEvidenceElementIds: candidates.map((candidate) => candidate.id).sort(),
      });
    }
  }

  occurrenceAnchors.sort((left, right) => left.endpoint.id.localeCompare(right.endpoint.id));
  terminalAnchors.sort((left, right) => left.endpoint.id.localeCompare(right.endpoint.id));
  issues.sort((left, right) => `${left.kind}:${left.endpointId}`.localeCompare(`${right.kind}:${right.endpointId}`));

  return {
    occurrenceAnchors,
    terminalAnchors,
    occurrenceByEvidenceElementId: new Map(occurrenceAnchors.map((anchor) => [anchor.evidenceElementId, anchor.endpoint])),
    terminalByEvidenceElementId: new Map(terminalAnchors.map((anchor) => [anchor.evidenceElementId, anchor.endpoint])),
    issues,
  };
}

function occurrenceEvidenceCandidates(
  occurrence: RouteRenderOccurrence,
  entryElementId: string,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
): EvidenceSlice["elements"][number][] {
  if (occurrence.parentOccurrenceId === null && occurrence.scopeSeed === entryElementId) {
    const entry = elementsById.get(entryElementId);
    if (entry && entry.proof.length > 0 && sameLocation(entry.location, occurrence.callSite)) return [entry];
  }
  return slice.elements.filter((element) =>
    element.kind === "component-occurrence"
    && element.proof.length > 0
    && sameLocation(element.location, occurrence.callSite));
}

function terminalEvidenceCandidates(
  terminal: RouteTerminalOccurrence,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  slice: EvidenceSlice,
): EvidenceSlice["elements"][number][] {
  const expectedKind = terminal.kind === "jsx-text" || terminal.kind === "render-expression"
    ? "render-terminal"
    : "dom-terminal";
  const matches = slice.terminals
    .filter((item) => item.role === "render" && item.proof.length > 0)
    .map((item) => elementsById.get(item.elementId))
    .filter((element): element is EvidenceSlice["elements"][number] =>
      element !== undefined
      && element.kind === expectedKind
      && element.proof.length > 0
      && element.terminalRoles.includes("render")
      && sameLocation(element.location, terminal.location));
  return [...new Map(matches.map((element) => [element.id, element])).values()];
}

function sameLocation(left: SourceLocation, right: SourceLocation): boolean {
  return path.normalize(left.file) === path.normalize(right.file)
    && left.line === right.line
    && left.column === right.column
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}
