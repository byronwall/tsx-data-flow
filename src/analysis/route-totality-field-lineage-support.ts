import type { AnalysisCancellationToken } from "./cancellation";
import { cancellableStableSort } from "./cancellable-stable-sort";
import type { EvidenceSlice } from "./evidence-slice";
import type { EvidenceProof, SourceLocation } from "./scope-seam";
import type {
  RouteTotalityFieldSegment,
} from "./route-totality-field-lineage";

export type FieldState = {
  elementIds: string[];
  segments: RouteTotalityFieldSegment[];
  label: string;
  location: SourceLocation;
};

type ComponentPropReceiverState = {
  elementId: string;
  propName: string;
};

export type PathState = {
  currentElementId: string;
  currentOccurrenceId: string | null;
  field: FieldState | null;
  elementIds: string[];
  relationIds: string[];
  partial: boolean;
  componentPropReceiver: ComponentPropReceiverState | null;
  solidShowRenderPropTerminal: boolean;
  carrier: boolean;
};

export function fieldLabel(
  segments: readonly RouteTotalityFieldSegment[],
  cancellation: AnalysisCancellationToken,
): string {
  let label = "";
  for (const segment of segments) {
    cancellation.throwIfCancelled();
    if (segment.kind === "property") label = label ? `${label}.${segment.value}` : segment.value;
    else if (segment.kind === "string-index") label = `${label}[${JSON.stringify(segment.value)}]`;
    else if (segment.kind === "numeric-index") label = `${label}[${segment.value}]`;
    else label = `${label}[*]`;
  }
  cancellation.throwIfCancelled();
  return label;
}

export function proofsForStop(
  state: PathState,
  relation: EvidenceSlice["relations"][number],
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number]>,
  target: EvidenceSlice["elements"][number] | undefined,
  cancellation: AnalysisCancellationToken,
): EvidenceProof[] {
  cancellation.throwIfCancelled();
  const locations: SourceLocation[] = [];
  for (const elementId of state.elementIds) {
    cancellation.throwIfCancelled();
    const location = elementsById.get(elementId)?.location;
    if (location) locations.push(location);
  }
  for (const location of relation.proof.locations) {
    cancellation.throwIfCancelled();
    locations.push(location);
  }
  if (target) locations.push(target.location);
  let targetHasPartialProof = false;
  for (const proof of target?.proof ?? []) {
    cancellation.throwIfCancelled();
    if (proof.status === "partial") {
      targetHasPartialProof = true;
      break;
    }
  }
  const partial = relation.status === "partial"
    || relation.proof.status === "partial"
    || target?.status === "partial"
    || targetHasPartialProof;
  cancellation.throwIfCancelled();
  return [{
    kind: "route-totality-field-frontier",
    detail: "The bounded field path stopped before a proven downstream identity.",
    locations: uniqueLocations(locations, cancellation),
    status: partial ? "partial" : "proven",
  }];
}

function uniqueLocations(
  locations: readonly SourceLocation[],
  cancellation: AnalysisCancellationToken,
): SourceLocation[] {
  cancellation.throwIfCancelled();
  const byKey = new Map<string, SourceLocation>();
  for (const location of locations) {
    cancellation.throwIfCancelled();
    byKey.set(locationKey(location), location);
  }
  const unique: SourceLocation[] = [];
  for (const location of byKey.values()) {
    cancellation.throwIfCancelled();
    unique.push(location);
  }
  return cancellableStableSort(unique, (left, right) => locationKey(left).localeCompare(locationKey(right)), cancellation);
}

function locationKey(location: SourceLocation): string {
  return `${location.file}:${location.line}:${location.column}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}
