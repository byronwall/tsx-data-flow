import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { cancellableStableSort } from "../analysis/cancellable-stable-sort";
import type { EvidenceSlice as DomainEvidenceSlice } from "../analysis/evidence-slice";
import {
  buildRouteTotalityAnchorIndex,
  solidShowRenderPropTerminalAnchor,
  type RouteTotalityAnchorIndex,
} from "../analysis/route-totality-anchor-index";
import type { RouteOccurrenceSurface as DomainRouteOccurrenceSurface } from "../analysis/route-occurrence-surface";
import { isFullyProvenElement, isFullyProvenProof } from "../analysis/route-totality-field-lineage-transition";
import type { RouteTotality } from "./route-totality-contracts";

export type AvailableEvidence = Extract<RouteTotality["evidenceSlice"], { elements: unknown[] }>;
export type AvailableSurface = Extract<RouteTotality["occurrenceSurface"], { occurrences: unknown[] }>;
export type EvidenceElement = AvailableEvidence["elements"][number];
export type EvidenceRelation = AvailableEvidence["relations"][number];
export type EvidenceOrigin = AvailableEvidence["origins"][number];
export type EvidenceTerminal = AvailableEvidence["terminals"][number];
export type EvidenceGap = AvailableEvidence["gaps"][number];
export type SurfaceOccurrence = AvailableSurface["occurrences"][number];
export type SurfaceTerminal = AvailableSurface["terminals"][number];
export type FieldAttachment = RouteTotality["fieldLineage"]["attachments"][number];
export type FieldFrontier = RouteTotality["fieldLineage"]["frontiers"][number];
export type FieldValue = FieldAttachment["field"] | NonNullable<FieldFrontier["field"]>;

export type EvidenceIndexes = {
  elementsById: ReadonlyMap<string, readonly EvidenceElement[]>;
  relationsById: ReadonlyMap<string, readonly EvidenceRelation[]>;
  originsByKey: ReadonlyMap<string, readonly EvidenceOrigin[]>;
  terminalsByKey: ReadonlyMap<string, readonly EvidenceTerminal[]>;
  gapsById: ReadonlyMap<string, readonly EvidenceGap[]>;
  gapsByFrom: ReadonlyMap<string, readonly EvidenceGap[]>;
  outgoing: ReadonlyMap<string, readonly EvidenceRelation[]>;
  incoming: ReadonlyMap<string, readonly EvidenceRelation[]>;
};

export type SurfaceIndexes = {
  surface: AvailableSurface;
  occurrencesById: ReadonlyMap<string, readonly SurfaceOccurrence[]>;
  terminalsById: ReadonlyMap<string, readonly SurfaceTerminal[]>;
  definitionIds: ReadonlySet<string>;
  anchors: RouteTotalityAnchorIndex;
  rootOccurrenceId: string | null;
};

export function indexEvidence(
  evidence: AvailableEvidence,
  cancellation: AnalysisCancellationToken,
): EvidenceIndexes {
  cancellation.throwIfCancelled();
  const elementsById = indexMany(evidence.elements, (element) => element.id, cancellation);
  const relationsById = indexMany(evidence.relations, (relation) => relation.id, cancellation);
  const originsByKey = indexMany(evidence.origins, (origin) => `${origin.elementId}:${origin.role}`, cancellation);
  const terminalsByKey = indexMany(evidence.terminals, (terminal) => `${terminal.elementId}:${terminal.role}`, cancellation);
  const gapsById = indexMany(evidence.gaps, (gap) => gap.id, cancellation);
  const gapsByFrom = indexMany(evidence.gaps.filter((gap) => gap.from !== null), (gap) => gap.from as string, cancellation);
  const outgoing = new Map<string, EvidenceRelation[]>();
  const incoming = new Map<string, EvidenceRelation[]>();
  const sorted = cancellableStableSort(evidence.relations, (left, right) => left.id.localeCompare(right.id), cancellation);
  for (const relation of sorted) {
    cancellation.throwIfCancelled();
    const from = outgoing.get(relation.from) ?? [];
    from.push(relation);
    outgoing.set(relation.from, from);
    const to = incoming.get(relation.to) ?? [];
    to.push(relation);
    incoming.set(relation.to, to);
  }
  cancellation.throwIfCancelled();
  return { elementsById, relationsById, originsByKey, terminalsByKey, gapsById, gapsByFrom, outgoing, incoming };
}

