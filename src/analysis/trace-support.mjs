import path from "node:path";
import { locationOf } from "./graph.mjs";
import { collapse } from "../reports/format-helpers.mjs";

export function buildFileContext(ts, sourceFile) {
  const variables = new Map();
  const functions = new Map();
  const accessors = new Map();
  const parameters = new Set();
  // Local names bound by an import. A value imported from another module is a
  // genuine source boundary (the value enters the component from outside), not
  // an unresolved edge — so identifiers we cannot place locally are checked
  // against this set before dead-ending as `unknown-source`.
  const imports = new Set();

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      registerImports(ts, node, imports);
    }
    if (ts.isVariableDeclaration(node)) {
      registerVariable(ts, node, variables, accessors);
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name))
          parameters.add(parameter.name.text);
      }
    }
    if (
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      node.parent &&
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      functions.set(node.parent.name.text, node);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name))
          parameters.add(parameter.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { variables, functions, accessors, parameters, imports };
}

// Per-file contexts are reused across every sink and every cross-file descent,
// so build each at most once.
export function getFileContextCached(ts, sourceFile, crossFile) {
  let context = crossFile.contextCache.get(sourceFile);
  if (!context) {
    context = buildFileContext(ts, sourceFile);
    crossFile.contextCache.set(sourceFile, context);
  }
  return context;
}

// The same-file `functions`/`accessors`/`variables` maps are keyed by name and
// span the whole file, so two same-named bindings in sibling scopes (e.g. a
// `pos` createMemo in one component and a `pos` helper in another) collapse to a
// single entry. Before trusting a by-name hit, confirm the type checker resolves
// this exact identifier to the declaration we found — otherwise the trace would
// descend into the wrong scope's binding. `storedNode` is the function node (for
// `functions`) or the variable declaration (for `accessors`/`variables`).
// Returns true when the symbol can't be resolved, preserving prior behavior.
export function identifierResolvesTo(ts, checker, identifier, storedNode) {
  let symbol = checker.getSymbolAtLocation(identifier);
  // A shorthand property (`return { color }`) resolves to the property symbol,
  // whose declaration is the ShorthandPropertyAssignment — not the local binding
  // it aliases. Step through to the value symbol so the check sees the binding.
  if (
    symbol &&
    identifier.parent &&
    ts.isShorthandPropertyAssignment(identifier.parent)
  ) {
    symbol =
      checker.getShorthandAssignmentValueSymbol(identifier.parent) ?? symbol;
  }
  const decls = symbol?.declarations;
  if (!decls || decls.length === 0) return true;
  return decls.some((decl) => {
    // function declaration (storedNode === decl) or arrow/fn-expr bound to a
    // variable (storedNode === decl.initializer).
    if (decl === storedNode) return true;
    if (ts.isVariableDeclaration(decl) && decl.initializer === storedNode)
      return true;
    // Accessor/variable entries store the VariableDeclaration; a binding-pattern
    // element (signal/resource) resolves up to it.
    for (let node = decl; node; node = node.parent) {
      if (node === storedNode) return true;
    }
    return false;
  });
}

// Lazily resolve a callee identifier to a catalog record for a first-party
// function, creating and caching the (cheap) record the first time. Follows
// import aliases so `import { groupBarSeries }` lands on the definition. Returns
// null for library/builtin/unresolvable callees; that null is cached too so the
// same call site isn't re-resolved. The catalog only ever holds functions a
// render path actually calls, keeping memory bounded on large repos.
//
// The checker calls are wrapped because type resolution on a pathologically deep
// expression can overflow TypeScript's own recursion; treat as unresolved.
export function resolveCatalogFn(ts, checker, calleeIdent, crossFile, args) {
  if (!calleeIdent) return null;
  let symbol;
  try {
    symbol = checker.getSymbolAtLocation(calleeIdent);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
  } catch {
    return null;
  }
  if (!symbol) return null;
  if (crossFile.catalog.has(symbol)) return crossFile.catalog.get(symbol);

  const found = traceableFromSymbol(ts, symbol);
  const record =
    found && isFirstPartyDecl(found.fnNode, args ?? crossFile.args)
      ? makeCatalogRecord(ts, found, symbol, args ?? crossFile.args)
      : null;
  // Remember which checker resolved this record. With per-config programs (so
  // path-alias imports resolve), a record's nodes belong to that program; later
  // enrichment must use the same checker, not whichever one is passed in.
  if (record) record.checker = checker;
  crossFile.catalog.set(symbol, record);
  return record;
}

export function getFunctionReturnExpression(ts, fn) {
  if (!fn) return null;
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return fn.body;
  let found = null;
  const visit = (node) => {
    if (!found && ts.isReturnStatement(node) && node.expression)
      found = node.expression;
    if (!found) ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return found;
}

export function getCallName(ts, node) {
  if (!ts.isCallExpression(node)) return "";
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression))
    return node.expression.name.text;
  return "";
}

