import type {
  RouteFrameworkBoundary,
  RouteRenderOccurrence,
} from "./route-occurrence-surface";

export type RouteBoundaryChildKind = "content" | "fallback";

export function attachOccurrenceToParent(parent: RouteRenderOccurrence | undefined, childId: string, callerOwned: boolean) {
  if (!parent) return;
  const children = callerOwned ? parent.callerOwnedChildOccurrenceIds : parent.definitionOwnedChildOccurrenceIds;
  if (!children.includes(childId)) children.push(childId);
}

export function attachOccurrenceToBoundary(boundary: RouteFrameworkBoundary | undefined, occurrenceId: string, childKind: RouteBoundaryChildKind) {
  if (!boundary) return;
  const children = childKind === "fallback" ? boundary.fallbackChildOccurrenceIds : boundary.childOccurrenceIds;
  if (!children.includes(occurrenceId)) children.push(occurrenceId);
}
