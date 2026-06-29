import { describe, expect, it } from "vitest";
import {
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
} from "../../src/core.mjs";

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

describe("core facade exports", () => {
  it("keeps every current public export importable", () => {
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
