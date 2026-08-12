#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createAnalyzer } from "../src/core";
import { parseArgs } from "../src/cli/args";
import type { RouteDataInventory } from "../src/api/contracts";
import { buildRouteDataInventory } from "../src/api/projections/route-data";
import { routeTotalityForRoute } from "../src/analysis/route-data-session";
import type { RouteTotalityRecord } from "../src/analysis/route-data-totality";
import type { RouteTotalitySelectedSource } from "../src/analysis/route-totality-selected-source";
import type { RouteTotalityFieldAttachment } from "../src/analysis/route-totality-field-lineage";

export type Obligation = { id: string; fieldPath: string; label: string; kind: string; alias: string | null; targetKey: string };
export type Actual = { fieldPath: string; label: string; kind: string; alias: string | null; targetKey: string; occurrenceId: string; terminalId: string; consumerTerminalRelationId: string };
export type Simulation = { kind: "missing" | "label" | "kind" | "alias" | "duplicate"; id: string } | null;
export type ProofElement = { id: string; kind: string; status: string; ownerId?: string | null };
export type ProofRelation = { id: string; from: string; to: string; kind: string; status: string; proof: { kind: string; status: string } };
export type ProofEvidence = { elements: readonly ProofElement[]; relations: readonly ProofRelation[] };
export type OccurrenceTerminal = { id: string; ownerOccurrenceId: string | null };
export type FieldProofFrontier = { id: string; field: { label: string } | null; reason: string };
export type FieldProofEvaluation = {
  actual: Actual[];
  fieldPaths: string[];
  attachments: number;
  consumerTerminalRelationCount: number;
  missing: string[];
  unexpected: string[];
  duplicateKeys: string[];
  requiredFrontiers: string[];
  failures: string[];
  deterministicResultHash: string;
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}

