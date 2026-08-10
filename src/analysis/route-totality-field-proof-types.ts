import type * as TypeScript from "typescript";
import type { EvidenceSlice } from "./evidence-slice";
import type { RouteTotalitySelectedSource } from "./route-totality-selected-source";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import type { RouteRecord } from "./route-data";

export type FieldProofInput = {
  ts: typeof TypeScript;
  program: TypeScript.Program;
  route: RouteRecord;
  slice: EvidenceSlice;
  surface: RouteOccurrenceSurface;
  selectedSource: RouteTotalitySelectedSource;
};

export type FieldProofFailure = {
  reason: "partial-proof" | "ambiguous-target" | "unsupported-transform";
  detail: string;
  currentElementId: string | null;
};
