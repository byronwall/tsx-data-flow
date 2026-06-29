import path from "node:path";
import {
  findDefaultSource,
  findDefaultTsconfig,
} from "../project/discovery.mjs";

const VALID_FORMATS = new Set(["json", "markdown"]);
// The concrete report views, in the order `--view all` emits them.
export const REPORT_VIEWS = [
  // The orientation document first: it guides an agent to every other report and
  // carries the workspace aggregates (concentration, repair buckets, unknown edges).
  "overview",
  "findings",
  "repeated-forks",
  "work-packets",
  "fan-out",
  "fan-in",
  "path-families",
  "defensive-ledger",
  "prop-relay",
  "context-relay",
  "boundary-report",
  "junctions",
  "inline-preview",
  "component-refs",
];
// `all` is a meta-view: build the report once and emit every concrete view.
const ALL_VIEWS = "all";
// `coverage` is an accepted legacy alias, normalized to `overview` in parseArgs.
const VALID_VIEWS = new Set([...REPORT_VIEWS, ALL_VIEWS, "coverage"]);

// Selection lenses for the packet/finding views (Approach 6).
const VALID_SORTS = new Set(["burden", "spread", "coverage", "quick-win"]);

// Table-shaped views stay readable with more rows, so they default to a higher
// item cap than the long prose reports (findings, work-packets, …), which get
// noisy past a handful of entries. An explicit --max-items always wins.
const TABLE_VIEWS = new Set([
  "fan-out",
  "fan-in",
  "path-families",
  "defensive-ledger",
  "prop-relay",
  "context-relay",
  "boundary-report",
  "unknown-edges",
  "junctions",
  "hotspots",
]);
const DEFAULT_TABLE_MAX_ITEMS = 12;
const DEFAULT_REPORT_MAX_ITEMS = 5;

export function defaultMaxItemsFor(view) {
  return TABLE_VIEWS.has(view)
    ? DEFAULT_TABLE_MAX_ITEMS
    : DEFAULT_REPORT_MAX_ITEMS;
}

// Run as a global CLI, the analyzer is invoked from inside the target project,
// so the current working directory is the right default root.
const defaultRoot = process.cwd();

