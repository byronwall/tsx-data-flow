#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createAnalyzer } from "../src/core";
import { parseArgs } from "../src/cli/args";
import type { RouteDataInventory } from "../src/api/contracts";
import { buildRouteDataInventory } from "../src/api/projections/route-data";
import { routeTotalityForRoute } from "../src/analysis/route-data-session";
import type { RouteTotalitySelectedSource } from "../src/analysis/route-totality-selected-source";
import type { RouteTotalityFieldAttachment } from "../src/analysis/route-totality-field-lineage";

type Obligation = { id: string; fieldPath: string; label: string; kind: string; alias: string | null; targetKey: string };
type Actual = { fieldPath: string; label: string; kind: string; alias: string | null; targetKey: string; occurrenceId: string; terminalId: string; consumerTerminalRelationId: string | null };

const args = parseCli(process.argv.slice(2));
const started = performance.now();

try {
  const expected = await readObligations(args.obligations);
  const analyzerArgs = parseArgs(["--root", args.root, "--format", "json", "--view", "work-packets"]);
  const report = createAnalyzer(analyzerArgs).report();
  const inventory = buildRouteDataInventory(report);
  const route = chooseOne(inventory.routes.filter((item) => item.key === args.route || item.pathPattern === args.route || item.file === args.route), "route", args.route);
  const routeSources = inventory.sources.filter((source) => source.routeKeys.includes(route.key));
  const source = chooseSource(routeSources, args.source);
  const evidence = report.routeData.evidence.find((item) => item.id === source.evidenceId);
  if (!evidence?.programElementId) throw new Error(`Selected source ${source.key} has no exact compiler evidence.`);
  const selectedSource: RouteTotalitySelectedSource = {
    key: source.key,
    evidence: { id: evidence.id, elementId: evidence.programElementId, file: evidence.file, line: evidence.line, column: evidence.column, span: evidence.span },
  };
  const record = routeTotalityForRoute(report.routeData, route.key, selectedSource);
  if (!record) throw new Error(`No Route Totality record for ${route.key}.`);
  const actual = record.fieldLineage.attachments.map(actualRecord).sort(compareActual);
  const probed = args.simulateMissing ? actual.filter((item) => item.label !== expected.find((obligation) => obligation.id === args.simulateMissing)?.label) : actual;
  const expectedByKey = new Map(expected.map((obligation) => [semanticKey(obligation), obligation]));
  const actualByKey = new Map(probed.map((item) => [semanticKey(item), item]));
  const missing = expected.filter((obligation) => !actualByKey.has(semanticKey(obligation))).map((obligation) => obligation.id);
  const unexpected = probed.filter((item) => !expectedByKey.has(semanticKey(item))).map((item) => `target:${item.targetKey}`);
  const selectedOrigin = { key: source.key, elementId: selectedSource.evidence.elementId, file: selectedSource.evidence.file, line: selectedSource.evidence.line, column: selectedSource.evidence.column };
  const semantic = { route: route.pathPattern, routeKey: route.key, selectedOrigin, fieldPaths: [...new Set(actual.map((item) => item.fieldPath))].sort(), attachments: actual.length, transformations: record.fieldLineage.transformations.length, consumerTerminalRelationCount: new Set(actual.map((item) => item.consumerTerminalRelationId).filter(Boolean)).size, frontiers: record.fieldLineage.frontiers.map((frontier) => ({ id: frontier.id, field: frontier.field?.label ?? null, reason: frontier.reason })).sort((left, right) => left.id.localeCompare(right.id)), obligations: actual.map(({ occurrenceId: _occurrenceId, terminalId: _terminalId, consumerTerminalRelationId: _relationId, ...item }) => item), missing, unexpected };
  const hash = createHash("sha256").update(canonicalJson(semantic)).digest("hex");
  const obligationRecords = actual.map((item) => ({ id: expectedByKey.get(semanticKey(item))?.id ?? null, fieldPath: item.fieldPath, label: item.label, kind: item.kind, alias: item.alias }));
  const output = { route: semantic.route, routeKey: semantic.routeKey, selectedOrigin: semantic.selectedOrigin, fieldPaths: semantic.fieldPaths, attachments: semantic.attachments, transformations: semantic.transformations, consumerTerminalRelationCount: semantic.consumerTerminalRelationCount, frontiers: semantic.frontiers, obligations: obligationRecords, missing, unexpected, deterministicResultHash: hash, elapsedMs: round(performance.now() - started), payloadBytes: Buffer.byteLength(canonicalJson(record.fieldLineage)), ...(args.simulateMissing ? { simulatedMissing: args.simulateMissing } : {}) };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (missing.length || unexpected.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function parseCli(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument ${value}`);
    const [name, inline] = value.split("=", 2);
    const next = inline ?? argv[++index];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${name}`);
    values.set(name, next);
  }
  const root = values.get("--root");
  const route = values.get("--route");
  const source = values.get("--source");
  const obligations = values.get("--obligations");
  if (!root || !route || !source || !obligations) throw new Error("Usage: pnpm accept:route-field-proof --root <project> --route <path-or-key> --source <key-or-file:line[:column]> --obligations <file>");
  return { root: path.resolve(root), route, source, obligations: path.resolve(obligations), simulateMissing: values.get("--simulate-missing") ?? null };
}

