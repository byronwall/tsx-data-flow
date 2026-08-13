import { For, onCleanup, onMount, Show } from "solid-js";
import type { RouteDataInventory } from "../../../api/contracts";

type Source = RouteDataInventory["sources"][number];

export function TrajectorySourcePicker(props: {
  sources: Source[];
  selectedKey: string | null;
  selectedFieldPath: string | null;
  onSelect: (key: string | null) => void;
  onSelectField: (sourceKey: string, fieldPath: string) => void;
  onWarmSource?: (key: string) => void;
}) {
  const selected = () => props.sources.find((source) => source.key === props.selectedKey) ?? null;
  let details: HTMLDetailsElement | undefined;
  const choose = (key: string | null) => {
    props.onSelect(key);
    if (details) details.open = false;
  };
  const chooseField = (sourceKey: string, fieldPath: string) => {
    props.onSelectField(sourceKey, fieldPath);
    if (details) details.open = false;
  };
  const toggleWithKeyboard = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (details) details.open = !details.open;
  };
  onMount(() => {
    const dismiss = (event: PointerEvent) => {
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    };
    const dismissWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details?.open) {
        details.open = false;
        details.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissWithKeyboard);
    onCleanup(() => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismissWithKeyboard);
    });
  });
  return <details ref={details} class="trajectory-source-picker">
    <summary aria-label="Choose route data source" onKeyDown={toggleWithKeyboard}>
      <span>Data source</span>
      <Show when={selected()} fallback={<><strong>All sources</strong><small>Normal route topology</small></>}>{(source) => <>
        <strong>{source().label}</strong>
        <code>{sourceTypeLabel(source())}</code>
        <small>{props.selectedFieldPath ? `Field ${props.selectedFieldPath} · ` : ""}{source().consumerLabel ? `via ${source().consumerLabel} · ` : ""}{shortPath(source().file)}:{source().line} · {source().totalFields} fields</small>
      </>}</Show>
    </summary>
    <div class="trajectory-source-picker-popover">
      <header>
        <span><strong>Data sources on this route</strong><small>{props.sources.length} found</small></span>
        <p>Choose the concrete read value to follow through the topology.</p>
      </header>
      <button type="button" class="trajectory-source-none" classList={{ selected: !selected() }} aria-pressed={!selected()} onClick={() => choose(null)}>
        <span class="trajectory-source-kind">ALL</span>
        <span class="trajectory-source-identity"><strong>All sources</strong><code>Show the normal route topology</code></span>
        <small class="trajectory-source-count">No filter</small>
      </button>
      <Show when={props.sources.length} fallback={<p>No supported persistence reads were found for this route.</p>}>
        <For each={props.sources}>{(source) => <div class="trajectory-source-option" classList={{ selected: source.key === selected()?.key }} onPointerEnter={() => props.onWarmSource?.(source.key)}>
          <button type="button" class="trajectory-source-option-trigger" aria-pressed={source.key === selected()?.key} onFocus={() => props.onWarmSource?.(source.key)} onClick={() => choose(source.key)}>
            <span class={`trajectory-source-kind source-${source.kind}`}>{source.kind}</span>
            <span class="trajectory-source-identity"><strong>{source.consumerLabel ?? source.label}</strong><code>{source.consumerLabel ? `${source.label} · ` : ""}{shortPath(source.file)}:{source.line}</code></span>
            <small class="trajectory-source-count">{source.totalFields} {source.totalFields === 1 ? "field" : "fields"}</small>
          </button>
          <div class="trajectory-source-fields" aria-label={`Fields for ${source.consumerLabel ?? source.label}`}>
            <For each={source.fields}>{(field) => <button type="button" title={`Follow ${field.key}`} classList={{ selected: source.key === selected()?.key && field.key === props.selectedFieldPath }} aria-pressed={source.key === selected()?.key && field.key === props.selectedFieldPath} onFocus={() => props.onWarmSource?.(source.key)} onClick={() => chooseField(source.key, field.key)}>
              <code>{field.key}</code><small>{field.typeText}</small>
            </button>}</For>
          </div>
        </div>}</For>
      </Show>
    </div>
  </details>;
}

function sourceTypeLabel(source: Source) {
  const fields = source.fields.slice(0, 4).map((field) => field.key).join(", ");
  return fields ? `${fields}${source.fields.length > 4 ? ", …" : ""}` : "No named fields";
}
function shortPath(file: string) { return file.split("/").slice(-2).join("/"); }
