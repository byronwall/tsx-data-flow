import { REPORT_VIEWS } from "../cli/args.mjs";

// Short human labels for the per-file view sections.
export const VIEW_LABELS = {
  // "Overview report" (not just "Overview") so it never collides with the homepage
  // "Overview" tab (the burden table); this is the agent-facing markdown summary.
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

export const viewLabel = (view) => VIEW_LABELS[view] ?? view;

// Report lists are presented alphabetically by label (the curated REPORT_VIEWS
// order is kept for the CLI `--view all` emission only). The `overview` report is a
// workspace-level summary (concentration, repair buckets, ...), so it is not a
// per-file tab -- it would be meaningless scoped to one file.
export const FILE_VIEWS = REPORT_VIEWS.filter(
  (view) => view !== "overview",
).sort((a, b) => viewLabel(a).localeCompare(viewLabel(b)));
