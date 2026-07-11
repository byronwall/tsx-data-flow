export const REPORT_VIEWS = [
  "overview",
  "findings",
  "repeated-forks",
  "work-packets",
  "fan-out",
  "fan-in",
  "path-families",
  "defensive-ledger",
  "prop-relay",
  "context-relay",
  "boundary-report",
  "junctions",
  "inline-preview",
  "component-refs",
] as const;

export type ReportView = (typeof REPORT_VIEWS)[number];
export type FileView = Exclude<ReportView, "overview">;

const VIEW_LABELS: Record<ReportView, string> = {
  overview: "Overview report",
  findings: "Findings",
  "repeated-forks": "Repeated forks",
  "work-packets": "Work packets",
  "fan-out": "Fan-out",
  "fan-in": "Fan-in",
  "path-families": "Path families",
  "defensive-ledger": "Defensive ledger",
  "prop-relay": "Prop relay",
  "context-relay": "Context relay",
  "boundary-report": "Boundary report",
  junctions: "Junctions",
  "inline-preview": "Inline preview",
  "component-refs": "References",
};

export function labelFor(view: string | null | undefined): string {
  if (!view) return "";
  return Object.hasOwn(VIEW_LABELS, view)
    ? VIEW_LABELS[view as ReportView]
    : view;
}

export const FILE_VIEWS: FileView[] = REPORT_VIEWS.filter(
  (view: string): view is FileView => view !== "overview",
).sort((left, right) => labelFor(left).localeCompare(labelFor(right)));

export function isReportView(value: string | null): value is ReportView {
  return REPORT_VIEWS.includes(value as ReportView);
}
