import { describe, expect, it } from "vitest";
import { extractServerFlags } from "../../src/cli/server-flags.mjs";

describe("extractServerFlags", () => {
  it("removes server flags and keeps analyzer args in order", () => {
    expect(
      extractServerFlags([
        "--root",
        "examples/bad-ish-solid",
        "--port",
        "5000",
        "--host=0.0.0.0",
        "--open",
        "--scope",
        "Chart",
      ]),
    ).toEqual({
      server: { port: 5000, host: "0.0.0.0", open: true },
      rest: ["--root", "examples/bad-ish-solid", "--scope", "Chart"],
    });
  });

  it("ignores the pnpm script argument separator", () => {
    expect(
      extractServerFlags(["--", "--root", "examples/bad-ish-solid"]),
    ).toEqual({
      server: { port: 4317, host: "127.0.0.1", open: false },
      rest: ["--root", "examples/bad-ish-solid"],
    });
  });

  it("passes help through to analyzer parsing", () => {
    expect(extractServerFlags(["--help"])).toEqual({
      server: { port: 4317, host: "127.0.0.1", open: false },
      rest: ["--help"],
    });
  });
});
