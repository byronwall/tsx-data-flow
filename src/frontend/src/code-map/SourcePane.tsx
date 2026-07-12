import { For, Show } from "solid-js";
import type { FilePage } from "../../../api/contracts";

export function SourcePane(props: {
  file: FilePage["file"];
  expressions: FilePage["expressionsById"];
  selectedId: string | null;
  jumpedLine: number | null;
  jumpPulseLine: number | null;
  pathLines: Set<number>;
  registerLine: (line: number, element: HTMLTableRowElement) => void;
  jump: (line: number) => void;
  select: (id: string) => void;
}) {
  return (
    <div class="source-pane">
      <table class="source" aria-label={`Source for ${props.file.path}`}>
        <tbody>
          <For each={props.file.lines}>{(line) => (
            <tr id={`L${line.number}`} data-line={line.number} ref={(element) => props.registerLine(line.number, element)}
              classList={{ "has-sink": line.annotations.length > 0, "on-path": props.pathLines.has(line.number), "jump-target": props.jumpedLine === line.number, "jump-pulse": props.jumpPulseLine === line.number }}>
              <td class="source-hits">
                <For each={line.annotations.filter((annotation) => annotation.kind !== "expression")}>{(annotation) => (
                  <button type="button" class={`source-hit hit-${annotation.kind}`}
                    classList={{ active: annotation.entityId === props.selectedId }}
                    title={`${annotation.kind} ${annotation.entityId}`}
                    style={{ "--heat": String(Math.min(1, Math.max(0.08, annotation.burden ?? 0.08))) }}
                    onClick={() => props.select(annotation.entityId)}>
                    <span class="sr-only">Select {annotation.kind} {annotation.entityId}</span>
                  </button>
                )}</For>
                <Show when={line.annotations.every((annotation) => annotation.kind === "expression")}><span class="source-hit-empty" /></Show>
              </td>
              <th class="ln"><a href={`#L${line.number}`} aria-label={`Go to line ${line.number}`} onClick={(event) => { event.preventDefault(); props.jump(line.number); }}>{line.number}</a></th>
              <td class="source-text"><code><SourceText text={line.text} annotations={line.annotations} expressions={props.expressions} selectedId={props.selectedId} select={props.select} /></code></td>
            </tr>
          )}</For>
        </tbody>
      </table>
    </div>
  );
}

function SourceText(props: { text: string; annotations: FilePage["file"]["lines"][number]["annotations"]; expressions: FilePage["expressionsById"]; selectedId: string | null; select: (id: string) => void }) {
  const ranges = () => {
    const candidates = props.annotations.filter((annotation) => (annotation.kind === "finding" || annotation.kind === "expression") && annotation.startColumn !== null && annotation.endColumn !== null)
      .map((annotation) => ({ annotation, start: Math.min(Math.max(0, annotation.startColumn! - 1), props.text.length), end: Math.min(Math.max(annotation.startColumn!, annotation.endColumn! - 1), props.text.length) }))
      .sort((left, right) => (left.end - left.start) - (right.end - right.start) || left.start - right.start);
    const selected: typeof candidates = [];
    for (const candidate of candidates) if (!selected.some((range) => candidate.start < range.end && candidate.end > range.start)) selected.push(candidate);
    return selected.sort((left, right) => left.start - right.start);
  };
  return <>{ranges().length ? renderRanges(props.text, ranges(), props.expressions, props.selectedId, props.select) : props.text || " "}</>;
}

function renderRanges(text: string, ranges: Array<{ annotation: FilePage["file"]["lines"][number]["annotations"][number]; start: number; end: number }>, expressions: FilePage["expressionsById"], selectedId: string | null, select: (id: string) => void) {
  const output = []; let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) output.push(text.slice(cursor, range.start));
    const expression = expressions[range.annotation.entityId];
    const title = expression ? `Inspect ${expression.focusText} · ${expression.typeText}` : `Inspect finding ${range.annotation.entityId}`;
    output.push(<button type="button" class="source-span" classList={{ active: range.annotation.entityId === selectedId, "source-expression": range.annotation.kind === "expression" }} title={title} aria-label={expression ? `Inspect ${expression.focusText}` : undefined} onClick={() => select(range.annotation.entityId)}>{text.slice(range.start, range.end) || " "}</button>);
    cursor = range.end;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output;
}
