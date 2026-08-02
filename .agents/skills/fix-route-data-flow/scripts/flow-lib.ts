import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeProject } from "../../../../src/core";
import { parseArgs as parseAnalyzerArgs } from "../../../../src/cli/args";
import {
  buildRouteDataDetail,
  buildRouteDataInventory,
} from "../../../../src/api/projections/route-data";

export type CliArgs = Map<string, string[]>;

export type FlowSnapshot = {
  schemaVersion: 1;
  request: {
    root: string;
    projectSource: string;
    routeKey: string | null;
    routePath: string | null;
    sourceKey: string | null;
    sourceLabel: string | null;
    sourceFile: string | null;
    sourceLine: number | null;
    expectedComponents: string[];
    rejectedComponents: string[];
  };
  route: {
    key: string;
    path: string;
    file: string;
    trajectoryKey: string;
  } | null;
  source: {
    key: string;
    label: string;
    file: string;
    line: number;
    consumerLabel: string | null;
    handoffProven: boolean;
  } | null;
  graph: {
    totalTrajectories: number;
    totalTerminals: number;
    totalComponents: number;
    truncated: boolean;
    cycleCount: number;
    pathBudget: number;
  } | null;
  projection: {
    exactPathCount: number;
    terminalCount: number;
    maximumDepth: number;
    partialPathCount: number;
    unknownEdgeCount: number;
    edgeKinds: Record<string, number>;
    components: string[];
    terminals: string[];
    missingExpectedComponents: string[];
    presentRejectedComponents: string[];
    pathSamples: Array<{
      terminal: string;
      steps: number;
      first: string | null;
      last: string | null;
      lastComponent: string | null;
    }>;
  } | null;
};

type SelectionHints = {
  routeKey: string | null;
  routePath: string | null;
  routeFile: string | null;
  trajectoryKey: string | null;
  trajectoryLabel: string | null;
  sourceKey: string | null;
  sourceLabel: string | null;
  sourceFile: string | null;
  sourceLine: number | null;
};

export function parseCliArgs(argv: string[]) {
  const args: CliArgs = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) throw new Error(`Unexpected argument: ${raw}`);
    const [name, inlineValue] = raw.split("=", 2);
    if (name === "--help" && inlineValue == null) {
      args.set(name, ["true"]);
      continue;
    }
    const value = inlineValue ?? argv[++index];
    if (value == null || value.startsWith("--")) {
      throw new Error(`Missing value for ${name}`);
    }
    args.set(name, [...(args.get(name) ?? []), value]);
  }
  return args;
}

export function one(args: CliArgs, name: string) {
  return args.get(name)?.at(-1) ?? null;
}

export function many(args: CliArgs, name: string) {
  return args.get(name) ?? [];
}

export async function readSnapshot(file: string) {
  return JSON.parse(await readFile(file, "utf8")) as FlowSnapshot;
}

export async function writeJson(file: string | null, value: unknown) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (!file) {
    process.stdout.write(text);
    return;
  }
  const absolute = path.resolve(file);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, text);
  process.stdout.write(`${absolute}\n`);
}

