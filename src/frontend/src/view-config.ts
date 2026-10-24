import { REPORT_VIEWS, REPORT_VIEW_DEFINITIONS, reportViewLabel, type ReportView } from "../../api/report-views";
export type BrowserReportView = {
  [View in ReportView]: (typeof REPORT_VIEW_DEFINITIONS)[View]["disposition"] extends "merge" ? never : View;
}[ReportView];
export type FileView = Exclude<ReportView, "overview">;

export function labelFor(view: string | null | undefined): string {
  if (!view) return "";
  return Object.hasOwn(REPORT_VIEW_DEFINITIONS, view)
    ? reportViewLabel(view as ReportView)
    : view;
}

export const BROWSER_REPORT_VIEWS = REPORT_VIEWS.filter(
  (view): view is BrowserReportView => REPORT_VIEW_DEFINITIONS[view].disposition !== "merge",
);
export const FILE_VIEWS: FileView[] = REPORT_VIEWS.filter(
  (view): view is FileView => view !== "overview",
).sort((left, right) => labelFor(left).localeCompare(labelFor(right)));

export function isReportView(value: string | null): value is ReportView {
  return REPORT_VIEWS.includes(value as ReportView);
}
