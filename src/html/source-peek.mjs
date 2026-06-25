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

// Inline popover for a `path:line` reference embedded in prose/tables.
function inlinePeekHtml(refText, sourceText, line) {
  const snippet = snippetBlockHtml(sourceText, line, { context: 3 });
  if (!snippet) return null; // no source resolved → leave the plain text alone
  return `<span class="peek"><button type="button" class="peek-label"><code>${escapeHtml(
    refText,
  )}</code></button><span class="peek-pop">${snippet}</span></span>`;
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
    ? inlinePeekHtml(refText, source, lineNo)
    : null;
  return widget ?? escapeHtml(refText);
}

// Matches root-relative `path/to/file.tsx:123` references.
const REF = /([A-Za-z0-9_./-]+\.(?:tsx|ts|jsx|js|mjs|cjs)):(\d+)/g;

// Rewrite references in `html`, skipping anything inside <pre>…</pre> (fenced
// code such as the representative-path block, which already shows context and
// uses `F1:line` shorthand the regex would not match anyway). `resolve(path)`
// returns source text for a root-relative path, or null/"" when unavailable.
export function peekReferences(html, resolve) {
  // Split on <pre> blocks, keeping them as untouched delimiters.
  const parts = String(html).split(/(<pre[\s\S]*?<\/pre>)/);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part; // a <pre>…</pre> segment
      return part.replace(REF, (whole, filePath, lineText) => {
        let source;
        try {
          source = resolve(filePath);
        } catch {
          source = null;
        }
        if (!source) return whole;
        const widget = inlinePeekHtml(whole, source, Number.parseInt(lineText, 10));
        return widget ?? whole;
      });
    })
    .join("");
}
