import { describe, expect, it } from "vitest";
import {
  peekReferences,
  snippetBlockHtml,
} from "../../src/html/source-peek.mjs";

describe("source peek", () => {
  const SRC = [
    "const a = 1;",
    "const b = 2;",
    "const c = 3;",
    "const d = 4;",
  ].join("\n");

  it("builds a span-only excerpt with the cited line highlighted", () => {
    const html = snippetBlockHtml(SRC, 2, { context: 1 });
    expect(html).toContain('<span class="snip">');
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("<div");
    expect(html).toContain('class="snip-row snip-hit"');
    // context window is lines 1..3, not line 4
    expect(html).toContain("const a = 1;");
    expect(html).toContain("const c = 3;");
    expect(html).not.toContain("const d = 4;");
  });

  it("rewrites path:line references into peek popovers, including inside <pre>", () => {
    const resolve = (p) => (p === "src/x.tsx" ? SRC : null);
    const html =
      "<p>see src/x.tsx:2 here</p><pre><code>src/x.tsx:3</code></pre>";
    const out = peekReferences(html, resolve);
    expect(out).toContain('<span class="peek">');
    expect(out).toContain("src/x.tsx:2");
    // LINK-1: references inside <pre>/fenced blocks are now clickable too — the
    // user clicked a "line N" inside a code block and could not navigate from it.
    expect(out).not.toContain("<pre><code>src/x.tsx:3</code></pre>");
    // two distinct references → two popovers
    expect(out.match(/class="peek"/g)?.length).toBe(2);
  });

  it("leaves references with no resolvable source as plain text", () => {
    const out = peekReferences("<p>src/missing.tsx:9</p>", () => null);
    expect(out).toBe("<p>src/missing.tsx:9</p>");
  });
});
