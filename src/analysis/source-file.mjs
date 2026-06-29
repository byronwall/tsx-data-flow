import path from "node:path";
import {
  addEdge,
  addNode,
  countDistinctUnknownEdges,
  createGraph,
  locationOf,
  spanOf,
} from "./graph.mjs";
import { unique } from "./collections.mjs";
import { buildHelperReport as buildHelperReportImpl } from "./helper-report.mjs";
import { fanOutRootsFor } from "./fan-out.mjs";
import { queueFor } from "./reachability.mjs";
import { detectRepeatedForks } from "./repeated-forks.mjs";
import {
  classifyUnresolvedCall,
  isGlobalNamespaceName,
  isOpaqueByDesignCall,
} from "./source-call-classification.mjs";
import { CONTROL_FLOW_ATTRIBUTES, sinkAttributeName } from "./sink-shape.mjs";
import {
  buildFileContext,
  getCallName,
  getFileContextCached,
  getFunctionReturnExpression,
  identifierResolvesTo,
  resolveCatalogFn,
} from "./trace-support.mjs";
import {
  collapse,
  focusSnippet,
  formatExpression,
} from "../reports/format-helpers.mjs";

// Representation-only hops: steps that repackage a value without changing it
// (aliases, object packs/spreads). Tracked so the report can list exactly which
// transforms it counts, and deduped per sink so a shared hop isn't counted once
// per render sub-path that crosses it.
const REPRESENTATION_KINDS = new Set(["alias", "object-pack", "object-spread"]);
// Conventional prop names that a custom list/collection component uses to receive
// the iterable it renders one row per (`<RowList items={…}>{(row) => …}</RowList>`).
// When such a component takes a render-callback child, its parameter is an element
// of this prop — the same binding `<For each>` provides natively.
const RENDER_PROP_ITERABLE_ATTRIBUTES = new Set([
  "items",
  "each",
  "rows",
  "data",
  "list",
  "entries",
  "options",
]);

export function analyzeSourceFile(
  ts,
  checker,
  graph,
  sourceFile,
  args,
  crossFile,
) {
  const context = crossFile
    ? getFileContextCached(ts, sourceFile, crossFile)
    : buildFileContext(ts, sourceFile);
  const sinks = [];

  const visit = (node) => {
    const sinkExpression = getSinkExpression(ts, node);
    if (sinkExpression) {
      const trace = traceExpression(
        ts,
        checker,
        graph,
        sinkExpression.expression,
        {
          ...context,
          sourceFile,
          root: args.root,
          stack: new Set(),
          // Cross-file descent state (Approach enabler). Null crossFile keeps the
          // legacy single-file behavior for callers that don't supply it.
          crossFile: crossFile ?? null,
          crossDepth: 0,
          visitedFns: new Set(),
          paramBindings: null,
        },
      );
      const sinkNode = addNode(graph, {
        kind: "jsx-sink",
        label: sinkExpression.label,
        file: relativePath(args.root, sourceFile.fileName),
        location: locationOf(sourceFile, node),
        type: "DOM",
      });
      addEdge(graph, trace.lastNodeId, sinkNode.id, "jsx-sink", node);
      sinks.push(
        buildSinkRecord(
          ts,
          checker,
          sourceFile,
          node,
          sinkExpression,
          trace,
          sinkNode,
          args.root,
        ),
      );
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  const forks = detectRepeatedForks(ts, checker, sourceFile, args.root);
  return { sinks, forks };
}

// --- Repeated fork/split detector (component-scoped branch inventory) ---------
export function buildHelperReport(ts, checker, crossFile, args, sourceFiles) {
  return buildHelperReportImpl(ts, checker, crossFile, args, sourceFiles, {
    fanOutRootsFor,
    getFileContextCached,
    metricsFor,
    resolveCatalogFn,
    safeTypeText,
    traceExpression,
  });
}

// BUG-1: an inline object literal with no dynamic sub-expression — an empty `{}`,
// or one built only from literals like `style={{ color: "red" }}` — is inert: it
// renders a constant value, not a tracked source, so it is neither a render-path
// finding nor a fan-out source. A literal-like node is a primitive literal (or a
// nested object/array of such); anything dynamic (identifier reference, property
// access, call, shorthand, spread, …) makes the object a real sink we keep.
function isLiteralLikeExpression(ts, node) {
  switch (node.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
      return true;
    default:
      break;
  }
  if (ts.isIdentifier(node) && node.text === "undefined") return true;
  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken ||
      node.operator === ts.SyntaxKind.PlusToken)
  )
    return isLiteralLikeExpression(ts, node.operand);
  if (ts.isParenthesizedExpression(node))
    return isLiteralLikeExpression(ts, node.expression);
  if (ts.isArrayLiteralExpression(node))
    return node.elements.every((element) =>
      isLiteralLikeExpression(ts, element),
    );
  if (ts.isObjectLiteralExpression(node)) return isInertObjectLiteral(ts, node);
  return false;
}

function isInertObjectLiteral(ts, node) {
  if (!ts.isObjectLiteralExpression(node)) return false;
  // Empty object → vacuously inert. Otherwise every property must be a plain
  // literal value; a shorthand (`{ x }`), spread, method, or accessor is dynamic.
  return node.properties.every(
    (property) =>
      ts.isPropertyAssignment(property) &&
      isLiteralLikeExpression(ts, property.initializer),
  );
}

