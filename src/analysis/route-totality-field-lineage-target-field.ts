import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceSlice } from "./evidence-slice";
import { indexReadMetadataFromElement } from "./program-index-read-metadata";
import type { ProgramElement } from "./program-evidence";
import { fieldLabel, type FieldState } from "./route-totality-field-lineage-support";
import {
  classifyIndexReadMetadata,
  isFullyProvenElement,
} from "./route-totality-field-lineage-transition";

export function fieldForTarget(
  raw: ProgramElement | undefined,
  element: EvidenceSlice["elements"][number],
  cancellation: AnalysisCancellationToken,
): FieldState | null {
  cancellation.throwIfCancelled();
  if (!raw
    || raw.confidence !== "proven"
    || raw.proof.locations.length === 0
    || !isFullyProvenElement(element, cancellation)
    || (element.kind !== "field-read" && element.kind !== "index-read")) {
    return null;
  }
  if (element.kind === "field-read") {
    if (raw.kind !== "field-read" || raw.operationKind !== "field-read" || element.operationKind !== "field-read") return null;
    const property = raw.attributes.property;
    if (typeof property !== "string" || property.length === 0 || element.fieldName !== property) return null;
    cancellation.throwIfCancelled();
    return {
      elementIds: [element.id],
      segments: [{ kind: "property", value: property }],
      label: property,
      location: element.location,
    };
  }
  if (raw.kind !== "index-read" || raw.operationKind !== "index-read" || element.operationKind !== "index-read") return null;
  const index = classifyIndexReadMetadata(indexReadMetadataFromElement(raw));
  if (index.kind !== "accepted") return null;
  cancellation.throwIfCancelled();
  return {
    elementIds: [element.id],
    segments: [index.segment],
    label: fieldLabel([index.segment], cancellation),
    location: element.location,
  };
}
