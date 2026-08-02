import type * as TypeScript from "typescript";
import type { AnalysisGraph, AnalyzerArgs, BoundaryHelper, CatalogFunction, CrossFileState, FileTraceContext, RootInfo, SinkMetrics, SourceSnippet, TraceContext, TraceResult } from "../types";
import path from "node:path";
import { createGraph, locationOf } from "./graph";

const CALLER_LOCATION_LIMIT = 8;
const INLINE_SNIPPET_LIMIT = 5;
const INLINE_HELPER_BODY_LINE_LIMIT = 10;

interface HelperDependencies {
  fanOutRootsFor: (sink: { rootInfos: RootInfo[]; roots: string[] }) => RootInfo[];
  getFileContextCached: (ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, crossFile: CrossFileState, checker?: TypeScript.TypeChecker) => FileTraceContext;
  metricsFor: (trace: TraceResult) => SinkMetrics;
  resolveCatalogFn: (ts: typeof TypeScript, checker: TypeScript.TypeChecker, identifier: TypeScript.Identifier, crossFile: CrossFileState, args: AnalyzerArgs) => CatalogFunction | null;
  safeTypeText: (text?: string) => string;
  traceExpression: (ts: typeof TypeScript, checker: TypeScript.TypeChecker, graph: AnalysisGraph, expression: TypeScript.Expression, context: TraceContext) => TraceResult;
}
interface EnrichedCatalog extends CatalogFunction {
  returnType: string; inRoots: string[]; inSources: number; inlineBodySnippet: SourceSnippet | null;
  passThrough: boolean; typeLeak: boolean; internalDepth: number; internalChurn: number;
  internalDefenses: number; internalImpossible: number;
}

export function buildHelperReport(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  crossFile: CrossFileState,
  args: AnalyzerArgs,
  sourceFiles: TypeScript.SourceFile[],
  dependencies: HelperDependencies,
) {
  const reached: CatalogFunction[] = [];
  for (const record of crossFile.catalog.values()) {
    if (record && crossFile.reached.has(record.symbol)) reached.push(record);
  }
  if (reached.length === 0) return [];

  countCallers(
    ts,
    checker,
    sourceFiles,
    reached,
    crossFile,
    args,
    dependencies,
  );

  const records: BoundaryHelper[] = [];
  for (const record of reached) {
    const enriched = {
      ...record,
      ...enrichCatalogRecord(
        ts,
        checker,
        record,
        args,
        crossFile,
        dependencies,
      ),
    };
    records.push({
      name: enriched.name,
      file: enriched.file,
      line: enriched.line,
      params: enriched.params,
      arity: enriched.arity,
      returnType: enriched.returnType,
      inRoots: enriched.inRoots,
      inSources: enriched.inSources,
      callerCount: enriched.callerCount,
      callers: enriched.callers,
      inlineBodySnippet: enriched.inlineBodySnippet,
      passThrough: enriched.passThrough,
      typeLeak: enriched.typeLeak,
      internalDepth: enriched.internalDepth,
      internalChurn: enriched.internalChurn,
      internalDefenses: enriched.internalDefenses,
      internalImpossible: enriched.internalImpossible,
      verdict: classifyBoundary(enriched),
      debt: boundaryDebt(enriched),
    });
  }
  return records.sort((left, right) => right.debt - left.debt);
}

