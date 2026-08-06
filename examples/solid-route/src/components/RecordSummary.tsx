import type { RecordSummaryModel } from "../data/types";
import { MetricCard } from "./MetricCard";

export function RecordSummary(props: { summary: RecordSummaryModel }) {
  return (
    <aside aria-label="record summary">
      <MetricCard label="Visible records" value={props.summary.visibleCount} />
      <MetricCard label="Flagged records" value={props.summary.flaggedCount} />
    </aside>
  );
}