function getSinkExpression(ts, node) {
  if (ts.isJsxExpression(node) && node.expression) {
    const parent = node.parent;
    if (parent && ts.isJsxAttribute(parent)) return null;
    if (isInertObjectLiteral(ts, node.expression)) return null;
    const jsx = jsxElementContext(ts, node);
    return {
      expression: node.expression,
      category: "rendered-value",
      label: `JSX ${formatExpression(node.expression.getText())}`,
      jsx,
    };
  }

  if (
    ts.isJsxAttribute(node) &&
    node.initializer &&
    ts.isJsxExpression(node.initializer)
  ) {
    const expression = node.initializer.expression;
    if (!expression) return null;
    if (isInertObjectLiteral(ts, expression)) return null;
    const name = node.name.getText();
    const event = /^on[A-Z]/.test(name);
    const jsx = jsxElementContext(ts, node);
    return {
      expression,
      category: event ? "event-handler" : classifyAttribute(name),
      label: `${name}={...}`,
      jsx: { ...jsx, attribute: name },
    };
  }
  return null;
}

function jsxElementContext(ts, node) {
  let current = node;
  while (current) {
    if (ts.isJsxElement(current)) {
      return { tag: jsxTagNameText(current.openingElement.tagName) };
    }
    if (ts.isJsxSelfClosingElement(current)) {
      return { tag: jsxTagNameText(current.tagName) };
    }
    if (ts.isJsxOpeningElement(current)) {
      return { tag: jsxTagNameText(current.tagName) };
    }
    if (ts.isJsxAttribute(current)) {
      const owner = current.parent?.parent;
      if (owner && ts.isJsxSelfClosingElement(owner)) {
        return { tag: jsxTagNameText(owner.tagName) };
      }
      if (owner && ts.isJsxOpeningElement(owner)) {
        return { tag: jsxTagNameText(owner.tagName) };
      }
    }
    current = current.parent;
  }
  return { tag: null };
}

function jsxTagNameText(tagName) {
  return tagName ? collapse(tagName.getText()) : null;
}

function enclosingFunctionName(ts, node) {
  let current = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name)
      return current.name.text;
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      current.parent &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
    current = current.parent;
  }
  return null;
}

// Resolve an identifier that is the parameter of an enclosing render callback
// passed as the JSX child of a control-flow component. Returns the control-flow
// prop expression that feeds the callback (`each`/`when`/`fallback`), the
// parameter's position, and the host tag — or null when `name` is not such a
// parameter. Walks outward to the innermost function that declares `name`.
// Does a callback parameter's binding introduce `name`? Matches a plain
// identifier param (`(item) => …`) as well as the bindings of a destructured
// tuple/object param (`([key, value]) => …`, `({ id }) => …`) so a `<For>` row
// that destructures its element still traces back to the iterated source.
function bindingCoversName(ts, bindingName, name) {
  if (ts.isIdentifier(bindingName)) return bindingName.text === name;
  if (
    ts.isArrayBindingPattern(bindingName) ||
    ts.isObjectBindingPattern(bindingName)
  ) {
    return bindingName.elements.some(
      (element) =>
        !ts.isOmittedExpression(element) &&
        element.name &&
        bindingCoversName(ts, element.name, name),
    );
  }
  return false;
}

// First iterable-valued prop on a custom list/collection component
// (`items`/`rows`/`each`/…), or null. Used to bind a render-callback child's
// element parameter when the host is not a native Solid control-flow component.
function iterableAttribute(ts, opening) {
  for (const property of opening.attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue;
    const name = property.name.getText();
    if (!RENDER_PROP_ITERABLE_ATTRIBUTES.has(name)) continue;
    if (
      property.initializer &&
      ts.isJsxExpression(property.initializer) &&
      property.initializer.expression
    ) {
      return { name, expression: property.initializer.expression };
    }
  }
  return null;
}

function renderPropBinding(ts, expression, name) {
  let fn = null;
  let paramIndex = -1;
  let current = expression.parent;
  while (current) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const index = current.parameters.findIndex((parameter) =>
        bindingCoversName(ts, parameter.name, name),
      );
      if (index >= 0) {
        fn = current;
        paramIndex = index;
        break;
      }
    }
    current = current.parent;
  }
  if (!fn) return null;
  // The callback must be the JSX child expression of an element:
  // `<Comp …>{(item) => …}</Comp>` (allowing a parenthesized body wrapper).
  let host = fn.parent;
  while (host && ts.isParenthesizedExpression(host)) host = host.parent;
  if (!host || !ts.isJsxExpression(host)) return null;
  const element = host.parent;
  if (!element || !ts.isJsxElement(element)) return null;
  const opening = element.openingElement;
  const tag = jsxTagNameText(opening.tagName);
  // Native Solid control flow (`<For each>`, `<Show when>`) names its binding via
  // a known attribute. A custom component instead receives its iterable on a
  // conventional prop (`items`/`rows`/…); bind the row element to that as if it
  // were `each`. Only components (capitalized tag) get the iterable fallback, so
  // a literal host element with an `items`-like attribute is never misread.
  const attribute = controlFlowAttribute(ts, opening);
  if (attribute) {
    return {
      attribute: attribute.name,
      expression: attribute.expression,
      paramIndex,
      tag,
    };
  }
  const isComponent = /^[A-Z]/.test(tag) || tag.includes(".");
  if (isComponent) {
    const iterable = iterableAttribute(ts, opening);
    if (iterable) {
      return {
        attribute: "each",
        expression: iterable.expression,
        paramIndex,
        tag,
      };
    }
  }
  return null;
}

// Array iteration methods whose callback's FIRST parameter is the element
// (`xs.map((item) => …)`, `xs.filter((row) => …)`). `reduce`/`reduceRight` are
// excluded because their first parameter is the accumulator, not an element.
const ARRAY_ELEMENT_CALLBACK_METHODS = new Set([
  "map",
  "filter",
  "forEach",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "some",
  "every",
  "flatMap",
]);