export async function buildSnapshot(args: CliArgs): Promise<FlowSnapshot> {
  const root = path.resolve(one(args, "--root") ?? process.cwd());
  const projectSource = one(args, "--project-source") ?? "src";
  const selection = await selectionHints(one(args, "--selection"));
  const prior = one(args, "--source-snapshot")
    ? await readSnapshot(one(args, "--source-snapshot")!)
    : null;
  const requested = {
    routeKey: one(args, "--route-key") ?? selection.routeKey ?? prior?.route?.key ?? null,
    routePath: one(args, "--route-path") ?? selection.routePath ?? prior?.route?.path ?? null,
    sourceKey: one(args, "--source-key") ?? selection.sourceKey ?? prior?.source?.key ?? null,
    sourceLabel: one(args, "--source-label") ?? selection.sourceLabel ?? prior?.source?.label ?? null,
    sourceFile: one(args, "--source-file") ?? selection.sourceFile ?? prior?.source?.file ?? null,
    sourceLine: integer(one(args, "--source-line")) ?? selection.sourceLine ?? prior?.source?.line ?? null,
  };
  const analyzerArgv = [
    "--root", root,
    "--source", projectSource,
    "--view", "overview",
    "--format", "json",
  ];
  const tsconfig = one(args, "--tsconfig");
  const typescriptFrom = one(args, "--typescript-from");
  if (tsconfig) analyzerArgv.push("--tsconfig", tsconfig);
  if (typescriptFrom) analyzerArgv.push("--typescript-from", typescriptFrom);
  const report = await analyzeProject(parseAnalyzerArgs(analyzerArgv));
  const inventory = buildRouteDataInventory(report);
  const route = inventory.routes.find((item) => item.key === requested.routeKey)
    ?? inventory.routes.find((item) => item.pathPattern === requested.routePath)
    ?? inventory.routes.find((item) => item.file === selection.routeFile)
    ?? null;
  const routeTrajectories = route
    ? inventory.trajectories.filter((item) => item.routeKey === route.key)
    : [];
  const trajectory = routeTrajectories.find((item) => item.key === selection.trajectoryKey)
    ?? routeTrajectories.find((item) => item.label === selection.trajectoryLabel)
    ?? routeTrajectories[0]
    ?? null;
  const detail = route && trajectory
    ? buildRouteDataDetail(report, route.key, trajectory.key)
    : null;
  const sourceCandidates = detail?.sources ?? inventory.sources;
  const source = resolveSource(sourceCandidates, requested);
  const expectedComponents = sortedUnique(
    many(args, "--expect-component").length
      ? many(args, "--expect-component")
      : prior?.request.expectedComponents ?? [],
  );
  const rejectedComponents = sortedUnique(
    many(args, "--reject-component").length
      ? many(args, "--reject-component")
      : prior?.request.rejectedComponents ?? [],
  );
  const projection = detail && source
    ? sourceProjection(detail, source.key, expectedComponents, rejectedComponents)
    : null;
  return {
    schemaVersion: 1,
    request: {
      root,
      projectSource,
      ...requested,
      expectedComponents,
      rejectedComponents,
    },
    route: route && trajectory ? {
      key: route.key,
      path: route.pathPattern,
      file: route.file,
      trajectoryKey: trajectory.key,
    } : null,
    source: source ? {
      key: source.key,
      label: source.label,
      file: source.file,
      line: source.line,
      consumerLabel: source.consumerLabel,
      handoffProven: source.handoffProven,
    } : null,
    graph: detail ? {
      totalTrajectories: detail.exhaustiveGraph.totals.trajectories,
      totalTerminals: detail.exhaustiveGraph.totals.sinks,
      totalComponents: detail.exhaustiveGraph.totals.components,
      truncated: detail.exhaustiveGraph.truncated,
      cycleCount: detail.exhaustiveGraph.cycleCount,
      pathBudget: detail.exhaustiveGraph.pathBudget,
    } : null,
    projection,
  };
}

function resolveSource(
  candidates: ReturnType<typeof buildRouteDataInventory>["sources"],
  requested: {
    sourceKey: string | null;
    sourceLabel: string | null;
    sourceFile: string | null;
    sourceLine: number | null;
  },
) {
  const keyed = candidates.find((item) => item.key === requested.sourceKey);
  if (keyed) return keyed;
  const sameFile = requested.sourceFile
    ? candidates.filter((item) => item.file === requested.sourceFile)
    : [];
  const labeled = requested.sourceLabel
    ? candidates.filter((item) =>
      item.label === requested.sourceLabel || item.consumerLabel === requested.sourceLabel
    )
    : [];
  const fileAndLabel = sameFile.filter((item) => labeled.includes(item));
  const pool = fileAndLabel.length ? fileAndLabel : sameFile.length ? sameFile : labeled;
  return [...pool].sort((left, right) =>
    distance(left.line, requested.sourceLine) - distance(right.line, requested.sourceLine)
    || lexical(left.label, right.label)
    || lexical(left.key, right.key)
  )[0] ?? null;
}

