import path from "node:path";
import type * as TypeScript from "typescript";
import type { EvidenceLocation, ExpressionIdentityEvidence } from "../types";
import type { AnalyzerProgressReporter } from "./progress";

export interface IdentityIndex {
  evidenceFor(expression: TypeScript.Expression, checker: TypeScript.TypeChecker): ExpressionIdentityEvidence;
  evidenceForId(expressionId: string): ExpressionIdentityEvidence | null;
  evidenceForFile(file: string): ExpressionIdentityEvidence[];
}

type SymbolRecord = {
  id: string;
  name: string;
  definitions: EvidenceLocation[];
  usages: EvidenceLocation[];
  externalOrigin: ExpressionIdentityEvidence["externalOrigin"];
};

export function buildIdentityIndex(
  ts: typeof TypeScript,
  programs: TypeScript.Program[],
  root: string,
  reportProgress?: AnalyzerProgressReporter,
): IdentityIndex {
  const records = new Map<TypeScript.Symbol, SymbolRecord>();
  const participatingSymbols = new Map<TypeScript.Symbol, boolean>();
  const expressions = new Map<string, { expression: TypeScript.Expression; checker: TypeScript.TypeChecker }>();
  const projectIdentifiersByFile = new Map<string, string[]>();
  const typeIds = new WeakMap<object, string>();
  let nextSymbolId = 1;
  let nextTypeId = 1;
  const typeIdentity = (checker: TypeScript.TypeChecker, expression: TypeScript.Expression) => {
    const type = checker.getTypeAtLocation(expression);
    let id = typeIds.get(type as object);
    if (!id) { id = `type:${nextTypeId++}`; typeIds.set(type as object, id); }
    const symbol = type.aliasSymbol ?? type.getSymbol();
    return { typeId: id, typeText: checker.typeToString(type), typeDefinition: symbol ? declarationPoint(symbol, root) : null };
  };
  const canonical = (checker: TypeScript.TypeChecker, node: TypeScript.Node) => {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol;
  };
  const point = (node: TypeScript.Node): EvidenceLocation => {
    const source = node.getSourceFile();
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { file: relative(root, source.fileName), line: position.line + 1, column: position.character + 1 };
  };
  const recordFor = (symbol: TypeScript.Symbol, externalOrigin: ExpressionIdentityEvidence["externalOrigin"] = null) => {
    let record = records.get(symbol);
    if (!record) {
      record = { id: `symbol:${nextSymbolId++}`, name: symbol.getName(), definitions: [], usages: [], externalOrigin };
      records.set(symbol, record);
    }
    if (!record.externalOrigin && externalOrigin) record.externalOrigin = externalOrigin;
    return record;
  };
  const symbolParticipates = (symbol: TypeScript.Symbol) => {
    const cached = participatingSymbols.get(symbol);
    if (cached !== undefined) return cached;
    const result = (symbol.getDeclarations() ?? []).some((declaration) => !declaration.getSourceFile().isDeclarationFile && participating(root, declaration.getSourceFile().fileName));
    participatingSymbols.set(symbol, result);
    return result;
  };

  const participatingFiles = programs.flatMap((program) => program.getSourceFiles().filter((sourceFile) => !sourceFile.isDeclarationFile && inside(root, sourceFile.fileName)));
  let completedFiles = 0;
  reportProgress?.({ step: "identity", message: `Indexing symbols in ${participatingFiles.length} files`, completed: 0, total: participatingFiles.length });
  for (const program of programs) {
    const checker = program.getTypeChecker();
    for (const sourceFile of program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile || !inside(root, sourceFile.fileName)) continue;
      const visit = (node: TypeScript.Node) => {
        if (ts.isExpression(node)) expressions.set(expressionIdFor(root, node), { expression: node, checker });
        if (ts.isIdentifier(node)) {
          const localSymbol = checker.getSymbolAtLocation(node);
          const symbol = canonical(checker, node);
          const externalOrigin = symbol ? externalOriginFor(ts, localSymbol, symbol, root) : null;
          if (symbol && (symbolParticipates(symbol) || externalOrigin)) {
            const file = relative(root, sourceFile.fileName);
            const ids = projectIdentifiersByFile.get(file) ?? [];
            ids.push(expressionIdFor(root, node));
            projectIdentifiersByFile.set(file, ids);
            const record = recordFor(symbol, externalOrigin);
            const location = point(node);
            const declarations = symbol.getDeclarations() ?? [];
            const isDefinition = declarations.some((declaration) => declaration.getSourceFile() === sourceFile &&
              node.getStart(sourceFile) >= declaration.getStart(sourceFile) &&
              node.getEnd() <= declaration.getEnd(),
            );
            addUnique(isDefinition ? record.definitions : record.usages, location);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
      completedFiles += 1;
      reportProgress?.({ step: "identity", message: `Indexing symbols`, completed: completedFiles, total: participatingFiles.length, file: relative(root, sourceFile.fileName) });
    }
  }

  return {
    evidenceFor(expression, checker) {
      return evidenceFor(ts, records, root, expression, checker, canonical, typeIdentity);
    },
    evidenceForId(expressionId) {
      const found = expressions.get(expressionId);
      return found ? evidenceFor(ts, records, root, found.expression, found.checker, canonical, typeIdentity) : null;
    },
    evidenceForFile(file) {
      return (projectIdentifiersByFile.get(file) ?? []).flatMap((expressionId) => {
        const found = expressions.get(expressionId);
        return found ? [evidenceFor(ts, records, root, found.expression, found.checker, canonical, typeIdentity)] : [];
      });
    },
  };
}

function evidenceFor(
  ts: typeof TypeScript,
  records: Map<TypeScript.Symbol, SymbolRecord>,
  root: string,
  expression: TypeScript.Expression,
  checker: TypeScript.TypeChecker,
  canonical: (checker: TypeScript.TypeChecker, node: TypeScript.Node) => TypeScript.Symbol | undefined,
  typeIdentity: (checker: TypeScript.TypeChecker, expression: TypeScript.Expression) => { typeId: string; typeText: string; typeDefinition: EvidenceLocation | null },
): ExpressionIdentityEvidence {
      const candidates = identitySubjects(ts, expression).flatMap((subject) => {
        const symbol = canonical(checker, subject);
        return symbol ? [{ subject, symbol }] : [];
      });
      const selected = candidates[0];
      const symbol = selected?.symbol;
      const source = expression.getSourceFile();
      const expressionId = expressionIdFor(root, expression);
      const base = expressionDescriptor(expressionId, expression, root, selected?.subject ?? expression);
      const type = typeIdentity(checker, expression);
      if (!symbol) return incomplete({ ...base, ...type }, "No TypeScript symbol resolves for this expression.");
      const record = records.get(symbol);
      if (!record) return incomplete({ ...base, ...type }, "The resolved symbol is outside the participating project files.", symbol.getName());
      const definition = record.definitions[0] ?? declarationPoint(symbol, root);
      const traceComplete = definition !== null;
      const externalOrigin = record.externalOrigin ?? null;
      const resolved = traceComplete || Boolean(externalOrigin);
      return {
        ...base,
        ...type,
        symbolId: record.id,
        symbolName: record.name,
        definition,
        externalOrigin,
        usages: record.usages,
        traceComplete: resolved,
        traceCompletenessReason: traceComplete ? "Definition and project-local usages resolved by the TypeScript checker." : externalOrigin ? `External origin resolved to ${externalOrigin.module ?? externalOrigin.package}; project-local implementation is not available.` : "The symbol resolved, but no participating definition was found.",
        evidenceLevel: resolved ? "fact" : "trace-incomplete",
        ...emptyTraceEvidence(),
      };
}

function identitySubjects(ts: typeof TypeScript, expression: TypeScript.Expression): TypeScript.Node[] {
  if (ts.isIdentifier(expression)) return [expression];
  if (ts.isPropertyAccessExpression(expression)) return [expression.name, ...identitySubjects(ts, expression.expression)];
  if (ts.isElementAccessExpression(expression)) return [...(expression.argumentExpression ? identitySubjects(ts, expression.argumentExpression) : []), ...identitySubjects(ts, expression.expression)];
  if (ts.isCallExpression(expression)) return [...identitySubjects(ts, expression.expression), ...expression.arguments.flatMap((argument) => identitySubjects(ts, argument))];
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression)) return identitySubjects(ts, expression.expression);
  if (ts.isBinaryExpression(expression)) return [...identitySubjects(ts, expression.left), ...identitySubjects(ts, expression.right)];
  if (ts.isConditionalExpression(expression)) return [...identitySubjects(ts, expression.condition), ...identitySubjects(ts, expression.whenTrue), ...identitySubjects(ts, expression.whenFalse)];
  if (ts.isPrefixUnaryExpression(expression) || ts.isPostfixUnaryExpression(expression)) return identitySubjects(ts, expression.operand);
  if (ts.isAwaitExpression(expression)) return identitySubjects(ts, expression.expression);
  if (ts.isTemplateExpression(expression)) return expression.templateSpans.flatMap((span) => identitySubjects(ts, span.expression));
  if (ts.isArrayLiteralExpression(expression)) return expression.elements.flatMap((element) => ts.isExpression(element) ? identitySubjects(ts, element) : []);
  if (ts.isObjectLiteralExpression(expression)) return expression.properties.flatMap((property) => {
    if (ts.isPropertyAssignment(property)) return identitySubjects(ts, property.initializer);
    if (ts.isShorthandPropertyAssignment(property)) return [property.name];
    if (ts.isSpreadAssignment(property)) return identitySubjects(ts, property.expression);
    return [];
  });
  return [];
}