// A callback parameter bound to an element of the array a higher-order method is
// invoked on (`xs.map((item) => …)`, `xs.sort((left, right) => …)`). Returns the
// receiver expression and whether `name` is an element parameter, or null. This
// is the plain-JS analogue of `renderPropBinding` for Solid control flow.
function arrayCallbackBinding(ts, expression, name) {
  let fn = null;
  let paramIndex = -1;
  let current = expression.parent;
  while (current) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const index = current.parameters.findIndex((parameter) =>
        bindingCoversName(ts, parameter.name, name),
      );
      if (index >= 0) {
        fn = current;
        paramIndex = index;
        break;
      }
    }
    current = current.parent;
  }
  if (!fn) return null;
  const call = fn.parent;
  if (!call || !ts.isCallExpression(call) || !call.arguments.includes(fn)) {
    return null;
  }
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const method = callee.name.text;
  // `sort`/`toSorted` comparators take two element parameters; the element-first
  // methods take the element at index 0. Anything else is not an element binding.
  const isElement =
    (ARRAY_ELEMENT_CALLBACK_METHODS.has(method) && paramIndex === 0) ||
    ((method === "sort" || method === "toSorted") &&
      (paramIndex === 0 || paramIndex === 1));
  if (!isElement) return null;
  return { receiver: callee.expression };
}

// First control-flow attribute (`each`/`when`/`fallback`) on an opening element
// that carries a value expression, or null.
function controlFlowAttribute(ts, opening) {
  for (const property of opening.attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue;
    const name = property.name.getText();
    if (!CONTROL_FLOW_ATTRIBUTES.has(name)) continue;
    if (
      property.initializer &&
      ts.isJsxExpression(property.initializer) &&
      property.initializer.expression
    ) {
      return { name, expression: property.initializer.expression };
    }
  }
  return null;
}

function traceExpression(ts, checker, graph, expression, context) {
  const text = expression.getText();
  if (context.stack.has(expression)) {
    return sourceTrace(graph, expression, "cycle", text, true);
  }
  const nextContext = {
    ...context,
    stack: new Set([...context.stack, expression]),
  };

  if (ts.isIdentifier(expression)) {
    return traceIdentifier(ts, checker, graph, expression, nextContext);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return tracePropertyAccess(ts, checker, graph, expression, nextContext);
  }
  if (ts.isElementAccessExpression(expression)) {
    return addOperationTrace(ts, graph, "property-read", expression, [
      traceExpression(ts, checker, graph, expression.expression, nextContext),
    ]);
  }
  if (ts.isCallExpression(expression)) {
    return traceCallExpression(ts, checker, graph, expression, nextContext);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return traceObjectLiteral(ts, checker, graph, expression, nextContext);
  }
  if (ts.isConditionalExpression(expression)) {
    return addOperationTrace(ts, graph, "conditional", expression, [
      traceExpression(ts, checker, graph, expression.condition, nextContext),
      traceExpression(ts, checker, graph, expression.whenTrue, nextContext),
      traceExpression(ts, checker, graph, expression.whenFalse, nextContext),
    ]);
  }
  if (ts.isBinaryExpression(expression)) {
    return traceBinaryExpression(ts, checker, graph, expression, nextContext);
  }
  if (ts.isParenthesizedExpression(expression)) {
    return traceExpression(
      ts,
      checker,
      graph,
      expression.expression,
      nextContext,
    );
  }
  if (ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) {
    return traceExpression(
      ts,
      checker,
      graph,
      expression.expression,
      nextContext,
    );
  }
  if (ts.isTemplateExpression(expression)) {
    return addOperationTrace(
      ts,
      graph,
      "template",
      expression,
      expression.templateSpans.map((span) =>
        traceExpression(ts, checker, graph, span.expression, nextContext),
      ),
    );
  }
  if (ts.isPrefixUnaryExpression(expression)) {
    return addOperationTrace(ts, graph, "conditional", expression, [
      traceExpression(ts, checker, graph, expression.operand, nextContext),
    ]);
  }

  return sourceTrace(graph, expression, "literal", text, false);
}

