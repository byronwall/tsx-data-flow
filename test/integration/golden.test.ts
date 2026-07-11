import { describe, expect, it } from "vitest";
import {
  buildGoldenReport,
  renderGoldenMarkdownByView,
} from "../helpers/golden";

describe("golden output baseline", () => {
  it("matches --view all markdown output for the example fixture", async () => {
    const { args, report } = await buildGoldenReport();

    expect(renderGoldenMarkdownByView(report, args)).toMatchSnapshot();
  });
});
