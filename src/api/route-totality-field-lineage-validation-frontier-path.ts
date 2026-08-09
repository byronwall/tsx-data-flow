import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { hasRouteTotalityFieldGap } from "../analysis/route-totality-field-lineage-truncation";
import { componentBoundaryFrontierOccurrenceId } from "../analysis/route-totality-field-lineage-component-binding";
import {
  classifyRouteTotalityFieldTransition,
  isFullyProvenElement,
  isFullyProvenRelation,
} from "../analysis/route-totality-field-lineage-transition";
import { proofsForStop, type FieldState, type PathState } from "../analysis/route-totality-field-lineage-support";
import { addIssue, type ValidationIssue } from "./route-occurrence-validation-graph";
import {
  exactElement,
  exactRelation,
  sameLocations,
  type EvidenceIndexes,
  type EvidenceElement,
  type EvidenceRelation,
  type FieldFrontier,
  type SurfaceIndexes,
} from "./route-totality-field-lineage-validation-index";
import {
  componentPropBindingContext,
  componentPropBoundary,
} from "./route-totality-field-lineage-validation-binding";
import { validateUniqueFieldLineageIds } from "./route-totality-field-lineage-validation-structure";

/** Validate the canonical path that ends immediately before an ordinary stop. */
export function validateFieldLineageFrontierPath(
  frontier: FieldFrontier,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  const elementIds = frontier.evidencePathElementIds;
  const relationIds = frontier.evidencePathRelationIds;
  if (elementIds.length === 0) {
    addIssue(issues, [...path, "evidencePathElementIds"], "field frontier requires its canonical accepted path");
    return;
  }
  if (elementIds[0] !== frontier.origin.elementId) {
    addIssue(issues, [...path, "evidencePathElementIds", 0], "field frontier path must start at its exact origin");
  }
  validateUniqueFieldLineageIds(elementIds, [...path, "evidencePathElementIds"], "evidence element", issues, cancellation);
  validateUniqueFieldLineageIds(relationIds, [...path, "evidencePathRelationIds"], "evidence relation", issues, cancellation);
  if (relationIds.length !== elementIds.length - 1) {
    addIssue(issues, path, "field frontier path must contain one relation between adjacent elements");
  }
  for (let index = 0; index < elementIds.length; index += 1) {
    cancellation.throwIfCancelled();
    const element = exactElement(evidence, elementIds[index]);
    if (!element || !isFullyProvenElement(element, cancellation)) {
      addIssue(issues, [...path, "evidencePathElementIds", index], "field frontier path elements must be unique, existing, and fully proven");
    }
  }

  let currentOccurrenceId = surface.rootOccurrenceId;
  let fieldIndex = 0;
  let currentFieldElementId: string | null = null;
  let componentPropReceiverElementId: string | null = null;
  for (let index = 0; index < relationIds.length; index += 1) {
    cancellation.throwIfCancelled();
    const relation = exactRelation(evidence, relationIds[index]);
    const source = exactElement(evidence, elementIds[index]);
    const target = exactElement(evidence, elementIds[index + 1]);
    if (!relation || !source || !target
      || relation.from !== source.id
      || relation.to !== target.id
      || !isFullyProvenRelation(relation, cancellation)) {
      addIssue(issues, [...path, "evidencePathRelationIds", index], "field frontier path relation must exactly connect fully proven adjacent evidence");
      continue;
    }
    if (hasRouteTotalityFieldGap(source.id, evidence.gapsByFrom, cancellation)) {
      addIssue(issues, [...path, "evidencePathElementIds", index], "field frontier path cannot cross an evidence gap");
    }
    const transition = classifyPathTransition(
      relation,
      source,
      target,
      evidence,
      surface,
      currentOccurrenceId,
      frontier,
      fieldIndex > 0,
      index === 0 && source.id === frontier.origin.elementId,
      currentFieldElementId,
      componentPropReceiverElementId,
      cancellation,
    );
    if (transition.kind === "stop" || transition.kind === "component-prop" || transition.kind === "render-terminal") {
      addIssue(issues, [...path, "evidencePathRelationIds", index], "field frontier path must contain only accepted identity-preserving transitions");
      continue;
    }
    if (elementIds.slice(0, index + 1).includes(target.id)) {
      addIssue(issues, [...path, "evidencePathElementIds", index + 1], "field frontier path cannot contain a cycle before its stop");
    }
    if (transition.kind === "field-input") {
      if (!frontier.field
        || fieldIndex >= frontier.field.elementIds.length
        || target.id !== frontier.field.elementIds[fieldIndex]) {
        addIssue(issues, [...path, "field"], "field frontier path must carry exact field elements in order");
      }
      fieldIndex += 1;
      currentFieldElementId = target.id;
      componentPropReceiverElementId = null;
      continue;
    }
    if (transition.kind === "component-prop-binding-start") {
      const boundary = componentPropBoundary(source.id, evidence, surface, cancellation, target.id);
      if (!boundary) {
        addIssue(issues, [...path, "evidencePathRelationIds", index], "component-prop binding must retain one exact component occurrence boundary");
      } else {
        currentOccurrenceId = boundary.occurrenceId;
      }
      componentPropReceiverElementId = null;
      continue;
    }
    if (transition.kind === "component-prop-binding-receiver") {
      if (!target.fieldName) {
        addIssue(issues, [...path, "evidencePathRelationIds", index], "component-prop binding receiver must have one exact named field");
      }
      if (fieldIndex > 0 && frontier.field && target.fieldName !== frontier.field.segments.at(-1)?.value) {
        addIssue(issues, [...path, "field"], "component-prop binding cannot rename an existing field");
      }
      componentPropReceiverElementId = target.id;
    }
  }
  if (!frontier.field || fieldIndex !== frontier.field.elementIds.length || fieldIndex === 0) {
    addIssue(issues, [...path, "field"], "field frontier path must carry every exact field element");
  }
  const expectedFrontierOccurrenceId = componentBoundaryFrontierOccurrenceId(currentOccurrenceId);
  if (frontier.occurrenceId !== expectedFrontierOccurrenceId) {
    addIssue(issues, [...path, "occurrenceId"], "field frontier must retain its exact current occurrence");
  }
  const finalElementId = elementIds.at(-1);
  if (finalElementId && hasRouteTotalityFieldGap(finalElementId, evidence.gapsByFrom, cancellation)) {
    addIssue(issues, [...path, "evidencePathElementIds", elementIds.length - 1], "ordinary field frontier cannot end at an evidence gap");
  }
  validateFrontierStop(
    frontier,
    elementIds,
    evidence,
    surface,
    currentFieldElementId,
    componentPropReceiverElementId,
    path,
    issues,
    cancellation,
  );
  cancellation.throwIfCancelled();
}

