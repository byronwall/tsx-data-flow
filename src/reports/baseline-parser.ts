import fs from "node:fs";
import path from "node:path";

export function readReportDirectorySummary(directory) {
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

export function removedFindingFamilies(baseline, current) {
  return (baseline.families ?? []).filter(
    (family) => !(current.families ?? []).includes(family),
  );
}

export function remainingFindingFamilies(current) {
  return current.families ?? [];
}

export function formatWorstMetric(summary) {
  if (!Number.isFinite(summary.worstScore)) return "n/a";
  return `${summary.worstScore.toFixed(2)} ${summary.worstSeverity ?? ""}`.trim();
}

export function formatOptionalNumber(value) {
  return Number.isFinite(value) ? String(value) : "n/a";
}

export function compareNumberLabel(before, after, lowerIsBetter) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "n/a";
  const improved = lowerIsBetter ? after < before : after > before;
  const regressed = lowerIsBetter ? after > before : after < before;
  if (Math.abs(after - before) < 0.001) return "same";
  return improved ? "improved" : regressed ? "regressed" : "changed";
}

export function formatDeltaLabel(before, after, lowerIsBetter) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "n/a";
  const delta = after - before;
  const label = compareNumberLabel(before, after, lowerIsBetter);
  return `${delta > 0 ? "+" : ""}${delta} ${label}`;
}

function unique(items) {
  return Array.from(new Set(items));
}