function sourceProjection(
  detail: NonNullable<ReturnType<typeof buildRouteDataDetail>>,
  sourceKey: string,
  expectedComponents: string[],
  rejectedComponents: string[],
): NonNullable<FlowSnapshot["projection"]> {
  const paths = detail.exhaustiveGraph.trajectories.filter((item) =>
    item.sourceMethodKeys.includes(sourceKey)
  );
  const nodes = new Map(detail.exhaustiveGraph.nodes.map((node) => [node.key, node]));
  const edges = new Map<string, typeof detail.exhaustiveGraph.edges>();
  for (const edge of detail.exhaustiveGraph.edges) {
    const key = `${edge.from}\u0000${edge.to}`;
    edges.set(key, [...(edges.get(key) ?? []), edge]);
  }
  const edgeKinds = new Map<string, number>();
  let unknownEdgeCount = 0;
  for (const trajectory of paths) {
    for (let index = 1; index < trajectory.stepKeys.length; index += 1) {
      for (const edge of edges.get(`${trajectory.stepKeys[index - 1]}\u0000${trajectory.stepKeys[index]}`) ?? []) {
        edgeKinds.set(edge.kind, (edgeKinds.get(edge.kind) ?? 0) + 1);
        if (edge.unknown) unknownEdgeCount += 1;
      }
    }
  }
  const components = sortedUnique(paths.flatMap((item) =>
    item.stepComponents.filter((component) => component !== "Unowned / external")
  ));
  const terminals = sortedUnique(paths.map((item) => item.terminalLabel));
  const terminalCount = new Set(paths.map((item) => item.sinkId)).size;
  const pathSamples = paths.map((item) => ({
    terminal: item.terminalLabel,
    steps: item.stepKeys.length,
    first: nodes.get(item.stepKeys[0])?.label ?? null,
    last: nodes.get(item.stepKeys.at(-1) ?? "")?.label ?? null,
    lastComponent: [...item.stepComponents].reverse().find((component) =>
      component !== "Unowned / external"
    ) ?? null,
  })).sort((left, right) =>
    lexical(left.terminal, right.terminal)
    || left.steps - right.steps
    || lexical(left.lastComponent ?? "", right.lastComponent ?? "")
  ).slice(0, 40);
  return {
    exactPathCount: paths.length,
    terminalCount,
    maximumDepth: Math.max(0, ...paths.map((item) => item.stepKeys.length)),
    partialPathCount: paths.filter((item) => item.completeness === "partial").length,
    unknownEdgeCount,
    edgeKinds: Object.fromEntries([...edgeKinds].sort(([left], [right]) => lexical(left, right))),
    components,
    terminals,
    missingExpectedComponents: expectedComponents.filter((item) => !components.includes(item)),
    presentRejectedComponents: rejectedComponents.filter((item) => components.includes(item)),
    pathSamples,
  };
}

async function selectionHints(input: string | null): Promise<SelectionHints> {
  const empty: SelectionHints = {
    routeKey: null,
    routePath: null,
    routeFile: null,
    trajectoryKey: null,
    trajectoryLabel: null,
    sourceKey: null,
    sourceLabel: null,
    sourceFile: null,
    sourceLine: null,
  };
  if (!input) return empty;
  const raw = await inputText(input);
  const payload = parsePayload(raw);
  const view = stringAt(payload, ["view"]) ?? (raw.includes("?") ? raw.trim() : null);
  const url = view ? safeUrl(view) : null;
  const selectionLocation = stringAt(payload, ["selection", "location"]);
  const parsedLocation = selectionLocation?.match(/^(.*):(\d+)$/);
  const selectedSource = stringAt(payload, ["selection", "kind"]) === "source";
  return {
    routeKey: stringAt(payload, ["route", "key"]) ?? url?.searchParams.get("route") ?? null,
    routePath: stringAt(payload, ["route", "path"]),
    routeFile: stringAt(payload, ["route", "file"]),
    trajectoryKey: stringAt(payload, ["trajectory", "key"]) ?? url?.searchParams.get("flow") ?? null,
    trajectoryLabel: stringAt(payload, ["trajectory", "label"]),
    sourceKey: url?.searchParams.get("sourceMethod") ?? null,
    sourceLabel: selectedSource
      ? stringAt(payload, ["selection", "label"])
      : null,
    sourceFile: selectedSource ? parsedLocation?.[1] ?? null : null,
    sourceLine: selectedSource ? integer(parsedLocation?.[2] ?? null) : null,
  };
}

async function inputText(input: string) {
  try {
    return await readFile(path.resolve(input), "utf8");
  } catch {
    return input;
  }
}

function parsePayload(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function safeUrl(value: string) {
  try {
    return new URL(value, "http://localhost");
  } catch {
    return null;
  }
}

function stringAt(value: unknown, pathParts: string[]) {
  let current = value;
  for (const part of pathParts) {
    if (!current || typeof current !== "object" || !(part in current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : null;
}

function integer(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function distance(line: number, requested: number | null) {
  return requested == null ? 0 : Math.abs(line - requested);
}

function sortedUnique(values: string[]) {
  return [...new Set(values)].sort(lexical);
}

function lexical(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
