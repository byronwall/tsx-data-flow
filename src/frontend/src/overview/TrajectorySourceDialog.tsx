import { For, Show, createEffect, createMemo, createResource, onCleanup, onMount } from "solid-js";
import { fetchSourceExcerpt } from "../api";
import {
  adjacentSourceTarget,
  groupSourceTargets,
  normalizeSourceTarget,
  normalizeSourceTargets,
  type SourceEvidenceTarget,
  type SourceTargetInput,
} from "./source-evidence-model";

export function TrajectorySourceDialog(props: {
  evidence: SourceTargetInput | null;
  evidenceList: readonly SourceTargetInput[];
  generation?: number;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const selected = createMemo(() => props.evidence ? normalizeSourceTarget(props.evidence) : null);
  const targets = createMemo(() => {
    const normalized = normalizeSourceTargets(props.evidenceList);
    const current = selected();
    return current && !normalized.some((target) => target.id === current.id) ? [current, ...normalized] : normalized;
  });
  const groups = createMemo(() => groupSourceTargets(targets()));
  const previous = createMemo(() => adjacentSourceTarget(targets(), selected(), -1));
  const next = createMemo(() => adjacentSourceTarget(targets(), selected(), 1));
  const sourceRequest = createMemo(() => {
    const target = selected();
    return target ? { target, generation: props.generation } : null;
  });
  const [source] = createResource(sourceRequest, (request) => fetchSourceExcerpt(request.target, request.generation));
  let modal!: HTMLDivElement;
  let closeButton!: HTMLButtonElement;
  let restoreTarget: HTMLElement | null = null;

  createEffect(() => {
    const target = selected();
    if (!target) {
      if (restoreTarget) queueMicrotask(() => {
        if (restoreTarget?.isConnected) restoreTarget.focus();
        restoreTarget = null;
      });
      return;
    }
    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && !modal?.contains(active)) restoreTarget = active;
    }
    queueMicrotask(() => closeButton?.focus());
  });

  onMount(() => {
    const keydown = (event: KeyboardEvent) => {
      if (selected() && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        props.onClose();
      }
    };
    document.addEventListener("keydown", keydown, true);
    onCleanup(() => document.removeEventListener("keydown", keydown, true));
  });

  const select = (target: SourceEvidenceTarget) => props.onSelect(target.id);
  const move = (direction: -1 | 1) => {
    const target = direction === -1 ? previous() : next();
    if (target) select(target);
  };
  const spanLabel = (target: SourceEvidenceTarget | null) => target
    ? `${target.span.startLine}:${target.span.startColumn}–${target.span.endLine}:${target.span.endColumn}`
    : "No source evidence selected";

  return <div ref={modal} class="trajectory-source-modal" hidden={!selected()} role="dialog" aria-modal="true" aria-label="Trajectory source evidence">
    <header>
      <div class="trajectory-source-heading"><span class="micro-label">Source evidence</span><strong>{selected()?.path ?? "No source evidence selected"}</strong><code>{spanLabel(selected())}</code></div>
      <div class="trajectory-source-actions"><button type="button" disabled={!previous()} onClick={() => move(-1)}>Previous</button><button type="button" disabled={!next()} onClick={() => move(1)}>Next</button><a class="btn" href={selected() ? `/file?path=${encodeURIComponent(selected()!.path)}#L${selected()!.span.startLine}` : "/file"}>Open full file</a><button ref={closeButton} type="button" aria-label="Close source evidence" onClick={() => props.onClose()}>×</button></div>
    </header>
    <nav class="trajectory-source-file-groups" aria-label="Source evidence files">
      <For each={groups()}>{(group) => <section><div class="trajectory-source-file-heading"><strong>{group.path}</strong><small>{group.targets.length} {group.targets.length === 1 ? "target" : "targets"}</small></div><div class="trajectory-source-targets"><For each={group.targets}>{(target) => <button type="button" classList={{ selected: target.id === selected()?.id }} aria-current={target.id === selected()?.id ? "true" : undefined} title={target.label} onClick={() => select(target)}><span>{target.span.startLine}</span><small>{target.kind ?? "source"}</small></button>}</For></div></section>}</For>
    </nav>
    <div class="trajectory-source-body">
      <Show when={!source.loading} fallback={<p>Loading source context…</p>}>
        <Show when={source()?.data} fallback={<p class="error">Unable to load the source excerpt.</p>}>
          {(data) => <>
            <div class="trajectory-source-meta"><span>{data().file.lineCount} lines in file</span><Show when={data().containingFunction}>{(fn) => <span>Containing {fn().kind}: <code>{fn().label}</code> · {fn().span.startLine}:{fn().span.startColumn}–{fn().span.endLine}:{fn().span.endColumn}</span>}</Show></div>
            <pre><For each={data().lines}>{(line) => <span classList={{ focus: line.focus }}><b>{line.number}</b><code>{line.text || " "}</code></span>}</For></pre>
          </>}
        </Show>
      </Show>
    </div>
  </div>;
}
