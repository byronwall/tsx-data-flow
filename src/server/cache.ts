import fs from "node:fs";
import path from "node:path";
import { createAnalyzer } from "../core";
import type { AnalysisReport, AnalyzerArgs } from "../types";
import type { AnalyzerProgressReporter } from "../analysis/progress";
import { isSupportedSourcePath } from "./source-excerpts";

const MAX_SOURCE_PATH_LENGTH = 512;
const MAX_SOURCE_FILE_BYTES = 4 * 1024 * 1024;

export function createAnalysisCache(args: AnalyzerArgs, reportProgress?: AnalyzerProgressReporter) {
  let analyzer: ReturnType<typeof createAnalyzer> | null = null;
  let full: AnalysisReport | null = null;
  let review: AnalysisReport | null = null;
  let generation = 0;
  const byFile = new Map<string, AnalysisReport>();
  const source = new Map<string, string>();
  const ownedSourceFiles = new Set<string>();

  const ensureBuilt = () => {
    if (!analyzer) {
      analyzer = createAnalyzer({ ...args, file: [], scope: null }, reportProgress);
      const sourceRoot = path.resolve(args.source);
      const realSourceRoot = fs.realpathSync(sourceRoot);
      for (const sourceFile of analyzer.program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile || !isSupportedSourcePath(sourceFile.fileName)) continue;
        try {
          const realFile = fs.realpathSync(sourceFile.fileName);
          if (isWithin(realFile, realSourceRoot) && fs.statSync(realFile).isFile()) ownedSourceFiles.add(realFile);
        } catch {
          // A source file that no longer exists is not an active source member.
        }
      }
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
    if (!isSafeRelativePath(relPath)) return null;
    const root = path.resolve(ensureBuilt().meta.root);
    const sourceRoot = path.resolve(args.source);
    if (!isWithin(sourceRoot, root)) return null;
    const normalized = path.normalize(relPath);
    const absolute = path.resolve(root, normalized);
    if (!isWithin(absolute, root)) return null;
    try {
      const realRoot = fs.realpathSync(root);
      const realSourceRoot = fs.realpathSync(sourceRoot);
      if (!isWithin(realSourceRoot, realRoot)) return null;
      const realFile = fs.realpathSync(absolute);
      if (!isWithin(realFile, realRoot) || !isWithin(realFile, realSourceRoot)) return null;
      const stat = fs.statSync(realFile);
      if (!stat.isFile() || stat.size > MAX_SOURCE_FILE_BYTES) return null;
      if (!isSupportedSourcePath(realFile) || !ownedSourceFiles.has(realFile)) return null;
      return { absolute: realFile, key: path.relative(realRoot, realFile).replaceAll(path.sep, "/") };
    } catch {
      return null;
    }
  };
  const sourceFor = (relPath: string) => {
    const resolved = resolveSourcePath(relPath);
    if (!resolved) return null;
    const cached = source.get(resolved.key);
    if (cached !== undefined) return cached;
    try {
      const text = fs.readFileSync(resolved.absolute, "utf8");
      source.set(resolved.key, text);
      return text;
    } catch {
      return null;
    }
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
    ownedSourceFiles.clear();
    return ensureBuilt();
  };
  const typescript = () => { ensureBuilt(); return analyzer!.ts; };
  return { ensureBuilt, reviewReport, reportForFile, sourceFor, identitiesForFile, typescript, refresh, generation: () => generation };
}

export type AnalysisCache = ReturnType<typeof createAnalysisCache>;

function isSafeRelativePath(value: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_SOURCE_PATH_LENGTH || value.includes("\0")) return false;
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  return !value.split(/[\\/]+/).some((segment) => segment === "..");
}

function isWithin(candidate: string, root: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
