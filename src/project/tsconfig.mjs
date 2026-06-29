import fs from "node:fs";
import path from "node:path";
import { DEFAULT_IGNORED_PARTS, isWithin } from "./files.mjs";

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
        if (
          DEFAULT_IGNORED_PARTS.has(entry.name) ||
          entry.name.startsWith(".")
        ) {
          continue;
        }
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
      error: ts.flattenDiagnosticMessageText(
        configFile.error.messageText,
        "\n",
      ),
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
export function resolveProjectConfigs(ts, args) {
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
    if (a.strictNullChecks !== b.strictNullChecks) {
      return a.strictNullChecks ? -1 : 1;
    }
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
    '  • Note: a solution/aggregator tsconfig ("files": [], only "references")',
    "    is not valid on its own — pass one of the referenced project configs.",
  );
  return lines.join("\n");
}
