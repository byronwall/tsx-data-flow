import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const DEFAULT_IGNORED_PARTS = new Set([
  "node_modules",
  "dist",
  "build",
  ".solid",
  ".vinxi",
  ".output",
  "coverage",
  "styled-system",
]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
// Representation-only hops: steps that repackage a value without changing it
// (aliases, object packs/spreads). Tracked so the report can list exactly which
// transforms it counts, and deduped per sink so a shared hop isn't counted once
// per render sub-path that crosses it.
const REPRESENTATION_KINDS = new Set(["alias", "object-pack", "object-spread"]);
// Upper bound on enumerated reached-sinks stored per source, to keep the
// reachedVia structure from going O(n^2) on a very high fan-out source. The
// true count is kept separately so the UI can show "+N more".
const REACHED_VIA_CAP = 50;
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

function defaultMaxItemsFor(view) {
  return TABLE_VIEWS.has(view)
    ? DEFAULT_TABLE_MAX_ITEMS
    : DEFAULT_REPORT_MAX_ITEMS;
}

// --- Shape vocabulary (shared across path classification and sink families) ---
// Kept in one place so the geometry/style/control sets never drift between the
// path-shape classifier (Phase 1), fix suggestions (Phase 2), and sink-family
// grouping (Phase 3).

// Attributes that size the SVG/HTML shell itself. Split out from geometry so a
// plain width={...} is not lumped with bar-coordinate math when grouping sinks.
const SVG_SHELL_ATTRIBUTES = new Set(["width", "height", "viewBox", "viewbox"]);
// Per-element coordinate/shape attributes — the bar-geometry family.
const GEOMETRY_FAMILY_ATTRIBUTES = new Set([
  "transform",
  "x",
  "y",
  "cx",
  "cy",
  "d",
  "points",
  "r",
  "dx",
  "dy",
  "x1",
  "y1",
  "x2",
  "y2",
  "rx",
  "ry",
]);
const LOCAL_SCALAR_GEOMETRY_ATTRIBUTES = new Set([
  ...GEOMETRY_FAMILY_ATTRIBUTES,
  "stroke-dasharray",
  "strokeDasharray",
  "stroke-dashoffset",
  "strokeDashoffset",
]);
// The union is what "this path computes geometry" keys off of (Phase 1).
const GEOMETRY_ATTRIBUTES = new Set([
  ...SVG_SHELL_ATTRIBUTES,
  ...GEOMETRY_FAMILY_ATTRIBUTES,
]);
const STYLE_ATTRIBUTES = new Set(["class", "className", "style"]);
const CONTROL_FLOW_ATTRIBUTES = new Set(["when", "each", "fallback"]);
// Conventional prop names that a custom list/collection component uses to receive
// the iterable it renders one row per (`<RowList items={…}>{(row) => …}</RowList>`).
// When such a component takes a render-callback child, its parameter is an element
// of this prop — the same binding `<For each>` provides natively.
const RENDER_PROP_ITERABLE_ATTRIBUTES = new Set([
  "items",
  "each",
  "rows",
  "data",
  "list",
  "entries",
  "options",
]);
const IDENTITY_ATTRIBUTES = new Set([
  "id",
  "href",
  "xlink:href",
  "for",
  "name",
  "headers",
]);

// Calls/identifiers that are opaque *by design*, not because tracing failed.
// `unknown` must mean "we could not tell what this is" — a host method, a JS
// global, or a Solid framework primitive is fully known, so it is classified
// (and named with a concrete kind) rather than reported as an unresolved edge.

// Global namespace objects. As a call receiver (`Array.from`, `Object.entries`,
// `Math.round`) the call is a host call; as a bare identifier source they are
// the platform, not unresolved app state.
const JS_GLOBAL_NAMESPACES = new Set([
  "Array", "Object", "Math", "JSON", "Date", "Map", "Set", "WeakMap", "WeakSet",
  "Number", "String", "Boolean", "Symbol", "Promise", "RegExp", "Error", "Intl",
  "Reflect", "Proxy", "BigInt", "globalThis", "console", "window", "document",
  "localStorage", "sessionStorage", "navigator", "location", "history",
  "performance", "crypto", "URL", "URLSearchParams",
  // DOM constructors / host interfaces used as values, typically in an
  // `instanceof` guard (`x instanceof SVGElement`). They are platform globals,
  // not unresolved app state.
  "Element", "HTMLElement", "SVGElement", "Node", "Text", "Comment",
  "DocumentFragment", "Event", "EventTarget", "CustomEvent", "DOMRect",
  "File", "Blob", "FormData", "AbortController", "ResizeObserver",
  "IntersectionObserver", "MutationObserver",
]);
// Global functions invoked directly (`String(x)`, `Boolean(x)`, `parseInt(x)`).
const JS_GLOBAL_CALLS = new Set([
  "String", "Number", "Boolean", "Array", "Object", "Symbol", "BigInt",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
  "decodeURIComponent", "encodeURI", "decodeURI", "structuredClone",
]);
// Array / String / Map / Set prototype methods. As a call's method name these
// are host transformations — known operations, not unresolved helpers.
const JS_PROTOTYPE_METHODS = new Set([
  "map", "filter", "find", "findIndex", "findLast", "findLastIndex", "slice",
  "splice", "concat", "join", "split", "reduce", "reduceRight", "some", "every",
  "sort", "reverse", "forEach", "flat", "flatMap", "includes", "indexOf",
  "lastIndexOf", "at", "fill", "keys", "values", "entries", "push", "pop",
  "shift", "unshift", "trim", "trimStart", "trimEnd", "toUpperCase",
  "toLowerCase", "replace", "replaceAll", "match", "matchAll", "padStart",
  "padEnd", "startsWith", "endsWith", "repeat", "charAt", "charCodeAt",
  "codePointAt", "substring", "substr", "normalize", "toFixed", "toString",
  "toLocaleString", "valueOf", "has", "get", "set", "add", "delete",
  // ES2023 copying array methods.
  "toSorted", "toReversed", "toSpliced", "with", "group", "groupBy",
  // Common Date readers/formatters.
  "toISOString", "toJSON", "toDateString", "toTimeString", "toLocaleDateString",
  "toLocaleTimeString", "getTime", "getFullYear", "getMonth", "getDate",
  "getDay", "getHours", "getMinutes", "getSeconds", "getMilliseconds",
  "getTimezoneOffset", "toPrecision", "toExponential",
]);
// Solid framework primitives. These are intentional reactivity / feature-model
// boundaries; descending into them would erase the signal, so keep them opaque
// but classified (not flagged as unresolved). `useX` hooks are handled
// separately in traceCrossFileCall.
const SOLID_BUILTINS = new Set([
  "splitProps", "mergeProps", "createSignal", "createStore", "createMemo",
  "createResource", "createEffect", "createComputed", "createRenderEffect",
  "createSelector", "createRoot", "createDeferred", "createReaction",
  "children", "batch", "untrack", "on", "onMount", "onCleanup", "catchError",
  "reconcile", "produce", "unwrap", "mapArray", "indexArray", "from", "observable",
]);

// Decide whether a call that is not a same-file first-party function and did not
// resolve via cross-file descent is GENUINELY unresolved (`unknown: true`) or
// merely opaque-by-design (`unknown: false`). Host methods (`x.map()`), calls on
// a global namespace (`Array.from`, `Object.entries`), global functions
// (`String(x)`), and Solid primitives (`splitProps`) are all known operations —
// they are real path steps but not unresolved edges. The graph node kind stays
// "call" so the many downstream call-step consumers are unaffected.
function isOpaqueByDesignCall(ts, expression, callee) {
  const inner = expression.expression;
  if (ts.isPropertyAccessExpression(inner)) {
    const receiver = inner.expression;
    if (ts.isIdentifier(receiver) && JS_GLOBAL_NAMESPACES.has(receiver.text)) {
      return true;
    }
    return JS_PROTOTYPE_METHODS.has(callee);
  }
  if (ts.isIdentifier(inner)) {
    return SOLID_BUILTINS.has(callee) || JS_GLOBAL_CALLS.has(callee);
  }
  return false;
}

// After cross-file descent (`traceCrossFileCall`) declines a call, decide whether
// the un-descended callee is a GENUINE unresolved edge or an opaque-by-design
// boundary we can name. Resolving the callee symbol's declarations tells us which:
//
//   - declared in a `.d.ts` / `node_modules`  → host or library boundary (known):
//     `el.getTotalLength()`, `createListCollection()` (@ark-ui).
//   - a type-level property / parameter / signature / get-accessor with no
//     executable body → a reactive accessor read (known): `props.value()`,
//     `store.current()`, `context.getModelName()`. The value originates at the
//     prop/signal/context boundary, not a helper we can dissolve.
//   - a first-party `const x = factory(...)` callable → factory boundary (known):
//     `quantity = create_unit_formatter([...])`; no function body to follow.
//   - otherwise (a resolvable first-party function/method we simply failed to
//     descend, or a symbol that does not resolve at all — e.g. an import whose
//     module path the program could not map) → genuinely unknown (keep flagged).
//
// Returns a reason string when the call is a known boundary, or null to leave it
// flagged as an unresolved unknown edge.
function classifyUnresolvedCall(ts, checker, expression, crossFile) {
  if (!crossFile?.args) return null;
  const inner = expression.expression;
  const calleeIdent = ts.isIdentifier(inner)
    ? inner
    : ts.isPropertyAccessExpression(inner)
      ? inner.name
      : null;
  if (!calleeIdent) return null;
  let symbol;
  try {
    symbol = checker.getSymbolAtLocation(calleeIdent);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
  } catch {
    return null;
  }
  const declarations = symbol?.declarations ?? [];
  // No declaration at all — an unresolved/aliased import or a value the checker
  // could not pin down. This is the honest "we could not follow it" case.
  if (declarations.length === 0) return null;

  const isExternalDecl = (declaration) => {
    const file = declaration.getSourceFile();
    if (file.isDeclarationFile) return true;
    const relative = relativePath(crossFile.args.root, file.fileName);
    return relative.startsWith("..") || relative.includes("node_modules/");
  };
  if (declarations.every(isExternalDecl)) return "host-call";

  const hasFunctionInitializer = (declaration) =>
    declaration.initializer &&
    (ts.isArrowFunction(declaration.initializer) ||
      ts.isFunctionExpression(declaration.initializer));

  const isAccessorLike = (declaration) =>
    ts.isPropertySignature(declaration) ||
    ts.isMethodSignature(declaration) ||
    ts.isParameter(declaration) ||
    ts.isBindingElement(declaration) ||
    ts.isGetAccessorDeclaration(declaration) ||
    (ts.isPropertyDeclaration(declaration) &&
      !hasFunctionInitializer(declaration)) ||
    ts.isShorthandPropertyAssignment(declaration) ||
    (ts.isPropertyAssignment(declaration) &&
      !hasFunctionInitializer(declaration));
  if (declarations.every(isAccessorLike)) return "accessor-read";

  const isFactoryCallable = (declaration) =>
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer &&
    !hasFunctionInitializer(declaration);
  if (declarations.every(isFactoryCallable)) return "factory-callable";

  return null;
}

// Analyzer jargon and tidy-but-vague names that must never be suggested as code
// identifiers. Reports may use these words in prose; generated code names must
// describe the rendered thing instead (Taste #1/#4).
export const BANNED_SUGGESTION_IDENTIFIERS = [
  "pivot",
  "sinkData",
  "fanInResult",
  "transformedProps",
  "viewModel",
  "renderModel",
  "layout",
  "geometryModel",
  "renderValue",
  "selectedValue",
  "profileData",
  "ItemModel",
];
// This package's own directory (one level up from src/). Used as a last-resort
// location for resolving the bundled `typescript` dependency.
const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
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

export function findDefaultSource(root) {
  const source = path.join(root, "src");
  if (fs.existsSync(source)) return source;
  const appSource = path.join(root, "app", "src");
  if (fs.existsSync(appSource)) return appSource;
  return root;
}

// Best-effort, dependency-free guess at the governing tsconfig: the nearest
// tsconfig.json found walking up from the source root (then the project root).
// This is only a hint for meta/back-compat; the authoritative, type-aware
// resolution (solution-file expansion, multi-project monorepos, validation)
// happens in resolveProjectConfigs once TypeScript is loaded.
export function findDefaultTsconfig(root, sourceRoot) {
  return (
    walkUpForTsconfig(sourceRoot, root) ?? walkUpForTsconfig(root, root) ?? null
  );
}

// Ascend from startDir up to and including stopDir, returning the first
// tsconfig.json encountered (nearest wins).
function walkUpForTsconfig(startDir, stopDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, "tsconfig.json");
    if (fs.existsSync(candidate)) return candidate;
    if (dir === stopDir) return null;
    const parent = path.dirname(dir);
    if (dir === parent) return null;
    dir = parent;
  }
}

// Collect every tsconfig.json walking up from startDir to stopDir, nearest first.
function ascendCollectTsconfigs(startDir, stopDir) {
  const found = [];
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, "tsconfig.json");
    if (fs.existsSync(candidate)) found.push(candidate);
    if (dir === stopDir) break;
    const parent = path.dirname(dir);
    if (dir === parent) break;
    dir = parent;
  }
  return found;
}

// Scan downward under root for tsconfig.json files, skipping the usual build
// and dependency directories. Used as a fallback when nothing is found walking
// up — the common shape for solution-style monorepos whose only configs live in
// per-app/per-package subdirectories.
function scanDownForTsconfigs(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_PARTS.has(entry.name) || entry.name.startsWith("."))
          continue;
        walk(path.join(dir, entry.name));
      } else if (entry.name === "tsconfig.json") {
        out.push(path.join(dir, entry.name));
      }
    }
  };
  walk(root);
  return out;
}

// Parse one tsconfig and summarize what the analyzer needs: how many source
// files it governs, its (extends-resolved) compiler options, whether it is a
// reference-only "solution" file, and any parse error.
function inspectTsconfig(ts, file) {
  if (!fs.existsSync(file)) {
    return { file, exists: false, error: "file does not exist" };
  }
  const configFile = ts.readConfigFile(file, ts.sys.readFile);
  if (configFile.error) {
    return {
      file,
      exists: true,
      error: ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
    };
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(file),
    undefined,
    file,
  );
  const references = (parsed.projectReferences ?? []).map((ref) => ref.path);
  const strictNullChecks =
    parsed.options.strictNullChecks ?? parsed.options.strict ?? false;
  return {
    file,
    exists: true,
    error: null,
    options: parsed.options,
    fileNames: parsed.fileNames,
    references,
    strictNullChecks,
    // A solution/aggregator file contributes no sources of its own and only
    // points at referenced projects (e.g. `{ files: [], references: [...] }`).
    isSolution: parsed.fileNames.length === 0 && references.length > 0,
  };
}

// Resolve a project reference path (which TypeScript reports as either a
// directory or a concrete config file) to a tsconfig.json path.
function referenceToConfigPath(refPath) {
  try {
    if (fs.statSync(refPath).isDirectory()) {
      return path.join(refPath, "tsconfig.json");
    }
  } catch {
    return refPath;
  }
  return refPath;
}

// Authoritative, type-aware resolution of the tsconfig(s) that govern this run.
// Walks up from the source root, expands solution files through their project
// references, falls back to a downward scan for reference-only monorepos, and
// validates that at least one config actually governs source files. Throws a
// loud, actionable error when nothing valid can be found — we never silently
// analyze with default (non-strict) options, because that makes every nullish
// verdict unsound (optional props look non-nullable, so `?? x` reads as dead).
function resolveProjectConfigs(ts, args) {
  const attempts = [];
  const note = (file, status) =>
    attempts.push({ file: relativeTo(args.root, file), status });

  // Seed the search. An explicit --tsconfig anchors resolution (but is still
  // expanded if it turns out to be a solution file); otherwise discover.
  let seeds;
  if (args.tsconfigExplicit && args.tsconfig) {
    seeds = [args.tsconfig];
  } else {
    seeds = [
      ...ascendCollectTsconfigs(args.source, args.root),
      ...ascendCollectTsconfigs(args.root, args.root),
    ];
    if (seeds.length === 0) seeds = scanDownForTsconfigs(args.root);
  }

  const queue = [...new Set(seeds)];
  const visited = new Set();
  const valid = new Map();
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const info = inspectTsconfig(ts, file);
    if (!info.exists) {
      note(file, "not found");
      continue;
    }
    if (info.error) {
      note(file, `parse error: ${info.error}`);
      continue;
    }
    if (info.isSolution) {
      note(
        file,
        `solution file (no sources; ${info.references.length} project reference(s)) — expanding`,
      );
      for (const ref of info.references) queue.push(referenceToConfigPath(ref));
      continue;
    }
    if (info.fileNames.length === 0) {
      note(file, "valid but governs 0 source files — skipped");
      continue;
    }
    note(file, `governs ${info.fileNames.length} source file(s)`);
    valid.set(file, info);
  }

  if (valid.size === 0) {
    throw new Error(buildTsconfigFailureMessage(args, seeds, attempts));
  }

  // Pick the primary: prefer the config whose directory is the nearest ancestor
  // of the source root; otherwise the one governing the most files. The primary
  // supplies the program's compiler options (in these monorepos every project
  // extends one strict base, so options are uniform across the set).
  const configs = [...valid.values()];
  const primary = pickPrimaryConfig(configs, args.source);
  const looseConfigs = configs.filter((info) => !info.strictNullChecks);

  return {
    primary,
    configs,
    attempts,
    warnings: looseConfigs.map(
      (info) =>
        `tsconfig ${relativeTo(args.root, info.file)} has strictNullChecks disabled — ` +
        `nullish-defense verdicts (impossible/possible) for its files are unreliable, ` +
        `because optional properties are not modeled as \`| undefined\`.`,
    ),
  };
}

function pickPrimaryConfig(configs, sourceRoot) {
  // Among configs whose directory is an ancestor of the source root, the nearest
  // wins (that is the project that actually owns the source). Otherwise fall back
  // to whichever config governs the most files. Within each group, prefer a
  // strict (strictNullChecks) config: its options drive the whole program, and
  // strict is the runtime-truthful assumption — optional props really can be
  // undefined regardless of how loosely a sibling project is configured.
  const ancestors = configs.filter((info) =>
    isWithin(sourceRoot, path.dirname(info.file)),
  );
  const pool = ancestors.length > 0 ? ancestors : configs;
  const byDepth = (a, b) =>
    path.dirname(b.file).length - path.dirname(a.file).length;
  const byFiles = (a, b) => b.fileNames.length - a.fileNames.length;
  const tieBreak = ancestors.length > 0 ? byDepth : byFiles;
  return [...pool].sort((a, b) => {
    if (a.strictNullChecks !== b.strictNullChecks)
      return a.strictNullChecks ? -1 : 1;
    return tieBreak(a, b);
  })[0];
}

function relativeTo(root, file) {
  const rel = path.relative(root, file);
  return rel && !rel.startsWith("..") ? rel : file;
}

function buildTsconfigFailureMessage(args, seeds, attempts) {
  const lines = [
    "tsx-dataflow: could not resolve a valid tsconfig.json to type-check against.",
    "",
    "A valid tsconfig is REQUIRED: without one the type checker runs with default",
    "(non-strict) options, which silently disables strictNullChecks and makes every",
    "nullish-defense verdict unsound (optional props look non-nullable, so `x ?? y`",
    "is wrongly reported as a dead, type-impossible guard).",
    "",
    `  root:   ${args.root}`,
    `  source: ${args.source}`,
    args.tsconfigExplicit
      ? `  --tsconfig: ${args.tsconfig} (explicit)`
      : "  --tsconfig: (not supplied; attempted auto-discovery)",
    "",
    seeds.length
      ? "Candidates considered (walk-up from source/root, solution files expanded, then downward scan):"
      : "No tsconfig.json files were found by walk-up from the source root or by scanning under the project root.",
  ];
  for (const attempt of attempts) {
    lines.push(`  - ${attempt.file}: ${attempt.status}`);
  }
  lines.push(
    "",
    "How to fix:",
    "  • Point the analyzer at a concrete project tsconfig, e.g. for a monorepo app:",
    "      tsx-dataflow --root <repo> --tsconfig <repo>/path/to/app/tsconfig.json",
    "  • Or run it scoped to the app directory that owns the tsconfig:",
    "      tsx-dataflow --root <repo>/path/to/app",
    "  • Note: a solution/aggregator tsconfig (\"files\": [], only \"references\")",
    "    is not valid on its own — pass one of the referenced project configs.",
  );
  return lines.join("\n");
}

export function loadTypescript(args) {
  const bases = [
    args.typescriptFrom,
    args.tsconfig ? path.dirname(args.tsconfig) : null,
    args.source,
    path.join(args.root, "app"),
    args.root,
    process.cwd(),
    // Fall back to the analyzer's own dependency when the target project does
    // not ship its own TypeScript install.
    packageDir,
  ].filter(Boolean);

  const attempted = [];
  for (const base of unique(bases)) {
    try {
      const resolved = require.resolve("typescript", { paths: [base] });
      return { ts: require(resolved), modulePath: resolved };
    } catch {
      attempted.push(base);
    }
  }

  throw new Error(
    `Unable to resolve "typescript".\n` +
      `Tried:\n${attempted.map((base) => `  - ${base}`).join("\n")}\n` +
      `Install TypeScript in the target project ` +
      `(npm install -D typescript / pnpm add -D typescript / bun add -d typescript), ` +
      `or pass --typescript-from <path-to-a-dir-with-typescript-installed>.`,
  );
}

export function collectSourceFiles(ts, args) {
  const configs = args.tsconfigs?.length
    ? args.tsconfigs
    : args.tsconfig
      ? [args.tsconfig]
      : [];
  const set = new Set();
  for (const file of configs) {
    if (!fs.existsSync(file)) continue;
    const configFile = ts.readConfigFile(file, ts.sys.readFile);
    if (configFile.error) {
      const message = ts.flattenDiagnosticMessageText(
        configFile.error.messageText,
        "\n",
      );
      throw new Error(`Failed to read ${file}: ${message}`);
    }
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(file),
      undefined,
      file,
    );
    for (const sourceFile of parsed.fileNames) {
      if (shouldAnalyzeFile(sourceFile, args)) set.add(sourceFile);
    }
  }
  if (set.size > 0) return [...set];
  return walkFiles(args.source).filter((file) => shouldAnalyzeFile(file, args));
}

// Load TypeScript, resolve the governing tsconfig(s) (throwing loudly if none
// is valid), reflect the resolution onto `args` for downstream meta, and build
// the program once. Shared by analyzeProject and createAnalyzer.
function buildProgram(args) {
  const { ts, modulePath } = loadTypescript(args);
  const resolution = resolveProjectConfigs(ts, args);
  args.tsconfig = resolution.primary.file;
  args.tsconfigs = resolution.configs.map((config) => config.file);
  args.tsconfigWarnings = resolution.warnings;
  for (const warning of resolution.warnings) {
    console.warn(`tsx-dataflow: ${warning}`);
  }
  const files = new Set();
  for (const config of resolution.configs) {
    for (const sourceFile of config.fileNames) {
      if (shouldAnalyzeFile(sourceFile, args)) files.add(sourceFile);
    }
  }
  const program = ts.createProgram([...files], resolution.primary.options);
  const routing = buildProgramRouting(ts, resolution, args);
  return { ts, modulePath, program, routing };
}

// Configs that declare module path aliases (`paths`, e.g. `~/*`, `@app/*`)
// resolve their imports differently from the primary program's options. When a
// monorepo run spans several such configs whose aliases point at *different*
// roots, a single program cannot honor all of them, so an import like
// `import { helper } from "~/state"` fails to resolve and every call through it
// dead-ends as an unknown edge. Build a dedicated program per aliased config and
// route each analyzed file to the most-specific such config that governs it, so
// those imports resolve to their real declarations. Files no aliased config owns
// stay on the primary program. Returns null when no config declares aliases (the
// common single-project case), preserving the original single-program path.
function buildProgramRouting(ts, resolution, args) {
  const aliased = resolution.configs.filter(
    (config) =>
      config.options?.paths &&
      Object.keys(config.options.paths).length > 0 &&
      config.fileNames.some((file) => shouldAnalyzeFile(file, args)),
  );
  if (aliased.length === 0) return null;

  // Assign each analyzed file to the aliased config whose directory is its
  // nearest ancestor (longest matching prefix) — that is the project whose
  // `paths` actually govern the file's imports.
  const ownerConfig = new Map();
  for (const config of aliased) {
    const dir = path.dirname(config.file);
    for (const file of config.fileNames) {
      if (!shouldAnalyzeFile(file, args)) continue;
      const existing = ownerConfig.get(file);
      if (!existing || dir.length > path.dirname(existing.file).length) {
        ownerConfig.set(file, config);
      }
    }
  }

  const programByConfig = new Map();
  for (const config of aliased) {
    programByConfig.set(
      config.file,
      ts.createProgram(config.fileNames, config.options),
    );
  }
  const checkerByConfig = new Map();
  const checkerFor = (config) => {
    if (!checkerByConfig.has(config.file)) {
      checkerByConfig.set(
        config.file,
        programByConfig.get(config.file).getTypeChecker(),
      );
    }
    return checkerByConfig.get(config.file);
  };

  const byFile = new Map();
  for (const [file, config] of ownerConfig) {
    byFile.set(file, {
      configFile: config.file,
      program: programByConfig.get(config.file),
      checker: checkerFor(config),
    });
  }
  return { byFile, programs: [...programByConfig.values()] };
}

export async function analyzeProject(args) {
  const { ts, modulePath, program, routing } = buildProgram(args);
  return buildReport(ts, program, args, modulePath, routing);
}

// Build the TypeScript program once and hand back a reusable projector. Creating
// the program is the expensive part of analysis, so the server builds it a single
// time at startup and re-projects file-focused reports on demand (each `report()`
// call is a fresh graph trace, but skips program construction). `overrides` is
// merged onto the base args — typically `{ file: [path] }` or `{ scope }`.
export function createAnalyzer(args) {
  const { ts, modulePath, program, routing } = buildProgram(args);
  return {
    ts,
    program,
    args,
    report: (overrides = {}) =>
      buildReport(ts, program, { ...args, ...overrides }, modulePath, routing),
  };
}

export function analyzeProgram(ts, program, args = {}) {
  return buildReport(ts, program, {
    root: args.root ?? process.cwd(),
    source: args.source ?? process.cwd(),
    scope: args.scope ?? null,
    maxItems: args.maxItems ?? 20,
    baseline: args.baseline ?? null,
  });
}

export function renderReport(report, args) {
  if (args.compare) {
    return `${renderCompareReport(report, args)}\n${regenFooter(args, "compare", report)}`;
  }
  if (args.format === "json") {
    return `${JSON.stringify(selectViewPayload(report, args), null, 2)}\n`;
  }
  return `${renderMarkdownView(report, args)}\n${regenFooter(args, args.view, report)}`;
}

export function renderMarkdownView(report, args) {
  switch (args.view) {
    case "overview":
      return renderOverviewReport(report, args);
    case "findings":
      return renderFindings(report, args);
    case "repeated-forks":
      return renderRepeatedForks(report, args);
    case "work-packets":
      return renderWorkPackets(report, args);
    case "fan-out":
      return renderFanOut(report, args);
    case "fan-in":
      return renderFanIn(report, args);
    case "path-families":
      return renderPathFamilies(report, args);
    case "defensive-ledger":
      return renderDefensiveLedger(report, args);
    case "prop-relay":
      return renderPropRelay(report, args);
    case "context-relay":
      return renderContextRelay(report, args);
    case "boundary-report":
      return renderBoundaryReport(report, args);
    case "component-refs":
      return renderComponentRefs(report, args);
    case "junctions":
      return renderJunctions(report, args);
    case "inline-preview":
      return renderInlinePreview(report, args);
    default:
      return renderWorkPackets(report, args);
  }
}

export async function writeReport(reportText, outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, reportText);
}

// Render every concrete report view from a single already-built report. The
// report is view-independent, so `--view all` analyzes once and projects each
// view, returning the bytes plus a per-view filename for directory output.
export function renderAllReports(report, args) {
  const extension = args.format === "json" ? "json" : "md";
  return REPORT_VIEWS.map((view) => {
    // Each view keeps its own per-view default cap unless --max-items was given.
    const maxItems = args.maxItemsExplicit
      ? args.maxItems
      : defaultMaxItemsFor(view);
    return {
      view,
      filename: `${view}.${extension}`,
      // regenAll marks the footer so each file in an --view all run regenerates
      // the whole set into the same --out directory, rather than just itself.
      text: renderReport(report, { ...args, view, maxItems, regenAll: true }),
    };
  });
}

// Write each rendered report into `outDir` under its per-view filename. Returns
// the list of paths written.
export async function writeAllReports(reports, outDir) {
  const written = [];
  for (const report of reports) {
    const target = path.join(outDir, report.filename);
    await writeReport(report.text, target);
    written.push(target);
  }
  return written;
}

// A copy-pasteable command that regenerates exactly this report — including the
// `--out` that lands it back in the same place on disk, so re-running overwrites
// the file rather than printing to stdout. Reports are often read detached from
// the shell that produced them, so each carries its own provenance command. Only
// non-default flags are emitted to keep it short.
//
// Two output shapes:
//   - single view written to a file: `--view <view> --out <file>`
//   - `--view all` written to a directory (regenAll): `--view all --out <dir>`,
//     which rebuilds every file in that directory (this one included).
function regenCommand(args, view) {
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
  if (Number.isFinite(args.maxItems))
    parts.push("--max-items", String(args.maxItems));
  if (args.scope) parts.push("--scope", shellQuote(args.scope));
  for (const pattern of args.file ?? [])
    parts.push("--file", shellQuote(pattern));
  // Echo selection lenses so a regenerated command reproduces the same spread.
  if (args.sort && args.sort !== "burden") parts.push("--sort", args.sort);
  if (args.diversity != null) parts.push("--diversity", String(args.diversity));
  if (args.perFile != null) parts.push("--per-file", String(args.perFile));
  if (args.perFeature != null)
    parts.push("--per-feature", String(args.perFeature));
  if (args.units) parts.push("--units");
  if (view === "overview" && args.by && args.by !== "file")
    parts.push("--by", args.by);
  if (args.format && args.format !== "markdown")
    parts.push("--format", args.format);
  if (args.compare)
    parts.push("--compare", shellQuote(commandPath(args.compare)));
  if (args.includeTests) parts.push("--include-tests");
  // args.out is the file (single view) or the directory (--view all); both are
  // resolved absolute, so render them relative to cwd for a clean command.
  if (args.out) parts.push("--out", shellQuote(commandPath(args.out)));
  return parts.join(" ");
}

function commandPath(targetPath) {
  const relative = path.relative(process.cwd(), targetPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative))
    return relative;
  if (relative === "") return ".";
  return targetPath;
}

