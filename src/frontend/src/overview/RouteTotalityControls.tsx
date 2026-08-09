import type { GenericUiMode } from "./trajectory-url-state";

export type RouteTotalityControlsProps = {
  routePath: string;
  routeFile: string;
  fieldOriginLabel: string | null;
  zoomScale: number;
  genericUiMode: GenericUiMode;
  hiddenUiNodeCount: number;
  availableHiddenUiNodeCount: number;
  onGenericUiMode: (mode: GenericUiMode) => void;
  onClearFieldFocus: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onZoomIn: () => void;
};

export function RouteTotalityControls(props: RouteTotalityControlsProps) {
  const activateClearFieldFocus = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    props.onClearFieldFocus();
  };
  return <header class="route-totality-toolbar">
    <div class="route-totality-title">
      <strong class="route-totality-route-label">{props.routePath}</strong>
      <span class="route-totality-route-label">{props.routeFile}</span>
    </div>
    <div class="route-totality-field-focus" hidden={!props.fieldOriginLabel} aria-live="polite">
      <span>Fields from</span>
      <code title={props.fieldOriginLabel ?? ""}>{props.fieldOriginLabel ?? ""}</code>
      <button type="button" onClick={() => props.onClearFieldFocus()} onKeyDown={activateClearFieldFocus}>Clear field focus</button>
    </div>
    <div class="route-totality-toolbar-actions">
      <button
        type="button"
        class="route-totality-ui-toggle"
        aria-pressed={props.genericUiMode === "hidden"}
        disabled={props.availableHiddenUiNodeCount === 0}
        onClick={() => props.onGenericUiMode(props.genericUiMode === "hidden" ? "all" : "hidden")}
      >{props.genericUiMode === "hidden" ? `${props.hiddenUiNodeCount} UI internals hidden` : "Hide UI internals"}</button>
      <div class="route-totality-camera" role="group" aria-label="Route totality camera">
        <button type="button" aria-label="Zoom out route totality" onClick={() => props.onZoomOut()}>−</button>
        <button type="button" aria-label="Reset route totality zoom" onClick={() => props.onReset()}>{Math.round(props.zoomScale * 100)}%</button>
        <button type="button" aria-label="Zoom in route totality" onClick={() => props.onZoomIn()}>+</button>
        <button type="button" onClick={() => props.onReset()}>Reset</button>
      </div>
    </div>
  </header>;
}
