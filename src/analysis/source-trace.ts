import type * as TypeScript from "typescript";
import type { AnalysisGraph, TraceContext, TraceResult } from "../types";
import { createGraph } from "./graph";
import {
  classifyUnresolvedCall,
  isOpaqueByDesignCall,
} from "./source-call-classification";
import { defenseRecord } from "./source-defenses";
import { renderPropBinding } from "./source-sinks";
import {
  getCallName,
  getFileContextCached,
  getFunctionReturnExpressions,
  identifierResolvesTo,
  resolveCatalogFn,
  resolvedAccessorFor,
} from "./trace-support";
import { formatExpression } from "../reports/format-helpers";
import {
  addOperationTrace,
  annotateTraceContext,
  sourceTrace,
} from "./source-trace-records";
import { traceAccessor, traceIdentifier } from "./source-trace-identifiers";
import { resolveBoundObjectProperty } from "./source-trace-object-bindings";
import { materializeBoundaryRootTraces, traceBoundAccessorCall } from "./source-trace-bound-accessors";
import {
  contextMemberName,
  contextIdentityForHookCall,
  contextProviderIdentityForObject,
} from "./semantic-context";

export function traceExpression(ts: typeof TypeScript, checker: TypeScript.TypeChecker, graph: AnalysisGraph, expression: TypeScript.Expression, context: TraceContext): TraceResult {
  const text = expression.getText();
  if (context.stack.has(expression)) {
    return sourceTrace(graph, expression, "cycle", text, true);
  }
  const nextContext = {
    ...context,
    stack: new Set([...context.stack, expression]),
  };

  if (ts.isIdentifier(expression)) {
    return traceIdentifier(
      ts,
      checker,
      graph,
      expression,
      nextContext,
      traceExpression,
    );
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
  if (ts.isNewExpression(expression)) {
    return addOperationTrace(
      ts,
      graph,
      "call",
      expression,
      (expression.arguments ?? []).map((argument) =>
        traceExpression(ts, checker, graph, argument, nextContext),
      ),
      {
        label: `new ${formatExpression(expression.expression.getText(), 36)}`,
        detail: formatExpression(expression.getText(), 60),
      },
    );
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

function tracePropertyAccess(ts: typeof TypeScript, checker: TypeScript.TypeChecker, graph: AnalysisGraph, expression: TypeScript.PropertyAccessExpression, context: TraceContext) {
  const boundProperty = resolveBoundObjectProperty(ts, expression, context);
  const receiverTrace = boundProperty
    ? traceExpression(
        ts,
        checker,
        graph,
        boundProperty.expression,
        boundProperty.context,
      )
    : traceExpression(
        ts,
        checker,
        graph,
        expression.expression,
        context,
      );
  const kind = expression.questionDotToken ? "optional-read" : "property-read";
  const resourceBoundaryId = resourceBoundaryForTrace(receiverTrace, graph);
  const contextOptions = contextOptionsForTrace(receiverTrace, expression.name.text);
  const operation = addOperationTrace(
    ts,
    graph,
    kind,
    expression,
    [receiverTrace],
    {
      label: expression.name.text,
      boundaryId: resourceBoundaryId ?? undefined,
      ...contextOptions,
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
function markReached(ts: typeof TypeScript, checker: TypeScript.TypeChecker, calleeIdent: TypeScript.Identifier, context: TraceContext) {
  if (!context.crossFile) return;
  const record = resolveCatalogFn(ts, checker, calleeIdent, context.crossFile);
  if (record) context.crossFile.reached.add(record.symbol);
}

// Descend into a first-party imported helper, or return null to fall through to
// the opaque generic-call handling (imported-but-not-first-party, depth/recursion
// limits hit, no resolvable body, or helper tracing disabled).
function traceCrossFileCall(ts: typeof TypeScript, checker: TypeScript.TypeChecker, graph: AnalysisGraph, expression: TypeScript.CallExpression, callee: string, context: TraceContext): TraceResult | null {
  const crossFile = context.crossFile;
  if (!crossFile?.args?.traceHelpers) return null;
  // The node whose symbol identifies the callee: a bare identifier (`helper()`)
  // or a method name (`obj.method()`). Anything else (computed/element-access
  // callee) is unfollowable.
  const calleeIdent = ts.isIdentifier(expression.expression)
    ? expression.expression
    : ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.name)
      ? expression.expression.name
      : null;
  if (!calleeIdent) return null;
  // Hooks / context accessors (`useX`) are intentional feature-model boundaries,
  // not helpers to dissolve — descending into them would erase the very signal
  // the prop-relay / context-relay views rely on. Keep them opaque.
  if (/^use[A-Z]/.test(callee)) return null;
  if (context.crossDepth >= crossFile.args.maxHelperDepth) return null;

  const record = resolveCatalogFn(ts, checker, calleeIdent, crossFile);
  const returned = record?.returnExprs ?? [];
  if (!record || !returned.length) return null;
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
  subGraph.nextNodeId = -1;
  subGraph.nextEdgeId = -1;
  const paramBindings = new Map();
  const paramObjectBindings = new Map();
  const resourceArgumentTraces: TraceResult[] = [];
  record.params.forEach((parameter, index: number) => {
    const argument = expression.arguments[index];
    if (argument) {
      // Binding one large options object to every `options.foo` read repeatedly
      // copies the lineage of every sibling field and grows combinatorially.
      // Keep object literals lazy so property reads trace only the supplied
      // field they actually consume.
      if (ts.isObjectLiteralExpression(argument)) {
        paramObjectBindings.set(parameter.name, {
          expression: argument,
          callerContext: context,
        });
      } else {
        const callbackReturns = (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
          && argument.parameters.length === 0
          ? getFunctionReturnExpressions(ts, argument)
          : [];
        const argumentTrace = callbackReturns.length
          ? addOperationTrace(
              ts,
              subGraph,
              "solid-accessor",
              argument,
              callbackReturns.map((value) => traceExpression(ts, checker, subGraph, value, context)),
              { label: `${parameter.name}() callback` },
            )
          : traceExpression(ts, checker, subGraph, argument, context);
        paramBindings.set(parameter.name, argumentTrace);
        if (argumentTrace.steps.some((step) =>
          step.graphNodeId && subGraph.nodeById.get(step.graphNodeId)?.boundaryId?.startsWith("resource:")
        )) resourceArgumentTraces.push(traceExpression(ts, checker, graph, argument, context));
      }
    }
  });

  const defFile = record.fnNode.getSourceFile();
  const bodyTraces = returned.map((returnExpression) =>
    traceExpression(ts, checker, subGraph, returnExpression, {
        ...getFileContextCached(ts, defFile, crossFile, record.checker ?? checker),
      sourceFile: defFile,
      root: context.root,
      stack: new Set(),
      crossFile,
      crossDepth: context.crossDepth + 1,
      visitedFns: new Set([...context.visitedFns, record.symbol]),
      paramBindings,
      paramObjectBindings,
    })
  );

  // For a method call, the receiver object is part of the value's lineage
  // (`entityManager().getRelation(id)` flows from the manager too). Trace it so
  // its source is preserved alongside the descended body.
  const children = [
    ...bodyTraces.flatMap((trace) => materializeBoundaryRootTraces(trace, graph)),
    ...resourceArgumentTraces,
  ];
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
    detail: returned.length === 1
      ? `returns ${formatExpression(returned[0].getText(), 52)}`
      : `${returned.length} return branches`,
  });
}

function traceCallExpression(ts: typeof TypeScript, checker: TypeScript.TypeChecker, graph: AnalysisGraph, expression: TypeScript.CallExpression, context: TraceContext): TraceResult {
  const callee = getCallName(ts, expression);
  const contextIdentity = contextIdentityForHookCall(ts, checker, context.root, expression);
  if (contextIdentity) {
    return addOperationTrace(ts, graph, "call", expression, [], {
      label: callee || "context hook",
      contextIdentity,
    });
  }
  const parameterBinding = ts.isIdentifier(expression.expression)
    && context.parameters.has(callee)
    ? context.paramBindings?.get(callee)
    : null;
  if (parameterBinding) {
    return addOperationTrace(ts, graph, "solid-accessor", expression, [parameterBinding], {
      label: `${callee}() bound accessor`,
    });
  }
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
  const boundAccessor = traceBoundAccessorCall(ts, checker, graph, expression, context, traceExpression);
  if (boundAccessor) return boundAccessor;
  const localFunction = context.functions.get(callee);
  let localFunctionSymbol: TypeScript.Symbol | undefined;
  if (ts.isIdentifier(expression.expression)) {
    try { localFunctionSymbol = checker.getSymbolAtLocation(expression.expression); } catch { localFunctionSymbol = undefined; }
  }
  if (
    ts.isIdentifier(expression.expression) &&
    localFunction &&
    (!localFunctionSymbol || !context.visitedFns.has(localFunctionSymbol)) &&
    identifierResolvesTo(
      ts,
      checker,
      expression.expression,
      localFunction,
    )
  ) {
    // Same-file helper: record that it was reached (for the boundary report) and
    // trace through its body inline, as before.
    markReached(ts, checker, expression.expression, context);
    const returnExpressions = getFunctionReturnExpressions(ts, localFunction);
    const traces = expression.arguments.map((argument) =>
      traceExpression(ts, checker, graph, argument, context),
    );
    if (returnExpressions.length) {
      const paramBindings = new Map();
      localFunction.parameters.forEach((parameter, index: number) => {
        const argumentTrace = traces[index];
        if (ts.isIdentifier(parameter.name) && argumentTrace) paramBindings.set(parameter.name.text, argumentTrace);
      });
      traces.push(...returnExpressions.map((returnExpression) =>
        traceExpression(ts, checker, graph, returnExpression, {
          ...context,
          paramBindings,
          visitedFns: localFunctionSymbol ? new Set([...context.visitedFns, localFunctionSymbol]) : context.visitedFns,
        })
      ));
    }
    return addOperationTrace(ts, graph, "call", expression, traces, {
      label: callee,
      detail: returnExpressions.length === 1
        ? `returns ${formatExpression(returnExpressions[0].getText(), 52)}`
        : returnExpressions.length > 1
          ? `${returnExpressions.length} return branches`
        : `${callee}(${expression.arguments.length ? "…" : ""})`,
    });
  }

  const accessor = ts.isIdentifier(expression.expression)
    ? resolvedAccessorFor(ts, checker, expression.expression, context.accessors)
    : null;
  if (
    ts.isIdentifier(expression.expression) &&
    accessor &&
    identifierResolvesTo(
      ts,
      checker,
      expression.expression,
      accessor.declaration,
    )
  ) {
    return traceAccessor(
      ts,
      checker,
      graph,
      expression.expression,
      accessor,
      context,
      traceExpression,
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

  const traces: TraceResult[] = [];
  let callContext: { contextIdentity?: string; contextMember?: string | null } = {};
  let callBoundaryId: string | undefined;
  if (ts.isPropertyAccessExpression(expression.expression)) {
    const receiverTrace = traceExpression(ts, checker, graph, expression.expression.expression, context);
    traces.push(receiverTrace);
    callContext = contextOptionsForTrace(receiverTrace, expression.expression.name.text);
    callBoundaryId = resourceBoundaryForTrace(receiverTrace, graph) ?? undefined;
  }
  traces.push(
    ...expression.arguments.map((argument, index) =>
      index === 0
        && ["map", "flatMap"].includes(callee)
        && ts.isNewExpression(expression.parent)
        && expression.parent.arguments?.includes(expression)
        && (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
        ? traceProjectionCallback(ts, checker, graph, argument, context)
        : traceExpression(ts, checker, graph, argument, context),
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
    propName: callableComponentProp(ts, checker, expression),
    boundaryId: callBoundaryId,
    ...callContext,
    // The full call expression as written — for a method (`x.toUpperCase()`) or
    // an imported helper, this is the only thing that conveys what it does.
    detail: formatExpression(expression.getText(), 60),
  });
}

function traceProjectionCallback(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  graph: AnalysisGraph,
  expression: TypeScript.ArrowFunction | TypeScript.FunctionExpression,
  context: TraceContext,
) {
  const returned = getFunctionReturnExpressions(ts, expression);
  const traces = returned.map((returnedExpression) =>
    ts.isArrayLiteralExpression(returnedExpression)
      ? addOperationTrace(
          ts,
          graph,
          "array-pack",
          returnedExpression,
          returnedExpression.elements.flatMap((element) =>
            ts.isExpression(element)
              ? [traceExpression(ts, checker, graph, element, context)]
              : [],
          ),
        )
      : traceExpression(ts, checker, graph, returnedExpression, context),
  );
  return addOperationTrace(ts, graph, "callback", expression, traces, {
    label: "projection callback",
    detail: returned.length === 1
      ? `returns ${formatExpression(returned[0].getText(), 52)}`
      : `${returned.length} return branches`,
  });
}

function callableComponentProp(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.CallExpression) {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression)) return undefined;
  const receiver = expression.expression.expression;
  if (receiver.text !== "props") return undefined;
  try {
    const symbol = checker.getSymbolAtLocation(receiver);
    if (!symbol?.declarations?.some((declaration) => ts.isParameter(declaration))) return undefined;
  } catch {
    return undefined;
  }
  return expression.expression.name.text;
}

function traceObjectLiteral(ts: typeof TypeScript, checker: TypeScript.TypeChecker, graph: AnalysisGraph, expression: TypeScript.ObjectLiteralExpression, context: TraceContext): TraceResult {
  const traces: TraceResult[] = [];
  const providerIdentity = contextProviderIdentityForObject(ts, checker, context.root, expression);
  for (const property of expression.properties) {
    const member = providerIdentity ? contextMemberName(ts, property) : null;
    let trace: TraceResult | null = null;
    if (ts.isSpreadAssignment(property)) {
      trace = traceExpression(ts, checker, graph, property.expression, context);
    } else if (ts.isPropertyAssignment(property)) {
      trace = traceObjectProperty(ts, checker, graph, property.initializer, context, member);
    } else if (ts.isShorthandPropertyAssignment(property)) {
      trace = traceExpression(ts, checker, graph, property.name, context);
    }
    if (trace && providerIdentity && member) traces.push(annotateTraceContext(trace, graph, { identity: providerIdentity, member }));
    else if (trace) traces.push(trace);
  }
  return addOperationTrace(ts, graph, "object-pack", expression, traces);
}

function traceObjectProperty(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  graph: AnalysisGraph,
  expression: TypeScript.Expression,
  context: TraceContext,
  member: string | null,
) {
  if ((ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) && expression.parameters.length === 0) {
    const returned = getFunctionReturnExpressions(ts, expression);
    if (returned.length) {
      return addOperationTrace(ts, graph, "solid-accessor", expression, returned.map((value) => traceExpression(ts, checker, graph, value, context)), {
        label: `${member ?? "value"}() callback`,
      });
    }
  }
  return traceExpression(ts, checker, graph, expression, context);
}

function traceBinaryExpression(ts: typeof TypeScript, checker: TypeScript.TypeChecker, graph: AnalysisGraph, expression: TypeScript.BinaryExpression, context: TraceContext) {
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

function resourceBoundaryForTrace(trace: TraceResult, graph: AnalysisGraph) {
  const ids = [...new Set(trace.steps
    .map((step) => step.graphNodeId ? graph.nodeById.get(step.graphNodeId)?.boundaryId : undefined)
    .filter((id): id is string => Boolean(id?.startsWith("resource:"))))];
  return ids.length === 1 ? ids[0] : null;
}

function contextOptionsForTrace(trace: TraceResult, member: string) {
  const lineages = trace.contextLineages ?? [];
  const identities = [...new Set(lineages.map((lineage) => lineage.identity))];
  if (identities.length !== 1) return {};
  const members = [...new Set(lineages.filter((lineage) => lineage.identity === identities[0]).map((lineage) => lineage.member))];
  if (members.length > 1) return {};
  return {
    contextIdentity: identities[0],
    contextMember: members[0] ?? member,
  };
}