function enrichCatalogRecord(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  record: CatalogFunction,
  args: AnalyzerArgs,
  crossFile: CrossFileState,
  dependencies: HelperDependencies,
) {
  const {
    fanOutRootsFor,
    getFileContextCached,
    metricsFor,
    safeTypeText,
    traceExpression,
  } = dependencies;
  const { fnNode, returnExprs, sourceFile } = record;
  const recordChecker = record.checker ?? checker;
  let returnType = "unknown";
  try {
    const signature = recordChecker.getSignatureFromDeclaration(fnNode);
    if (signature) {
      returnType = safeTypeText(
        recordChecker.typeToString(
          recordChecker.getReturnTypeOfSignature(signature),
        ),
      );
    }
  } catch {
    // Some synthetic declarations have no resolvable signature; leave "unknown".
  }

  let internal = {
    maximumPathDepth: 0,
    representationChurn: 0,
    defensiveOperationCount: 0,
    impossibleDefenseCount: 0,
  };
  let inSources = 0;
  let inRoots: string[] = [];
  if (returnExprs.length) {
    const throwawayGraph = createGraph(args.root);
    const bodyTraces = returnExprs.map((returnExpression) => traceExpression(
      ts, recordChecker, throwawayGraph, returnExpression, {
        ...getFileContextCached(ts, sourceFile, crossFile, recordChecker),
        sourceFile,
        root: args.root,
        stack: new Set(),
        crossFile: null,
        crossDepth: 0,
        visitedFns: new Set(),
        paramBindings: null,
        paramObjectBindings: null,
      },
    ));
    const metrics = bodyTraces.map((trace) => metricsFor(trace));
    internal = {
      maximumPathDepth: Math.max(...metrics.map((item) => item.maximumPathDepth)),
      representationChurn: Math.max(...metrics.map((item) => item.representationChurn)),
      defensiveOperationCount: Math.max(...metrics.map((item) => item.defensiveOperationCount)),
      impossibleDefenseCount: Math.max(...metrics.map((item) => item.impossibleDefenseCount)),
    };
    const roots = [...new Set(bodyTraces.flatMap((trace) => trace.roots))];
    inSources = roots.length;
    inRoots = [
      ...new Set(
        bodyTraces.flatMap((trace) => fanOutRootsFor({
          rootInfos: trace.rootInfos,
          roots: trace.roots,
        }).map((info) => info.label)),
      ),
    ];
  }
  const paramNames = new Set(record.params.map((parameter) => parameter.name));
  return {
    returnType,
    inRoots,
    inSources,
    inlineBodySnippet: functionSnippet(sourceFile, fnNode),
    passThrough: returnExprs.length > 0 && returnExprs.every((returnExpression) => isPassThrough(ts, returnExpression, paramNames)),
    typeLeak:
      isTypeLeak(returnType) ||
      record.params.some((parameter) => isTypeLeak(parameter.type)),
    internalDepth: internal.maximumPathDepth,
    internalChurn: internal.representationChurn,
    internalDefenses: internal.defensiveOperationCount,
    internalImpossible: internal.impossibleDefenseCount,
  };
}