function regenFooter(args, view, report) {
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
function spansMultipleFiles(report) {
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

function shellQuote(value) {
  const text = String(value);
  // Single-quote anything that isn't a safe bare token, escaping embedded quotes.
  return /^[A-Za-z0-9_./@:-]+$/.test(text)
    ? text
    : `'${text.replaceAll("'", "'\\''")}'`;
}

function buildReport(ts, program, args, typescriptModulePath = null, routing = null) {
  const checker = program.getTypeChecker();
  const graph = createGraph(args.root);
  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isDeclarationFile)
    .filter((sourceFile) => shouldAnalyzeFile(sourceFile.fileName, args));
  const sinks = [];

  // Shared cross-file state: a static catalog of first-party functions, a
  // per-file context cache, and the set of functions actually reached while
  // tracing render paths. Built before tracing so descent can consult it.
  const crossFile = {
    args,
    contextCache: new Map(),
    catalog: new Map(),
    reached: new Set(),
    // Hard safety cap on total cross-file descents per report, so a pathological
    // call graph can't run the graph out of memory regardless of depth.
    budget: 20000,
  };

  const forks = [];
  // Trace each file exactly once. When a file is owned by an aliased config (see
  // buildProgramRouting), use that config's program/checker so its path-alias
  // imports resolve; otherwise use the primary program. Nodes and the checker
  // that resolves them must come from the same program, so owned files are traced
  // from their owner program's SourceFile objects.
  const traced = new Set();
  const traceFile = (sourceFile, useChecker) => {
    if (sourceFile.isDeclarationFile) return;
    if (!shouldAnalyzeFile(sourceFile.fileName, args)) return;
    if (traced.has(sourceFile.fileName)) return;
    traced.add(sourceFile.fileName);
    const analysis = analyzeSourceFile(
      ts,
      useChecker,
      graph,
      sourceFile,
      args,
      crossFile,
    );
    sinks.push(...analysis.sinks);
    forks.push(...analysis.forks);
  };
  if (routing) {
    for (const ownerProgram of routing.programs) {
      for (const sourceFile of ownerProgram.getSourceFiles()) {
        const owned = routing.byFile.get(sourceFile.fileName);
        if (owned && owned.program === ownerProgram) {
          traceFile(sourceFile, owned.checker);
        }
      }
    }
  }
  for (const sourceFile of sourceFiles) {
    traceFile(sourceFile, checker);
  }

  const fileMatch = makeFileMatcher(args.file);
  const scopedSinks = applyScope(sinks, args.scope);
  const filteredSinks = fileMatch
    ? scopedSinks.filter((sink) => fileMatch(sink.file))
    : scopedSinks;
  groundReachability(filteredSinks);
  const scopedRelay = applyContextRelayScope(
    analyzeContextRelay(ts, sourceFiles, args.root),
    args.scope,
  );
  const contextRelay = fileMatch
    ? scopedRelay.filter(
        (finding) =>
          fileMatch(finding.parentFile) || fileMatch(finding.childFile),
      )
    : scopedRelay;
  const packGroups = computePackGroups(filteredSinks);
  applyPackEvidence(filteredSinks, packGroups);
  const rankings = rankSinks(
    filteredSinks.filter(
      (sink) => sink.category !== "event-handler" && !isConstantSink(sink),
    ),
  );
  // Shared-cause work units (Approach 3) and the concentration profile
  // (Approach 5) are pure roll-ups over the burden ranking; compute once so
  // every view projects from the same data.
  const workUnits = computeWorkUnits(rankings.all);
  const concentration = computeConcentration(rankings.all);
  const allHelpers = buildHelperReport(
    ts,
    checker,
    crossFile,
    args,
    sourceFiles,
  );
  const helpers = fileMatch
    ? allHelpers.filter((helper) => fileMatch(helper.file))
    : allHelpers;
  const unknownEdges = buildUnknownEdgeRows(graph, filteredSinks);
  const allComponentRefs = buildComponentRefs(ts, checker, sourceFiles, args.root);
  const componentRefs = fileMatch
    ? allComponentRefs.filter(
        (ref) =>
          fileMatch(ref.file) || ref.uses.some((u) => fileMatch(u.file)),
      )
    : allComponentRefs;
  const repeatedForks = relateForks(
    fileMatch ? forks.filter((fork) => fileMatch(fork.file)) : forks,
    filteredSinks,
  ).sort((l, r) => r.severity - l.severity);
  const baseline = args.baseline
    ? compareBaseline(rankings, args.baseline)
    : null;

  return {
    analysisVersion: 1,
    generatedAt: new Date().toISOString(),
    meta: {
      root: args.root,
      source: args.source,
      tsconfig: args.tsconfig ?? null,
      tsconfigs: args.tsconfigs ?? (args.tsconfig ? [args.tsconfig] : []),
      tsconfigWarnings: args.tsconfigWarnings ?? [],
      typescript: typescriptModulePath,
      scope: args.scope,
      file: args.file.length ? args.file : null,
    },
    graph: {
      nodes: graph.nodes,
      edges: graph.edges,
      unknownEdges: countDistinctUnknownEdges(graph),
    },
    sinks: filteredSinks,
    contextRelay,
    rankings,
    packGroups,
    workUnits,
    concentration,
    helpers,
    unknownEdges,
    componentRefs,
    repeatedForks,
    baseline,
    summary: summarize(filteredSinks, graph),
  };
}

// Attach the per-sink findings rendered under each fork's discriminated
// branches. Sinks whose line falls inside a branch body are "branch-gated" — the
// ones a split would actually move; the rest are component context. This avoids
// the misleading "splitting on X touches all N sinks in the component" claim.
function relateForks(forks, sinks) {
  return forks.map((fork) => {
    const inComponent = sinks
      .filter(
        (sink) =>
          sink.file === fork.file &&
          sink.renderContext?.component === fork.component,
      )
      .sort((l, r) => (r.scores?.burden ?? 0) - (l.scores?.burden ?? 0));
    const ranges = fork.branchRanges ?? [];
    const inBranch = (sink) =>
      ranges.some(
        (range) => sink.line >= range.startLine && sink.line <= range.endLine,
      );
    const toRef = (sink) => ({
      id: sink.id,
      line: sink.line,
      label: sink.label,
    });
    return {
      ...fork,
      relatedSinks: inComponent.map(toRef),
      branchGatedSinks: inComponent.filter(inBranch).map(toRef),
    };
  });
}

function analyzeSourceFile(ts, checker, graph, sourceFile, args, crossFile) {
  const context = crossFile
    ? getFileContextCached(ts, sourceFile, crossFile)
    : buildFileContext(ts, sourceFile);
  const sinks = [];

  const visit = (node) => {
    const sinkExpression = getSinkExpression(ts, node);
    if (sinkExpression) {
      const trace = traceExpression(
        ts,
        checker,
        graph,
        sinkExpression.expression,
        {
          ...context,
          sourceFile,
          root: args.root,
          stack: new Set(),
          // Cross-file descent state (Approach enabler). Null crossFile keeps the
          // legacy single-file behavior for callers that don't supply it.
          crossFile: crossFile ?? null,
          crossDepth: 0,
          visitedFns: new Set(),
          paramBindings: null,
        },
      );
      const sinkNode = addNode(graph, {
        kind: "jsx-sink",
        label: sinkExpression.label,
        file: relativePath(args.root, sourceFile.fileName),
        location: locationOf(sourceFile, node),
        type: "DOM",
      });
      addEdge(graph, trace.lastNodeId, sinkNode.id, "jsx-sink", node);
      sinks.push(
        buildSinkRecord(
          ts,
          checker,
          sourceFile,
          node,
          sinkExpression,
          trace,
          sinkNode,
          args.root,
        ),
      );
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  const forks = detectRepeatedForks(ts, checker, sourceFile, args.root);
  return { sinks, forks };
}

// --- Repeated fork/split detector (component-scoped branch inventory) ---------
//
// The per-sink trace only ever sees a fork that sits directly on one value's
// data slice. The "same discriminant tested in N sibling places" smell — the
// textbook trigger for splitting a component into discriminated sub-components —
// has no representation there: a `props.type` guard on a *sibling* sink is
// invisible to that sink's backward trace.
//
// This pass restores it. Per component function it collects every branch
// construct (ternary, if, &&/||, Solid `<Match>`/`<Show when>`), normalizes each
// discriminant to a subject key (the non-literal side of a comparison, or the
// raw condition text), and emits a component-level finding when one subject is
// forked in >=2 sibling locations. Severity is sharpened by counting
// component-scope derived values that are read under only one branch — the
// "you computed both branches eagerly, used one" waste that turns a style nit
// into real burden.
// Values that are guards/toggles, not variant axes. A discriminated split keys
// on a *named* domain value (a string/number literal), never on these.
const NULLISH_OR_BOOLEAN_VALUES = new Set([
  "undefined",
  "null",
  "true",
  "false",
  "",
]);
const isNamedLiteralValue = (value) =>
  value != null && !NULLISH_OR_BOOLEAN_VALUES.has(value);

// Calls whose function argument runs as a side effect / lifecycle reaction, not
// as a render-feeding derivation. A branch inside one of these is control flow,
// not a render fork. `createMemo`/`createSelector` are deliberately absent — they
// feed JSX and stay transparent.
const SIDE_EFFECT_CALLEES = new Set([
  "createEffect",
  "createRenderEffect",
  "createComputed",
  "createReaction",
  "onMount",
  "onCleanup",
  "onError",
  "on",
  "batch",
  "untrack",
  "setTimeout",
  "setInterval",
  "queueMicrotask",
  "requestAnimationFrame",
  "requestIdleCallback",
  "addEventListener",
]);

function detectRepeatedForks(ts, checker, sourceFile, root) {
  const file = relativePath(root, sourceFile.fileName);

  const isFunctionLike = (node) =>
    ts.isFunctionDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node);

  const functionName = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
    if (ts.isMethodDeclaration(node) && node.name) return node.name.getText();
    const parent = node.parent;
    if (
      parent &&
      ts.isVariableDeclaration(parent) &&
      ts.isIdentifier(parent.name)
    )
      return parent.name.text;
    if (parent && ts.isPropertyAssignment(parent) && parent.name)
      return collapse(parent.name.getText());
    return null;
  };

  // Does a subtree contain JSX (not counting JSX inside a nested function)?
  const nodeHasJsx = (node, stopAtFunctions = false) => {
    let found = false;
    const walk = (current) => {
      if (found) return;
      if (
        ts.isJsxElement(current) ||
        ts.isJsxSelfClosingElement(current) ||
        ts.isJsxFragment(current)
      ) {
        found = true;
        return;
      }
      if (stopAtFunctions && current !== node && isFunctionLike(current)) return;
      ts.forEachChild(current, walk);
    };
    walk(node);
    return found;
  };

  // Memoized "does this function body render JSX" test → it is a component.
  const jsxCache = new Map();
  const containsJsx = (fnNode) => {
    if (jsxCache.has(fnNode)) return jsxCache.get(fnNode);
    const found = nodeHasJsx(fnNode, true);
    jsxCache.set(fnNode, found);
    return found;
  };

  const calleeName = (expr) => {
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
    return null;
  };

  // A non-JSX function is render-feeding (a derived accessor/memo whose output
  // flows into JSX) unless it is an event handler or a lifecycle/effect
  // callback. Those carry control flow, never a render fork.
  const isRenderFeedingAccessor = (fn) => {
    const parent = fn.parent;
    // Bound to a JSX `on*` event attribute: <x onClick={() => ...} />
    if (
      parent &&
      ts.isJsxExpression(parent) &&
      parent.parent &&
      ts.isJsxAttribute(parent.parent)
    ) {
      const attrName = parent.parent.name.getText();
      if (/^on[A-Z]/.test(attrName)) return false;
    }
    // Named like an event handler: const onKeyDown = ... / const handleClick = ...
    if (
      parent &&
      ts.isVariableDeclaration(parent) &&
      ts.isIdentifier(parent.name) &&
      /^(on|handle)[A-Z]/.test(parent.name.text)
    )
      return false;
    // Passed as the callback to a side-effect / lifecycle primitive.
    if (
      parent &&
      ts.isCallExpression(parent) &&
      parent.arguments.some((arg) => arg === fn)
    ) {
      const name = calleeName(parent.expression);
      if (name && SIDE_EFFECT_CALLEES.has(name)) return false;
    }
    // First parameter is (or is typed as) a DOM Event → an event handler.
    const param = fn.parameters?.[0];
    if (param) {
      if (
        ts.isIdentifier(param.name) &&
        /^(e|ev|evt|event)$/i.test(param.name.text)
      )
        return false;
      const typeText = param.type ? param.type.getText() : "";
      if (/(^|[^A-Za-z])Event(<|$|\b)/.test(typeText)) return false;
    }
    return true;
  };

  // Owning component for a branch, or null if the branch is NOT on a render
  // path. The nearest enclosing function-like must be the component itself
  // (renders JSX) or a render-feeding accessor that ultimately sits inside a
  // component. Event handlers and effect callbacks return null → ignored.
  const ownerFor = (node) => {
    let fn = node.parent;
    while (fn && !isFunctionLike(fn)) fn = fn.parent;
    if (!fn) return null;
    if (containsJsx(fn)) return fn;
    if (!isRenderFeedingAccessor(fn)) return null;
    let up = fn.parent;
    while (up) {
      if (isFunctionLike(up) && containsJsx(up)) return up;
      up = up.parent;
    }
    return null;
  };

  const literalKinds = new Set([
    ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.NumericLiteral,
    ts.SyntaxKind.TrueKeyword,
    ts.SyntaxKind.FalseKeyword,
    ts.SyntaxKind.NullKeyword,
    ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ]);
  const isLiteralish = (node) =>
    literalKinds.has(node.kind) ||
    (ts.isIdentifier(node) && node.text === "undefined");
  const literalText = (node) =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      ? node.text
      : collapse(node.getText());
  const comparisonOps = new Set([
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
  ]);

  // Reduce a branch condition to { subjectNode, subjectText, value }: the thing
  // discriminated on, plus (for a comparison against a literal) the value that
  // selects this branch.
  const discriminantOf = (node) => {
    let cond = node;
    while (ts.isParenthesizedExpression(cond)) cond = cond.expression;
    if (
      ts.isPrefixUnaryExpression(cond) &&
      cond.operator === ts.SyntaxKind.ExclamationToken
    ) {
      const inner = discriminantOf(cond.operand);
      return { subjectNode: inner.subjectNode, subjectText: inner.subjectText, value: null };
    }
    if (
      ts.isBinaryExpression(cond) &&
      comparisonOps.has(cond.operatorToken.kind)
    ) {
      const { left, right } = cond;
      if (isLiteralish(right) && !isLiteralish(left))
        return { subjectNode: left, subjectText: collapse(left.getText()), value: literalText(right) };
      if (isLiteralish(left) && !isLiteralish(right))
        return { subjectNode: right, subjectText: collapse(right.getText()), value: literalText(left) };
      return { subjectNode: cond, subjectText: collapse(cond.getText()), value: null };
    }
    return { subjectNode: cond, subjectText: collapse(cond.getText()), value: null };
  };

  // Stable identity for a discriminant subject. Prefer the resolved symbol so
  // that the same prop/signal groups across sites, and so distinct locals that
  // merely share a name (a `const box` re-declared in five functions) do NOT
  // collapse into one false fork. Falls back to owner-scoped text.
  const subjectKey = (subjectNode, ownerNode) => {
    try {
      const symbol = checker.getSymbolAtLocation(subjectNode);
      const decl = symbol?.getDeclarations?.()?.[0];
      if (decl)
        return `sym:${decl.getSourceFile().fileName}:${decl.getStart()}`;
    } catch {
      // checker can throw on synthesized nodes; fall through to text key.
    }
    return `txt:${ownerNode.getStart()}:${collapse(subjectNode.getText())}`;
  };

  const collectIdentifiers = (node) => {
    const ids = new Set();
    const walk = (current) => {
      if (ts.isIdentifier(current)) ids.add(current.text);
      ts.forEachChild(current, walk);
    };
    walk(node);
    return ids;
  };

  // An `if` whose then-branch is only an early exit (return/throw/break/continue
  // that renders nothing) is narrowing one path, not forking into siblings.
  const isGuardClause = (thenStatement) => {
    let stmt = thenStatement;
    if (ts.isBlock(stmt)) {
      if (stmt.statements.length !== 1) return false;
      stmt = stmt.statements[0];
    }
    if (ts.isReturnStatement(stmt))
      return !stmt.expression || !nodeHasJsx(stmt.expression);
    return (
      ts.isThrowStatement(stmt) ||
      ts.isBreakStatement(stmt) ||
      ts.isContinueStatement(stmt)
    );
  };

  const makeSite = (kind, node, condition, consequent) => {
    const disc = discriminantOf(condition);
    return {
      kind,
      node,
      subjectNode: disc.subjectNode,
      subjectText: disc.subjectText,
      value: disc.value,
      location: locationOf(sourceFile, condition),
      consequent,
      consequentIds: consequent ? collectIdentifiers(consequent) : new Set(),
      snippet: collapse(condition.getText()),
    };
  };

  // Solid control-flow elements: <Match when={...}> and <Show when={...}>. The
  // `when` guard is the discriminant; the element's subtree is the branch body.
  const jsxBranchSite = (node) => {
    let tagName = null;
    let attributes = null;
    if (ts.isJsxElement(node)) {
      tagName = node.openingElement.tagName.getText();
      attributes = node.openingElement.attributes;
    } else if (ts.isJsxSelfClosingElement(node)) {
      tagName = node.tagName.getText();
      attributes = node.attributes;
    } else {
      return null;
    }
    const base = tagName.split(".").pop();
    if (base !== "Match" && base !== "Show") return null;
    const whenAttr = attributes.properties.find(
      (property) =>
        ts.isJsxAttribute(property) && property.name.getText() === "when",
    );
    if (
      !whenAttr ||
      !whenAttr.initializer ||
      !ts.isJsxExpression(whenAttr.initializer) ||
      !whenAttr.initializer.expression
    )
      return null;
    const condition = whenAttr.initializer.expression;
    const disc = discriminantOf(condition);
    return {
      kind: base === "Match" ? "switch-match" : "show",
      node,
      subjectNode: disc.subjectNode,
      subjectText: disc.subjectText,
      value: disc.value,
      location: locationOf(sourceFile, condition),
      consequent: node,
      consequentIds: collectIdentifiers(node),
      snippet: collapse(condition.getText()),
    };
  };

  // owner function node -> { node, name, sites: [] }
  const components = new Map();
  const componentFor = (fnNode) => {
    let entry = components.get(fnNode);
    if (!entry) {
      entry = { node: fnNode, name: functionName(fnNode), sites: [] };
      components.set(fnNode, entry);
    }
    return entry;
  };

  const visit = (node) => {
    let site = null;
    if (ts.isConditionalExpression(node)) {
      site = makeSite("ternary", node, node.condition, node.whenTrue);
      // The else chain (whenFalse) holds sibling branches, not nesting — stop the
      // containment window before it so `a ? x : b ? y : c` keeps all sites.
      if (site) site.dedupeEnd = node.whenFalse.getStart();
    } else if (ts.isIfStatement(node)) {
      // Guard clauses (`if (!x) return`) are narrowing, not forking — skip them.
      if (!isGuardClause(node.thenStatement)) {
        site = makeSite("if", node, node.expression, node.thenStatement);
        if (site) site.dedupeEnd = node.thenStatement.getEnd();
      }
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      site = makeSite("logical", node, node.left, node.right);
    } else {
      site = jsxBranchSite(node);
    }
    if (site && site.subjectText) {
      if (site.dedupeEnd == null) site.dedupeEnd = node.getEnd();
      const owner = ownerFor(node);
      if (owner) {
        site.key = subjectKey(site.subjectNode, owner);
        componentFor(owner).sites.push(site);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  // Component-scope derived bindings (`const x = () => ...`, memos, ternaries):
  // candidates for "computed eagerly, read under one branch only".
  const componentScopeDecls = (fnNode) => {
    const body = fnNode.body;
    if (!body || !ts.isBlock(body)) return [];
    const decls = [];
    for (const stmt of body.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const declaration of stmt.declarationList.declarations) {
        if (!declaration.initializer || !ts.isIdentifier(declaration.name))
          continue;
        const init = declaration.initializer;
        const derived =
          ts.isArrowFunction(init) ||
          ts.isFunctionExpression(init) ||
          ts.isCallExpression(init) ||
          ts.isConditionalExpression(init);
        if (derived)
          decls.push({
            name: declaration.name.text,
            line: locationOf(sourceFile, declaration).line,
          });
      }
    }
    return decls;
  };

  // Drop sites contained inside another same-subject site's condition/consequent
  // window (`dedupeEnd` excludes the else chain), so an `if` and a ternary nested
  // in its then-branch don't double-count, while chained ternaries stay distinct.
  const dedupeNested = (sites) => {
    const sorted = [...sites].sort(
      (a, b) => a.node.getStart() - b.node.getStart(),
    );
    const kept = [];
    for (const site of sorted) {
      const start = site.node.getStart();
      const end = site.node.getEnd();
      const nested = kept.some(
        (other) =>
          other.node !== site.node &&
          other.node.getStart() <= start &&
          (other.dedupeEnd ?? other.node.getEnd()) >= end,
      );
      if (!nested) kept.push(site);
    }
    return kept;
  };

  const findings = [];
  for (const component of components.values()) {
    if (!containsJsx(component.node)) continue;
    // Group by resolved discriminant identity, not raw text.
    const byKey = new Map();
    for (const site of component.sites) {
      if (!byKey.has(site.key)) byKey.set(site.key, []);
      byKey.get(site.key).push(site);
    }
    const decls = componentScopeDecls(component.node);
    const componentLine = locationOf(sourceFile, component.node).line;
    for (const groupSites of byKey.values()) {
      const sites = dedupeNested(groupSites);
      if (sites.length < 2) continue;
      const subject = sites[0].subjectText;

      const branchValues = unique(
        sites.map((site) => site.value).filter((value) => value != null),
      );
      const namedValues = branchValues.filter(isNamedLiteralValue);
      const hasSwitchMatch = sites.some(
        (site) => site.kind === "switch-match",
      );
      const hasStructural = sites.some(
        (site) =>
          site.kind === "switch-match" ||
          site.kind === "show" ||
          site.kind === "ternary" ||
          site.kind === "if",
      );

      // Variant gate: a real discriminated split keys on a named domain value
      // (≥1 named literal compared) or a Switch/Match on a literal union. Bare
      // booleans, nullish sentinels, and toggle signals are not splits.
      if (!hasStructural) continue;
      if (namedValues.length < 1 && !hasSwitchMatch) continue;

      // Severity (trimmed Option B): component-scope derived values read under
      // exactly one branch value are eager cross-branch computation.
      const usageByValue = new Map();
      for (const site of sites) {
        const key = site.value ?? "(other)";
        if (!usageByValue.has(key)) usageByValue.set(key, new Set());
        for (const id of site.consequentIds) usageByValue.get(key).add(id);
      }
      const branchExclusive = [];
      for (const decl of decls) {
        const inValues = [...usageByValue.entries()]
          .filter(([, ids]) => ids.has(decl.name))
          .map(([value]) => value);
        if (inValues.length === 1)
          branchExclusive.push({ ...decl, branch: inValues[0] });
      }

      // Line ranges of each branch body, so related sinks can be gated to the
      // sites actually rendered under the discriminated branches.
      const branchRanges = sites
        .map((site) => site.consequent)
        .filter(Boolean)
        .map((node) => {
          const span = spanOf(sourceFile, node);
          return { startLine: span.startLine, endLine: span.endLine };
        });

      // Confidence: a literal-union Switch/Match or ≥2 named values is a clean
      // anchor; a single named value tested repeatedly is medium.
      const confidence =
        hasSwitchMatch || namedValues.length >= 2 ? "high" : "medium";
      // Reweight toward what actually predicts a split: distinct named domain
      // values dominate, then render-site count, then eager cross-branch compute.
      const severity =
        namedValues.length * 5 +
        sites.length +
        branchExclusive.length * 3 +
        (hasSwitchMatch ? 2 : 0);
      const first = sites[0];
      findings.push({
        id: `FORK-${first.location.line}-${first.location.column}`,
        kind: "repeated-fork",
        file,
        line: first.location.line,
        column: first.location.column,
        component: component.name,
        componentLine,
        discriminant: subject,
        branchValues,
        namedValues,
        branchRanges,
        sites: sites.map((site) => ({
          kind: site.kind,
          line: site.location.line,
          column: site.location.column,
          value: site.value,
          snippet: formatExpression(site.snippet, 80),
        })),
        siteCount: sites.length,
        branchExclusive,
        confidence,
        severity,
      });
    }
  }
  return findings.sort((a, b) => b.severity - a.severity);
}

function buildFileContext(ts, sourceFile) {
  const variables = new Map();
  const functions = new Map();
  const accessors = new Map();
  const parameters = new Set();
  // Local names bound by an import. A value imported from another module is a
  // genuine source boundary (the value enters the component from outside), not
  // an unresolved edge — so identifiers we cannot place locally are checked
  // against this set before dead-ending as `unknown-source`.
  const imports = new Set();

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      registerImports(ts, node, imports);
    }
    if (ts.isVariableDeclaration(node)) {
      registerVariable(ts, node, variables, accessors);
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name))
          parameters.add(parameter.name.text);
      }
    }
    if (
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      node.parent &&
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      functions.set(node.parent.name.text, node);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name))
          parameters.add(parameter.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { variables, functions, accessors, parameters, imports };
}

// Collect the local names an import declaration binds: default, namespace, and
// named specifiers. `import type` declarations are skipped (type-only bindings
// never appear in a render value).
function registerImports(ts, node, imports) {
  const clause = node.importClause;
  if (!clause || clause.isTypeOnly) return;
  if (clause.name) imports.add(clause.name.text);
  const bindings = clause.namedBindings;
  if (!bindings) return;
  if (ts.isNamespaceImport(bindings)) {
    imports.add(bindings.name.text);
  } else if (ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) imports.add(element.name.text);
    }
  }
}

