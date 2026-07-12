import type * as TypeScript from "typescript";
import path from "node:path";
import { locationOf } from "./graph";
import { enclosingFunctionName } from "./source-sinks";

export function buildComponentRefs(ts: typeof TypeScript, checker: TypeScript.TypeChecker, sourceFiles: TypeScript.SourceFile[], root: string) {
  const byDef = new Map();
  let budget = 8000;
  const resolveDecl = (symbol: TypeScript.Symbol | undefined) => {
    let s = symbol;
    try {
      if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s);
    } catch {
      /* not an alias */
    }
    return { symbol: s, decl: s?.declarations?.[0] ?? null };
  };
  for (const sourceFile of sourceFiles) {
    const fileRel = relativePath(root, sourceFile.fileName);
    const visit = (node: TypeScript.Node) => {
      if (budget <= 0) return;
      const tag =
        ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)
          ? node.tagName
          : null;
      if (tag && ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text)) {
        budget -= 1;
        const { symbol, decl } = resolveDecl(checker.getSymbolAtLocation(tag));
        if (symbol && decl) {
          const declFile = decl.getSourceFile();
          if (!isInsideRoot(root, declFile.fileName)) return;
          const defFile = relativePath(root, declFile.fileName);
          const defLine = locationOf(declFile, decl).line;
          const key = `${defFile}:${defLine}:${tag.text}`;
          let rec = byDef.get(key);
          if (!rec) {
            rec = {
              name: tag.text,
              file: defFile,
              line: defLine,
              useCount: 0,
              uses: [],
            };
            byDef.set(key, rec);
          }
          rec.useCount += 1;
          if (rec.uses.length < 25) {
            rec.uses.push({
              file: fileRel,
              line: locationOf(sourceFile, node).line,
              component: enclosingFunctionName(ts, node),
              componentLine: enclosingFunctionLine(ts, sourceFile, node),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return [...byDef.values()]
    .filter((rec) => rec.useCount > 0)
    .sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name));
}

function enclosingFunctionLine(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, node: TypeScript.Node) {
  let current: TypeScript.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionLike(current)) return locationOf(sourceFile, current).line;
    current = current.parent;
  }
  return null;
}

function relativePath(root: string, file: string) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function isInsideRoot(root: string, file: string) {
  const rel = path.relative(root, file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}
