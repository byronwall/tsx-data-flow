import type { RouteOccurrenceDefinition } from "./route-occurrence-surface";
import type { RouteOccurrenceSurfaceBuilder } from "./route-occurrence-surface-builder";

export function isTransparentWrapper(_builder: RouteOccurrenceSurfaceBuilder, _definition: RouteOccurrenceDefinition) {
  // Retain every wrapper until source-backed semantic proof exists.
  return false;
}
