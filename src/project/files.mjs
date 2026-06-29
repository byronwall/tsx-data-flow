import fs from "node:fs";
import path from "node:path";

export const DEFAULT_IGNORED_PARTS = new Set([
  "node_modules",
  "dist",
  "build",
  ".solid",
  ".vinxi",
  ".output",
  "coverage",
  "styled-system",
]);

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

export function shouldAnalyzeFile(file, args) {
  const ext = path.extname(file);
  if (!SOURCE_EXTENSIONS.includes(ext)) return false;
  if (file.endsWith(".d.ts")) return false;
  if (!isWithin(file, args.source)) return false;
  const relativeParts = path.relative(args.root, file).split(path.sep);
  if (relativeParts.some((part) => DEFAULT_IGNORED_PARTS.has(part))) {
    return false;
  }
  if (!args.includeTests && /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) {
    return false;
  }
  return true;
}

export function walkFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(current);
    return [current];
  });
}

export function isWithin(file, root) {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}
