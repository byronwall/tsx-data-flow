import { locationOf } from "./graph.mjs";

export function isCertaintyBoundaryDefense(defense) {
  return /parser-boundary|compatibility|optional|solid prop default|api-choice/i.test(
    defense.origin ?? "",
  );
}

export function defenseRecord(ts, checker, guardedExpression, node, operation) {
  const runtimeBoundary = runtimeBoundaryFallback(
    ts,
    checker,
    guardedExpression,
  );
  const typeVerdict = getNullishStatus(ts, checker, guardedExpression);
  const verdict =
    typeVerdict === "impossible" && runtimeBoundary ? "possible" : typeVerdict;
  const sourceFile = node.getSourceFile();
  const location = locationOf(sourceFile, node);
  return {
    operation,
    expression: node.getText(),
    guardedExpression: guardedExpression.getText(),
    type: safeTypeText(
      checker.typeToString(checker.getTypeAtLocation(guardedExpression)),
    ),
    verdict,
    origin: fallbackOrigin(
      ts,
      checker,
      guardedExpression,
      node,
      verdict,
      runtimeBoundary,
    ),
    location,
    // Physical identity of this guard: the same `x ?? y` site reached through
    // several render sub-paths is one defensive operation, not many. Keyed by
    // file + position so dedupe survives cross-file helper inlining.
    key: `${sourceFile.fileName}:${location.line}:${location.column}`,
  };
}

// Phase 9 — distinguish stale defensive code from intentional compatibility
// guards, using only local signals: the guard's type/optionality and any
// leading comment on the AST node (no repo scanning).
function fallbackOrigin(
  ts,
  checker,
  guardedExpression,
  node,
  verdict,
  runtimeBoundary = null,
) {
  if (runtimeBoundary) return runtimeBoundary.origin;
  if (verdict === "impossible") return "stale (type-impossible)";
  if (verdict === "unknown") return "unknown";
  if (isApiChoiceFallback(ts, node)) return "api-choice fallback";
  if (isOptionalPropRead(ts, checker, guardedExpression)) {
    return "solid prop default (optional prop)";
  }
  const comment = leadingCommentText(ts, node);
  if (/persist|legacy|back[ -]?compat|compat|migrat|deprecat/i.test(comment)) {
    return "compatibility (documented)";
  }
  if (
    ts.isPropertyAccessExpression(guardedExpression) &&
    guardedExpression.questionDotToken
  ) {
    return "compatibility (optional)";
  }
  const type = checker.getTypeAtLocation(guardedExpression);
  const members = type.isUnion() ? type.types : [type];
  if (members.some((m) => (m.flags & ts.TypeFlags.Undefined) !== 0)) {
    return "compatibility (optional)";
  }
  return "defensive (review)";
}

function isOptionalPropRead(ts, checker, expression) {
  const unwrapped = unwrapExpression(ts, expression);
  if (!ts.isPropertyAccessExpression(unwrapped)) return false;
  if (!ts.isIdentifier(unwrapped.expression)) return false;
  if (!isParameterIdentifier(ts, checker, unwrapped.expression)) return false;

  const receiverType = checker.getTypeAtLocation(unwrapped.expression);
  const property = checker.getPropertyOfType(receiverType, unwrapped.name.text);
  if (!property) return false;
  if ((property.flags & ts.SymbolFlags.Optional) !== 0) return true;

  const propertyType = checker.getTypeOfSymbolAtLocation(property, unwrapped);
  const members = propertyType.isUnion() ? propertyType.types : [propertyType];
  return members.some(
    (member) => (member.flags & ts.TypeFlags.Undefined) !== 0,
  );
}

function isParameterIdentifier(ts, checker, identifier) {
  const symbol = checker.getSymbolAtLocation(identifier);
  const declaration = symbol?.valueDeclaration;
  return Boolean(declaration && ts.isParameter(declaration));
}

function isApiChoiceFallback(ts, node) {
  if (!ts.isBinaryExpression(node)) return false;
  const operator = node.operatorToken.kind;
  if (
    operator !== ts.SyntaxKind.QuestionQuestionToken &&
    operator !== ts.SyntaxKind.BarBarToken
  ) {
    return false;
  }
  const right = unwrapExpression(ts, node.right);
  if (
    ts.isStringLiteral(right) ||
    ts.isNoSubstitutionTemplateLiteral(right) ||
    ts.isNumericLiteral(right) ||
    right.kind === ts.SyntaxKind.TrueKeyword ||
    right.kind === ts.SyntaxKind.FalseKeyword ||
    right.kind === ts.SyntaxKind.NullKeyword
  ) {
    return false;
  }
  return expressionHasIdentifierOrPropertyRead(ts, right);
}

function expressionHasIdentifierOrPropertyRead(ts, expression) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

