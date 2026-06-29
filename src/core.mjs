import { REPORT_VIEWS, defaultMaxItemsFor } from "./cli/args.mjs";
import { buildReport } from "./analysis/report-builder.mjs";
import { selectViewPayload } from "./reports/json.mjs";
import { regenFooter } from "./reports/regen-footer.mjs";
import { renderCompareReport } from "./reports/compare.mjs";
import {
  renderMarkdownView,
  reportSummaryForCompare,
  stopRecommendationFor,
} from "./reports/markdown-views.mjs";
import {
  entryTypeCountsByFile,
  fanOutEntriesForFile,
  fanOutEntriesGlobal,
  firstCutFor,
  hotspotGroups,
  modalValue,
} from "./reports/overview-selectors.mjs";
import { buildProgram } from "./project/typescript.mjs";

export { REPORT_VIEWS, parseArgs } from "./cli/args.mjs";
export { helpText } from "./cli/help.mjs";
export { renderMarkdownView } from "./reports/markdown-views.mjs";
export {
  entryTypeCountsByFile,
  fanOutEntriesForFile,
  fanOutEntriesGlobal,
  firstCutFor,
  hotspotGroups,
  modalValue,
} from "./reports/overview-selectors.mjs";

export async function analyzeProject(args) {
  const { ts, modulePath, program, routing } = buildProgram(args);
  return buildReport(ts, program, args, modulePath, routing);
}

// Build the TypeScript program once and hand back a reusable projector. Creating
// the program is the expensive part of analysis, so the server builds it a single
// time at startup and re-projects file-focused reports on demand (each `report()`
// call is a fresh graph trace, but skips program construction). `overrides` is
// merged onto the base args — typically `{ file: [path] }` or `{ scope }`.
export function createAnalyzer(args) {
  const { ts, modulePath, program, routing } = buildProgram(args);
  return {
    ts,
    program,
    args,
    report: (overrides = {}) =>
      buildReport(ts, program, { ...args, ...overrides }, modulePath, routing),
  };
}

export function analyzeProgram(ts, program, args = {}) {
  return buildReport(ts, program, {
    root: args.root ?? process.cwd(),
    source: args.source ?? process.cwd(),
    scope: args.scope ?? null,
    maxItems: args.maxItems ?? 20,
    baseline: args.baseline ?? null,
  });
}

export function renderReport(report, args) {
  if (args.compare) {
    return `${renderCompareReport(report, args, {
      reportSummaryForCompare,
      stopRecommendationFor,
    })}\n${regenFooter(args, "compare", report)}`;
  }
  if (args.format === "json") {
    return `${JSON.stringify(
      selectViewPayload(report, args, {
        hotspotGroups,
        modalValue,
        firstCutFor,
      }),
      null,
      2,
    )}\n`;
  }
  return `${renderMarkdownView(report, args)}\n${regenFooter(args, args.view, report)}`;
}

// Render every concrete report view from a single already-built report. The
// report is view-independent, so `--view all` analyzes once and projects each
// view, returning the bytes plus a per-view filename for directory output.
export function renderAllReports(report, args) {
  const extension = args.format === "json" ? "json" : "md";
  return REPORT_VIEWS.map((view) => {
    // Each view keeps its own per-view default cap unless --max-items was given.
    const maxItems = args.maxItemsExplicit
      ? args.maxItems
      : defaultMaxItemsFor(view);
    return {
      view,
      filename: `${view}.${extension}`,
      // regenAll marks the footer so each file in an --view all run regenerates
      // the whole set into the same --out directory, rather than just itself.
      text: renderReport(report, { ...args, view, maxItems, regenAll: true }),
    };
  });
}
