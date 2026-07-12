import fs from "node:fs";
import path from "node:path";
import { createAnalyzer } from "../core";
import type { AnalysisReport, AnalyzerArgs } from "../types";
import type { AnalyzerProgressReporter } from "../analysis/progress";

export function createAnalysisCache(args: AnalyzerArgs, reportProgress?: AnalyzerProgressReporter) {
  let analyzer: ReturnType<typeof createAnalyzer> | null = null;
  let full: AnalysisReport | null = null;
  let review: AnalysisReport | null = null;
  let generation = 0;
  const byFile = new Map<string, AnalysisReport>();
  const source = new Map<string, string>();

  const ensureBuilt = () => {
    if (!analyzer) {
      analyzer = createAnalyzer({ ...args, file: [], scope: null }, reportProgress);
      full = analyzer.report();
      review = args.file.length || args.scope ? analyzer.report({ file: args.file, scope: args.scope }) : full;
      generation += 1;
    }
    if (!full) throw new Error("Analyzer report was not initialized");
    return full;
  };
  const reviewReport = () => { ensureBuilt(); if (!review) throw new Error("Review report was not initialized"); return review; };
  const reportForFile = (relPath: string) => {
    const cached = byFile.get(relPath);
    if (cached) return cached;
    ensureBuilt();
    const report = analyzer?.report({ file: [relPath], scope: null });
    if (!report) throw new Error("Analyzer was not initialized");
    byFile.set(relPath, report);
    return report;
  };
  const resolveSourcePath = (relPath: string) => {
    const root = path.resolve(ensureBuilt().meta.root);
    const absolute = path.resolve(root, relPath);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
    return absolute;
  };
  const sourceFor = (relPath: string) => {
    const cached = source.get(relPath);
    if (cached !== undefined) return cached;
    const absolute = resolveSourcePath(relPath);
    if (!absolute || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
    const text = fs.readFileSync(absolute, "utf8");
    source.set(relPath, text);
    return text;
  };

  const identitiesForFile = (relPath: string) => {
    ensureBuilt();
    return analyzer!.identitiesForFile(relPath);
  };
  const refresh = () => {
    analyzer = null;
    full = null;
    review = null;
    byFile.clear();
    source.clear();
    return ensureBuilt();
  };
  return { ensureBuilt, reviewReport, reportForFile, sourceFor, identitiesForFile, refresh, generation: () => generation };
}

export type AnalysisCache = ReturnType<typeof createAnalysisCache>;
