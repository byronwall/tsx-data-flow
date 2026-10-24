import type * as TypeScript from "typescript";
import type { EvidenceSlice } from "./evidence-slice";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import type { RouteTotalitySelectedSource } from "./route-totality-selected-source";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";

export type FieldProofInput = {
  ts: typeof TypeScript;
  program: TypeScript.Program;
  root: string;
  provider: EvidenceRelationProvider;
  slice: EvidenceSlice;
  surface: RouteOccurrenceSurface;
  selectedSource: RouteTotalitySelectedSource;
};
