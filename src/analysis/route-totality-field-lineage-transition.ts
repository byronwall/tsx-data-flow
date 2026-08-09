import type {
  EvidenceProof,
  EvidenceStatus,
  ProgramIndexReadMetadata,
} from "./scope-seam";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "./cancellation";

export type FieldLineageStopReason =
  | "partial-proof"
  | "identity-lost"
  | "ambiguous-target"
  | "unsupported-relation"
  | "unsupported-transform"
  | "dynamic-index"
  | "multiple-origins"
  | "unmapped-occurrence"
  | "unmapped-terminal";

export type FieldLineageElement = {
  id: string;
  kind: string;
  operationKind: string | null;
  status: EvidenceStatus;
  proof: readonly EvidenceProof[];
  index?: ProgramIndexReadMetadata | null;
};

export type FieldLineageRelation = {
  id: string;
  from: string;
  to: string;
  kind: string;
  status: EvidenceStatus;
  proof: EvidenceProof;
};

export type FieldLineageTransitionContext = {
  relation: FieldLineageRelation;
  source: FieldLineageElement | undefined;
  target: FieldLineageElement | undefined;
  outgoingRelations: readonly FieldLineageRelation[];
  incomingRelations: readonly FieldLineageRelation[];
  hasField: boolean;
  isInitialOrigin: boolean;
  staticNamedField: boolean | null;
  indexMetadata: ProgramIndexReadMetadata | null;
  currentFieldElementId: string | null;
  componentPropReceiverElementId: string | null;
  occurrenceAnchorCount: number;
  terminalAnchorCount: number;
  currentOccurrenceId: string | null;
  terminalOwnerOccurrenceId: string | null | undefined;
  componentPropBoundaryCount?: number;
  componentPropOccurrenceAnchorCount?: number;
  componentPropBindingReceiverCount?: number;
  componentPropReceiverFieldInputCount?: number;
  componentPropReceiverRootProven?: boolean;
  componentPropBindingAmbiguous?: boolean;
  componentPropBindingIncomplete?: boolean;
  cancellation: AnalysisCancellationToken;
};

export type FieldLineageTransition =
  | { kind: "preserve" }
  | { kind: "field-input" }
  | { kind: "component-prop" }
  | { kind: "component-prop-binding-start" }
  | { kind: "component-prop-binding-receiver" }
  | { kind: "render-terminal" }
  | { kind: "stop"; reason: FieldLineageStopReason };

const SCALAR_CARRIERS = new Set([
  "value",
  "alias",
  "parameter",
  "field-read",
  "index-read",
  "call",
  "resource-result",
]);

const REFERENCE_TARGETS = new Set(["value", "alias", "field-read"]);
const ARGUMENT_SOURCES = new Set(["value", "alias", "field-read", "index-read", "call", "parameter"]);
const COMPONENT_PROP_SOURCES = new Set(["value", "alias", "field-read", "index-read", "call", "parameter", "resource-result"]);

export type IndexReadClassification =
  | { kind: "accepted"; segment: { kind: "string-index" | "numeric-index"; value: string } }
  | { kind: "dynamic" }
  | { kind: "partial" };

/** Convert one raw index literal into its only supported canonical segment. */
export function classifyIndexReadMetadata(
  metadata: ProgramIndexReadMetadata | null | undefined,
): IndexReadClassification {
  if (!metadata) return { kind: "partial" };
  if (metadata.kind === "dynamic") return { kind: "dynamic" };
  if (metadata.kind === "string-literal") {
    return { kind: "accepted", segment: { kind: "string-index", value: metadata.value } };
  }
  if (!/^(0|[1-9]\d*)$/.test(metadata.value)) return { kind: "dynamic" };
  const numeric = Number(metadata.value);
  if (!Number.isSafeInteger(numeric) || String(numeric) !== metadata.value) return { kind: "dynamic" };
  return { kind: "accepted", segment: { kind: "numeric-index", value: metadata.value } };
}

/**
 * Decide whether one exact evidence edge preserves Milestone 1 field identity.
 *
 * This table is deliberately endpoint-aware. Relation names alone are never
 * sufficient evidence for a field transition.
 */
