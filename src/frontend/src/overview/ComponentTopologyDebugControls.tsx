import type { ComponentTopologyLayoutSettings } from "./component-topology-layout";

type NumericSetting = Exclude<keyof ComponentTopologyLayoutSettings, "separationPasses">;

export function ComponentTopologyDebugControls(props: {
  settings: ComponentTopologyLayoutSettings;
  copied: boolean;
  forcesVisible: boolean;
  editingPositions?: boolean;
  manualMoveCount?: number;
  onSetting: (key: NumericSetting, value: number) => void;
  onTick: (count: number) => void;
  onSeparate: () => void;
  onToggleForces: () => void;
  onToggleEditing?: () => void;
  onReset: () => void;
  onCopy: () => void;
}) {
  return <aside class="component-topology-debug" aria-label="Topology layout debug controls">
    <header><strong>Layout debug</strong><button type="button" aria-pressed={props.forcesVisible} onClick={() => props.onToggleForces()}>Forces</button><button type="button" onClick={() => props.onCopy()}>{props.copied ? "Copied" : "Copy state"}</button></header>
    <div class="component-topology-debug-actions">
      {props.onToggleEditing ? <button type="button" aria-pressed={props.editingPositions} onClick={() => props.onToggleEditing?.()}>{props.editingPositions ? "Done editing" : "Edit positions"}</button> : null}
      <button type="button" aria-label="Run one simulation tick" onClick={() => props.onTick(1)}>Tick +1</button>
      <button type="button" aria-label="Run ten simulation ticks" onClick={() => props.onTick(10)}>Run +10</button>
      <button type="button" aria-label="Run one separation pass" onClick={() => props.onSeparate()}>Separate +1</button>
      <button type="button" onClick={() => props.onReset()}>Reset</button>
    </div>
    <DebugRange label="Ticks" value={props.settings.simulationTicks} minimum={0} maximum={1000} step={1} onInput={(value) => props.onSetting("simulationTicks", value)} />
    <DebugRange label="Link distance" value={props.settings.targetLinkDistance} minimum={40} maximum={360} step={2} onInput={(value) => props.onSetting("targetLinkDistance", value)} />
    <DebugRange label="Mark gap" value={props.settings.markGap} minimum={0} maximum={40} step={1} onInput={(value) => props.onSetting("markGap", value)} />
    <DebugRange label="Collision" value={props.settings.collisionStrength} minimum={.2} maximum={4} step={.1} onInput={(value) => props.onSetting("collisionStrength", value)} />
    <DebugRange label="Fringe push" value={props.settings.fringeStrength} minimum={0} maximum={5} step={.1} onInput={(value) => props.onSetting("fringeStrength", value)} />
    <small>{props.editingPositions ? "Drag nodes to reposition" : `${props.onToggleEditing ? `${props.manualMoveCount ?? 0} manual ${(props.manualMoveCount ?? 0) === 1 ? "move" : "moves"} · ` : ""}${props.settings.separationPasses} separation ${props.settings.separationPasses === 1 ? "pass" : "passes"}`}{props.forcesVisible ? " · arrows show exact next-tick displacement (1:1)" : ""}</small>
  </aside>;
}

function DebugRange(props: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onInput: (value: number) => void;
}) {
  return <label>
    <span>{props.label}</span>
    <output>{formatValue(props.value)}</output>
    <input
      type="range"
      aria-label={props.label}
      min={props.minimum}
      max={props.maximum}
      step={props.step}
      value={props.value}
      onInput={(event) => props.onInput(event.currentTarget.valueAsNumber)}
    />
  </label>;
}

function formatValue(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}
