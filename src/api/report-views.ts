export const REPORT_VIEW_DEFINITIONS = {
  overview: { label: "Overview report", disposition: "merge" },
  findings: { label: "Findings", disposition: "migrate" },
  "repeated-forks": { label: "Repeated forks", disposition: "merge" },
  "work-packets": { label: "Work packets", disposition: "migrate" },
  "fan-out": { label: "Fan-out", disposition: "migrate" },
  "fan-in": { label: "Fan-in", disposition: "migrate" },
  "path-families": { label: "Path families", disposition: "migrate" },
  "defensive-ledger": { label: "Defensive ledger", disposition: "migrate" },
  "prop-relay": { label: "Prop relay", disposition: "migrate" },
  "context-relay": { label: "Context relay", disposition: "migrate" },
  "boundary-report": { label: "Boundary report", disposition: "migrate" },
  junctions: { label: "Junctions", disposition: "merge" },
  "inline-preview": { label: "Inline preview", disposition: "merge" },
  "component-refs": { label: "References", disposition: "migrate" },
} as const;
export type ReportView = keyof typeof REPORT_VIEW_DEFINITIONS;
export const REPORT_VIEWS = Object.keys(REPORT_VIEW_DEFINITIONS) as ReportView[];
export function reportViewLabel(view: ReportView) { return REPORT_VIEW_DEFINITIONS[view].label; }
