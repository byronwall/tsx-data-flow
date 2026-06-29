import path from "node:path";

// Global namespace objects. As a call receiver (`Array.from`, `Object.entries`,
// `Math.round`) the call is a host call; as a bare identifier source they are
// the platform, not unresolved app state.
const JS_GLOBAL_NAMESPACES = new Set([
  "Array",
  "Object",
  "Math",
  "JSON",
  "Date",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Number",
  "String",
  "Boolean",
  "Symbol",
  "Promise",
  "RegExp",
  "Error",
  "Intl",
  "Reflect",
  "Proxy",
  "BigInt",
  "globalThis",
  "console",
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "navigator",
  "location",
  "history",
  "performance",
  "crypto",
  "URL",
  "URLSearchParams",
  "Element",
  "HTMLElement",
  "SVGElement",
  "Node",
  "Text",
  "Comment",
  "DocumentFragment",
  "Event",
  "EventTarget",
  "CustomEvent",
  "DOMRect",
  "File",
  "Blob",
  "FormData",
  "AbortController",
  "ResizeObserver",
  "IntersectionObserver",
  "MutationObserver",
]);

const JS_GLOBAL_CALLS = new Set([
  "String",
  "Number",
  "Boolean",
  "Array",
  "Object",
  "Symbol",
  "BigInt",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
  "structuredClone",
]);

const JS_PROTOTYPE_METHODS = new Set([
  "map",
  "filter",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "slice",
  "splice",
  "concat",
  "join",
  "split",
  "reduce",
  "reduceRight",
  "some",
  "every",
  "sort",
  "reverse",
  "forEach",
  "flat",
  "flatMap",
  "includes",
  "indexOf",
  "lastIndexOf",
  "at",
  "fill",
  "keys",
  "values",
  "entries",
  "push",
  "pop",
  "shift",
  "unshift",
  "trim",
  "trimStart",
  "trimEnd",
  "toUpperCase",
  "toLowerCase",
  "replace",
  "replaceAll",
  "match",
  "matchAll",
  "padStart",
  "padEnd",
  "startsWith",
  "endsWith",
  "repeat",
  "charAt",
  "charCodeAt",
  "codePointAt",
  "substring",
  "substr",
  "normalize",
  "toFixed",
  "toString",
  "toLocaleString",
  "valueOf",
  "has",
  "get",
  "set",
  "add",
  "delete",
  "toSorted",
  "toReversed",
  "toSpliced",
  "with",
  "group",
  "groupBy",
  "toISOString",
  "toJSON",
  "toDateString",
  "toTimeString",
  "toLocaleDateString",
  "toLocaleTimeString",
  "getTime",
  "getFullYear",
  "getMonth",
  "getDate",
  "getDay",
  "getHours",
  "getMinutes",
  "getSeconds",
  "getMilliseconds",
  "getTimezoneOffset",
  "toPrecision",
  "toExponential",
]);

const SOLID_BUILTINS = new Set([
  "splitProps",
  "mergeProps",
  "createSignal",
  "createStore",
  "createMemo",
  "createResource",
  "createEffect",
  "createComputed",
  "createRenderEffect",
  "createSelector",
  "createRoot",
  "createDeferred",
  "createReaction",
  "children",
  "batch",
  "untrack",
  "on",
  "onMount",
  "onCleanup",
  "catchError",
  "reconcile",
  "produce",
  "unwrap",
  "mapArray",
  "indexArray",
  "from",
  "observable",
]);

export function isGlobalNamespaceName(name) {
  return JS_GLOBAL_NAMESPACES.has(name);
}

export function isOpaqueByDesignCall(ts, expression, callee) {
  const inner = expression.expression;
  if (ts.isPropertyAccessExpression(inner)) {
    const receiver = inner.expression;
    if (ts.isIdentifier(receiver) && JS_GLOBAL_NAMESPACES.has(receiver.text)) {
      return true;
    }
    return JS_PROTOTYPE_METHODS.has(callee);
  }
  if (ts.isIdentifier(inner)) {
    return SOLID_BUILTINS.has(callee) || JS_GLOBAL_CALLS.has(callee);
  }
  return false;
}

export function classifyUnresolvedCall(ts, checker, expression, crossFile) {
  if (!crossFile?.args) return null;
  const inner = expression.expression;
  const calleeIdent = ts.isIdentifier(inner)
    ? inner
    : ts.isPropertyAccessExpression(inner)
      ? inner.name
      : null;
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
  const declarations = symbol?.declarations ?? [];
  if (declarations.length === 0) return null;

  const isExternalDecl = (declaration) => {
    const file = declaration.getSourceFile();
    if (file.isDeclarationFile) return true;
    const relative = relativePath(crossFile.args.root, file.fileName);
    return relative.startsWith("..") || relative.includes("node_modules/");
  };
  if (declarations.every(isExternalDecl)) return "host-call";

  const hasFunctionInitializer = (declaration) =>
    declaration.initializer &&
    (ts.isArrowFunction(declaration.initializer) ||
      ts.isFunctionExpression(declaration.initializer));

  const isAccessorLike = (declaration) =>
    ts.isPropertySignature(declaration) ||
    ts.isMethodSignature(declaration) ||
    ts.isParameter(declaration) ||
    ts.isBindingElement(declaration) ||
    ts.isGetAccessorDeclaration(declaration) ||
    (ts.isPropertyDeclaration(declaration) &&
      !hasFunctionInitializer(declaration)) ||
    ts.isShorthandPropertyAssignment(declaration) ||
    (ts.isPropertyAssignment(declaration) &&
      !hasFunctionInitializer(declaration));
  if (declarations.every(isAccessorLike)) return "accessor-read";

  const isFactoryCallable = (declaration) =>
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer &&
    !hasFunctionInitializer(declaration);
  if (declarations.every(isFactoryCallable)) return "factory-callable";

  return null;
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
