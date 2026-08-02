import path from "node:path";
import type * as TypeScript from "typescript";

export function isCanonicalSolidCall(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  call: TypeScript.CallExpression,
  exportName: string,
) {
  const expression = call.expression;
  if (!ts.isIdentifier(expression) && !ts.isPropertyAccessExpression(expression)) return false;
  const symbol = resolvedSymbolAtLocation(ts, checker, ts.isPropertyAccessExpression(expression) ? expression.name : expression);
  if (!symbol || symbol.getName() !== exportName) return false;
  const qualifiedName = safeQualifiedName(checker, symbol);
  return Boolean(
    qualifiedName &&
    (qualifiedName.includes(`"solid-js".${exportName}`) || qualifiedName.includes(`'solid-js'.${exportName}`))
  ) || (symbol.declarations ?? []).some((declaration) => isSolidDeclaration(declaration));
}

export function resolvedSymbolAtLocation(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
) {
  let symbol: TypeScript.Symbol | undefined;
  try {
    symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  } catch {
    return null;
  }
  return symbol ?? null;
}

export function declarationIdentity(declaration: TypeScript.Declaration) {
  return `${path.normalize(declaration.getSourceFile().fileName)}:${declaration.getStart(declaration.getSourceFile())}`;
}

function safeQualifiedName(checker: TypeScript.TypeChecker, symbol: TypeScript.Symbol) {
  try {
    return checker.getFullyQualifiedName(symbol);
  } catch {
    return null;
  }
}

function isSolidDeclaration(declaration: TypeScript.Declaration) {
  const file = declaration.getSourceFile();
  if (!file.isDeclarationFile) return false;
  const normalized = file.fileName.replaceAll(path.sep, "/");
  return normalized.includes("/node_modules/solid-js/");
}
