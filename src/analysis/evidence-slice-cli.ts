#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../cli/args";
import { buildProgram } from "../project/typescript";
import {
  normalizeProgramEvidence,
  queryEvidenceSlice,
  type EvidenceSliceSource,
  type SliceQuery,
} from "./evidence-slice";
import { buildProgramEvidence, type ProgramEvidence } from "./program-evidence";
import type {
  BoundaryPolicyInput,
  ProgramElement,
  ProgramRelation,
  ScopeSeed,
  ScopeCandidate,
  SliceDirection,
  TerminalPolicyInput,
} from "./scope-seam";

export type EvidenceSliceAdapterInput = {
  evidence?: ProgramEvidence;
  /** Optional lazy provider for callers that do not have an eager payload. */
  provider?: EvidenceSliceSource;
  seed?: ScopeSeed;
  seeds?: ScopeSeed[];
};

export type EvidenceSliceAdapter = {
  name?: string;
  load: (fixtureRoot: string) => EvidenceSliceAdapterInput | Promise<EvidenceSliceAdapterInput>;
};

export type EvidenceSliceAdapterLoader =
  | EvidenceSliceAdapter
  | ((fixtureRoot: string) => EvidenceSliceAdapterInput | Promise<EvidenceSliceAdapterInput>);

/**
 * Small import seam for adapter workers. Adapters can register themselves in
 * an embedding process, while the executable also resolves built-in modules
 * lazily after they land.
 */
export const evidenceSliceAdapterRegistry = new Map<string, EvidenceSliceAdapterLoader>([
  ["solid-route", (fixtureRoot) => loadPlannedEvidenceSliceAdapter("solid-route", fixtureRoot)],
  ["solid-full-stack", (fixtureRoot) => loadPlannedEvidenceSliceAdapter("solid-full-stack", fixtureRoot)],
  ["node-cli", (fixtureRoot) => loadPlannedEvidenceSliceAdapter("node-cli", fixtureRoot)],
  ["http-service", (fixtureRoot) => loadPlannedEvidenceSliceAdapter("http-service", fixtureRoot)],
  ["serverless-handler", (fixtureRoot) => loadPlannedEvidenceSliceAdapter("serverless-handler", fixtureRoot)],
]);

export function registerEvidenceSliceAdapter(name: string, loader: EvidenceSliceAdapterLoader) {
  evidenceSliceAdapterRegistry.set(name, loader);
}

export const plannedEvidenceSliceAdapterModules: Readonly<Record<string, string>> = {
  "solid-route": "./scope-adapters/solid-route.js",
  "solid-full-stack": "./scope-adapters/solid-full-stack.js",
  "node-cli": "./scope-adapters/node-cli.js",
  "http-service": "./scope-adapters/http-service.js",
  "serverless-handler": "./scope-adapters/serverless-handler.js",
};

type CliOptions = {
  fixtureRoot: string;
  adapter: string;
  scope: string | null;
  direction: SliceDirection | undefined;
  budget: number | undefined;
  boundaryPolicy: BoundaryPolicyInput;
  terminalPolicy: TerminalPolicyInput;
};

type AdapterModule = Record<string, unknown>;
type ScopeAdapterEvidence = { elements: ProgramElement[]; relations: ProgramRelation[] };
type ScopeAdapterModule = {
  discover: (root: string, evidence: ScopeAdapterEvidence) => ScopeCandidate[];
  seed: (candidate: ScopeCandidate) => ScopeSeed;
};
const requireModule = createRequire(import.meta.url);

