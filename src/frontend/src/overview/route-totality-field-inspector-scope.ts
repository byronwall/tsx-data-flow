import type { RouteTotality } from "../../../api/contracts";
import type { RouteInvestigationSelection } from "./route-investigation-selection";
import { fieldOriginFocusForOrigin, type RouteTotalityFieldOriginFocus } from "./route-totality-field-lineage-model";
import type { RouteTotalityFieldInspectorScope } from "./route-totality-field-inspector-model";

export function routeTotalityFieldInspectorScopeForSelection(
  totality: RouteTotality | null,
  selection: Exclude<RouteInvestigationSelection, null>,
  activeOrigin: RouteTotalityFieldOriginFocus | null,
): { origin: RouteTotalityFieldOriginFocus | null; scope: RouteTotalityFieldInspectorScope | null } {
  if (selection.target === "node" && selection.kind === "origin") {
    const origin = fieldOriginFocusForOrigin(totality, selection.recordId, selection.originRole);
    return { origin, scope: origin ? { kind: "origin" } : null };
  }
  if (selection.target === "node" && selection.kind === "occurrence") {
    return { origin: activeOrigin, scope: { kind: "occurrence", occurrenceId: selection.recordId } };
  }
  return { origin: activeOrigin, scope: activeOrigin ? { kind: "origin" } : null };
}
