import type {
  RecordItem,
  RecordRowModel,
  RecordSummaryModel,
} from "./types";

export function selectVisibleRecords(records: readonly RecordItem[]) {
  return records.filter((record) => record.status === "active");
}

export function toRecordRowModel(record: RecordItem): RecordRowModel {
  return {
    id: record.id,
    title: record.title,
    statusLabel: record.status === "active" ? "Active" : "Archived",
    scoreLabel: `${record.score}/100`,
  };
}

export function packRecordSummary(
  records: readonly RecordItem[],
): RecordSummaryModel {
  return {
    visibleCount: records.length,
    flaggedCount: records.filter((record) => record.score >= 80).length,
  };
}