function countCallers(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  sourceFiles: TypeScript.SourceFile[],
  reached: CatalogFunction[],
  crossFile: CrossFileState,
  args: AnalyzerArgs,
  dependencies: HelperDependencies,
) {
  const keyOf = (record: CatalogFunction) => `${record.file}:${record.line}:${record.name}`;
  const byKey = new Map(reached.map((record) => [keyOf(record), record]));
  const names = new Set<string>(reached.map((record) => record.name));
  let budget = 6000;
  for (const sourceFile of sourceFiles) {
    const fileRel = relativePath(args.root, sourceFile.fileName);
    const visit = (node: TypeScript.Node) => {
      if (budget > 0 && ts.isCallExpression(node)) {
        const ident = ts.isIdentifier(node.expression)
          ? node.expression
          : ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.name)
            ? node.expression.name
            : null;
        if (ident && names.has(ident.text)) {
          budget -= 1;
          const resolved = dependencies.resolveCatalogFn(
            ts,
            checker,
            ident,
            crossFile,
            args,
          );
          const record = resolved ? byKey.get(keyOf(resolved)) : null;
          if (record) {
            record.callerCount += 1;
            if (record.callers.length < CALLER_LOCATION_LIMIT) {
              const line = locationOf(sourceFile, node).line;
              record.callers.push({
                file: fileRel,
                line,
                snippet:
                  record.callers.length < INLINE_SNIPPET_LIMIT
                    ? lineWindowSnippet(sourceFile, line, 2)
                    : null,
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
}

function classifyBoundary(record: EnrichedCatalog) {
  const isJunction = record.inSources >= 3 && record.callerCount >= 2;
  const messyInternals =
    record.internalDepth >= 6 ||
    record.internalChurn >= 4 ||
    record.internalDefenses >= 3 ||
    record.internalImpossible > 0;
  if (record.passThrough && record.internalDepth <= 1) {
    return "thin pass-through (inline)";
  }
  if (isLocalScalarMathBoundary(record)) return "local scalar math";
  if (isJunction) return "confluence / junction";
  if (record.typeLeak) return "leaky boundary";
  if (messyInternals) return "messy internals";
  return "clean pipe";
}

function isLocalScalarMathBoundary(record: EnrichedCatalog) {
  if (record.typeLeak) return false;
  if (record.internalImpossible > 0 || record.internalDefenses > 0)
    return false;
  if (record.callerCount > 2) return false;
  if (record.internalDepth > 5 || record.internalChurn > 2) return false;
  if (!/^(?:number|string|boolean|bigint)$/.test(record.returnType ?? "")) {
    return false;
  }
  return /^(?:get|compute)?(?:center|radius|circumference|dash|progress|track|size|width|height|x|y|cx|cy|r|axis|tick|title|label)/i.test(
    record.name ?? "",
  );
}

function boundaryDebt(record: EnrichedCatalog) {
  const isJunction = record.inSources >= 3 && record.callerCount >= 2;
  const scalarPenalty = isLocalScalarMathBoundary(record) ? -3 : 0;
  return (
    record.inSources +
    record.internalChurn +
    record.internalDefenses * 2 +
    record.internalImpossible * 3 +
    record.internalDepth * 0.5 +
    (record.typeLeak ? 4 : 0) +
    (isJunction ? record.callerCount * 2 : 0) +
    scalarPenalty
  );
}

function isPassThrough(ts: typeof TypeScript, expression: TypeScript.Expression, paramNames: ReadonlySet<string>) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  if (ts.isIdentifier(current)) return paramNames.has(current.text);
  if (ts.isPropertyAccessExpression(current)) {
    let receiver: TypeScript.Expression = current;
    while (ts.isPropertyAccessExpression(receiver))
      receiver = receiver.expression;
    return ts.isIdentifier(receiver) && paramNames.has(receiver.text);
  }
  return false;
}

function isTypeLeak(typeText: string) {
  if (!typeText) return false;
  if (/\b(any|unknown)\b/.test(typeText)) return true;
  return typeText.split("|").length > 4;
}

function relativePath(root: string, file: string) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function functionSnippet(sourceFile: TypeScript.SourceFile, node: TypeScript.Node) {
  const start =
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
    1;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  const cappedEnd = Math.min(end, start + INLINE_HELPER_BODY_LINE_LIMIT - 1);
  return lineRangeSnippet(sourceFile, start, cappedEnd, null, end > cappedEnd);
}

function lineWindowSnippet(sourceFile: TypeScript.SourceFile, line: number, context: number) {
  return lineRangeSnippet(
    sourceFile,
    line - context,
    line + context,
    line,
    false,
  );
}

function lineRangeSnippet(
  sourceFile: TypeScript.SourceFile,
  startLine: number,
  endLine: number,
  hitLine: number | null = null,
  truncated: boolean = false,
) {
  const lines = String(sourceFile.text ?? "").split("\n");
  const start = Math.max(1, startLine);
  const end = Math.min(lines.length, endLine);
  if (start > end) return null;
  const width = String(end).length;
  return {
    startLine: start,
    endLine: end,
    hitLine,
    truncated,
    lines: lines.slice(start - 1, end).map((text: string, index: number) => {
      const line = start + index;
      return `${String(line).padStart(width, " ")}${line === hitLine ? " >" : "  "} ${text}`;
    }),
  };
}