function traceIdentifier(ts, checker, graph, expression, context) {
  const name = expression.text;
  // The global value-keywords are identifiers syntactically but have no
  // declaration to resolve to; treating them as sources dead-ends every path
  // that renders `x ?? undefined` (the single largest source of bogus
  // unknown-source rows). Trace them as literals, like `null`/`true`/`false`.
  if (name === "undefined" || name === "NaN" || name === "Infinity") {
    return sourceTrace(graph, expression, "literal", name, false);
  }
  // A global namespace object used as a value (`Array.from`, `Object.entries`,
  // `Math.round` — the receiver flows in as an identifier) is the platform, not
  // unresolved app state. Trace it as a constant `literal` (like `undefined`):
  // excluded from fan-out, source boundaries, and the unknown-edges report.
  // Skip when a local binding shadows the global name.
  if (
    isGlobalNamespaceName(name) &&
    !context.variables.has(name) &&
    !context.parameters.has(name)
  ) {
    return sourceTrace(graph, expression, "literal", name, false);
  }
  // Inside a helper body reached by cross-file descent, a parameter reference
  // resolves to the caller's argument trace, stitching the lineage across the
  // boundary. Checked first so it wins over the callee file's own bindings.
  if (context.paramBindings && context.paramBindings.has(name)) {
    return context.paramBindings.get(name);
  }
  const accessor = context.accessors.get(name);
  if (
    accessor &&
    identifierResolvesTo(ts, checker, expression, accessor.declaration)
  )
    return traceAccessor(ts, checker, graph, expression, accessor, context);

  const declaration = context.variables.get(name);
  if (
    declaration?.initializer &&
    declaration.initializer !== expression &&
    identifierResolvesTo(ts, checker, expression, declaration)
  ) {
    const trace = traceExpression(
      ts,
      checker,
      graph,
      declaration.initializer,
      context,
    );
    return addOperationTrace(ts, graph, "alias", expression, [trace], {
      label: name,
      detail: `= ${formatExpression(declaration.initializer.getText(), 52)}`,
    });
  }

  // A Solid control-flow component feeds its render callback through a prop:
  // `<For each={items}>{(entry) => …}</For>`. The callback parameter is not a
  // free variable — it is an element of the `each` source (or the narrowed
  // `when`/`fallback` value). Resolve that binding here so the parameter traces
  // back to the real source instead of dead-ending as `unknown-source`. Checked
  // before the bare-parameter classification because the inline callback is
  // never registered in the file-level `parameters` set.
  const renderProp = renderPropBinding(ts, expression, name);
  if (renderProp && renderProp.paramIndex === 0) {
    const source = traceExpression(
      ts,
      checker,
      graph,
      renderProp.expression,
      context,
    );
    if (renderProp.attribute === "each") {
      return addOperationTrace(ts, graph, "iteration", expression, [source], {
        label: name,
        detail: `∈ ${formatExpression(renderProp.expression.getText(), 40)}`,
      });
    }
    return addOperationTrace(ts, graph, "alias", expression, [source], {
      label: name,
      detail: `= ${formatExpression(renderProp.expression.getText(), 40)}`,
    });
  }

  // A callback parameter of a higher-order array method (`xs.map((item) => …)`,
  // `xs.sort((left, right) => …)`) is an element of the receiver array, not a
  // free variable. Trace it as an iteration of the receiver so it reaches the
  // real source instead of dead-ending as `unknown-source`.
  const arrayCallback = arrayCallbackBinding(ts, expression, name);
  if (arrayCallback) {
    const source = traceExpression(
      ts,
      checker,
      graph,
      arrayCallback.receiver,
      context,
    );
    return addOperationTrace(ts, graph, "iteration", expression, [source], {
      label: name,
      detail: `∈ ${formatExpression(arrayCallback.receiver.getText(), 40)}`,
    });
  }

  // A locally-defined function referenced as a value (`onClick={handleExport}`,
  // `fallback={renderHeader}`) — not called here, so it never reaches the call
  // path. It is a known local definition, not an unresolved identifier.
  if (
    context.functions.has(name) &&
    !context.parameters.has(name) &&
    identifierResolvesTo(ts, checker, expression, context.functions.get(name))
  ) {
    return sourceTrace(
      graph,
      expression,
      "source",
      name,
      false,
      "source",
      definitionLocationOf(ts, checker, expression, graph.root),
    );
  }
  // A value imported from another module (`import { SCOPE } from "./view"`,
  // `import { Portal } from "solid-js/web"`) is a source boundary — the value
  // enters from outside the component — not an unresolved edge. Tag it `import`
  // (known): it leaves the unknown-edges report but is still surfaced as a
  // source boundary. Checked after every local binding so a shadowing local or
  // an imported first-party helper call (handled in traceCrossFileCall) wins.
  if (
    context.imports?.has(name) &&
    !context.parameters.has(name) &&
    !context.variables.has(name)
  ) {
    return sourceTrace(
      graph,
      expression,
      "import",
      name,
      false,
      "import",
      definitionLocationOf(ts, checker, expression, graph.root),
    );
  }

  // A reference to an `enum`/`class`/`namespace` used as a value (`Emphasis.NONE`,
  // `MyClass.staticMember`) resolves to a declaration the file context does not
  // register as a variable, but it is a known constant/type boundary — not
  // unresolved app state. Trace it as a `literal` (known) so paths through an
  // enum member don't dead-end as unknown sources.
  if (!context.parameters.has(name) && !context.variables.has(name)) {
    let symbol;
    try {
      symbol = checker.getSymbolAtLocation(expression);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(symbol);
      }
    } catch {
      symbol = undefined;
    }
    const declarations = symbol?.declarations ?? [];
    if (
      declarations.length > 0 &&
      declarations.every(
        (declaration) =>
          ts.isEnumDeclaration(declaration) ||
          ts.isEnumMember(declaration) ||
          ts.isClassDeclaration(declaration) ||
          ts.isModuleDeclaration(declaration),
      )
    ) {
      return sourceTrace(graph, expression, "literal", name, false);
    }
  }

  const isParameter = context.parameters.has(name);
  const unknown = !isParameter && !declaration;
  // Track the root kind separately from the graph node kind: a bare parameter
  // object (e.g. `props`) is too coarse to be one fan-out "source", so we tag
  // it `parameter` and let property reads off it refine into concrete sources.
  const rootKind = unknown
    ? "unknown-source"
    : isParameter
      ? "parameter"
      : "source";
  return sourceTrace(
    graph,
    expression,
    unknown ? "unknown-source" : "source",
    name,
    unknown,
    rootKind,
  );
}

function traceAccessor(ts, checker, graph, expression, accessor, context) {
  const call = accessor.declaration.initializer;
  if (!call || !ts.isCallExpression(call)) {
    return sourceTrace(
      graph,
      expression,
      "solid-accessor",
      expression.getText(),
      true,
    );
  }
  if (accessor.kind === "memo") {
    const callback = call.arguments[0];
    const body = getFunctionReturnExpression(ts, callback);
    if (body) {
      const trace = traceExpression(ts, checker, graph, body, context);
      return addOperationTrace(
        ts,
        graph,
        "solid-accessor",
        expression,
        [trace],
        {
          label: `${expression.text}() memo`,
          detail: `= ${formatExpression(body.getText(), 52)}`,
        },
      );
    }
  }
  if (accessor.kind === "signal") {
    const trace = call.arguments[0]
      ? traceExpression(ts, checker, graph, call.arguments[0], context)
      : sourceTrace(
          graph,
          expression,
          "solid-accessor",
          `${expression.text}()`,
          true,
        );
    return addOperationTrace(ts, graph, "solid-accessor", expression, [trace], {
      label: `${expression.text}() signal`,
    });
  }
  return sourceTrace(
    graph,
    expression,
    "solid-accessor",
    `${expression.text}() resource`,
    true,
  );
}