export function indexSurface(
  evidence: AvailableEvidence,
  surface: AvailableSurface,
  cancellation: AnalysisCancellationToken,
): SurfaceIndexes {
  cancellation.throwIfCancelled();
  const occurrencesById = indexMany(surface.occurrences, (occurrence) => occurrence.id, cancellation);
  const terminalsById = indexMany(surface.terminals, (terminal) => terminal.id, cancellation);
  const definitionIds = new Set<string>();
  for (const definition of surface.definitions) {
    cancellation.throwIfCancelled();
    definitionIds.add(definition.id);
  }
  const anchors = buildRouteTotalityAnchorIndex(
    evidence as unknown as DomainEvidenceSlice,
    surface as unknown as DomainRouteOccurrenceSurface,
    cancellation,
  );
  const rootOccurrenceId = exactRootOccurrenceId(surface, anchors, evidence, cancellation);
  cancellation.throwIfCancelled();
  return { surface, occurrencesById, terminalsById, definitionIds, anchors, rootOccurrenceId };
}

/** Resolve one Solid Show owner only from one exact terminal anchor. */
export function solidShowTerminalOccurrenceForElement(
  surface: SurfaceIndexes,
  evidenceElementId: string,
  cancellation: AnalysisCancellationToken,
): string | null {
  cancellation.throwIfCancelled();
  const anchor = solidShowRenderPropTerminalAnchor(
    surface.anchors,
    surface.surface as unknown as DomainRouteOccurrenceSurface,
    evidenceElementId,
    cancellation,
  );
  return anchor?.endpoint.ownerOccurrenceId ?? null;
}

export function exactElement(evidence: EvidenceIndexes, id: string): EvidenceElement | undefined {
  const values = evidence.elementsById.get(id) ?? [];
  return values.length === 1 ? values[0] : undefined;
}

export function exactRelation(evidence: EvidenceIndexes, id: string): EvidenceRelation | undefined {
  const values = evidence.relationsById.get(id) ?? [];
  return values.length === 1 ? values[0] : undefined;
}

export function exactGap(evidence: EvidenceIndexes, id: string): EvidenceGap | undefined {
  const values = evidence.gapsById.get(id) ?? [];
  return values.length === 1 ? values[0] : undefined;
}

export function endpointOccurrenceAnchors(
  anchors: RouteTotalityAnchorIndex,
  occurrenceId: string,
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  const matches = [] as typeof anchors.occurrenceAnchors;
  for (const anchor of anchors.occurrenceAnchors) {
    cancellation.throwIfCancelled();
    if (anchor.endpoint.id === occurrenceId) matches.push(anchor);
  }
  cancellation.throwIfCancelled();
  return matches;
}

export function endpointOccurrenceAnchorId(
  anchors: RouteTotalityAnchorIndex,
  occurrenceId: string,
  cancellation: AnalysisCancellationToken,
): string | null {
  const matches = endpointOccurrenceAnchors(anchors, occurrenceId, cancellation);
  return matches.length === 1 ? matches[0].evidenceElementId : null;
}

export function endpointTerminalAnchors(
  anchors: RouteTotalityAnchorIndex,
  terminalId: string,
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  const matches = [] as typeof anchors.terminalAnchors;
  for (const anchor of anchors.terminalAnchors) {
    cancellation.throwIfCancelled();
    if (anchor.endpoint.id === terminalId) matches.push(anchor);
  }
  cancellation.throwIfCancelled();
  return matches;
}

export function fullyProvenOrigin(
  origin: EvidenceOrigin | undefined,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  if (!origin || origin.status !== "proven" || origin.proof.length === 0) return false;
  for (const proof of origin.proof) {
    cancellation.throwIfCancelled();
    if (!isFullyProvenProof(proof)) return false;
  }
  cancellation.throwIfCancelled();
  return true;
}

