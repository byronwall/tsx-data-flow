import type * as TypeScript from "typescript";
import type { AccessorRecord, AnalysisGraph, TraceContext, TraceExpressionFn } from "../types";
import { isGlobalNamespaceName } from "./source-call-classification";
import { arrayCallbackBinding, renderPropBinding } from "./source-sinks";
import { getFunctionReturnExpressions, identifierResolvesTo, resolvedAccessorFor } from "./trace-support";
import { formatExpression } from "../reports/format-helpers";
import { resourceBoundaryIdentity } from "./route-data-resource";
import {
  addOperationTrace,
  definitionLocationOf,
  sourceTrace,
} from "./source-trace-records";
import { contextDestructuredBinding } from "./semantic-context";

export function traceIdentifier(ts: typeof TypeScript, checker: TypeScript.TypeChecker, graph: AnalysisGraph, expression: TypeScript.Identifier, context: TraceContext, traceExpression: TraceExpressionFn) {
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
  if (context.paramBindings && context.paramBindings.has(name) && isParameterReference(ts, checker, expression)) {
    return context.paramBindings.get(name)!;
  }
  const accessor = resolvedAccessorFor(ts, checker, expression, context.accessors);
  if (
    accessor &&
    identifierResolvesTo(ts, checker, expression, accessor.declaration)
  )
    return traceAccessor(ts, checker, graph, expression, accessor, context, traceExpression);

  const destructured = contextDestructuredBinding(ts, checker, context.root, expression);
  if (destructured) {
    const base = traceExpression(ts, checker, graph, destructured.declaration.initializer!, context);
    return addOperationTrace(ts, graph, "context-destructure", expression, [base], {
      label: name,
      contextIdentity: destructured.identity,
      contextMember: destructured.member,
    });
  }

  const declaration = resolvedVariableDeclaration(ts, checker, expression, context.variables.get(name));
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
  const localFunction = context.functions.get(name);
  if (
    localFunction &&
    !context.parameters.has(name) &&
    identifierResolvesTo(ts, checker, expression, localFunction)
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
        (declaration: TypeScript.Declaration) =>
          ts.isEnumDeclaration(declaration) ||
          ts.isEnumMember(declaration) ||
          ts.isClassDeclaration(declaration) ||
          ts.isModuleDeclaration(declaration),
      )
    ) {
      return sourceTrace(graph, expression, "literal", name, false);
    }
  }

  // FileTraceContext keeps a fast name index, but parameter names are not
  // unique across functions. Confirm the actual symbol here so a local
  // `const color = ...` is never treated as some other function's `color`
  // parameter and promoted to a bogus `color.hue` prop root.
  const isParameter = isParameterReference(ts, checker, expression);
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

function resolvedVariableDeclaration(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Identifier, indexed: TypeScript.VariableDeclaration | undefined) {
  if (indexed && identifierResolvesTo(ts, checker, expression, indexed)) return indexed;
  try {
    const declaration = checker.getSymbolAtLocation(expression)?.valueDeclaration;
    return declaration && ts.isVariableDeclaration(declaration) ? declaration : indexed;
  } catch {
    return indexed;
  }
}

function isParameterReference(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Identifier) {
  try {
    const symbol = checker.getSymbolAtLocation(expression);
    return Boolean(symbol?.declarations?.some((declaration: TypeScript.Declaration) => ts.isParameter(declaration)));
  } catch {
    return false;
  }
}

export function traceAccessor(ts: typeof TypeScript, checker: TypeScript.TypeChecker, graph: AnalysisGraph, expression: TypeScript.Identifier, accessor: AccessorRecord, context: TraceContext, traceExpression: TraceExpressionFn) {
  if (accessor.kind === "action") {
    return sourceTrace(
      graph,
      expression,
      "solid-action",
      `${expression.text}() action`,
      false,
    );
  }
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
    const returned = callback && ts.isFunctionLike(callback)
      ? getFunctionReturnExpressions(ts, callback)
      : [];
    if (returned.length) {
      const traces = returned.map((body) => traceExpression(ts, checker, graph, body, context));
      return addOperationTrace(
        ts,
        graph,
        "solid-accessor",
        expression,
        traces,
        {
          label: `${expression.text}() memo`,
          detail: returned.length === 1
            ? `= ${formatExpression(returned[0].getText(), 52)}`
            : `${returned.length} return branches`,
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
    "solid-accessor",
    null,
    resourceBoundaryIdentity(graph.root, accessor.declaration),
  );
}
