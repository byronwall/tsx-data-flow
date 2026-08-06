import { For, Show } from "solid-js";
import { toRecordRowModel } from "../data/selectors";
import type { RecordItem } from "../data/types";

export function RecordTable(props: { records: readonly RecordItem[] }) {
  return (
    <section aria-labelledby="record-list-heading">
      <h2 id="record-list-heading">Records</h2>
      <Show
        when={props.records.length > 0}
        fallback={<p>No active records.</p>}
      >
        <ul>
          <For each={props.records}>
            {(record) => <RecordRow record={record} />}
          </For>
        </ul>
      </Show>
    </section>
  );
}

function RecordRow(props: { record: RecordItem }) {
  const row = toRecordRowModel(props.record);

  return (
    <li data-record-id={row.id}>
      <strong>{row.title}</strong>
      <span>{row.statusLabel}</span>
      <span>{row.scoreLabel}</span>
    </li>
  );
}
