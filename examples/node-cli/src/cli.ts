#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  loadRecords,
  packReport,
  selectReportRows,
  validateRecords,
  type Report,
} from "./records";

interface FlagValues {
  recordsPath?: string;
  outputPath?: string;
  minimumTotal?: string;
}

export interface CommandOptions {
  recordsPath: string;
  outputPath: string;
  minimumTotal: number;
}

const DEFAULT_RECORDS_PATH = "data/records.json";
const DEFAULT_OUTPUT_PATH = "record-report.json";

function readFlagValue(argv: readonly string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected a value after ${argv[index]}.`);
  }
  return value;
}

function readFlags(argv: readonly string[]): FlagValues {
  const flags: FlagValues = {};

  for (let index = 0; index < argv.length; index += 1) {
    switch (argv[index]) {
      case "--records":
        flags.recordsPath = readFlagValue(argv, index);
        index += 1;
        break;
      case "--output":
        flags.outputPath = readFlagValue(argv, index);
        index += 1;
        break;
      case "--min-total":
        flags.minimumTotal = readFlagValue(argv, index);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }

  return flags;
}

function parseMinimumTotal(value: string): number {
  const minimumTotal = Number(value);
  if (!Number.isFinite(minimumTotal) || minimumTotal < 0) {
    throw new Error(`Minimum total must be a non-negative number: ${value}`);
  }
  return minimumTotal;
}

export function parseOptions(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): CommandOptions {
  const flags = readFlags(argv);
  const recordsPath = flags.recordsPath ?? env.RECORDS_PATH ?? DEFAULT_RECORDS_PATH;
  const outputPath = flags.outputPath ?? env.REPORT_PATH ?? DEFAULT_OUTPUT_PATH;
  const minimumTotal = parseMinimumTotal(
    flags.minimumTotal ?? env.MIN_TOTAL ?? "0",
  );

  return {
    recordsPath: path.resolve(cwd, recordsPath),
    outputPath: path.resolve(cwd, outputPath),
    minimumTotal,
  };
}

function serializeReport(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function printReport(report: Report): void {
  process.stdout.write(serializeReport(report));
}

export async function saveReport(
  outputPath: string,
  report: Report,
): Promise<void> {
  await writeFile(outputPath, serializeReport(report), "utf8");
}

export async function run(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<Report> {
  const options = parseOptions(argv, env, cwd);
  const rawRecords = await loadRecords(options.recordsPath);
  const records = validateRecords(rawRecords);
  const rows = selectReportRows(records, options.minimumTotal);
  const report = packReport(rows, options.minimumTotal);

  printReport(report);
  await saveReport(options.outputPath, report);
  return report;
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): Promise<void> {
  try {
    await run(argv, env, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function isCommandEntry(): boolean {
  const invokedFile = process.argv[1];
  return (
    invokedFile !== undefined &&
    path.resolve(invokedFile) === fileURLToPath(import.meta.url)
  );
}

if (isCommandEntry()) {
  void main();
}
