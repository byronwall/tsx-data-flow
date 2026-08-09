import type { AnalysisCancellationToken } from "./cancellation";
import {
  NO_ANALYSIS_CANCELLATION,
} from "./cancellation";
import type { EvidenceSlice } from "./evidence-slice";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import type { ProgramElement } from "./program-evidence";
import {
  buildRouteTotalityAnchorIndex,
  type RouteTotalityAnchorIndex,
} from "./route-totality-anchor-index";
import type {
  RouteOccurrenceSurface,
} from "./route-occurrence-surface";
import type {
  EvidenceProof,
  OriginRole,
  ProgramRelation,
  SourceLocation,
} from "./scope-seam";
import {
  addAttachment,
  addFrontier,
  appendField,
  compareOrigin,
  comparePath,
  compareTraversal,
  hasSliceTruncation,
  lastLocation,
  lineageCounts,
  makeFrontier,
  nextState,
  projectAttachment,
  proofsForPath,
  proofsForStop,
  traversalKey,
  type AttachmentAccumulator,
  type FieldState,
  type PathState,
  type TraversalState,
} from "./route-totality-field-lineage-support";

export type RouteTotalityFieldSegment = {
  kind: "property" | "string-index" | "number-index";
  value: string;
};

export type RouteTotalityField = {
  elementIds: string[];
  segments: RouteTotalityFieldSegment[];
  label: string;
  location: SourceLocation;
};

export type RouteTotalityFieldOrigin = {
  elementId: string;
  role: OriginRole;
};

export type RouteTotalityFieldAttachment = {
  id: string;
  origin: RouteTotalityFieldOrigin;
  field: RouteTotalityField;
  occurrenceId: string;
  terminalIds: string[];
  evidencePathElementIds: string[];
  evidencePathRelationIds: string[];
  proof: EvidenceProof[];
  locations: SourceLocation[];
};

export type RouteTotalityFieldFrontierReason =
  | "partial-proof"
  | "identity-lost"
  | "ambiguous-target"
  | "unsupported-relation"
  | "unsupported-transform"
  | "dynamic-index"
  | "renamed-prop"
  | "multiple-origins"
  | "evidence-truncated"
  | "unmapped-occurrence"
  | "unmapped-terminal";

export type RouteTotalityFieldFrontier = {
  id: string;
  origin: RouteTotalityFieldOrigin;
  field: Omit<RouteTotalityField, "location"> | null;
  occurrenceId: string | null;
  reason: RouteTotalityFieldFrontierReason;
  stoppedAtElementId: string | null;
  stoppedAtRelationId: string | null;
  location: SourceLocation | null;
  proof: EvidenceProof[];
};

export type RouteTotalityFieldLineage = {
  status: "complete" | "partial" | "unavailable";
  unavailableReason: string | null;
  attachments: RouteTotalityFieldAttachment[];
  frontiers: RouteTotalityFieldFrontier[];
  counts: {
    origins: number;
    fields: number;
    occurrences: number;
    terminals: number;
    frontiers: number;
  };
  omissions: string[];
};

const PRESERVING_RELATIONS = new Set<ProgramRelation["kind"]>([
  "references",
  "argument-binding",
  "return-expression",
  "return-value",
]);