function registerVariable(ts, node, variables, accessors) {
  if (ts.isIdentifier(node.name)) {
    variables.set(node.name.text, node);
    if (node.initializer && isCallNamed(ts, node.initializer, "createMemo")) {
      accessors.set(node.name.text, { kind: "memo", declaration: node });
    }
    return;
  }

  if (ts.isArrayBindingPattern(node.name) && node.initializer) {
    const callName = getCallName(ts, node.initializer);
    node.name.elements.forEach((element, index) => {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        variables.set(element.name.text, node);
        if (
          index === 0 &&
          ["createSignal", "createResource"].includes(callName)
        ) {
          accessors.set(element.name.text, {
            kind: callName === "createSignal" ? "signal" : "resource",
            declaration: node,
          });
        }
      }
    });
    return;
  }

  if (ts.isObjectBindingPattern(node.name)) {
    node.name.elements.forEach((element) => {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        variables.set(element.name.text, node);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Cross-file tracing (shared enabler for the helper-boundary views)
// ---------------------------------------------------------------------------

// Per-file contexts are reused across every sink and every cross-file descent,
// so build each at most once.
function getFileContextCached(ts, sourceFile, crossFile) {
  let context = crossFile.contextCache.get(sourceFile);
  if (!context) {
    context = buildFileContext(ts, sourceFile);
    crossFile.contextCache.set(sourceFile, context);
  }
  return context;
}

// The same-file `functions`/`accessors`/`variables` maps are keyed by name and
// span the whole file, so two same-named bindings in sibling scopes (e.g. a
// `pos` createMemo in one component and a `pos` helper in another) collapse to a
// single entry. Before trusting a by-name hit, confirm the type checker resolves
// this exact identifier to the declaration we found — otherwise the trace would
// descend into the wrong scope's binding. `storedNode` is the function node (for
// `functions`) or the variable declaration (for `accessors`/`variables`).
// Returns true when the symbol can't be resolved, preserving prior behavior.
function identifierResolvesTo(ts, checker, identifier, storedNode) {
  let symbol = checker.getSymbolAtLocation(identifier);
  // A shorthand property (`return { color }`) resolves to the property symbol,
  // whose declaration is the ShorthandPropertyAssignment — not the local binding
  // it aliases. Step through to the value symbol so the check sees the binding.
  if (
    symbol &&
    identifier.parent &&
    ts.isShorthandPropertyAssignment(identifier.parent)
  ) {
    symbol =
      checker.getShorthandAssignmentValueSymbol(identifier.parent) ?? symbol;
  }
  const decls = symbol?.declarations;
  if (!decls || decls.length === 0) return true;
  return decls.some((decl) => {
    // function declaration (storedNode === decl) or arrow/fn-expr bound to a
    // variable (storedNode === decl.initializer).
    if (decl === storedNode) return true;
    if (ts.isVariableDeclaration(decl) && decl.initializer === storedNode)
      return true;
    // Accessor/variable entries store the VariableDeclaration; a binding-pattern
    // element (signal/resource) resolves up to it.
    for (let node = decl; node; node = node.parent) {
      if (node === storedNode) return true;
    }
    return false;
  });
}

// Given a function/variable symbol, find a traceable declaration: a function
// declaration, or an arrow/function-expression bound to a name. Returns the
// function node plus its naming identifier, or null.
function traceableFromSymbol(ts, symbol) {
  for (const decl of symbol.declarations ?? []) {
    if (ts.isFunctionDeclaration(decl) && decl.name) {
      return { fnNode: decl, nameNode: decl.name };
    }
    if (
      ts.isVariableDeclaration(decl) &&
      ts.isIdentifier(decl.name) &&
      decl.initializer &&
      (ts.isArrowFunction(decl.initializer) ||
        ts.isFunctionExpression(decl.initializer))
    ) {
      return { fnNode: decl.initializer, nameNode: decl.name };
    }
    // A class/object method (`entityManager().getRelation(id)`) or a get
    // accessor — resolved when the receiver's method is first-party. Has the
    // same `.parameters`/`.body` shape makeCatalogRecord and the return-expr
    // extractor expect.
    if (
      (ts.isMethodDeclaration(decl) || ts.isGetAccessorDeclaration(decl)) &&
      ts.isIdentifier(decl.name)
    ) {
      return { fnNode: decl, nameNode: decl.name };
    }
    // A method-as-property: `getRelation = (id) => ...` on a class, or a
    // `{ getRelation: (id) => ... }` object-literal method.
    if (
      (ts.isPropertyDeclaration(decl) || ts.isPropertyAssignment(decl)) &&
      ts.isIdentifier(decl.name) &&
      decl.initializer &&
      (ts.isArrowFunction(decl.initializer) ||
        ts.isFunctionExpression(decl.initializer))
    ) {
      return { fnNode: decl.initializer, nameNode: decl.name };
    }
  }
  return null;
}

// True when a declaration lives in first-party source we analyze (not a .d.ts,
// not node_modules, inside the project root) — the only helpers safe to descend.
function isFirstPartyDecl(decl, args) {
  const file = decl.getSourceFile();
  if (file.isDeclarationFile) return false;
  const relative = relativePath(args.root, file.fileName);
  return !relative.startsWith("..") && !relative.includes("node_modules/");
}

// Cheap up-front record: signature shape only, no checker type queries and no
// body tracing. The expensive parts (return type, internal metrics) are computed
// lazily in buildHelperReport for functions actually reached on a render path —
// tracing every function body in a large repo is what blows up memory.
function makeCatalogRecord(ts, found, symbol, args) {
  const { fnNode, nameNode } = found;
  const sourceFile = fnNode.getSourceFile();
  const location = locationOf(sourceFile, nameNode);
  const params = fnNode.parameters
    .filter((parameter) => ts.isIdentifier(parameter.name))
    .map((parameter) => ({
      name: parameter.name.text,
      // Syntactic annotation only (cheap); unannotated params are left unknown.
      type: parameter.type ? collapse(parameter.type.getText()) : "unknown",
    }));
  return {
    symbol,
    name: nameNode.text,
    file: relativePath(args.root, sourceFile.fileName),
    line: location.line,
    params,
    arity: params.length,
    callerCount: 0,
    callers: [],
    fnNode,
    returnExpr: getFunctionReturnExpression(ts, fnNode),
    sourceFile,
  };
}

// Compute a reached function's return type and internal body metrics on demand
// (a throwaway graph, no descent), so only render-relevant functions pay for it.
function enrichCatalogRecord(ts, checker, record, args, crossFile) {
  const { fnNode, returnExpr, sourceFile } = record;
  // Use the checker that resolved this record: with per-config programs its nodes
  // may belong to a different program than the primary checker passed in.
  const recordChecker = record.checker ?? checker;
  let returnType = "unknown";
  try {
    const signature = recordChecker.getSignatureFromDeclaration(fnNode);
    if (signature) {
      returnType = safeTypeText(
        recordChecker.typeToString(
          recordChecker.getReturnTypeOfSignature(signature),
        ),
      );
    }
  } catch {
    // Some synthetic declarations have no resolvable signature; leave "unknown".
  }

  let internal = {
    maximumPathDepth: 0,
    representationChurn: 0,
    defensiveOperationCount: 0,
    impossibleDefenseCount: 0,
  };
  let inSources = 0;
  let inRoots = [];
  if (returnExpr) {
    const throwawayGraph = createGraph(args.root);
    const bodyTrace = traceExpression(ts, recordChecker, throwawayGraph, returnExpr, {
      ...getFileContextCached(ts, sourceFile, crossFile),
      sourceFile,
      root: args.root,
      stack: new Set(),
      crossFile: null,
      crossDepth: 0,
      visitedFns: new Set(),
      paramBindings: null,
    });
    internal = metricsFor(bodyTrace);
    inSources = bodyTrace.roots.length;
    // DRILL-1: retain the FULL set of named inbound lineages (deduped) rather
    // than a hard slice of 8 — the UI reveals them in a popover and caps there,
    // so the count and the revealed list can no longer disagree.
    inRoots = [
      ...new Set(
        fanOutRootsFor({
          rootInfos: bodyTrace.rootInfos,
          roots: bodyTrace.roots,
        }).map((info) => info.label),
      ),
    ];
  }
  const paramNames = new Set(record.params.map((parameter) => parameter.name));
  return {
    returnType,
    inRoots,
    inSources,
    passThrough: returnExpr ? isPassThrough(ts, returnExpr, paramNames) : false,
    typeLeak:
      isTypeLeak(returnType) ||
      record.params.some((parameter) => isTypeLeak(parameter.type)),
    internalDepth: internal.maximumPathDepth,
    internalChurn: internal.representationChurn,
    internalDefenses: internal.defensiveOperationCount,
    internalImpossible: internal.impossibleDefenseCount,
  };
}

// Lazily resolve a callee identifier to a catalog record for a first-party
// function, creating and caching the (cheap) record the first time. Follows
// import aliases so `import { groupBarSeries }` lands on the definition. Returns
// null for library/builtin/unresolvable callees; that null is cached too so the
// same call site isn't re-resolved. The catalog only ever holds functions a
// render path actually calls, keeping memory bounded on large repos.
//
// The checker calls are wrapped because type resolution on a pathologically deep
// expression can overflow TypeScript's own recursion; treat as unresolved.
function resolveCatalogFn(ts, checker, calleeIdent, crossFile, args) {
  if (!calleeIdent) return null;
  let symbol;
  try {
    symbol = checker.getSymbolAtLocation(calleeIdent);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
  } catch {
    return null;
  }
  if (!symbol) return null;
  if (crossFile.catalog.has(symbol)) return crossFile.catalog.get(symbol);

  const found = traceableFromSymbol(ts, symbol);
  const record =
    found && isFirstPartyDecl(found.fnNode, args ?? crossFile.args)
      ? makeCatalogRecord(ts, found, symbol, args ?? crossFile.args)
      : null;
  // Remember which checker resolved this record. With per-config programs (so
  // path-alias imports resolve), a record's nodes belong to that program; later
  // enrichment must use the same checker, not whichever one is passed in.
  if (record) record.checker = checker;
  crossFile.catalog.set(symbol, record);
  return record;
}

// A pass-through body forwards or renames a parameter with no transformation
// (no call, operator, or object construction) — a prime inline candidate.
function isPassThrough(ts, expression, paramNames) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  if (ts.isIdentifier(current)) return paramNames.has(current.text);
  if (ts.isPropertyAccessExpression(current)) {
    let receiver = current;
    while (ts.isPropertyAccessExpression(receiver))
      receiver = receiver.expression;
    return ts.isIdentifier(receiver) && paramNames.has(receiver.text);
  }
  return false;
}

// A boundary "leaks" when its type doesn't actually contain anything: `any`,
// `unknown`, or an over-wide union that downstream code must re-narrow.
function isTypeLeak(typeText) {
  if (!typeText) return false;
  if (/\b(any|unknown)\b/.test(typeText)) return true;
  return typeText.split("|").length > 4;
}

// Count call sites for the reached functions, mutating each record's
// callerCount/callers in place. Resolution is symbol-precise (so two different
// `format` functions are not conflated) but only attempted at sites whose callee
// *name* matches a reached function — and capped by a budget so a ubiquitous
// short name (`h`, `_`) can't trigger tens of thousands of checker resolutions.
// XREF-1 (first slice): a symbol-accurate component reference index. For every
// JSX element whose tag is a component (capitalized identifier), resolve the tag
// to its declaration via the checker — NOT by name (the exact mistake FANOUT-1
// fixed) — and record the use site against that component's definition. The tool
// has the full call graph; this exposes "where is this component used" as a
// first-class verb. Components only for now; member tags (`Foo.Bar`) and plain
// symbols are a later expansion. The eventual home is a code-map "where used"
// overlay; this index backs the References view today.
function buildComponentRefs(ts, checker, sourceFiles, root) {
  const byDef = new Map();
  let budget = 8000;
  const resolveDecl = (symbol) => {
    let s = symbol;
    try {
      if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s);
    } catch {
      /* not an alias */
    }
    return { symbol: s, decl: s?.declarations?.[0] ?? null };
  };
  for (const sourceFile of sourceFiles) {
    const fileRel = relativePath(root, sourceFile.fileName);
    const visit = (node) => {
      if (budget <= 0) return;
      const tag =
        ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)
          ? node.tagName
          : null;
      if (tag && ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text)) {
        budget -= 1;
        const { symbol, decl } = resolveDecl(checker.getSymbolAtLocation(tag));
        if (symbol && decl) {
          const declFile = decl.getSourceFile();
          const defFile = relativePath(root, declFile.fileName);
          const defLine = locationOf(declFile, decl).line;
          const key = `${defFile}:${defLine}:${tag.text}`;
          let rec = byDef.get(key);
          if (!rec) {
            rec = { name: tag.text, file: defFile, line: defLine, useCount: 0, uses: [] };
            byDef.set(key, rec);
          }
          rec.useCount += 1;
          if (rec.uses.length < 25) {
            rec.uses.push({ file: fileRel, line: locationOf(sourceFile, node).line });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return [...byDef.values()]
    .filter((rec) => rec.useCount > 0)
    .sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name));
}

function countCallers(ts, checker, sourceFiles, reached, crossFile, args) {
  // BUG-2: match call sites to helpers by a program-independent identity
  // (defFile:defLine:name), not the raw TypeScript Symbol object. With path-alias
  // tsconfigs a helper's catalog symbol is minted by its *owner* program while
  // call sites here resolve through the *primary* checker; Symbol objects are not
  // shared across programs, so the old `bySymbol` comparison always missed for
  // aliased helpers — an exported, clearly-used function showed "0 caller(s)".
  const keyOf = (record) => `${record.file}:${record.line}:${record.name}`;
  const byKey = new Map(reached.map((record) => [keyOf(record), record]));
  const names = new Set(reached.map((record) => record.name));
  let budget = 6000;
  for (const sourceFile of sourceFiles) {
    const fileRel = relativePath(args.root, sourceFile.fileName);
    const visit = (node) => {
      if (budget > 0 && ts.isCallExpression(node)) {
        const ident = ts.isIdentifier(node.expression)
          ? node.expression
          : ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name
            : null;
        if (ident && names.has(ident.text)) {
          budget -= 1;
          const resolved = resolveCatalogFn(ts, checker, ident, crossFile, args);
          const record = resolved ? byKey.get(keyOf(resolved)) : null;
          if (record) {
            record.callerCount += 1;
            if (record.callers.length < 8) {
              record.callers.push({
                file: fileRel,
                line: locationOf(sourceFile, node).line,
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
}

// Build the serializable list of functions reached on render paths, each scored
// as a boundary and tagged with a verdict. Backs the boundary-report, junctions,
// and inline-preview views. TS nodes/symbols are dropped so the result is JSON.
function buildHelperReport(ts, checker, crossFile, args, sourceFiles) {
  const reached = [];
  for (const record of crossFile.catalog.values()) {
    if (record && crossFile.reached.has(record.symbol)) reached.push(record);
  }
  if (reached.length === 0) return [];

  // Symbol-precise caller counts at name-matching sites only (budgeted).
  countCallers(ts, checker, sourceFiles, reached, crossFile, args);

  const records = [];
  for (const record of reached) {
    // Enrich only now (return type + body metrics), for reached functions only.
    const enriched = {
      ...record,
      ...enrichCatalogRecord(ts, checker, record, args, crossFile),
    };
    records.push({
      name: enriched.name,
      file: enriched.file,
      line: enriched.line,
      params: enriched.params,
      arity: enriched.arity,
      returnType: enriched.returnType,
      inRoots: enriched.inRoots,
      inSources: enriched.inSources,
      callerCount: enriched.callerCount,
      callers: enriched.callers,
      passThrough: enriched.passThrough,
      typeLeak: enriched.typeLeak,
      internalDepth: enriched.internalDepth,
      internalChurn: enriched.internalChurn,
      internalDefenses: enriched.internalDefenses,
      internalImpossible: enriched.internalImpossible,
      verdict: classifyBoundary(enriched),
      debt: boundaryDebt(enriched),
    });
  }
  return records.sort((left, right) => right.debt - left.debt);
}

// A function's primary verdict as a data-flow boundary (see the boundary-report
// view). Ordered so the most actionable label wins when several apply.
function classifyBoundary(record) {
  const isJunction = record.inSources >= 3 && record.callerCount >= 2;
  const messyInternals =
    record.internalDepth >= 6 ||
    record.internalChurn >= 4 ||
    record.internalDefenses >= 3 ||
    record.internalImpossible > 0;
  if (record.passThrough && record.internalDepth <= 1) {
    return "thin pass-through (inline)";
  }
  if (isLocalScalarMathBoundary(record)) return "local scalar math";
  if (isJunction) return "confluence / junction";
  if (record.typeLeak) return "leaky boundary";
  if (messyInternals) return "messy internals";
  return "clean pipe";
}

function isLocalScalarMathBoundary(record) {
  if (record.typeLeak) return false;
  if (record.internalImpossible > 0 || record.internalDefenses > 0)
    return false;
  if (record.callerCount > 2) return false;
  if (record.internalDepth > 5 || record.internalChurn > 2) return false;
  if (!/^(?:number|string|boolean|bigint)$/.test(record.returnType ?? "")) {
    return false;
  }
  return /^(?:get|compute)?(?:center|radius|circumference|dash|progress|track|size|width|height|x|y|cx|cy|r|axis|tick|title|label)/i.test(
    record.name ?? "",
  );
}

// A single "boundary debt" number used only to rank the report — higher means a
// more tangled / leaky / load-bearing function worth attention first.
function boundaryDebt(record) {
  const isJunction = record.inSources >= 3 && record.callerCount >= 2;
  const scalarPenalty = isLocalScalarMathBoundary(record) ? -3 : 0;
  return (
    record.inSources +
    record.internalChurn +
    record.internalDefenses * 2 +
    record.internalImpossible * 3 +
    record.internalDepth * 0.5 +
    (record.typeLeak ? 4 : 0) +
    (isJunction ? record.callerCount * 2 : 0) +
    scalarPenalty
  );
}

// BUG-1: an inline object literal with no dynamic sub-expression — an empty `{}`,
// or one built only from literals like `style={{ color: "red" }}` — is inert: it
// renders a constant value, not a tracked source, so it is neither a render-path
// finding nor a fan-out source. A literal-like node is a primitive literal (or a
// nested object/array of such); anything dynamic (identifier reference, property
// access, call, shorthand, spread, …) makes the object a real sink we keep.
function isLiteralLikeExpression(ts, node) {
  switch (node.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
      return true;
    default:
      break;
  }
  if (ts.isIdentifier(node) && node.text === "undefined") return true;
  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken ||
      node.operator === ts.SyntaxKind.PlusToken)
  )
    return isLiteralLikeExpression(ts, node.operand);
  if (ts.isParenthesizedExpression(node))
    return isLiteralLikeExpression(ts, node.expression);
  if (ts.isArrayLiteralExpression(node))
    return node.elements.every((element) =>
      isLiteralLikeExpression(ts, element),
    );
  if (ts.isObjectLiteralExpression(node)) return isInertObjectLiteral(ts, node);
  return false;
}

function isInertObjectLiteral(ts, node) {
  if (!ts.isObjectLiteralExpression(node)) return false;
  // Empty object → vacuously inert. Otherwise every property must be a plain
  // literal value; a shorthand (`{ x }`), spread, method, or accessor is dynamic.
  return node.properties.every(
    (property) =>
      ts.isPropertyAssignment(property) &&
      isLiteralLikeExpression(ts, property.initializer),
  );
}

function getSinkExpression(ts, node) {
  if (ts.isJsxExpression(node) && node.expression) {
    const parent = node.parent;
    if (parent && ts.isJsxAttribute(parent)) return null;
    if (isInertObjectLiteral(ts, node.expression)) return null;
    const jsx = jsxElementContext(ts, node);
    return {
      expression: node.expression,
      category: "rendered-value",
      label: `JSX ${formatExpression(node.expression.getText())}`,
      jsx,
    };
  }

  if (
    ts.isJsxAttribute(node) &&
    node.initializer &&
    ts.isJsxExpression(node.initializer)
  ) {
    const expression = node.initializer.expression;
    if (!expression) return null;
    if (isInertObjectLiteral(ts, expression)) return null;
    const name = node.name.getText();
    const event = /^on[A-Z]/.test(name);
    const jsx = jsxElementContext(ts, node);
    return {
      expression,
      category: event ? "event-handler" : classifyAttribute(name),
      label: `${name}={...}`,
      jsx: { ...jsx, attribute: name },
    };
  }
  return null;
}

function jsxElementContext(ts, node) {
  let current = node;
  while (current) {
    if (ts.isJsxElement(current)) {
      return { tag: jsxTagNameText(current.openingElement.tagName) };
    }
    if (ts.isJsxSelfClosingElement(current)) {
      return { tag: jsxTagNameText(current.tagName) };
    }
    if (ts.isJsxOpeningElement(current)) {
      return { tag: jsxTagNameText(current.tagName) };
    }
    if (ts.isJsxAttribute(current)) {
      const owner = current.parent?.parent;
      if (owner && ts.isJsxSelfClosingElement(owner)) {
        return { tag: jsxTagNameText(owner.tagName) };
      }
      if (owner && ts.isJsxOpeningElement(owner)) {
        return { tag: jsxTagNameText(owner.tagName) };
      }
    }
    current = current.parent;
  }
  return { tag: null };
}

function jsxTagNameText(tagName) {
  return tagName ? collapse(tagName.getText()) : null;
}

function enclosingFunctionName(ts, node) {
  let current = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name)
      return current.name.text;
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      current.parent &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
    current = current.parent;
  }
  return null;
}

// Resolve an identifier that is the parameter of an enclosing render callback
// passed as the JSX child of a control-flow component. Returns the control-flow
// prop expression that feeds the callback (`each`/`when`/`fallback`), the
// parameter's position, and the host tag — or null when `name` is not such a
// parameter. Walks outward to the innermost function that declares `name`.
// Does a callback parameter's binding introduce `name`? Matches a plain
// identifier param (`(item) => …`) as well as the bindings of a destructured
// tuple/object param (`([key, value]) => …`, `({ id }) => …`) so a `<For>` row
// that destructures its element still traces back to the iterated source.
function bindingCoversName(ts, bindingName, name) {
  if (ts.isIdentifier(bindingName)) return bindingName.text === name;
  if (ts.isArrayBindingPattern(bindingName) || ts.isObjectBindingPattern(bindingName)) {
    return bindingName.elements.some(
      (element) =>
        !ts.isOmittedExpression(element) &&
        element.name &&
        bindingCoversName(ts, element.name, name),
    );
  }
  return false;
}

// First iterable-valued prop on a custom list/collection component
// (`items`/`rows`/`each`/…), or null. Used to bind a render-callback child's
// element parameter when the host is not a native Solid control-flow component.
function iterableAttribute(ts, opening) {
  for (const property of opening.attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue;
    const name = property.name.getText();
    if (!RENDER_PROP_ITERABLE_ATTRIBUTES.has(name)) continue;
    if (
      property.initializer &&
      ts.isJsxExpression(property.initializer) &&
      property.initializer.expression
    ) {
      return { name, expression: property.initializer.expression };
    }
  }
  return null;
}

function renderPropBinding(ts, expression, name) {
  let fn = null;
  let paramIndex = -1;
  let current = expression.parent;
  while (current) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const index = current.parameters.findIndex((parameter) =>
        bindingCoversName(ts, parameter.name, name),
      );
      if (index >= 0) {
        fn = current;
        paramIndex = index;
        break;
      }
    }
    current = current.parent;
  }
  if (!fn) return null;
  // The callback must be the JSX child expression of an element:
  // `<Comp …>{(item) => …}</Comp>` (allowing a parenthesized body wrapper).
  let host = fn.parent;
  while (host && ts.isParenthesizedExpression(host)) host = host.parent;
  if (!host || !ts.isJsxExpression(host)) return null;
  const element = host.parent;
  if (!element || !ts.isJsxElement(element)) return null;
  const opening = element.openingElement;
  const tag = jsxTagNameText(opening.tagName);
  // Native Solid control flow (`<For each>`, `<Show when>`) names its binding via
  // a known attribute. A custom component instead receives its iterable on a
  // conventional prop (`items`/`rows`/…); bind the row element to that as if it
  // were `each`. Only components (capitalized tag) get the iterable fallback, so
  // a literal host element with an `items`-like attribute is never misread.
  const attribute = controlFlowAttribute(ts, opening);
  if (attribute) {
    return {
      attribute: attribute.name,
      expression: attribute.expression,
      paramIndex,
      tag,
    };
  }
  const isComponent = /^[A-Z]/.test(tag) || tag.includes(".");
  if (isComponent) {
    const iterable = iterableAttribute(ts, opening);
    if (iterable) {
      return { attribute: "each", expression: iterable.expression, paramIndex, tag };
    }
  }
  return null;
}

// Array iteration methods whose callback's FIRST parameter is the element
// (`xs.map((item) => …)`, `xs.filter((row) => …)`). `reduce`/`reduceRight` are
// excluded because their first parameter is the accumulator, not an element.
const ARRAY_ELEMENT_CALLBACK_METHODS = new Set([
  "map", "filter", "forEach", "find", "findIndex", "findLast",
  "findLastIndex", "some", "every", "flatMap",
]);

// A callback parameter bound to an element of the array a higher-order method is
// invoked on (`xs.map((item) => …)`, `xs.sort((left, right) => …)`). Returns the
// receiver expression and whether `name` is an element parameter, or null. This
// is the plain-JS analogue of `renderPropBinding` for Solid control flow.
function arrayCallbackBinding(ts, expression, name) {
  let fn = null;
  let paramIndex = -1;
  let current = expression.parent;
  while (current) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const index = current.parameters.findIndex((parameter) =>
        bindingCoversName(ts, parameter.name, name),
      );
      if (index >= 0) {
        fn = current;
        paramIndex = index;
        break;
      }
    }
    current = current.parent;
  }
  if (!fn) return null;
  const call = fn.parent;
  if (!call || !ts.isCallExpression(call) || !call.arguments.includes(fn)) {
    return null;
  }
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const method = callee.name.text;
  // `sort`/`toSorted` comparators take two element parameters; the element-first
  // methods take the element at index 0. Anything else is not an element binding.
  const isElement =
    (ARRAY_ELEMENT_CALLBACK_METHODS.has(method) && paramIndex === 0) ||
    ((method === "sort" || method === "toSorted") &&
      (paramIndex === 0 || paramIndex === 1));
  if (!isElement) return null;
  return { receiver: callee.expression };
}

// First control-flow attribute (`each`/`when`/`fallback`) on an opening element
// that carries a value expression, or null.
function controlFlowAttribute(ts, opening) {
  for (const property of opening.attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue;
    const name = property.name.getText();
    if (!CONTROL_FLOW_ATTRIBUTES.has(name)) continue;
    if (
      property.initializer &&
      ts.isJsxExpression(property.initializer) &&
      property.initializer.expression
    ) {
      return { name, expression: property.initializer.expression };
    }
  }
  return null;
}

function traceExpression(ts, checker, graph, expression, context) {
  const text = expression.getText();
  if (context.stack.has(expression)) {
    return sourceTrace(graph, expression, "cycle", text, true);
  }
  const nextContext = {
    ...context,
    stack: new Set([...context.stack, expression]),
  };

  if (ts.isIdentifier(expression)) {
    return traceIdentifier(ts, checker, graph, expression, nextContext);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return tracePropertyAccess(ts, checker, graph, expression, nextContext);
  }
  if (ts.isElementAccessExpression(expression)) {
    return addOperationTrace(ts, graph, "property-read", expression, [
      traceExpression(ts, checker, graph, expression.expression, nextContext),
    ]);
  }
  if (ts.isCallExpression(expression)) {
    return traceCallExpression(ts, checker, graph, expression, nextContext);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return traceObjectLiteral(ts, checker, graph, expression, nextContext);
  }
  if (ts.isConditionalExpression(expression)) {
    return addOperationTrace(ts, graph, "conditional", expression, [
      traceExpression(ts, checker, graph, expression.condition, nextContext),
      traceExpression(ts, checker, graph, expression.whenTrue, nextContext),
      traceExpression(ts, checker, graph, expression.whenFalse, nextContext),
    ]);
  }
  if (ts.isBinaryExpression(expression)) {
    return traceBinaryExpression(ts, checker, graph, expression, nextContext);
  }
  if (ts.isParenthesizedExpression(expression)) {
    return traceExpression(
      ts,
      checker,
      graph,
      expression.expression,
      nextContext,
    );
  }
  if (ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) {
    return traceExpression(
      ts,
      checker,
      graph,
      expression.expression,
      nextContext,
    );
  }
  if (ts.isTemplateExpression(expression)) {
    return addOperationTrace(
      ts,
      graph,
      "template",
      expression,
      expression.templateSpans.map((span) =>
        traceExpression(ts, checker, graph, span.expression, nextContext),
      ),
    );
  }
  if (ts.isPrefixUnaryExpression(expression)) {
    return addOperationTrace(ts, graph, "conditional", expression, [
      traceExpression(ts, checker, graph, expression.operand, nextContext),
    ]);
  }

  return sourceTrace(graph, expression, "literal", text, false);
}

function traceIdentifier(ts, checker, graph, expression, context) {
  const name = expression.text;
  // The global value-keywords are identifiers syntactically but have no
  // declaration to resolve to; treating them as sources dead-ends every path
  // that renders `x ?? undefined` (the single largest source of bogus
  // unknown-source rows). Trace them as literals, like `null`/`true`/`false`.
  if (name === "undefined" || name === "NaN" || name === "Infinity") {
    return sourceTrace(graph, expression, "literal", name, false);
  }
  // A global namespace object used as a value (`Array.from`, `Object.entries`,
  // `Math.round` — the receiver flows in as an identifier) is the platform, not
  // unresolved app state. Trace it as a constant `literal` (like `undefined`):
  // excluded from fan-out, source boundaries, and the unknown-edges report.
  // Skip when a local binding shadows the global name.
  if (
    JS_GLOBAL_NAMESPACES.has(name) &&
    !context.variables.has(name) &&
    !context.parameters.has(name)
  ) {
    return sourceTrace(graph, expression, "literal", name, false);
  }
  // Inside a helper body reached by cross-file descent, a parameter reference
  // resolves to the caller's argument trace, stitching the lineage across the
  // boundary. Checked first so it wins over the callee file's own bindings.
  if (context.paramBindings && context.paramBindings.has(name)) {
    return context.paramBindings.get(name);
  }
  const accessor = context.accessors.get(name);
  if (
    accessor &&
    identifierResolvesTo(ts, checker, expression, accessor.declaration)
  )
    return traceAccessor(ts, checker, graph, expression, accessor, context);

  const declaration = context.variables.get(name);
  if (
    declaration?.initializer &&
    declaration.initializer !== expression &&
    identifierResolvesTo(ts, checker, expression, declaration)
  ) {
    const trace = traceExpression(
      ts,
      checker,
      graph,
      declaration.initializer,
      context,
    );
    return addOperationTrace(ts, graph, "alias", expression, [trace], {
      label: name,
      detail: `= ${formatExpression(declaration.initializer.getText(), 52)}`,
    });
  }

  // A Solid control-flow component feeds its render callback through a prop:
  // `<For each={items}>{(entry) => …}</For>`. The callback parameter is not a
  // free variable — it is an element of the `each` source (or the narrowed
  // `when`/`fallback` value). Resolve that binding here so the parameter traces
  // back to the real source instead of dead-ending as `unknown-source`. Checked
  // before the bare-parameter classification because the inline callback is
  // never registered in the file-level `parameters` set.
  const renderProp = renderPropBinding(ts, expression, name);
  if (renderProp && renderProp.paramIndex === 0) {
    const source = traceExpression(
      ts,
      checker,
      graph,
      renderProp.expression,
      context,
    );
    if (renderProp.attribute === "each") {
      return addOperationTrace(ts, graph, "iteration", expression, [source], {
        label: name,
        detail: `∈ ${formatExpression(renderProp.expression.getText(), 40)}`,
      });
    }
    return addOperationTrace(ts, graph, "alias", expression, [source], {
      label: name,
      detail: `= ${formatExpression(renderProp.expression.getText(), 40)}`,
    });
  }

  // A callback parameter of a higher-order array method (`xs.map((item) => …)`,
  // `xs.sort((left, right) => …)`) is an element of the receiver array, not a
  // free variable. Trace it as an iteration of the receiver so it reaches the
  // real source instead of dead-ending as `unknown-source`.
  const arrayCallback = arrayCallbackBinding(ts, expression, name);
  if (arrayCallback) {
    const source = traceExpression(
      ts,
      checker,
      graph,
      arrayCallback.receiver,
      context,
    );
    return addOperationTrace(ts, graph, "iteration", expression, [source], {
      label: name,
      detail: `∈ ${formatExpression(arrayCallback.receiver.getText(), 40)}`,
    });
  }

  // A locally-defined function referenced as a value (`onClick={handleExport}`,
  // `fallback={renderHeader}`) — not called here, so it never reaches the call
  // path. It is a known local definition, not an unresolved identifier.
  if (
    context.functions.has(name) &&
    !context.parameters.has(name) &&
    identifierResolvesTo(ts, checker, expression, context.functions.get(name))
  ) {
    return sourceTrace(
      graph,
      expression,
      "source",
      name,
      false,
      "source",
      definitionLocationOf(ts, checker, expression, graph.root),
    );
  }
  // A value imported from another module (`import { SCOPE } from "./view"`,
  // `import { Portal } from "solid-js/web"`) is a source boundary — the value
  // enters from outside the component — not an unresolved edge. Tag it `import`
  // (known): it leaves the unknown-edges report but is still surfaced as a
  // source boundary. Checked after every local binding so a shadowing local or
  // an imported first-party helper call (handled in traceCrossFileCall) wins.
  if (
    context.imports?.has(name) &&
    !context.parameters.has(name) &&
    !context.variables.has(name)
  ) {
    return sourceTrace(
      graph,
      expression,
      "import",
      name,
      false,
      "import",
      definitionLocationOf(ts, checker, expression, graph.root),
    );
  }

  // A reference to an `enum`/`class`/`namespace` used as a value (`Emphasis.NONE`,
  // `MyClass.staticMember`) resolves to a declaration the file context does not
  // register as a variable, but it is a known constant/type boundary — not
  // unresolved app state. Trace it as a `literal` (known) so paths through an
  // enum member don't dead-end as unknown sources.
  if (!context.parameters.has(name) && !context.variables.has(name)) {
    let symbol;
    try {
      symbol = checker.getSymbolAtLocation(expression);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(symbol);
      }
    } catch {
      symbol = undefined;
    }
    const declarations = symbol?.declarations ?? [];
    if (
      declarations.length > 0 &&
      declarations.every(
        (declaration) =>
          ts.isEnumDeclaration(declaration) ||
          ts.isEnumMember(declaration) ||
          ts.isClassDeclaration(declaration) ||
          ts.isModuleDeclaration(declaration),
      )
    ) {
      return sourceTrace(graph, expression, "literal", name, false);
    }
  }

  const isParameter = context.parameters.has(name);
  const unknown = !isParameter && !declaration;
  // Track the root kind separately from the graph node kind: a bare parameter
  // object (e.g. `props`) is too coarse to be one fan-out "source", so we tag
  // it `parameter` and let property reads off it refine into concrete sources.
  const rootKind = unknown
    ? "unknown-source"
    : isParameter
      ? "parameter"
      : "source";
  return sourceTrace(
    graph,
    expression,
    unknown ? "unknown-source" : "source",
    name,
    unknown,
    rootKind,
  );
}

function traceAccessor(ts, checker, graph, expression, accessor, context) {
  const call = accessor.declaration.initializer;
  if (!call || !ts.isCallExpression(call)) {
    return sourceTrace(
      graph,
      expression,
      "solid-accessor",
      expression.getText(),
      true,
    );
  }
  if (accessor.kind === "memo") {
    const callback = call.arguments[0];
    const body = getFunctionReturnExpression(ts, callback);
    if (body) {
      const trace = traceExpression(ts, checker, graph, body, context);
      return addOperationTrace(
        ts,
        graph,
        "solid-accessor",
        expression,
        [trace],
        {
          label: `${expression.text}() memo`,
          detail: `= ${formatExpression(body.getText(), 52)}`,
        },
      );
    }
  }
  if (accessor.kind === "signal") {
    const trace = call.arguments[0]
      ? traceExpression(ts, checker, graph, call.arguments[0], context)
      : sourceTrace(
          graph,
          expression,
          "solid-accessor",
          `${expression.text}()`,
          true,
        );
    return addOperationTrace(ts, graph, "solid-accessor", expression, [trace], {
      label: `${expression.text}() signal`,
    });
  }
  return sourceTrace(
    graph,
    expression,
    "solid-accessor",
    `${expression.text}() resource`,
    true,
  );
}

function tracePropertyAccess(ts, checker, graph, expression, context) {
  const receiverTrace = traceExpression(
    ts,
    checker,
    graph,
    expression.expression,
    context,
  );
  const kind = expression.questionDotToken ? "optional-read" : "property-read";
  const operation = addOperationTrace(
    ts,
    graph,
    kind,
    expression,
    [receiverTrace],
    {
      label: expression.name.text,
    },
  );
  // Refine the first concrete property read off a bare parameter into a
  // qualified root (`props` -> `props.meta`). `props` alone is too coarse to
  // rank as one source; the property read is the value that actually fans out.
  if (
    ts.isIdentifier(expression.expression) &&
    receiverTrace.rootInfos?.length === 1 &&
    receiverTrace.rootInfos[0].kind === "parameter" &&
    receiverTrace.rootInfos[0].label === expression.expression.text
  ) {
    const qualified = `${expression.expression.text}.${expression.name.text}`;
    operation.rootInfos = [{ label: qualified, kind: "prop-read" }];
    operation.roots = [qualified];
  }
  if (expression.questionDotToken) {
    operation.defenses.push(
      defenseRecord(ts, checker, expression.expression, expression, kind),
    );
  }
  return operation;
}

// Mark a callee's catalog function as reached on a render path, so the boundary
// report only lists functions that actually participate in rendering.
function markReached(ts, checker, calleeIdent, context) {
  if (!context.crossFile) return;
  const record = resolveCatalogFn(ts, checker, calleeIdent, context.crossFile);
  if (record) context.crossFile.reached.add(record.symbol);
}

// Descend into a first-party imported helper, or return null to fall through to
// the opaque generic-call handling (imported-but-not-first-party, depth/recursion
// limits hit, no resolvable body, or helper tracing disabled).
function traceCrossFileCall(ts, checker, graph, expression, callee, context) {
  const crossFile = context.crossFile;
  if (!crossFile?.args?.traceHelpers) return null;
  // The node whose symbol identifies the callee: a bare identifier (`helper()`)
  // or a method name (`obj.method()`). Anything else (computed/element-access
  // callee) is unfollowable.
  const calleeIdent = ts.isIdentifier(expression.expression)
    ? expression.expression
    : ts.isPropertyAccessExpression(expression.expression)
      ? expression.expression.name
      : null;
  if (!calleeIdent) return null;
  // Hooks / context accessors (`useX`) are intentional feature-model boundaries,
  // not helpers to dissolve — descending into them would erase the very signal
  // the prop-relay / context-relay views rely on. Keep them opaque.
  if (/^use[A-Z]/.test(callee)) return null;
  if (context.crossDepth >= crossFile.args.maxHelperDepth) return null;

  const record = resolveCatalogFn(ts, checker, calleeIdent, crossFile);
  if (!record || !record.returnExpr) return null;
  if (context.visitedFns.has(record.symbol)) return null;
  if (crossFile.budget <= 0) return null;
  crossFile.budget -= 1;

  markReached(ts, checker, calleeIdent, context);

  // Trace the argument lineage and the helper body on a *throwaway* graph, not
  // the persistent report graph. Cross-file descent across thousands of sinks
  // would otherwise accumulate millions of nodes and exhaust memory. The step
  // data we render (label/kind/file/line, roots, packs) lives on the returned
  // trace, independent of which graph held the nodes; only graph-wide counts
  // (summary/dossier) lose the descended interior, which is an acceptable trade.
  const subGraph = createGraph(context.root);
  const paramBindings = new Map();
  record.params.forEach((parameter, index) => {
    const argument = expression.arguments[index];
    if (argument) {
      paramBindings.set(
        parameter.name,
        traceExpression(ts, checker, subGraph, argument, context),
      );
    }
  });

  const defFile = record.fnNode.getSourceFile();
  const bodyTrace = traceExpression(ts, checker, subGraph, record.returnExpr, {
    ...getFileContextCached(ts, defFile, crossFile),
    sourceFile: defFile,
    root: context.root,
    stack: new Set(),
    crossFile,
    crossDepth: context.crossDepth + 1,
    visitedFns: new Set([...context.visitedFns, record.symbol]),
    paramBindings,
  });

  // For a method call, the receiver object is part of the value's lineage
  // (`entityManager().getRelation(id)` flows from the manager too). Trace it so
  // its source is preserved alongside the descended body.
  const children = [bodyTrace];
  if (ts.isPropertyAccessExpression(expression.expression)) {
    children.push(
      traceExpression(
        ts,
        checker,
        graph,
        expression.expression.expression,
        context,
      ),
    );
  }

  return addOperationTrace(ts, graph, "call", expression, children, {
    label: callee,
    detail: `returns ${formatExpression(record.returnExpr.getText(), 52)}`,
  });
}

function traceCallExpression(ts, checker, graph, expression, context) {
  const callee = getCallName(ts, expression);
  // A control-flow render callback may receive its data as an accessor that is
  // *invoked* in the body: `<Show when={x}>{(value) => <div>{value()}</div>}`
  // (keyed Show) or `<Index each={xs}>{(item) => item().id}`. Calling the
  // parameter yields the narrowed `when` value or the iterated element, so
  // resolve the call back to that source rather than dead-ending at an opaque
  // `detailText [operation]` root.
  if (ts.isIdentifier(expression.expression)) {
    const renderProp = renderPropBinding(ts, expression.expression, callee);
    if (renderProp && renderProp.paramIndex === 0) {
      const source = traceExpression(
        ts,
        checker,
        graph,
        renderProp.expression,
        context,
      );
      if (renderProp.attribute === "each") {
        return addOperationTrace(ts, graph, "iteration", expression, [source], {
          label: callee,
          detail: `∈ ${formatExpression(renderProp.expression.getText(), 40)}`,
        });
      }
      return addOperationTrace(
        ts,
        graph,
        "solid-accessor",
        expression,
        [source],
        {
          label: `${callee}()`,
          detail: `= ${formatExpression(renderProp.expression.getText(), 40)}`,
        },
      );
    }
  }
  if (
    ts.isIdentifier(expression.expression) &&
    context.functions.has(callee) &&
    identifierResolvesTo(
      ts,
      checker,
      expression.expression,
      context.functions.get(callee),
    )
  ) {
    // Same-file helper: record that it was reached (for the boundary report) and
    // trace through its body inline, as before.
    markReached(ts, checker, expression.expression, context);
    const fn = context.functions.get(callee);
    const returnExpression = getFunctionReturnExpression(ts, fn);
    const traces = expression.arguments.map((argument) =>
      traceExpression(ts, checker, graph, argument, context),
    );
    if (returnExpression) {
      traces.push(
        traceExpression(ts, checker, graph, returnExpression, context),
      );
    }
    return addOperationTrace(ts, graph, "call", expression, traces, {
      label: callee,
      detail: returnExpression
        ? `returns ${formatExpression(returnExpression.getText(), 52)}`
        : `${callee}(${expression.arguments.length ? "…" : ""})`,
    });
  }

  if (
    ts.isIdentifier(expression.expression) &&
    context.accessors.has(callee) &&
    identifierResolvesTo(
      ts,
      checker,
      expression.expression,
      context.accessors.get(callee).declaration,
    )
  ) {
    return traceAccessor(
      ts,
      checker,
      graph,
      expression.expression,
      context.accessors.get(callee),
      context,
    );
  }

  // Cross-file descent: an imported first-party helper. Follow it into its
  // definition file, binding the call's arguments to the helper's parameters so
  // the traced lineage continues through the body (and its nodes pick up the F2
  // file/line). Bounded by --max-helper-depth and a per-branch visited set.
  const crossFileTrace = traceCrossFileCall(
    ts,
    checker,
    graph,
    expression,
    callee,
    context,
  );
  if (crossFileTrace) return crossFileTrace;

  const traces = [];
  if (ts.isPropertyAccessExpression(expression.expression)) {
    traces.push(
      traceExpression(
        ts,
        checker,
        graph,
        expression.expression.expression,
        context,
      ),
    );
  }
  traces.push(
    ...expression.arguments.map((argument) =>
      traceExpression(ts, checker, graph, argument, context),
    ),
  );
  // Distinguish genuinely-unresolved helpers from boundaries that are opaque by
  // design. Syntactic host/global/Solid calls are caught cheaply first; the
  // symbol-aware classifier then names reactive accessor reads (`props.x()`),
  // DOM/library calls, and factory-produced callables so they leave the report
  // as known boundaries instead of being flagged as unresolved. A same-file
  // function name still escapes "unknown" even if symbol resolution above
  // declined it (name collision), as before.
  const opaqueReason =
    !callee || context.functions.has(callee)
      ? null
      : isOpaqueByDesignCall(ts, expression, callee)
        ? "host-call"
        : classifyUnresolvedCall(ts, checker, expression, context.crossFile);
  const unknown =
    !callee || (!context.functions.has(callee) && !opaqueReason);
  return addOperationTrace(ts, graph, "call", expression, traces, {
    label: callee || "call",
    unknown,
    // The full call expression as written — for a method (`x.toUpperCase()`) or
    // an imported helper, this is the only thing that conveys what it does.
    detail: formatExpression(expression.getText(), 60),
  });
}

function traceObjectLiteral(ts, checker, graph, expression, context) {
  const traces = [];
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      traces.push(
        traceExpression(ts, checker, graph, property.expression, context),
      );
    } else if (ts.isPropertyAssignment(property)) {
      traces.push(
        traceExpression(ts, checker, graph, property.initializer, context),
      );
    } else if (ts.isShorthandPropertyAssignment(property)) {
      traces.push(traceExpression(ts, checker, graph, property.name, context));
    }
  }
  return addOperationTrace(ts, graph, "object-pack", expression, traces);
}

function traceBinaryExpression(ts, checker, graph, expression, context) {
  const operator = expression.operatorToken.kind;
  const kind =
    operator === ts.SyntaxKind.QuestionQuestionToken ||
    operator === ts.SyntaxKind.BarBarToken
      ? "fallback"
      : "conditional";
  const trace = addOperationTrace(ts, graph, kind, expression, [
    traceExpression(ts, checker, graph, expression.left, context),
    traceExpression(ts, checker, graph, expression.right, context),
  ]);
  if (operator === ts.SyntaxKind.QuestionQuestionToken) {
    trace.defenses.push(
      defenseRecord(ts, checker, expression.left, expression, "fallback"),
    );
  }
  return trace;
}

function addOperationTrace(ts, graph, kind, expression, traces, options = {}) {
  const explicit = options.label != null;
  const fullText = collapse(expression.getText());
  const nodeLabel = options.label ?? formatExpression(fullText);
  // A short gloss of what this step evaluates, for kinds whose label alone is
  // ambiguous (a helper/method/memo/alias name says nothing about its body).
  // Defaults to the full expression text for calls; explicit callers override.
  const detail = options.detail ?? null;
  // File + line of this hop, threaded onto the step so the path can show where
  // each piece of logic lives (same file vs. scattered) and an agent can grep it.
  const sourceFile = expression.getSourceFile();
  const file = relativePath(graph.root, sourceFile.fileName);
  const location = locationOf(sourceFile, expression);
  const node = addNode(graph, {
    kind,
    label: nodeLabel,
    file,
    location,
    type: safeTypeText(options.type),
  });
  const edges = [];
  const rootInfos = [];
  const defenses = [];
  const representationSteps = [];
  // Packed objects the value flows through, so sinks sharing one packed object
  // (a createMemo/object literal) can be grouped and checked for over-packing
  // (Phase 3). Identity is the object literal's *source location*, NOT the graph
  // node id: the trace graph re-traces each sink, minting a fresh node per
  // object-pack, so node ids are never shared even for the same literal.
  const packs = [];
  // Each path step carries its operation kind so the transformation ledger and
  // path renderers can name the real operation (property-read, fallback, call,
  // object-pack, …) instead of a constant placeholder.
  let winnerChild = null;
  let longest = [{ label: nodeLabel, kind, detail, file, line: location.line }];
  for (const trace of traces.filter(Boolean)) {
    addEdge(
      graph,
      trace.lastNodeId,
      node.id,
      kind,
      expression,
      options.unknown,
    );
    edges.push(...trace.edges, kind);
    rootInfos.push(
      ...(trace.rootInfos ??
        trace.roots.map((root) => ({ label: root, kind: "source" }))),
    );
    defenses.push(...trace.defenses);
    representationSteps.push(...(trace.representationSteps ?? []));
    packs.push(...(trace.packs ?? []));
    if (trace.longestPath.length + 1 > longest.length) {
      winnerChild = trace;
      longest = [
        ...trace.longestPath,
        { label: nodeLabel, kind, detail, file, line: location.line },
      ];
    }
  }
  // Re-center an inline expression's label on the sub-expression that actually
  // flows in from the previous step (the "via"), marking it with « » so long
  // compute/pack/ternary expressions show the traced piece instead of
  // truncating an unrelated front. Steps with an explicit label (calls, memos,
  // reads) already carry their own gloss and keep their name.
  if (!explicit) {
    const focused = focusSnippet(fullText, winnerChild?.headText ?? null, 90);
    longest[longest.length - 1] = {
      ...longest[longest.length - 1],
      label: focused,
    };
  }
  if (kind === "object-pack") {
    packs.push({
      key: `${file}:${location.line}:${location.column}`,
      label: nodeLabel,
    });
  }
  if (REPRESENTATION_KINDS.has(kind)) {
    representationSteps.push({
      kind,
      label: nodeLabel,
      file,
      line: location.line,
      key: `${file}:${location.line}:${location.column}`,
    });
  }
  if (traces.length === 0)
    rootInfos.push({ label: nodeLabel, kind: "operation" });
  const dedupedRoots = uniqueRootInfos(rootInfos);
  return {
    lastNodeId: node.id,
    roots: dedupedRoots.map((root) => root.label),
    rootInfos: dedupedRoots,
    edges,
    defenses,
    representationSteps,
    longestPath: longest,
    packs: uniquePacks(packs),
    // The collapsed full text of this expression, so a parent operation can mark
    // exactly which sub-expression the traced value flowed in through.
    headText: fullText,
  };
}

// Deduplicate packs by their source-location key, keeping the first label seen.
function uniquePacks(packs) {
  const seen = new Map();
  for (const pack of packs) {
    if (!seen.has(pack.key)) seen.set(pack.key, pack);
  }
  return Array.from(seen.values());
}

// Deduplicate root descriptors by label, keeping the first (most specific)
// kind seen. Sources are tracked with their node kind so reports can filter
// out literal/primitive roots that are not actionable "sources".
function uniqueRootInfos(rootInfos) {
  const seen = new Map();
  for (const info of rootInfos) {
    if (!info || !info.label) continue;
    if (!seen.has(info.label)) seen.set(info.label, info);
  }
  return Array.from(seen.values());
}

// FANOUT-DEF-1: resolve a root expression to its DEFINITION location (where the
// symbol is declared), not the use site we are currently tracing. This lets the
// fan-out graph's source node link straight to where a shared source like
// `useCommitsTableContext` is defined — the user shouldn't have to click into a
// usage and chase an import. Best-effort: returns null when the symbol is
// unresolved or only declared externally (node_modules / `.d.ts`).
function definitionLocationOf(ts, checker, expression, root) {
  let symbol;
  try {
    symbol = checker.getSymbolAtLocation(expression);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
  } catch {
    return null;
  }
  const declarations = symbol?.declarations ?? [];
  if (declarations.length === 0) return null;
  const internal = declarations.find((declaration) => {
    const file = declaration.getSourceFile();
    if (file.isDeclarationFile) return false;
    const relative = relativePath(root, file.fileName);
    return !relative.startsWith("..") && !relative.includes("node_modules/");
  });
  if (!internal) return null;
  const declFile = internal.getSourceFile();
  const position = declFile.getLineAndCharacterOfPosition(
    internal.getStart(declFile),
  );
  return { file: relativePath(root, declFile.fileName), line: position.line + 1 };
}

function sourceTrace(graph, expression, kind, label, unknown, rootKind = kind, def = null) {
  const sourceFile = expression.getSourceFile();
  const file = relativePath(graph.root, sourceFile.fileName);
  const location = locationOf(sourceFile, expression);
  const node = addNode(graph, {
    kind,
    label,
    file,
    location,
    type: safeTypeText(),
  });
  return {
    lastNodeId: node.id,
    roots: [label],
    rootInfos: [{ label, kind: rootKind, ...(def ? { def } : {}) }],
    edges: [],
    defenses: [],
    representationSteps: [],
    longestPath: [{ label, kind, detail: null, file, line: location.line }],
    packs: [],
    unknown,
    headText: collapse(expression.getText()),
  };
}

