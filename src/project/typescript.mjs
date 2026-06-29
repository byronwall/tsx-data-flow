import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { shouldAnalyzeFile, walkFiles } from "./files.mjs";
import { resolveProjectConfigs } from "./tsconfig.mjs";

const require = createRequire(import.meta.url);

// This package's own directory. Used as a last-resort location for resolving
// the bundled `typescript` dependency.
const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

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
export function buildProgram(args) {
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

function unique(values) {
  return [...new Set(values)];
}
