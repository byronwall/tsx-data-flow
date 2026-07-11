import { describe, expect, it } from "vitest";
import { REPORT_VIEWS, parseArgs } from "../../src/cli/args";
import { helpText } from "../../src/cli/help";
import {
  analyzeProgram,
  analyzeProject,
  createAnalyzer,
  renderAllReports,
  renderReport,
} from "../../src/core";
import {
  entryTypeCountsByFile,
  fanOutEntriesForFile,
  fanOutEntriesGlobal,
  firstCutFor,
  hotspotGroups,
  modalValue,
} from "../../src/reports/overview-selectors";
import {
  renderMarkdownView,
} from "../../src/reports/markdown-views";

const facadeExports = {
  REPORT_VIEWS,
  analyzeProgram,
  analyzeProject,
  createAnalyzer,
  entryTypeCountsByFile,
  fanOutEntriesForFile,
  fanOutEntriesGlobal,
  firstCutFor,
  helpText,
  hotspotGroups,
  modalValue,
  parseArgs,
  renderAllReports,
  renderMarkdownView,
  renderReport,
};

describe("public modules", () => {
  it("keeps every current public API importable from its defining module", () => {
    expect(Object.keys(facadeExports).sort()).toEqual([
      "REPORT_VIEWS",
      "analyzeProgram",
      "analyzeProject",
      "createAnalyzer",
      "entryTypeCountsByFile",
      "fanOutEntriesForFile",
      "fanOutEntriesGlobal",
      "firstCutFor",
      "helpText",
      "hotspotGroups",
      "modalValue",
      "parseArgs",
      "renderAllReports",
      "renderMarkdownView",
      "renderReport",
    ]);
    for (const [name, value] of Object.entries(facadeExports)) {
      expect(value, name).toBeDefined();
    }
  });
});