export function fullyProvenTerminal(
  terminal: EvidenceTerminal | undefined,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  if (!terminal || terminal.status !== "proven" || terminal.proof.length === 0) return false;
  for (const proof of terminal.proof) {
    cancellation.throwIfCancelled();
    if (!isFullyProvenProof(proof)) return false;
  }
  cancellation.throwIfCancelled();
  return true;
}

export function hasPartialInputs(
  evidence: AvailableEvidence,
  surface: AvailableSurface,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  const partial = surface.status !== "complete"
    || hasTrue(surface.truncation, cancellation)
    || !evidence.coverage.complete
    || evidence.coverage.budgetExhausted
    || hasTrue(evidence.coverage.truncation, cancellation);
  cancellation.throwIfCancelled();
  return partial;
}

export function sameLocations(
  left: readonly RouteTotality["scopeProof"][number]["locations"][number][],
  right: readonly RouteTotality["scopeProof"][number]["locations"][number][],
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    cancellation.throwIfCancelled();
    if (!sameLocation(left[index], right[index])) return false;
  }
  cancellation.throwIfCancelled();
  return true;
}

export function isUnavailable(value: unknown): value is { status: "unavailable"; reason: string } {
  return Boolean(value && typeof value === "object" && "reason" in value && (value as { status?: unknown }).status === "unavailable");
}

export function availableEvidence(value: RouteTotality["evidenceSlice"]): AvailableEvidence | null {
  return "elements" in value ? value : null;
}

export function availableSurface(value: RouteTotality["occurrenceSurface"]): AvailableSurface | null {
  return "occurrences" in value ? value : null;
}

function exactRootOccurrenceId(
  surface: AvailableSurface,
  anchors: RouteTotalityAnchorIndex,
  evidence: AvailableEvidence,
  cancellation: AnalysisCancellationToken,
): string | null {
  cancellation.throwIfCancelled();
  const roots: SurfaceOccurrence[] = [];
  for (const occurrence of surface.occurrences) {
    cancellation.throwIfCancelled();
    if (occurrence.parentOccurrenceId === null && occurrence.scopeSeed === surface.scope.seed) roots.push(occurrence);
  }
  if (roots.length !== 1) return null;
  const root = roots[0];
  const endpointAnchors = endpointOccurrenceAnchors(anchors, root.id, cancellation);
  if (endpointAnchors.length !== 1 || anchors.occurrenceIssuesByEndpointId.has(root.id)) return null;
  const anchor = endpointAnchors[0];
  const reverse = anchors.occurrenceAnchorsByEvidenceElementId.get(anchor.evidenceElementId) ?? [];
  if (anchor.evidenceElementId !== surface.scope.seed || reverse.length !== 1) return null;
  const candidates: EvidenceElement[] = [];
  for (const element of evidence.elements) {
    cancellation.throwIfCancelled();
    if (element.id === anchor.evidenceElementId) candidates.push(element);
  }
  if (candidates.length !== 1 || !isFullyProvenElement(candidates[0], cancellation)) return null;
  cancellation.throwIfCancelled();
  return root.id;
}

function indexMany<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  cancellation: AnalysisCancellationToken,
): ReadonlyMap<string, readonly T[]> {
  cancellation.throwIfCancelled();
  const indexed = new Map<string, T[]>();
  for (const value of values) {
    cancellation.throwIfCancelled();
    const key = keyOf(value);
    const current = indexed.get(key) ?? [];
    current.push(value);
    indexed.set(key, current);
  }
  cancellation.throwIfCancelled();
  return indexed;
}

function hasTrue(values: Record<string, boolean>, cancellation: AnalysisCancellationToken): boolean {
  cancellation.throwIfCancelled();
  for (const value of Object.values(values)) {
    cancellation.throwIfCancelled();
    if (value) return true;
  }
  cancellation.throwIfCancelled();
  return false;
}

function sameLocation(
  left: RouteTotality["scopeProof"][number]["locations"][number],
  right: RouteTotality["scopeProof"][number]["locations"][number],
): boolean {
  return left.file === right.file
    && left.line === right.line
    && left.column === right.column
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}