async function readObligations(file: string): Promise<Obligation[]> {
  const parsed = JSON.parse(await readFile(file, "utf8")) as { version?: number; obligations?: Obligation[] };
  if (parsed.version !== 1 || !Array.isArray(parsed.obligations) || parsed.obligations.length === 0) throw new Error(`Invalid obligation file ${file}.`);
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const obligation of parsed.obligations) {
    if (!/^G\d{2}$/.test(obligation.id) || ids.has(obligation.id) || !obligation.fieldPath || !obligation.label || !obligation.targetKey || keys.has(semanticKey(obligation))) throw new Error(`Invalid or duplicate obligation ${obligation.id}.`);
    ids.add(obligation.id); keys.add(semanticKey(obligation));
  }
  return parsed.obligations.sort((left, right) => left.id.localeCompare(right.id));
}

function chooseSource(sources: RouteDataInventory["sources"], locator: string) {
  const exactKey = sources.filter((source) => source.key === locator);
  if (exactKey.length === 1) return exactKey[0];
  const match = /^(.*):(\d+)(?::(\d+))?$/.exec(locator);
  const candidates = match
    ? sources.filter((source) => source.file.replaceAll("\\", "/") === match[1].replaceAll("\\", "/") && source.line === Number(match[2]))
    : sources.filter((source) => source.label === locator);
  return chooseOne(candidates, "source", locator);
}

function chooseOne<T>(items: T[], kind: string, value: string): T {
  if (items.length !== 1) throw new Error(`${kind} selector ${value} matched ${items.length} records.`);
  return items[0];
}

function actualRecord(attachment: RouteTotalityFieldAttachment): Actual {
  if (!attachment.consumer) throw new Error(`Attachment ${attachment.id} has no proven consumer.`);
  return { fieldPath: attachment.field.label, label: attachment.consumer.label, kind: attachment.consumer.kind, alias: attachment.alias, targetKey: attachment.consumer.target.targetKey, occurrenceId: attachment.occurrenceId, terminalId: attachment.terminalIds[0], consumerTerminalRelationId: attachment.consumer.fieldLineageTerminalRelationId };
}

function semanticKey(item: Pick<Actual, "fieldPath" | "targetKey"> | Pick<Obligation, "fieldPath" | "targetKey">) { return `${item.fieldPath}\u0000${item.targetKey}`; }
function compareActual(left: Actual, right: Actual) { return semanticKey(left).localeCompare(semanticKey(right)) || left.occurrenceId.localeCompare(right.occurrenceId); }
function canonicalJson(value: unknown): string { return JSON.stringify(sortValue(value)); }
function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortValue(item)])); return value; }
function round(value: number) { return Math.round(value * 100) / 100; }
