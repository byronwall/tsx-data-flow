import { For, Show } from "solid-js";
import type { FilePage } from "../../../api/contracts";

export function SourcePane(props: {
  file: FilePage["file"];
  selectedId: string | null;
  pathLines: Set<number>;
  registerLine: (line: number, element: HTMLTableRowElement) => void;
  select: (id: string) => void;
}) {
  return (
    <div class="source-pane">
      <table class="source" aria-label={`Source for ${props.file.path}`}>
        <tbody>
          <For each={props.file.lines}>{(line) => (
            <tr id={`L${line.number}`} data-line={line.number} ref={(element) => props.registerLine(line.number, element)}
              classList={{ "has-sink": line.annotations.length > 0, "on-path": props.pathLines.has(line.number), selected: line.annotations.some((a) => a.entityId === props.selectedId) }}>
              <th class="ln"><a href={`#L${line.number}`}>{line.number}</a></th>
              <td class="source-text"><code><SourceText text={line.text} annotations={line.annotations} selectedId={props.selectedId} select={props.select} /></code></td>
              <td class="source-hits">
                <For each={line.annotations}>{(annotation) => (
                  <button type="button" class={`source-hit hit-${annotation.kind}`}
                    classList={{ active: annotation.entityId === props.selectedId }}
                    title={`${annotation.kind} ${annotation.entityId}`}
                    style={{ "--heat": String(Math.min(1, Math.max(0.08, annotation.burden ?? 0.08))) }}
                    onClick={() => props.select(annotation.entityId)}>
                    <span class="sr-only">Select {annotation.kind} {annotation.entityId}</span>
                  </button>
                )}</For>
                <Show when={line.annotations.length === 0}><span class="source-hit-empty" /></Show>
              </td>
            </tr>
          )}</For>
        </tbody>
      </table>
    </div>
  );
}

function SourceText(props: { text: string; annotations: FilePage["file"]["lines"][number]["annotations"]; selectedId: string | null; select: (id: string) => void }) {
  const hit = () => props.annotations.filter((annotation) => annotation.kind === "finding").sort((left, right) => (right.burden ?? 0) - (left.burden ?? 0))[0];
  const range = () => {
    const annotation = hit(); if (!annotation) return null;
    const start = annotation.startColumn === null ? 0 : Math.max(0, annotation.startColumn - 1);
    const end = annotation.endColumn === null ? props.text.length : Math.max(start + 1, annotation.endColumn - 1);
    return { annotation, start: Math.min(start, props.text.length), end: Math.min(end, props.text.length) };
  };
  return <Show when={range()} fallback={props.text || " "}>{(value) => <>{props.text.slice(0, value().start)}<button type="button" class="source-span" classList={{ active: value().annotation.entityId === props.selectedId }} onClick={() => props.select(value().annotation.entityId)}>{props.text.slice(value().start, value().end) || " "}</button>{props.text.slice(value().end)}</>}</Show>;
}
