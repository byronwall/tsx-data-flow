import path from "node:path";
import { locationOf, spanOf } from "./graph.mjs";
import { unique } from "./collections.mjs";
import { collapse, formatExpression } from "../reports/format-helpers.mjs";
import {
  collectBranchSites,
  isNamedLiteralValue,
} from "./repeated-forks/branch-sites.mjs";

//
// The per-sink trace only ever sees a fork that sits directly on one value's
// data slice. The "same discriminant tested in N sibling places" smell — the
// textbook trigger for splitting a component into discriminated sub-components —
// has no representation there: a `props.type` guard on a *sibling* sink is
// invisible to that sink's backward trace.
//
// This pass restores it. Per component function it collects every branch
// construct (ternary, if, &&/||, Solid `<Match>`/`<Show when>`), normalizes each
// discriminant to a subject key (the non-literal side of a comparison, or the
// raw condition text), and emits a component-level finding when one subject is
// forked in >=2 sibling locations. Severity is sharpened by counting
// component-scope derived values that are read under only one branch — the
// "you computed both branches eagerly, used one" waste that turns a style nit
// into real burden.
// Calls whose function argument runs as a side effect / lifecycle reaction, not
// as a render-feeding derivation. A branch inside one of these is control flow,
// not a render fork. `createMemo`/`createSelector` are deliberately absent — they
// feed JSX and stay transparent.
const SIDE_EFFECT_CALLEES = new Set([
  "createEffect",
  "createRenderEffect",
  "createComputed",
  "createReaction",
  "onMount",
  "onCleanup",
  "onError",
  "on",
  "batch",
  "untrack",
  "setTimeout",
  "setInterval",
  "queueMicrotask",
  "requestAnimationFrame",
  "requestIdleCallback",
  "addEventListener",
]);

