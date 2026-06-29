import { describe, expect, it } from "vitest";
import { REPORT_VIEWS } from "../../src/cli/args.mjs";
import {
  FILE_VIEWS,
  VIEW_LABELS,
  viewLabel,
} from "../../src/server/view-config.mjs";

describe("server view configuration", () => {
  it("returns configured labels and falls back to the raw view name", () => {
    expect(viewLabel("findings")).toBe("Findings");
    expect(viewLabel("unknown-view")).toBe("unknown-view");
  });

  it("keeps file tabs to current non-overview views sorted by label", () => {
    expect(FILE_VIEWS).toEqual(
      expect.arrayContaining(
        REPORT_VIEWS.filter((view) => view !== "overview"),
      ),
    );
    expect(FILE_VIEWS).toHaveLength(REPORT_VIEWS.length - 1);
    expect(FILE_VIEWS).not.toContain("overview");
    expect(FILE_VIEWS.map(viewLabel)).toEqual(
      [...FILE_VIEWS.map(viewLabel)].sort(),
    );
    for (const view of FILE_VIEWS) {
      expect(VIEW_LABELS[view], view).toBeDefined();
    }
  });
});
