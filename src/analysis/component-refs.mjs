import path from "node:path";
import { locationOf } from "./graph.mjs";

export function buildComponentRefs(ts, checker, sourceFiles, root) {
  const byDef = new Map();
  let budget = 8000;
  const resolveDecl = (symbol) => {
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
    const visit = (node) => {
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

function relativePath(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
