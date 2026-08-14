import type { TrajectoryGraphCamera } from "./trajectory-url-state";
import {
  sameRouteInvestigationSelection,
  type RouteInvestigationSelection,
} from "./route-investigation-selection";
import type { RouteTotalityEmphasis, RouteTotalityEmphasisMode } from "./route-totality-emphasis";

export type RouteTotalityGraphActions = {
  select: (selection: Exclude<RouteInvestigationSelection, null>) => void;
  selectFromInspector: (selection: Exclude<RouteInvestigationSelection, null>) => void;
  clearSelection: () => void;
  registerMark: (selectionId: string, element: SVGGElement) => void;
  reset: () => void;
  emphasize: (mode: RouteTotalityEmphasisMode) => void;
  clearEmphasis: () => void;
  isolate: () => void;
  restoreFullRoute: () => void;
};

export type RouteTotalityGraphActionOptions = {
  selection: () => RouteInvestigationSelection;
  emphasis: () => RouteTotalityEmphasis;
  setEmphasisMode: (mode: RouteTotalityEmphasisMode | null) => void;
  emitInvestigationState: (
    selection: RouteInvestigationSelection,
    isolated: boolean,
    camera?: TrajectoryGraphCamera | null,
  ) => void;
  markRefs: Map<string, SVGGElement>;
  focusFallback: () => void;
  resetCamera: () => void;
};

export function createRouteTotalityGraphActions(options: RouteTotalityGraphActionOptions): RouteTotalityGraphActions {
  const select = (next: Exclude<RouteInvestigationSelection, null>) => {
    const currentSelection = options.selection();
    const sameSelection = sameRouteInvestigationSelection(currentSelection, next);
    const nextSelection = sameSelection ? null : next;
    const intendedEmphasisMode = nextSelection?.target === "node" || nextSelection?.target === "edge" ? "both" : null;
    options.setEmphasisMode(intendedEmphasisMode);
    options.emitInvestigationState(nextSelection, false);
  };
  const selectFromInspector = (next: Exclude<RouteInvestigationSelection, null>) => {
    const intendedEmphasisMode = next.target === "node" || next.target === "edge" ? "both" : null;
    options.setEmphasisMode(intendedEmphasisMode);
    options.emitInvestigationState(next, false);
  };
  const clearSelection = () => {
    const current = options.selection();
    options.setEmphasisMode(null);
    options.emitInvestigationState(null, false);
    if (current) queueMicrotask(() => {
      const mark = options.markRefs.get(current.graphId);
      if (mark?.isConnected) {
        mark.focus();
      } else {
        options.focusFallback();
      }
    });
  };
  const emphasize = (mode: RouteTotalityEmphasisMode) => {
    const current = options.selection();
    if (!current || current.target === "context") {
      return;
    }
    options.setEmphasisMode(mode);
    options.emitInvestigationState(current, false);
  };
  const clearEmphasis = () => {
    options.setEmphasisMode(null);
    options.emitInvestigationState(options.selection(), false);
  };
  const isolate = () => {
    if (!options.emphasis().active || !options.emphasis().focusNodeIds.size) return;
    options.emitInvestigationState(options.selection(), true);
  };
  return {
    select,
    selectFromInspector,
    clearSelection,
    registerMark: (selectionId, element) => options.markRefs.set(selectionId, element),
    reset: options.resetCamera,
    emphasize,
    clearEmphasis,
    isolate,
    restoreFullRoute: () => options.emitInvestigationState(options.selection(), false),
  };
}