function tracePropertyAccess(ts, checker, graph, expression, context) {
  const receiverTrace = traceExpression(
    ts,
    checker,
    graph,
    expression.expression,
    context,
  );
  const kind = expression.questionDotToken ? "optional-read" : "property-read";
  const operation = addOperationTrace(
    ts,
    graph,
    kind,
    expression,
    [receiverTrace],
    {
      label: expression.name.text,
    },
  );
  // Refine the first concrete property read off a bare parameter into a
  // qualified root (`props` -> `props.meta`). `props` alone is too coarse to
  // rank as one source; the property read is the value that actually fans out.
  if (
    ts.isIdentifier(expression.expression) &&
    receiverTrace.rootInfos?.length === 1 &&
    receiverTrace.rootInfos[0].kind === "parameter" &&
    receiverTrace.rootInfos[0].label === expression.expression.text
  ) {
    const qualified = `${expression.expression.text}.${expression.name.text}`;
    operation.rootInfos = [{ label: qualified, kind: "prop-read" }];
    operation.roots = [qualified];
  }
  if (expression.questionDotToken) {
    operation.defenses.push(
      defenseRecord(ts, checker, expression.expression, expression, kind),
    );
  }
  return operation;
}

// Mark a callee's catalog function as reached on a render path, so the boundary
// report only lists functions that actually participate in rendering.
function markReached(ts, checker, calleeIdent, context) {
  if (!context.crossFile) return;
  const record = resolveCatalogFn(ts, checker, calleeIdent, context.crossFile);
  if (record) context.crossFile.reached.add(record.symbol);
}

// Descend into a first-party imported helper, or return null to fall through to
// the opaque generic-call handling (imported-but-not-first-party, depth/recursion
// limits hit, no resolvable body, or helper tracing disabled).
function traceCrossFileCall(ts, checker, graph, expression, callee, context) {
  const crossFile = context.crossFile;
  if (!crossFile?.args?.traceHelpers) return null;
  // The node whose symbol identifies the callee: a bare identifier (`helper()`)
  // or a method name (`obj.method()`). Anything else (computed/element-access
  // callee) is unfollowable.
  const calleeIdent = ts.isIdentifier(expression.expression)
    ? expression.expression
    : ts.isPropertyAccessExpression(expression.expression)
      ? expression.expression.name
      : null;
  if (!calleeIdent) return null;
  // Hooks / context accessors (`useX`) are intentional feature-model boundaries,
  // not helpers to dissolve — descending into them would erase the very signal
  // the prop-relay / context-relay views rely on. Keep them opaque.
  if (/^use[A-Z]/.test(callee)) return null;
  if (context.crossDepth >= crossFile.args.maxHelperDepth) return null;

  const record = resolveCatalogFn(ts, checker, calleeIdent, crossFile);
  if (!record || !record.returnExpr) return null;
  if (context.visitedFns.has(record.symbol)) return null;
  if (crossFile.budget <= 0) return null;
  crossFile.budget -= 1;

  markReached(ts, checker, calleeIdent, context);

  // Trace the argument lineage and the helper body on a *throwaway* graph, not
  // the persistent report graph. Cross-file descent across thousands of sinks
  // would otherwise accumulate millions of nodes and exhaust memory. The step
  // data we render (label/kind/file/line, roots, packs) lives on the returned
  // trace, independent of which graph held the nodes; only graph-wide counts
  // (summary/dossier) lose the descended interior, which is an acceptable trade.
  const subGraph = createGraph(context.root);
  const paramBindings = new Map();
  record.params.forEach((parameter, index) => {
    const argument = expression.arguments[index];
    if (argument) {
      paramBindings.set(
        parameter.name,
        traceExpression(ts, checker, subGraph, argument, context),
      );
    }
  });

  const defFile = record.fnNode.getSourceFile();
  const bodyTrace = traceExpression(ts, checker, subGraph, record.returnExpr, {
    ...getFileContextCached(ts, defFile, crossFile),
    sourceFile: defFile,
    root: context.root,
    stack: new Set(),
    crossFile,
    crossDepth: context.crossDepth + 1,
    visitedFns: new Set([...context.visitedFns, record.symbol]),
    paramBindings,
  });

  // For a method call, the receiver object is part of the value's lineage
  // (`entityManager().getRelation(id)` flows from the manager too). Trace it so
  // its source is preserved alongside the descended body.
  const children = [bodyTrace];
  if (ts.isPropertyAccessExpression(expression.expression)) {
    children.push(
      traceExpression(
        ts,
        checker,
        graph,
        expression.expression.expression,
        context,
      ),
    );
  }

  return addOperationTrace(ts, graph, "call", expression, children, {
    label: callee,
    detail: `returns ${formatExpression(record.returnExpr.getText(), 52)}`,
  });
}

