import path from "node:path";
import { fanOutRootsFor } from "../analysis/fan-out.mjs";
import { primaryAdviceShape } from "../analysis/sink-shape.mjs";
import { formatExpression } from "./format-helpers.mjs";

// THRESH-1: a "usage" is a trivial, shallow expression with no actionable
// signal — e.g. a bare `props.search` read flowing straight into a sink (burden
// ~0.05, the path-depth term only). These are not smells; they are proof a value
// is used. We keep them (browsable, jump-to-definition) but tag them `usage` so
// the UI can demote them out of the findings list, which otherwise fills with
// "the simplest usage possible" noise. Reach/fan-out is deliberately NOT a
// signal here: a plain prop read that feeds many sinks is still just a usage.
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
export function selectWorkItems(report, args) {
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
export function selectionBanner(selection, args) {
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
export function suppressionLines(suppressed) {
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

// Approach 5 — the "Coverage" paragraph shown in the packet/repair-map headers.
export function concentrationLines(report, shownCount) {
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

function plural(count, noun) {
  return count + " " + noun + (count === 1 ? "" : "s");
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