export function classifyRouteTotalityFieldTransition(
  context: FieldLineageTransitionContext,
): FieldLineageTransition {
  const incomplete = incompleteEvidenceReason(context);
  if (incomplete) return { kind: "stop", reason: incomplete };

  const { relation, source, target } = context;
  if (!source || !target) return { kind: "stop", reason: "partial-proof" };

  switch (relation.kind) {
    case "references": {
      if ((!context.isInitialOrigin && !SCALAR_CARRIERS.has(source.kind)) || !REFERENCE_TARGETS.has(target.kind)) {
        return { kind: "stop", reason: "unsupported-relation" };
      }
      if (provenRelationsBetween(context.outgoingRelations, relation.from, relation.to, "references", context.cancellation).length !== 1) {
        return { kind: "stop", reason: "ambiguous-target" };
      }
      return { kind: "preserve" };
    }
    case "argument-binding": {
      if (!ARGUMENT_SOURCES.has(source.kind) || target.kind !== "parameter") {
        return { kind: "stop", reason: "unsupported-relation" };
      }
      if (provenRelationsOfKind(context.outgoingRelations, "argument-binding", context.cancellation).length !== 1) {
        return { kind: "stop", reason: "ambiguous-target" };
      }
      return { kind: "preserve" };
    }
    case "return-expression": {
      if (!ARGUMENT_SOURCES.has(source.kind) || target.kind !== "return") {
        return { kind: "stop", reason: "unsupported-relation" };
      }
      if (provenRelationsOfKind(context.outgoingRelations, "return-expression", context.cancellation).length !== 1) {
        return { kind: "stop", reason: "ambiguous-target" };
      }
      return { kind: "preserve" };
    }
    case "return-value": {
      if (source.kind !== "return" || target.kind !== "call") {
        return { kind: "stop", reason: "unsupported-relation" };
      }
      const incoming = provenRelationsOfKind(context.incomingRelations, "return-value", context.cancellation);
      if (incoming.length !== 1) {
        return { kind: "stop", reason: incoming.length > 1 ? "multiple-origins" : "partial-proof" };
      }
      return { kind: "preserve" };
    }
    case "resource-result": {
      if (context.hasField) return { kind: "stop", reason: "unsupported-transform" };
      if (source.kind !== "resource-input" || (target.kind !== "alias" && target.kind !== "resource-result")) {
        return { kind: "stop", reason: "unsupported-relation" };
      }
      if (provenRelationsOfKind(context.outgoingRelations, "resource-result", context.cancellation).length !== 1) {
        return { kind: "stop", reason: "ambiguous-target" };
      }
      return { kind: "preserve" };
    }
    case "field-input": {
      return classifyFieldInputTransition(context);
    }
    case "pack-field": {
      if (target.kind !== "object-pack" || target.operationKind !== "object-pack") {
        return { kind: "stop", reason: "unsupported-relation" };
      }
      return { kind: "stop", reason: context.hasField ? "unsupported-transform" : "unsupported-relation" };
    }
    case "component-prop": {
      if (!context.hasField) return { kind: "stop", reason: "unsupported-relation" };
      if (target.kind !== "component-occurrence") {
        return { kind: "stop", reason: "unsupported-relation" };
      }
      if (context.occurrenceAnchorCount === 0) return { kind: "stop", reason: "unmapped-occurrence" };
      if (context.occurrenceAnchorCount !== 1) return { kind: "stop", reason: "ambiguous-target" };
      return { kind: "component-prop" };
    }
    case "component-prop-binding": {
      if (source.kind === "component-prop-binding") {
        if (target.kind !== "field-read" || target.operationKind !== "field-read") {
          return { kind: "stop", reason: "unsupported-relation" };
        }
        if (context.componentPropBindingReceiverCount !== 1) {
          return {
            kind: "stop",
            reason: (context.componentPropBindingReceiverCount ?? 0) > 1 ? "ambiguous-target" : "partial-proof",
          };
        }
        if (context.componentPropReceiverFieldInputCount !== 1) {
          return {
            kind: "stop",
            reason: (context.componentPropReceiverFieldInputCount ?? 0) > 1 ? "ambiguous-target" : "partial-proof",
          };
        }
        if (context.componentPropReceiverRootProven !== true) return { kind: "stop", reason: "partial-proof" };
        if (context.staticNamedField === null) return { kind: "stop", reason: "partial-proof" };
        if (!context.staticNamedField) return { kind: "stop", reason: "unsupported-relation" };
        return { kind: "component-prop-binding-receiver" };
      }
      if (!COMPONENT_PROP_SOURCES.has(source.kind) || target.kind !== "component-prop-binding") {
        return { kind: "stop", reason: "unsupported-relation" };
      }
      if (context.componentPropBoundaryCount !== 1) {
        return {
          kind: "stop",
          reason: (context.componentPropBoundaryCount ?? 0) > 1 ? "ambiguous-target" : "partial-proof",
        };
      }
      if ((context.componentPropOccurrenceAnchorCount ?? 0) === 0) return { kind: "stop", reason: "unmapped-occurrence" };
      if (context.componentPropOccurrenceAnchorCount !== 1) return { kind: "stop", reason: "ambiguous-target" };
      if (context.componentPropBindingReceiverCount !== 1) {
        return {
          kind: "stop",
          reason: (context.componentPropBindingReceiverCount ?? 0) > 1 ? "ambiguous-target" : "partial-proof",
        };
      }
      return { kind: "component-prop-binding-start" };
    }
    case "render-terminal": {
      if (!context.hasField || (target.kind !== "render-terminal" && target.kind !== "dom-terminal")) {
        return { kind: "stop", reason: "unsupported-relation" };
      }
      if (!context.currentOccurrenceId) return { kind: "stop", reason: "unmapped-occurrence" };
      if (context.terminalAnchorCount === 0) return { kind: "stop", reason: "unmapped-terminal" };
      if (context.terminalAnchorCount !== 1) return { kind: "stop", reason: "ambiguous-target" };
      if (context.terminalOwnerOccurrenceId !== context.currentOccurrenceId) {
        return { kind: "stop", reason: "unmapped-terminal" };
      }
      return { kind: "render-terminal" };
    }
    default:
      return { kind: "stop", reason: "unsupported-relation" };
  }
}