/** Build the bounded, source-backed named-field projection for one route. */
export function buildRouteTotalityFieldLineage(
  provider: EvidenceRelationProvider,
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteTotalityFieldLineage {
  cancellation.throwIfCancelled();
  const elementsById = new Map(slice.elements.map((element) => [element.id, element]));
  const relationsByFrom = relationsBySource(slice, cancellation);
  const anchors = buildRouteTotalityAnchorIndex(slice, surface, cancellation);
  const rootOccurrenceId = rootOccurrenceIdFor(anchors, surface, elementsById);
  const attachments = new Map<string, AttachmentAccumulator>();
  const frontiers = new Map<string, RouteTotalityFieldFrontier>();
  const origins = [...slice.origins].sort(compareOrigin);

  for (const originRecord of origins) {
    cancellation.throwIfCancelled();
    const originElement = elementsById.get(originRecord.elementId);
    const rawOrigin = provider.facts.getElement(originRecord.elementId);
    if (!isProvenOrigin(originRecord, originElement, rawOrigin)) continue;
    traverseOrigin(
      provider,
      originRecord,
      rootOccurrenceId,
      elementsById,
      relationsByFrom,
      anchors,
      attachments,
      frontiers,
      cancellation,
    );
  }

  if (hasSliceTruncation(slice)) {
    for (const attachment of attachments.values()) {
      cancellation.throwIfCancelled();
      addFrontier(
        frontiers,
        makeFrontier(
          attachment.origin,
          attachment.field,
          attachment.occurrenceId,
          "evidence-truncated",
          attachment.path.currentElementId,
          null,
          lastLocation(attachment.path, elementsById),
          proofsForPath(attachment.path, elementsById, slice),
        ),
      );
    }
  }

  const projectedAttachments = [] as RouteTotalityFieldAttachment[];
  for (const attachment of attachments.values()) {
    cancellation.throwIfCancelled();
    projectedAttachments.push(projectAttachment(attachment, elementsById, slice, surface));
  }
  projectedAttachments.sort((left, right) => left.id.localeCompare(right.id));
  const projectedFrontiers = [] as RouteTotalityFieldFrontier[];
  for (const frontier of frontiers.values()) {
    cancellation.throwIfCancelled();
    projectedFrontiers.push(frontier);
  }
  projectedFrontiers.sort((left, right) => left.id.localeCompare(right.id));
  const omissionSet = new Set<string>();
  if (projectedFrontiers.length > 0) omissionSet.add("Field continuity stopped at one or more bounded frontiers.");
  if (!slice.coverage.complete) omissionSet.add("The shared evidence slice is partial.");
  if (hasSliceTruncation(slice)) omissionSet.add("The shared evidence slice is bounded or truncated.");
  if (surface.status !== "complete") omissionSet.add("The occurrence surface is partial.");
  const status = projectedFrontiers.length > 0
    || surface.status !== "complete"
    || !slice.coverage.complete
    || projectedAttachments.some((attachment) => attachment.proof.some((proof) => proof.status === "partial"))
    ? "partial"
    : "complete";
  return {
    status,
    unavailableReason: null,
    attachments: projectedAttachments,
    frontiers: projectedFrontiers,
    counts: lineageCounts(projectedAttachments, projectedFrontiers, cancellation),
    omissions: [...omissionSet].sort(),
  };
}

export function unavailableRouteTotalityFieldLineage(reason: string): RouteTotalityFieldLineage {
  return {
    status: "unavailable",
    unavailableReason: reason,
    attachments: [],
    frontiers: [],
    counts: { origins: 0, fields: 0, occurrences: 0, terminals: 0, frontiers: 0 },
    omissions: [reason],
  };
}

function traverseOrigin(
  provider: EvidenceRelationProvider,
  origin: EvidenceSlice["origins"][number],
  rootOccurrenceId: string | null,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
  relationsByFrom: Map<string, EvidenceSlice["relations"]>,
  anchors: RouteTotalityAnchorIndex,
  attachments: Map<string, AttachmentAccumulator>,
  frontiers: Map<string, RouteTotalityFieldFrontier>,
  cancellation: AnalysisCancellationToken,
): void {
  const originIdentity = { elementId: origin.elementId, role: origin.role };
  const queue: TraversalState[] = [{
    origin: originIdentity,
    currentElementId: origin.elementId,
    currentOccurrenceId: rootOccurrenceId,
    field: null,
    elementIds: [origin.elementId],
    relationIds: [],
    partial: false,
  }];
  const best = new Map<string, PathState>();

  while (queue.length > 0) {
    cancellation.throwIfCancelled();
    queue.sort(compareTraversal);
    const state = queue.shift()!;
    const stateKey = traversalKey(state);
    const previous = best.get(stateKey);
    if (previous && comparePath(previous, state) <= 0) continue;
    best.set(stateKey, state);
    for (const relation of relationsByFrom.get(state.currentElementId) ?? []) {
      cancellation.throwIfCancelled();
      const target = elementsById.get(relation.to);
      if (!isProvenRelation(relation) || !isProvenElement(target)) {
        if (state.field) {
          const partialProof = relation.status === "partial"
            || relation.proof.status === "partial"
            || target?.status === "partial"
            || target?.proof.some((proof) => proof.status === "partial");
          addFrontier(frontiers, makeFrontier(
            originIdentity,
            state.field,
            state.currentOccurrenceId,
            partialProof ? "partial-proof" : "unsupported-relation",
            target?.id ?? null,
            relation.id,
            target?.location ?? relation.proof.locations[0] ?? lastLocation(state, elementsById),
            proofsForStop(state, relation, elementsById, target),
          ));
        }
        continue;
      }
      if (state.elementIds.includes(target.id)) {
        if (state.field) addFrontier(frontiers, makeFrontier(
          originIdentity,
          state.field,
          state.currentOccurrenceId,
          "identity-lost",
          target.id,
          relation.id,
          target.location,
          proofsForStop(state, relation, elementsById, target),
        ));
        continue;
      }

      if (relation.kind === "field-input") {
        const rawTarget = provider.facts.getElement(target.id);
        const field = namedPropertyField(rawTarget, target);
        if (!field) {
          if (state.field || rawTarget?.kind === "index-read") {
            addFrontier(frontiers, makeFrontier(
              originIdentity,
              state.field,
              state.currentOccurrenceId,
              rawTarget?.kind === "index-read" ? "dynamic-index" : "identity-lost",
              target.id,
              relation.id,
              target.location,
              proofsForStop(state, relation, elementsById, target),
            ));
          }
          continue;
        }
        const nextField = state.field
          ? appendField(state.field, field, relation.from === state.field.elementIds[state.field.elementIds.length - 1])
          : field;
        if (!nextField) {
          addFrontier(frontiers, makeFrontier(
            originIdentity,
            state.field,
            state.currentOccurrenceId,
            "identity-lost",
            target.id,
            relation.id,
            target.location,
            proofsForStop(state, relation, elementsById, target),
          ));
          continue;
        }
        queue.push(nextState(state, target, relation, nextField));
        continue;
      }

      if (relation.kind === "component-prop") {
        if (!state.field) continue;
        const occurrence = anchors.occurrenceByEvidenceElementId.get(target.id);
        if (!occurrence) {
          addFrontier(frontiers, makeFrontier(
            originIdentity,
            state.field,
            state.currentOccurrenceId,
            "unmapped-occurrence",
            target.id,
            relation.id,
            target.location,
            proofsForStop(state, relation, elementsById, target),
          ));
          continue;
        }
        const next = nextState(state, target, relation, state.field, occurrence.id);
        addAttachment(attachments, originIdentity, state.field, occurrence.id, next);
        addFrontier(frontiers, makeFrontier(
          originIdentity,
          state.field,
          occurrence.id,
          "unsupported-relation",
          target.id,
          relation.id,
          target.location,
          proofsForStop(state, relation, elementsById, target),
        ));
        continue;
      }

      if (relation.kind === "render-terminal") {
        if (!state.field) continue;
        const terminal = anchors.terminalByEvidenceElementId.get(target.id);
        if (!terminal) {
          addFrontier(frontiers, makeFrontier(
            originIdentity,
            state.field,
            state.currentOccurrenceId,
            "unmapped-terminal",
            target.id,
            relation.id,
            target.location,
            proofsForStop(state, relation, elementsById, target),
          ));
          continue;
        }
        if (!state.currentOccurrenceId || (terminal.ownerOccurrenceId !== null && terminal.ownerOccurrenceId !== state.currentOccurrenceId)) {
          addFrontier(frontiers, makeFrontier(
            originIdentity,
            state.field,
            state.currentOccurrenceId,
            "unmapped-occurrence",
            target.id,
            relation.id,
            terminal.location,
            proofsForStop(state, relation, elementsById, target),
          ));
          continue;
        }
        addAttachment(attachments, originIdentity, state.field, state.currentOccurrenceId, nextState(state, target, relation, state.field), terminal.id);
        continue;
      }

      if (relation.kind === "resource-result") {
        if (state.field) {
          addFrontier(frontiers, makeFrontier(
            originIdentity,
            state.field,
            state.currentOccurrenceId,
            "unsupported-transform",
            target.id,
            relation.id,
            target.location,
            proofsForStop(state, relation, elementsById, target),
          ));
        } else {
          queue.push(nextState(state, target, relation, null));
        }
        continue;
      }

      if (PRESERVING_RELATIONS.has(relation.kind)) {
        queue.push(nextState(state, target, relation, state.field));
        continue;
      }

      if (state.field) {
        addFrontier(frontiers, makeFrontier(
          originIdentity,
          state.field,
          state.currentOccurrenceId,
          "unsupported-relation",
          target.id,
          relation.id,
          target.location,
          proofsForStop(state, relation, elementsById, target),
        ));
      }
    }
  }
}

function relationsBySource(
  slice: EvidenceSlice,
  cancellation: AnalysisCancellationToken,
): Map<string, EvidenceSlice["relations"]> {
  const relationsByFrom = new Map<string, EvidenceSlice["relations"]>();
  for (const relation of [...slice.relations].sort((left, right) => left.id.localeCompare(right.id))) {
    cancellation.throwIfCancelled();
    const current = relationsByFrom.get(relation.from) ?? [];
    current.push(relation);
    relationsByFrom.set(relation.from, current);
  }
  return relationsByFrom;
}

function namedPropertyField(raw: ProgramElement | undefined, element: EvidenceSlice["elements"][number]): FieldState | null {
  if (!raw || raw.kind !== "field-read" || raw.operationKind !== "field-read" || raw.confidence !== "proven" || raw.proof.locations.length === 0) return null;
  if (element.kind !== "field-read" || element.status !== "proven" || element.proof.length === 0) return null;
  const property = raw.attributes.property;
  if (typeof property !== "string" || property.length === 0) return null;
  return {
    elementIds: [element.id],
    segments: [{ kind: "property", value: property }],
    label: property,
    location: element.location,
  };
}

function isProvenOrigin(
  origin: EvidenceSlice["origins"][number],
  element: EvidenceSlice["elements"][number] | undefined,
  raw: ProgramElement | undefined,
): boolean {
  return origin.status === "proven"
    && origin.proof.length > 0
    && origin.proof.every((proof) => proof.status === "proven" && proof.locations.length > 0)
    && isProvenElement(element)
    && raw?.confidence === "proven"
    && raw.proof.locations.length > 0;
}

function isProvenElement(element: EvidenceSlice["elements"][number] | undefined): element is EvidenceSlice["elements"][number] {
  return Boolean(element && element.status === "proven" && element.proof.length > 0 && element.proof.every((proof) => proof.status === "proven" && proof.locations.length > 0));
}

function isProvenRelation(relation: EvidenceSlice["relations"][number]): boolean {
  return relation.status === "proven" && relation.proof.status === "proven" && relation.proof.locations.length > 0;
}

function rootOccurrenceIdFor(
  anchors: RouteTotalityAnchorIndex,
  surface: RouteOccurrenceSurface,
  elementsById: Map<string, EvidenceSlice["elements"][number]>,
): string | null {
  const roots = surface.occurrences.filter((occurrence) => occurrence.parentOccurrenceId === null && occurrence.scopeSeed === surface.scope.seed);
  if (roots.length !== 1) return null;
  const root = roots[0];
  const anchor = anchors.occurrenceAnchors.find((candidate) => candidate.endpoint.id === root.id);
  return anchor && isProvenElement(elementsById.get(anchor.evidenceElementId)) ? anchor.endpoint.id : null;
}