function classifyPathTransition(
  relation: EvidenceRelation,
  source: EvidenceElement,
  target: EvidenceElement | undefined,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  currentOccurrenceId: string | null,
  frontier: FieldFrontier,
  hasField: boolean,
  isInitialOrigin: boolean,
  currentFieldElementId: string | null,
  componentPropReceiverElementId: string | null,
  cancellation: AnalysisCancellationToken,
) {
  const occurrenceAnchors = target ? surface.anchors.occurrenceAnchorsByEvidenceElementId.get(target.id) ?? [] : [];
  const terminalAnchors = target ? surface.anchors.terminalAnchorsByEvidenceElementId.get(target.id) ?? [] : [];
  const terminal = terminalAnchors.length === 1 ? terminalAnchors[0].endpoint : undefined;
  const bindingContext = relation.kind === "component-prop-binding" && target
    ? componentPropBindingContext(source, target, evidence, surface, cancellation)
    : null;
  return classifyRouteTotalityFieldTransition({
    relation,
    source,
    target,
    outgoingRelations: evidence.outgoing.get(source.id) ?? [],
    incomingRelations: target ? evidence.incoming.get(target.id) ?? [] : [],
    hasField,
    isInitialOrigin,
    staticNamedField: target?.kind === "field-read" ? target.fieldName !== null : null,
    indexMetadata: target?.kind === "index-read" ? target.index : null,
    currentFieldElementId,
    componentPropReceiverElementId,
    occurrenceAnchorCount: occurrenceAnchors.length,
    terminalAnchorCount: terminalAnchors.length,
    currentOccurrenceId,
    terminalOwnerOccurrenceId: terminal?.ownerOccurrenceId,
    componentPropBoundaryCount: bindingContext?.boundaryCount,
    componentPropOccurrenceAnchorCount: bindingContext?.occurrenceAnchorCount,
    componentPropBindingReceiverCount: bindingContext?.receiverCount,
    componentPropReceiverFieldInputCount: bindingContext?.receiverFieldInputCount,
    componentPropReceiverRootProven: bindingContext?.receiverRootProven,
    componentPropBindingAmbiguous: bindingContext?.bindingAmbiguous,
    componentPropBindingIncomplete: bindingContext?.bindingIncomplete,
    cancellation,
  });
}