function traceCallExpression(ts, checker, graph, expression, context) {
  const callee = getCallName(ts, expression);
  // A control-flow render callback may receive its data as an accessor that is
  // *invoked* in the body: `<Show when={x}>{(value) => <div>{value()}</div>}`
  // (keyed Show) or `<Index each={xs}>{(item) => item().id}`. Calling the
  // parameter yields the narrowed `when` value or the iterated element, so
  // resolve the call back to that source rather than dead-ending at an opaque
  // `detailText [operation]` root.
  if (ts.isIdentifier(expression.expression)) {
    const renderProp = renderPropBinding(ts, expression.expression, callee);
    if (renderProp && renderProp.paramIndex === 0) {
      const source = traceExpression(
        ts,
        checker,
        graph,
        renderProp.expression,
        context,
      );
      if (renderProp.attribute === "each") {
        return addOperationTrace(ts, graph, "iteration", expression, [source], {
          label: callee,
          detail: `∈ ${formatExpression(renderProp.expression.getText(), 40)}`,
        });
      }
      return addOperationTrace(
        ts,
        graph,
        "solid-accessor",
        expression,
        [source],
        {
          label: `${callee}()`,
          detail: `= ${formatExpression(renderProp.expression.getText(), 40)}`,
        },
      );
    }
  }
  if (
    ts.isIdentifier(expression.expression) &&
    context.functions.has(callee) &&
    identifierResolvesTo(
      ts,
      checker,
      expression.expression,
      context.functions.get(callee),
    )
  ) {
    // Same-file helper: record that it was reached (for the boundary report) and
    // trace through its body inline, as before.
    markReached(ts, checker, expression.expression, context);
    const fn = context.functions.get(callee);
    const returnExpression = getFunctionReturnExpression(ts, fn);
    const traces = expression.arguments.map((argument) =>
      traceExpression(ts, checker, graph, argument, context),
    );
    if (returnExpression) {
      traces.push(
        traceExpression(ts, checker, graph, returnExpression, context),
      );
    }
    return addOperationTrace(ts, graph, "call", expression, traces, {
      label: callee,
      detail: returnExpression
        ? `returns ${formatExpression(returnExpression.getText(), 52)}`
        : `${callee}(${expression.arguments.length ? "…" : ""})`,
    });
  }

  if (
    ts.isIdentifier(expression.expression) &&
    context.accessors.has(callee) &&
    identifierResolvesTo(
      ts,
      checker,
      expression.expression,
      context.accessors.get(callee).declaration,
    )
  ) {
    return traceAccessor(
      ts,
      checker,
      graph,
      expression.expression,
      context.accessors.get(callee),
      context,
    );
  }

  // Cross-file descent: an imported first-party helper. Follow it into its
  // definition file, binding the call's arguments to the helper's parameters so
  // the traced lineage continues through the body (and its nodes pick up the F2
  // file/line). Bounded by --max-helper-depth and a per-branch visited set.
  const crossFileTrace = traceCrossFileCall(
    ts,
    checker,
    graph,
    expression,
    callee,
    context,
  );
  if (crossFileTrace) return crossFileTrace;

  const traces = [];
  if (ts.isPropertyAccessExpression(expression.expression)) {
    traces.push(
      traceExpression(
        ts,
        checker,
        graph,
        expression.expression.expression,
        context,
      ),
    );
  }
  traces.push(
    ...expression.arguments.map((argument) =>
      traceExpression(ts, checker, graph, argument, context),
    ),
  );
  // Distinguish genuinely-unresolved helpers from boundaries that are opaque by
  // design. Syntactic host/global/Solid calls are caught cheaply first; the
  // symbol-aware classifier then names reactive accessor reads (`props.x()`),
  // DOM/library calls, and factory-produced callables so they leave the report
  // as known boundaries instead of being flagged as unresolved. A same-file
  // function name still escapes "unknown" even if symbol resolution above
  // declined it (name collision), as before.
  const opaqueReason =
    !callee || context.functions.has(callee)
      ? null
      : isOpaqueByDesignCall(ts, expression, callee)
        ? "host-call"
        : classifyUnresolvedCall(ts, checker, expression, context.crossFile);
  const unknown = !callee || (!context.functions.has(callee) && !opaqueReason);
  return addOperationTrace(ts, graph, "call", expression, traces, {
    label: callee || "call",
    unknown,
    // The full call expression as written — for a method (`x.toUpperCase()`) or
    // an imported helper, this is the only thing that conveys what it does.
    detail: formatExpression(expression.getText(), 60),
  });
}

function traceObjectLiteral(ts, checker, graph, expression, context) {
  const traces = [];
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      traces.push(
        traceExpression(ts, checker, graph, property.expression, context),
      );
    } else if (ts.isPropertyAssignment(property)) {
      traces.push(
        traceExpression(ts, checker, graph, property.initializer, context),
      );
    } else if (ts.isShorthandPropertyAssignment(property)) {
      traces.push(traceExpression(ts, checker, graph, property.name, context));
    }
  }
  return addOperationTrace(ts, graph, "object-pack", expression, traces);
}

function traceBinaryExpression(ts, checker, graph, expression, context) {
  const operator = expression.operatorToken.kind;
  const kind =
    operator === ts.SyntaxKind.QuestionQuestionToken ||
    operator === ts.SyntaxKind.BarBarToken
      ? "fallback"
      : "conditional";
  const trace = addOperationTrace(ts, graph, kind, expression, [
    traceExpression(ts, checker, graph, expression.left, context),
    traceExpression(ts, checker, graph, expression.right, context),
  ]);
  if (operator === ts.SyntaxKind.QuestionQuestionToken) {
    trace.defenses.push(
      defenseRecord(ts, checker, expression.left, expression, "fallback"),
    );
  }
  return trace;
}

