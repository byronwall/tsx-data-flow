import type * as TypeScript from "typescript";
import type { AnalysisGraph, TraceContext, TraceExpressionFn, TraceResult } from "../types";
import { formatExpression } from "../reports/format-helpers";
import { addNode } from "./graph";
import { resolveBoundObjectProperty } from "./source-trace-object-bindings";
import { addOperationTrace } from "./source-trace-records";
import { getCallName, getFunctionReturnExpressions } from "./trace-support";

export function traceBoundAccessorCall(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  graph: AnalysisGraph,
  expression: TypeScript.CallExpression,
  context: TraceContext,
  traceExpression: TraceExpressionFn,
) {
  if (!ts.isPropertyAccessExpression(expression.expression)) return null;
  let property = expression.expression;
  let propertyContext = context;
  const visited = new Set<TypeScript.Node>();
  while (!visited.has(property)) {
    visited.add(property);
    const bound = resolveBoundObjectProperty(ts, property, propertyContext);
    if (!bound) return null;
    if (ts.isArrowFunction(bound.expression) || ts.isFunctionExpression(bound.expression)) {
      if (bound.expression.parameters.length) return null;
      const returned = getFunctionReturnExpressions(ts, bound.expression);
      if (!returned.length) return null;
      return addOperationTrace(
        ts,
        graph,
        "solid-accessor",
        expression,
        returned.map((value) => traceExpression(ts, checker, graph, value, bound.context)),
        {
          label: `${getCallName(ts, expression)}() accessor`,
          detail: returned.length === 1
            ? `= ${formatExpression(returned[0].getText(), 52)}`
            : `${returned.length} return branches`,
        },
      );
    }
    if (!ts.isPropertyAccessExpression(bound.expression)) return null;
    property = bound.expression;
    propertyContext = bound.context;
  }
  return null;
}

export function materializeBoundaryRootTraces(
  trace: TraceResult,
  graph: AnalysisGraph,
): TraceResult[] {
  const propRoots = trace.rootInfos.filter((root) => root.kind === "prop-read" && root.label.startsWith("props."));
  const contextRoots = [...new Map(
    trace.steps
      .filter((step) => step.kind === "call" && /^use[A-Z]/.test(step.label))
      .map((step) => [`${step.file}:${step.line}:${step.label}`, step]),
  ).values()];
  if (!propRoots.length && !contextRoots.length) return [trace];
  const materializedProps = propRoots.map((root) => {
    const prop = root.label.slice("props.".length).split(".")[0];
    const evidence = [...trace.steps].reverse().find((step) =>
      step.kind === "property-read" && (step.label === prop || step.label === root.label)
    );
    const line = evidence?.line ?? root.def?.line;
    const node = addNode(graph, {
      kind: "property-read",
      label: root.label,
      snippet: root.label,
      file: evidence?.file ?? root.def?.file,
      location: line ? { line, column: 1 } : null,
      type: "unknown",
    });
    return { ...trace, lastNodeId: node.id };
  });
  const materializedContexts = contextRoots.map((step) => {
    const node = addNode(graph, {
      kind: "call",
      label: step.label,
      snippet: step.label.endsWith(")") ? step.label : `${step.label}()`,
      file: step.file ?? undefined,
      location: step.line ? { line: step.line, column: 1 } : null,
      type: "unknown",
    });
    return { ...trace, lastNodeId: node.id };
  });
  return [...materializedProps, ...materializedContexts];
}
