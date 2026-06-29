import { commandPath } from "./markdown-format.mjs";

// A copy-pasteable command that regenerates exactly this report -- including the
// `--out` that lands it back in the same place on disk, so re-running overwrites
// the file rather than printing to stdout. Reports are often read detached from
// the shell that produced them, so each carries its own provenance command. Only
// non-default flags are emitted to keep it short.
//
// Two output shapes:
//   - single view written to a file: `--view <view> --out <file>`
//   - `--view all` written to a directory (regenAll): `--view all --out <dir>`,
//     which rebuilds every file in that directory (this one included).
export function regenCommand(args, view) {
  const regenAll = Boolean(args.regenAll);
  const parts = [
    "tsx-dataflow",
    "--root",
    shellQuote(commandPath(args.root)),
    "--view",
    view === "compare" ? args.view : regenAll ? "all" : view,
  ];
  // Always echo --max-items so it is obvious the cap is tunable. (In all-mode
  // this is the current view's cap; passing it back applies it to every view.)
  if (Number.isFinite(args.maxItems)) {
    parts.push("--max-items", String(args.maxItems));
  }
  if (args.scope) parts.push("--scope", shellQuote(args.scope));
  for (const pattern of args.file ?? []) {
    parts.push("--file", shellQuote(pattern));
  }
  // Echo selection lenses so a regenerated command reproduces the same spread.
  if (args.sort && args.sort !== "burden") parts.push("--sort", args.sort);
  if (args.diversity != null) parts.push("--diversity", String(args.diversity));
  if (args.perFile != null) parts.push("--per-file", String(args.perFile));
  if (args.perFeature != null) {
    parts.push("--per-feature", String(args.perFeature));
  }
  if (args.units) parts.push("--units");
  if (view === "overview" && args.by && args.by !== "file") {
    parts.push("--by", args.by);
  }
  if (args.format && args.format !== "markdown") {
    parts.push("--format", args.format);
  }
  if (args.compare) {
    parts.push("--compare", shellQuote(commandPath(args.compare)));
  }
  // args.out is the file (single view) or the directory (--view all); both are
  // resolved absolute, so render them relative to cwd for a clean command.
  if (args.out) parts.push("--out", shellQuote(commandPath(args.out)));
  return parts.join(" ");
}

export function regenFooter(args, view, report) {
  const lines = [
    "---",
    "",
    "_Regenerate this report:_",
    "",
    "```sh",
    regenCommand(args, view),
    "```",
    "",
  ];
  // Aggregate reports mix findings from many files. When more than one file is
  // still represented, point the reader at --file so they can re-run focused on
  // a single file or region rather than re-reading the whole spread.
  if (spansMultipleFiles(report)) {
    lines.push(
      "_Focus on one file or region:_ append `--file <path|glob>` (repeatable) — " +
        "e.g. `--file Button.tsx`, `--file src/components/Button.tsx`, or " +
        "`--file 'src/dashboard/**'`. Combine with `--scope` to target a symbol within it.",
      "",
    );
  }
  return lines.join("\n");
}

// How many distinct files the report's findings touch, used to decide whether a
// per-file focus hint is worth showing. Counts ranked sinks first (what most
// views list) and falls back to context-relay findings for relay-only reports.
export function spansMultipleFiles(report) {
  if (!report) return false;
  const files = new Set();
  for (const sink of report.rankings?.all ?? []) files.add(sink.file);
  if (files.size === 0) {
    for (const finding of report.contextRelay ?? []) {
      files.add(finding.parentFile);
      files.add(finding.childFile);
    }
  }
  return files.size > 1;
}

export function shellQuote(value) {
  const text = String(value);
  // Single-quote anything that isn't a safe bare token, escaping embedded quotes.
  return /^[A-Za-z0-9_./@:-]+$/.test(text)
    ? text
    : `'${text.replaceAll("'", "'\\''")}'`;
}
