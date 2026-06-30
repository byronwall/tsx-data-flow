import { escapeHtml } from "./escape.mjs";

// Pick the highest-burden sink on a line to drive the gutter color.
export function dominantSink(sinks) {
  return sinks.reduce((worst, sink) =>
    (sink.scores?.burden ?? 0) > (worst.scores?.burden ?? 0) ? sink : worst,
  );
}

// Map a burden score (0..1, but typically 0..~0.8) to a heat hue: calm green
// for low burden through amber to red for the worst. Saturation/lightness are
// applied in CSS (theme-aware), so this only chooses the hue.
const BURDEN_HUE_SCALE = 0.7;
export function burdenHue(burden) {
  const t = Math.max(0, Math.min(1, (burden ?? 0) / BURDEN_HUE_SCALE));
  // 140 (green) -> 0 (red), passing through yellow/orange.
  return Math.round(140 - 140 * t);
}

// Char range [a, b) (0-based) that a sink's span occupies on `lineNo`, or null
// if it does not touch this line. Multi-line spans clamp to the line's extent.
export function spanPart(sink, lineNo) {
  const span = sink.span;
  if (!span || span.startLine === span.endLine) return "single";
  if (lineNo === span.startLine) return "start";
  if (lineNo === span.endLine) return "end";
  return "middle";
}

function rangeOnLine(sink, lineNo, lineLength) {
  const span = sink.span;
  if (!span) {
    return sink.line === lineNo
      ? { a: 0, b: lineLength, part: "single" }
      : null;
  }
  if (lineNo < span.startLine || lineNo > span.endLine) return null;
  const a = lineNo === span.startLine ? span.startColumn - 1 : 0;
  const b = lineNo === span.endLine ? span.endColumn - 1 : lineLength;
  const start = Math.max(0, Math.min(a, lineLength));
  const end = Math.max(start, Math.min(b, lineLength));
  return {
    a: start,
    b: end === start ? Math.min(start + 1, lineLength) : end,
    part: spanPart(sink, lineNo),
  };
}

// Split one source line into plain + clickable "hit" segments. Overlapping
// findings on the same characters merge into one hit that carries ALL their ids,
// so a single click can reveal every finding at that spot.
export function renderCodeLine(text, lineNo, lineSinks) {
  const ranges = [];
  for (const sink of lineSinks) {
    const r = rangeOnLine(sink, lineNo, text.length);
    if (r && r.b > r.a) ranges.push({ ...r, sink });
  }
  if (ranges.length === 0) return escapeHtml(text);

  // Sweep over unique boundaries; each segment owns whichever ranges cover it.
  const bounds = new Set([0, text.length]);
  for (const r of ranges) {
    bounds.add(r.a);
    bounds.add(r.b);
  }
  const points = [...bounds].sort((x, y) => x - y);
  let html = "";
  for (let i = 0; i < points.length - 1; i += 1) {
    const p = points[i];
    const q = points[i + 1];
    if (q <= p) continue;
    const slice = escapeHtml(text.slice(p, q));
    const covering = ranges.filter((r) => r.a <= p && r.b >= q);
    if (covering.length === 0) {
      html += slice;
      continue;
    }
    const ids = covering.map((r) => r.sink.id);
    const burden = Math.max(...covering.map((r) => r.sink.scores?.burden ?? 0));
    const parts = new Set(covering.map((r) => r.part));
    const spanClasses = [...parts].map((part) => `span-${part}`).join(" ");
    const part = parts.size === 1 ? [...parts][0] : "mixed";
    const title =
      covering.length > 1
        ? `${covering.length} findings: ${ids.join(", ")} · burden ${burden.toFixed(2)}`
        : `${ids[0]} · burden ${burden.toFixed(2)}`;
    html += `<span class="hit heat ${spanClasses}" data-findings="${escapeHtml(
      ids.join(","),
    )}" data-span-part="${escapeHtml(part)}" style="--bt:${burdenHue(
      burden,
    )}" title="${escapeHtml(title)}">${slice}</span>`;
  }
  return html;
}

// COMMENT-1: the "thinnest of highlighting" — dim `//` and `/* */` comments so
// the eye can skip them. Not a syntax highlighter: only comments are styled.
// `state.inBlock` carries an open block comment across lines; strings are
// respected so a `//` inside a string literal is not mistaken for a comment.
export function renderCommentLine(text, state) {
  let out = "";
  let buf = "";
  let cbuf = "";
  const flushCode = () => {
    if (buf) {
      out += escapeHtml(buf);
      buf = "";
    }
  };
  const flushComment = () => {
    if (cbuf) {
      out += `<span class="cmt">${escapeHtml(cbuf)}</span>`;
      cbuf = "";
    }
  };
  let str = null;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (state.inBlock) {
      const end = text.indexOf("*/", i);
      if (end === -1) {
        cbuf += text.slice(i);
        i = n;
      } else {
        cbuf += text.slice(i, end + 2);
        i = end + 2;
        state.inBlock = false;
      }
      continue;
    }
    if (str) {
      buf += ch;
      if (ch === "\\") {
        buf += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === str) str = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      flushComment();
      str = ch;
      buf += ch;
      i += 1;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === "//") {
      flushCode();
      cbuf += text.slice(i);
      i = n;
      continue;
    }
    if (two === "/*") {
      flushCode();
      const end = text.indexOf("*/", i + 2);
      if (end === -1) {
        cbuf += text.slice(i);
        i = n;
        state.inBlock = true;
      } else {
        cbuf += text.slice(i, end + 2);
        i = end + 2;
      }
      continue;
    }
    buf += ch;
    i += 1;
  }
  flushCode();
  flushComment();
  return out;
}

export function touchedLines(sink, maxLine) {
  const span = sink.span;
  const start = Math.max(1, span?.startLine ?? sink.line ?? 1);
  const end = Math.min(
    maxLine,
    Math.max(start, span?.endLine ?? sink.line ?? start),
  );
  const lines = [];
  for (let lineNo = start; lineNo <= end; lineNo += 1) lines.push(lineNo);
  return lines;
}