// TypeScript usually reports `array[index]` as the element type unless the
// target enables noUncheckedIndexedAccess. Parser code often defaults indexed
// regex/extraction results precisely because a valid broad string may yield no
// token, so do not promote those fallbacks to "type-impossible".
function runtimeBoundaryFallback(ts, checker, expression, seen = new Set()) {
  const unwrapped = unwrapExpression(ts, expression);
  if (seen.has(unwrapped)) return null;
  seen.add(unwrapped);

  if (ts.isIdentifier(unwrapped)) {
    const initializer = declarationInitializer(ts, checker, unwrapped);
    if (initializer) {
      return runtimeBoundaryFallback(ts, checker, initializer, seen);
    }
  }

  if (!ts.isElementAccessExpression(unwrapped)) return null;
  if (!looksLikeNumericIndex(ts, unwrapped.argumentExpression)) return null;
  if (!isRuntimeOptionalSequence(ts, checker, unwrapped.expression, seen)) {
    return null;
  }
  return { origin: "parser-boundary fallback" };
}

function declarationInitializer(ts, checker, identifier) {
  const symbol = checker.getSymbolAtLocation(identifier);
  const declaration = symbol?.valueDeclaration;
  if (!declaration || !ts.isVariableDeclaration(declaration)) return null;
  if (!ts.isIdentifier(declaration.name)) return null;
  return declaration.initializer ?? null;
}

function isRuntimeOptionalSequence(ts, checker, expression, seen) {
  const unwrapped = unwrapExpression(ts, expression);
  if (seen.has(unwrapped)) return false;
  seen.add(unwrapped);

  if (ts.isCallExpression(unwrapped)) {
    return isParserLikeCall(ts, unwrapped);
  }
  if (ts.isBinaryExpression(unwrapped)) {
    return (
      unwrapped.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      isRuntimeOptionalSequence(ts, checker, unwrapped.left, seen)
    );
  }
  if (ts.isIdentifier(unwrapped)) {
    const initializer = declarationInitializer(ts, checker, unwrapped);
    if (initializer) {
      return isRuntimeOptionalSequence(ts, checker, initializer, seen);
    }
  }
  return isArrayLikeExtractionType(ts, checker, unwrapped);
}

function isParserLikeCall(ts, call) {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) {
    return /^(exec|filter|flatMap|map|match|matchAll|split)$/u.test(
      callee.name.text,
    );
  }
  if (ts.isIdentifier(callee)) {
    return /(?:extract|find|match|parse|token|split)/iu.test(callee.text);
  }
  return false;
}

function isArrayLikeExtractionType(ts, checker, expression) {
  const typeText = checker.typeToString(checker.getTypeAtLocation(expression));
  return /\b(?:Array|ReadonlyArray|RegExpMatchArray|string)\b|\[\]/u.test(
    typeText,
  );
}

function looksLikeNumericIndex(ts, expression) {
  if (!expression) return true;
  if (ts.isNumericLiteral(expression)) return true;
  return (
    ts.isPrefixUnaryExpression(expression) &&
    ts.isNumericLiteral(expression.operand)
  );
}

function unwrapExpression(ts, expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function leadingCommentText(ts, node) {
  const sourceFile = node.getSourceFile();
  const fullText = sourceFile.getFullText();
  const ranges =
    ts.getLeadingCommentRanges(fullText, node.getFullStart()) ?? [];
  return ranges.map((range) => fullText.slice(range.pos, range.end)).join(" ");
}

function getNullishStatus(ts, checker, expression) {
  const type = checker.getTypeAtLocation(expression);
  const members = type.isUnion() ? type.types : [type];
  const uncertain = members.some(
    (member) =>
      (member.flags &
        (ts.TypeFlags.Any |
          ts.TypeFlags.Unknown |
          ts.TypeFlags.TypeParameter)) !==
      0,
  );
  if (uncertain) return "unknown";
  const containsNullish = members.some(
    (member) =>
      (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0,
  );
  return containsNullish ? "possible" : "impossible";
}

// Confidence as a score plus a plain-English reason and risk (Phase 4). The
// numeric `score` preserves the prior return value so ranking/queueing are
// unchanged; reason/risk explain it in human terms for the report.
export function confidenceFor(metrics, defenses) {
  if (metrics.unknownEdgeCount > 0) {
    return {
      score: 72,
      reason: "Path contains unresolved (dynamic or external) hops.",
      risk: "medium; verify the unknown edge before editing.",
    };
  }
  if (defenses.some((defense) => defense.verdict === "unknown")) {
    return {
      score: 80,
      reason: "A guard's type is too loose to evaluate statically.",
      risk: "low–medium; confirm the guard is still needed.",
    };
  }
  if (metrics.impossibleDefenseCount > 0) {
    return {
      score: 99,
      reason: "Single file, direct JSX sink, all hops statically resolved.",
      risk: "low; behavior-preserving extraction likely.",
    };
  }
  return {
    score: 88,
    reason: "All hops statically resolved within one file.",
    risk: "low.",
  };
}

export function safeTypeText(value = "") {
  return value || "unknown";
}
