import fs from "node:fs";
import path from "node:path";

export function readReportDirectorySummary(directory: string) {
  const missing: string[] = [];
  const read = (name: string) => {
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
  const readOptional = (name: string) => {
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

function parsePrimaryPivotScore(text: string) {
  const match = /\|\s*`[^`]*`\s*\|\s*\d+\s*\|\s*([0-9.]+)\s*\|/.exec(text);
  return match ? Number(match[1]) : null;
}

function parseWorstFindingScore(text: string) {
  const match = /burden score\s*\|\s*([0-9.]+)/i.exec(text);
  return match ? Number(match[1]) : null;
}

function parseWorstSeverity(text: string) {
  const match = /^## RPF-[^·]+·\s*([A-Z]+)/m.exec(text);
  return match?.[1] ?? "n/a";
}

function parseDossierSinkCount(text: string) {
  const match = /\|\s*\d+\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*(\d+)\s*\|/.exec(text);
  return match ? Number(match[1]) : null;
}

function countMarkdownHeadings(text: string, pattern: RegExp) {
  return text.split("\n").filter((line: string) => pattern.test(line)).length;
}

function countMarkdownTableRows(text: string) {
  return text
    .split("\n")
    .filter(
      (line: string) =>
        /^\|/.test(line) &&
        !/^\|\s*-/.test(line) &&
        !/^\|\s*Location\s*\|/.test(line) &&
        !/^\|\s*#\s*\|/.test(line),
    ).length;
}

function parseTransformationWrappers(text: string) {
  const match = /representation-only(?: wrapper)? steps\s*\|\s*(\d+)/i.exec(
    text,
  );
  return match ? Number(match[1]) : null;
}

function parseFindingFamilies(text: string, defensiveText: string = "") {
  const families: string[] = [];
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

type ReportDirectorySummary = ReturnType<typeof readReportDirectorySummary>;

export function removedFindingFamilies(baseline: ReportDirectorySummary, current: ReportDirectorySummary) {
  return (baseline.families ?? []).filter(
    (family) => !(current.families ?? []).includes(family),
  );
}

export function remainingFindingFamilies(current: ReportDirectorySummary) {
  return current.families ?? [];
}

export function formatWorstMetric(summary: ReportDirectorySummary) {
  if (summary.worstScore == null || !Number.isFinite(summary.worstScore)) return "n/a";
  return `${summary.worstScore.toFixed(2)} ${summary.worstSeverity ?? ""}`.trim();
}

export function formatOptionalNumber(value: number | null) {
  return Number.isFinite(value) ? String(value) : "n/a";
}

export function compareNumberLabel(before: number | null, after: number | null, lowerIsBetter: boolean) {
  if (before == null || after == null) return "n/a";
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "n/a";
  const improved = lowerIsBetter ? after < before : after > before;
  const regressed = lowerIsBetter ? after > before : after < before;
  if (Math.abs(after - before) < 0.001) return "same";
  return improved ? "improved" : regressed ? "regressed" : "changed";
}

export function formatDeltaLabel(before: number | null, after: number | null, lowerIsBetter: boolean) {
  if (before == null || after == null) return "n/a";
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "n/a";
  const delta = after - before;
  const label = compareNumberLabel(before, after, lowerIsBetter);
  return `${delta > 0 ? "+" : ""}${delta} ${label}`;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