function classifyFieldInputTransition(
  context: FieldLineageTransitionContext,
): FieldLineageTransition {
  const { relation, source, target } = context;
  if (!source || !target) return { kind: "stop", reason: "partial-proof" };
  const fieldInputs = provenRelationsOfKind(context.outgoingRelations, "field-input", context.cancellation);
  if (fieldInputs.length !== 1) return { kind: "stop", reason: "ambiguous-target" };
  const scalarCarrier = SCALAR_CARRIERS.has(source.kind);
  const exactComponentReceiver = context.componentPropReceiverElementId === relation.from;
  if (!scalarCarrier && !exactComponentReceiver) {
    return { kind: "stop", reason: context.hasField ? "unsupported-transform" : "unsupported-relation" };
  }
  if (context.hasField
    && context.currentFieldElementId !== relation.from
    && context.componentPropReceiverElementId !== relation.from) {
    return { kind: "stop", reason: "identity-lost" };
  }
  if (target.kind === "index-read") {
    if (target.operationKind !== "index-read") return { kind: "stop", reason: "unsupported-relation" };
    const index = classifyIndexReadMetadata(context.indexMetadata);
    if (index.kind === "accepted") return { kind: "field-input" };
    if (index.kind === "dynamic") return { kind: "stop", reason: "dynamic-index" };
    return { kind: "stop", reason: "partial-proof" };
  }
  if (target.kind !== "field-read" || target.operationKind !== "field-read") {
    return { kind: "stop", reason: "unsupported-relation" };
  }
  if (context.staticNamedField === null) return { kind: "stop", reason: "partial-proof" };
  if (!context.staticNamedField) return { kind: "stop", reason: "unsupported-relation" };
  return { kind: "field-input" };
}

export function isFullyProvenElement(
  element: Pick<FieldLineageElement, "status" | "proof"> | undefined,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): element is Pick<FieldLineageElement, "status" | "proof"> {
  cancellation.throwIfCancelled();
  if (!element || element.status !== "proven" || element.proof.length === 0) return false;
  for (const proof of element.proof) {
    cancellation.throwIfCancelled();
    if (!isFullyProvenProof(proof)) return false;
  }
  cancellation.throwIfCancelled();
  return true;
}

export function isFullyProvenRelation(
  relation: Pick<FieldLineageRelation, "status" | "proof"> | undefined,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): relation is Pick<FieldLineageRelation, "status" | "proof"> {
  cancellation.throwIfCancelled();
  const proven = Boolean(relation && relation.status === "proven" && isFullyProvenProof(relation.proof));
  cancellation.throwIfCancelled();
  return proven;
}

export function isFullyProvenProof(proof: EvidenceProof): boolean {
  return proof.status === "proven" && proof.locations.length > 0;
}

function incompleteEvidenceReason(context: FieldLineageTransitionContext): FieldLineageStopReason | null {
  const { relation, source, target } = context;
  if (!source || !target) return "partial-proof";
  if (relation.kind === "component-prop-binding" && context.componentPropBindingAmbiguous) return "ambiguous-target";
  if (relation.kind === "component-prop-binding" && context.componentPropBindingIncomplete) return "partial-proof";
  if (isFullyProvenRelation(relation, context.cancellation)
    && isFullyProvenElement(source, context.cancellation)
    && isFullyProvenElement(target, context.cancellation)) return null;
  if (relation.status === "unsupported" || source.status === "unsupported" || target.status === "unsupported") {
    return "unsupported-relation";
  }
  return "partial-proof";
}

function provenRelationsOfKind(
  relations: readonly FieldLineageRelation[],
  kind: string,
  cancellation: AnalysisCancellationToken,
): FieldLineageRelation[] {
  const matches: FieldLineageRelation[] = [];
  for (const relation of relations) {
    cancellation.throwIfCancelled();
    if (relation.kind === kind && isFullyProvenRelation(relation, cancellation)) matches.push(relation);
  }
  cancellation.throwIfCancelled();
  return matches;
}

function provenRelationsBetween(
  relations: readonly FieldLineageRelation[],
  from: string,
  to: string,
  kind: string,
  cancellation: AnalysisCancellationToken,
): FieldLineageRelation[] {
  const matches: FieldLineageRelation[] = [];
  for (const relation of relations) {
    cancellation.throwIfCancelled();
    if (relation.from === from && relation.to === to && relation.kind === kind && isFullyProvenRelation(relation, cancellation)) {
      matches.push(relation);
    }
  }
  cancellation.throwIfCancelled();
  return matches;
}
