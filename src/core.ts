import type * as TypeScript from "typescript";
import type { AnalysisReport, AnalyzerArgs } from "./types";
import { REPORT_VIEWS, defaultMaxItemsFor, parseArgs } from "./cli/args";
import { buildReport } from "./analysis/report-builder";
import { selectViewPayload } from "./reports/json";
import { regenFooter } from "./reports/regen-footer";
import { renderCompareReport } from "./reports/compare";
import {
  renderMarkdownView,
  reportSummaryForCompare,
  stopRecommendationFor,
} from "./reports/markdown-views";
import {
  firstCutFor,
  hotspotGroups,
  modalValue,
} from "./reports/overview-selectors";
import { buildProgram } from "./project/typescript";
import { buildIdentityIndex } from "./analysis/identity";
import type { AnalyzerProgressReporter } from "./analysis/progress";

export async function analyzeProject(args: AnalyzerArgs) {
  const { ts, modulePath, program, routing } = buildProgram(args);
  return buildReport(ts, program, args, modulePath, routing);
}

// Build the TypeScript program once and hand back a reusable projector. Creating
// the program is the expensive part of analysis, so the server builds it a single
// time at startup and re-projects file-focused reports on demand (each `report()`
// call is a fresh graph trace, but skips program construction). `overrides` is
// merged onto the base args — typically `{ file: [path] }` or `{ scope }`.
export function createAnalyzer(args: AnalyzerArgs, reportProgress?: AnalyzerProgressReporter) {
  const { ts, modulePath, program, routing } = buildProgram(args, reportProgress);
  // The identity index scans every owned source file. Keep it generation-local
  // and reuse it for file/report projections instead of rebuilding the same
  // workspace-wide symbol map on every navigation.
  const identityIndex = buildIdentityIndex(ts, routing?.programs ?? [program], args.root, reportProgress);
  return {
    ts,
    program,
    args,
    identitiesForFile: (file: string) => identityIndex.evidenceForFile(file),
    report: (overrides: Partial<AnalyzerArgs> = {}) =>
      buildReport(ts, program, { ...args, ...overrides }, modulePath, routing, identityIndex, reportProgress),
  };
}

export function analyzeProgram(ts: typeof TypeScript, program: TypeScript.Program, args: Partial<AnalyzerArgs> = {}) {
  return buildReport(ts, program, {
    ...parseArgs([], { root: args.root ?? process.cwd(), source: args.source ?? process.cwd() }),
    ...args,
  });
}

export function renderReport(report: AnalysisReport, args: AnalyzerArgs) {
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
export function renderAllReports(report: AnalysisReport, args: AnalyzerArgs) {
  const extension = args.format === "json" ? "json" : "md";
  return REPORT_VIEWS.map((view: string) => {
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
