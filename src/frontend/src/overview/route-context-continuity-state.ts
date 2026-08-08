import { createEffect, createMemo, createSignal, type Accessor } from "solid-js";
import type { RouteTotality } from "../../../api/contracts";
import type { RouteTotalityDisplayLayout } from "./route-totality-display-layout";
import type { RouteTotalityLayout } from "./route-totality-model";
import { resolveContextDisplayMode, type ContextDisplayMode } from "./route-context-continuity-density";
import {
  buildRouteContextContinuityIndex,
  contextMatchesFilter,
  isRenderableContextLink,
  type ContextNodeMark,
  type ContextStatusFilter,
  type ContextVisualLink,
  type ContextVisualRecord,
  type ContextVisualRelay,
  type RouteContextContinuityIndex,
} from "./route-context-continuity-index";

export type RouteContextContinuityVisual = {
  marks: readonly ContextNodeMark[];
  links: readonly ContextVisualLink[];
  relays: readonly ContextVisualRelay[];
  focusedId: string | null;
};

export type RouteContextContinuityUiState = {
  index: Accessor<RouteContextContinuityIndex>;
  filter: Accessor<ContextStatusFilter>;
  displayMode: Accessor<ContextDisplayMode>;
  focusedId: Accessor<string | null>;
  focused: Accessor<ContextVisualRecord | null>;
  visibleRecords: Accessor<readonly ContextVisualRecord[]>;
  visual: Accessor<RouteContextContinuityVisual>;
  setFilter: (filter: ContextStatusFilter) => void;
  setDisplayMode: (mode: ContextDisplayMode) => void;
  focus: (id: string) => void;
  clearFocus: () => void;
};

export function createRouteContextContinuityUiState(options: {
  totality: Accessor<RouteTotality | null>;
  layout: Accessor<RouteTotalityLayout>;
  displayLayout: Accessor<RouteTotalityDisplayLayout>;
  contextFocus?: string | null;
  onContextFocusChange?: (contextFocus: string | null) => void;
}): RouteContextContinuityUiState {
  const [filter, setFilterSignal] = createSignal<ContextStatusFilter>("all");
  const [displayMode, setDisplayMode] = createSignal<ContextDisplayMode>("automatic");
  const [focusedId, setFocusedId] = createSignal<string | null>(null);
  let routeKey: string | null = null;
  let syncingFromParent = false;
  const index = createMemo(() => buildRouteContextContinuityIndex(
    options.totality(),
    options.layout(),
    options.displayLayout(),
  ));
  const focused = createMemo(() => {
    const id = focusedId();
    return id ? index().recordsById.get(id) ?? null : null;
  });
  const visibleRecords = createMemo(() => index().records.filter((record) => (
    contextMatchesFilter(record, filter())
  )));
  const visual = createMemo<RouteContextContinuityVisual>(() => {
    const focusId = focusedId();
    const requestedMode = displayMode();
    const marks: ContextNodeMark[] = [];
    const records = visibleRecords();
    const links: ContextVisualLink[] = requestedMode === "overlay"
      ? records.flatMap((record) => record.links.filter(isRenderableContextLink))
      : [];
    if (requestedMode !== "overlay") {
      for (const record of records) {
        const focused = record.id === focusId;
        const mode = resolveContextDisplayMode({
          density: record.density,
          focused,
          override: requestedMode,
        }).mode;
        if (mode === "marks") marks.push(...record.marks);
        if (mode === "overlay") links.push(...record.links.filter(isRenderableContextLink));
      }
    }
    const relays = focusId
      ? (index().recordsById.get(focusId)?.relays ?? []).filter((relay) => relay.from && relay.to)
      : [];
    return Object.freeze({
      marks: Object.freeze(marks),
      links: Object.freeze(links),
      relays: Object.freeze([...relays]),
      focusedId: focusId,
    });
  });
  const setFocus = (next: string | null) => {
    const current = focusedId();
    if (current === next) return;
    setFocusedId(next);
    if (!syncingFromParent) options.onContextFocusChange?.(next);
  };

  const applyParentFocus = (requested: string | null) => {
    const valid = index().recordsById.has(requested);
    syncingFromParent = true;
    setFocus(valid ? requested : null);
    syncingFromParent = false;
    if (!valid && requested !== focusedId() && options.onContextFocusChange) {
      options.onContextFocusChange(null);
    }
  };

  createEffect(() => {
    const nextRouteKey = options.totality()?.route.key ?? null;
    if (routeKey !== null && routeKey !== nextRouteKey) {
      routeKey = nextRouteKey;
      setFocus(null);
      return;
    }
    routeKey = nextRouteKey;
    const controlledFocus = options.contextFocus;
    if (controlledFocus !== undefined) {
      applyParentFocus(controlledFocus ?? null);
      return;
    }
    const currentFocus = focusedId();
    if (currentFocus && !index().recordsById.has(currentFocus)) setFocus(null);
    if (!routeKey && currentFocus) setFocus(null);
  });

  const setFilter = (next: ContextStatusFilter) => {
    setFilterSignal(next);
    const current = focused();
    if (current && !contextMatchesFilter(current, next)) setFocus(null);
  };

  return {
    index,
    filter,
    displayMode,
    focusedId,
    focused,
    visibleRecords,
    visual,
    setFilter,
    setDisplayMode,
    focus: setFocus,
    clearFocus: () => setFocus(null),
  };
}
