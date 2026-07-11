import { REPORT_VIEWS, REPORT_VIEW_DEFINITIONS, reportViewLabel, type ReportView } from "../../api/report-views";
export type FileView = Exclude<ReportView, "overview">;

export function labelFor(view: string | null | undefined): string {
  if (!view) return "";
  return Object.hasOwn(REPORT_VIEW_DEFINITIONS, view)
    ? reportViewLabel(view as ReportView)
    : view;
}

export const FILE_VIEWS: FileView[] = REPORT_VIEWS.filter(
  (view: string): view is FileView => view !== "overview",
).sort((left, right) => labelFor(left).localeCompare(labelFor(right)));

export function isReportView(value: string | null): value is ReportView {
  return REPORT_VIEWS.includes(value as ReportView);
}