function addOperationTrace(ts, graph, kind, expression, traces, options = {}) {
  const explicit = options.label != null;
  const fullText = collapse(expression.getText());
  const nodeLabel = options.label ?? formatExpression(fullText);
  // A short gloss of what this step evaluates, for kinds whose label alone is
  // ambiguous (a helper/method/memo/alias name says nothing about its body).
  // Defaults to the full expression text for calls; explicit callers override.
  const detail = options.detail ?? null;
  // File + line of this hop, threaded onto the step so the path can show where
  // each piece of logic lives (same file vs. scattered) and an agent can grep it.
  const sourceFile = expression.getSourceFile();
  const file = relativePath(graph.root, sourceFile.fileName);
  const location = locationOf(sourceFile, expression);
  const node = addNode(graph, {
    kind,
    label: nodeLabel,
    file,
    location,
    type: safeTypeText(options.type),
  });
  const edges = [];
  const rootInfos = [];
  const defenses = [];
  const representationSteps = [];
  // Packed objects the value flows through, so sinks sharing one packed object
  // (a createMemo/object literal) can be grouped and checked for over-packing
  // (Phase 3). Identity is the object literal's *source location*, NOT the graph
  // node id: the trace graph re-traces each sink, minting a fresh node per
  // object-pack, so node ids are never shared even for the same literal.
  const packs = [];
  // Each path step carries its operation kind so the transformation ledger and
  // path renderers can name the real operation (property-read, fallback, call,
  // object-pack, …) instead of a constant placeholder.
  let winnerChild = null;
  let longest = [{ label: nodeLabel, kind, detail, file, line: location.line }];
  for (const trace of traces.filter(Boolean)) {
    addEdge(
      graph,
      trace.lastNodeId,
      node.id,
      kind,
      expression,
      options.unknown,
    );
    edges.push(...trace.edges, kind);
    rootInfos.push(
      ...(trace.rootInfos ??
        trace.roots.map((root) => ({ label: root, kind: "source" }))),
    );
    defenses.push(...trace.defenses);
    representationSteps.push(...(trace.representationSteps ?? []));
    packs.push(...(trace.packs ?? []));
    if (trace.longestPath.length + 1 > longest.length) {
      winnerChild = trace;
      longest = [
        ...trace.longestPath,
        { label: nodeLabel, kind, detail, file, line: location.line },
      ];
    }
  }
  // Re-center an inline expression's label on the sub-expression that actually
  // flows in from the previous step (the "via"), marking it with « » so long
  // compute/pack/ternary expressions show the traced piece instead of
  // truncating an unrelated front. Steps with an explicit label (calls, memos,
  // reads) already carry their own gloss and keep their name.
  if (!explicit) {
    const focused = focusSnippet(fullText, winnerChild?.headText ?? null, 90);
    longest[longest.length - 1] = {
      ...longest[longest.length - 1],
      label: focused,
    };
  }
  if (kind === "object-pack") {
    packs.push({
      key: `${file}:${location.line}:${location.column}`,
      label: nodeLabel,
    });
  }
  if (REPRESENTATION_KINDS.has(kind)) {
    representationSteps.push({
      kind,
      label: nodeLabel,
      file,
      line: location.line,
      key: `${file}:${location.line}:${location.column}`,
    });
  }
  if (traces.length === 0)
    rootInfos.push({ label: nodeLabel, kind: "operation" });
  const dedupedRoots = uniqueRootInfos(rootInfos);
  return {
    lastNodeId: node.id,
    roots: dedupedRoots.map((root) => root.label),
    rootInfos: dedupedRoots,
    edges,
    defenses,
    representationSteps,
    longestPath: longest,
    packs: uniquePacks(packs),
    // The collapsed full text of this expression, so a parent operation can mark
    // exactly which sub-expression the traced value flowed in through.
    headText: fullText,
  };
}

// Deduplicate packs by their source-location key, keeping the first label seen.
function uniquePacks(packs) {
  const seen = new Map();
  for (const pack of packs) {
    if (!seen.has(pack.key)) seen.set(pack.key, pack);
  }
  return Array.from(seen.values());
}

// Deduplicate root descriptors by label, keeping the first (most specific)
// kind seen. Sources are tracked with their node kind so reports can filter
// out literal/primitive roots that are not actionable "sources".
function uniqueRootInfos(rootInfos) {
  const seen = new Map();
  for (const info of rootInfos) {
    if (!info || !info.label) continue;
    if (!seen.has(info.label)) seen.set(info.label, info);
  }
  return Array.from(seen.values());
}

// FANOUT-DEF-1: resolve a root expression to its DEFINITION location (where the
// symbol is declared), not the use site we are currently tracing. This lets the
// fan-out graph's source node link straight to where a shared source like
// `useCommitsTableContext` is defined — the user shouldn't have to click into a
// usage and chase an import. Best-effort: returns null when the symbol is
// unresolved or only declared externally (node_modules / `.d.ts`).
function definitionLocationOf(ts, checker, expression, root) {
  let symbol;
  try {
    symbol = checker.getSymbolAtLocation(expression);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
  } catch {
    return null;
  }
  const declarations = symbol?.declarations ?? [];
  if (declarations.length === 0) return null;
  const internal = declarations.find((declaration) => {
    const file = declaration.getSourceFile();
    if (file.isDeclarationFile) return false;
    const relative = relativePath(root, file.fileName);
    return !relative.startsWith("..") && !relative.includes("node_modules/");
  });
  if (!internal) return null;
  const declFile = internal.getSourceFile();
  const position = declFile.getLineAndCharacterOfPosition(
    internal.getStart(declFile),
  );
  return {
    file: relativePath(root, declFile.fileName),
    line: position.line + 1,
  };
}

function sourceTrace(
  graph,
  expression,
  kind,
  label,
  unknown,
  rootKind = kind,
  def = null,
) {
  const sourceFile = expression.getSourceFile();
  const file = relativePath(graph.root, sourceFile.fileName);
  const location = locationOf(sourceFile, expression);
  const node = addNode(graph, {
    kind,
    label,
    file,
    location,
    type: safeTypeText(),
  });
  return {
    lastNodeId: node.id,
    roots: [label],
    rootInfos: [{ label, kind: rootKind, ...(def ? { def } : {}) }],
    edges: [],
    defenses: [],
    representationSteps: [],
    longestPath: [{ label, kind, detail: null, file, line: location.line }],
    packs: [],
    unknown,
    headText: collapse(expression.getText()),
  };
}

