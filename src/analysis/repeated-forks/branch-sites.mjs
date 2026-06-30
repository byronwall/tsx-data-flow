import { locationOf } from "../graph.mjs";
import { collapse } from "../../reports/format-helpers.mjs";

// Values that are guards/toggles, not variant axes. A discriminated split keys
// on a named domain value (a string/number literal), never on these.
const NULLISH_OR_BOOLEAN_VALUES = new Set([
  "undefined",
  "null",
  "true",
  "false",
  "",
]);

export const isNamedLiteralValue = (value) =>
  value != null && !NULLISH_OR_BOOLEAN_VALUES.has(value);

export function collectBranchSites({
  ts,
  checker,
  sourceFile,
  ownerFor,
  nodeHasJsx,
}) {
  const literalKinds = new Set([
    ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.NumericLiteral,
    ts.SyntaxKind.TrueKeyword,
    ts.SyntaxKind.FalseKeyword,
    ts.SyntaxKind.NullKeyword,
    ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ]);
  const isLiteralish = (node) =>
    literalKinds.has(node.kind) ||
    (ts.isIdentifier(node) && node.text === "undefined");
  const literalText = (node) =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      ? node.text
      : collapse(node.getText());
  const comparisonOps = new Set([
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
  ]);

  // Reduce a branch condition to { subjectNode, subjectText, value }: the thing
  // discriminated on, plus (for a comparison against a literal) the value that
  // selects this branch.
  const discriminantOf = (node) => {
    let cond = node;
    while (ts.isParenthesizedExpression(cond)) cond = cond.expression;
    if (
      ts.isPrefixUnaryExpression(cond) &&
      cond.operator === ts.SyntaxKind.ExclamationToken
    ) {
      const inner = discriminantOf(cond.operand);
      return {
        subjectNode: inner.subjectNode,
        subjectText: inner.subjectText,
        value: null,
      };
    }
    if (
      ts.isBinaryExpression(cond) &&
      comparisonOps.has(cond.operatorToken.kind)
    ) {
      const { left, right } = cond;
      if (isLiteralish(right) && !isLiteralish(left))
        return {
          subjectNode: left,
          subjectText: collapse(left.getText()),
          value: literalText(right),
        };
      if (isLiteralish(left) && !isLiteralish(right))
        return {
          subjectNode: right,
          subjectText: collapse(right.getText()),
          value: literalText(left),
        };
      return {
        subjectNode: cond,
        subjectText: collapse(cond.getText()),
        value: null,
      };
    }
    return {
      subjectNode: cond,
      subjectText: collapse(cond.getText()),
      value: null,
    };
  };

  // Stable identity for a discriminant subject. Prefer the resolved symbol so
  // that the same prop/signal groups across sites, and so distinct locals that
  // merely share a name (a `const box` re-declared in five functions) do NOT
  // collapse into one false fork. Falls back to owner-scoped text.
  const subjectKey = (subjectNode, ownerNode) => {
    try {
      const symbol = checker.getSymbolAtLocation(subjectNode);
      const decl = symbol?.getDeclarations?.()?.[0];
      if (decl)
        return `sym:${decl.getSourceFile().fileName}:${decl.getStart()}`;
    } catch {
      // checker can throw on synthesized nodes; fall through to text key.
    }
    return `txt:${ownerNode.getStart()}:${collapse(subjectNode.getText())}`;
  };

  const collectIdentifiers = (node) => {
    const ids = new Set();
    const walk = (current) => {
      if (ts.isIdentifier(current)) ids.add(current.text);
      ts.forEachChild(current, walk);
    };
    walk(node);
    return ids;
  };

  // An `if` whose then-branch is only an early exit (return/throw/break/continue
  // that renders nothing) is narrowing one path, not forking into siblings.
  const isGuardClause = (thenStatement) => {
    let stmt = thenStatement;
    if (ts.isBlock(stmt)) {
      if (stmt.statements.length !== 1) return false;
      stmt = stmt.statements[0];
    }
    if (ts.isReturnStatement(stmt))
      return !stmt.expression || !nodeHasJsx(stmt.expression);
    return (
      ts.isThrowStatement(stmt) ||
      ts.isBreakStatement(stmt) ||
      ts.isContinueStatement(stmt)
    );
  };

  const makeSite = (kind, node, condition, consequent) => {
    const disc = discriminantOf(condition);
    return {
      kind,
      node,
      subjectNode: disc.subjectNode,
      subjectText: disc.subjectText,
      value: disc.value,
      location: locationOf(sourceFile, condition),
      consequent,
      consequentIds: consequent ? collectIdentifiers(consequent) : new Set(),
      snippet: collapse(condition.getText()),
    };
  };

  // Solid control-flow elements: <Match when={...}> and <Show when={...}>. The
  // `when` guard is the discriminant; the element's subtree is the branch body.
  const jsxBranchSite = (node) => {
    let tagName = null;
    let attributes = null;
    if (ts.isJsxElement(node)) {
      tagName = node.openingElement.tagName.getText();
      attributes = node.openingElement.attributes;
    } else if (ts.isJsxSelfClosingElement(node)) {
      tagName = node.tagName.getText();
      attributes = node.attributes;
    } else {
      return null;
    }
    const base = tagName.split(".").pop();
    if (base !== "Match" && base !== "Show") return null;
    const whenAttr = attributes.properties.find(
      (property) =>
        ts.isJsxAttribute(property) && property.name.getText() === "when",
    );
    if (
      !whenAttr ||
      !whenAttr.initializer ||
      !ts.isJsxExpression(whenAttr.initializer) ||
      !whenAttr.initializer.expression
    )
      return null;
    const condition = whenAttr.initializer.expression;
    const disc = discriminantOf(condition);
    return {
      kind: base === "Match" ? "switch-match" : "show",
      node,
      subjectNode: disc.subjectNode,
      subjectText: disc.subjectText,
      value: disc.value,
      location: locationOf(sourceFile, condition),
      consequent: node,
      consequentIds: collectIdentifiers(node),
      snippet: collapse(condition.getText()),
    };
  };

  const sitesByOwner = new Map();
  const addSite = (owner, site) => {
    if (!sitesByOwner.has(owner)) sitesByOwner.set(owner, []);
    sitesByOwner.get(owner).push(site);
  };

  const visit = (node) => {
    let site = null;
    if (ts.isConditionalExpression(node)) {
      site = makeSite("ternary", node, node.condition, node.whenTrue);
      // The else chain (whenFalse) holds sibling branches, not nesting — stop the
      // containment window before it so `a ? x : b ? y : c` keeps all sites.
      if (site) site.dedupeEnd = node.whenFalse.getStart();
    } else if (ts.isIfStatement(node)) {
      // Guard clauses (`if (!x) return`) are narrowing, not forking — skip them.
      if (!isGuardClause(node.thenStatement)) {
        site = makeSite("if", node, node.expression, node.thenStatement);
        if (site) site.dedupeEnd = node.thenStatement.getEnd();
      }
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      site = makeSite("logical", node, node.left, node.right);
    } else {
      site = jsxBranchSite(node);
    }
    if (site && site.subjectText) {
      if (site.dedupeEnd == null) site.dedupeEnd = node.getEnd();
      const owner = ownerFor(node);
      if (owner) {
        site.key = subjectKey(site.subjectNode, owner);
        addSite(owner, site);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return sitesByOwner;
}