function buildSinkRecord(
  ts,
  checker,
  sourceFile,
  node,
  sinkExpression,
  trace,
  sinkNode,
  root,
) {
  const location = locationOf(sourceFile, node);
  // One physical guard reached via several render sub-paths is a single
  // defensive operation; dedupe before metrics so counts and the rendered list
  // reflect distinct sites, not path multiplicity.
  const distinctDefenses = dedupeDefenses(trace.defenses);
  const distinctRepresentation = dedupeByKey(trace.representationSteps ?? []);
  const metrics = metricsFor(trace, distinctDefenses, distinctRepresentation);
  const sinkId = `RPF-${String(location.line).padStart(3, "0")}-${String(location.column).padStart(2, "0")}`;
  const confidence = confidenceFor(metrics, distinctDefenses);
  return {
    id: sinkId,
    file: relativePath(root, sourceFile.fileName),
    line: location.line,
    column: location.column,
    // Exact source span of the rendered expression, so the code map can map the
    // finding to its chunk of code (not the whole line) and make adjacent
    // findings on one line independently selectable.
    span: spanOf(sourceFile, sinkExpression.expression),
    category: sinkExpression.category,
    label: sinkExpression.label,
    expression: sinkExpression.expression.getText(),
    renderContext: {
      tag: sinkExpression.jsx?.tag ?? null,
      attribute:
        sinkExpression.jsx?.attribute ??
        sinkAttributeName({ label: sinkExpression.label }),
      component: enclosingFunctionName(ts, node),
    },
    type: safeTypeText(
      checker.typeToString(
        checker.getTypeAtLocation(sinkExpression.expression),
      ),
    ),
    roots: trace.roots,
    rootInfos:
      trace.rootInfos ??
      trace.roots.map((root) => ({ label: root, kind: "source" })),
    representativePath: trace.longestPath.map((step) => step.label),
    representativeSteps: trace.longestPath.map((step) => ({
      label: step.label,
      kind: step.kind,
      detail: step.detail ?? null,
      file: step.file ?? null,
      line: step.line ?? null,
    })),
    // Distinct representation-only hops (alias/pack/spread) on this sink's
    // slice, so the report can list exactly what the churn count refers to.
    representationSteps: distinctRepresentation,
    packs: trace.packs ?? [],
    nodeId: sinkNode.id,
    metrics,
    defenses: distinctDefenses,
    confidence: confidence.score,
    confidenceReason: confidence.reason,
    confidenceRisk: confidence.risk,
    queue: queueFor(metrics, distinctDefenses),
  };
}

function metricsFor(
  trace,
  defenses = dedupeDefenses(trace.defenses),
  representationSteps = dedupeByKey(trace.representationSteps ?? []),
) {
  const edgeCounts = countBy(trace.edges);
  // Count distinct guard sites, not edge traversals: the same `??`/`?.` reached
  // through several render sub-paths is one defensive operation.
  const defensiveOperationCount = defenses.length;
  const certaintyBoundaryDefenseCount = defenses.filter((defense) =>
    isCertaintyBoundaryDefense(defense),
  ).length;
  const actionableDefensiveOperationCount = Math.max(
    0,
    defensiveOperationCount - certaintyBoundaryDefenseCount,
  );
  // Distinct representation-only hops, deduped by site (same rationale as
  // defenses) rather than counted once per render sub-path that crosses them.
  const representationChurn = representationSteps.length;
  const helperHops = edgeCounts.call ?? 0;
  const impossibleDefenseCount = defenses.filter(
    (defense) => defense.verdict === "impossible",
  ).length;
  const unknownEdgeCount = trace.edges.filter(
    (edge) => edge === "unknown",
  ).length;
  return {
    sliceSize: trace.edges.length + trace.longestPath.length,
    maximumPathDepth: trace.longestPath.length,
    helperHops,
    representationChurn,
    defensiveOperationCount,
    actionableDefensiveOperationCount,
    certaintyBoundaryDefenseCount,
    impossibleDefenseCount,
    controlDependencyCount: edgeCounts.conditional ?? 0,
    mergeWidth: trace.roots.length,
    // True downstream reach is a whole-report property (how many sinks this
    // sink's sources also feed), so it cannot be known from a single trace.
    // Seeded to 1 here and filled in by groundReachability once all sinks exist.
    reachableSinks: 1,
    repeatedNormalization: Math.max(0, actionableDefensiveOperationCount - 1),
    unknownEdgeCount,
    packFamilyDiversity: 0,
    packRisk: 0,
    suspiciousPackCount: 0,
  };
}

// Compact, render-friendly descriptor of a sink reached through a shared source.
function reachedSinkDescriptor(sink) {
  const ctx = sink.renderContext ?? {};
  const where = [ctx.tag, ctx.attribute].filter(Boolean).join(" / ");
  return {
    id: sink.id,
    file: sink.file,
    line: sink.line,
    label: where || sink.label || sink.expression || sink.id,
    // FANOUT-DEPTH-1: the sink's own longest source→sink path length, so the
    // fan-out graph can show how *derived* each reached sink is right next to it.
    // Cheap (already computed); this is the sink's overall depth, not a measured
    // distance from this particular root (that enhancement is deferred).
    depth: sink.metrics?.maximumPathDepth ?? 0,
  };
}

function buildUnknownEdgeRows(graph, sinks) {
  const nodes = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  // The trace graph re-traces each sink independently, minting fresh nodes/edges
  // per sink path (see addOperationTrace). So one physical unknown edge (a call,
  // an unknown identifier) is recorded once per render path that crosses it. Key
  // each row by its source position + kind + label and dedupe: emit one row per
  // distinct unknown edge, counting `occurrences` as the path multiplicity (a
  // cheap reach proxy) so a fan-out sink doesn't flood the report with copies.
  const byKey = new Map();
  const rows = [];
  const record = (key, build) => {
    const existing = byKey.get(key);
    if (existing) {
      existing.occurrences += 1;
      return;
    }
    const row = { ...build(), occurrences: 1 };
    byKey.set(key, row);
    rows.push(row);
  };
  for (const edge of graph.edges ?? []) {
    if (!edge.unknown) continue;
    const target = nodes.get(edge.to);
    const source = nodes.get(edge.from);
    const file = target?.file ?? source?.file ?? "";
    const line = target?.location?.line ?? source?.location?.line ?? null;
    const label = target?.label ?? source?.label ?? edge.kind;
    record(`${file}:${line ?? ""}:${edge.kind}:${label}`, () => ({
      id: edge.id,
      file,
      line,
      kind: edge.kind,
      label,
      source: source
        ? { id: source.id, kind: source.kind, label: source.label }
        : null,
      target: target
        ? { id: target.id, kind: target.kind, label: target.label }
        : null,
      affectedSinks: affectedSinksForUnknownEdge(sinks, {
        file,
        line,
        kind: edge.kind,
        label,
      }),
    }));
  }
  for (const node of graph.nodes ?? []) {
    if (node.kind !== "unknown-source") continue;
    const file = node.file ?? "";
    const line = node.location?.line ?? null;
    const label = node.label;
    const kind = "unknown-source";
    record(`${file}:${line ?? ""}:${kind}:${label}`, () => ({
      id: node.id,
      file,
      line,
      kind,
      label,
      source: null,
      target: { id: node.id, kind: node.kind, label: node.label },
      affectedSinks: affectedSinksForUnknownEdge(sinks, {
        file,
        line,
        kind,
        label,
      }),
    }));
  }
  return rows.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      Number(left.line ?? 0) - Number(right.line ?? 0) ||
      left.kind.localeCompare(right.kind) ||
      left.label.localeCompare(right.label),
  );
}

function affectedSinksForUnknownEdge(sinks, edge) {
  return sinks
    .filter((sink) => {
      const roots =
        sink.rootInfos ??
        sink.roots.map((root) => ({ label: root, kind: "source" }));
      if (
        roots.some(
          (root) => root.label === edge.label && root.kind === edge.kind,
        )
      ) {
        return true;
      }
      return (sink.representativeSteps ?? []).some((step) => {
        if (edge.file && step.file !== edge.file) return false;
        if (edge.line != null && step.line !== edge.line) return false;
        if (edge.kind && step.kind !== edge.kind) return false;
        return !edge.label || step.label === edge.label;
      });
    })
    .slice(0, REACHED_VIA_CAP)
    .map(reachedSinkDescriptor);
}

function isCertaintyBoundaryDefense(defense) {
  return /parser-boundary|compatibility|optional|solid prop default|api-choice/i.test(
    defense.origin ?? "",
  );
}

// Whole-graph grounding pass. The trace graph does not deduplicate nodes across
// sinks, so downstream reach cannot be read off the raw graph per source node.
// Instead aggregate by source identity (label): a source's reach is the number
// of distinct render sinks its actionable roots feed. Each sink then inherits
// the reach of its most-central source. This replaces the former constant base
// reach in centralityScore and the hardcoded `reachable sinks: 1`.
function groundReachability(sinks) {
  // Map each fan-out source identity to every sink it feeds, so reach is not
  // just a number but an enumerable set — the report can show *which* sinks a
  // shared source reaches, grouped by that source (the chain root → sinks).
  const sinksByRoot = new Map();
  for (const sink of sinks) {
    for (const info of fanOutRootsFor(sink)) {
      if (!sinksByRoot.has(info.label)) sinksByRoot.set(info.label, []);
      sinksByRoot.get(info.label).push(sink);
    }
  }
  for (const sink of sinks) {
    let reach = 1;
    // Group the other sinks this sink's sources also feed, keyed by the shared
    // source. Only roots with genuine fan-out (>1 sink) are interesting.
    const reachedVia = [];
    for (const info of fanOutRootsFor(sink)) {
      const fed = sinksByRoot.get(info.label) ?? [sink];
      reach = Math.max(reach, fed.length);
      const others = fed.filter((other) => other.nodeId !== sink.nodeId);
      if (others.length > 0) {
        reachedVia.push({
          source: info.label,
          total: others.length,
          // Cap stored descriptors so a high fan-out source can't make this
          // O(n^2); `total` preserves the true count for the "+N more" hint.
          sinks: others
            .slice(0, REACHED_VIA_CAP)
            .map((other) => reachedSinkDescriptor(other)),
        });
      }
    }
    sink.metrics.reachableSinks = reach;
    sink.reachedVia = reachedVia;
  }
  // Queues depend on reach, so finalize them here (buildSinkRecord runs before
  // grounding). The central-leverage cutoff is the report's own top reach
  // quartile rather than a fixed magic number: it adapts to codebase size and
  // keeps central-leverage a meaningful minority. The floor of 3 means a sink
  // must feed at least three render sinks to qualify on small/flat projects.
  const reaches = sinks
    .map((sink) => sink.metrics.reachableSinks)
    .sort((a, b) => a - b);
  const reachThreshold = Math.max(3, percentile(reaches, 0.75));
  for (const sink of sinks) {
    sink.queue = queueFor(sink.metrics, sink.defenses, reachThreshold);
  }
}

function defenseRecord(ts, checker, guardedExpression, node, operation) {
  const runtimeBoundary = runtimeBoundaryFallback(
    ts,
    checker,
    guardedExpression,
  );
  const typeVerdict = getNullishStatus(ts, checker, guardedExpression);
  const verdict =
    typeVerdict === "impossible" && runtimeBoundary ? "possible" : typeVerdict;
  const sourceFile = node.getSourceFile();
  const location = locationOf(sourceFile, node);
  return {
    operation,
    expression: node.getText(),
    guardedExpression: guardedExpression.getText(),
    type: safeTypeText(
      checker.typeToString(checker.getTypeAtLocation(guardedExpression)),
    ),
    verdict,
    origin: fallbackOrigin(
      ts,
      checker,
      guardedExpression,
      node,
      verdict,
      runtimeBoundary,
    ),
    location,
    // Physical identity of this guard: the same `x ?? y` site reached through
    // several render sub-paths is one defensive operation, not many. Keyed by
    // file + position so dedupe survives cross-file helper inlining.
    key: `${sourceFile.fileName}:${location.line}:${location.column}`,
  };
}

// Collapse defenses that refer to the same physical guard site (the trace
// re-walks shared sub-paths, so one `props.size ?? 32` can appear many times).
// First occurrence wins; order is preserved.
function dedupeDefenses(defenses) {
  return dedupeByKey(defenses, (defense) =>
    defense.key ?? `${defense.location?.line}:${defense.expression}`,
  );
}

// Generic first-wins, order-preserving dedupe over a `.key` (or a supplied key
// function). Used to collapse trace artifacts (defenses, representation hops)
// that the per-sink re-trace can visit through multiple sub-paths.
function dedupeByKey(items, keyOf = (item) => item.key) {
  const seen = new Set();
  const distinct = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(item);
  }
  return distinct;
}

// Phase 9 — distinguish stale defensive code from intentional compatibility
// guards, using only local signals: the guard's type/optionality and any
// leading comment on the AST node (no repo scanning).
function fallbackOrigin(
  ts,
  checker,
  guardedExpression,
  node,
  verdict,
  runtimeBoundary = null,
) {
  if (runtimeBoundary) return runtimeBoundary.origin;
  if (verdict === "impossible") return "stale (type-impossible)";
  if (verdict === "unknown") return "unknown";
  if (isApiChoiceFallback(ts, node)) return "api-choice fallback";
  if (isOptionalPropRead(ts, checker, guardedExpression)) {
    return "solid prop default (optional prop)";
  }
  const comment = leadingCommentText(ts, node);
  if (/persist|legacy|back[ -]?compat|compat|migrat|deprecat/i.test(comment)) {
    return "compatibility (documented)";
  }
  if (
    ts.isPropertyAccessExpression(guardedExpression) &&
    guardedExpression.questionDotToken
  ) {
    return "compatibility (optional)";
  }
  const type = checker.getTypeAtLocation(guardedExpression);
  const members = type.isUnion() ? type.types : [type];
  if (members.some((m) => (m.flags & ts.TypeFlags.Undefined) !== 0)) {
    return "compatibility (optional)";
  }
  return "defensive (review)";
}

function isOptionalPropRead(ts, checker, expression) {
  const unwrapped = unwrapExpression(ts, expression);
  if (!ts.isPropertyAccessExpression(unwrapped)) return false;
  if (!ts.isIdentifier(unwrapped.expression)) return false;
  if (!isParameterIdentifier(ts, checker, unwrapped.expression)) return false;

  const receiverType = checker.getTypeAtLocation(unwrapped.expression);
  const property = checker.getPropertyOfType(receiverType, unwrapped.name.text);
  if (!property) return false;
  if ((property.flags & ts.SymbolFlags.Optional) !== 0) return true;

  const propertyType = checker.getTypeOfSymbolAtLocation(property, unwrapped);
  const members = propertyType.isUnion() ? propertyType.types : [propertyType];
  return members.some(
    (member) => (member.flags & ts.TypeFlags.Undefined) !== 0,
  );
}

function isParameterIdentifier(ts, checker, identifier) {
  const symbol = checker.getSymbolAtLocation(identifier);
  const declaration = symbol?.valueDeclaration;
  return Boolean(declaration && ts.isParameter(declaration));
}

function isApiChoiceFallback(ts, node) {
  if (!ts.isBinaryExpression(node)) return false;
  const operator = node.operatorToken.kind;
  if (
    operator !== ts.SyntaxKind.QuestionQuestionToken &&
    operator !== ts.SyntaxKind.BarBarToken
  ) {
    return false;
  }
  const right = unwrapExpression(ts, node.right);
  if (
    ts.isStringLiteral(right) ||
    ts.isNoSubstitutionTemplateLiteral(right) ||
    ts.isNumericLiteral(right) ||
    right.kind === ts.SyntaxKind.TrueKeyword ||
    right.kind === ts.SyntaxKind.FalseKeyword ||
    right.kind === ts.SyntaxKind.NullKeyword
  ) {
    return false;
  }
  return expressionHasIdentifierOrPropertyRead(ts, right);
}

function expressionHasIdentifierOrPropertyRead(ts, expression) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

// TypeScript usually reports `array[index]` as the element type unless the
// target enables noUncheckedIndexedAccess. Parser code often defaults indexed
// regex/extraction results precisely because a valid broad string may yield no
// token, so do not promote those fallbacks to "type-impossible".
function runtimeBoundaryFallback(ts, checker, expression, seen = new Set()) {
  const unwrapped = unwrapExpression(ts, expression);
  if (seen.has(unwrapped)) return null;
  seen.add(unwrapped);

  if (ts.isIdentifier(unwrapped)) {
    const initializer = declarationInitializer(ts, checker, unwrapped);
    if (initializer) {
      return runtimeBoundaryFallback(ts, checker, initializer, seen);
    }
  }

  if (!ts.isElementAccessExpression(unwrapped)) return null;
  if (!looksLikeNumericIndex(ts, unwrapped.argumentExpression)) return null;
  if (!isRuntimeOptionalSequence(ts, checker, unwrapped.expression, seen)) {
    return null;
  }
  return { origin: "parser-boundary fallback" };
}

function declarationInitializer(ts, checker, identifier) {
  const symbol = checker.getSymbolAtLocation(identifier);
  const declaration = symbol?.valueDeclaration;
  if (!declaration || !ts.isVariableDeclaration(declaration)) return null;
  if (!ts.isIdentifier(declaration.name)) return null;
  return declaration.initializer ?? null;
}

function isRuntimeOptionalSequence(ts, checker, expression, seen) {
  const unwrapped = unwrapExpression(ts, expression);
  if (seen.has(unwrapped)) return false;
  seen.add(unwrapped);

  if (ts.isCallExpression(unwrapped)) {
    return isParserLikeCall(ts, unwrapped);
  }
  if (ts.isBinaryExpression(unwrapped)) {
    return (
      unwrapped.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      isRuntimeOptionalSequence(ts, checker, unwrapped.left, seen)
    );
  }
  if (ts.isIdentifier(unwrapped)) {
    const initializer = declarationInitializer(ts, checker, unwrapped);
    if (initializer) {
      return isRuntimeOptionalSequence(ts, checker, initializer, seen);
    }
  }
  return isArrayLikeExtractionType(ts, checker, unwrapped);
}

function isParserLikeCall(ts, call) {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) {
    return /^(exec|filter|flatMap|map|match|matchAll|split)$/u.test(
      callee.name.text,
    );
  }
  if (ts.isIdentifier(callee)) {
    return /(?:extract|find|match|parse|token|split)/iu.test(callee.text);
  }
  return false;
}

function isArrayLikeExtractionType(ts, checker, expression) {
  const typeText = checker.typeToString(checker.getTypeAtLocation(expression));
  return /\b(?:Array|ReadonlyArray|RegExpMatchArray|string)\b|\[\]/u.test(
    typeText,
  );
}

function looksLikeNumericIndex(ts, expression) {
  if (!expression) return true;
  if (ts.isNumericLiteral(expression)) return true;
  return (
    ts.isPrefixUnaryExpression(expression) &&
    ts.isNumericLiteral(expression.operand)
  );
}

