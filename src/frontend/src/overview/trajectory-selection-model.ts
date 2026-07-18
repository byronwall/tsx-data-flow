import type { RouteDataDetail } from "../../../api/contracts";

export function relatedOperationKeys(detail: RouteDataDetail, selectedKey: string | null) {
  if (!selectedKey) return new Set(detail.operations.map((operation) => operation.key));
  const index = detail.operations.findIndex((operation) => operation.key === selectedKey);
  if (index < 0) return new Set(detail.operations.map((operation) => operation.key));
  return new Set(detail.operations.slice(Math.max(0, index - 1), index + 2).map((operation) => operation.key));
}
export function isolatedOperations(detail: RouteDataDetail, selectedKey: string | null) {
  const related = relatedOperationKeys(detail, selectedKey);
  if (!selectedKey || related.size === detail.operations.length) return { operations: detail.operations, incomingStub: null, outgoingStub: null };
  const indexes = detail.operations.map((item, index) => related.has(item.key) ? index : -1).filter((index) => index >= 0);
  return { operations: detail.operations.filter((item) => related.has(item.key)), incomingStub: indexes[0] > 0 ? { label: `${indexes[0]} earlier evidence cards`, side: "incoming" as const } : null, outgoingStub: indexes.at(-1)! < detail.operations.length - 1 ? { label: `${detail.operations.length - 1 - indexes.at(-1)!} later evidence cards`, side: "outgoing" as const } : null };
}
