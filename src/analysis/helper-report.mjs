import path from "node:path";
import { createGraph, locationOf } from "./graph.mjs";

export function buildHelperReport(
  ts,
  checker,
  crossFile,
  args,
  sourceFiles,
  dependencies,
) {
  const reached = [];
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

  const records = [];
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
  ts,
  checker,
  record,
  args,
  crossFile,
  dependencies,
) {
  const {
    fanOutRootsFor,
    getFileContextCached,
    metricsFor,
    safeTypeText,
    traceExpression,
  } = dependencies;
  const { fnNode, returnExpr, sourceFile } = record;
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
  let inRoots = [];
  if (returnExpr) {
    const throwawayGraph = createGraph(args.root);
    const bodyTrace = traceExpression(
      ts,
      recordChecker,
      throwawayGraph,
      returnExpr,
      {
        ...getFileContextCached(ts, sourceFile, crossFile),
        sourceFile,
        root: args.root,
        stack: new Set(),
        crossFile: null,
        crossDepth: 0,
        visitedFns: new Set(),
        paramBindings: null,
      },
    );
    internal = metricsFor(bodyTrace);
    inSources = bodyTrace.roots.length;
    inRoots = [
      ...new Set(
        fanOutRootsFor({
          rootInfos: bodyTrace.rootInfos,
          roots: bodyTrace.roots,
        }).map((info) => info.label),
      ),
    ];
  }
  const paramNames = new Set(record.params.map((parameter) => parameter.name));
  return {
    returnType,
    inRoots,
    inSources,
    passThrough: returnExpr ? isPassThrough(ts, returnExpr, paramNames) : false,
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
  ts,
  checker,
  sourceFiles,
  reached,
  crossFile,
  args,
  dependencies,
) {
  const keyOf = (record) => `${record.file}:${record.line}:${record.name}`;
  const byKey = new Map(reached.map((record) => [keyOf(record), record]));
  const names = new Set(reached.map((record) => record.name));
  let budget = 6000;
  for (const sourceFile of sourceFiles) {
    const fileRel = relativePath(args.root, sourceFile.fileName);
    const visit = (node) => {
      if (budget > 0 && ts.isCallExpression(node)) {
        const ident = ts.isIdentifier(node.expression)
          ? node.expression
          : ts.isPropertyAccessExpression(node.expression)
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
            if (record.callers.length < 8) {
              record.callers.push({
                file: fileRel,
                line: locationOf(sourceFile, node).line,
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

function classifyBoundary(record) {
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

function isLocalScalarMathBoundary(record) {
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

function boundaryDebt(record) {
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

function isPassThrough(ts, expression, paramNames) {
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
    let receiver = current;
    while (ts.isPropertyAccessExpression(receiver))
      receiver = receiver.expression;
    return ts.isIdentifier(receiver) && paramNames.has(receiver.text);
  }
  return false;
}

function isTypeLeak(typeText) {
  if (!typeText) return false;
  if (/\b(any|unknown)\b/.test(typeText)) return true;
  return typeText.split("|").length > 4;
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