function unwrapExpression(ts, expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function leadingCommentText(ts, node) {
  const sourceFile = node.getSourceFile();
  const fullText = sourceFile.getFullText();
  const ranges =
    ts.getLeadingCommentRanges(fullText, node.getFullStart()) ?? [];
  return ranges.map((range) => fullText.slice(range.pos, range.end)).join(" ");
}

function getNullishStatus(ts, checker, expression) {
  const type = checker.getTypeAtLocation(expression);
  const members = type.isUnion() ? type.types : [type];
  const uncertain = members.some(
    (member) =>
      (member.flags &
        (ts.TypeFlags.Any |
          ts.TypeFlags.Unknown |
          ts.TypeFlags.TypeParameter)) !==
      0,
  );
  if (uncertain) return "unknown";
  const containsNullish = members.some(
    (member) =>
      (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0,
  );
  return containsNullish ? "possible" : "impossible";
}

// THRESH-1: a "usage" is a trivial, shallow expression with no actionable
// signal — e.g. a bare `props.search` read flowing straight into a sink (burden
// ~0.05, the path-depth term only). These are not smells; they are proof a value
// is used. We keep them (browsable, jump-to-definition) but tag them `usage` so
// the UI can demote them out of the findings list, which otherwise fills with
// "the simplest usage possible" noise. Reach/fan-out is deliberately NOT a
// signal here: a plain prop read that feeds many sinks is still just a usage.
const USAGE_BURDEN_CEILING = 0.08;
function classifyTier(sink, burden) {
  const m = sink.metrics ?? {};
  const hasSignal =
    (m.actionableDefensiveOperationCount ?? 0) > 0 ||
    (m.impossibleDefenseCount ?? 0) > 0 ||
    (m.representationChurn ?? 0) > 0 ||
    (m.controlDependencyCount ?? 0) > 0 ||
    (m.helperHops ?? 0) > 0 ||
    (m.packRisk ?? 0) > 0 ||
    (m.suspiciousPackCount ?? 0) > 0 ||
    (m.unknownEdgeCount ?? 0) > 0 ||
    (m.repeatedNormalization ?? 0) > 0;
  return burden < USAGE_BURDEN_CEILING && !hasSignal ? "usage" : "finding";
}

function rankSinks(sinks) {
  const enriched = sinks.map((sink) => {
    const background = backgroundClassificationFor(sink);
    const rawBurden = burdenScore(sink.metrics);
    const burden = background ? rawBurden * background.penalty : rawBurden;
    const centrality = centralityScore(sink.metrics);
    const changeRisk = changeRiskScore(sink.metrics);
    const confidence = sink.confidence / 100;
    return {
      ...sink,
      signature: signatureFor(sink),
      background,
      tier: classifyTier(sink, burden),
      scores: {
        burden,
        rawBurden,
        // Per-term decomposition of rawBurden so the report can explain the
        // score. `backgroundPenalty` is the post-decomposition multiplier
        // applied to reach the final `burden` (1 when no background discount).
        burdenBreakdown: {
          ...burdenBreakdown(sink.metrics),
          backgroundPenalty: background ? background.penalty : 1,
        },
        centrality,
        changeRisk,
        quickWin:
          (confidence * burden * Math.pow(1 - centrality, 0.7)) /
          (0.25 + changeRisk),
        centralLeverage:
          (confidence * burden * centrality * Math.max(0.1, centrality)) /
          (0.25 + changeRisk),
        investigationPriority:
          burden * centrality * Math.min(1, sink.metrics.unknownEdgeCount / 3),
      },
    };
  });
  return {
    all: enriched.sort(
      (left, right) => right.scores.burden - left.scores.burden,
    ),
    quickWins: enriched
      .filter((sink) => sink.queue === "peripheral-quick-win")
      .sort((left, right) => right.scores.quickWin - left.scores.quickWin),
    centralLeverage: enriched
      .filter((sink) => sink.queue === "central-leverage")
      .sort(
        (left, right) =>
          right.scores.centralLeverage - left.scores.centralLeverage,
      ),
    investigations: enriched
      .filter((sink) => sink.queue === "investigation")
      .sort(
        (left, right) =>
          right.scores.investigationPriority -
          left.scores.investigationPriority,
      ),
  };
}

// --- Selection layer: depth vs. breadth -----------------------------------
// `rankings.all` is a pure descending-burden sort, which clusters: a few heavy
// files monopolize the top. These helpers re-select over that ranking to add
// breadth — diversity caps (Approach 1), MMR (Approach 2), coverage round-robin
// (Approach 6), or shared-cause work units (Approach 3) — without ever dropping
// the single worst sink. Today's behavior is `--sort burden` (the default).

const DEFAULT_PER_FILE = 2;
const DEFAULT_PER_FEATURE = 4;

// The primary actionable source ("pivot") and primary shape tag of a sink — the
// redundancy/grouping keys shared by MMR and work-unit grouping.
function primaryPivotOf(sink) {
  const roots = fanOutRootsFor(sink);
  return roots.length ? formatExpression(roots[0].label, 40) : null;
}
function primaryShapeOf(sink) {
  return primaryAdviceShape(sink) ?? "uncategorized";
}

function primaryAdviceShape(sink, shapes = classifyPathShape(sink)) {
  if (sinkFamilyOf(sink) === "svg-shell" && shapes.includes("svg-shell")) {
    return "svg-shell";
  }
  if (sink.category === "style" && shapes.includes("presentation-pack")) {
    return "presentation-pack";
  }
  if (
    sink.category === "render-control" &&
    shapes.includes("control-flow-gate")
  ) {
    return "control-flow-gate";
  }
  if (
    shapes.includes("solid-prop-default-boundary") &&
    (shapes[0] === "domain-normalization" || shapes.length === 1)
  ) {
    return "solid-prop-default-boundary";
  }
  return shapes[0] ?? null;
}

// Approach 3 — collapse file-local sinks that share a cause into one work unit.
// Two sinks join the same unit when they share a packed object (packs[].key) or
// share BOTH their primary pivot and primary shape (so a geometry chain and a
// leaky relay in the same file stay separate units — guarding the "don't
// force-merge different fixes" risk). The representative is the highest-burden
// member. Returned burden-sorted by representative.
function computeWorkUnits(sinks) {
  const byFile = new Map();
  for (const sink of sinks) {
    if (!byFile.has(sink.file)) byFile.set(sink.file, []);
    byFile.get(sink.file).push(sink);
  }
  const units = [];
  for (const fileSinks of byFile.values()) {
    const groups = [];
    for (const sink of fileSinks) {
      const packKeys = new Set((sink.packs ?? []).map((pack) => pack.key));
      const pivot = primaryPivotOf(sink);
      const shape = primaryShapeOf(sink);
      let group = groups.find(
        (candidate) =>
          [...packKeys].some((key) => candidate.packKeys.has(key)) ||
          (pivot !== null &&
            candidate.pivot === pivot &&
            candidate.shape === shape),
      );
      if (!group) {
        group = { sinks: [], packKeys: new Set(), pivot, shape };
        groups.push(group);
      }
      group.sinks.push(sink);
      for (const key of packKeys) group.packKeys.add(key);
    }
    for (const group of groups) {
      const members = group.sinks
        .slice()
        .sort((left, right) => right.scores.burden - left.scores.burden);
      units.push(makeWorkUnit(members[0], members));
    }
  }
  return units.sort((left, right) => right.scores.burden - left.scores.burden);
}

// A work unit IS its representative sink (so every existing renderer keeps
// working) plus a `.unit` block describing the sinks it covers.
function makeWorkUnit(representative, members) {
  const pivots = unique(
    members.flatMap((member) =>
      fanOutRootsFor(member).map((info) => formatExpression(info.label, 40)),
    ),
  ).slice(0, 4);
  const causes = unique(
    members.flatMap((member) =>
      (member.representativeSteps ?? [])
        .filter((step) => step.kind === "call")
        .map((step) => formatExpression(step.label, 40)),
    ),
  ).slice(0, 4);
  return {
    ...representative,
    unit: {
      sinkCount: members.length,
      members: members.map((member) => ({
        id: member.id,
        line: member.line,
        label: formatExpression(member.label, 40),
      })),
      pivots,
      causes,
      shape: primaryShapeOf(representative),
    },
  };
}

// For each file with at least one shown item, how many of its ranked siblings
// were NOT shown — the "+N more" collapsed tally that keeps the concentration
// signal visible (the "don't hide the worst" risk).
function suppressionFor(allItems, selected) {
  const totalByFile = countBy(allItems.map((item) => item.file));
  const selectedByFile = countBy(selected.map((item) => item.file));
  const suppressed = new Map();
  for (const [file, total] of Object.entries(totalByFile)) {
    const shown = selectedByFile[file] ?? 0;
    if (shown > 0 && total > shown) suppressed.set(file, total - shown);
  }
  return suppressed;
}

// Approach 1 — per-file / per-feature diversity caps. Walks the burden-sorted
// list admitting an item only while its file and feature quotas have room.
function selectSpread(items, args) {
  const perFile = args.perFile ?? DEFAULT_PER_FILE;
  const perFeature = args.perFeature ?? DEFAULT_PER_FEATURE;
  const fileCount = new Map();
  const featureCount = new Map();
  const selected = [];
  for (const item of items) {
    if (selected.length >= args.maxItems) break;
    const feature = featureKeyFor(item.file);
    const fc = fileCount.get(item.file) ?? 0;
    const ec = featureCount.get(feature) ?? 0;
    if (fc < perFile && ec < perFeature) {
      selected.push(item);
      fileCount.set(item.file, fc + 1);
      featureCount.set(feature, ec + 1);
    }
  }
  return { selected, suppressed: suppressionFor(items, selected) };
}

// Approach 6 (coverage) — one item per file (best first) until every file is
// represented or the list fills, then fill remaining slots by burden.
function selectCoverage(items, args) {
  const selected = [];
  const chosen = new Set();
  const seenFiles = new Set();
  for (const item of items) {
    if (selected.length >= args.maxItems) break;
    if (!seenFiles.has(item.file)) {
      selected.push(item);
      chosen.add(item);
      seenFiles.add(item.file);
    }
  }
  for (const item of items) {
    if (selected.length >= args.maxItems) break;
    if (!chosen.has(item)) {
      selected.push(item);
      chosen.add(item);
    }
  }
  return { selected, suppressed: suppressionFor(items, selected) };
}

// Approach 2 — Maximal Marginal Relevance. Greedily pick the item maximizing
// burden − λ·redundancy, where redundancy rises when an item shares a file,
// shape, or pivot with what is already selected. λ scales with --diversity.
function selectMMR(items, args) {
  const lambda = clamp01(args.diversity);
  const maxBurden = Math.max(
    0.0001,
    ...items.map((item) => item.scores.burden),
  );
  const pool = items.slice();
  const selected = [];
  const fileCount = new Map();
  const shapeCount = new Map();
  const pivotCount = new Map();
  while (selected.length < args.maxItems && pool.length > 0) {
    const n = selected.length;
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < pool.length; index += 1) {
      const item = pool[index];
      const redundancy =
        n === 0
          ? 0
          : 0.5 * ((fileCount.get(item.file) ?? 0) / n) +
            0.25 * ((shapeCount.get(primaryShapeOf(item)) ?? 0) / n) +
            0.25 * ((pivotCount.get(primaryPivotOf(item)) ?? 0) / n);
      const score = item.scores.burden - lambda * maxBurden * redundancy;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const [picked] = pool.splice(bestIndex, 1);
    selected.push(picked);
    fileCount.set(picked.file, (fileCount.get(picked.file) ?? 0) + 1);
    const shape = primaryShapeOf(picked);
    shapeCount.set(shape, (shapeCount.get(shape) ?? 0) + 1);
    const pivot = primaryPivotOf(picked);
    if (pivot) pivotCount.set(pivot, (pivotCount.get(pivot) ?? 0) + 1);
  }
  return { selected, suppressed: suppressionFor(items, selected) };
}

// The selection used by the packet/finding views. Picks the unit/sink list per
// --units + --sort + --diversity, never dropping the worst item. Returns the
// chosen items, the suppression tally, and the resolved mode for the banner.
function selectWorkItems(report, args) {
  const mode = args.sort ?? "burden";
  const useUnits = Boolean(args.units) && mode !== "quick-win";
  let pool = useUnits ? report.workUnits : report.rankings.all;
  if (args.view === "work-packets") {
    const actionable = pool.filter((item) => !item.background);
    if (actionable.length > 0) pool = actionable;
  }

  if (mode === "quick-win") {
    const quickIds = new Set(report.rankings.quickWins.map((sink) => sink.id));
    pool = report.rankings.quickWins
      .filter((sink) => !sink.background)
      .concat(report.rankings.all.filter((sink) => !quickIds.has(sink.id)));
    if (args.view === "work-packets")
      pool = pool.filter((sink) => !sink.background);
  }

  let result;
  if (args.diversity != null) {
    result = selectMMR(pool, args);
  } else if (mode === "spread") {
    result = selectSpread(pool, args);
  } else if (mode === "coverage") {
    result = selectCoverage(pool, args);
  } else {
    result = { selected: pool.slice(0, args.maxItems), suppressed: new Map() };
  }
  return { ...result, useUnits, mode };
}

// A one-line banner describing the active selection mode (omitted for the
// default burden sort so today's output is unchanged at the top).
function selectionBanner(selection, args) {
  if (args.diversity != null) {
    return `_Ranked by burden, diversified (--diversity ${args.diversity}). Redundant siblings deferred._`;
  }
  switch (selection.mode) {
    case "spread":
      return `_Spread mode: ≤${args.perFile ?? DEFAULT_PER_FILE} per file, ≤${args.perFeature ?? DEFAULT_PER_FEATURE} per feature. ${selection.selected.length} shown across ${plural(new Set(selection.selected.map((item) => item.file)).size, "file")}._`;
    case "coverage":
      return "_Sort: coverage — at most one packet per file until every file is represented, then fill remaining slots by burden._";
    case "quick-win":
      return "_Sort: quick-win — peripheral, high-confidence, low-change-risk sinks first._";
    default:
      return null;
  }
}

// The collapsed "still hot" note for cap-demoted siblings (Approach 1).
function suppressionLines(suppressed) {
  if (!suppressed || suppressed.size === 0) return [];
  const parts = Array.from(suppressed.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([file, count]) => `${file.split("/").at(-1)} +${count}`);
  return [
    `_Suppressed (still hot, shown collapsed): ${parts.join(", ")} — see the Hotspots section of \`--view overview\` for the full count._`,
    "",
  ];
}

// Approach 5 — quantify how concentrated the ranked burden is, so the clustering
// the user noticed becomes a reported fact rather than a surprise.
function computeConcentration(sinks) {
  const burdenByFile = new Map();
  const countByFile = new Map();
  let total = 0;
  for (const sink of sinks) {
    total += sink.scores.burden;
    burdenByFile.set(
      sink.file,
      (burdenByFile.get(sink.file) ?? 0) + sink.scores.burden,
    );
    countByFile.set(sink.file, (countByFile.get(sink.file) ?? 0) + 1);
  }
  const fileBurdens = Array.from(burdenByFile.values()).sort(
    (left, right) => right - left,
  );
  const frac = (n) =>
    total > 0
      ? fileBurdens.slice(0, n).reduce((sum, value) => sum + value, 0) / total
      : 0;
  return {
    fileCount: burdenByFile.size,
    sinkCount: sinks.length,
    totalBurden: total,
    top5: frac(5),
    top9: frac(9),
    hot4Plus: Array.from(countByFile.values()).filter((count) => count >= 4)
      .length,
  };
}

// Approach 5 — the "Coverage" paragraph shown in the packet/repair-map headers.
function concentrationLines(report, shownCount) {
  const concentration = report.concentration;
  if (!concentration || concentration.fileCount === 0) return [];
  const pct = (value) => `${Math.round(value * 100)}%`;
  const topFiles = Math.min(5, concentration.fileCount);
  let sentence = `_${shownCount} shown. Ranked burden is concentrated: top ${plural(topFiles, "file")} = ${pct(concentration.top5)}`;
  if (concentration.fileCount > 9)
    sentence += `, top 9 = ${pct(concentration.top9)}`;
  sentence += `. ${plural(concentration.fileCount, "file")} ${concentration.fileCount === 1 ? "carries" : "carry"} ≥1 finding`;
  if (concentration.hot4Plus > 0)
    sentence += `, ${concentration.hot4Plus} have ≥4`;
  sentence +=
    ". Use --spread / --diversity to widen; the Hotspots section below has the full per-file map._";
  return ["**Coverage**", "", sentence, ""];
}

// Display label + human kind for a fork-site construct.
const FORK_SITE_KIND = {
  "switch-match": "Match",
  show: "Show",
  ternary: "ternary",
  if: "if",
  logical: "&&/||",
};

function forkSeverityLabel(fork) {
  // Driven by named-value diversity (the real split signal) and severity, which
  // already weights distinct named values × 5.
  const named = fork.namedValues?.length ?? 0;
  if (named >= 3 || fork.severity >= 16) return "HIGH";
  if ((named >= 2 && fork.confidence === "high") || fork.severity >= 10)
    return "MEDIUM";
  return "LOW";
}

function renderRepeatedForks(report, args) {
  const fileMatch = makeFileMatcher(args.file);
  const all = report.repeatedForks ?? [];
  const forks = fileMatch ? all.filter((fork) => fileMatch(fork.file)) : all;
  const maxItems = args.maxItems ?? defaultMaxItemsFor("repeated-forks");
  const selected = forks.slice(0, maxItems);

  const lines = [
    "# Repeated Fork → Split Candidates",
    "",
    ...viewIntro("repeated-forks", report),
  ];

  if (forks.length === 0) {
    lines.push(
      "_No component tests the same discriminant across multiple sibling branch sites. " +
        "Nothing here suggests a discriminated split._",
      "",
    );
    return `${lines.join("\n")}\n`;
  }

  if (forks.length > selected.length) {
    lines.push(
      `_Showing top ${selected.length} of ${forks.length} candidates (raise with --max-items)._`,
      "",
    );
  }

  for (const fork of selected) {
    const component = fork.component ?? "(anonymous render scope)";
    lines.push(
      `## ${fork.id} · ${forkSeverityLabel(fork)} · \`${component}\` forks on \`${fork.discriminant}\``,
    );
    lines.push(`${fork.file}:${fork.componentLine ?? fork.line}`);
    lines.push("");

    lines.push("**Discriminant**");
    lines.push("");
    lines.push(...fenced([fork.discriminant]));
    lines.push("");
    if (fork.branchValues.length > 0) {
      lines.push(
        `Branch values: ${fork.branchValues.map((value) => `\`${value}\``).join(", ")}`,
      );
      lines.push("");
    }

    lines.push("**Fork sites**");
    lines.push("");
    lines.push("| Where | Construct | Branch | Condition |");
    lines.push("| --- | --- | --- | --- |");
    for (const site of fork.sites) {
      lines.push(
        `| ${fork.file}:${site.line} | ${FORK_SITE_KIND[site.kind] ?? site.kind} | ${
          site.value != null ? `\`${site.value}\`` : "—"
        } | \`${site.snippet}\` |`,
      );
    }
    lines.push("");

    if (fork.branchExclusive && fork.branchExclusive.length > 0) {
      lines.push("**Branch-exclusive eager computation**");
      lines.push("");
      lines.push(
        "These component-scope values are computed regardless of branch but read under only one:",
      );
      lines.push("");
      for (const decl of fork.branchExclusive) {
        lines.push(
          `- \`${decl.name}\` (${fork.file}:${decl.line}) — used only when \`${decl.branch}\``,
        );
      }
      lines.push("");
    }

    const gated = fork.branchGatedSinks ?? [];
    const related = fork.relatedSinks ?? [];
    if (gated.length > 0) {
      lines.push("**Findings under the discriminated branches**");
      lines.push("");
      lines.push(
        `${gated.length} ranked finding(s) render inside the \`${fork.discriminant}\` branches — these move with a split` +
          (related.length > gated.length
            ? ` (${related.length} total in \`${component}\`).`
            : "."),
      );
      lines.push("");
      for (const sink of gated.slice(0, 8)) {
        lines.push(
          `- ${sink.id} — \`${formatExpression(sink.label, 60)}\` (${fork.file}:${sink.line})`,
        );
      }
      lines.push("");
    } else if (related.length > 0) {
      lines.push("**Findings in this component**");
      lines.push("");
      lines.push(
        `${related.length} ranked finding(s) render in \`${component}\` (none lie directly inside a discriminated branch body):`,
      );
      lines.push("");
      for (const sink of related.slice(0, 6)) {
        lines.push(
          `- ${sink.id} — \`${formatExpression(sink.label, 60)}\` (${fork.file}:${sink.line})`,
        );
      }
      lines.push("");
    }

    lines.push("**Recommendation**");
    lines.push("");
    lines.push(forkRecommendation(fork, component));
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function forkRecommendation(fork, component) {
  // Only suggest concrete sub-component names when the component has a usable
  // PascalCase name and the branches key on ≥2 named domain values; otherwise
  // the generated names ("EnterCombobox") are noise.
  const named = fork.namedValues ?? [];
  const isPascal = /^[A-Z][A-Za-z0-9]*$/.test(component);
  const subComponents =
    named.length >= 2 && isPascal
      ? named
          .slice(0, 3)
          .map((value) => `\`${pascalish(value)}${component}\``)
          .join(" / ")
      : "one sub-component per branch";
  const eager =
    fork.branchExclusive && fork.branchExclusive.length > 0
      ? ` Each branch already computes ${fork.branchExclusive.length} value(s) eagerly that only one path reads — moving those into the matching sub-component removes the cross-branch waste.`
      : "";
  return (
    `\`${component}\` discriminates on \`${fork.discriminant}\` in ${fork.siteCount} render-path sites. ` +
    `Lift the decision to a single top-level split (${subComponents}) so each sub-component computes its own data in place instead of forking the same condition repeatedly.${eager}`
  );
}

// "bar" -> "Bar", "line-chart" -> "LineChart"; best-effort label for a suggested
// sub-component name. Non-identifier values fall back to a generic tag.
function pascalish(value) {
  const cleaned = String(value).replace(/[^A-Za-z0-9]+/g, " ").trim();
  if (!cleaned) return "Branch";
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function renderFindings(report, args) {
  const selection = selectWorkItems(report, { ...args, units: false });
  const sinks = selection.selected;
  const lines = [
    "# Render-Path Findings",
    "",
    ...viewIntro("findings", report),
  ];
  const banner = selectionBanner(selection, args);
  if (banner) lines.push(banner, "");
  lines.push(...suppressionLines(selection.suppressed));
  for (const sink of sinks) {
    lines.push(`## ${sink.id} · ${severityFor(sink)} · ${findingTitle(sink)}`);
    lines.push(`${sink.file}:${sink.line}`);
    lines.push("");
    lines.push("**Sink**");
    lines.push("");
    lines.push(...fenced([formatExpression(sink.expression)]));
    lines.push("");
    lines.push("**Source**");
    lines.push("");
    lines.push(...fenced([actionableSourceLabels(sink)]));
    lines.push("");
    lines.push("**Metrics**");
    lines.push("");
    lines.push(
      ...metricTable([
        ["path depth", sink.metrics.maximumPathDepth],
        ["helper hops", sink.metrics.helperHops],
        ["representation churn", sink.metrics.representationChurn],
        ["defensive operations", sink.metrics.defensiveOperationCount],
        ["impossible defenses", sink.metrics.impossibleDefenseCount],
        ["pack risk", sink.metrics.packRisk],
        ["downstream sink count", sink.metrics.reachableSinks],
        ["centrality percentile", Math.round(sink.scores.centrality * 100)],
        ["analysis confidence", `${sink.confidence}%`],
      ]),
    );
    lines.push("");
    lines.push(`Confidence: ${sink.confidence}%`);
    lines.push(`Reason: ${sink.confidenceReason}`);
    lines.push(`Risk: ${sink.confidenceRisk}`);
    lines.push("");
    const contributions = metricContributionLines(sink);
    if (contributions.length > 0) {
      lines.push("**Metric contributions**");
      lines.push("");
      lines.push(...fenced(contributions));
      lines.push("");
    }
    lines.push("**Representative path**");
    lines.push("");
    lines.push(...fenced(representativePathLines(sink)));
    lines.push("");
    lines.push("**Finding**");
    lines.push("");
    lines.push(findingSentence(sink));
    lines.push("");
  }
  appendBaseline(lines, report);
  return `${lines.join("\n")}\n`;
}

// Phase 8 — itemize which exact path operations produced the headline metric
// counts, so a "defensive operations: 2" is backed by the two steps that caused
// it. Driven by the representative (longest) path steps.
function metricContributionLines(sink) {
  const steps = sink.representativeSteps ?? [];
  const lines = [];
  const defensive = steps.filter(
    (step) => step.kind === "fallback" || step.kind === "optional-read",
  );
  const helpers = steps.filter((step) => step.kind === "call");
  // Counts are for the representative (longest) path only, so they can be lower
  // than the whole-trace metric totals; the heading says so to avoid confusion.
  if (defensive.length > 0) {
    lines.push(`defensive operations on this path: ${defensive.length}`);
    for (const step of defensive) {
      lines.push(`  - ${formatExpression(step.label, 60)}  [${step.kind}]`);
    }
  }
  if (helpers.length > 0) {
    lines.push(`helper hops on this path: ${helpers.length}`);
    for (const step of helpers) {
      lines.push(`  - ${formatExpression(step.label, 60)}  [call]`);
    }
  }
  return lines;
}

// One-lined, kind-annotated path steps for the fenced prose renderers. The
// per-step operation kind comes from representativeSteps (P5); falls back to the
// plain label array for any record analyzed before steps were threaded through.
function representativePathLines(sink, { showKind = true } = {}) {
  const steps =
    sink.representativeSteps ??
    sink.representativePath.map((label) => ({ label, kind: null }));
  if (steps.length === 0) return ["(no path)"];
  return steps.map((step) => {
    const label = formatExpression(step.label);
    return showKind && step.kind
      ? `-> ${label}  [${step.kind}]`
      : `-> ${label}`;
  });
}

// Actionable domain sources for a sink: named locals and qualified property
// reads (props.meta), with literals, bare parameters, language globals, and
// inline function bodies dropped via fanOutRootsFor. Capped with a `(+N more)`.
function actionableSourceLabels(sink, max = 6) {
  const labels = unique(
    fanOutRootsFor(sink).map((info) => formatExpression(info.label, 60)),
  );
  if (labels.length === 0) return "unknown";
  if (labels.length <= max) return labels.join(", ");
  return `${labels.slice(0, max).join(", ")} (+${labels.length - max} more)`;
}

function renderWorkPackets(report, args) {
  const selection = selectWorkItems(report, args);
  const sinks = selection.selected;
  const renderGroups = groupedRenderRecommendations(report.rankings.all);
  const lines = [
    "# Render-Path Data-Flow Work Packets",
    "",
    ...viewIntro("work-packets", report),
  ];
  const banner = selectionBanner(selection, args);
  if (banner) lines.push(banner, "");
  lines.push(...suppressionLines(selection.suppressed));
  appendFeatureClusters(lines, report, args);
  appendGroupedRecommendations(lines, report, args);
  lines.push(...concentrationLines(report, sinks.length));
  const itemKind = selection.useUnits ? "WORK UNIT" : "WORK ITEM";
  sinks.forEach((sink, index) => {
    const group = packGroupForSink(sink, report.packGroups);
    lines.push(
      `## ${itemKind} DF-${String(index + 1).padStart(3, "0")}  ·  ${sink.id}`,
    );
    lines.push(`Simplify ${formatExpression(sink.label, 80)} in ${sink.file}`);
    lines.push("");
    if (selection.useUnits && sink.unit && sink.unit.sinkCount > 1) {
      lines.push(
        `**Unit impact** — fix once, ${sink.unit.sinkCount} sinks in this file improve.`,
      );
      lines.push("");
      lines.push(
        ...formatMarkdownTable(
          ["sinks improved", "shared pivot", "shared cause"],
          [
            [
              String(sink.unit.sinkCount),
              sink.unit.pivots.join(", ") || "—",
              sink.unit.causes.join(", ") || "—",
            ],
          ],
        ),
      );
      lines.push("");
      lines.push(
        `covers: ${sink.unit.members.map((member) => `${member.label} (L${member.line})`).join(", ")}`,
      );
      lines.push("");
    }
    lines.push("**Review summary**");
    lines.push("");
    lines.push(reviewerSummaryFor(sink, group));
    lines.push("");
    lines.push("**Scope**");
    lines.push("");
    lines.push(
      ...metricTable([
        ["pivot", code(actionableSourceLabels(sink, 3))],
        ["files", 1],
        ["source inputs", Math.max(1, sink.metrics.mergeWidth)],
        ["reachable sinks", sink.metrics.reachableSinks],
        ["confidence", `${sink.confidence}%`],
      ]),
    );
    lines.push("");
    lines.push(`- confidence reason: ${sink.confidenceReason}`);
    lines.push(`- risk: ${sink.confidenceRisk}`);
    lines.push("");
    lines.push("**Why this was selected**");
    lines.push("");
    // Use the canonical BURDEN_TERMS labels so the same metric is never named
    // three different ways across views (LABEL-1).
    lines.push(`- path depth ${sink.metrics.maximumPathDepth}`);
    lines.push(`- defensive operations ${sink.metrics.defensiveOperationCount}`);
    lines.push(`- representation churn ${sink.metrics.representationChurn}`);
    lines.push(`- impossible defenses ${sink.metrics.impossibleDefenseCount}`);
    if (sink.metrics.packRisk > 0) {
      lines.push(`- pack risk ${sink.metrics.packRisk}`);
    }
    lines.push("");
    lines.push("**Representative path**");
    lines.push("");
    lines.push(
      "_Read top → bottom: each row is derived from the row above (the verb says how), and «marked» is the piece that flowed in from the previous step; the last row is the value JSX renders. ▸ marks recommended extraction boundaries._",
    );
    lines.push("");
    lines.push(...fenced(representativePathWithBoundaries(sink)));
    lines.push("");
    if (group) {
      lines.push("**Pack verdict**");
      lines.push("");
      lines.push(...fenced(packVerdictLines(group)));
      lines.push("");
    }
    if (group?.verdict === "overpacked-bag") {
      lines.push("**Sink-family split**");
      lines.push("");
      lines.push(...fenced(overpackedSplitLines(group)));
      lines.push("");
    }
    const proposal = extractionProposalFor(sink);
    if (proposal) {
      lines.push("**Extraction proposal**");
      lines.push("");
      lines.push(...fenced(proposal));
      lines.push("");
    }
    const shapeCheck = extractionShapeCheckFor(sink, group, renderGroups);
    if (shapeCheck) {
      lines.push("**Extraction shape check**");
      lines.push("");
      lines.push(...fenced(shapeCheck));
      lines.push("");
    }
    lines.push("**Candidate edits**");
    lines.push("");
    candidateEditsFor(sink, group).forEach((edit, editIndex) => {
      lines.push(`${editIndex + 1}. ${edit}`);
    });
    lines.push("");
    lines.push("**Risk**");
    lines.push("");
    lines.push(`- ownership: ${ownershipHintFor(sink)}`);
    lines.push(`- queue: ${sink.queue}`);
    if (sink.metrics.unknownEdgeCount > 0) {
      lines.push(
        `- ${sink.metrics.unknownEdgeCount} unknown edge(s) require investigation`,
      );
    }
    lines.push("");
  });
  appendStopRecommendation(lines, report);
  appendBackgroundFindings(lines, report, args);
  appendBaseline(lines, report);
  return `${lines.join("\n")}\n`;
}

function appendBackgroundFindings(lines, report, args) {
  const rows = report.rankings.all
    .filter((sink) => sink.background)
    .slice(0, Math.min(5, args.maxItems));
  if (rows.length === 0) return;
  lines.push("## Background Findings");
  lines.push("");
  lines.push("These paths are true but not recommended as cleanup work:");
  lines.push("");
  lines.push(
    ...formatMarkdownTable(
      ["Location", "Expression", "Classification", "Reason"],
      rows.map((sink) => [
        `${sink.file}:${sink.line}`,
        formatExpression(sink.expression, 28),
        sink.background.label,
        sink.background.reason,
      ]),
    ),
  );
  lines.push("");
  lines.push("Action: leave these unless adjacent edits make them redundant.");
  lines.push("");
}

function extractionShapeCheckFor(sink, packGroup, renderGroups = []) {
  if (sinkFamilyOf(sink) === "svg-shell") {
    return [
      "verdict: root shell scalar",
      `attribute: ${sinkAttributeName(sink) ?? "svg shell"}`,
      "reason: this sizes or frames the root SVG/HTML shell, not a repeated rendered item.",
      "recommendation: keep the calculation inline or as a tiny local thunk above the render block unless several render surfaces share one typed size boundary.",
    ];
  }
  if (classifyPathShape(sink).includes("local-scalar-geometry")) {
    return [
      "verdict: repeated scalar; prefer local variable",
      `attribute: ${sinkAttributeName(sink) ?? "SVG scalar"}`,
      "reason: this is fixed local SVG scalar math, not a repeated rendered item model or shared helper boundary.",
      "recommendation: name the scalar near JSX, for example center, radius, circumference, trackDasharray, or indicatorDasharray; do not introduce a helper type/function just to avoid repeated arithmetic.",
    ];
  }
  const renderGroup = renderGroups.find((group) =>
    group.sinks.some((member) => member.id === sink.id),
  );
  const representative = renderGroup?.sinks
    .slice()
    .sort((left, right) => right.scores.burden - left.scores.burden)[0];
  if (renderGroup && representative?.id === sink.id) {
    return [
      "verdict: cohesive repeated item",
      `rendered thing: ${renderGroup.renderedThing}`,
      `suggested shape: ${renderGroup.shape}`,
      `reason: ${renderGroup.fields.join(", ")} are consumed together for repeated ${pluralRenderedThing(renderGroup.renderedThing)}.`,
    ];
  }
  if (packGroup?.verdict === "mirror-object") {
    return [
      "verdict: mirror singleton risk",
      `candidate: ${packGroup.label}`,
      "reason: this object mostly gathers source fields without shared render-item consumption.",
      "recommendation: prefer narrow scalar helpers or inline reads unless a rerun shows multiple fields consumed together.",
    ];
  }
  if (mirrorSingletonRiskFor(sink)) {
    return [
      "verdict: mirror singleton risk",
      `candidate: ${renderedThingFor(sink)}`,
      "reason: this looks like local scalar or coordinate plumbing, not repeated item data.",
      "recommendation: avoid a broad singleton object; prefer narrow scalar helpers unless related fields are consumed together.",
    ];
  }
  return null;
}

function mirrorSingletonRiskFor(sink) {
  const family = sinkFamilyOf(sink);
  if (family === "svg-shell") return false;
  if ((sink.metrics.maximumPathDepth ?? 0) < 4) return false;
  return (
    ["geometry", "svg-shell", "other"].includes(family) &&
    classifyPathShape(sink).some((shape) =>
      ["geometry-chain", "domain-normalization"].includes(shape),
    ) &&
    (sink.metrics.representationChurn >= 3 || sink.metrics.mergeWidth >= 3) &&
    !classifyPathShape(sink).includes("collection-render-model") &&
    !sink.packVerdicts?.includes("cohesive-render-model")
  );
}

function isLocalScalarGeometry(sink) {
  const attribute = sinkAttributeName(sink);
  if (!attribute || !LOCAL_SCALAR_GEOMETRY_ATTRIBUTES.has(attribute)) {
    return false;
  }
  if (
    ![
      "cx",
      "cy",
      "r",
      "stroke-dasharray",
      "strokeDasharray",
      "stroke-dashoffset",
      "strokeDashoffset",
    ].includes(attribute)
  ) {
    return false;
  }
  if (sinkFamilyOf(sink) === "svg-shell") return false;
  if (sink.packVerdicts?.includes("cohesive-render-model")) return false;
  if (
    classifyPathText(sink).match(
      /\b(?:map|filter|flatMap|reduce|For|each|index\s*\(|value\s*=>)\b/,
    )
  ) {
    return false;
  }
  const metrics = sink.metrics ?? {};
  if ((metrics.packRisk ?? 0) > 0) return false;
  const text = classifyPathText(sink);
  const hasScalarMath =
    /[-+*/%]/.test(text) ||
    /\b(?:Math\.|PI|circumference|radius|center|dash|size|strokeWidth|stroke-width)\b/i.test(
      text,
    );
  if (!hasScalarMath) return false;
  return true;
}

function classifyPathText(sink) {
  return [
    sink.label,
    sink.expression,
    ...(sink.representativeSteps ?? []).map((step) => step.label),
  ].join(" ");
}

function appendGroupedRecommendations(lines, report, args) {
  const groups = groupedRenderRecommendations(report.rankings.all).slice(0, 5);
  if (groups.length === 0) return;
  lines.push("## Grouped Recommendations");
  lines.push("");
  for (const group of groups) {
    lines.push(`**${group.title}**`);
    lines.push("");
    lines.push(
      ...formatMarkdownTable(
        ["Component", "Rendered thing", "Sinks", "Fields", "Suggested shape"],
        [
          [
            group.component,
            group.renderedThing,
            String(group.sinkCount),
            group.fields.join(", "),
            group.shape,
          ],
        ],
      ),
    );
    lines.push("");
    lines.push(`Why: ${group.reason}`);
    lines.push("");
  }
}

function groupedRenderRecommendations(sinks) {
  const buckets = new Map();
  for (const sink of sinks) {
    if (!isRenderItemGroupingCandidate(sink)) continue;
    const component = sink.renderContext?.component ?? "local render";
    const renderedThing = groupedRenderedThing(sink);
    const key = `${sink.file}::${component}::${renderedThing}`;
    let group = buckets.get(key);
    if (!group) {
      group = { file: sink.file, component, renderedThing, sinks: [] };
      buckets.set(key, group);
    }
    group.sinks.push(sink);
  }
  return Array.from(buckets.values())
    .map((group) => {
      const fields = unique(group.sinks.map(groupedFieldName)).filter(Boolean);
      const roots = unique(
        group.sinks.flatMap((sink) =>
          fanOutRootsFor(sink).map((info) => formatExpression(info.label, 32)),
        ),
      ).slice(0, 4);
      const plural = pluralRenderedThing(group.renderedThing);
      return {
        ...group,
        title: `Extract ${plural}`,
        sinkCount: group.sinks.length,
        fields,
        shape: `${pascalCase(singularRenderedThing(group.renderedThing))}[]`,
        reason: `${roots.join(", ") || "the same local inputs"} feed ${fields.join("/")} for one ${group.renderedThing}.`,
      };
    })
    .filter((group) => group.sinkCount >= 2 && group.fields.length >= 2)
    .sort(
      (left, right) =>
        right.sinkCount - left.sinkCount ||
        right.fields.length - left.fields.length ||
        left.file.localeCompare(right.file),
    );
}

function isRenderItemGroupingCandidate(sink) {
  const family = sinkFamilyOf(sink);
  const tag = sink.renderContext?.tag;
  return (
    !classifyPathShape(sink).includes("local-scalar-geometry") &&
    String(tag ?? "").toLowerCase() !== "line" &&
    ["geometry", "style", "identity", "text"].includes(family) &&
    (isSvgLikeTag(tag) || sink.category === "rendered-value") &&
    sink.metrics.maximumPathDepth >= 3
  );
}

function isSvgLikeTag(tag) {
  return ["rect", "text", "title", "line", "path", "circle", "g"].includes(
    String(tag ?? "").toLowerCase(),
  );
}

function groupedRenderedThing(sink) {
  const component = sink.renderContext?.component ?? "";
  if (/BarRects?$/i.test(component) || /Bars?$/i.test(component))
    return "bar rectangle";
  if (/Ticks?|Axis/i.test(component)) return "bar tick";
  return renderedThingFor(sink);
}

function groupedFieldName(sink) {
  return (
    sink.renderContext?.attribute ??
    sinkAttributeName(sink) ??
    sink.renderContext?.tag ??
    "text"
  );
}

// REPORT-RECONCILE-1: the fan-out report mirrors the web "network view" — for each
// shared source it lists *every* reached sink grouped by file, with each sink's
// depth, plus the source's definition location and a single/cross-file tag. This is
// the markdown the agent consumes, so it carries the same "lists everything, shows
// depth and usage" content as the on-page graph (not the old 5-column summary).
function renderFanOut(report, args) {
  const entries = fanOutEntriesGlobal(
    report.rankings?.all ?? report.sinks ?? [],
  ).slice(0, args.maxItems);
  const lines = ["# Consumer Fan-Out", "", ...viewIntro("fan-out", report)];
  if (!entries.length) {
    lines.push("_No shared source fans out to ≥2 render sinks._", "");
    return `${lines.join("\n")}\n`;
  }
  for (const entry of entries) {
    const tag =
      entry.fileCount === 1
        ? "single-file (candidate split)"
        : `${entry.fileCount} files (cross-file usage)`;
    lines.push(
      `## ${entry.root} — ${entry.sinkCount} sinks · ${tag} · max depth ${entry.maxDepth}`,
      "",
    );
    if (entry.def) {
      lines.push(`Defined at \`${entry.def.file}:${entry.def.line}\`.`, "");
    }
    const byFile = new Map();
    for (const sink of entry.graphSinks) {
      if (!byFile.has(sink.file)) byFile.set(sink.file, []);
      byFile.get(sink.file).push(sink);
    }
    // MD-1: print the full path once on the file header; sink rows carry only the
    // bare `:line` (+ label/depth). The path is the same for every row in the group,
    // so repeating it is pure token waste — the client resolves the file from the
    // enclosing group header for code previews.
    for (const [file, sinks] of byFile) {
      lines.push(`- **${file}** (${sinks.length})`);
      for (const sink of sinks) {
        const label = sink.label ? ` ${sink.label}` : "";
        lines.push(`  - \`:${sink.line}\`${label} · depth ${sink.depth ?? 0}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderFanIn(report, args) {
  const rows = report.rankings.all
    .slice(0, args.maxItems)
    .map((sink) => [
      `${sink.file}:${sink.line}`,
      String(sink.metrics.mergeWidth),
      String(sink.metrics.controlDependencyCount),
      String(sink.metrics.maximumPathDepth),
    ]);
  return tableReport(
    "Sink Fan-In",
    ["Sink", "Root sources", "Predicates", "Max distance"],
    rows,
    viewIntro("fan-in", report),
  );
}

function renderPathFamilies(report, args) {
  const families = familyRows(report.sinks).slice(0, args.maxItems);
  const rows = families.map((family) => [
    code(family.signature),
    String(family.paths),
    String(family.sinks),
    String(family.maxDepth),
  ]);
  const lines = tableReport(
    "Path Families",
    ["Signature", "Paths", "Sinks", "Max depth"],
    rows,
    viewIntro("path-families", report),
  ).split("\n");

  // MD-7: the table only counts; show a representative example per family — the
  // deepest member's path — so the recurring shape is concrete and a single shared
  // fix can be reasoned about. Biggest/gnarliest families first.
  const withExamples = families
    .filter((family) => family.example)
    .sort((a, b) => b.sinks * b.maxDepth - a.sinks * a.maxDepth);
  if (withExamples.length) {
    lines.push("## Representative examples", "");
    for (const family of withExamples) {
      const sink = family.example;
      lines.push(
        `### ${code(family.signature)} — ${plural(family.sinks, "sink")}, max depth ${family.maxDepth}`,
        "",
        `Deepest member: \`${sink.file}:${sink.line}\``,
        "",
        ...fenced(representativePathLines(sink)),
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderDefensiveLedger(report, args) {
  // One defense can reach many sinks (e.g. a `size` fallback that drives several
  // JSX outputs), so the same guard would otherwise repeat once per reachable
  // sink. Dedupe by location+expression and surface the fan-out as a count so
  // the breadth is preserved without wasting rows on identical entries.
  const byKey = new Map();
  for (const sink of report.sinks) {
    for (const defense of sink.defenses) {
      const key = `${sink.file}:${defense.location.line}|${defense.expression}`;
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { sink, defense, count: 1 });
    }
  }
  // Impossible verdicts (dead guards) matter most; rank them first so a small
  // --max-items cap surfaces the worst, not whatever was encountered first.
  // Tie-break on fan-out (count) so a guard that reaches many sinks wins.
  const verdictRank = { impossible: 0, possible: 1, unknown: 2 };
  const rows = [...byKey.values()]
    .sort((a, b) => {
      const va = verdictRank[a.defense.verdict] ?? 3;
      const vb = verdictRank[b.defense.verdict] ?? 3;
      if (va !== vb) return va - vb;
      return b.count - a.count;
    })
    .slice(0, args.maxItems)
    .map(({ sink, defense, count }) => [
      `${sink.file}:${defense.location.line}`,
      code(formatExpression(defense.expression)),
      code(defense.type),
      String(count),
      defense.verdict,
      defense.origin ?? "—",
      defensiveActionFor(defense),
    ]);
  return tableReport(
    "Defensive Logic",
    ["Location", "Expression", "Type", "Sinks", "Verdict", "Origin", "Action"],
    rows,
    viewIntro("defensive-ledger", report),
  );
}

function defensiveActionFor(defense) {
  if (defense.verdict === "impossible") return "remove after contract check";
  if (/solid prop default/i.test(defense.origin ?? "")) {
    return "promote to mergeProps default";
  }
  if (/api-choice/i.test(defense.origin ?? "")) {
    return "keep caller-precedence fallback";
  }
  if (/parser-boundary|compatibility|optional/i.test(defense.origin ?? "")) {
    return "keep as certainty boundary";
  }
  if (defense.verdict === "unknown") return "inspect runtime shape";
  return "review boundary placement";
}

function renderPropRelay(report, args) {
  const rows = report.rankings.all
    .slice(0, args.maxItems)
    .map((sink) => [
      `${sink.file}:${sink.line}`,
      String(Math.max(0, sink.metrics.mergeWidth - 1)),
      String(sink.metrics.representationChurn),
      sink.metrics.helperHops === 0 ? "pure data relay" : "transformed relay",
    ]);
  return tableReport(
    "Prop Relay",
    ["Sink", "Component boundaries", "Wrapper steps", "Classification"],
    rows,
    viewIntro("prop-relay", report),
  );
}

function renderContextRelay(report, args) {
  const findings = report.contextRelay.slice(0, args.maxItems);
  const rows = findings.map((finding) => [
    `${finding.parentFile}:${finding.line}`,
    finding.childComponent,
    finding.contextHooks.join(", "),
    finding.props.join(", "),
    finding.signal,
  ]);
  const lines = tableReport(
    "Context Relay",
    ["Parent", "Child", "Context hooks in parent", "Passed props", "Signal"],
    rows,
    viewIntro("context-relay", report),
  ).split("\n");

  // MD-6: the table summarizes; the evidence below shows *why* each example reads as
  // a relay so an agent can act without re-deriving it — the parent already holds the
  // context, and the props it forwards (especially the shared-named ones) duplicate
  // values the child could read from context directly.
  if (findings.length) {
    lines.push("## Why these are relays", "");
    for (const finding of findings) {
      lines.push(
        `### ${finding.childComponent} — \`${finding.parentFile}:${finding.line}\``,
        "",
        `- Parent reads context via ${finding.contextHooks.map((hook) => code(hook)).join(", ") || "_(context hooks in scope)_"}.`,
        `- It forwards ${plural(finding.props.length, "prop")} to \`${finding.childComponent}\`: ${finding.props.map((prop) => code(prop)).join(", ")}.`,
      );
      if (finding.sharedProps?.length) {
        lines.push(
          `- ${plural(finding.sharedProps.length, "prop")} reuse a context-shaped name — ${finding.sharedProps
            .map((prop) => code(prop))
            .join(", ")} — so the child could read ${finding.sharedProps.length === 1 ? "it" : "them"} from context instead of receiving ${finding.sharedProps.length === 1 ? "it" : "them"} as ${finding.sharedProps.length === 1 ? "a prop" : "props"}.`,
        );
      } else {
        lines.push(
          `- Signal: ${finding.signal} — the whole bundle is forwarded from a context-aware parent.`,
        );
      }
      lines.push(
        `- Open \`${finding.parentFile}:${finding.line}\` to see the hand-off.`,
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

// MD-5: the consolidated, agent- *and* human-facing summary. It absorbs the old
// repair-map, hotspots, and unknown-edges aggregators into ONE document and opens
// with a manifest of every other report, so an agent landing in the dumped markdown
// has a single place to orient before reading the focused reports.
function reportManifestLines() {
  const lines = [
    "## Report guide",
    "",
    "Every analysis is emitted as its own markdown file. Start here, then open the one that fits the task:",
    "",
  ];
  for (const view of REPORT_VIEWS) {
    if (view === "overview") continue;
    const blurb = VIEW_BLURBS[view] ?? "";
    // First sentence only — a one-line purpose, not the full intro.
    const purpose = blurb ? blurb.split(/(?<=\.)\s/)[0] : "";
    lines.push(`- \`${view}.md\` — ${purpose}`);
  }
  lines.push("");
  return lines;
}

function renderOverviewReport(report, args) {
  const lines = ["# Overview", "", ...viewIntro("overview", report)];
  lines.push(...reportManifestLines());

  // Concentration + feature clusters (from the old repair-map).
  appendFeatureClusters(lines, report, args);
  lines.push(...concentrationLines(report, report.rankings.all.length));

  // Hotspots: one row per file (or per feature with --by feature) so the spread of
  // work is visible at a glance (old hotspots view).
  const by = args.by === "feature" ? "feature" : "file";
  const groups = hotspotGroups(report, by).slice(0, args.maxItems);
  if (groups.length) {
    lines.push("## Hotspots", "");
    lines.push(
      ...formatMarkdownTable(
        [
          by === "feature" ? "Feature" : "File",
          "Findings",
          "Worst",
          "Dominant shape",
          "Ownership",
          "First cut",
        ],
        groups.map((group) => [
          group.key,
          String(group.count),
          group.worst.toFixed(2),
          modalValue(group.shapes),
          modalValue(group.ownership),
          firstCutFor(group.worstSink),
        ]),
      ),
    );
    lines.push("");
  }

  // Repair buckets (old repair-map).
  for (const [heading, sinks] of [
    ["Peripheral quick wins", report.rankings.quickWins],
    ["Central leverage", report.rankings.centralLeverage],
    ["Investigate", report.rankings.investigations],
  ]) {
    lines.push(`## ${heading}`, "");
    const selected = (sinks ?? []).slice(0, args.maxItems);
    if (selected.length === 0) lines.push("- none");
    selected.forEach((sink) => {
      lines.push(
        `- **${sink.scores.burden.toFixed(1)}** ${sink.file}:${sink.line} — ${findingTitle(sink)} _(${ownershipHintFor(sink)})_`,
      );
    });
    lines.push("");
  }

  // Unknown edges, folded in as a diagnostic section (not its own file). The user
  // keeps the signal — "if a whole file is unknown, that flags a problem."
  const unknown = (report.unknownEdges ?? []).slice(0, args.maxItems);
  lines.push("## Unknown edges (diagnostic)", "");
  if (unknown.length === 0) {
    lines.push("No unresolved graph edges in the selected render paths.", "");
  } else {
    lines.push(
      ...formatMarkdownTable(
        ["Where", "Kind", "Unresolved", "Affected sinks"],
        unknown.map((row) => [
          `${row.file}:${row.line ?? "?"}`,
          row.kind,
          code(formatExpression(row.label, 48)),
          affectedSinkSummary(row.affectedSinks),
        ]),
      ),
    );
    lines.push("");
  }

  appendStopRecommendation(lines, report);
  appendBaseline(lines, report);
  return `${lines.join("\n")}\n`;
}

// Concise "suggested first cut" per shape — the headline action for a hotspot.
const SHAPE_FIRST_CUT = {
  "svg-shell": "keep shell sizing inline",
  "local-scalar-geometry": "name repeated local scalars",
  "geometry-chain": "extract render item geometry",
  "collection-render-model": "extract rendered items",
  "control-flow-gate": "name the predicate",
  "presentation-pack": "split the class/style object",
  "domain-normalization": "normalize at the boundary",
  "solid-prop-default-boundary": "promote prop defaults to mergeProps",
  "cross-component-relay": "move state behind context",
};

export function firstCutFor(sink) {
  if (!sink) return "—";
  return SHAPE_FIRST_CUT[primaryShapeOf(sink)] ?? "local boundary cleanup";
}

function appendStopRecommendation(lines, report) {
  const stop = stopRecommendationFor(report);
  lines.push("## Stop Recommendation");
  lines.push("");
  lines.push(`Stop recommendation: ${stop.recommend ? "yes" : "no"}`);
  lines.push(`Reason: ${stop.reason}`);
  if (stop.recommend) {
    lines.push(
      "Next useful work would require broader architecture changes, not local cleanup.",
    );
  }
  lines.push("");
}

// The most common value in a list (for dominant shape/ownership columns).
export function modalValue(values) {
  const counts = countBy(values);
  const entries = Object.entries(counts).sort(
    (left, right) => right[1] - left[1],
  );
  return entries[0]?.[0] ?? "—";
}

// Approach 4 — aggregate the burden ranking into one row per file (or feature
// area). The breadth map: every place with a finding appears once.
export function hotspotGroups(report, by) {
  const groups = new Map();
  for (const sink of report.rankings.all) {
    const key = by === "feature" ? featureKeyFor(sink.file) : sink.file;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        count: 0,
        worst: 0,
        sumBurden: 0,
        maxReach: 0,
        shapes: [],
        ownership: [],
        worstSink: null,
      };
      groups.set(key, group);
    }
    group.count += 1;
    group.sumBurden += sink.scores.burden;
    if (sink.scores.burden > group.worst) {
      group.worst = sink.scores.burden;
      group.worstSink = sink;
    }
    group.maxReach = Math.max(group.maxReach, sink.metrics.reachableSinks);
    group.shapes.push(primaryShapeOf(sink));
    group.ownership.push(ownershipHintFor(sink));
  }
  return Array.from(groups.values()).sort(
    (left, right) =>
      right.sumBurden - left.sumBurden || right.worst - left.worst,
  );
}

// Approach 2 — classify every function reached on a render path as a data-flow
// boundary, ranked by "boundary debt".
function renderBoundaryReport(report, args) {
  const helpers = (report.helpers ?? []).slice(0, args.maxItems);
  if (helpers.length === 0) {
    return `# Boundary Report\n\n${viewIntro("boundary-report", report).join("\n")}No first-party helper functions were reached on a render path.\n(Imported library calls stay opaque; try --max-helper-depth.)\n`;
  }
  const rows = helpers.map((helper) => [
    `${helper.name}()`,
    `${helper.file}:${helper.line}`,
    String(helper.arity),
    String(helper.inSources),
    String(helper.callerCount),
    `${helper.internalDepth}/${helper.internalChurn}`,
    code(formatExpression(helper.returnType, 36)),
    helper.verdict,
  ]);
  const lines = [
    ...tableReport(
      "Boundary Report",
      [
        "Function",
        "Where",
        "Arity",
        "In-src",
        "Callers",
        "Internal d/churn",
        "Return type",
        "Verdict",
      ],
      rows,
      viewIntro("boundary-report", report),
    ).split("\n"),
  ];
  lines.push("## Worst boundary debt");
  lines.push("");
  for (const helper of helpers.slice(0, 5)) {
    lines.push(
      `- **${helper.name}** (${helper.verdict}) — ${boundaryNote(helper)}`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}`;
}

// XREF-1: "where used" for components. Each row is a component definition and
// the JSX sites that render it (resolved by symbol, not name). Locations are
// emitted as file:line so peekReferences makes every use site click-to-reveal.
function renderComponentRefs(report, args) {
  const rows = (report.componentRefs ?? []).slice(0, args.maxItems);
  if (rows.length === 0) {
    return `# References\n\n${viewIntro("component-refs", report).join("\n")}No component usages were resolved in the selected files.\n`;
  }
  return tableReport(
    "References",
    ["Component", "Defined", "Uses", "Used by"],
    rows.map((row) => {
      const shown = row.uses.slice(0, 6).map((u) => `${u.file}:${u.line}`);
      const extra = row.useCount - shown.length;
      return [
        code(row.name),
        `${row.file}:${row.line ?? "?"}`,
        String(row.useCount),
        shown.join("; ") + (extra > 0 ? ` … +${extra} more` : ""),
      ];
    }),
    viewIntro("component-refs", report),
  );
}

function affectedSinkSummary(sinks) {
  if (!sinks?.length) return "";
  return sinks
    .slice(0, 4)
    .map((sink) => `${sink.file}:${sink.line} ${formatExpression(sink.label, 32)}`)
    .join("; ");
}

// A one-line, human reason for a function's verdict.
function boundaryNote(helper) {
  switch (helper.verdict) {
    case "thin pass-through (inline)":
      return `forwards a parameter with no transformation across ${helper.callerCount} call site(s); inlining removes a hop for free.`;
    case "confluence / junction":
      return `${helper.inSources} source lineages converge here and the result feeds ${helper.callerCount} call sites — a load-bearing knot (see Junctions).`;
    case "leaky boundary":
      return `collapses ${helper.inSources} sources into \`${formatExpression(helper.returnType, 40)}\`; downstream code must re-narrow it. Tighten the type or split the return.`;
    case "messy internals":
      return `internal depth ${helper.internalDepth}, churn ${helper.internalChurn}, ${helper.internalDefenses} defensive op(s) behind a narrow signature.`;
    case "local scalar math":
      return `small same-component scalar calculation; leave it alone or inline into a nearby local if adjacent JSX becomes clearer.`;
    default:
      return `narrow signature, concrete return type — a healthy boundary; leave it.`;
  }
}

// Approach 5 — where independent lineages fork in and re-spread. A junction has
// ≥3 in-sources and ≥2 callers; a heavy confluence has many in-sources but one
// consumer.
function renderJunctions(report, args) {
  const helpers = report.helpers ?? [];
  const score = (helper) => helper.inSources * Math.max(1, helper.callerCount);
  const junctions = helpers
    .filter((helper) => helper.inSources >= 3 && helper.callerCount >= 2)
    .sort((left, right) => score(right) - score(left))
    .slice(0, args.maxItems);
  const confluences = helpers
    .filter((helper) => helper.inSources >= 3 && helper.callerCount < 2)
    .sort((left, right) => right.inSources - left.inSources)
    .slice(0, args.maxItems);

  const lines = [
    "# Junctions — where independent lineages meet and re-spread",
    "",
    ...viewIntro("junctions", report),
  ];
  if (junctions.length === 0 && confluences.length === 0) {
    lines.push(
      "No confluence functions found on render paths (no helper merges ≥3 source lineages).",
    );
    lines.push("");
    return `${lines.join("\n")}`;
  }
  for (const helper of junctions) {
    lines.push(
      `## ${helper.name}   ${helper.file}:${helper.line}   score ${score(helper)}  (${helper.inSources} in × ${helper.callerCount} out)`,
    );
    lines.push("");
    lines.push(...fenced(junctionBody(helper)));
    lines.push("");
  }
  if (confluences.length > 0) {
    lines.push("## Heavy confluences (many sources in, one consumer)");
    lines.push("");
    for (const helper of confluences) {
      lines.push(
        `- **${helper.name}** (${helper.file}:${helper.line}) — ${helper.inSources} lineages → \`${formatExpression(helper.returnType, 40)}\`. Treat as a boundary to tighten, not a junction to split.`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}`;
}

function junctionBody(helper) {
  const lines = ["tributaries (independent lineages flowing in)"];
  const tribs = (helper.inRoots ?? []).length
    ? helper.inRoots
    : helper.params.map((parameter) => parameter.name);
  for (const trib of tribs.slice(0, 8))
    lines.push(`  ${formatExpression(trib, 48)}`);
  lines.push("distributaries (where the result re-spreads)");
  for (const caller of (helper.callers ?? []).slice(0, 8)) {
    lines.push(`  ${caller.file}:${caller.line}`);
  }
  lines.push("");
  lines.push(
    `Read: ${helper.inSources} source families converge; the result feeds ${helper.callerCount} call sites.`,
  );
  lines.push(
    "Options: formalize as a typed module boundary, or split by distributary if consumers need different shapes.",
  );
  return lines;
}

// Approach 3 — inline-vs-keep decision per reached helper, from its internal
// metrics and caller count (a heuristic preview, not a codemod).
function renderInlinePreview(report, args) {
  // The point of this view is the actionable verdict, so rank the helpers worth
  // inlining first (INLINE), then the fix-the-boundary cases, with plain KEEP
  // last — otherwise the cap shows a wall of "keep" that tells the reader
  // nothing. Decide on the full list before capping.
  const verdictRank = (verdict) => {
    if (verdict === "INLINE") return 0;
    if (verdict === "KEEP (fix boundary)") return 1;
    if (verdict === "KEEP & FORMALIZE") return 2;
    return 3; // plain KEEP
  };
  const ranked = (report.helpers ?? [])
    .map((helper) => ({ helper, decision: inlineDecision(helper) }))
    .sort((a, b) => verdictRank(a.decision.verdict) - verdictRank(b.decision.verdict));
  const helpers = ranked.slice(0, args.maxItems);
  const lines = [
    "# Inline Preview",
    "",
    ...viewIntro("inline-preview", report),
  ];
  if (helpers.length === 0) {
    lines.push("No first-party helpers were reached on a render path.");
    lines.push("");
    return `${lines.join("\n")}`;
  }
  if (!helpers.some(({ decision }) => decision.verdict === "INLINE")) {
    lines.push(
      "Nothing here is worth inlining — every reached helper is a genuine boundary (verdict KEEP). Listed worst-first for review.",
    );
    lines.push("");
  }
  for (const { helper, decision } of helpers) {
    lines.push(
      `## ${helper.name}  (${helper.file}:${helper.line} · ${helper.callerCount} caller(s) · ${helper.verdict})`,
    );
    lines.push("");
    lines.push(
      ...fenced([
        `as a step:   1 hop`,
        `if inlined:  ~${Math.max(1, helper.internalDepth)} hop(s)   Δ depth ${formatDelta(helper.internalDepth - 1)}, churn ${formatDelta(helper.internalChurn)}, defenses ${formatDelta(helper.internalDefenses)}`,
        `verdict: ${decision.verdict} — ${decision.why}`,
      ]),
    );
    // INLINE-1: list the actual consumers (call sites) so "could this be inlined?"
    // is answerable — you can see every place the fold would land. Caller counts are
    // now truthful across path-alias programs (BUG-2), so a "0 callers" here is real.
    const callers = helper.callers ?? [];
    if (callers.length === 0) {
      lines.push(
        "",
        `Consumers: none resolved${helper.callerCount > 0 ? ` (${helper.callerCount} counted)` : ""}.`,
      );
    } else {
      lines.push("", "Consumers (call sites):");
      for (const caller of callers) {
        lines.push(`- \`${caller.file}:${caller.line}\``);
      }
      if (helper.callerCount > callers.length) {
        lines.push(`- _+${helper.callerCount - callers.length} more_`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}`;
}

function inlineDecision(helper) {
  if (helper.inSources >= 3 && helper.callerCount >= 2) {
    return {
      verdict: "KEEP & FORMALIZE",
      why: `${helper.callerCount} callers + real internal work; inlining would duplicate logic. Make it a typed boundary (see Junctions).`,
    };
  }
  if (helper.passThrough && helper.internalDepth <= 1) {
    return {
      verdict: "INLINE",
      why: `pure forwarding hop${helper.callerCount > 2 ? ` (note: ${helper.callerCount} callers — a codemod, flagged not done)` : ""}.`,
    };
  }
  if (
    helper.callerCount <= 2 &&
    helper.internalDepth <= 2 &&
    !helper.typeLeak
  ) {
    return {
      verdict: "INLINE",
      why: `shallow body, few callers — the helper adds indirection without consolidating much.`,
    };
  }
  if (helper.typeLeak) {
    return {
      verdict: "KEEP (fix boundary)",
      why: `inlining dumps the body into the render leaf; the helper should exist but its type leaks — tighten it instead (see Repair Map).`,
    };
  }
  return {
    verdict: "KEEP",
    why: `genuine transformation (${helper.callerCount} callers, internal depth ${helper.internalDepth}); inlining would relocate the mess, not remove it.`,
  };
}

function formatDelta(value) {
  return value > 0 ? `+${value}` : String(value);
}

function appendFeatureClusters(lines, report, args) {
  const rows = featureClusterRows(report.rankings.all).slice(
    0,
    Math.min(args.maxItems, 8),
  );
  if (rows.length === 0) return;
  lines.push("## Feature Clusters");
  lines.push("");
  lines.push(
    ...formatMarkdownTable(
      [
        "Feature area",
        "Sinks",
        "Files",
        "Max depth",
        "Wrapper steps",
        "Suggested first cut",
        "Evidence",
      ],
      rows,
    ),
  );
  lines.push("");
}

function featureClusterRows(sinks) {
  const clusters = new Map();
  for (const sink of sinks) {
    const key = featureKeyFor(sink.file);
    const cluster = clusters.get(key) ?? {
      sinks: 0,
      files: new Set(),
      maxDepth: 0,
      wrappers: 0,
      providerContextSignals: 0,
      evidence: [],
      localSignals: 0,
      shapes: [],
    };
    cluster.sinks += 1;
    cluster.files.add(sink.file);
    cluster.maxDepth = Math.max(
      cluster.maxDepth,
      sink.metrics.maximumPathDepth,
    );
    cluster.wrappers += sink.metrics.representationChurn;
    const evidence = providerContextEvidenceFor(sink);
    if (evidence.eligible) cluster.providerContextSignals += 1;
    else cluster.localSignals += 1;
    cluster.evidence.push(evidence.reason);
    cluster.shapes.push(primaryShapeOf(sink));
    clusters.set(key, cluster);
  }
  return Array.from(clusters.entries())
    .map(([feature, cluster]) => {
      const providerShare =
        cluster.providerContextSignals / Math.max(1, cluster.sinks);
      const providerContext =
        cluster.providerContextSignals >= 2 ||
        (cluster.providerContextSignals > 0 && providerShare >= 0.35);
      return [
        feature,
        String(cluster.sinks),
        String(cluster.files.size),
        String(cluster.maxDepth),
        String(cluster.wrappers),
        providerContext
          ? "Provider/Context audit"
          : localFirstCutForCluster(cluster),
        providerContext
          ? providerEvidenceSummary(cluster.evidence)
          : "no provider/context signals",
      ];
    })
    .sort(
      (left, right) =>
        Number(right[1]) - Number(left[1]) ||
        Number(right[3]) - Number(left[3]) ||
        Number(right[4]) - Number(left[4]),
    );
}

function featureKeyFor(file) {
  const parts = file.split("/");
  const sourceIndex = parts.findIndex((part) => part === "src");
  const offset = sourceIndex >= 0 ? sourceIndex + 1 : 0;
  const directoryParts = parts.slice(
    offset,
    Math.max(offset + 1, parts.length - 1),
  );
  return directoryParts.slice(0, 3).join("/") || path.dirname(file);
}

// The JSX attribute name a sink renders into (`transform` from `transform={...}`),
// or null for bare rendered values / text nodes.
function sinkAttributeName(sink) {
  const match = /^([A-Za-z0-9_-]+)=\{/.exec(sink.label ?? "");
  return match ? match[1] : null;
}

// Phase 1 — classify the data-flow path feeding a sink into zero or more shape
// tags, derived purely from the sink's own trace (no repo scanning). Tags are
// non-exclusive; the array is returned in a fixed priority order so callers can
// treat element 0 as the primary shape.
export function classifyPathShape(sink) {
  const attribute = sinkAttributeName(sink);
  const steps = sink.representativeSteps ?? [];
  const kinds = new Set(steps.map((step) => step.kind));
  const labelText = steps.map((step) => step.label).join(" ");
  const metrics = sink.metrics;
  const rootInfos = sink.rootInfos ?? [];
  const tags = [];

  if (attribute && SVG_SHELL_ATTRIBUTES.has(attribute)) {
    tags.push("svg-shell");
  }

  if (isLocalScalarGeometry(sink)) {
    tags.push("local-scalar-geometry");
  }

  const hasArithmetic = /[-+*/%]/.test(labelText) || kinds.has("template");
  if (
    (attribute && GEOMETRY_FAMILY_ATTRIBUTES.has(attribute)) ||
    (kinds.has("template") &&
      hasArithmetic &&
      metrics.controlDependencyCount > 0)
  ) {
    tags.push("geometry-chain");
  }

  if (
    (sink.category === "render-control" && attribute === "each") ||
    /\.(map|filter|sort|flatMap|reduce|slice)\(/.test(labelText)
  ) {
    tags.push("collection-render-model");
  }

  if (
    (attribute && (attribute === "when" || attribute === "fallback")) ||
    (metrics.controlDependencyCount > 0 &&
      metrics.defensiveOperationCount > 0 &&
      sink.category === "render-control")
  ) {
    tags.push("control-flow-gate");
  }

  if (
    sink.category === "style" ||
    (kinds.has("object-pack") && attribute && STYLE_ATTRIBUTES.has(attribute))
  ) {
    tags.push("presentation-pack");
  }

  if (
    metrics.defensiveOperationCount > 0 ||
    (metrics.controlDependencyCount > 0 &&
      rootInfos.some((info) => info.kind === "prop-read"))
  ) {
    tags.push("domain-normalization");
  }

  if (hasSolidPropDefaultBoundary(sink)) {
    tags.push("solid-prop-default-boundary");
  }

  if (
    metrics.mergeWidth > 1 &&
    metrics.helperHops === 0 &&
    rootInfos.length > 0 &&
    rootInfos.every(
      (info) => info.kind === "prop-read" || info.kind === "parameter",
    )
  ) {
    tags.push("cross-component-relay");
  }

  return tags;
}

// Plain-English noun for a shape tag — used in reviewer summaries (Phase 6).
const SHAPE_PHRASES = {
  "svg-shell": "SVG shell sizing",
  "local-scalar-geometry": "local SVG scalar geometry",
  "geometry-chain": "SVG/layout geometry",
  "collection-render-model": "collection rendering",
  "control-flow-gate": "control-flow gating",
  "presentation-pack": "class/style packing",
  "domain-normalization": "defaulting and normalization",
  "solid-prop-default-boundary": "Solid optional prop defaults",
  "cross-component-relay": "cross-component prop relay",
};

// One-line headline fix per primary shape — the lead sentence of the reviewer
// summary (Phase 6) and the spine of the candidate edits (Phase 2).
const SHAPE_HEADLINE_FIX = {
  "svg-shell":
    "keep root shell sizing inline or in a tiny local thunk unless it is a shared typed boundary",
  "local-scalar-geometry":
    "name the repeated scalar locally before JSX instead of introducing a helper type or helper function",
  "geometry-chain":
    "compute cohesive render-item geometry in a memo, then read named fields in JSX",
  "collection-render-model":
    "extract rendered items into a memo and render one component per item",
  "control-flow-gate":
    "name the scalar predicate or selected value so the gate reads as a sentence",
  "presentation-pack":
    "split style/class values by render responsibility before considering a packed object",
  "domain-normalization":
    "resolve defaults and normalization at a named boundary before JSX",
  "solid-prop-default-boundary":
    "use mergeProps once near the Solid component boundary, then read merged local props in JSX",
  "cross-component-relay":
    "move shared state behind a Provider/Context instead of threading props",
};

function candidateEditsFor(sink, group = null) {
  const shapes = classifyPathShape(sink);
  const reminder =
    "Keep JSX scannable — attributes should read named values, not derive them.";

  if (group?.verdict === "normalization-boundary") {
    return [
      "Keep the parser/model object as the normalization boundary; move defaults, parsing fragments, and derived fields there.",
      "Let JSX read the typed parsed fields directly instead of recomputing or slicing around the raw input.",
      "Do not split this pack just because it is an object; rerun only to confirm the verdict stays a normalization boundary.",
      reminder,
    ];
  }

  if (
    group &&
    ["overpacked-bag", "mirror-object", "relay-bag"].includes(group.verdict)
  ) {
    return [
      "Split the packed object by render responsibility instead of widening it.",
      "Keep style, geometry, identity, text, and control-flow values in separate narrow selectors unless the same consumers use them together.",
      group.verdict === "relay-bag"
        ? "Move broad shared state closer to consumers, or expose focused selectors from the feature boundary."
        : "Inline mirror fields or extract only the derived values that remove repeated work.",
      reminder,
    ];
  }

  // Provider/Context advice is reserved for genuine cross-component relays (or
  // flows already rooted at a feature hook), not local geometry/normalization.
  if (isProviderContextCandidate(sink)) {
    return providerContextEdits(sink);
  }

  if (primaryAdviceShape(sink, shapes) === "solid-prop-default-boundary") {
    const defaults = solidPropDefaultNames(sink);
    const defaultsText = defaults.length ? ` for ${defaults.join(", ")}` : "";
    return [
      `Use Solid mergeProps once near the component boundary${defaultsText}, for example const local = mergeProps({ size: 32, strokeWidth: 4 }, props).`,
      "Let JSX and local geometry/style calculations read the merged local props object instead of repeating props.foo ?? default at render leaves.",
      "Keep caller-precedence fallbacks separate when the right-hand side is another real API choice, such as tooltipContent ?? user.displayName.",
      "Do not move valid prop defaults into helper arguments merely to shorten the analyzer path.",
      reminder,
    ];
  }

  const shapeEdits = {
    "svg-shell": [
      "Keep SVG shell attributes such as width, height, and viewBox as root-level values; prefer a simple inline expression or a tiny local thunk immediately above the render block.",
      "If shell sizing depends on optional Solid props, default those props once with mergeProps before the shell calculation.",
      "Do not extract a separate helper function only to pass defaulted shell values as arguments.",
      "Only move shell sizing into a named boundary when the same typed sizing object is shared by several render surfaces.",
    ],
    "local-scalar-geometry": [
      "Name repeated local SVG scalar math once near the JSX, such as center, radius, circumference, trackDasharray, or indicatorDasharray.",
      "Do not introduce a helper type or helper function solely to avoid repeating size() / 2 across a pair of SVG elements.",
      "Keep valid prop defaults as explicit mergeProps certainty boundaries before the geometry math; do not move those fallbacks into helper arguments just to shorten the path.",
    ],
    "geometry-chain": [
      `For repeated rendered items, extract a createMemo returning ${articleFor(renderedThingFor(sink))} ${renderedThingFor(sink)} value (for example { x, y, width, height }); keep the SVG attribute reading named fields.`,
      `Name the memo for what it renders (${pluralRenderedThing(renderedThingFor(sink))}, visibleRows), not a catch-all like layout/view; for fixed sibling scalar math, prefer local aliases instead.`,
      "Do not combine geometry with aria text, labels, control-flow, or styles unless the pack verdict is cohesive.",
      "Resolve unknown or nullable input into a certain value at the nearest true boundary before the geometry math; do not move a legitimate fallback into function arguments just to shorten a path.",
    ],
    "collection-render-model": [
      `Extract ${pluralRenderedThing(renderedThingFor(sink))} into a createMemo that returns the array; feed <For each={...}> and render one component per item.`,
      "Name the memo with a plural noun for what is rendered (realBars, visibleRows).",
    ],
    "control-flow-gate": [
      "Prefer a scalar predicate or selected value for when={...}; avoid creating a broad ready object just to collapse nested gates.",
      "Only pack multiple selected fields when the same consumers use them together and the pack verdict stays cohesive.",
      "Keep fallbacks only when they convert an unknown or optional input into a certain value; avoid wrapping that fallback in a new helper call unless the helper owns the boundary.",
    ],
    "presentation-pack": [
      "Extract narrow style values by responsibility (for example swatchStyle, buttonShadow, spacingLabel) instead of one itemView object.",
      "Keep aria/text/identity fields separate from style and geometry unless consumers always use them together.",
      "Use the pack verdict after rerun: overpacked/mirror/relay means split, cohesive/normalization means keep or formalize.",
    ],
    "domain-normalization": [
      "Resolve defaults, optional reads, and union narrowing at the boundary that truly owns the uncertainty, before JSX reads it.",
      "When the uncertainty is optional Solid component props, prefer a single mergeProps(defaults, props) boundary over repeated leaf fallbacks.",
      "If a fallback is the boundary, keep it close and explicit; do not contort the code so the fallback becomes a helper argument.",
      "Inline representation-only wrappers that have no semantic role.",
    ],
  };

  const primary = primaryAdviceShape(sink, shapes);
  const edits = shapeEdits[primary]
    ? [...shapeEdits[primary]]
    : [
        "Move repeated parsing, formatting, or normalization to the nearest data/model boundary.",
        "Inline representation-only wrappers when they have no semantic role.",
        "Keep the change scoped to the file named above.",
      ];

  if (sink.metrics.impossibleDefenseCount > 0) {
    edits.push(
      "Remove the type-impossible fallback(s) only after confirming the checked type is the real runtime contract.",
    );
  }
  edits.push(reminder);
  return edits;
}

function hasSolidPropDefaultBoundary(sink) {
  return (sink.defenses ?? []).some((defense) =>
    /solid prop default/i.test(defense.origin ?? ""),
  );
}

function solidPropDefaultNames(sink) {
  return unique(
    (sink.defenses ?? [])
      .filter((defense) => /solid prop default/i.test(defense.origin ?? ""))
      .map((defense) => propNameFromExpression(defense.guardedExpression)),
  ).slice(0, 4);
}

function propNameFromExpression(expression) {
  const match = /\.([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(String(expression ?? ""));
  return match?.[1] ?? null;
}

function providerContextEdits(sink) {
  if (hasContextHookRoot(sink)) {
    return [
      "This flow already starts at a feature hook; do not reintroduce parent pass-through props.",
      "If the same property chain appears repeatedly, extract a named selector/action on the feature model.",
      "Keep only row-local items and narrow display props outside the Provider/Context.",
    ];
  }

  if (isProviderContextCandidate(sink)) {
    return [
      "Check whether this feature already has or needs a Provider/Context boundary.",
      "Move shared filters, table state, action state, drafts, and derived selectors behind the feature hook.",
      "Remove same-feature pass-through props; keep only row-local items and narrow display props.",
    ];
  }

  if (sink.metrics.impossibleDefenseCount > 0) {
    return [
      "Add or confirm boundary coverage for the source invariant.",
      "Remove type-impossible defensive operations.",
      "Inline representation-only wrappers when they have no semantic role.",
    ];
  }

  return [
    "Move repeated parsing, formatting, or normalization to the nearest data/model boundary.",
    "Inline representation-only wrappers when they have no semantic role.",
    "Keep the change scoped to the feature area named in the cluster summary.",
  ];
}

function isProviderContextCandidate(sink) {
  return providerContextEvidenceFor(sink).eligible;
}

function providerContextEvidenceFor(sink) {
  if (hasContextHookRoot(sink)) {
    return { eligible: true, reason: "context hook root" };
  }
  const text = pathTextFor(sink);
  if (/\b(?:createContext|useContext)\b/.test(text)) {
    return { eligible: true, reason: "context API call" };
  }
  if (/\b[A-Za-z][A-Za-z0-9_$.]*\.Provider\b/.test(text)) {
    return { eligible: true, reason: "Provider JSX" };
  }
  if (hasImportedFeatureBoundary(sink)) {
    return { eligible: true, reason: "imported feature boundary" };
  }
  const crossComponentRelay = classifyPathShape(sink).includes(
    "cross-component-relay",
  );
  if (
    crossComponentRelay &&
    sink.metrics.mergeWidth > 1 &&
    (sink.metrics.reachableSinks > 3 || sink.metrics.representationChurn > 0)
  ) {
    return { eligible: true, reason: "same-feature prop relay" };
  }
  return { eligible: false, reason: "no provider/context signals" };
}

function pathTextFor(sink) {
  return [
    sink.label,
    sink.expression,
    ...(sink.roots ?? []),
    ...(sink.representativeSteps ?? []).map((step) => step.label),
  ].join(" ");
}

function hasImportedFeatureBoundary(sink) {
  const roots = sink.roots ?? [];
  return (
    roots.some((root) => /^use[A-Z]/.test(root)) ||
    roots.some((root) =>
      /(?:Store|Context|Provider|Feature|State|Model)$/.test(root),
    )
  );
}

function localFirstCutForCluster(cluster) {
  const dominantShape = modalValue(cluster.shapes ?? []);
  switch (dominantShape) {
    case "local-scalar-geometry":
      return "name repeated local scalars";
    case "svg-shell":
      return "keep shell sizing inline";
    case "collection-render-model":
      return "extract rendered items";
    case "geometry-chain":
      return "extract render item geometry";
    case "control-flow-gate":
      return "name the predicate";
    case "presentation-pack":
      return "split the class/style object";
    case "domain-normalization":
      return "normalize at the boundary";
    default:
      return "local boundary cleanup";
  }
}

function providerEvidenceSummary(evidence) {
  const concrete = unique(
    evidence.filter((reason) => reason !== "no provider/context signals"),
  );
  return concrete.length ? concrete.join(", ") : "provider/context signals";
}

function hasContextHookRoot(sink) {
  return sink.roots.some((root) => /^use[A-Z]/.test(root));
}

// Phase 3a — the render region a sink belongs to. width/height/viewBox are the
// SVG/HTML *shell*; coordinate attributes are *geometry*; when/each/fallback are
// *control-flow*; class/style are *style*; id/href-like fields are *identity*;
// bare values are *text*.
export function sinkFamilyOf(sink) {
  const attribute = sinkAttributeName(sink);
  if (attribute && SVG_SHELL_ATTRIBUTES.has(attribute)) return "svg-shell";
  if (attribute && GEOMETRY_FAMILY_ATTRIBUTES.has(attribute)) return "geometry";
  if (attribute && CONTROL_FLOW_ATTRIBUTES.has(attribute))
    return "control-flow";
  if (attribute && STYLE_ATTRIBUTES.has(attribute)) return "style";
  if (attribute && IDENTITY_ATTRIBUTES.has(attribute)) return "identity";
  if (sink.category === "rendered-value") return "text";
  return "other";
}

// Phase 3b/3c — group sinks that flow through the same packed object (a
// createMemo/object literal). The verdict is evidence-based: a pack can be a
// useful normalization boundary or cohesive render model, not just wrapper
// churn; it becomes suspicious when it mixes sink families, mirrors props, or
// expands one source into broad relay work.
function computePackGroups(sinks) {
  const byPack = new Map();
  for (const sink of sinks) {
    for (const pack of sink.packs ?? []) {
      let entry = byPack.get(pack.key);
      if (!entry) {
        entry = { key: pack.key, label: pack.label, sinks: [] };
        byPack.set(pack.key, entry);
      }
      entry.sinks.push(sink);
    }
  }

  const groups = [];
  for (const entry of byPack.values()) {
    if (entry.sinks.length < 2) continue;
    const familyMembers = new Map();
    for (const sink of entry.sinks) {
      const family = sinkFamilyOf(sink);
      if (!familyMembers.has(family)) familyMembers.set(family, new Set());
      familyMembers
        .get(family)
        .add(sinkAttributeName(sink) ?? formatExpression(sink.expression, 24));
    }
    const families = Array.from(familyMembers.keys());
    const evidence = packEvidenceFor(entry, families);
    groups.push({
      key: entry.key,
      label: formatExpression(entry.label, 48),
      sinkCount: entry.sinks.length,
      families,
      familyMembers: Object.fromEntries(
        Array.from(familyMembers.entries()).map(([family, members]) => [
          family,
          Array.from(members),
        ]),
      ),
      evidence,
      verdict: packVerdictFor(evidence),
    });
  }
  return groups.sort(
    (left, right) =>
      packRiskForVerdict(right.verdict) - packRiskForVerdict(left.verdict) ||
      right.families.length - left.families.length ||
      right.sinkCount - left.sinkCount,
  );
}

function packEvidenceFor(entry, families) {
  const sinks = entry.sinks;
  const roots = unique(
    sinks.flatMap((sink) =>
      fanOutRootsFor(sink).map((info) => formatExpression(info.label, 48)),
    ),
  );
  const steps = sinks.flatMap((sink) => sink.representativeSteps ?? []);
  const callText = steps
    .filter((step) => step.kind === "call")
    .map((step) => step.label)
    .join(" ");
  const packText = `${entry.label} ${callText}`;
  const parserBoundary =
    /\b(?:parse|parser|extract|decode|token|match|css|shadow|normalize|normalise)\b/iu.test(
      packText,
    );
  const helperBoundary =
    /\b(?:selection|choices?|model|view|derive|build|create)\b/iu.test(
      callText,
    );
  const defensiveOps = sum(
    sinks,
    (sink) => sink.metrics.defensiveOperationCount,
  );
  const representationChurn = sum(
    sinks,
    (sink) => sink.metrics.representationChurn,
  );
  const helperHops = sum(sinks, (sink) => sink.metrics.helperHops);
  const maxReach = Math.max(
    0,
    ...sinks.map((sink) => sink.metrics.reachableSinks),
  );
  const propRoots = roots.filter((root) => /^props\./.test(root));
  const geometryOnly = families.every((family) =>
    ["geometry", "svg-shell", "other"].includes(family),
  );
  const sourceFamilies = new Set(roots.map(sourceFamilyKey));
  const mirrorLike =
    roots.length >= 2 &&
    geometryOnly &&
    !helperBoundary &&
    propRoots.length / roots.length >= 0.75 &&
    helperHops <= sinks.length &&
    defensiveOps === 0 &&
    families.length <= 2;

  return {
    familyCount: families.length,
    sourceRootCount: roots.length,
    sourceFamilyCount: sourceFamilies.size,
    defensiveOps,
    representationChurn,
    helperHops,
    maxReach,
    parserBoundary,
    helperBoundary,
    mirrorLike,
    relayLike: maxReach >= 6 && families.length >= 2 && roots.length >= 2,
  };
}

function packVerdictFor(evidence) {
  if (
    evidence.parserBoundary &&
    (evidence.defensiveOps > 0 || evidence.helperHops > 0)
  ) {
    return "normalization-boundary";
  }
  if (evidence.mirrorLike) return "mirror-object";
  if (evidence.relayLike) return "relay-bag";
  if (evidence.familyCount >= 2) return "overpacked-bag";
  return "cohesive-render-model";
}

function sourceFamilyKey(root) {
  const parts = String(root).split(".");
  return parts.slice(0, Math.min(parts.length, 2)).join(".");
}

function packRiskForVerdict(verdict) {
  switch (verdict) {
    case "relay-bag":
      return 12;
    case "overpacked-bag":
      return 9;
    case "mirror-object":
      return 7;
    case "cohesive-render-model":
      return 0;
    case "normalization-boundary":
      return 0;
    default:
      return 4;
  }
}

function applyPackEvidence(sinks, packGroups) {
  const groupsByKey = new Map(packGroups.map((group) => [group.key, group]));
  for (const sink of sinks) {
    const groups = (sink.packs ?? [])
      .map((pack) => groupsByKey.get(pack.key))
      .filter(Boolean);
    if (groups.length === 0) continue;
    sink.packVerdicts = unique(groups.map((group) => group.verdict));
    sink.metrics.packFamilyDiversity = Math.max(
      0,
      ...groups.map((group) => group.families.length),
    );
    sink.metrics.packRisk = Math.max(
      0,
      ...groups.map((group) => packRiskForVerdict(group.verdict)),
    );
    sink.metrics.suspiciousPackCount = groups.filter(
      (group) => packRiskForVerdict(group.verdict) > 0,
    ).length;
  }
}

// The pack group (if any) that a given sink flows through — suspicious groups
// win, then broader family spread, then larger sink count.
function packGroupForSink(sink, packGroups) {
  const keys = new Set((sink.packs ?? []).map((pack) => pack.key));
  return (
    (packGroups ?? [])
      .filter((group) => keys.has(group.key))
      .sort(
        (left, right) =>
          packRiskForVerdict(right.verdict) -
            packRiskForVerdict(left.verdict) ||
          right.families.length - left.families.length ||
          right.sinkCount - left.sinkCount,
      )[0] ?? null
  );
}

// Human labels for the sink families in a split recommendation.
const FAMILY_LABELS = {
  "svg-shell": "SVG shell",
  geometry: "Geometry",
  "control-flow": "Control flow",
  style: "Style",
  identity: "Identity",
  text: "Text",
  other: "Other",
};

const PACK_VERDICT_LABELS = {
  "cohesive-render-model": "cohesive render model",
  "normalization-boundary": "normalization boundary",
  "overpacked-bag": "overpacked bag",
  "mirror-object": "mirror object",
  "relay-bag": "relay bag",
};

function packVerdictLines(group) {
  const evidence = group.evidence;
  const lines = [
    `verdict: ${PACK_VERDICT_LABELS[group.verdict] ?? group.verdict}`,
    `evidence: ${group.sinkCount} sinks, ${evidence.familyCount} sink families, ${evidence.sourceRootCount} source roots, reach ${evidence.maxReach}`,
  ];
  if (group.verdict === "normalization-boundary") {
    lines.push(
      "direction: keep this as a named boundary; move parser/defaulting work here, then let JSX read typed fields.",
    );
  } else if (group.verdict === "cohesive-render-model") {
    lines.push(
      "direction: this pack is cohesive; formalize or narrow it rather than splitting solely because it is an object.",
    );
  } else if (group.verdict === "overpacked-bag") {
    lines.push(
      "direction: split by render responsibility; avoid one object feeding unrelated JSX concerns.",
    );
  } else if (group.verdict === "mirror-object") {
    lines.push(
      "direction: this mostly mirrors source fields; prefer narrow derived values or inline reads.",
    );
  } else if (group.verdict === "relay-bag") {
    lines.push(
      "direction: this broad pack fans out through the feature; move ownership closer to consumers or split selectors.",
    );
  }
  return lines;
}

// The "split this object by sink family" block shown under a work item whose
// packed object feeds more than one family (Phase 3d).
function overpackedSplitLines(group) {
  const lines = [
    `Object \`${group.label}\` feeds ${group.families.length} sink families — split it:`,
  ];
  for (const family of group.families) {
    const members = group.familyMembers[family] ?? [];
    lines.push(`  ${FAMILY_LABELS[family] ?? family}: ${members.join(", ")}`);
  }
  return lines;
}

// Phase 5 — locate recommended extraction boundaries on the representative path
// plus a suggested render-model shape. A boundary is placed after the last
// normalization step and after a contiguous geometry/arithmetic sub-chain; the
// model shape comes from the sink family. Boundaries are returned by the step
// index they sit *after* so the path renderer can mark them in place rather
// than referring to an opaque "step N".
function extractionBoundariesFor(sink) {
  const steps = sink.representativeSteps ?? [];
  const boundaries = [];

  let lastNormalization = -1;
  let lastGeometry = -1;
  steps.forEach((step, index) => {
    if (step.kind === "fallback" || step.kind === "optional-read") {
      lastNormalization = index;
    }
    if (
      step.kind === "template" ||
      (step.kind === "conditional" && /[-+*/%]/.test(step.label))
    ) {
      lastGeometry = index;
    }
  });

  if (lastNormalization >= 0 && lastNormalization < steps.length - 1) {
    boundaries.push({
      afterIndex: lastNormalization,
      text: "extract the defaults & normalization above into a named boundary memo",
    });
  }
  if (
    classifyPathShape(sink).includes("geometry-chain") &&
    !classifyPathShape(sink).includes("local-scalar-geometry") &&
    lastGeometry >= 0 &&
    lastGeometry < steps.length - 1 &&
    lastGeometry !== lastNormalization
  ) {
    boundaries.push({
      afterIndex: lastGeometry,
      text: "extract the layout/geometry math above into a sizing memo",
    });
  }

  const family = sinkFamilyOf(sink);
  let modelShape = null;
  if (classifyPathShape(sink).includes("local-scalar-geometry")) {
    modelShape = null;
  } else if (family === "geometry" || family === "svg-shell") {
    modelShape = "{ x, y, width, height }";
  } else if (
    !sink.packVerdicts?.includes("normalization-boundary") &&
    classifyPathShape(sink).includes("collection-render-model")
  ) {
    modelShape = `${pascalCase(singularRenderedThing(renderedThingFor(sink)))}[]`;
  }
  return { boundaries, modelShape };
}

// Approach 4 — synthesize the clean helper a messy boundary implies: inputs are
// the source lineages crossing the cut (with where they come from), output is the
// value/model at the sink, named from the render shape. A proposal, not a rewrite.
function extractionProposalFor(sink) {
  // Only worth proposing for paths deep enough that a boundary actually helps.
  if ((sink.metrics?.maximumPathDepth ?? 0) < 4) return null;
  if (sinkFamilyOf(sink) === "svg-shell") return null;
  if (classifyPathShape(sink).includes("local-scalar-geometry")) return null;
  const inputs = fanOutRootsFor(sink).slice(0, 5);
  if (inputs.length === 0) return null;

  const steps = sink.representativeSteps ?? [];
  const originOf = (label) => {
    const step = steps.find((candidate) => candidate.label === label);
    return step?.file && step?.line ? `${step.file}:${step.line}` : null;
  };
  const { modelShape } = extractionBoundariesFor(sink);
  const name = proposedHelperName(sink);
  const outType =
    modelShape ??
    (sink.type && sink.type !== "unknown"
      ? formatExpression(sink.type, 40)
      : "/* result */");

  const ownLines = steps
    .filter((step) => step.file === sink.file && step.line)
    .map((step) => step.line);
  const lo = ownLines.length ? Math.min(...ownLines) : null;
  const hi = ownLines.length ? Math.max(...ownLines) : null;

  const lines = [`proposed: function ${name}(`];
  inputs.forEach((info, index) => {
    const origin = originOf(info.label);
    const comma = index < inputs.length - 1 ? "," : "";
    const where = origin ? `  (${origin})` : "";
    lines.push(
      `  ${paramNameFor(info.label)}: /* type */${comma}   // ⟵ ${formatExpression(info.label, 40)}${where}`,
    );
  });
  lines.push(`): ${outType}`);
  if (lo != null && hi != null && hi > lo) {
    lines.push(`moves ~${sink.file.split("/").pop()}:${lo}–${hi}`);
  }
  const resultPhrase =
    sinkFamilyOf(sink) === "control-flow" || sink.category === "rendered-value"
      ? `JSX reads ${name}(...)`
      : `JSX reads a field of ${name}(...)`;
  lines.push(
    `after: ${resultPhrase} — a short path instead of ${sink.metrics.maximumPathDepth} hops.`,
  );
  if (sink.metrics.packRisk > 0 || sink.category === "render-control") {
    lines.push(
      "avoid: do not introduce a broad packed object unless a rerun reports it as cohesive.",
    );
  }
  return lines;
}

// A domain-flavored helper name from the sink's render family — never a banned
// catch-all (`layout`, `viewModel`, …).
function proposedHelperName(sink) {
  if (sink.packVerdicts?.includes("normalization-boundary")) {
    return "parsedValue";
  }
  const renderedThing = renderedThingFor(sink);
  switch (sinkFamilyOf(sink)) {
    case "geometry":
      return `compute${pascalCase(singularRenderedThing(renderedThing))}`;
    case "svg-shell":
      return `${camelCase(singularRenderedThing(renderedThing))}`;
    case "control-flow":
      return predicateNameFor(sink);
    case "style":
      return `${camelCase(singularRenderedThing(renderedThing))}Style`;
    case "identity":
      return `${camelCase(singularRenderedThing(renderedThing))}Ref`;
    default:
      if (classifyPathShape(sink).includes("collection-render-model")) {
        return pluralRenderedThing(renderedThing);
      }
      if (
        sink.category === "rendered-value" &&
        String(sink.renderContext?.tag).toLowerCase() === "title"
      ) {
        return `format${pascalCase(singularRenderedThing(renderedThing))}`;
      }
      return `${camelCase(singularRenderedThing(renderedThing))}Text`;
  }
}

function renderedThingFor(sink) {
  const component = sink.renderContext?.component ?? "";
  const tag = String(sink.renderContext?.tag ?? "").toLowerCase();
  const attribute = sink.renderContext?.attribute ?? sinkAttributeName(sink);
  const componentWords = wordsFromIdentifier(component).filter(
    (word) => !["chart", "svg", "render", "component"].includes(word),
  );
  const domain = componentWords.includes("bar") ? "bar" : componentWords[0];
  if (tag === "rect") return domain ? `${domain} rectangle` : "rectangle";
  if (tag === "text" && /tick|axis/i.test(component))
    return domain ? `${domain} tick` : "axis tick";
  if (tag === "title") return domain ? `${domain} title` : "title";
  if (tag && !/^[A-Z]/.test(sink.renderContext?.tag ?? ""))
    return domain ? `${domain} ${tag}` : tag;
  if (attribute)
    return `${camelWords(attribute).join(" ") || "rendered"} value`;
  return domain ? `${domain} value` : "rendered value";
}

function predicateNameFor(sink) {
  const alias = [...(sink.representativeSteps ?? [])]
    .reverse()
    .find(
      (step) =>
        step.kind === "alias" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(step.label),
    );
  if (alias) return alias.label;
  const helper = [...(sink.representativeSteps ?? [])]
    .reverse()
    .find(
      (step) =>
        step.kind === "call" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(step.label),
    );
  if (helper) return helper.label;
  const root = fanOutRootsFor(sink)[0]?.label ?? "render";
  const words = camelWords(root.split(".").at(-1) ?? root);
  const noun = pascalCase(words.join(" ")) || "Content";
  return `has${noun}`;
}

function singularRenderedThing(text) {
  const words = String(text).split(/\s+/);
  if (words.length === 0) return String(text);
  const last = words.at(-1);
  const singularLast = last
    .replace(/^(rectangles|rects)$/i, "rectangle")
    .replace(/^ticks$/i, "tick")
    .replace(/ies$/i, "y")
    .replace(/s$/i, "");
  return [...words.slice(0, -1), singularLast].join(" ");
}

function pluralRenderedThing(text) {
  const value = String(text);
  if (/rectangle$/i.test(value)) return `${value}s`;
  if (/tick$/i.test(value)) return `${value}s`;
  if (/y$/i.test(value)) return value.replace(/y$/i, "ies");
  if (/s$/i.test(value)) return value;
  return `${value}s`;
}

function articleFor(text) {
  return /^[aeiou]/i.test(String(text)) ? "an" : "a";
}

function wordsFromIdentifier(value) {
  return camelWords(value).map((word) => word.toLowerCase());
}

function camelWords(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function camelCase(value) {
  const words = camelWords(value);
  if (words.length === 0) return "value";
  return [
    words[0].toLowerCase(),
    ...words
      .slice(1)
      .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()),
  ].join("");
}

function pascalCase(value) {
  return camelWords(value)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

// Turn a source label into a plausible parameter name: the last identifier of a
// property chain (`props.profile` → `profile`), else a safe fallback.
function paramNameFor(label) {
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

function stepVerb(kind) {
  return STEP_KIND_VERBS[kind] ?? (kind || "step");
}

// Render the representative path as a derivation chain: each numbered row is
// built from the row above it, the last row is the value JSX renders. A leading
// `F#:line` column backlinks each hop to its source location (so it is clear
// whether the logic is in one file or scattered, and an agent can grep it); a
// verb column names what each hop does; recommended extraction boundaries are
// marked inline, exactly where they apply (show, don't tell); a closing line
// names the suggested sink-model shape. A `Files` legend maps each F# to a path.
function representativePathWithBoundaries(sink) {
  const steps =
    sink.representativeSteps ??
    sink.representativePath.map((label) => ({ label, kind: null }));
  if (steps.length === 0) return ["(no path)"];

  const { boundaries, modelShape } = extractionBoundariesFor(sink);
  const byIndex = new Map();
  for (const boundary of boundaries) {
    if (!byIndex.has(boundary.afterIndex)) byIndex.set(boundary.afterIndex, []);
    byIndex.get(boundary.afterIndex).push(boundary.text);
  }

  // Assign short file ids. F1 is always the sink's own file so the common
  // single-file case reads as F1 throughout; other files get F2, F3, … in the
  // order the path first visits them.
  const fileIds = new Map();
  if (sink.file) fileIds.set(sink.file, "F1");
  for (const step of steps) {
    if (step.file && !fileIds.has(step.file)) {
      fileIds.set(step.file, `F${fileIds.size + 1}`);
    }
  }
  const refFor = (step) =>
    step.file && step.line ? `${fileIds.get(step.file)}:${step.line}` : "";

  const refWidth = Math.max(...steps.map((step) => refFor(step).length), 2);
  const numberWidth = String(steps.length).length;
  const verbWidth = Math.max(
    ...steps.map((step) => stepVerb(step.kind).length),
  );
  const noteIndent = " ".repeat(refWidth + 2 + numberWidth + 2 + verbWidth + 2);
  const lines = [];
  // Track the file stack so a change between consecutive steps reads as entering
  // a helper's file (push) or returning from it (pop) — Approach 1 markers.
  const fileStack = [];
  steps.forEach((step, index) => {
    if (step.file && fileIds.has(step.file)) {
      const top = fileStack[fileStack.length - 1];
      if (top !== step.file) {
        if (fileStack.includes(step.file)) {
          while (
            fileStack.length &&
            fileStack[fileStack.length - 1] !== step.file
          ) {
            fileStack.pop();
          }
          if (index > 0) {
            lines.push(`${noteIndent}↙ return to ${fileIds.get(step.file)}`);
          }
        } else {
          fileStack.push(step.file);
          if (index > 0) {
            lines.push(`${noteIndent}↘ enter ${fileIds.get(step.file)}`);
          }
        }
      }
    }
    const ref = refFor(step).padEnd(refWidth, " ");
    const number = String(index + 1).padStart(numberWidth, " ");
    const verb = stepVerb(step.kind).padEnd(verbWidth, " ");
    // A call's name reads as a value without parens; add them so a helper/method
    // step is unmistakably an invocation. The `memo` verb already labels a memo
    // accessor, so drop the redundant trailing " memo" from its expression.
    const baseLabel = formatExpression(step.label).replace(/\s+memo$/, "");
    const label =
      step.kind === "call" && !baseLabel.includes("(")
        ? `${baseLabel}()`
        : baseLabel;
    // The detail gloss (what the step evaluates) only adds signal when it is not
    // already what the label shows.
    const detail =
      step.detail && step.detail !== baseLabel ? `  — ${step.detail}` : "";
    lines.push(`${ref}  ${number}. ${verb}  ${label}${detail}`);
    for (const text of byIndex.get(index) ?? []) {
      lines.push(`${noteIndent}▸ boundary: ${text}`);
    }
  });
  if (modelShape) {
    lines.push(`${noteIndent}▸ suggested sink model: ${modelShape}`);
  }

  lines.push("");
  lines.push("Files:");
  for (const [file, id] of fileIds) {
    lines.push(`  ${id} = ${file}`);
  }
  return lines;
}

// Phase 6 — a compact PR-review framing: what the sink mixes, the headline fix,
// and (when relevant) an over-packing warning.
function reviewerSummaryFor(sink, group) {
  const shapes = classifyPathShape(sink);
  const phrases = shapes.map((shape) => SHAPE_PHRASES[shape]).filter(Boolean);
  const mixed =
    phrases.length > 0
      ? `This sink mixes ${joinList(phrases)}.`
      : "This sink has more data-flow plumbing than nearby JSX should need.";
  const primary = primaryAdviceShape(sink, shapes);
  const fix = SHAPE_HEADLINE_FIX[primary];
  let fixSentence = fix
    ? `A behavior-preserving fix is to ${fix}.`
    : "A behavior-preserving fix is to compute a named value before JSX.";
  if (group?.verdict === "normalization-boundary") {
    fixSentence =
      "A behavior-preserving fix is to keep the parser/model boundary and make JSX read its typed fields.";
  } else if (group && packRiskForVerdict(group.verdict) > 0) {
    fixSentence =
      "A behavior-preserving fix is to split or relocate the pack before adding any broader render object.";
  }
  const sentences = [mixed, fixSentence];
  if (group) {
    if (packRiskForVerdict(group.verdict) > 0) {
      sentences.push(
        `Pack verdict: ${PACK_VERDICT_LABELS[group.verdict] ?? group.verdict}; avoid broadening \`${group.label}\`.`,
      );
    } else {
      sentences.push(
        `Pack verdict: ${PACK_VERDICT_LABELS[group.verdict] ?? group.verdict}; object packing is not the issue by itself.`,
      );
    }
  }
  return sentences.join(" ");
}

// Phase 7 — the kind of change this is, as a four-rung ladder of honest
// categories rather than a binary Provider/Context flag.
function ownershipHintFor(sink) {
  if (classifyPathShape(sink).includes("cross-component-relay")) {
    return "cross-component prop relay";
  }
  if (hasContextHookRoot(sink)) return "feature hook extraction";
  if (sink.metrics.mergeWidth >= 3 && sink.metrics.reachableSinks >= 4) {
    return "architectural fan-in";
  }
  if (sink.metrics.reachableSinks > 5) return "feature hook extraction";
  return "local component cleanup";
}

// "1 file" / "3 files" — pluralize a count noun for prose.
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// Oxford-comma join for short prose lists.
function joinList(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function sum(items, project) {
  return items.reduce((total, item) => total + project(item), 0);
}

function selectViewPayload(report, args) {
  return {
    analysisVersion: report.analysisVersion,
    generatedAt: report.generatedAt,
    summary: report.summary,
    view: args.view,
    sinks: report.rankings.all.slice(0, args.maxItems),
    contextRelay:
      args.view === "context-relay"
        ? report.contextRelay.slice(0, args.maxItems)
        : undefined,
    helpers: ["boundary-report", "junctions", "inline-preview"].includes(
      args.view,
    )
      ? (report.helpers ?? []).slice(0, args.maxItems)
      : undefined,
    unknownEdges:
      args.view === "overview"
        ? (report.unknownEdges ?? []).slice(0, args.maxItems)
        : undefined,
    packGroups: ["work-packets", "findings"].includes(args.view)
      ? (report.packGroups ?? []).slice(0, args.maxItems)
      : undefined,
    hotspots:
      args.view === "overview"
        ? hotspotGroups(report, args.by === "feature" ? "feature" : "file")
            .slice(0, args.maxItems)
            .map((group) => ({
              key: group.key,
              count: group.count,
              worst: Number(group.worst.toFixed(3)),
              sumBurden: Number(group.sumBurden.toFixed(3)),
              maxReach: group.maxReach,
              dominantShape: modalValue(group.shapes),
              ownership: modalValue(group.ownership),
              firstCut: firstCutFor(group.worstSink),
            }))
        : undefined,
    concentration: args.view === "overview" ? report.concentration : undefined,
    // The `dossier` markdown view was retired (round 8), but its structural payload
    // (graph counts + bounded node/edge sample) stays "available on request" here:
    // every `--format json` response carries the bounded graph regardless of view.
    graph: boundedGraph(report.graph, args.maxItems),
    baseline: report.baseline,
  };
}

function boundedGraph(graph, maxItems) {
  return {
    nodes: graph.nodes.slice(0, maxItems),
    edges: graph.edges.slice(0, maxItems),
    omittedNodes: Math.max(0, graph.nodes.length - maxItems),
    omittedEdges: Math.max(0, graph.edges.length - maxItems),
    unknownEdges: graph.unknownEdges,
  };
}

function compareBaseline(rankings, baselinePath) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const currentWorst = rankings.all[0]?.scores.burden ?? 0;
  const baselineWorst = baseline.sinks?.[0]?.scores?.burden ?? 0;
  return {
    currentWorst,
    baselineWorst,
    regressed: currentWorst > baselineWorst,
    ...diffBaselineSinks(rankings.all, baseline.sinks ?? []),
  };
}

function renderCompareReport(report, args) {
  const baseline = readReportDirectorySummary(args.compare);
  const current = reportSummaryForCompare(report);
  const lines = [
    "# tsx-dataflow Compare",
    "",
    `Baseline: ${commandPath(args.compare)}`,
    "After: current run",
    "",
    "## Summary",
    "",
    ...formatMarkdownTable(
      ["Computed signal", "Baseline", "After", "Delta"],
      [
        [
          "Worst burden score",
          formatWorstMetric(baseline),
          formatWorstMetric(current),
          compareNumberLabel(baseline.worstScore, current.worstScore, true),
        ],
        [
          "Finding count (hotspots)",
          formatOptionalNumber(baseline.hotspots),
          String(current.hotspots),
          formatDeltaLabel(baseline.hotspots, current.hotspots, true),
        ],
        [
          "Defensive operation entries",
          formatOptionalNumber(baseline.defensiveEntries),
          String(current.defensiveEntries),
          formatDeltaLabel(
            baseline.defensiveEntries,
            current.defensiveEntries,
            true,
          ),
        ],
        [
          "Representation-only wrapper steps",
          formatOptionalNumber(baseline.wrappers),
          String(current.wrappers),
          formatDeltaLabel(baseline.wrappers, current.wrappers, true),
        ],
      ],
    ),
    "",
    "_These are analyzer-computed signals, not product accounts or runtime telemetry. Wrapper steps are the summed `representationChurn` metric: aliases, object packs, spreads, and other representation-only repacks on render paths._",
    "",
    "## How to read the deltas",
    "",
    ...formatMarkdownTable(
      ["Signal", "What it measures", "How to weigh it"],
      [
        [
          "Worst burden score",
          "The single heaviest render path, normalized 0–1 from depth, helper hops, wrapper steps, defenses, impossible defenses, control flow, and repeated normalization.",
          "Use as the headline local pain signal. It can stay flat when the same worst path remains even if broad cleanup improves elsewhere.",
        ],
        [
          "Finding count (hotspots)",
          "How many ranked render sinks remain after filtering.",
          "Use as breadth. Large drops mean less overall surface area; large counts can still be acceptable when remaining rows are low-risk background paths.",
        ],
        [
          "Defensive operation entries",
          "Unique optional reads and fallback operations on render paths.",
          "Prioritize impossible or unknown defenses first because they often point to stale guards or unclear contracts.",
        ],
        [
          "Representation-only wrapper steps",
          "Alias/object-pack/spread hops that change shape without adding product behavior.",
          "Treat a spike as a reviewability warning, not automatic failure. It matters most when worst burden, relay/overpacked findings, or defensive entries do not improve with it.",
        ],
      ],
    ),
    "",
  ];

  const removed = removedFindingFamilies(baseline, current);
  if (removed.length > 0) {
    lines.push("## Removed finding families", "");
    for (const item of removed) lines.push(`- ${item}`);
    lines.push("");
  }

  const remaining = remainingFindingFamilies(current);
  if (remaining.length > 0) {
    lines.push("## Remaining finding families", "");
    for (const item of remaining) lines.push(`- ${item}`);
    lines.push("");
  }

  const stop = stopRecommendationFor(report);
  lines.push("## Verdict", "");
  lines.push(
    stop.recommend
      ? `Verdict: improvement; stop local cleanup. ${stop.reason}`
      : `Verdict: continue cleanup. ${stop.reason}`,
  );
  lines.push("");
  if (baseline.missing.length > 0) {
    lines.push(
      `Note: baseline was missing ${baseline.missing.join(", ")}; omitted metrics are shown as n/a.`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

function reportSummaryForCompare(report) {
  const top = report.rankings.all[0];
  return {
    worstScore: top?.scores.burden ?? 0,
    worstSeverity: top ? severityFor(top) : "LOW",
    hotspots: report.rankings.all.length,
    defensiveEntries: uniqueDefenseEntries(report.sinks).length,
    wrappers: sum(
      report.rankings.all,
      (sink) => sink.metrics.representationChurn,
    ),
    families: findingFamiliesFor(report),
    backgroundLabels: unique(
      report.rankings.all.map((sink) => sink.background?.label).filter(Boolean),
    ),
  };
}

function readReportDirectorySummary(directory) {
  const missing = [];
  const read = (name) => {
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) {
      missing.push(name);
      return "";
    }
    return fs.readFileSync(file, "utf8");
  };
  // `dossier.md` and `transformation-ledger.md` were retired (round 8) but may
  // still exist in older baseline directories. Read them optionally — present is a
  // bonus (richer fallback), absent is not "missing" — so a current-tool baseline
  // doesn't spuriously report them as gaps.
  const readOptional = (name) => {
    const file = path.join(directory, name);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  };
  const dossier = readOptional("dossier.md");
  const findings = read("findings.md");
  const defensive = read("defensive-ledger.md");
  const transform = readOptional("transformation-ledger.md");
  const workPackets = read("work-packets.md");
  return {
    worstScore:
      parsePrimaryPivotScore(dossier) ?? parseWorstFindingScore(findings),
    worstSeverity: parseWorstSeverity(findings),
    hotspots:
      parseDossierSinkCount(dossier) ??
      countMarkdownHeadings(findings, /^## RPF-/),
    defensiveEntries: countMarkdownTableRows(defensive),
    wrappers: parseTransformationWrappers(transform),
    families: parseFindingFamilies(workPackets, defensive),
    missing,
  };
}

function parsePrimaryPivotScore(text) {
  const match = /\|\s*`[^`]*`\s*\|\s*\d+\s*\|\s*([0-9.]+)\s*\|/.exec(text);
  return match ? Number(match[1]) : null;
}

function parseWorstFindingScore(text) {
  const match = /burden score\s*\|\s*([0-9.]+)/i.exec(text);
  return match ? Number(match[1]) : null;
}

function parseWorstSeverity(text) {
  const match = /^## RPF-[^·]+·\s*([A-Z]+)/m.exec(text);
  return match?.[1] ?? "n/a";
}

function parseDossierSinkCount(text) {
  const match = /\|\s*\d+\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*(\d+)\s*\|/.exec(text);
  return match ? Number(match[1]) : null;
}

function countMarkdownHeadings(text, pattern) {
  return text.split("\n").filter((line) => pattern.test(line)).length;
}

function countMarkdownTableRows(text) {
  return text
    .split("\n")
    .filter(
      (line) =>
        /^\|/.test(line) &&
        !/^\|\s*-/.test(line) &&
        !/^\|\s*Location\s*\|/.test(line) &&
        !/^\|\s*#\s*\|/.test(line),
    ).length;
}

function parseTransformationWrappers(text) {
  const match = /representation-only(?: wrapper)? steps\s*\|\s*(\d+)/i.exec(
    text,
  );
  return match ? Number(match[1]) : null;
}

function parseFindingFamilies(text, defensiveText = "") {
  const families = [];
  if (
    /\|[^\n|]+\|[^\n|]+\|[^\n|]+\|[^\n|]+\|\s*impossible\s*\|/i.test(
      defensiveText,
    )
  )
    families.push("type-impossible fallback");
  if (
    /Provider\/Context audit|Check whether this feature already has or needs a Provider\/Context boundary/i.test(
      text,
    )
  )
    families.push("provider/context advice");
  if (/Grouped Recommendations|Extract bar|BarRect|BarTick/i.test(text))
    families.push("render-item extraction");
  if (/already readable|Background Findings/i.test(text))
    families.push("background scalar helpers");
  if (/healthy shared boundary|computeChartLayout/i.test(text))
    families.push("healthy shared boundary");
  if (/mirror singleton risk|mirror object/i.test(text))
    families.push("mirror singleton risk");
  return unique(families);
}

function findingFamiliesFor(report) {
  const families = [];
  if (
    report.rankings.all.some((sink) => sink.metrics.impossibleDefenseCount > 0)
  )
    families.push("type-impossible fallback");
  if (report.rankings.all.some((sink) => isProviderContextCandidate(sink)))
    families.push("provider/context advice");
  if (groupedRenderRecommendations(report.rankings.all).length > 0)
    families.push("render-item extraction");
  if (
    report.rankings.all.some(
      (sink) => sink.background?.label === "already readable",
    )
  )
    families.push("background scalar helpers");
  if (
    report.rankings.all.some(
      (sink) => sink.background?.label === "healthy shared boundary",
    )
  )
    families.push("healthy shared boundary");
  if (
    report.rankings.all.some(
      (sink) =>
        mirrorSingletonRiskFor(sink) ||
        sink.packVerdicts?.includes("mirror-object"),
    )
  )
    families.push("mirror singleton risk");
  return unique(families);
}

function uniqueDefenseEntries(sinks) {
  return unique(
    sinks.flatMap((sink) =>
      (sink.defenses ?? []).map(
        (defense) =>
          `${defense.file}:${defense.line}:${defense.expression}:${defense.verdict}`,
      ),
    ),
  );
}

function uniqueActionableDefenseEntries(sinks) {
  return unique(
    sinks.flatMap((sink) =>
      (sink.defenses ?? [])
        .filter((defense) => !isCertaintyBoundaryDefense(defense))
        .map(
          (defense) =>
            `${defense.file}:${defense.line}:${defense.expression}:${defense.verdict}`,
        ),
    ),
  );
}

function removedFindingFamilies(baseline, current) {
  return (baseline.families ?? []).filter(
    (family) => !(current.families ?? []).includes(family),
  );
}

function remainingFindingFamilies(current) {
  return current.families ?? [];
}

function formatWorstMetric(summary) {
  if (!Number.isFinite(summary.worstScore)) return "n/a";
  return `${summary.worstScore.toFixed(2)} ${summary.worstSeverity ?? ""}`.trim();
}

function formatOptionalNumber(value) {
  return Number.isFinite(value) ? String(value) : "n/a";
}

function compareNumberLabel(before, after, lowerIsBetter) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "n/a";
  const improved = lowerIsBetter ? after < before : after > before;
  const regressed = lowerIsBetter ? after > before : after < before;
  if (Math.abs(after - before) < 0.001) return "same";
  return improved ? "improved" : regressed ? "regressed" : "changed";
}

function formatDeltaLabel(before, after, lowerIsBetter) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "n/a";
  const delta = after - before;
  const label = compareNumberLabel(before, after, lowerIsBetter);
  return `${delta > 0 ? "+" : ""}${delta} ${label}`;
}

function stopRecommendationFor(report) {
  const topActionable = report.rankings.all.find((sink) => !sink.background);
  const defensiveEntries = uniqueDefenseEntries(report.sinks).length;
  const actionableDefensiveEntries = uniqueActionableDefenseEntries(
    report.sinks,
  ).length;
  const highRiskPacks = report.packGroups.filter((group) =>
    ["overpacked-bag", "relay-bag", "mirror-object"].includes(group.verdict),
  );
  const backgroundCount = report.rankings.all.filter(
    (sink) => sink.background,
  ).length;
  const topScore = topActionable?.scores.burden ?? 0;
  const lowTop = topScore < 0.35;
  const mostlyBackground =
    backgroundCount >= Math.max(1, report.rankings.all.length * 0.2);

  if (
    actionableDefensiveEntries === 0 &&
    highRiskPacks.length === 0 &&
    lowTop &&
    mostlyBackground
  ) {
    return {
      recommend: true,
      reason:
        defensiveEntries === 0
          ? "No defensive operation entries remain; highest actionable score is low; remaining paths are mostly scalar helpers or cohesive shared-boundary reads."
          : "No actionable defensive operation entries remain; remaining fallbacks are certainty/API-choice boundaries; highest actionable score is low.",
    };
  }
  if (actionableDefensiveEntries > 0) {
    return {
      recommend: false,
      reason: `${actionableDefensiveEntries} actionable defensive operation entr${actionableDefensiveEntries === 1 ? "y remains" : "ies remain"}.`,
    };
  }
  if (highRiskPacks.length > 0) {
    return {
      recommend: false,
      reason: `${highRiskPacks.length} high-risk pack verdict${highRiskPacks.length === 1 ? " remains" : "s remain"}.`,
    };
  }
  return {
    recommend: false,
    reason: topActionable
      ? `Highest actionable score is ${topScore.toFixed(2)}; review ${findingTitle(topActionable)} before stopping.`
      : "No actionable findings remain.",
  };
}

// Phase 10 — a per-sink diff against a prior JSON report. Sinks are keyed by
// file + structural signature so small line shifts don't read as churn; burden
// is the lower-is-better quality number. Categories: removed (gone), regressed
// (got heavier), improved (got lighter), and the current new top finding.
function diffBaselineSinks(currentSinks, baselineSinks) {
  const keyOf = (sink) =>
    `${sink.file ?? "?"}::${sink.signature ?? sink.label ?? "?"}`;
  const burdenOf = (sink) => sink.scores?.burden ?? 0;

  const currentByKey = new Map(currentSinks.map((sink) => [keyOf(sink), sink]));
  const baselineByKey = new Map(
    baselineSinks.map((sink) => [keyOf(sink), sink]),
  );

  const removed = [];
  const improved = [];
  const regressed = [];
  for (const [key, baseSink] of baselineByKey) {
    const current = currentByKey.get(key);
    if (!current) {
      removed.push({
        label: baseSink.label ?? baseSink.file ?? key,
        depth: baseSink.metrics?.maximumPathDepth ?? null,
      });
      continue;
    }
    const before = burdenOf(baseSink);
    const after = burdenOf(current);
    const entry = {
      label: current.label ?? current.file,
      file: current.file,
      line: current.line,
      before: Number(before.toFixed(2)),
      after: Number(after.toFixed(2)),
    };
    if (after < before - 0.001) improved.push(entry);
    else if (after > before + 0.001) regressed.push(entry);
  }

  const top = currentSinks[0];
  const newTop =
    top && !baselineByKey.has(keyOf(top))
      ? { label: top.label, file: top.file, line: top.line }
      : null;

  // `regressedSinks` (a list), not `regressed` (the boolean summary flag), so
  // the spread in compareBaseline does not clobber the existing flag.
  return { removed, improved, regressedSinks: regressed, newTop };
}

function shouldAnalyzeFile(file, args) {
  const ext = path.extname(file);
  if (!SOURCE_EXTENSIONS.includes(ext)) return false;
  if (file.endsWith(".d.ts")) return false;
  if (!isWithin(file, args.source)) return false;
  const relativeParts = path.relative(args.root, file).split(path.sep);
  if (relativeParts.some((part) => DEFAULT_IGNORED_PARTS.has(part)))
    return false;
  if (!args.includeTests && /\.(test|spec)\.[cm]?[jt]sx?$/.test(file))
    return false;
  return true;
}

function walkFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(current);
    return [current];
  });
}

function createGraph(root = defaultRoot) {
  return { nodes: [], edges: [], nextNodeId: 1, nextEdgeId: 1, root };
}

function addNode(graph, node) {
  const record = { id: `n${graph.nextNodeId}`, ...node };
  graph.nextNodeId += 1;
  graph.nodes.push(record);
  return record;
}

function addEdge(graph, from, to, kind, node, unknown = false) {
  if (!from || !to) return null;
  const record = {
    id: `e${graph.nextEdgeId}`,
    from,
    to,
    kind,
    unknown: Boolean(unknown),
    location: node ? locationOf(node.getSourceFile(), node) : null,
  };
  graph.nextEdgeId += 1;
  graph.edges.push(record);
  return record;
}

function classifyAttribute(name) {
  if (["class", "className", "style"].includes(name)) return "style";
  if (["when", "each"].includes(name)) return "render-control";
  return "attribute";
}

function getFunctionReturnExpression(ts, fn) {
  if (!fn) return null;
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return fn.body;
  let found = null;
  const visit = (node) => {
    if (!found && ts.isReturnStatement(node) && node.expression)
      found = node.expression;
    if (!found) ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return found;
}

function isCallNamed(ts, node, name) {
  return ts.isCallExpression(node) && getCallName(ts, node) === name;
}

function getCallName(ts, node) {
  if (!ts.isCallExpression(node)) return "";
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression))
    return node.expression.name.text;
  return "";
}

function locationOf(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return { line: position.line + 1, column: position.character + 1 };
}

// Full source span (start + end, 1-based line/column) of a node, so the code map
// can highlight exactly the chunk a finding maps to rather than the whole line.
function spanOf(sourceFile, node) {
  const start = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

function applyScope(sinks, scope) {
  if (!scope) return sinks;
  return sinks.filter(
    (sink) =>
      sink.file.includes(scope) ||
      sink.label.includes(scope) ||
      sink.roots.some((root) => root.includes(scope)),
  );
}

// Translate one `--file` pattern into a RegExp matched against a relative file
// path. Unlike `--scope` (a fuzzy substring over file/label/symbol), this is
// path-only and glob-aware so an agent can pin a report to exactly one file,
// directory, or glob region:
//   src/components/Button.tsx   exact file
//   Button.tsx                  any path ending in /Button.tsx
//   src/components              a directory (everything under it)
//   src/components/**           same, explicit glob
//   src/**/*.tsx                all .tsx anywhere under src
// Globs: `*` matches within a path segment, `**` across segments, `?` one char.
function fileFilterToRegExp(pattern) {
  let p = pattern.trim().replace(/^\.\//, "").replace(/^\/+/, "");
  const hasGlob = /[*?]/.test(p);
  // A bare directory-ish pattern (no glob, no extension on the final segment)
  // is treated as a prefix so `--file src/components` digs into the whole dir.
  const lastSegment = p.split("/").pop() ?? "";
  if (!hasGlob && !lastSegment.includes(".")) {
    p = p.replace(/\/+$/, "") + "/**";
  } else if (p.endsWith("/")) {
    p += "**";
  }

  let body = "";
  for (let index = 0; index < p.length; index += 1) {
    const char = p[index];
    if (char === "*") {
      if (p[index + 1] === "*") {
        body += ".*";
        index += 1;
        if (p[index + 1] === "/") index += 1; // let `a/**/b` match `a/b`
      } else {
        body += "[^/]*";
      }
    } else if (char === "?") {
      body += "[^/]";
    } else {
      body += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  // Anchor to the path end and to a segment boundary at the front, so a bare
  // `Button.tsx` matches `src/ui/Button.tsx` but not `MyButton.tsx`.
  return new RegExp(`(^|/)${body}$`);
}

// Build a predicate over relative file paths from zero or more `--file`
// patterns (OR within the set). Returns null when no patterns were given.
function makeFileMatcher(patterns) {
  if (!patterns || patterns.length === 0) return null;
  const regexps = patterns.map(fileFilterToRegExp);
  return (file) => regexps.some((regexp) => regexp.test(file));
}

function summarize(sinks, graph) {
  return {
    sources: unique(sinks.flatMap((sink) => sink.roots)).length,
    sinks: sinks.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    unknownEdges: countDistinctUnknownEdges(graph),
    pathFamilies: familyRows(sinks).length,
  };
}

// Count DISTINCT unknown edges, keyed exactly as buildUnknownEdgeRows does. The
// graph re-traces each sink, minting fresh nodes/edges per render path, so a raw
// `graph.edges.filter(unknown).length` counts one physical unknown once per sink
// that crosses it — overstating the real figure many-fold. The summary/dossier
// must match the deduped report rows, so dedupe by source position + kind + label.
function countDistinctUnknownEdges(graph) {
  const nodes = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const seen = new Set();
  for (const edge of graph.edges ?? []) {
    if (!edge.unknown) continue;
    const target = nodes.get(edge.to);
    const source = nodes.get(edge.from);
    const file = target?.file ?? source?.file ?? "";
    const line = target?.location?.line ?? source?.location?.line ?? null;
    const label = target?.label ?? source?.label ?? edge.kind;
    seen.add(`${file}:${line ?? ""}:${edge.kind}:${label}`);
  }
  for (const node of graph.nodes ?? []) {
    if (node.kind !== "unknown-source") continue;
    seen.add(
      `${node.file ?? ""}:${node.location?.line ?? ""}:unknown-source:${node.label}`,
    );
  }
  return seen.size;
}

// ARCH-2 (B): fan-out entries scoped to a single file, for the code-map unified
// list. A fan-out row is a source that feeds many render sinks; its natural unit
// is cross-file (how widely the value spreads), so we compute over ALL sinks to
// keep the true reach count, then keep only roots that touch `relPath` and anchor
// each to one of its in-file sinks. `total` is the cross-file sink count;
// `sinks` is the (capped) list of in-file sinks for jump links.
export function fanOutEntriesForFile(allSinks, relPath) {
  const map = new Map();
  for (const sink of allSinks ?? []) {
    for (const info of fanOutRootsFor(sink)) {
      const { key, label } = fanOutIdentity(sink, info);
      let entry = map.get(key);
      if (!entry) {
        entry = {
          root: label,
          kind: info.kind,
          // FANOUT-DEF-1: definition location of the source (when resolvable), so
          // the graph's source node links to where it is declared, not a usage.
          def: info.def ?? null,
          total: 0,
          files: new Set(),
          inFile: [],
          // GRAPH-1: a capped cross-file sample so the fan-out graph can show the
          // spread colored by file, not just the in-file sinks.
          graphSinks: [],
          example: null,
          maxDepth: 0,
        };
        map.set(key, entry);
      }
      entry.total += 1;
      entry.files.add(sink.file);
      // GRAPH (round 6): no cap — the graph draws every reached sink, grouped by
      // file. (Was previously capped at 40 with a "+N more" node.)
      entry.graphSinks.push(reachedSinkDescriptor(sink));
      entry.maxDepth = Math.max(
        entry.maxDepth,
        sink.metrics?.maximumPathDepth ?? 0,
      );
      if (sink.file === relPath) {
        if (entry.inFile.length < REACHED_VIA_CAP)
          entry.inFile.push(reachedSinkDescriptor(sink));
        if (
          !entry.example ||
          (sink.metrics?.maximumPathDepth ?? 0) >
            (entry.example.metrics?.maximumPathDepth ?? 0)
        ) {
          entry.example = sink;
        }
      }
    }
  }
  return Array.from(map.values())
    .filter((entry) => entry.inFile.length > 0 && entry.total >= 2)
    .map((entry) => ({
      root: entry.root,
      kind: entry.kind,
      def: entry.def,
      sinkCount: entry.total,
      fileCount: entry.files.size,
      line: entry.example?.line ?? entry.inFile[0]?.line ?? null,
      maxDepth: entry.maxDepth,
      sinks: entry.inFile,
      graphSinks: entry.graphSinks,
    }))
    .sort((left, right) => right.sinkCount - left.sinkCount);
}

// HOME-1: the cross-file fan-out entries for the OVERVIEW page — same grouping as
// `fanOutEntriesForFile` but with no per-file filter, so every shared source that
// reaches ≥2 sinks is returned with its full (uncapped) cross-file sink set for the
// graph. The overview is the "here are the detected fan-outs" starting point that
// motivates drilling into a file (each sink node links to its file page).
export function fanOutEntriesGlobal(allSinks) {
  const map = new Map();
  for (const sink of allSinks ?? []) {
    for (const info of fanOutRootsFor(sink)) {
      const { key, label } = fanOutIdentity(sink, info);
      let entry = map.get(key);
      if (!entry) {
        entry = {
          root: label,
          kind: info.kind,
          def: info.def ?? null,
          total: 0,
          files: new Set(),
          graphSinks: [],
          maxDepth: 0,
        };
        map.set(key, entry);
      }
      entry.total += 1;
      entry.files.add(sink.file);
      entry.graphSinks.push(reachedSinkDescriptor(sink));
      entry.maxDepth = Math.max(
        entry.maxDepth,
        sink.metrics?.maximumPathDepth ?? 0,
      );
    }
  }
  return Array.from(map.values())
    .filter((entry) => entry.total >= 2)
    .map((entry) => ({
      root: entry.root,
      kind: entry.kind,
      def: entry.def,
      sinkCount: entry.total,
      fileCount: entry.files.size,
      line: null,
      maxDepth: entry.maxDepth,
      sinks: entry.graphSinks,
      graphSinks: entry.graphSinks,
    }))
    .sort((left, right) => right.sinkCount - left.sinkCount);
}

// OVERVIEW-1: per-file counts of every non-finding entry type, so the overview
// table can show breadth across types (not just the finding count) in optional
// columns. Findings/path-depth already come from hotspotGroups; this adds
// boundaries (reached helpers), relays (context-aware parents), unknown edges,
// and fan-out roots. One pass over sinks for fan-out; the rest are direct.
export function entryTypeCountsByFile(report) {
  const counts = new Map();
  const bump = (file, key) => {
    if (!file) return;
    let c = counts.get(file);
    if (!c) {
      c = { boundaries: 0, relays: 0, unknown: 0, fanOut: 0 };
      counts.set(file, c);
    }
    c[key] += 1;
  };
  for (const helper of report.helpers ?? []) bump(helper.file, "boundaries");
  for (const relay of report.contextRelay ?? []) bump(relay.parentFile, "relays");
  for (const edge of report.unknownEdges ?? []) bump(edge.file, "unknown");
  // Fan-out: a file "has" a fan-out root when that root reaches ≥2 sinks total
  // and at least one of them lives in the file (mirrors fanOutEntriesForFile).
  const totals = new Map();
  const filesByRoot = new Map();
  for (const sink of report.rankings?.all ?? report.sinks ?? []) {
    for (const info of fanOutRootsFor(sink)) {
      const { key } = fanOutIdentity(sink, info);
      totals.set(key, (totals.get(key) ?? 0) + 1);
      if (!filesByRoot.has(key)) filesByRoot.set(key, new Set());
      filesByRoot.get(key).add(sink.file);
    }
  }
  for (const [key, files] of filesByRoot) {
    if ((totals.get(key) ?? 0) < 2) continue;
    for (const file of files) bump(file, "fanOut");
  }
  return counts;
}

// Global identifiers and language keywords that the local file context cannot
// resolve and that surface as `unknown-source` roots, but are never an ownable
// domain "source" a developer could centralize. Excluded from fan-out ranking.
const NON_FAN_OUT_GLOBALS = new Set([
  "undefined",
  "null",
  "NaN",
  "Infinity",
  "Math",
  "JSON",
  "Object",
  "Array",
  "Number",
  "String",
  "Boolean",
  "Date",
  "console",
  "window",
  "document",
  "globalThis",
]);

// Fan-out ranks the sources a value flows from. Literals/primitives (`0`,
// `false`, `""`, `[]`) and bare parameter objects (`props`) are not actionable
// "sources" — a developer cannot own or centralize them — so they are excluded,
// as are unresolved language globals (`undefined`, `Math`). Property reads off
// a parameter (`props.meta`) and named locals are kept.
// A sink whose value is a pure constant (e.g. `stroke-dashoffset={0}`,
// `width={32}`): every contributing root is a literal and there is no
// transformation, guard, or control-flow burden. There is nothing to refactor,
// so it should never surface as a ranked finding.
function isConstantSink(sink) {
  const infos =
    sink.rootInfos ?? sink.roots.map((root) => ({ label: root, kind: "source" }));
  if (infos.length === 0) return false;
  if (!infos.every((info) => info.kind === "literal")) return false;
  const m = sink.metrics ?? {};
  return (
    (m.maximumPathDepth ?? 0) <= 1 &&
    (sink.defenses?.length ?? 0) === 0 &&
    (m.representationChurn ?? 0) === 0 &&
    (m.controlDependencyCount ?? 0) === 0 &&
    (m.unknownEdgeCount ?? 0) === 0
  );
}

function fanOutRootsFor(sink) {
  const infos =
    sink.rootInfos ??
    sink.roots.map((root) => ({ label: root, kind: "source" }));
  return infos.filter(
    (info) =>
      info.kind !== "literal" &&
      info.kind !== "parameter" &&
      // BUG-1: an "operation" root is a synthetic placeholder for a no-input
      // operation (e.g. an empty `{}` object-pack). It is not a shared source and
      // must never collapse into a global fan-out entry keyed on its bare label.
      info.kind !== "operation" &&
      !NON_FAN_OUT_GLOBALS.has(info.label),
  );
}

// FANOUT-1: a `prop-read` root (`props.isOpen`) is local to the component that
// declares those props — two different components reading `props.isOpen` are
// different values. Keying fan-out by the bare expression text merged unrelated
// props across the whole repo (badly so for common names like `isOpen`) and
// inflated the consumer count. So scope prop-derived roots by their owning
// component; module-level/hook/import/context roots stay globally keyed because
// those genuinely are one shared source feeding many files. The display label is
// qualified with the component so the grouping basis is visible, not implied.
const PROP_SCOPED_FANOUT_KINDS = new Set(["prop-read"]);
function fanOutIdentity(sink, info) {
  if (PROP_SCOPED_FANOUT_KINDS.has(info.kind)) {
    const component = sink.renderContext?.component ?? null;
    const scope = component ?? sink.file ?? "";
    return {
      key: `${scope}::${info.label}`,
      label: component ? `${component} › ${info.label}` : info.label,
    };
  }
  return { key: info.label, label: info.label };
}

function analyzeContextRelay(ts, sourceFiles, root) {
  return sourceFiles
    .flatMap((sourceFile) => contextRelayFindingsForFile(ts, sourceFile, root))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.props.length - left.props.length ||
        left.parentFile.localeCompare(right.parentFile),
    );
}

function contextRelayFindingsForFile(ts, sourceFile, root) {
  if (
    !sourceFile.fileName.endsWith(".tsx") &&
    !sourceFile.fileName.endsWith(".jsx")
  ) {
    return [];
  }

  const importMap = localComponentImportMap(ts, sourceFile, root);
  const contextHooks = contextHookNames(ts, sourceFile);
  if (contextHooks.size === 0) return [];

  const usedContextHooks = new Set();
  const findings = [];
  const currentFeature = featureKeyFor(relativePath(root, sourceFile.fileName));

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      contextHooks.has(node.expression.text)
    ) {
      usedContextHooks.add(node.expression.text);
    }

    const jsx = jsxTagAndAttributes(ts, node);
    if (jsx) {
      const imported = importMap.get(jsx.tag);
      if (imported?.feature === currentFeature) {
        const props = jsx.attributes
          .map((attribute) => jsxAttributeName(ts, attribute))
          .filter(Boolean)
          .filter((name) => !localDisplayPropNames.has(name));
        const sharedProps = props.filter(isSharedContextPropName);
        if (props.length >= 3 || sharedProps.length > 0) {
          const location = locationOf(sourceFile, jsx.node);
          findings.push({
            parentFile: relativePath(root, sourceFile.fileName),
            line: location.line,
            column: location.column,
            childComponent: jsx.tag,
            childFile: imported.file,
            contextHooks: Array.from(
              usedContextHooks.size > 0 ? usedContextHooks : contextHooks,
            ),
            props,
            sharedProps,
            score: sharedProps.length * 3 + props.length,
            signal:
              sharedProps.length > 0
                ? "shared prop names"
                : "same-feature prop bundle",
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

function localComponentImportMap(ts, sourceFile, root) {
  const imports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith(".")) continue;
    const clause = statement.importClause;
    if (!clause) continue;
    const importedFile = relativePath(
      root,
      path.resolve(path.dirname(sourceFile.fileName), specifier),
    );
    const feature = featureKeyFor(importedFile);
    if (clause.name && /^[A-Z]/.test(clause.name.text)) {
      imports.set(clause.name.text, { file: importedFile, feature });
    }
    const namedBindings = clause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        if (/^[A-Z]/.test(element.name.text)) {
          imports.set(element.name.text, { file: importedFile, feature });
        }
      }
    }
  }
  return imports;
}

function contextHookNames(ts, sourceFile) {
  const hooks = new Set();
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.includes("context") || specifier.includes("Context")) {
        const namedBindings = node.importClause?.namedBindings;
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          for (const element of namedBindings.elements) {
            if (/^use[A-Z]/.test(element.name.text))
              hooks.add(element.name.text);
          }
        }
      }
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      /^use[A-Z]/.test(node.name.text)
    ) {
      hooks.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hooks;
}

function jsxTagAndAttributes(ts, node) {
  if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName)) {
    return {
      node,
      tag: node.tagName.text,
      attributes: Array.from(node.attributes.properties),
    };
  }
  if (ts.isJsxOpeningElement(node) && ts.isIdentifier(node.tagName)) {
    return {
      node,
      tag: node.tagName.text,
      attributes: Array.from(node.attributes.properties),
    };
  }
  return null;
}

function jsxAttributeName(ts, attribute) {
  if (!ts.isJsxAttribute(attribute)) return "";
  return attribute.name.getText();
}

const localDisplayPropNames = new Set([
  "aria-label",
  "as",
  "children",
  "class",
  "className",
  "data-testid",
  "disabled",
  "fallback",
  "href",
  "id",
  "key",
  "label",
  "ref",
  "style",
  "title",
  "variant",
]);

const sharedContextPropPattern =
  /^(action|actions|can[A-Z]|colorSwatches|detail|filters|fragments|inspector|metadata|model|modes|nodeByDomPath|notes|on[A-Z]|pending|section|selected|selection|settings|state|table|toolModes|view|workspace|zoom)$/u;

function isSharedContextPropName(name) {
  return sharedContextPropPattern.test(name);
}

function applyContextRelayScope(findings, scope) {
  if (!scope) return findings;
  return findings.filter(
    (finding) =>
      finding.parentFile.includes(scope) ||
      finding.childFile.includes(scope) ||
      finding.childComponent.includes(scope) ||
      finding.props.some((prop) => prop.includes(scope)),
  );
}

function familyRows(sinks) {
  const families = new Map();
  for (const sink of sinks) {
    const signature = signatureFor(sink);
    const family = families.get(signature) ?? {
      paths: 0,
      sinks: 0,
      maxDepth: 0,
      example: null,
    };
    family.paths += 1;
    family.sinks += 1;
    // MD-7: keep the deepest member as the family's representative example so the
    // shape is concrete, not just a count.
    if (!family.example || sink.metrics.maximumPathDepth >= family.maxDepth) {
      family.example = sink;
    }
    family.maxDepth = Math.max(family.maxDepth, sink.metrics.maximumPathDepth);
    families.set(signature, family);
  }
  return Array.from(families.entries()).map(([signature, family]) => ({
    signature,
    paths: family.paths,
    sinks: family.sinks,
    maxDepth: family.maxDepth,
    example: family.example,
  }));
}

function signatureFor(sink) {
  const parts = [];
  if (sink.metrics.representationChurn > 0) parts.push("object-pack");
  if (sink.metrics.helperHops > 0) parts.push("call");
  if (sink.metrics.controlDependencyCount > 0) parts.push("conditional");
  if (sink.metrics.impossibleDefenseCount > 0) parts.push("impossible-defense");
  else if (sink.metrics.defensiveOperationCount > 0) parts.push("fallback");
  parts.push("jsx-sink");
  if (sink.metrics.unknownEdgeCount > 0) parts.push("(unknown)");
  // Prefix a depth band so the otherwise-dominant bare `jsx-sink` bucket splits
  // into recognizable shapes (a trivial direct read vs. a deep relayed path) and
  // no single signature swamps the report.
  return `${depthBand(sink.metrics.maximumPathDepth)} ${parts.join(" -> ")}`;
}

// Coarse depth bands. Boundaries chosen against the modeler corpus (median
// depth 2, p90 6): a direct read lands in `trivial`, plain property reads in
// `shallow`, helper/relay chains in `medium`, and architectural relays in `deep`.
function depthBand(depth) {
  if (depth <= 1) return "trivial";
  if (depth <= 3) return "shallow";
  if (depth <= 7) return "medium";
  return "deep";
}

function tableReport(title, headers, rows, intro = []) {
  const lines = [
    `# ${title}`,
    "",
    ...intro,
    ...formatMarkdownTable(headers, rows),
  ];
  return `${lines.join("\n")}\n`;
}

// A short at-a-glance header for every report: where it came from and what the
// view shows / what its terms mean. Reports are often read without the analyzer
// source at hand, so this has to stand alone. Rendered as a blockquote note.
function viewIntro(view, report) {
  const root = report?.meta?.root ?? null;
  const displayRoot = root ? commandPath(root) : null;
  const generated = report?.generatedAt
    ? report.generatedAt.slice(0, 10)
    : null;
  const provenance =
    `Generated by **tsx-dataflow**, a static render-path data-flow analyzer for ` +
    `TypeScript/TSX (Solid/SolidStart-aware)` +
    (displayRoot ? `, from \`${displayRoot}\`` : "") +
    (generated ? ` on ${generated}` : "") +
    `.`;
  const method =
    `It parses the source and builds a graph from each value (props, signals, ` +
    `hooks, locals) through every transformation to the JSX **sink** that renders ` +
    `it, then ranks the heaviest render paths.`;
  const blurb = VIEW_BLURBS[view] ?? "";
  const lines = [`> ${provenance} ${method}`];
  lines.push(
    ">",
    "> Terminology: _source_/_sink_ name code positions in the static graph; counts, scores, reach, depth, and wrapper steps are analyzer-computed signals, not product accounts or runtime telemetry. A _wrapper step_ is a representation-only hop such as an alias, object pack, or spread; it can signal reviewability burden, but it should be weighed with burden score, defensive operation entries, reach, and pack/relay verdicts before choosing work.",
  );
  if (blurb) lines.push(">", `> ${blurb}`);
  lines.push("");
  return lines;
}

// Per-view "what am I looking at" sentence(s): what the rows are and what the
// non-obvious column/field names mean.
const VIEW_BLURBS = {
  overview:
    "The orientation document: read this first. It guides you to every other " +
    "report (what each is for) and carries the workspace aggregates — hotspot " +
    "concentration by file, the repair buckets (peripheral quick wins, central " +
    "leverage, investigate), and an unknown-edge diagnostic section — so you have " +
    "one place to make sense of the dump before opening a focused report.",
  findings:
    "Each finding is one render **sink** (a value rendered into the DOM). " +
    "_Sink_ is the rendered expression, _Source_ the actionable inputs it derives " +
    "from, _path depth_ the number of transformation hops between them, and " +
    "_severity/burden_ reflects how much data-flow plumbing sits on the path.",
  "repeated-forks":
    "Each entry is one component that tests the **same discriminant** in two or " +
    "more sibling branch sites (ternary, `if`, `&&`, Solid `<Match>`/`<Show>`) — " +
    "the signal that it wants to split into discriminated sub-components. _Fork " +
    "sites_ are where the condition repeats; _branch-exclusive values_ are " +
    "component-scope derivations computed eagerly but read under only one branch.",
  "work-packets":
    "Each work item is a scoped cleanup candidate for one render sink. _pivot_ is " +
    "the primary source value, _source inputs_ the distinct inputs merged into it " +
    "(fan-in), _reachable sinks_ how many render sites the same sources feed, and " +
    "the representative path lists every transformation hop from source to JSX " +
    "with its operation kind.",
  "fan-out":
    "Ranks source values by how many render sinks consume them. _Sinks_ is that " +
    "consumer count, _Files_ how many files reference the source, _Example sink_ a " +
    "representative file:line to open first, and _Max depth_ the longest " +
    "transformation path from that source to JSX. Prop reads are scoped to their " +
    "owning component (shown as `Component › props.x`) so a common prop name is not " +
    "merged across unrelated components; hooks, imports, and context values stay " +
    "keyed globally since they really are one shared source.",
  "fan-in":
    "Ranks render sinks by how many independent inputs they merge. _Root sources_ " +
    "is the fan-in count, _Predicates_ the number of conditional branches on the " +
    "path, and _Max distance_ the longest transformation path feeding the sink.",
  "path-families":
    "Groups render paths by structural _signature_ (a depth band plus the sequence " +
    "of operation kinds) so recurring shapes surface. _Paths_/_Sinks_ count the " +
    "family's members and _Max depth_ is the deepest path in it.",
  "defensive-ledger":
    "Lists defensive operations (optional chains, nullish fallbacks) on render " +
    "paths. _Verdict_ is whether the guard can ever fire given the TypeScript " +
    "types: _impossible_ means the guarded value is never nullish, so the defense " +
    "is dead code; _possible_ means it can; _unknown_ means the type is too loose " +
    "to tell. _Action_ separates stale guards from fallbacks that establish certainty.",
  "prop-relay":
    "Render sinks that mostly relay data across component boundaries. _Component " +
    "boundaries_ counts prop hand-offs, _Wrapper steps_ counts representation-only repacks, and " +
    "_Classification_ marks whether the relay transforms the data or just passes it " +
    "through.",
  "context-relay":
    "Same-feature components receiving prop bundles from a context-aware parent — " +
    "candidates for moving shared state behind a Provider/Context instead of " +
    "threading props. Lists the parent's context hooks and the props it forwards.",
  "boundary-report":
    "First-party functions reached while tracing render paths, scored as data-flow " +
    "boundaries. _In-src_ = distinct values reaching the return; _Callers_ = call " +
    "sites across analyzed files; _Internal d/churn_ = depth/representation churn " +
    "inside the body. _Verdict_ flags clean pipes, thin pass-throughs (inline), " +
    "leaky boundaries, confluence/junctions, and hidden-mess internals.",
  "component-refs":
    "Where each component is used. The JSX tag is resolved to its declaration by " +
    "symbol (not by name), so a renamed import or a same-named local is counted " +
    "correctly. _Uses_ is the total render count; _Used by_ lists representative " +
    "call sites. (First slice: capitalized component tags; member tags like " +
    "`Foo.Bar` and non-component symbols come later.)",
  junctions:
    "Functions where independent source lineages fork in (_tributaries_) and the " +
    "result re-spreads to multiple call sites (_distributaries_) — the load-bearing " +
    "knots. Ranked by in-sources × callers. These are the highest-leverage targets " +
    "for either formalizing a typed boundary or splitting by consumer.",
  "inline-preview":
    "An inline-vs-keep call for each helper on a render path: how the path shortens " +
    "(or lengthens) if the helper were folded in, plus a verdict. INLINE removes a " +
    "needless hop; KEEP/FORMALIZE means the helper consolidates real work. Proposes, " +
    "never rewrites.",
};

// Render a GitHub-flavored Markdown table with prettier-style column alignment:
// every column is padded to the widest (visible) cell, and the separator row's
// dashes fill the same width. Cells are sanitized via formatTableCell (newlines
// collapsed, pipes escaped); padding is computed on the *visible* width so an
// escaped pipe (`\|`, two source chars, one rendered char) still aligns.
function formatMarkdownTable(headers, rows) {
  const grid = [headers, ...rows].map((row) =>
    headers.map((_, column) => formatTableCell(row[column] ?? "")),
  );
  const widths = headers.map((_, column) =>
    Math.max(3, ...grid.map((row) => cellWidth(row[column]))),
  );
  const renderRow = (row) =>
    `| ${row.map((cell, column) => padCell(cell, widths[column])).join(" | ")} |`;
  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
  return [renderRow(grid[0]), separator, ...grid.slice(1).map(renderRow)];
}

function formatTableCell(value) {
  return String(value).replaceAll("\n", " ").replaceAll("|", "\\|");
}

// A small two-column metric/value table. Numeric and label metrics read better
// as an aligned table than as a fenced block; fences are reserved for code.
function metricTable(pairs) {
  return formatMarkdownTable(
    ["Metric", "Value"],
    pairs.map(([label, value]) => [label, String(value)]),
  );
}

// Visible width of an already-escaped cell. GFM unescapes `\|` to `|` before
// rendering, so each escaped pipe occupies one rendered column, not two.
function cellWidth(escaped) {
  return escaped.length - (escaped.match(/\\\|/g)?.length ?? 0);
}

function padCell(escaped, width) {
  return escaped + " ".repeat(Math.max(0, width - cellWidth(escaped)));
}

// Wrap a code-ish cell value as a Markdown code span so it renders monospaced.
// Safe inside a table cell: GFM strips the table pipe-escaping before inline
// code parsing, so backticks and escaped pipes coexist. Expressions often embed
// backticks (template literals), so the delimiter is a backtick run one longer
// than any internal run, with a pad space when the text starts/ends with a
// backtick (GFM strips one space each side). Empty values are left untouched.
function code(value) {
  const text = String(value).trim();
  if (!text) return "";
  const longestRun = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longestRun + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

// A fenced code block for the indented (prose) renderers. In GitHub-flavored
// Markdown a 2-space indent does NOT create a code block, so aligned metric
// columns and multi-line expressions collapse into re-wrapped prose. Fencing the
// monospace payload preserves alignment. `content` is one entry per line
// (already one-lined). Backticks are stripped from the payload: everything in
// the block is already monospace, so a template literal's source backticks
// (`` `link-${id}` ``) read as stray markdown ticks rather than signal — and a
// stray "```" line would otherwise close the fence early.
function fenced(content) {
  return [
    "```",
    ...content.map((line) => String(line).replaceAll("`", "")),
    "```",
  ];
}

// Collapse an expression/path-step/label to a single line and truncate on a
// token-ish boundary with a trailing ellipsis. The prose-renderer analogue of
// formatTableCell: no rendered expression should carry a raw newline or be cut
// mid-identifier without a `…` marker.
function formatExpression(value, max = 100) {
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

// Collapse all whitespace to single spaces without truncating — used to compare
// a child sub-expression against its parent's text by substring.
function collapse(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

// Render `full` as a snippet centered on `via` (the sub-expression that flowed
// in from the previous step), marking `via` with « » and trimming surrounding
// context with ellipses to fit `max`. Falls back to a plain truncation when
// `via` is absent, unlocatable, or spans essentially the whole expression.
function focusSnippet(full, via, max) {
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

function appendBaseline(lines, report) {
  if (!report.baseline) return;
  const baseline = report.baseline;
  lines.push("## Baseline");
  lines.push("");
  lines.push(
    ...metricTable([
      ["current worst", baseline.currentWorst.toFixed(2)],
      ["baseline worst", baseline.baselineWorst.toFixed(2)],
      ["regressed", baseline.regressed ? "yes" : "no"],
    ]),
  );

  const changes = [];
  for (const item of baseline.removed ?? []) {
    changes.push(
      `Removed:   ${formatExpression(item.label, 60)}${item.depth != null ? ` (depth ${item.depth})` : ""}`,
    );
  }
  for (const item of baseline.improved ?? []) {
    changes.push(
      `Improved:  ${item.file}:${item.line} ${item.before} -> ${item.after}`,
    );
  }
  for (const item of baseline.regressedSinks ?? []) {
    changes.push(
      `Regressed: ${item.file}:${item.line} ${item.before} -> ${item.after}`,
    );
  }
  if (baseline.newTop) {
    changes.push(
      `New top:   ${baseline.newTop.file}:${baseline.newTop.line} ${formatExpression(baseline.newTop.label, 48)}`,
    );
  }
  if (changes.length > 0) {
    lines.push("");
    lines.push(...fenced(changes));
  }
}

// Confidence as a score plus a plain-English reason and risk (Phase 4). The
// numeric `score` preserves the prior return value so ranking/queueing are
// unchanged; reason/risk explain it in human terms for the report.
function confidenceFor(metrics, defenses) {
  if (metrics.unknownEdgeCount > 0) {
    return {
      score: 72,
      reason: "Path contains unresolved (dynamic or external) hops.",
      risk: "medium; verify the unknown edge before editing.",
    };
  }
  if (defenses.some((defense) => defense.verdict === "unknown")) {
    return {
      score: 80,
      reason: "A guard's type is too loose to evaluate statically.",
      risk: "low–medium; confirm the guard is still needed.",
    };
  }
  if (metrics.impossibleDefenseCount > 0) {
    return {
      score: 99,
      reason: "Single file, direct JSX sink, all hops statically resolved.",
      risk: "low; behavior-preserving extraction likely.",
    };
  }
  return {
    score: 88,
    reason: "All hops statically resolved within one file.",
    risk: "low.",
  };
}

function queueFor(metrics, defenses, reachThreshold = 3) {
  if (
    metrics.unknownEdgeCount > 0 ||
    defenses.some((defense) => defense.verdict === "unknown")
  ) {
    return "investigation";
  }
  // Central-leverage = a source that feeds many render sinks (top reach
  // quartile for the report, passed in) or a pathologically deep relay path.
  if (
    metrics.reachableSinks >= reachThreshold ||
    metrics.maximumPathDepth > 10
  ) {
    return "central-leverage";
  }
  return "peripheral-quick-win";
}

// The weighted metrics that make up the burden score, kept in one place so the
// score and its human-readable breakdown can never drift apart. Each term reads
// a raw metric, log-normalizes it, and contributes `weight * normalized`.
const BURDEN_TERMS = [
  {
    key: "maximumPathDepth",
    label: "path depth",
    weight: 0.15,
    read: (m) => m.maximumPathDepth,
  },
  {
    key: "helperHops",
    label: "helper hops",
    weight: 0.13,
    read: (m) => m.helperHops,
  },
  {
    key: "representationChurn",
    label: "representation churn",
    weight: 0.16,
    read: (m) => m.representationChurn,
  },
  {
    key: "defensiveOperations",
    label: "defensive operations",
    weight: 0.15,
    read: (m) =>
      m.actionableDefensiveOperationCount ?? m.defensiveOperationCount,
  },
  {
    key: "impossibleDefenseCount",
    label: "impossible defenses",
    weight: 0.15,
    read: (m) => m.impossibleDefenseCount,
  },
  {
    key: "controlDependencyCount",
    label: "control dependencies",
    weight: 0.1,
    read: (m) => m.controlDependencyCount,
  },
  {
    key: "repeatedNormalization",
    label: "repeated normalization",
    weight: 0.08,
    read: (m) => m.repeatedNormalization,
  },
  { key: "packRisk", label: "pack risk", weight: 0.08, read: (m) => m.packRisk },
];

function burdenScore(metrics) {
  return clamp01(burdenRawSum(metrics));
}

function burdenRawSum(metrics) {
  return BURDEN_TERMS.reduce(
    (sum, term) => sum + term.weight * normalized(term.read(metrics) ?? 0),
    0,
  );
}

// Per-term decomposition of the burden score, sorted by contribution (largest
// first). `total` is the clamped score actually used for ranking; `rawSum` is
// the pre-clamp sum, so a UI can flag when clamping discarded surplus burden.
function burdenBreakdown(metrics) {
  const terms = BURDEN_TERMS.map((term) => {
    const raw = term.read(metrics) ?? 0;
    const norm = normalized(raw);
    return {
      key: term.key,
      label: term.label,
      weight: term.weight,
      raw,
      normalized: norm,
      contribution: term.weight * norm,
    };
  }).sort((a, b) => b.contribution - a.contribution);
  const rawSum = terms.reduce((sum, term) => sum + term.contribution, 0);
  return { terms, rawSum, total: clamp01(rawSum) };
}

function centralityScore(metrics) {
  // Grounded in true downstream reach (reachableSinks) rather than a constant
  // base value: a source feeding many sinks now outranks an equally-deep but
  // isolated one. Depth, helper hops, fan-in, and slice size remain secondary.
  return clamp01(
    0.4 * normalized(metrics.reachableSinks) +
      0.2 * normalized(metrics.maximumPathDepth) +
      0.15 * normalized(metrics.helperHops) +
      0.15 * normalized(metrics.mergeWidth) +
      0.1 * normalized(metrics.sliceSize),
  );
}

function changeRiskScore(metrics) {
  // Editing a widely-reaching source touches more render sinks, so reach is the
  // dominant change-risk signal alongside unknown edges and control flow.
  return clamp01(
    0.25 * normalized(metrics.reachableSinks) +
      0.25 * normalized(metrics.unknownEdgeCount) +
      0.15 * normalized(metrics.controlDependencyCount) +
      0.1 * normalized(metrics.helperHops) +
      0.25 * normalized(metrics.sliceSize),
  );
}

export function findingTitle(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) {
    return "type-impossible defensive render path";
  }
  if (sink.metrics.representationChurn > 1)
    return "representation-heavy render path";
  if (sink.metrics.helperHops > 1) return "helper-heavy render path";
  return "render-path data-flow hotspot";
}

function findingSentence(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) {
    return "A nullish fallback or optional access is unreachable under the checked TypeScript program.";
  }
  return "This rendered value has more data-flow plumbing than nearby JSX should usually need.";
}

function severityFor(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) return "HIGH";
  if (sink.scores.burden > 0.55) return "MEDIUM";
  return "LOW";
}

function backgroundClassificationFor(sink) {
  const healthyBoundary = healthySharedBoundaryFor(sink);
  if (healthyBoundary) {
    return {
      label: "healthy shared boundary",
      reason: `${healthyBoundary} returns cohesive layout data; sink reads an expected field`,
      penalty: 0.25,
    };
  }
  if (isLowValueScalarHelper(sink)) {
    return {
      label: "already readable",
      reason:
        "local scalar helper; simple reads/arithmetic; no defenses or object packing",
      penalty: 0.35,
    };
  }
  return null;
}

function healthySharedBoundaryFor(sink) {
  const metrics = sink.metrics ?? {};
  if ((metrics.impossibleDefenseCount ?? 0) > 0) return null;
  if ((metrics.defensiveOperationCount ?? 0) > 0) return null;
  if ((metrics.unknownEdgeCount ?? 0) > 0) return null;
  const steps = sink.representativeSteps ?? [];
  const helper = steps.find(
    (step) =>
      step.kind === "call" &&
      /^(?:compute|build|create|derive)[A-Z].*(?:Layout|Geometry|Bounds|Scale|Chart)/.test(
        step.label,
      ),
  );
  if (!helper) return null;
  const finalRead = [...steps]
    .reverse()
    .find((step) => step.kind === "property-read");
  const field = finalRead?.label ?? "";
  if (
    !/^(?:inner|outer|width|height|left|right|top|bottom|x|y|scale|padding|domain|range)/i.test(
      field,
    )
  ) {
    return null;
  }
  const text = `${helper.label} ${helper.detail ?? ""}`;
  return /Layout|Geometry|Bounds|Scale|Chart/.test(text) ? helper.label : null;
}

function isLowValueScalarHelper(sink) {
  const metrics = sink.metrics ?? {};
  if ((metrics.maximumPathDepth ?? 0) > 7) return false;
  if ((metrics.impossibleDefenseCount ?? 0) > 0) return false;
  if ((metrics.defensiveOperationCount ?? 0) > 0) return false;
  if ((metrics.representationChurn ?? 0) > 0) return false;
  if ((metrics.packRisk ?? 0) > 0) return false;
  if ((metrics.unknownEdgeCount ?? 0) > 0) return false;
  if ((metrics.mergeWidth ?? 0) > 3) return false;
  const steps = sink.representativeSteps ?? [];
  if (steps.some((step) => !SCALAR_HELPER_STEP_KINDS.has(step.kind)))
    return false;
  const text = steps.map((step) => step.label).join(" ");
  if (!/[-+*/%<>!]|\b(?:Math|max|min|round|floor|ceil)\b/.test(text))
    return false;
  const finalStep = finalLocalStepFor(sink);
  if (!finalStep || !["call", "alias"].includes(finalStep.kind)) return false;
  const finalName = String(finalStep.label ?? "").replace(/\(\)$/g, "");
  return /^(?:has|show|is|axis|tick|title|label|inner|outer|start|end|x|y|width|height|left|right|top|bottom)/i.test(
    finalName,
  );
}

const SCALAR_HELPER_STEP_KINDS = new Set([
  "source",
  "property-read",
  "conditional",
  "call",
  "alias",
  "solid-accessor",
]);

function finalLocalStepFor(sink) {
  const steps = sink.representativeSteps ?? [];
  return [...steps]
    .reverse()
    .find((step) => ["call", "alias", "property-read"].includes(step.kind));
}

function percentile(values, target) {
  if (values.length === 0) return 0;
  return values[
    Math.min(values.length - 1, Math.floor(values.length * target))
  ];
}

function normalized(value) {
  return Math.min(1, Math.log1p(value) / Math.log1p(20));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function isWithin(file, root) {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function safeTypeText(value = "") {
  return value || "unknown";
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