function declarationPoint(symbol: TypeScript.Symbol, root: string): EvidenceLocation | null {
  const declaration = symbol.getDeclarations()?.[0];
  if (!declaration || declaration.getSourceFile().isDeclarationFile || !participating(root, declaration.getSourceFile().fileName)) return null;
  const source = declaration.getSourceFile();
  const position = source.getLineAndCharacterOfPosition(declaration.getStart(source));
  return { file: relative(root, source.fileName), line: position.line + 1, column: position.character + 1 };
}

function externalOriginFor(ts: typeof TypeScript, localSymbol: TypeScript.Symbol | undefined, symbol: TypeScript.Symbol, root: string): NonNullable<ExpressionIdentityEvidence["externalOrigin"]> | null {
  const importModule = moduleSpecifierFor(ts, localSymbol);
  const declaration = symbol.getDeclarations()?.[0];
  const declarationFile = declaration?.getSourceFile().fileName ?? null;
  const packageName = importModule && !importModule.startsWith(".") ? packageFromModule(importModule) : declarationFile ? packageFromDeclaration(root, declarationFile) : null;
  if (!packageName) return null;
  return { module: importModule && !importModule.startsWith(".") ? importModule : null, package: packageName, declarationFile: declarationFile ? relative(root, declarationFile) : null };
}

