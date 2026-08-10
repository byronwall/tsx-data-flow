import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceProof, ProgramElement, SourceLocation } from "./scope-seam";
import { stableHash } from "./scope-seam";
import type {
  RouteTotalityFieldAttachment,
  RouteTotalityFieldFrontier,
  RouteTotalityFieldLineage,
  RouteTotalityFieldTransformation,
} from "./route-totality-field-lineage";

export function provenFieldProof(
  origin: { elementId: string; role: "filesystem" },
  elements: readonly ProgramElement[],
  occurrenceId: string,
  terminalId: string,
  consumerLabel: string,
  partial: boolean,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage {
  const [source, games, find, parameter, predicate, accessor, accessorCall, show, currentParameter, current, field, occurrence, title] = elements;
  const steps = [
    ["source-carrier", source, games],
    ["property-read", games, find],
    ["find-element", find, parameter],
    ["callback-parameter", parameter, predicate],
    ["find-predicate-result", predicate, find],
    ["find-call-result", find, accessor],
    ["function-return", accessor, accessorCall],
    ["show-when", accessorCall, show],
    ["show-render-prop", show, currentParameter],
    ["current-accessor", currentParameter, current],
    ["nested-property-read", current, field],
    ["occurrence-consumer", field, title],
  ] as const;
  const transformations = steps.map(([kind, from, to]) => transformation(kind, from, to));
  const locations = uniqueLocations(elements.map((element) => element.location), cancellation);
  const consumer = {
    id: stableId("consumer", [occurrence.id, title.id]),
    kind: "render" as const,
    label: consumerLabel,
    occurrenceId,
    routeTerminalId: terminalId,
    location: title.location,
  };
  const attachment: RouteTotalityFieldAttachment = {
    id: stableId("attachment", [origin.elementId, games.id, field.id, occurrenceId, consumer.id]),
    origin,
    field: {
      elementIds: [games.id, field.id],
      segments: [{ kind: "property", value: games.fieldName! }, { kind: "collection-element", value: "*" }, { kind: "property", value: field.fieldName! }],
      label: `${games.fieldName}[*].${field.fieldName}`,
      location: field.location,
    },
    occurrenceId,
    terminalIds: [terminalId],
    // The exact ledger, not a route-reachability path, owns field continuity.
    evidencePathElementIds: [origin.elementId],
    evidencePathRelationIds: [],
    proof: [proof("The compiler proves each source carrier, Array.find, accessor, Solid Show, nested field, and owning JSX attribute transfer.", locations)],
    locations,
    consumer,
    alias: null,
    transformationIds: transformations.map((item) => item.id),
    transformationKinds: transformations.map((item) => item.kind),
  };
  return {
    status: partial ? "partial" : "complete",
    unavailableReason: null,
    attachments: [attachment],
    frontiers: [],
    counts: { origins: 1, fields: 1, occurrences: 1, terminals: 1, frontiers: 0 },
    omissions: partial ? ["The shared route evidence is partial."] : [],
    transformations,
  };
}

export function failedFieldProof(
  origin: { elementId: string; role: "filesystem" },
  current: ProgramElement | null,
  detail: string,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage {
  const locations = current ? uniqueLocations([current.location], cancellation) : [];
  const frontier: RouteTotalityFieldFrontier = {
    id: stableId("frontier", [origin.elementId, current?.id ?? "none", detail]),
    origin,
    field: null,
    occurrenceId: null,
    reason: "partial-proof",
    gapId: null,
    stoppedAtElementId: current?.id ?? null,
    stoppedAtRelationId: null,
    evidencePathElementIds: [origin.elementId],
    evidencePathRelationIds: [],
    location: current?.location ?? null,
    proof: locations.length ? [proof(detail, locations, "partial")] : [],
  };
  return { status: "partial", unavailableReason: null, attachments: [], frontiers: [frontier], counts: { origins: 1, fields: 0, occurrences: 0, terminals: 0, frontiers: 1 }, omissions: [detail], transformations: [] };
}

function transformation(kind: string, from: ProgramElement, to: ProgramElement): RouteTotalityFieldTransformation {
  const locations = [from.location, to.location];
  return { id: stableId("transformation", [kind, from.id, to.id]), kind, fromElementIds: [from.id], toElementIds: [to.id], locations, proof: [proof(`The compiler proves this ${kind} transfer.`, locations)], status: "proven" };
}
function proof(detail: string, locations: SourceLocation[], status: "proven" | "partial" = "proven"): EvidenceProof {
  return { kind: "route-totality-field-proof", detail, locations, status };
}
function stableId(kind: string, values: readonly string[]): string { return `route-totality-field-${kind}:${stableHash(JSON.stringify(values))}`; }
function uniqueLocations(locations: readonly SourceLocation[], cancellation: AnalysisCancellationToken): SourceLocation[] {
  const records = new Map<string, SourceLocation>();
  for (const location of locations) { cancellation.throwIfCancelled(); records.set(JSON.stringify(location), location); }
  return [...records.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
