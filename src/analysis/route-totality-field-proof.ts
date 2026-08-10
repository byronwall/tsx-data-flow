import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceSlice } from "./evidence-slice";
import type { RouteTotalityFieldLineage } from "./route-totality-field-lineage";
import { queryRouteTotalityFieldProof } from "./route-totality-field-proof-query";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import type { RouteRecord } from "./route-data";
import type { RouteTotalitySelectedSource } from "./route-totality-selected-source";

export function buildSelectedRouteTotalityFieldProof(
  ts: typeof TypeScript, program: TypeScript.Program, route: RouteRecord, slice: EvidenceSlice,
  surface: RouteOccurrenceSurface, selectedSource: RouteTotalitySelectedSource, cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage | null {
  return queryRouteTotalityFieldProof({ ts, program, route, slice, surface, selectedSource }, cancellation);
}