function buildSinkRecord(
  ts,
  checker,
  sourceFile,
  node,
  sinkExpression,
  trace,
  sinkNode,
  root,
) {
  const location = locationOf(sourceFile, node);
  // One physical guard reached via several render sub-paths is a single
  // defensive operation; dedupe before metrics so counts and the rendered list
  // reflect distinct sites, not path multiplicity.
  const distinctDefenses = dedupeDefenses(trace.defenses);
  const distinctRepresentation = dedupeByKey(trace.representationSteps ?? []);
  const metrics = metricsFor(trace, distinctDefenses, distinctRepresentation);
  const sinkId = `RPF-${String(location.line).padStart(3, "0")}-${String(location.column).padStart(2, "0")}`;
  const confidence = confidenceFor(metrics, distinctDefenses);
  return {
    id: sinkId,
    file: relativePath(root, sourceFile.fileName),
    line: location.line,
    column: location.column,
    // Exact source span of the rendered expression, so the code map can map the
    // finding to its chunk of code (not the whole line) and make adjacent
    // findings on one line independently selectable.
    span: spanOf(sourceFile, sinkExpression.expression),
    category: sinkExpression.category,
    label: sinkExpression.label,
    expression: sinkExpression.expression.getText(),
    renderContext: {
      tag: sinkExpression.jsx?.tag ?? null,
      attribute:
        sinkExpression.jsx?.attribute ??
        sinkAttributeName({ label: sinkExpression.label }),
      component: enclosingFunctionName(ts, node),
    },
    type: safeTypeText(
      checker.typeToString(
        checker.getTypeAtLocation(sinkExpression.expression),
      ),
    ),
    roots: trace.roots,
    rootInfos:
      trace.rootInfos ??
      trace.roots.map((root) => ({ label: root, kind: "source" })),
    representativePath: trace.longestPath.map((step) => step.label),
    representativeSteps: trace.longestPath.map((step) => ({
      label: step.label,
      kind: step.kind,
      detail: step.detail ?? null,
      file: step.file ?? null,
      line: step.line ?? null,
    })),
    // Distinct representation-only hops (alias/pack/spread) on this sink's
    // slice, so the report can list exactly what the churn count refers to.
    representationSteps: distinctRepresentation,
    packs: trace.packs ?? [],
    nodeId: sinkNode.id,
    metrics,
    defenses: distinctDefenses,
    confidence: confidence.score,
    confidenceReason: confidence.reason,
    confidenceRisk: confidence.risk,
    queue: queueFor(metrics, distinctDefenses),
  };
}

function metricsFor(
  trace,
  defenses = dedupeDefenses(trace.defenses),
  representationSteps = dedupeByKey(trace.representationSteps ?? []),
) {
  const edgeCounts = countBy(trace.edges);
  // Count distinct guard sites, not edge traversals: the same `??`/`?.` reached
  // through several render sub-paths is one defensive operation.
  const defensiveOperationCount = defenses.length;
  const certaintyBoundaryDefenseCount = defenses.filter((defense) =>
    isCertaintyBoundaryDefense(defense),
  ).length;
  const actionableDefensiveOperationCount = Math.max(
    0,
    defensiveOperationCount - certaintyBoundaryDefenseCount,
  );
  // Distinct representation-only hops, deduped by site (same rationale as
  // defenses) rather than counted once per render sub-path that crosses them.
  const representationChurn = representationSteps.length;
  const helperHops = edgeCounts.call ?? 0;
  const impossibleDefenseCount = defenses.filter(
    (defense) => defense.verdict === "impossible",
  ).length;
  const unknownEdgeCount = trace.edges.filter(
    (edge) => edge === "unknown",
  ).length;
  return {
    sliceSize: trace.edges.length + trace.longestPath.length,
    maximumPathDepth: trace.longestPath.length,
    helperHops,
    representationChurn,
    defensiveOperationCount,
    actionableDefensiveOperationCount,
    certaintyBoundaryDefenseCount,
    impossibleDefenseCount,
    controlDependencyCount: edgeCounts.conditional ?? 0,
    mergeWidth: trace.roots.length,
    // True downstream reach is a whole-report property (how many sinks this
    // sink's sources also feed), so it cannot be known from a single trace.
    // Seeded to 1 here and filled in by groundReachability once all sinks exist.
    reachableSinks: 1,
    repeatedNormalization: Math.max(0, actionableDefensiveOperationCount - 1),
    unknownEdgeCount,
    packFamilyDiversity: 0,
    packRisk: 0,
    suspiciousPackCount: 0,
  };
}

export function isCertaintyBoundaryDefense(defense) {
  return /parser-boundary|compatibility|optional|solid prop default|api-choice/i.test(
    defense.origin ?? "",
  );
}

function defenseRecord(ts, checker, guardedExpression, node, operation) {
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

// Collapse defenses that refer to the same physical guard site (the trace
// re-walks shared sub-paths, so one `props.size ?? 32` can appear many times).
// First occurrence wins; order is preserved.
function dedupeDefenses(defenses) {
  return dedupeByKey(
    defenses,
    (defense) =>
      defense.key ?? `${defense.location?.line}:${defense.expression}`,
  );
}

// Generic first-wins, order-preserving dedupe over a `.key` (or a supplied key
// function). Used to collapse trace artifacts (defenses, representation hops)
// that the per-sink re-trace can visit through multiple sub-paths.
function dedupeByKey(items, keyOf = (item) => item.key) {
  const seen = new Set();
  const distinct = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(item);
  }
  return distinct;
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

function classifyAttribute(name) {
  if (["class", "className", "style"].includes(name)) return "style";
  if (["when", "each"].includes(name)) return "render-control";
  return "attribute";
}

// Confidence as a score plus a plain-English reason and risk (Phase 4). The
// numeric `score` preserves the prior return value so ranking/queueing are
// unchanged; reason/risk explain it in human terms for the report.
function confidenceFor(metrics, defenses) {
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
function findingSentence(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) {
    return "A nullish fallback or optional access is unreachable under the checked TypeScript program.";
  }
  return "This rendered value has more data-flow plumbing than nearby JSX should usually need.";
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function safeTypeText(value = "") {
  return value || "unknown";
}
