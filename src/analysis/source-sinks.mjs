import { CONTROL_FLOW_ATTRIBUTES } from "./sink-shape.mjs";
import { collapse, formatExpression } from "../reports/format-helpers.mjs";

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

export function getSinkExpression(ts, node) {
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

export function enclosingFunctionName(ts, node) {
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

export function renderPropBinding(ts, expression, name) {
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
export function arrayCallbackBinding(ts, expression, name) {
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

function classifyAttribute(name) {
  if (["class", "className", "style"].includes(name)) return "style";
  if (["when", "each"].includes(name)) return "render-control";
  return "attribute";
}