export function detectRepeatedForks(ts, checker, sourceFile, root) {
  const file = relativePath(root, sourceFile.fileName);

  const isFunctionLike = (node) =>
    ts.isFunctionDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node);

  const functionName = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
    if (ts.isMethodDeclaration(node) && node.name) return node.name.getText();
    const parent = node.parent;
    if (
      parent &&
      ts.isVariableDeclaration(parent) &&
      ts.isIdentifier(parent.name)
    )
      return parent.name.text;
    if (parent && ts.isPropertyAssignment(parent) && parent.name)
      return collapse(parent.name.getText());
    return null;
  };

  // Does a subtree contain JSX (not counting JSX inside a nested function)?
  const nodeHasJsx = (node, stopAtFunctions = false) => {
    let found = false;
    const walk = (current) => {
      if (found) return;
      if (
        ts.isJsxElement(current) ||
        ts.isJsxSelfClosingElement(current) ||
        ts.isJsxFragment(current)
      ) {
        found = true;
        return;
      }
      if (stopAtFunctions && current !== node && isFunctionLike(current))
        return;
      ts.forEachChild(current, walk);
    };
    walk(node);
    return found;
  };

  // Memoized "does this function body render JSX" test → it is a component.
  const jsxCache = new Map();
  const containsJsx = (fnNode) => {
    if (jsxCache.has(fnNode)) return jsxCache.get(fnNode);
    const found = nodeHasJsx(fnNode, true);
    jsxCache.set(fnNode, found);
    return found;
  };

  const calleeName = (expr) => {
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
    return null;
  };

  // A non-JSX function is render-feeding (a derived accessor/memo whose output
  // flows into JSX) unless it is an event handler or a lifecycle/effect
  // callback. Those carry control flow, never a render fork.
  const isRenderFeedingAccessor = (fn) => {
    const parent = fn.parent;
    // Bound to a JSX `on*` event attribute: <x onClick={() => ...} />
    if (
      parent &&
      ts.isJsxExpression(parent) &&
      parent.parent &&
      ts.isJsxAttribute(parent.parent)
    ) {
      const attrName = parent.parent.name.getText();
      if (/^on[A-Z]/.test(attrName)) return false;
    }
    // Named like an event handler: const onKeyDown = ... / const handleClick = ...
    if (
      parent &&
      ts.isVariableDeclaration(parent) &&
      ts.isIdentifier(parent.name) &&
      /^(on|handle)[A-Z]/.test(parent.name.text)
    )
      return false;
    // Passed as the callback to a side-effect / lifecycle primitive.
    if (
      parent &&
      ts.isCallExpression(parent) &&
      parent.arguments.some((arg) => arg === fn)
    ) {
      const name = calleeName(parent.expression);
      if (name && SIDE_EFFECT_CALLEES.has(name)) return false;
    }
    // First parameter is (or is typed as) a DOM Event → an event handler.
    const param = fn.parameters?.[0];
    if (param) {
      if (
        ts.isIdentifier(param.name) &&
        /^(e|ev|evt|event)$/i.test(param.name.text)
      )
        return false;
      const typeText = param.type ? param.type.getText() : "";
      if (/(^|[^A-Za-z])Event(<|$|\b)/.test(typeText)) return false;
    }
    return true;
  };

  // Owning component for a branch, or null if the branch is NOT on a render
  // path. The nearest enclosing function-like must be the component itself
  // (renders JSX) or a render-feeding accessor that ultimately sits inside a
  // component. Event handlers and effect callbacks return null → ignored.
  const ownerFor = (node) => {
    let fn = node.parent;
    while (fn && !isFunctionLike(fn)) fn = fn.parent;
    if (!fn) return null;
    if (containsJsx(fn)) return fn;
    if (!isRenderFeedingAccessor(fn)) return null;
    let up = fn.parent;
    while (up) {
      if (isFunctionLike(up) && containsJsx(up)) return up;
      up = up.parent;
    }
    return null;
  };

  // owner function node -> { node, name, sites: [] }
  const components = new Map();
  const componentFor = (fnNode) => {
    let entry = components.get(fnNode);
    if (!entry) {
      entry = { node: fnNode, name: functionName(fnNode), sites: [] };
      components.set(fnNode, entry);
    }
    return entry;
  };

  const sitesByOwner = collectBranchSites({
    ts,
    checker,
    sourceFile,
    ownerFor,
    nodeHasJsx,
  });
  for (const [owner, sites] of sitesByOwner) {
    componentFor(owner).sites.push(...sites);
  }

  // Component-scope derived bindings (`const x = () => ...`, memos, ternaries):
  // candidates for "computed eagerly, read under one branch only".
  const componentScopeDecls = (fnNode) => {
    const body = fnNode.body;
    if (!body || !ts.isBlock(body)) return [];
    const decls = [];
    for (const stmt of body.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const declaration of stmt.declarationList.declarations) {
        if (!declaration.initializer || !ts.isIdentifier(declaration.name))
          continue;
        const init = declaration.initializer;
        const derived =
          ts.isArrowFunction(init) ||
          ts.isFunctionExpression(init) ||
          ts.isCallExpression(init) ||
          ts.isConditionalExpression(init);
        if (derived)
          decls.push({
            name: declaration.name.text,
            line: locationOf(sourceFile, declaration).line,
          });
      }
    }
    return decls;
  };

  // Drop sites contained inside another same-subject site's condition/consequent
  // window (`dedupeEnd` excludes the else chain), so an `if` and a ternary nested
  // in its then-branch don't double-count, while chained ternaries stay distinct.
  const dedupeNested = (sites) => {
    const sorted = [...sites].sort(
      (a, b) => a.node.getStart() - b.node.getStart(),
    );
    const kept = [];
    for (const site of sorted) {
      const start = site.node.getStart();
      const end = site.node.getEnd();
      const nested = kept.some(
        (other) =>
          other.node !== site.node &&
          other.node.getStart() <= start &&
          (other.dedupeEnd ?? other.node.getEnd()) >= end,
      );
      if (!nested) kept.push(site);
    }
    return kept;
  };

  const findings = [];
  for (const component of components.values()) {
    if (!containsJsx(component.node)) continue;
    // Group by resolved discriminant identity, not raw text.
    const byKey = new Map();
    for (const site of component.sites) {
      if (!byKey.has(site.key)) byKey.set(site.key, []);
      byKey.get(site.key).push(site);
    }
    const decls = componentScopeDecls(component.node);
    const componentLine = locationOf(sourceFile, component.node).line;
    for (const groupSites of byKey.values()) {
      const sites = dedupeNested(groupSites);
      if (sites.length < 2) continue;
      const subject = sites[0].subjectText;

      const branchValues = unique(
        sites.map((site) => site.value).filter((value) => value != null),
      );
      const namedValues = branchValues.filter(isNamedLiteralValue);
      const hasSwitchMatch = sites.some((site) => site.kind === "switch-match");
      const hasStructural = sites.some(
        (site) =>
          site.kind === "switch-match" ||
          site.kind === "show" ||
          site.kind === "ternary" ||
          site.kind === "if",
      );

      // Variant gate: a real discriminated split keys on a named domain value
      // (≥1 named literal compared) or a Switch/Match on a literal union. Bare
      // booleans, nullish sentinels, and toggle signals are not splits.
      if (!hasStructural) continue;
      if (namedValues.length < 1 && !hasSwitchMatch) continue;

      // Severity (trimmed Option B): component-scope derived values read under
      // exactly one branch value are eager cross-branch computation.
      const usageByValue = new Map();
      for (const site of sites) {
        const key = site.value ?? "(other)";
        if (!usageByValue.has(key)) usageByValue.set(key, new Set());
        for (const id of site.consequentIds) usageByValue.get(key).add(id);
      }
      const branchExclusive = [];
      for (const decl of decls) {
        const inValues = [...usageByValue.entries()]
          .filter(([, ids]) => ids.has(decl.name))
          .map(([value]) => value);
        if (inValues.length === 1)
          branchExclusive.push({ ...decl, branch: inValues[0] });
      }

      // Line ranges of each branch body, so related sinks can be gated to the
      // sites actually rendered under the discriminated branches.
      const branchRanges = sites
        .map((site) => site.consequent)
        .filter(Boolean)
        .map((node) => {
          const span = spanOf(sourceFile, node);
          return { startLine: span.startLine, endLine: span.endLine };
        });

      // Confidence: a literal-union Switch/Match or ≥2 named values is a clean
      // anchor; a single named value tested repeatedly is medium.
      const confidence =
        hasSwitchMatch || namedValues.length >= 2 ? "high" : "medium";
      // Reweight toward what actually predicts a split: distinct named domain
      // values dominate, then render-site count, then eager cross-branch compute.
      const severity =
        namedValues.length * 5 +
        sites.length +
        branchExclusive.length * 3 +
        (hasSwitchMatch ? 2 : 0);
      const first = sites[0];
      findings.push({
        id: `FORK-${first.location.line}-${first.location.column}`,
        kind: "repeated-fork",
        file,
        line: first.location.line,
        column: first.location.column,
        component: component.name,
        componentLine,
        discriminant: subject,
        branchValues,
        namedValues,
        branchRanges,
        sites: sites.map((site) => ({
          kind: site.kind,
          line: site.location.line,
          column: site.location.column,
          value: site.value,
          snippet: formatExpression(site.snippet, 80),
        })),
        siteCount: sites.length,
        branchExclusive,
        confidence,
        severity,
      });
    }
  }
  return findings.sort((a, b) => b.severity - a.severity);
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
