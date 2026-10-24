import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceSlice } from "./evidence-slice";

export function componentBoundaryFrontierOccurrenceId(currentOccurrenceId: string | null): string | null {
  return currentOccurrenceId;
}

export function componentPropBoundarySemanticKey(
  relation: Pick<EvidenceSlice["relations"][number], "id" | "kind" | "from" | "to" | "status" | "proof">,
): string {
  return relation.id;
}

export function componentPropBindingEvidenceIncomplete(
  bindingId: string,
  relationsByFrom: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  relationsByTo: ReadonlyMap<string, readonly EvidenceSlice["relations"][number][]>,
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number] | readonly EvidenceSlice["elements"][number][]>,
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  if ((gapsByFrom.get(bindingId) ?? []).length > 0) return true;
  const receivers = (relationsByFrom.get(bindingId) ?? []).filter((relation) =>
    relation.kind === "component-prop-binding",
  );
  for (const receiver of receivers) {
    cancellation.throwIfCancelled();
    if (hasGap(receiver.to, gapsByFrom)) return true;
    const fieldInputs = (relationsByTo.get(receiver.to) ?? []).filter((relation) => relation.kind === "field-input");
    for (const fieldInput of fieldInputs) {
      cancellation.throwIfCancelled();
      if (hasGap(fieldInput.from, gapsByFrom)) return true;
      const references = (relationsByTo.get(fieldInput.from) ?? []).filter((relation) =>
        relation.kind === "references"
          && exactBindingElement(elementsById, relation.from)?.kind === "parameter",
      );
      for (const reference of references) {
        cancellation.throwIfCancelled();
        if (hasGap(reference.from, gapsByFrom)) return true;
      }
    }
  }
  cancellation.throwIfCancelled();
  return false;
}

function exactBindingElement(
  elementsById: ReadonlyMap<string, EvidenceSlice["elements"][number] | readonly EvidenceSlice["elements"][number][]>,
  elementId: string,
): EvidenceSlice["elements"][number] | undefined {
  const value = elementsById.get(elementId);
  if (!value) return undefined;
  if ("length" in value) return value.length === 1 ? value[0] : undefined;
  return value;
}

function hasGap(
  elementId: string,
  gapsByFrom: ReadonlyMap<string, readonly EvidenceSlice["gaps"][number][]>,
): boolean {
  return (gapsByFrom.get(elementId) ?? []).length > 0;
}
