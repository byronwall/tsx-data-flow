import { createEffect, createMemo, createSignal, type Accessor } from "solid-js";
import type { RouteDataDetail } from "../../../api/contracts";
import { projectHiddenComponentTopology } from "./hidden-component-projection";
import type { ComponentTopology } from "./component-topology-model";
import type { GenericUiMode } from "./trajectory-url-state";

export function createComponentTopologyPolicy(props: {
  detail: Accessor<RouteDataDetail>;
  topology: Accessor<ComponentTopology>;
  genericUiMode: Accessor<GenericUiMode | null>;
  revealResetKey: Accessor<string>;
  onGenericUiMode: (mode: GenericUiMode) => void;
}) {
  const effectiveGenericUiMode = createMemo<GenericUiMode>(() => props.genericUiMode() ?? (props.detail().hiddenComponentPolicy.enabledByDefault ? "hidden" : "all"));
  const [revealedComponentIds, setRevealedComponentIds] = createSignal<ReadonlySet<string>>(new Set<string>());
  const hiddenProjection = createMemo(() => projectHiddenComponentTopology(props.topology(), props.detail().hiddenComponentPolicy, { mode: effectiveGenericUiMode(), revealedComponentIds: revealedComponentIds() }));
  const allHiddenProjection = createMemo(() => projectHiddenComponentTopology(props.topology(), props.detail().hiddenComponentPolicy, { mode: "hidden" }));
  const setGenericUiMode = (mode: GenericUiMode) => {
    if (mode === "all") setRevealedComponentIds(new Set<string>());
    props.onGenericUiMode(mode);
  };
  const revealComponent = (componentId: string) => {
    if (!hiddenProjection().hiddenNodeIds.has(componentId)) return;
    setRevealedComponentIds((current) => new Set([...current, componentId]));
  };
  const hideComponentAgain = (componentId: string) => {
    setRevealedComponentIds((current) => {
      if (!current.has(componentId)) return current;
      const next = new Set(current);
      next.delete(componentId);
      return next;
    });
  };
  let previousRevealResetKey: string | null = null;
  createEffect(() => {
    const resetKey = props.revealResetKey();
    if (!resetKey || previousRevealResetKey === resetKey) return;
    previousRevealResetKey = resetKey;
    setRevealedComponentIds(new Set<string>());
  });
  createEffect(() => {
    if (effectiveGenericUiMode() === "all") setRevealedComponentIds(new Set<string>());
  });
  return {
    effectiveGenericUiMode,
    revealedComponentIds,
    hiddenProjection,
    allHiddenProjection,
    setGenericUiMode,
    revealComponent,
    hideComponentAgain,
  };
}
