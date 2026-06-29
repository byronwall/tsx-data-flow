import { describe, expect, it } from "vitest";
import {
  overviewHref,
  overviewState,
  paramHref,
} from "../../src/server/url-helpers.mjs";

describe("server URL helpers", () => {
  it("parses overview state with defaults and sanitizes invalid choices", () => {
    expect(overviewState(new URL("http://localhost/"))).toEqual({
      q: "",
      filter: "all",
      sort: "burden",
      page: 1,
      all: false,
    });
    expect(
      overviewState(
        new URL(
          "http://localhost/?q=%20Card%20&filter=nope&sort=nope&page=-5&all=1",
        ),
      ),
    ).toEqual({
      q: "Card",
      filter: "all",
      sort: "burden",
      page: 1,
      all: true,
    });
  });

  it("builds compact overview hrefs from state changes", () => {
    const state = {
      q: "",
      filter: "all",
      sort: "burden",
      page: 1,
      all: false,
    };

    expect(overviewHref(state)).toBe("/");
    expect(overviewHref(state, { filter: "findings" })).toBe(
      "/?filter=findings",
    );
    expect(overviewHref(state, { sort: "depth", page: 3 })).toBe(
      "/?sort=depth&page=3",
    );
    expect(overviewHref(state, { page: 3, all: true })).toBe("/?all=1");
  });

  it("overrides or removes query params without dropping unrelated state", () => {
    const url = new URL(
      "http://localhost/report?view=findings&sort=depth&page=2",
    );

    expect(paramHref(url, { sort: "burden", page: null })).toBe(
      "/report?view=findings&sort=burden",
    );
  });
});
