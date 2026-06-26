// Source previews. Two shapes share one snippet builder:
//   - snippetBlockHtml: an always-visible excerpt (used in the code-map panel).
//   - peekReferences: rewrites every `path:line` reference in rendered report
//     HTML into a click-to-reveal popover showing the cited source lines.
// HTML is the reason this is possible at all — the Markdown reports can only
// name a location; here we can show the code it points at.
import { escapeHtml } from "./page.mjs";

// A window of lines around `line` (1-based), each tagged as the hit or context.
function snippetRows(sourceText, line, context) {
  const lines = String(sourceText).split("\n");
  if (!Number.isFinite(line) || line < 1) return [];
  const start = Math.max(1, line - context);
  const end = Math.min(lines.length, line + context);
  const rows = [];
  for (let n = start; n <= end; n += 1) {
    rows.push({ n, text: lines[n - 1] ?? "", hit: n === line });
  }
  return rows;
}

const gutterWidth = (rows) =>
  rows.length ? String(rows[rows.length - 1].n).length : 1;

// A line-numbered excerpt with the cited line highlighted. Rendered with
// span-only markup (no <pre>/<div>) so it is valid phrasing content and can be
// embedded inside a paragraph without the parser auto-closing the <p>. Each row
// is display:block (the visual line break); rows are joined with no newline so
// white-space:pre does not introduce blank lines between them.
export function snippetBlockHtml(sourceText, line, { context = 3 } = {}) {
  const rows = snippetRows(sourceText, line, context);
  if (!rows.length) return "";
  const width = gutterWidth(rows);
  const body = rows
    .map((row) => {
      const num = String(row.n).padStart(width, " ");
      const text = escapeHtml(row.text);
      const cls = row.hit ? "snip-row snip-hit" : "snip-row";
      return `<span class="${cls}"><span class="snip-ln">${num}</span> ${text}</span>`;
    })
    .join("");
  return `<span class="snip">${body}</span>`;
}

// Inline popover for a `path:line` reference embedded in prose/tables. The
// popover carries an "Open file" link so a reference is not just previewable but
// navigable — report findings can now reach their file page (transcript: the
// project-level findings were an inert markdown dump with no click-through).
function inlinePeekHtml(refText, sourceText, line, filePath) {
  const snippet = snippetBlockHtml(sourceText, line, { context: 3 });
  if (!snippet) return null; // no source resolved → leave the plain text alone
  const openLink = filePath
    ? `<a class="peek-open" href="/file?path=${encodeURIComponent(filePath)}${
        Number.isFinite(line) && line > 0 ? `#L${line}` : ""
      }">Open ${escapeHtml(filePath.split("/").pop())} ↗</a>`
    : "";
  return `<span class="peek"><button type="button" class="peek-label"><code>${escapeHtml(
    refText,
  )}</code></button><span class="peek-pop">${snippet}${openLink}</span></span>`;
}

export function sourceReferenceHtml(filePath, line, resolve) {
  const lineNo = Number.parseInt(line, 10);
  const refText =
    Number.isFinite(lineNo) && lineNo > 0 ? `${filePath}:${lineNo}` : filePath;
  if (!filePath || typeof resolve !== "function") return escapeHtml(refText);
  let source;
  try {
    source = resolve(filePath);
  } catch {
    source = null;
  }
  const widget = source
    ? inlinePeekHtml(refText, source, lineNo, filePath)
    : null;
  return widget ?? escapeHtml(refText);
}

// Matches root-relative `path/to/file.tsx:123` references.
const REF = /([A-Za-z0-9_./-]+\.(?:tsx|ts|jsx|js|mjs|cjs)):(\d+)/g;

// Rewrite every `path/to/file.tsx:123` reference in `html` into a click-to-reveal
// popover. This runs inside fenced <pre> blocks too (LINK-1: the user clicked a
// "line 30" inside a junction/inline-preview code block and could not navigate
// from it). The strict REF regex only matches a real `path.ext:line`, so the
// `F1:line` shorthand used inside some fenced blocks is left untouched.
// `resolve(path)` returns source text for a root-relative path, or null/""
// when unavailable.
export function peekReferences(html, resolve) {
  return String(html).replace(REF, (whole, filePath, lineText) => {
    let source;
    try {
      source = resolve(filePath);
    } catch {
      source = null;
    }
    if (!source) return whole;
    const widget = inlinePeekHtml(
      whole,
      source,
      Number.parseInt(lineText, 10),
      filePath,
    );
    return widget ?? whole;
  });
}