export function parseArgs(argv, defaults = {}) {
  const args = {
    root: defaults.root ?? defaultRoot,
    source: defaults.source ?? null,
    tsconfig: defaults.tsconfig ?? null,
    // Set when the user passes --tsconfig explicitly. Auto-discovery (walk-up +
    // solution-file expansion) only runs when this is false.
    tsconfigExplicit: defaults.tsconfigExplicit ?? false,
    typescriptFrom: defaults.typescriptFrom ?? null,
    format: defaults.format ?? "markdown",
    view: defaults.view ?? "work-packets",
    scope: defaults.scope ?? null,
    // Path-only, glob-aware filter (repeatable). Narrows every view to the
    // matching files so an agent can pull the full detail for one file/region.
    file: defaults.file ? [...defaults.file] : [],
    out: defaults.out ?? null,
    baseline: defaults.baseline ?? null,
    compare: defaults.compare ?? null,
    // Resolved per-view after parsing unless the caller/CLI sets it explicitly.
    maxItems: defaults.maxItems ?? null,
    maxItemsExplicit: defaults.maxItems != null,
    // Selection lens (Approach 6): how the packet/finding views pick from the
    // burden ranking. `burden` reproduces today's pure worst-first sort.
    sort: defaults.sort ?? "burden",
    // MMR diversification knob (Approach 2): 0 = pure burden, 1 = maximize
    // spread. Null means "off" (use --sort instead).
    diversity: defaults.diversity ?? null,
    // Hard diversity caps (Approach 1); null falls back to sane defaults only
    // when spread/coverage selection is active.
    perFile: defaults.perFile ?? null,
    perFeature: defaults.perFeature ?? null,
    // Collapse file-local sinks sharing a cause into one work unit (Approach 3).
    units: defaults.units ?? false,
    // Hotspots granularity (Approach 4): roll up by file or feature area.
    by: defaults.by ?? "file",
    includeTests: defaults.includeTests ?? false,
    failOnRegression: defaults.failOnRegression ?? false,
    // Follow first-party imported helper calls into their definition files so
    // render paths continue across module boundaries (and the F2/F3 backlinks,
    // boundary-report, junctions, and inline-preview views light up). On by
    // default; disable for the cheapest/fastest single-file runs.
    traceHelpers: defaults.traceHelpers ?? true,
    // Two import boundaries by default: descend into helpers a render path calls
    // directly and the first-party helpers *those* call (a render → format →
    // primitive chain is common). Bounded by the per-run cross-file budget so
    // cost stays controlled; deeper nesting branches combinatorially, so raise
    // beyond this deliberately.
    maxHelperDepth: defaults.maxHelperDepth ?? 2,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [name, inlineValue] = raw.split("=", 2);
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${raw}`);
      return argv[index];
    };

    switch (name) {
      case "--root":
        args.root = readValue();
        break;
      case "--source":
        args.source = readValue();
        break;
      case "--tsconfig":
        args.tsconfig = readValue();
        args.tsconfigExplicit = true;
        break;
      case "--typescript-from":
        args.typescriptFrom = readValue();
        break;
      case "--format":
        args.format = readValue();
        break;
      case "--view":
        args.view = readValue();
        break;
      case "--scope":
        args.scope = readValue();
        break;
      case "--file":
        args.file.push(readValue());
        break;
      case "--max-items":
        args.maxItems = Number.parseInt(readValue(), 10);
        args.maxItemsExplicit = true;
        break;
      case "--sort":
        args.sort = readValue();
        break;
      case "--spread":
        args.sort = "spread";
        break;
      case "--diversity":
        args.diversity = Number.parseFloat(readValue());
        break;
      case "--per-file":
        args.perFile = Number.parseInt(readValue(), 10);
        break;
      case "--per-feature":
        args.perFeature = Number.parseInt(readValue(), 10);
        break;
      case "--units":
        args.units = true;
        break;
      case "--by":
        args.by = readValue();
        break;
      case "--out":
        args.out = readValue();
        break;
      case "--baseline":
        args.baseline = readValue();
        break;
      case "--compare":
        args.compare = readValue();
        break;
      case "--include-tests":
        args.includeTests = true;
        break;
      case "--trace-helpers":
        args.traceHelpers = true;
        break;
      case "--no-trace-helpers":
        args.traceHelpers = false;
        break;
      case "--max-helper-depth":
        args.maxHelperDepth = Number.parseInt(readValue(), 10);
        break;
      case "--fail-on-regression":
        args.failOnRegression = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${raw}`);
    }
  }

  if (!VALID_FORMATS.has(args.format)) {
    throw new Error("--format must be json or markdown");
  }
  if (!VALID_VIEWS.has(args.view)) {
    throw new Error(
      `--view must be one of: ${Array.from(VALID_VIEWS).join(", ")}`,
    );
  }
  // `coverage` is a legacy alias for the hotspots roll-up, which now lives inside
  // the consolidated `overview` report.
  if (args.view === "coverage") args.view = "overview";
  if (!VALID_SORTS.has(args.sort)) {
    throw new Error(
      `--sort must be one of: ${Array.from(VALID_SORTS).join(", ")}`,
    );
  }
  if (args.by !== "file" && args.by !== "feature") {
    throw new Error("--by must be file or feature");
  }
  if (
    args.diversity != null &&
    (!Number.isFinite(args.diversity) ||
      args.diversity < 0 ||
      args.diversity > 1)
  ) {
    throw new Error("--diversity must be between 0 and 1");
  }
  for (const [flag, value] of [
    ["--per-file", args.perFile],
    ["--per-feature", args.perFeature],
  ]) {
    if (value != null && (!Number.isFinite(value) || value < 1)) {
      throw new Error(`${flag} must be a positive number`);
    }
  }
  if (args.maxItems == null) {
    args.maxItems = defaultMaxItemsFor(args.view);
  }
  if (!Number.isFinite(args.maxItems) || args.maxItems < 1) {
    throw new Error("--max-items must be a positive number");
  }
  if (!Number.isFinite(args.maxHelperDepth) || args.maxHelperDepth < 0) {
    throw new Error("--max-helper-depth must be a non-negative number");
  }

  args.root = path.resolve(args.root);
  args.source = args.source
    ? path.resolve(args.root, args.source)
    : findDefaultSource(args.root);
  args.tsconfig = args.tsconfig
    ? path.resolve(args.root, args.tsconfig)
    : findDefaultTsconfig(args.root, args.source);
  args.typescriptFrom = args.typescriptFrom
    ? path.resolve(args.root, args.typescriptFrom)
    : null;
  args.out = args.out ? path.resolve(process.cwd(), args.out) : null;
  args.baseline = args.baseline
    ? path.resolve(process.cwd(), args.baseline)
    : null;
  args.compare = args.compare
    ? path.resolve(process.cwd(), args.compare)
    : null;

  return args;
}
