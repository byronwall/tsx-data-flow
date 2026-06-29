import { REPORT_VIEWS } from "./args.mjs";

export function helpText() {
  return `tsx-dataflow — render-path data-flow analyzer for TS/TSX projects

Usage:
  tsx-dataflow [options]

Options:
  --root <path>             Project root. Defaults to the current directory.
  --source <path>           Source root. Defaults to ./src (or ./app/src) when present.
  --tsconfig <path>         TypeScript config. Auto-discovered when omitted:
                            walks up from the source root, expands solution
                            files via their references, and (for reference-only
                            monorepos) scans subdirectories. A VALID tsconfig is
                            required — the analyzer errors out rather than run
                            with non-strict defaults (which break nullish
                            verdicts). Pass a concrete per-app config in a
                            monorepo, e.g. apps/web/tsconfig.json.
  --typescript-from <path>  Extra directory used to resolve TypeScript.
  --format <json|markdown>  Output format. Defaults to markdown.
  --view <name>             Report view, or "all" for every view. Defaults to work-packets.
  --scope <value>           Limit report to a file, component, or symbol substring.
  --file <pattern>          Limit report to matching files (path-only, glob-aware,
                            repeatable). Examples: src/components/Button.tsx,
                            Button.tsx, src/components, src/**/*.tsx. Combine with
                            --scope to dig into one file or region.
  --max-items <number>      Limit displayed findings or rows. Defaults to 20.
  --sort <mode>             Selection lens for work-packets/findings:
                            burden (default, worst-first), spread (diversity
                            caps), coverage (one per file then fill), or
                            quick-win (peripheral safe wins first).
  --spread                  Shorthand for --sort spread.
  --diversity <0..1>        MMR re-rank: 0 = pure burden, 1 = maximize spread.
                            Overrides --sort when set.
  --per-file <n>            Max packets from one file in spread mode (default 2).
  --per-feature <n>         Max packets from one feature in spread mode (default 4).
  --units                   Collapse file-local sinks that share a cause into
                            one work unit ("fix once, N sinks improve").
  --by <file|feature>       Hotspots roll-up granularity. Defaults to file.
  --baseline <path>         Compare against a prior JSON report.
  --compare <dir>           Compare this run against a prior --view all report directory.
  --fail-on-regression      Exit non-zero only when baseline comparison regresses.
  --out <path>              Write report to a file instead of stdout. With
                            --view all, names a directory to fill (one file per view).
  --include-tests           Include *.test.* and *.spec.* files.
  --no-trace-helpers        Stay single-file: do not follow imported helper calls
                            into their definitions (faster; F2/F3 backlinks and the
                            boundary-report/junctions/inline-preview views go dark).
  --max-helper-depth <n>    How many import boundaries to follow. Defaults to 2.
  --help                    Show this help.

Views:
  ${REPORT_VIEWS.join(", ")}

  all                       Generate every view above in one run. Pair with
                            --out <dir> to write one file per view, e.g.:
                              tsx-dataflow --root . --view all --out reports
`;
}
