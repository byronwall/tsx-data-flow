// A small Markdown → HTML converter for the *bounded* Markdown subset the
// analyzer's own renderers emit: ATX headings, blockquotes, GFM pipe tables,
// fenced code blocks (with variable-length backtick fences), bullet lists,
// horizontal rules, bold, and inline code. It is deliberately not a general
// CommonMark engine — it only needs to be correct for the markup produced in
// src/core.mjs, which keeps the project dependency-free.

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// Render inline markup (bold + inline code) within already-block-split text.
// Inline code is extracted first so its contents are never treated as markup,
// matching the way `code()` in core.mjs picks a backtick run longer than any
// run inside the value.
function renderInline(text) {
  const tokens = [];
  let rest = text;
  // Pull out inline code spans delimited by runs of one-or-more backticks.
  const codeSpan = /(`+)([\s\S]*?)\1/;
  while (rest.length) {
    const match = codeSpan.exec(rest);
    if (!match) {
      tokens.push({ type: "text", value: rest });
      break;
    }
    if (match.index > 0) {
      tokens.push({ type: "text", value: rest.slice(0, match.index) });
    }
    // GFM trims a single leading/trailing space inside a code span.
    tokens.push({ type: "code", value: match[2].replace(/^ | $/g, "") });
    rest = rest.slice(match.index + match[0].length);
  }
  return tokens
    .map((token) =>
      token.type === "code"
        ? `<code>${escapeHtml(token.value)}</code>`
        : formatEmphasis(token.value),
    )
    .join("");
}

// Bold (`**x**`) and links (`[text](url)`) on plain text, with everything else
// HTML-escaped. Applied only to non-code inline segments.
function formatEmphasis(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      (_, label, href) => `<a href="${href}">${label}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Emphasis: `*x*`, and `_x_` only when the underscores sit on a word
    // boundary, so intra-identifier underscores are left untouched.
    .replace(/\*([^*\s][^*]*?)\*/g, "<em>$1</em>")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
}

// Split a GFM table row into cells, honoring escaped pipes (`\|`).
function splitRow(line) {
  const cells = [];
  let current = "";
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\\" && line[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  // A leading/trailing pipe yields empty edge cells; drop them.
  if (cells.length && cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((cell) => cell.trim());
}

const isTableSeparator = (line) =>
  /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes("-");

const isTableRow = (line) => line.includes("|");

const isFence = (line) => /^\s*(`{3,}|~{3,})/.exec(line);

export function markdownToHtml(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const flushList = (items) => {
    if (!items.length) return;
    out.push("<ul>");
    for (const item of items) out.push(`<li>${renderInline(item)}</li>`);
    out.push("</ul>");
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — match the opening fence length so a longer run that
    // wraps embedded backticks closes only on an equal-or-longer fence.
    const fence = isFence(line);
    if (fence) {
      const marker = fence[1][0];
      const len = fence[1].length;
      const lang = line.slice(fence.index + fence[1].length).trim();
      const body = [];
      i += 1;
      while (i < lines.length) {
        const closing = new RegExp(`^\\s*${marker === "`" ? "`" : "~"}{${len},}\\s*$`);
        if (closing.test(lines[i])) {
          i += 1;
          break;
        }
        body.push(lines[i]);
        i += 1;
      }
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      out.push(`<pre><code${cls}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    // Horizontal rule (a bare `---`, not a table separator following a header).
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push("<hr>");
      i += 1;
      continue;
    }

    // GFM table: a header row immediately followed by a separator row.
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      out.push("<table>");
      out.push("<thead><tr>");
      for (const cell of header) out.push(`<th>${renderInline(cell)}</th>`);
      out.push("</tr></thead>");
      out.push("<tbody>");
      for (const row of rows) {
        out.push("<tr>");
        for (let c = 0; c < header.length; c += 1) {
          out.push(`<td>${renderInline(row[c] ?? "")}</td>`);
        }
        out.push("</tr>");
      }
      out.push("</tbody></table>");
      continue;
    }

    // Blockquote — collect consecutive `>`-prefixed lines, recurse on the body.
    if (/^\s*>/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${markdownToHtml(quoted.join("\n"))}</blockquote>`);
      continue;
    }

    // Bullet list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      flushList(items);
      continue;
    }

    // Blank line.
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Paragraph — gather until a blank line or a block starter.
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\s*>/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !isFence(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${renderInline(para.join(" "))}</p>`);
  }

  return out.join("\n");
}