// Collect the local names an import declaration binds: default, namespace, and
// named specifiers. `import type` declarations are skipped (type-only bindings
// never appear in a render value).
function registerImports(ts, node, imports) {
  const clause = node.importClause;
  if (!clause || clause.isTypeOnly) return;
  if (clause.name) imports.add(clause.name.text);
  const bindings = clause.namedBindings;
  if (!bindings) return;
  if (ts.isNamespaceImport(bindings)) {
    imports.add(bindings.name.text);
  } else if (ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) imports.add(element.name.text);
    }
  }
}

function registerVariable(ts, node, variables, accessors) {
  if (ts.isIdentifier(node.name)) {
    variables.set(node.name.text, node);
    if (node.initializer && isCallNamed(ts, node.initializer, "createMemo")) {
      accessors.set(node.name.text, { kind: "memo", declaration: node });
    }
    return;
  }

  if (ts.isArrayBindingPattern(node.name) && node.initializer) {
    const callName = getCallName(ts, node.initializer);
    node.name.elements.forEach((element, index) => {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        variables.set(element.name.text, node);
        if (
          index === 0 &&
          ["createSignal", "createResource"].includes(callName)
        ) {
          accessors.set(element.name.text, {
            kind: callName === "createSignal" ? "signal" : "resource",
            declaration: node,
          });
        }
      }
    });
    return;
  }

  if (ts.isObjectBindingPattern(node.name)) {
    node.name.elements.forEach((element) => {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        variables.set(element.name.text, node);
      }
    });
  }
}

// Given a function/variable symbol, find a traceable declaration: a function
// declaration, or an arrow/function-expression bound to a name. Returns the
// function node plus its naming identifier, or null.
function traceableFromSymbol(ts, symbol) {
  for (const decl of symbol.declarations ?? []) {
    if (ts.isFunctionDeclaration(decl) && decl.name) {
      return { fnNode: decl, nameNode: decl.name };
    }
    if (
      ts.isVariableDeclaration(decl) &&
      ts.isIdentifier(decl.name) &&
      decl.initializer &&
      (ts.isArrowFunction(decl.initializer) ||
        ts.isFunctionExpression(decl.initializer))
    ) {
      return { fnNode: decl.initializer, nameNode: decl.name };
    }
    // A class/object method (`entityManager().getRelation(id)`) or a get
    // accessor — resolved when the receiver's method is first-party. Has the
    // same `.parameters`/`.body` shape makeCatalogRecord and the return-expr
    // extractor expect.
    if (
      (ts.isMethodDeclaration(decl) || ts.isGetAccessorDeclaration(decl)) &&
      ts.isIdentifier(decl.name)
    ) {
      return { fnNode: decl, nameNode: decl.name };
    }
    // A method-as-property: `getRelation = (id) => ...` on a class, or a
    // `{ getRelation: (id) => ... }` object-literal method.
    if (
      (ts.isPropertyDeclaration(decl) || ts.isPropertyAssignment(decl)) &&
      ts.isIdentifier(decl.name) &&
      decl.initializer &&
      (ts.isArrowFunction(decl.initializer) ||
        ts.isFunctionExpression(decl.initializer))
    ) {
      return { fnNode: decl.initializer, nameNode: decl.name };
    }
  }
  return null;
}

// True when a declaration lives in first-party source we analyze (not a .d.ts,
// not node_modules, inside the project root) — the only helpers safe to descend.
function isFirstPartyDecl(decl, args) {
  const file = decl.getSourceFile();
  if (file.isDeclarationFile) return false;
  const relative = relativePath(args.root, file.fileName);
  return !relative.startsWith("..") && !relative.includes("node_modules/");
}

// Cheap up-front record: signature shape only, no checker type queries and no
// body tracing. The expensive parts (return type, internal metrics) are computed
// lazily in buildHelperReport for functions actually reached on a render path —
// tracing every function body in a large repo is what blows up memory.
function makeCatalogRecord(ts, found, symbol, args) {
  const { fnNode, nameNode } = found;
  const sourceFile = fnNode.getSourceFile();
  const location = locationOf(sourceFile, nameNode);
  const params = fnNode.parameters
    .filter((parameter) => ts.isIdentifier(parameter.name))
    .map((parameter) => ({
      name: parameter.name.text,
      // Syntactic annotation only (cheap); unannotated params are left unknown.
      type: parameter.type ? collapse(parameter.type.getText()) : "unknown",
    }));
  return {
    symbol,
    name: nameNode.text,
    file: relativePath(args.root, sourceFile.fileName),
    line: location.line,
    params,
    arity: params.length,
    callerCount: 0,
    callers: [],
    fnNode,
    returnExpr: getFunctionReturnExpression(ts, fnNode),
    sourceFile,
  };
}

function isCallNamed(ts, node, name) {
  return ts.isCallExpression(node) && getCallName(ts, node) === name;
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