/** Parse the temporary spike CLI without adding a second argument dependency. */
export function parseEvidenceSliceCliArgs(argv: readonly string[]): CliOptions | { help: true } {
  let fixtureRoot: string | undefined;
  let adapter: string | undefined;
  let scope: string | null = null;
  let direction: SliceDirection | undefined;
  let budget: number | undefined;
  const boundaryPolicy: BoundaryPolicyInput = {};
  const terminalPolicy: TerminalPolicyInput = {};
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === "--help" || raw === "-h") return { help: true };
    const [name, inline] = raw.split("=", 2);
    const readValue = () => {
      if (inline !== undefined) return inline;
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${raw}`);
      return argv[index];
    };
    switch (name) {
      case "--root":
      case "--fixture-root":
        fixtureRoot = readValue();
        break;
      case "--adapter":
        adapter = readValue();
        break;
      case "--scope":
        scope = readValue();
        break;
      case "--direction":
        direction = parseDirection(readValue());
        break;
      case "--budget":
        budget = positiveInteger(readValue(), "--budget");
        break;
      case "--max-depth":
        boundaryPolicy.maxDepth = positiveInteger(readValue(), "--max-depth");
        break;
      case "--max-elements":
        boundaryPolicy.maxElements = positiveInteger(readValue(), "--max-elements");
        break;
      case "--max-relations":
        boundaryPolicy.maxRelations = positiveInteger(readValue(), "--max-relations");
        break;
      case "--max-terminals":
        terminalPolicy.maxTerminals = positiveInteger(readValue(), "--max-terminals");
        break;
      case "--no-external":
        boundaryPolicy.includeExternal = false;
        break;
      case "--no-framework":
        boundaryPolicy.includeFramework = false;
        break;
      case "--no-unsupported":
        boundaryPolicy.includeUnsupported = false;
        break;
      case "--stop-at-boundary":
        boundaryPolicy.stopAtBoundary = true;
        break;
      case "--stop-at-terminal":
        terminalPolicy.stopAtTerminal = true;
        break;
      case "--no-intermediate":
        terminalPolicy.includeIntermediate = false;
        break;
      default:
        if (name.startsWith("-")) throw new Error(`Unknown option: ${name}`);
        positional.push(raw);
        break;
    }
  }

  fixtureRoot ??= positional.shift();
  adapter ??= positional.shift();
  if (positional.length > 0) throw new Error(`Unexpected argument: ${positional[0]}`);
  if (!fixtureRoot) throw new Error("A fixture root is required (--fixture-root <path>).");
  if (!adapter) throw new Error("An adapter is required (--adapter <name>).");
  return {
    fixtureRoot: path.resolve(fixtureRoot),
    adapter,
    scope,
    direction,
    budget,
    boundaryPolicy,
    terminalPolicy,
  };
}

export async function runEvidenceSliceCli(
  argv: readonly string[],
  registry: ReadonlyMap<string, EvidenceSliceAdapterLoader> = evidenceSliceAdapterRegistry,
): Promise<string> {
  const parsed = parseEvidenceSliceCliArgs(argv);
  if ("help" in parsed) return evidenceSliceCliHelp();
  const loaded = await loadAdapter(parsed.adapter, parsed.fixtureRoot, registry);
  const seed = selectSeed(loaded, parsed.scope);
  const query: SliceQuery = {
    seed,
    direction: parsed.direction,
    boundaryPolicy: parsed.boundaryPolicy,
    terminalPolicy: parsed.terminalPolicy,
    budget: parsed.budget,
  };
  const source = loaded.provider ?? loaded.evidence;
  if (!source) throw new Error("The selected adapter returned neither eager evidence nor a relation provider.");
  const slice = queryEvidenceSlice(source, query);
  return `${JSON.stringify(slice, null, 2)}\n`;
}

export function evidenceSliceCliHelp() {
  return [
    "Usage: pnpm exec tsx src/analysis/evidence-slice-cli.ts <fixture-root> <adapter> [options]",
    "",
    "Options:",
    "  --fixture-root <path>     Fixture or project root",
    "  --adapter <name>          Registered adapter (solid-route, solid-full-stack, node-cli, http-service, or serverless-handler)",
    "  --scope <id>              Candidate ID, entry element ID, or label",
    "  --direction <mode>        forward, backward, or both",
    "  --budget <n>              Maximum relation visits",
    "  --max-depth <n>           Maximum relation depth",
    "  --max-elements <n>        Maximum emitted elements",
    "  --max-relations <n>       Maximum emitted relations",
    "  --max-terminals <n>       Maximum emitted terminals",
    "  --no-external             Stop before external-code boundaries",
    "  --no-framework            Stop before framework-runtime boundaries",
    "  --no-unsupported          Stop before unsupported boundaries",
    "  --stop-at-boundary        Retain a boundary, then stop beyond it",
    "  --stop-at-terminal        Stop after a selected terminal",
    "  --no-intermediate         Stop at selected terminals",
    "  --help                    Show this help",
  ].join("\n") + "\n";
}

async function loadAdapter(
  name: string,
  fixtureRoot: string,
  registry: ReadonlyMap<string, EvidenceSliceAdapterLoader>,
): Promise<EvidenceSliceAdapterInput> {
  const registered = registry.get(name);
  if (registered) return loadFromRegistered(registered, fixtureRoot);
  const moduleSpecifier = plannedEvidenceSliceAdapterModules[name];
  if (!moduleSpecifier) {
    const names = [...new Set([...registry.keys(), ...Object.keys(plannedEvidenceSliceAdapterModules)])].sort();
    throw new Error(`Unknown evidence-slice adapter "${name}". Available adapters: ${names.join(", ") || "none"}.`);
  }
  return loadPlannedEvidenceSliceAdapter(name, fixtureRoot, moduleSpecifier);
}

function loadPlannedEvidenceSliceAdapter(
  name: string,
  fixtureRoot: string,
  moduleSpecifier = plannedEvidenceSliceAdapterModules[name],
): EvidenceSliceAdapterInput {
  if (!moduleSpecifier) throw new Error(`No planned module is registered for "${name}".`);
  const adapter = loadScopeAdapterModule(moduleSpecifier, name);
  const args = parseArgs([], { root: fixtureRoot, source: fixtureRoot });
  const { ts, program } = buildProgram(args);
  const evidence = buildProgramEvidence(ts, program, fixtureRoot);
  const normalized = normalizeProgramEvidence(evidence);
  const candidates = adapter.discover(fixtureRoot, {
    elements: normalized.elements,
    relations: normalized.relations,
  });
  return { evidence, seeds: candidates.map(adapter.seed) };
}

function loadScopeAdapterModule(moduleSpecifier: string, name: string): ScopeAdapterModule {
  const sourcePath = fileURLToPath(new URL(moduleSpecifier, import.meta.url));
  const candidates = sourcePath.endsWith(".js")
    ? [sourcePath.slice(0, -3) + ".ts", sourcePath]
    : [sourcePath];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existing) throw new Error(`Adapter module for "${name}" is not available at ${sourcePath}.`);
  const imported = requireModule(existing) as AdapterModule;
  const discover = functionExport(imported, ["discover", `discover${pascalCase(name)}Candidates`]);
  const seed = functionExport(imported, ["seed", `build${pascalCase(name)}Seed`]);
  if (!discover || !seed) throw new Error(`Adapter module for "${name}" must export discovery and seed functions.`);
  return {
    discover: (root, evidence) => {
      const result = discover(root, evidence);
      if (!Array.isArray(result)) throw new Error(`Adapter "${name}" did not return scope candidates.`);
      return result as ScopeCandidate[];
    },
    seed: (candidate) => seed(candidate) as ScopeSeed,
  };
}

function functionExport(module: AdapterModule, names: string[]) {
  for (const name of names) {
    const candidate = module[name];
    if (typeof candidate === "function") return candidate as (...args: unknown[]) => unknown;
  }
  return null;
}

function pascalCase(value: string) {
  return value.split("-").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join("");
}

async function loadFromRegistered(
  loader: EvidenceSliceAdapterLoader | unknown,
  fixtureRoot: string,
): Promise<EvidenceSliceAdapterInput> {
  if (typeof loader === "function") {
    const load = loader as (root: string) => EvidenceSliceAdapterInput | Promise<EvidenceSliceAdapterInput>;
    return load(fixtureRoot);
  }
  if (isAdapter(loader)) return loader.load(fixtureRoot);
  throw new Error("The selected adapter does not expose a load(fixtureRoot) function.");
}

function isAdapter(value: unknown): value is EvidenceSliceAdapter {
  return Boolean(value && typeof value === "object" && "load" in value && typeof value.load === "function");
}

function selectSeed(input: EvidenceSliceAdapterInput, selected: string | null) {
  const seeds = input.seeds ?? (input.seed ? [input.seed] : []);
  if (seeds.length === 0) throw new Error("The selected adapter returned no scope seed.");
  if (!selected) return seeds[0];
  const match = seeds.find((seed) =>
    seed.candidateId === selected ||
    seed.entryElementId === selected ||
    seed.label === selected,
  );
  if (match) return match;
  throw new Error(`Scope "${selected}" was not found in the selected adapter output.`);
}

function parseDirection(value: string): SliceDirection {
  if (value === "forward" || value === "backward" || value === "both") return value;
  throw new Error(`Invalid direction "${value}". Use forward, backward, or both.`);
}

function positiveInteger(value: string, option: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${option} requires a positive integer.`);
  return parsed;
}

/** Optional direct entry point for `tsx src/analysis/evidence-slice-cli.ts`. */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    process.stdout.write(await runEvidenceSliceCli(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
