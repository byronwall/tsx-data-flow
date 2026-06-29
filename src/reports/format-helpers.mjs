export function articleFor(text) {
  return /^[aeiou]/i.test(String(text)) ? "an" : "a";
}

export function wordsFromIdentifier(value) {
  return camelWords(value).map((word) => word.toLowerCase());
}

export function camelWords(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

export function camelCase(value) {
  const words = camelWords(value);
  if (words.length === 0) return "value";
  return [
    words[0].toLowerCase(),
    ...words
      .slice(1)
      .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()),
  ].join("");
}

export function pascalCase(value) {
  return camelWords(value)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

// Turn a source label into a plausible parameter name: the last identifier of a
// property chain (`props.profile` -> `profile`), else a safe fallback.
export function paramNameFor(label) {
  const segments = String(label)
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean);
  const last = segments[segments.length - 1];
  return last && /^[A-Za-z_$]/.test(last) ? last : "input";
}

// A plain-English verb for each operation kind, so the path reads as a sequence
// of actions ("read", "default", "compute", "helper", "format") instead of bare
// analyzer kinds. The exact kind vocabulary still lives in the
// transformation-ledger view for anyone who wants it.
const STEP_KIND_VERBS = {
  source: "source",
  "unknown-source": "source?",
  "property-read": "read",
  "optional-read": "read?",
  iteration: "iterate",
  fallback: "default",
  conditional: "compute",
  call: "helper",
  "object-pack": "pack",
  "object-spread": "spread",
  alias: "alias",
  template: "format",
  "solid-accessor": "memo",
  "jsx-sink": "render",
  literal: "literal",
  cycle: "cycle",
  unknown: "external",
};

export function stepVerb(kind) {
  return STEP_KIND_VERBS[kind] ?? (kind || "step");
}

// Collapse an expression/path-step/label to a single line and truncate on a
// token-ish boundary with a trailing ellipsis. The prose-renderer analogue of
// formatTableCell: no rendered expression should carry a raw newline or be cut
// mid-identifier without a `...` marker.
export function formatExpression(value, max = 100) {
  const collapsed = String(value).replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  const window = collapsed.slice(0, max);
  // Back off to the last non-identifier boundary so we don't slice mid-token,
  // but only if that keeps a reasonable amount of the text.
  const boundary = window.match(/^.*[^\p{L}\p{N}_$]/u);
  const cut =
    boundary && boundary[0].length >= max * 0.6 ? boundary[0].length : max;
  return `${collapsed.slice(0, cut).trimEnd()}…`;
}

// Collapse all whitespace to single spaces without truncating - used to compare
// a child sub-expression against its parent's text by substring.
export function collapse(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

// Render `full` as a snippet centered on `via` (the sub-expression that flowed
// in from the previous step), marking `via` with « » and trimming surrounding
// context with ellipses to fit `max`. Falls back to a plain truncation when
// `via` is absent, unlocatable, or spans essentially the whole expression.
export function focusSnippet(full, via, max) {
  if (!via) return formatExpression(full, max);
  const idx = full.indexOf(via);
  if (idx < 0 || (idx === 0 && via.length >= full.length)) {
    return formatExpression(full, max);
  }
  const before = full.slice(0, idx);
  const after = full.slice(idx + via.length);
  let viaShown = via;
  if (viaShown.length > max - 4) viaShown = `${viaShown.slice(0, max - 5)}…`;
  const budget = Math.max(8, max - viaShown.length - 2); // 2 for the guillemets
  const leftBudget = Math.ceil(budget / 2);
  const rightBudget = budget - leftBudget;
  const left =
    before.length > leftBudget
      ? `…${before.slice(before.length - leftBudget)}`
      : before;
  const right =
    after.length > rightBudget ? `${after.slice(0, rightBudget)}…` : after;
  return `${left}«${viaShown}»${right}`;
}
