import { For, Show, createSignal } from "solid-js";
import type { FindingDetail } from "../../../api/contracts";

type Usage = FindingDetail["identity"]["usages"][number];

export function SymbolUses(props: { usages: Usage[]; currentPath: string; jump: (line: number) => void }) {
  const [expanded, setExpanded] = createSignal(false);
  const barrelUses = () => props.usages.filter(isBarrelUse);
  const directUses = () => props.usages.filter((usage) => !isBarrelUse(usage));
  const visibleUses = () => directUses().length ? directUses() : props.usages;
  const canExpand = () => visibleUses().length > 4;

  return <Show when={visibleUses().length} fallback={<span class="meta">no project-local uses</span>}>
    <ul class="identity-locations symbol-uses" classList={{ expanded: expanded() }}>
      <For each={visibleUses()}>{(usage) => <li><UsageLink usage={usage} currentPath={props.currentPath} jump={props.jump} /></li>}</For>
    </ul>
    <Show when={canExpand()}>
      <button class="symbol-uses-toggle" type="button" aria-expanded={expanded()} onClick={() => setExpanded((value) => !value)}>
        {expanded() ? "Show fewer uses" : `Show all ${visibleUses().length} uses`}
      </button>
    </Show>
    <Show when={directUses().length && barrelUses().length}>
      <span class="symbol-uses-note meta">{barrelUses().length} barrel re-export {barrelUses().length === 1 ? "hop" : "hops"} collapsed</span>
    </Show>
  </Show>;
}

function UsageLink(props: { usage: Usage; currentPath: string; jump: (line: number) => void }) {
  const local = () => props.usage.path === props.currentPath;
  return <a href={local() ? `#L${props.usage.line}` : `/file?path=${encodeURIComponent(props.usage.path)}#L${props.usage.line}`}
    title={props.usage.path} onClick={(event) => { if (local()) { event.preventDefault(); props.jump(props.usage.line); } }}>
    <code>{local() ? `line ${props.usage.line}` : `${fileName(props.usage.path)}:${props.usage.line}`}</code>
  </a>;
}

function isBarrelUse(usage: Usage) {
  return /(?:^|\/)index\.[cm]?[jt]sx?$/.test(usage.path);
}

function fileName(path: string) {
  return path.split("/").at(-1) || path;
}
