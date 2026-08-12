import type { FieldTransferElement, FieldTransferGraph, FieldTransferRelation, FieldTransferVerification } from "./route-totality-field-transfer-verifier";

/** Verify only the declared selected-source carrier lane. */
export function verifyExactSourceCarrier(
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
  if (relation.kind === "references" && relation.proof.kind === "ast-node") {
    return source.kind === "call" && target.kind === "alias"
      || source.kind === "resource-result" && target.kind === "call";
  }
  if (relation.kind === "references" && relation.proof.kind === "compiler-symbol") return source.kind === "alias" && target.kind === "value";
  if (relation.kind === "return-expression" && relation.proof.kind === "return-expression") {
    return (source.kind === "call" || source.kind === "value") && target.kind === "return";
  }
  if (relation.kind === "return-value" && relation.proof.kind === "return-expression") return source.kind === "return" && target.kind === "call";
  if (relation.kind === "http-bridge" && relation.proof.kind === "http-bridge") return source.kind === "http-response" && target.kind === "resource-input";
  if (relation.kind === "resource-result" && relation.proof.kind === "resource-boundary") {
    return source.kind === "resource-input" && (target.kind === "alias" || target.kind === "resource-result");
  }
  if (relation.kind !== "carrier") return false;
  if (relation.proof.kind === "carrier-boundary") {
    return source.kind === "file-input" && target.kind === "call"
      || source.kind === "call" && target.kind === "call"
      || source.kind === "alias" && target.kind === "return"
      || source.kind === "call" && target.kind === "http-response";
  }
  if (relation.proof.kind === "awaited-call-alias") return source.kind === "call" && target.kind === "alias";
  if (relation.proof.kind === "resource-boundary") return source.kind === "alias" && target.kind === "field-read";
  if (relation.proof.kind === "context-continuity") return source.kind === "field-read" && target.kind === "call";
  return false;
}

function failure(detail: string): FieldTransferVerification { return { ok: false, detail }; }
