import { describe, expect, it } from "vitest";
import {
  OVERVIEW_COLUMNS_KEY,
  readHiddenColumns,
  uniqueIds,
  writeHiddenColumns,
} from "../../src/frontend/src/client-state";

describe("Solid client state helpers", () => {
  it("deduplicates finding ids while preserving their order", () => {
    expect(uniqueIds(["F2", "", " F1 ", "F2"])).toEqual(["F2", "F1"]);
  });

  it("reads only known hidden columns", () => {
    const storage = {
      getItem: () => JSON.stringify({ fanout: true, unknown: false, old: true }),
    };
    expect([...readHiddenColumns(storage, ["fanout", "unknown"])]).toEqual([
      "fanout",
    ]);
  });

  it("falls back safely for malformed or unavailable storage", () => {
    expect(readHiddenColumns({ getItem: () => "{" }, ["fanout"]).size).toBe(0);
    expect(
      readHiddenColumns(
        {
          getItem: () => {
            throw new Error("denied");
          },
        },
        ["fanout"],
      ).size,
    ).toBe(0);
  });

  it("writes the compact legacy-compatible hidden-column shape", () => {
    let savedKey = "";
    let savedValue = "";
    writeHiddenColumns(
      {
        setItem: (key, value) => {
          savedKey = key;
          savedValue = value;
        },
      },
      new Set(["fanout", "unknown"]),
    );
    expect(savedKey).toBe(OVERVIEW_COLUMNS_KEY);
    expect(JSON.parse(savedValue)).toEqual({ fanout: true, unknown: true });
  });
});
