import type { AnalysisCancellationToken } from "./cancellation";
import { isFullyProvenElement, isFullyProvenRelation } from "./route-totality-field-lineage-transition";
import type { EvidenceProof, EvidenceStatus } from "./scope-seam";

export type ComponentBindingMetadata = {
  componentOccurrenceElementId: string | null;
  componentDefinitionId: string | null;
  parameterElementId: string | null;
  receiverElementId: string | null;
  candidateCount: number | null;
};

export type ComponentBindingAttributes = Readonly<Record<string, string | number | boolean | null>>;

export type ComponentBindingOwnershipExpectation = {
  componentOccurrenceElementId: string;
  componentDefinitionId: string;
  parameterElementId: string;
  receiverElementId: string;
  candidateCount: number;
};

export type ComponentBindingGraphElement = {
  id: string;
  kind: string;
  operationKind: string | null;
  fieldName: string | null;
  symbol: string | null;
  status: EvidenceStatus;
  proof: readonly EvidenceProof[];
};

export type ComponentBindingGraphRelation = {
  id: string;
  from: string;
  to: string;
  kind: string;
  status: EvidenceStatus;
  proof: EvidenceProof;
};

export type ComponentBindingEvidenceGraph = {
  element: (id: string) => ComponentBindingGraphElement | undefined;
  incoming: (id: string) => readonly ComponentBindingGraphRelation[];
  outgoing: (id: string) => readonly ComponentBindingGraphRelation[];
};

export type ComponentBindingReceiverEvidence = {
  receiver: ComponentBindingGraphElement | undefined;
  fieldInputCandidates: readonly ComponentBindingGraphRelation[];
  fieldInput: ComponentBindingGraphRelation | null;
  root: ComponentBindingGraphElement | null;
  referenceCandidates: readonly ComponentBindingGraphRelation[];
  reference: ComponentBindingGraphRelation | null;
  parameter: ComponentBindingGraphElement | null;
  ready: boolean;
};

export type ComponentBindingDefinitionEvidence = {
  candidates: readonly ComponentBindingGraphRelation[];
  definition: ComponentBindingGraphElement | null;
  ready: boolean;
};

export function componentBindingMetadataFromAttributes(
  attributes: ComponentBindingAttributes,
): ComponentBindingMetadata {
  return {
    componentOccurrenceElementId: stringAttribute(attributes.componentOccurrenceElementId),
    componentDefinitionId: stringAttribute(attributes.componentDefinitionId),
    parameterElementId: stringAttribute(attributes.parameterElementId),
    receiverElementId: stringAttribute(attributes.receiverElementId),
    candidateCount: candidateCountAttribute(attributes.candidateCount),
  };
}

export function componentBindingMetadataForElement(
  kind: string,
  attributes: ComponentBindingAttributes,
): ComponentBindingMetadata | null {
  return kind === "component-prop-binding" ? componentBindingMetadataFromAttributes(attributes) : null;
}

export function componentBindingOwnershipMatches(
  metadata: ComponentBindingMetadata | null | undefined,
  expected: ComponentBindingOwnershipExpectation,
): boolean {
  return Boolean(
    metadata
      && metadata.componentOccurrenceElementId === expected.componentOccurrenceElementId
      && metadata.componentDefinitionId === expected.componentDefinitionId
      && metadata.parameterElementId === expected.parameterElementId
      && metadata.receiverElementId === expected.receiverElementId
      && metadata.candidateCount === expected.candidateCount
      && expected.candidateCount === 1,
  );
}

export function componentBindingReceiverEvidence(
  receiverId: string,
  graph: ComponentBindingEvidenceGraph,
  cancellation: AnalysisCancellationToken,
): ComponentBindingReceiverEvidence {
  cancellation.throwIfCancelled();
  const receiver = graph.element(receiverId);
  const fieldInputCandidates = graph.incoming(receiverId).filter((relation) => relation.kind === "field-input");
  const fieldInput = fieldInputCandidates.length === 1 ? fieldInputCandidates[0] : null;
  const root = fieldInput ? graph.element(fieldInput.from) ?? null : null;
  const referenceCandidates = root
    ? graph.incoming(root.id).filter((relation) => relation.kind === "references"
      && graph.element(relation.from)?.kind === "parameter")
    : [];
  const reference = referenceCandidates.length === 1 ? referenceCandidates[0] : null;
  const parameter = reference ? graph.element(reference.from) ?? null : null;
  const ready = Boolean(
    receiver
      && isFullyProvenElement(receiver, cancellation)
      && receiver.kind === "field-read"
      && receiver.operationKind === "field-read"
      && receiver.fieldName !== null
      && fieldInput
      && isFullyProvenRelation(fieldInput, cancellation)
      && root
      && root.kind === "value"
      && isFullyProvenElement(root, cancellation)
      && reference
      && isFullyProvenRelation(reference, cancellation)
      && parameter
      && isFullyProvenElement(parameter, cancellation)
      && parameter.symbol !== null
      && root.symbol !== null
      && parameter.symbol === root.symbol,
  );
  cancellation.throwIfCancelled();
  return {
    receiver,
    fieldInputCandidates,
    fieldInput,
    root,
    referenceCandidates,
    reference,
    parameter,
    ready,
  };
}

export function componentBindingDefinitionEvidence(
  occurrenceId: string,
  graph: ComponentBindingEvidenceGraph,
  cancellation: AnalysisCancellationToken,
): ComponentBindingDefinitionEvidence {
  cancellation.throwIfCancelled();
  const candidates = graph.outgoing(occurrenceId).filter((relation) => relation.kind === "component-occurrence");
  const definition = candidates.length === 1 ? graph.element(candidates[0].to) ?? null : null;
  const ready = Boolean(
    candidates.length === 1
      && isFullyProvenRelation(candidates[0], cancellation)
      && definition
      && definition.kind === "component-definition"
      && isFullyProvenElement(definition, cancellation),
  );
  cancellation.throwIfCancelled();
  return { candidates, definition, ready };
}

function stringAttribute(value: string | number | boolean | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function candidateCountAttribute(value: string | number | boolean | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
