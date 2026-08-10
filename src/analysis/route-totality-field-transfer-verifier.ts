import type { AnalysisCancellationToken } from "./cancellation";
import type { RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import type { ComponentBindingMetadata } from "./program-component-binding-metadata";
import type { EvidenceProof, EvidenceStatus, SourceLocation } from "./scope-seam";

export const EXACT_FIELD_TRANSFER_KINDS = [
  "source-carrier",
  "property-read",
  "find-element",
  "callback-parameter",
  "predicate-return",
  "find-result",
  "function-return",
  "show-when",
  "show-render-prop",
  "accessor-call",
  "nested-property-read",
  "occurrence-consumer",
] as const;

export type ExactFieldTransferKind = typeof EXACT_FIELD_TRANSFER_KINDS[number];

export type FieldTransferElement = {
  id: string;
  kind: string;
  fieldName: string | null;
  operationKind: string | null;
  symbol: string | null;
  status: EvidenceStatus;
  proof: readonly EvidenceProof[];
  location: SourceLocation;
  componentBinding: ComponentBindingMetadata | null;
  originRoles?: readonly string[];
};

export type FieldTransferRelation = {
  id: string;
  from: string;
  to: string;
  kind: string;
  status: EvidenceStatus;
  proof: EvidenceProof;
};

export type FieldTransferGraph = {
  element: (id: string) => FieldTransferElement | undefined;
  relation: (id: string) => FieldTransferRelation | undefined;
  outgoing: (id: string) => readonly FieldTransferRelation[];
};

export type FieldTransferVerification = { ok: true } | { ok: false; detail: string };

/** Verify one ledger transfer against exact evidence. Query and API validation share this function. */
export function verifyExactFieldTransfer(
  transfer: RouteTotalityFieldTransformation,
  graph: FieldTransferGraph,
  cancellation: AnalysisCancellationToken,
): FieldTransferVerification {
  cancellation.throwIfCancelled();
  if (!EXACT_FIELD_TRANSFER_KINDS.includes(transfer.kind as ExactFieldTransferKind)) return failure("The transfer kind is not part of C01-C12.");
  if (transfer.status !== "proven" || transfer.fromElementIds.length !== 1 || transfer.toElementIds.length !== 1) {
    return failure("The transfer requires one proven exact source and target.");
  }
  const source = graph.element(transfer.fromElementIds[0]);
  const target = graph.element(transfer.toElementIds[0]);
  if (!exactElement(source) || !exactElement(target)) return failure("The transfer endpoints are not fully proven exact elements.");
  if (transfer.evidenceRelationIds.length === 0) return failure("The transfer has no exact evidence relation chain.");
  const relations: FieldTransferRelation[] = [];
  for (const id of transfer.evidenceRelationIds) {
    cancellation.throwIfCancelled();
    const relation = graph.relation(id);
    if (!relation || !exactRelation(relation) || !uniqueRelation(relation, graph, cancellation)) {
      return failure(`Evidence relation ${id} is absent, partial, or not unique.`);
    }
    relations.push(relation);
  }
  if (relations[0].from !== source.id || relations.at(-1)?.to !== target.id) return failure("The evidence chain does not match the transfer endpoints.");
  for (let index = 1; index < relations.length; index += 1) {
    if (relations[index - 1].to !== relations[index].from) return failure("The evidence relation chain is not contiguous.");
  }
  for (const relation of relations) {
    if (!exactElement(graph.element(relation.from)) || !exactElement(graph.element(relation.to))) {
      return failure("An evidence relation endpoint is not fully proven.");
    }
  }
  return verifySemantics(transfer.kind as ExactFieldTransferKind, source, target, relations, transfer, graph, cancellation);
}

function verifySemantics(
  kind: ExactFieldTransferKind,
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  transfer: RouteTotalityFieldTransformation,
  graph: FieldTransferGraph,
  cancellation: AnalysisCancellationToken,
): FieldTransferVerification {
  if (kind === "source-carrier") return verifyCarrier(source, target, relations, graph);
  if (kind === "property-read") return exactPattern(source, target, relations, ["field-input"], ["property-access"], "call", "field-read");
  if (kind === "find-element") return exactPattern(source, target, relations, ["collection-element"], ["array-find-element"], "field-read", "collection-element");
  if (kind === "callback-parameter") return exactPattern(source, target, relations, ["callback-parameter"], ["array-find-callback"], "collection-element", "parameter");
  if (kind === "predicate-return") return predicatePattern(source, target, relations, graph);
  if (kind === "find-result") return exactPattern(source, target, relations, ["find-result"], ["array-find-result"], "predicate-result", "call-result");
  if (kind === "function-return") return exactPattern(source, target, relations, ["function-return", "function-call"], ["return-expression", "function-call"], "call-result", "call");
  if (kind === "show-when") return exactPattern(source, target, relations, ["show-when"], ["solid-show-when"], "call", "show-binding");
  if (kind === "show-render-prop") return exactPattern(source, target, relations, ["show-render-parameter"], ["solid-show-render-parameter"], "show-binding", "parameter");
  if (kind === "accessor-call") return exactPattern(source, target, relations, ["accessor-call"], ["accessor-call"], "parameter", "call");
  if (kind === "nested-property-read") return exactPattern(source, target, relations, ["field-input"], ["property-access"], "call", "field-read");
  return consumerPattern(source, target, relations, transfer, graph, cancellation);
}

function verifyCarrier(
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  graph: FieldTransferGraph,
): FieldTransferVerification {
  if (source.kind !== "file-input" || !source.originRoles?.includes("filesystem") || target.kind !== "call") {
    return failure("C01 requires one filesystem file-input and the last exact carrier call.");
  }
  for (const relation of relations) {
    const relationSource = graph.element(relation.from);
    const relationTarget = graph.element(relation.to);
    if (relationSource && relationTarget && isExactSourceCarrierRelation(relationSource, relationTarget, relation)) continue;
    return failure(`C01 rejects ${relation.kind}/${relation.proof.kind} carrier evidence.`);
  }
  return { ok: true };
}

/** Exact endpoint and proof matrix for the selected-source carrier lane. */
export function isExactSourceCarrierRelation(
  source: Pick<FieldTransferElement, "kind">,
  target: Pick<FieldTransferElement, "kind">,
  relation: Pick<FieldTransferRelation, "kind" | "proof">,
): boolean {
  if (relation.kind === "references" && relation.proof.kind === "ast-node") return source.kind === "call" && target.kind === "alias";
  if (relation.kind === "references" && relation.proof.kind === "compiler-symbol") return source.kind === "alias" && target.kind === "value";
  if (relation.kind === "return-expression" && relation.proof.kind === "return-expression") return source.kind === "value" && target.kind === "return";
  if (relation.kind === "return-value" && relation.proof.kind === "return-expression") return source.kind === "return" && target.kind === "call";
  if (relation.kind === "http-bridge" && relation.proof.kind === "http-bridge") return source.kind === "http-response" && target.kind === "resource-input";
  if (relation.kind === "resource-result" && relation.proof.kind === "resource-boundary") return source.kind === "resource-input" && target.kind === "alias";
  if (relation.kind !== "carrier") return false;
  if (relation.proof.kind === "awaited-call-alias") return source.kind === "call" && target.kind === "alias";
  if (relation.proof.kind === "resource-boundary") return source.kind === "alias" && target.kind === "field-read";
  if (relation.proof.kind === "context-continuity") return source.kind === "field-read" && target.kind === "call";
  if (relation.proof.kind !== "carrier-boundary") return false;
  return source.kind === "file-input" && target.kind === "call"
    || source.kind === "call" && target.kind === "call"
    || source.kind === "alias" && target.kind === "return"
    || source.kind === "call" && target.kind === "http-response";
}

function predicatePattern(
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  graph: FieldTransferGraph,
): FieldTransferVerification {
  const expectedKinds = ["references", "field-input", "predicate-return"];
  const expectedProofs = ["compiler-symbol", "property-access", "array-find-predicate-return"];
  const pattern = exactPattern(source, target, relations, expectedKinds, expectedProofs, "parameter", "predicate-result");
  if (!pattern.ok) return pattern;
  const property = graph.element(relations[1].to);
  return property?.kind === "field-read" && property.fieldName !== null
    ? { ok: true }
    : failure("C05 requires one exact parameter-rooted predicate property read.");
}

function consumerPattern(
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  transfer: RouteTotalityFieldTransformation,
  graph: FieldTransferGraph,
  cancellation: AnalysisCancellationToken,
): FieldTransferVerification {
  const pattern = exactPattern(source, target, relations, ["consumer-value", "component-prop-binding"], ["jsx-consumer-value", "component-prop-binding"], "field-read", "component-prop-binding");
  if (!pattern.ok) return pattern;
  const metadata = target.componentBinding;
  if (!metadata || metadata.propName !== "title" || metadata.candidateCount !== 1
    || !metadata.componentOccurrenceElementId || !metadata.componentDefinitionId
    || !metadata.parameterElementId || !metadata.receiverElementId) {
    return failure("C12 requires one exact title binding with complete compiler ownership metadata.");
  }
  const occurrence = graph.element(metadata.componentOccurrenceElementId);
  const definition = graph.element(metadata.componentDefinitionId);
  if (!exactElement(occurrence) || !exactElement(definition)
    || occurrence.kind !== "component-occurrence" || definition.kind !== "component-definition"
    || !occurrence.symbol || occurrence.symbol !== definition.symbol || !occurrence.symbol.includes(".PageHeader@")) {
    return failure("C12 requires one compiler-resolved in-project PageHeader component.");
  }
  const supportIds = new Set(transfer.supportingElementIds);
  if (!supportIds.has(occurrence.id) || !supportIds.has(definition.id)) return failure("C12 omits component occurrence or definition support.");
  const componentRelations = transfer.supportingRelationIds.map((id) => graph.relation(id)).filter(Boolean) as FieldTransferRelation[];
  const exactComponentRelations = componentRelations.filter((relation) => (
    relation.from === occurrence.id && relation.to === definition.id
      && relation.kind === "component-occurrence" && relation.proof.kind === "compiler-symbol"
      && exactRelation(relation) && uniqueRelation(relation, graph, cancellation)
  ));
  if (exactComponentRelations.length !== 1) return failure("C12 requires one exact JSX occurrence-to-component definition relation.");
  return source.fieldName === "opponentName" ? { ok: true } : failure("C12 requires the exact opponentName field identity.");
}

function exactPattern(
  source: FieldTransferElement,
  target: FieldTransferElement,
  relations: readonly FieldTransferRelation[],
  relationKinds: readonly string[],
  proofKinds: readonly string[],
  sourceKind: string,
  targetKind: string,
): FieldTransferVerification {
  if (source.kind !== sourceKind || target.kind !== targetKind) return failure(`C01-C12 expected ${sourceKind} to ${targetKind}.`);
  if (relations.length !== relationKinds.length) return failure("The semantic transfer has an incorrect evidence relation count.");
  for (let index = 0; index < relations.length; index += 1) {
    if (relations[index].kind !== relationKinds[index] || relations[index].proof.kind !== proofKinds[index]) {
      return failure(`The semantic transfer rejects ${relations[index].kind}/${relations[index].proof.kind}.`);
    }
  }
  return { ok: true };
}

function uniqueRelation(relation: FieldTransferRelation, graph: FieldTransferGraph, cancellation: AnalysisCancellationToken): boolean {
  let matches = 0;
  for (const candidate of graph.outgoing(relation.from)) {
    cancellation.throwIfCancelled();
    if (candidate.to === relation.to && candidate.kind === relation.kind && candidate.proof.kind === relation.proof.kind && candidate.status === "proven") matches += 1;
  }
  return matches === 1;
}

function exactElement(element: FieldTransferElement | undefined): element is FieldTransferElement {
  return Boolean(element && element.status === "proven" && element.proof.length > 0
    && element.proof.every((item) => item.status === "proven" && item.locations.length > 0));
}

function exactRelation(relation: FieldTransferRelation): boolean {
  return relation.status === "proven" && relation.proof.status === "proven" && relation.proof.locations.length > 0;
}

function failure(detail: string): FieldTransferVerification { return { ok: false, detail }; }
