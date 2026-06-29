import { describe, expect, it } from "vitest";
import {
  buildGoldenReport,
  fetchGoldenApiReportJson,
  renderGoldenMarkdownByView,
} from "../helpers/golden.mjs";

describe("golden output baseline", () => {
  it("matches --view all markdown output for the example fixture", async () => {
    const { args, report } = await buildGoldenReport();

    expect(renderGoldenMarkdownByView(report, args)).toMatchSnapshot();
  });

  it("matches the /api/report.json payload for the example fixture", async () => {
    expect(await fetchGoldenApiReportJson()).toMatchSnapshot();
  });
});
