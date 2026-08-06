import {
  createEffect,
  createMemo,
  createResource,
  Show,
} from "solid-js";
import { RecordSummary } from "../components/RecordSummary";
import { RecordTable } from "../components/RecordTable";
import { RouteFrame } from "../components/RouteFrame";
import { ViewerCard } from "../components/ViewerCard";
import { loadRecords } from "../data/records";
import { packRecordSummary, selectVisibleRecords } from "../data/selectors";
import { loadViewer } from "../data/viewer";

export default function RecordsRoute() {
  const [records] = createResource(loadRecords);
  const [viewer] = createResource(loadViewer);
  const visibleRecords = createMemo(() =>
    selectVisibleRecords(records() ?? []),
  );
  const summary = createMemo(() => packRecordSummary(visibleRecords()));

  createEffect(() => {
    const visible = visibleRecords();
    if (!records.loading) console.info(`Viewed ${visible.length} active records`);
  });

  return (
    <RouteFrame title="Record review">
      <ViewerCard viewer={viewer()} />
      <Show when={!records.loading} fallback={<p>Loading records...</p>}>
        <RecordSummary summary={summary()} />
        <RecordTable records={visibleRecords()} />
      </Show>
    </RouteFrame>
  );
}