function moduleSpecifierFor(ts: typeof TypeScript, symbol: TypeScript.Symbol | undefined) {
  for (const declaration of symbol?.getDeclarations() ?? []) {
    let current: TypeScript.Node | undefined = declaration;
    while (current && !ts.isImportDeclaration(current)) current = current.parent;
    if (current && ts.isStringLiteral(current.moduleSpecifier)) return current.moduleSpecifier.text;
  }
  return null;
}
function packageFromModule(module: string) { const parts = module.split("/"); return module.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!; }
function packageFromDeclaration(root: string, file: string) {
  const normalized = file.split(path.sep).join("/"); const marker = "/node_modules/"; const index = normalized.lastIndexOf(marker);
  if (index >= 0) return packageFromModule(normalized.slice(index + marker.length));
  const rel = relative(root, file); if (!rel.startsWith("..") && /(?:^|\/)styled-system\//.test(rel)) return "styled-system";
  return null;
}

function incomplete(base: Pick<ExpressionIdentityEvidence, "expressionId" | "expression" | "location" | "span" | "focusText" | "focusSpan" | "typeId" | "typeText" | "typeDefinition">, reason: string, symbolName: string | null = null): ExpressionIdentityEvidence {
  return { ...base, symbolId: null, symbolName, definition: null, externalOrigin: null, usages: [], traceComplete: false, traceCompletenessReason: reason, evidenceLevel: "trace-incomplete", ...emptyTraceEvidence() };
}
function emptyTraceEvidence() {
  return { upstreamPath: [], downstreamPath: [], terminalSinks: [], totalReach: 0, defenses: [], representationSteps: [], unknownBoundaries: [], attachedFindingIds: [], graphNodeIds: [], boundaryIds: [] };
}
function addUnique(locations: EvidenceLocation[], location: EvidenceLocation) {
  if (!locations.some((item) => item.file === location.file && item.line === location.line && item.column === location.column)) locations.push(location);
}
function relative(root: string, file: string) { return path.relative(root, file).split(path.sep).join("/"); }
function inside(root: string, file: string) { const rel = path.relative(root, file); return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); }
function participating(root: string, file: string) { return inside(root, file) && !relative(root, file).split("/").includes("node_modules"); }
export function expressionIdFor(root: string, expression: TypeScript.Expression) {
  const source = expression.getSourceFile();
  return `expression:${relative(root, source.fileName)}:${expression.getStart(source)}:${expression.getEnd()}`;
}
function expressionDescriptor(expressionId: string, expression: TypeScript.Expression, root: string, focus: TypeScript.Node) {
  const source = expression.getSourceFile();
  const start = source.getLineAndCharacterOfPosition(expression.getStart(source));
  const end = source.getLineAndCharacterOfPosition(expression.getEnd());
  const focusStart = source.getLineAndCharacterOfPosition(focus.getStart(source));
  const focusEnd = source.getLineAndCharacterOfPosition(focus.getEnd());
  return {
    expressionId,
    expression: expression.getText(source),
    location: { file: relative(root, source.fileName), line: start.line + 1, column: start.character + 1 },
    span: { startLine: start.line + 1, startColumn: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 },
    focusText: focus.getText(source),
    focusSpan: { startLine: focusStart.line + 1, startColumn: focusStart.character + 1, endLine: focusEnd.line + 1, endColumn: focusEnd.character + 1 },
  };
}
