import type * as TypeScript from "typescript";
import type { ParamObjectBinding, TraceContext } from "../types";

export function resolveBoundObjectProperty(
  ts: typeof TypeScript,
  expression: TypeScript.PropertyAccessExpression,
  context: TraceContext,
): { expression: TypeScript.Expression; context: TraceContext } | null {
  const path: string[] = [];
  let receiver: TypeScript.Expression = expression;
  while (ts.isPropertyAccessExpression(receiver)) {
    path.unshift(receiver.name.text);
    receiver = receiver.expression;
  }
  if (!ts.isIdentifier(receiver)) return null;

  const binding = context.paramObjectBindings?.get(receiver.text);
  if (!binding) return null;

  const resolved = propertyAtPath(ts, binding, path);
  return resolved
    ? { expression: resolved, context: binding.callerContext }
    : null;
}

function propertyAtPath(
  ts: typeof TypeScript,
  binding: ParamObjectBinding,
  path: string[],
): TypeScript.Expression | null {
  let current: TypeScript.Expression = binding.expression;
  for (const name of path) {
    if (!ts.isObjectLiteralExpression(current)) return null;
    const property = current.properties.find((candidate) =>
      propertyName(ts, candidate) === name
    );
    if (!property) return null;
    if (ts.isPropertyAssignment(property)) {
      current = property.initializer;
    } else if (ts.isShorthandPropertyAssignment(property)) {
      current = property.name;
    } else {
      return null;
    }
  }
  return current;
}

function propertyName(
  ts: typeof TypeScript,
  property: TypeScript.ObjectLiteralElementLike,
) {
  if (
    (ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property)) &&
    ts.isIdentifier(property.name)
  ) {
    return property.name.text;
  }
  if (
    ts.isPropertyAssignment(property) &&
    (ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name))
  ) {
    return property.name.text;
  }
  return null;
}