function validateFrontierStop(
  frontier: FieldFrontier,
  elementIds: readonly string[],
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  currentFieldElementId: string | null,
  componentPropReceiverElementId: string | null,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  if (frontier.stoppedAtRelationId === null) {
    addIssue(issues, [...path, "stoppedAtRelationId"], "ordinary field frontier requires its exact stopped relation");
    return;
  }
  const relation = exactRelation(evidence, frontier.stoppedAtRelationId);
  const source = exactElement(evidence, elementIds[elementIds.length - 1]);
  const target = relation ? exactElement(evidence, relation.to) : undefined;
  if (!relation || !source || relation.from !== source.id) {
    addIssue(issues, [...path, "stoppedAtRelationId"], "field frontier stopped relation must leave the final accepted path element");
    return;
  }
  if ((target?.id ?? null) !== frontier.stoppedAtElementId) {
    addIssue(issues, [...path, "stoppedAtElementId"], "field frontier stopped element must match its exact stopped relation target");
  }
  const transition = classifyPathTransition(
    relation,
    source,
    target,
    evidence,
    surface,
    frontier.occurrenceId,
    frontier,
    true,
    false,
    currentFieldElementId,
    componentPropReceiverElementId,
    cancellation,
  );
  const targetAlreadySeen = Boolean(target && elementIds.includes(target.id));
  if (targetAlreadySeen && transition.kind !== "stop") {
    if (frontier.reason !== "identity-lost") {
      addIssue(issues, [...path, "reason"], "a cyclic accepted transition must use the identity-lost frontier reason");
    }
  } else if (transition.kind === "stop") {
    if (transition.reason !== frontier.reason) {
      addIssue(issues, [...path, "reason"], "field frontier reason must match the shared transition classifier");
    }
  } else if (transition.kind === "component-prop") {
    const context = target
      ? componentPropBindingContext(source, target, evidence, surface, cancellation)
      : { boundaryCount: 0, occurrenceAnchorCount: 0, receiverCount: 0 };
    const expected = context.boundaryCount > 1
      || context.occurrenceAnchorCount > 1
      || context.receiverCount > 1
      ? "ambiguous-target"
      : "partial-proof";
    if (frontier.reason !== expected) addIssue(issues, [...path, "reason"], "consumer frontier reason must match exact binding readiness");
  } else if (transition.kind === "component-prop-binding-receiver") {
    const previousField = frontier.field?.segments.at(-1)?.value;
    if (frontier.reason !== "renamed-prop" || !target?.fieldName || target.fieldName === previousField) {
      addIssue(issues, [...path, "reason"], "receiver identity loss must use the renamed-prop frontier reason");
    }
  } else {
    addIssue(issues, [...path, "reason"], "field frontier must stop at an identity-losing or unsupported transition");
  }
  const stopped = target;
  const expectedLocation = stopped?.location ?? relation.proof.locations[0] ?? source.location;
  if (!frontier.location || !sameLocations([frontier.location], [expectedLocation], cancellation)) {
    addIssue(issues, [...path, "location"], "field frontier location must match its exact stop location");
  }
  const field = frontierFieldState(frontier, evidence, cancellation);
  if (field) {
    const stopPath: PathState = {
      currentElementId: source.id,
      currentOccurrenceId: frontier.occurrenceId,
      field,
      elementIds: [...elementIds],
      relationIds: [...frontier.evidencePathRelationIds],
      partial: false,
      componentPropReceiver: null,
    };
    const elementMap = new Map<string, EvidenceElement>();
    for (const [id, values] of evidence.elementsById) {
      cancellation.throwIfCancelled();
      if (values.length === 1) elementMap.set(id, values[0]);
    }
    const expectedProof = proofsForStop(stopPath, relation, elementMap, stopped, cancellation).map((proof) => frontier.reason === "partial-proof"
      ? { ...proof, status: "partial" as const }
      : proof);
    if (frontier.proof.length !== expectedProof.length
      || frontier.proof.some((proof, index) => proof.kind !== expectedProof[index].kind
        || proof.detail !== expectedProof[index].detail
        || proof.status !== expectedProof[index].status
        || !sameLocations(proof.locations, expectedProof[index].locations, cancellation))) {
      addIssue(issues, [...path, "proof"], "field frontier proof must match its exact stop path");
    }
  }
  if (frontier.reason === "identity-lost" && !targetAlreadySeen) {
    addIssue(issues, [...path, "reason"], "identity-lost frontier must stop at an already visited exact element");
  }
}

function frontierFieldState(
  frontier: FieldFrontier,
  evidence: EvidenceIndexes,
  cancellation: AnalysisCancellationToken,
): FieldState | null {
  cancellation.throwIfCancelled();
  if (!frontier.field) return null;
  const final = exactElement(evidence, frontier.field.elementIds.at(-1) ?? "");
  if (!final) return null;
  return {
    elementIds: [...frontier.field.elementIds],
    segments: frontier.field.segments.map((segment) => ({ ...segment })),
    label: frontier.field.label,
    location: final.location,
  };
}
