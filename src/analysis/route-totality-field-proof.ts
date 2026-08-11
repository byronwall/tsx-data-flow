import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceSlice } from "./evidence-slice";
import type { RouteTotalityFieldLineage } from "./route-totality-field-lineage";
import { queryRouteTotalityFieldProof } from "./route-totality-field-proof-query";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import type { RouteRecord } from "./route-data";
import type { RouteTotalitySelectedSource } from "./route-totality-selected-source";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";

export const SELECTED_ORIGIN_UNAVAILABLE_REASON = "The selected source has no unique compiler-backed filesystem origin.";
export const NO_SELECTED_SOURCE_FIELD_LINEAGE_REASON = "No source is selected; exact field lineage is inactive.";

export function buildSelectedRouteTotalityFieldProof(
  ts: typeof TypeScript, program: TypeScript.Program, root: string, provider: EvidenceRelationProvider, route: RouteRecord, slice: EvidenceSlice,
  surface: RouteOccurrenceSurface, selectedSource: RouteTotalitySelectedSource, cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage | null {
  return queryRouteTotalityFieldProof({ ts, program, root, provider, route, slice, surface, selectedSource }, cancellation);
}