async function main() {
  const args = parseCli(process.argv.slice(2));
  const started = performance.now();
  try {
  const expected = await readObligations(args.obligations);
  validateSimulation(args.simulation, expected);
  const analyzerArgs = parseArgs(["--root", args.root, "--format", "json", "--view", "work-packets"]);
  const report = createAnalyzer(analyzerArgs).report();
  const inventory = buildRouteDataInventory(report);
  const route = chooseOne(inventory.routes.filter((item) => item.key === args.route || item.pathPattern === args.route || item.file === args.route), "route", args.route);
  const routeSources = inventory.sources.filter((source) => source.routeKeys.includes(route.key));
  const source = chooseSource(routeSources, args.source);
  const sourceEvidence = report.routeData.evidence.find((item) => item.id === source.evidenceId);
  if (!sourceEvidence?.programElementId) throw new Error(`Selected source ${source.key} has no exact compiler evidence.`);
  const selectedSource: RouteTotalitySelectedSource = {
    key: source.key,
    evidence: { id: sourceEvidence.id, elementId: sourceEvidence.programElementId, file: sourceEvidence.file, line: sourceEvidence.line, column: sourceEvidence.column, span: sourceEvidence.span },
  };
  const record = routeTotalityForRoute(report.routeData, route.key, selectedSource);
  if (!record) throw new Error(`No Route Totality record for ${route.key}.`);
  const evidence = exactEvidence(record);
  const terminals = exactOccurrenceTerminals(record);
  const actual = record.fieldLineage.attachments.map((attachment) => actualRecord(attachment, evidence, terminals)).sort(compareActual);
  const probed = applySimulation(actual, expected, args.simulation);
  const evaluation = evaluateFieldProof(probed, expected, record.fieldLineage.frontiers);
  const selectedOrigin = { key: source.key, elementId: selectedSource.evidence.elementId, file: selectedSource.evidence.file, line: selectedSource.evidence.line, column: selectedSource.evidence.column };
  const expectedByKey = new Map(expected.map((obligation) => [semanticKey(obligation), obligation]));
  const frontiers = record.fieldLineage.frontiers.map((frontier) => ({ id: frontier.id, field: frontier.field?.label ?? null, reason: frontier.reason })).sort((left, right) => left.id.localeCompare(right.id));
  const obligationRecords = evaluation.actual.map((item) => ({ id: expectedByKey.get(semanticKey(item))?.id ?? null, ...item }));
  const output = { route: route.pathPattern, routeKey: route.key, selectedOrigin, fieldPaths: evaluation.fieldPaths, attachments: evaluation.attachments, transformations: record.fieldLineage.transformations.length, consumerTerminalRelationCount: evaluation.consumerTerminalRelationCount, frontiers, obligations: obligationRecords, missing: evaluation.missing, unexpected: evaluation.unexpected, requiredFrontiers: evaluation.requiredFrontiers, failures: evaluation.failures, deterministicResultHash: evaluation.deterministicResultHash, elapsedMs: round(performance.now() - started), payloadBytes: Buffer.byteLength(canonicalJson(record.fieldLineage)), ...(args.simulation ? { simulation: args.simulation } : {}) };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (evaluation.failures.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
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
  const simulations = [
    ["--simulate-missing", "missing"],
    ["--simulate-label", "label"],
    ["--simulate-kind", "kind"],
    ["--simulate-alias", "alias"],
    ["--simulate-duplicate", "duplicate"],
  ].filter(([flag]) => values.has(flag)).map(([flag, kind]) => ({ kind: kind as NonNullable<Simulation>["kind"], id: values.get(flag)! }));
  if (simulations.length > 1) throw new Error("Choose only one simulation flag.");
  return { root: path.resolve(root), route, source, obligations: path.resolve(obligations), simulation: simulations[0] ?? null };
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

function validateSimulation(simulation: Simulation, expected: Obligation[]): void {
  if (simulation && !expected.some((obligation) => obligation.id === simulation.id)) throw new Error(`Unknown simulated obligation ID ${simulation.id}.`);
}

function applySimulation(actual: Actual[], expected: Obligation[], simulation: Simulation): Actual[] {
  if (!simulation) return actual;
  const obligation = expected.find((item) => item.id === simulation.id)!;
  const matches = actual.filter((item) => item.fieldPath === obligation.fieldPath && item.targetKey === obligation.targetKey);
  if (matches.length !== 1) throw new Error(`Simulation ${simulation.kind} expected one actual record for ${simulation.id}, found ${matches.length}.`);
  const match = matches[0];
  if (simulation.kind === "missing") return actual.filter((item) => item !== match);
  if (simulation.kind === "duplicate") return [...actual, match].sort(compareActual);
  return actual.map((item) => {
    if (item !== match) return item;
    if (simulation.kind === "label") return { ...item, label: `${item.label} (simulated)` };
    if (simulation.kind === "kind") return { ...item, kind: item.kind === "render" ? "condition" : "render" };
    return { ...item, alias: item.alias === null ? "simulated-alias" : null };
  }).sort(compareActual);
}

export function actualRecord(
  attachment: RouteTotalityFieldAttachment,
  evidence: ProofEvidence,
  occurrenceTerminals: readonly OccurrenceTerminal[],
): Actual {
  if (!attachment.consumer) throw new Error(`Attachment ${attachment.id} has no proven consumer.`);
  if (attachment.terminalIds.length !== 1) throw new Error(`Attachment ${attachment.id} must have exactly one occurrence-owned terminal.`);
  const terminalId = attachment.terminalIds[0];
  const ownedTerminals = occurrenceTerminals.filter((terminal) => terminal.id === terminalId && terminal.ownerOccurrenceId === attachment.occurrenceId);
  if (ownedTerminals.length !== 1 || occurrenceTerminals.filter((terminal) => terminal.id === terminalId).length !== 1 || attachment.consumer.routeTerminalId !== terminalId) {
    throw new Error(`Attachment ${attachment.id} must have exactly one occurrence-owned terminal.`);
  }
  const terminalElement = evidence.elements.filter((element) => element.id === attachment.consumer!.fieldLineageTerminalElementId);
  if (terminalElement.length !== 1 || terminalElement[0].kind !== "render-terminal" || terminalElement[0].status !== "proven") {
    throw new Error(`Attachment ${attachment.id} must reference one proven render-terminal element.`);
  }
  const terminalRelations = evidence.relations.filter((relation) => relation.from === attachment.consumer!.elementId
    && relation.to === attachment.consumer!.fieldLineageTerminalElementId
    && relation.kind === "render-terminal"
    && relation.status === "proven"
    && relation.proof.kind === "field-consumer-terminal"
    && relation.proof.status === "proven");
  if (terminalRelations.length !== 1 || terminalRelations[0].id !== attachment.consumer.fieldLineageTerminalRelationId) {
    throw new Error(`Attachment ${attachment.id} must have exactly one proven consumer-terminal relation.`);
  }
  return { fieldPath: attachment.field.label, label: attachment.consumer.label, kind: attachment.consumer.kind, alias: attachment.alias, targetKey: attachment.consumer.target.targetKey, occurrenceId: attachment.occurrenceId, terminalId, consumerTerminalRelationId: attachment.consumer.fieldLineageTerminalRelationId };
}

export function evaluateFieldProof(
  actual: readonly Actual[],
  expected: readonly Obligation[],
  frontiers: readonly FieldProofFrontier[],
): FieldProofEvaluation {
  const sortedActual = [...actual].sort(compareActual);
  const duplicateKeys = [...new Set(sortedActual
    .filter((item, index) => sortedActual.findIndex((candidate) => semanticKey(candidate) === semanticKey(item)) !== index)
    .map(semanticKey))].sort();
  const expectedByKey = new Map(expected.map((obligation) => [semanticKey(obligation), obligation]));
  const actualKeys = new Set(sortedActual.map(semanticKey));
  const missing = expected.filter((obligation) => !actualKeys.has(semanticKey(obligation))).map((obligation) => obligation.id);
  const unexpected = sortedActual.filter((item) => !expectedByKey.has(semanticKey(item))).map((item) => `target:${item.targetKey}`);
  const fieldPaths = [...new Set(sortedActual.map((item) => item.fieldPath))].sort();
  const requiredFieldPaths = new Set(expected.map((obligation) => obligation.fieldPath));
  const requiredFrontiers = frontiers.filter((frontier) => frontier.field && requiredFieldPaths.has(frontier.field.label)).map((frontier) => frontier.id).sort();
  const consumerTerminalRelationCount = new Set(sortedActual.map((item) => item.consumerTerminalRelationId)).size;
  const failures: string[] = [];
  if (sortedActual.length === 0) failures.push("No positive field attachments were proven.");
  if (fieldPaths.length === 0) failures.push("No selected field paths were proven.");
  if (consumerTerminalRelationCount < expected.length) failures.push(`Only ${consumerTerminalRelationCount} proven consumer-terminal relations were found for ${expected.length} obligations.`);
  if (missing.length) failures.push(`Missing obligations: ${missing.join(", ")}.`);
  if (unexpected.length) failures.push(`Unexpected semantic records: ${unexpected.join(", ")}.`);
  if (duplicateKeys.length) failures.push(`Duplicate semantic records: ${duplicateKeys.join(", ")}.`);
  if (requiredFrontiers.length) failures.push(`Required field paths stop at frontiers: ${requiredFrontiers.join(", ")}.`);
  const semantic = { fieldPaths, attachments: sortedActual.length, consumerTerminalRelationCount, obligations: sortedActual, missing, unexpected, requiredFrontiers };
  return { actual: sortedActual, fieldPaths, attachments: sortedActual.length, consumerTerminalRelationCount, missing, unexpected, duplicateKeys, requiredFrontiers, failures, deterministicResultHash: createHash("sha256").update(canonicalJson(semantic)).digest("hex") };
}

function exactEvidence(record: RouteTotalityRecord): ProofEvidence {
  if (!("elements" in record.evidenceSlice)) throw new Error(`Route ${record.routeKey} has no available evidence slice.`);
  return record.evidenceSlice;
}

function exactOccurrenceTerminals(record: RouteTotalityRecord): OccurrenceTerminal[] {
  if (!("terminals" in record.occurrenceSurface)) throw new Error(`Route ${record.routeKey} has no available occurrence terminals.`);
  return record.occurrenceSurface.terminals.map((terminal) => ({ id: terminal.id, ownerOccurrenceId: terminal.ownerOccurrenceId }));
}

function semanticKey(item: Pick<Actual, "fieldPath" | "targetKey" | "label" | "kind" | "alias"> | Pick<Obligation, "fieldPath" | "targetKey" | "label" | "kind" | "alias">) { return canonicalJson({ fieldPath: item.fieldPath, targetKey: item.targetKey, label: item.label, kind: item.kind, alias: item.alias }); }
function compareActual(left: Actual, right: Actual) { return semanticKey(left).localeCompare(semanticKey(right)) || left.occurrenceId.localeCompare(right.occurrenceId) || left.terminalId.localeCompare(right.terminalId) || left.consumerTerminalRelationId.localeCompare(right.consumerTerminalRelationId); }
function canonicalJson(value: unknown): string { return JSON.stringify(sortValue(value)); }
function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortValue(item)])); return value; }
function round(value: number) { return Math.round(value * 100) / 100; }
