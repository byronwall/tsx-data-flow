import path from "node:path";
import * as TypeScript from "typescript";
import type {
  ProgramEvidenceLocation,
  ProgramRelationKind,
} from "./program-evidence";
import {
  asFunctionLike,
  calleeName,
  callOperation,
  isFileOperation,
  isResourceFactory,
  proof,
  unwrap,
} from "./program-evidence-support";

type FunctionInfo = {
  id: string;
  name: string;
  declaration: TypeScript.FunctionLikeDeclaration;
};

type CallInfo = {
  node: TypeScript.CallExpression | TypeScript.NewExpression;
  id: string;
  target: FunctionInfo | null;
};
type CallExpressionInfo = CallInfo & { node: TypeScript.CallExpression };

type CarrierContext = {
  ts: typeof TypeScript;
  checker: TypeScript.TypeChecker;
  root: string;
  files: readonly TypeScript.SourceFile[];
  calls: readonly CallInfo[];
  symbolId: (node: TypeScript.Node) => string | null;
  moduleFor: (node: TypeScript.Node) => string | null;
  elementFor: (node: TypeScript.Node, kind: string) => string | null;
  targetFunction: (node: TypeScript.Node) => FunctionInfo | null;
  functionForNode: (node: TypeScript.Node) => FunctionInfo | null;
  location: (node: TypeScript.Node) => ProgramEvidenceLocation;
  addRelation: (
    from: string,
    to: string,
    kind: ProgramRelationKind,
    locations: ProgramEvidenceLocation[],
    proofValue: ReturnType<typeof proof>,
    confidence: "proven" | "partial",
  ) => void;
};

type ProviderMember = {
  contextSymbolId: string;
  provider: TypeScript.JsxOpeningLikeElement;
  member: TypeScript.PropertyAssignment;
  sourceField: TypeScript.PropertyAccessExpression;
};

type ContextRead = {
  contextSymbolId: string;
  call: TypeScript.CallExpression;
  function: FunctionInfo;
};

type ShowRenderProp = {
  show: TypeScript.JsxOpeningLikeElement;
  when: TypeScript.JsxAttribute;
  renderProp: TypeScript.ArrowFunction;
};

const CARRIER: ProgramRelationKind = "carrier";

/**
 * Add only syntax- and compiler-backed carrier edges.
 *
 * These edges are deliberately separate from ordinary references. They name
 * the few bounded adapters that may carry an origin before a field exists.
 */
export function collectProgramEvidenceCarriers(context: CarrierContext): void {
  const calls: CallExpressionInfo[] = context.calls.filter((item): item is CallExpressionInfo =>
    context.ts.isCallExpression(item.node));
  const variables: TypeScript.VariableDeclaration[] = [];
  const returns: TypeScript.ReturnStatement[] = [];
  const providers: ProviderMember[] = [];
  const contextReads: ContextRead[] = [];
  const allCallsByNode = new Map(calls.map((item) => [item.node, item]));

  for (const file of context.files) {
    context.ts.forEachChild(file, (node) => collectSyntax(context, node, variables, returns, providers, contextReads));
  }

  collectJsonParseCarriers(context, calls);
  collectMigrationCarriers(context, calls, variables);
  collectSnapshotReturnCarriers(context, variables, returns, calls);
  collectResponseBodyCarriers(context, calls, allCallsByNode);
  collectFetchResponseCarriers(context, calls, variables);
  collectResourceResultCarriers(context, variables, calls);
  collectContextMemberCarriers(context, providers, contextReads, variables, calls);
}

function collectSyntax(
  context: CarrierContext,
  node: TypeScript.Node,
  variables: TypeScript.VariableDeclaration[],
  returns: TypeScript.ReturnStatement[],
  providers: ProviderMember[],
  contextReads: ContextRead[],
): void {
  if (context.ts.isVariableDeclaration(node)) variables.push(node);
  if (context.ts.isReturnStatement(node)) returns.push(node);
  if (context.ts.isJsxElement(node) || context.ts.isJsxSelfClosingElement(node)) {
    collectProviderMember(context, node, providers);
  }
  if (context.ts.isCallExpression(node)) collectContextRead(context, node, contextReads);
  context.ts.forEachChild(node, (child) => collectSyntax(context, child, variables, returns, providers, contextReads));
}

function collectProviderMember(
  context: CarrierContext,
  node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement,
  providers: ProviderMember[],
): void {
  const opening = context.ts.isJsxElement(node) ? node.openingElement : node;
  if (!context.ts.isPropertyAccessExpression(opening.tagName) || opening.tagName.name.text !== "Provider") return;
  const contextSymbolId = context.symbolId(opening.tagName.expression);
  if (!contextSymbolId) return;
  const value = opening.attributes.properties.find((attribute): attribute is TypeScript.JsxAttribute =>
    context.ts.isJsxAttribute(attribute)
    && context.ts.isIdentifier(attribute.name)
    && attribute.name.text === "value"
    && Boolean(attribute.initializer),
  );
  if (!value || !value.initializer || !context.ts.isJsxExpression(value.initializer) || !value.initializer.expression) return;
  const expression = unwrap(context.ts, value.initializer.expression);
  if (!context.ts.isObjectLiteralExpression(expression)) return;
  if (expression.properties.some((property) =>
    context.ts.isSpreadAssignment(property)
    || (property.name && context.ts.isComputedPropertyName(property.name)),
  )) return;
  const member = expression.properties.find((property) =>
    context.ts.isPropertyAssignment(property)
    && property.name
    && property.name.getText(expression.getSourceFile()).replace(/["']/g, "") === "snapshot",
  );
  if (!member || !context.ts.isPropertyAssignment(member)) return;
  const initializer = unwrap(context.ts, member.initializer);
  if (!context.ts.isArrowFunction(initializer) || !initializer.body || !context.ts.isExpression(initializer.body)) return;
  const sourceField = unwrap(context.ts, initializer.body);
  if (!context.ts.isPropertyAccessExpression(sourceField) || sourceField.name.text !== "latest") return;
  if (!context.ts.isIdentifier(sourceField.expression)) return;
  if (!context.symbolId(sourceField.expression)) return;
  providers.push({ contextSymbolId, provider: opening, member, sourceField });
}

function collectContextRead(
  context: CarrierContext,
  node: TypeScript.CallExpression,
  reads: ContextRead[],
): void {
  if (calleeName(context.ts, node.expression) !== "useContext" || context.moduleFor(node.expression) !== "solid-js") return;
  const argument = node.arguments.length === 1 ? unwrap(context.ts, node.arguments[0]) : null;
  if (!argument || !context.ts.isIdentifier(argument)) return;
  const contextSymbolId = context.symbolId(argument);
  const functionInfo = nearestFunction(context, node);
  if (!contextSymbolId || !functionInfo) return;
  reads.push({ contextSymbolId, call: node, function: functionInfo });
}

function collectJsonParseCarriers(context: CarrierContext, calls: readonly CallExpressionInfo[]): void {
  for (const parse of calls) {
    if (calleeName(context.ts, parse.node.expression) !== "JSON.parse" || callOperation(context.ts, context.checker, parse.node) !== "parse") continue;
    if (!context.symbolId(parse.node.expression)) continue;
    const argument = parse.node.arguments.length === 1 ? parse.node.arguments[0] : null;
    const awaited = argument && context.ts.isAwaitExpression(argument) ? argument.expression : null;
    if (!awaited || !context.ts.isCallExpression(awaited)) continue;
    const module = context.moduleFor(awaited.expression);
    const name = calleeName(context.ts, awaited.expression);
    if (!isFileOperation(module, name, "read") || !context.symbolId(awaited.expression)) continue;
    const readId = context.elementFor(awaited, "call");
    if (!readId) continue;
    addCarrier(context, readId, parse.id, [awaited, parse.node], "The compiler resolves the filesystem read as the direct awaited argument of JSON.parse.");
  }
}

function collectMigrationCarriers(
  context: CarrierContext,
  calls: readonly CallExpressionInfo[],
  variables: readonly TypeScript.VariableDeclaration[],
): void {
  const parseVariables = variables.flatMap((variable) => {
    const initializer = initializerExpression(context.ts, variable);
    if (!initializer || !context.ts.isCallExpression(initializer) || calleeName(context.ts, initializer.expression) !== "JSON.parse") return [];
    const binding = firstIdentifier(context.ts, variable.name);
    const parseCall = calls.find((call) => call.node === initializer);
    return binding && parseCall ? [{ variable, bindingSymbolId: context.symbolId(binding), parseCall }] : [];
  });
  for (const call of calls) {
    const target = call.target;
    if (!target || target.name !== "migrateSoccerStore" || !isPath(target.declaration.getSourceFile(), context.root, "src/lib/soccer/store-migrations.ts")) continue;
    const argument = call.node.arguments.length === 1 ? unwrap(context.ts, call.node.arguments[0]) : null;
    if (!argument || !context.ts.isIdentifier(argument)) continue;
    const match = parseVariables.find((item) => item.bindingSymbolId && item.bindingSymbolId === context.symbolId(argument));
    if (!match) continue;
    addCarrier(
      context,
      match.parseCall.id,
      call.id,
      [match.parseCall.node, match.variable, call.node, target.declaration],
      "The compiler-resolved migration call receives the exact JSON.parse binding through one explicit syntax adapter.",
    );
  }
}

function collectSnapshotReturnCarriers(
  context: CarrierContext,
  variables: readonly TypeScript.VariableDeclaration[],
  returns: readonly TypeScript.ReturnStatement[],
  calls: readonly CallExpressionInfo[],
): void {
  const snapshotCalls = calls.filter((call) =>
    call.target
    && call.target.name === "getSnapshot"
    && isPath(call.target.declaration.getSourceFile(), context.root, "src/lib/soccer/store.ts"),
  );
  for (const snapshotCall of snapshotCalls) {
    const declaration = snapshotCall.target?.declaration;
    if (!declaration?.body) continue;
    const storeVariables = variables.filter((variable) => {
      const initializer = directAwaitedCall(context.ts, variable);
      return nearestFunctionNode(context.ts, variable) === declaration
        && Boolean(firstIdentifier(context.ts, variable.name))
        && Boolean(initializer && isExactReadStoreCall(context, initializer));
    });
    for (const variable of storeVariables) {
      const readStoreCall = directAwaitedCall(context.ts, variable);
      const readStore = readStoreCall ? calls.find((call) => call.node === readStoreCall) : null;
      const storeSymbolId = context.symbolId(firstIdentifier(context.ts, variable.name)!);
      if (!storeSymbolId) continue;
      const directSpreadReturn = returns.find((statement) => {
        const expression = statement.expression ? unwrap(context.ts, statement.expression) : null;
        if (!expression || !context.ts.isObjectLiteralExpression(expression)) return false;
        return nearestFunctionNode(context.ts, statement) === declaration
        && expression.properties.some((property) =>
          context.ts.isSpreadAssignment(property)
          && context.ts.isIdentifier(unwrap(context.ts, property.expression))
          && context.symbolId(unwrap(context.ts, property.expression)) === storeSymbolId,
        );
      });
      const storeId = context.elementFor(variable, "alias");
      const returnId = directSpreadReturn ? context.elementFor(directSpreadReturn, "return") : null;
      if (!readStore || !storeId || !returnId || !directSpreadReturn) continue;
      addCarrier(
        context,
        readStore.id,
        storeId,
        [readStore.node, variable],
        "The compiler-resolved direct awaited readStore call initializes this exact store alias.",
        "awaited-call-alias",
      );
      addCarrier(
        context,
        storeId,
        returnId,
        [variable, directSpreadReturn],
        "The getSnapshot return preserves the exact store binding through its explicitly proven object spread adapter.",
      );
    }
  }
}

function collectResponseBodyCarriers(
  context: CarrierContext,
  calls: readonly CallExpressionInfo[],
  callsByNode: ReadonlyMap<TypeScript.CallExpression, CallExpressionInfo>,
): void {
  for (const response of calls) {
    if (calleeName(context.ts, response.node.expression) !== "Response.json") continue;
    if (!context.symbolId(response.node.expression)) continue;
    const body = response.node.arguments.length > 0 ? unwrap(context.ts, response.node.arguments[0]) : null;
    if (!body || !context.ts.isObjectLiteralExpression(body)) continue;
    const spread = body.properties.filter((property) => context.ts.isSpreadAssignment(property));
    if (spread.length !== 1) continue;
    const spreadExpression = unwrap(context.ts, spread[0].expression);
    if (!context.ts.isAwaitExpression(spreadExpression) || !context.ts.isCallExpression(spreadExpression.expression)) continue;
    const snapshotCall = callsByNode.get(spreadExpression.expression);
    if (!snapshotCall || snapshotCall.target?.name !== "getSnapshot") continue;
    const responseId = context.elementFor(response.node, "http-response");
    if (!responseId) continue;
    addCarrier(
      context,
      snapshotCall.id,
      responseId,
      [snapshotCall.node, body, response.node, snapshotCall.target?.declaration ?? response.node],
      "Response.json receives the compiler-resolved getSnapshot result in one exact body-spread adapter.",
    );
  }
}

function collectFetchResponseCarriers(
  context: CarrierContext,
  calls: readonly CallExpressionInfo[],
  variables: readonly TypeScript.VariableDeclaration[],
): void {
  for (const variable of variables) {
    const binding = firstIdentifier(context.ts, variable.name);
    const initializer = initializerExpression(context.ts, variable);
    if (!binding || !initializer || !context.ts.isAwaitExpression(initializer) || !context.ts.isCallExpression(initializer.expression)) continue;
    const fetchCall = initializer.expression;
    if (calleeName(context.ts, fetchCall.expression) !== "fetch" || !context.symbolId(fetchCall.expression)) continue;
    const fetchId = context.elementFor(fetchCall, "fetch-input");
    if (!fetchId) continue;
    for (const response of calls) {
      if (!context.ts.isPropertyAccessExpression(response.node.expression) || response.node.expression.name.text !== "json") continue;
      const receiver = unwrap(context.ts, response.node.expression.expression);
      if (!context.ts.isIdentifier(receiver) || context.symbolId(receiver) !== context.symbolId(binding)) continue;
      addCarrier(
        context,
        fetchId,
        response.id,
        [fetchCall, variable, response.node],
        "The client response.json call reads the exact response binding returned by this compiler-resolved fetch.",
      );
    }
  }
}

function collectResourceResultCarriers(
  context: CarrierContext,
  variables: readonly TypeScript.VariableDeclaration[],
  calls: readonly CallExpressionInfo[],
): void {
  for (const variable of variables) {
    const initializer = initializerExpression(context.ts, variable);
    if (!initializer || !context.ts.isCallExpression(initializer) || !isResourceFactory(context.ts, context.checker, initializer)) continue;
    const resourceId = context.elementFor(initializer, "resource-input");
    if (!resourceId) continue;
    const loader = initializer.arguments[1] ? unwrap(context.ts, initializer.arguments[1]) : null;
    if (!loader || !context.ts.isFunctionLike(loader)) continue;
    const returns = calls.filter((call) =>
      nearestFunctionNode(context.ts, call.node) === loader
      && context.ts.isPropertyAccessExpression(call.node.expression)
      && call.node.expression.name.text === "json",
    );
    if (returns.length !== 1) continue;
    const [responseJson] = returns;
    addCarrier(
      context,
      responseJson.id,
      resourceId,
      [responseJson.node, initializer, loader],
      "The createResource loader returns this exact client response.json result to the resource input.",
    );
  }
}

function collectContextMemberCarriers(
  context: CarrierContext,
  providers: readonly ProviderMember[],
  reads: readonly ContextRead[],
  variables: readonly TypeScript.VariableDeclaration[],
  calls: readonly CallExpressionInfo[],
): void {
  for (const provider of providers) {
    const sourceId = context.elementFor(provider.sourceField, "field-read");
    if (!sourceId) continue;
    const matchingReads = reads.filter((read) => read.contextSymbolId === provider.contextSymbolId);
    if (matchingReads.length !== 1) continue;
    const [read] = matchingReads;
    const consumerCalls = variables.flatMap((variable) => {
      const binding = firstIdentifier(context.ts, variable.name);
      const initializer = initializerExpression(context.ts, variable);
      if (!binding || !initializer || !context.ts.isCallExpression(initializer)) return [];
      const target = context.targetFunction(initializer.expression);
      if (!target || target.id !== read.function.id) return [];
      return calls.filter((call) =>
        nearestFunctionNode(context.ts, call.node) !== read.function.declaration
        && context.ts.isPropertyAccessExpression(call.node.expression)
        && call.node.expression.name.text === "snapshot"
        && context.ts.isIdentifier(unwrap(context.ts, call.node.expression.expression))
        && context.symbolId(unwrap(context.ts, call.node.expression.expression)) === context.symbolId(binding),
      ).map((call) => ({ variable, call }));
    });
    for (const consumer of consumerCalls) {
      addCarrier(
        context,
        sourceId,
        consumer.call.id,
        [provider.provider, provider.member, read.call, consumer.variable, consumer.call.node],
        "RouteContextContinuity proves one Provider value member, one useContext read, and this exact consumer occurrence.",
        "context-continuity",
      );
      addDirectSnapshotMemberCarrier(context, consumer.call, calls);
    }
  }
}

/** Connect one direct context snapshot member to its immediate method call. */
function addDirectSnapshotMemberCarrier(
  context: CarrierContext,
  consumer: CallExpressionInfo,
  calls: readonly CallExpressionInfo[],
): void {
  const member = directPropertyReceiver(context.ts, consumer.node);
  if (!member || !context.symbolId(member.name)) return;
  const method = directPropertyReceiver(context.ts, member);
  if (!method || !context.symbolId(method.name)) return;
  const invocation = method.parent;
  if (!context.ts.isCallExpression(invocation) || invocation.expression !== method) return;
  const memberId = context.elementFor(member, "field-read");
  const invocationId = context.elementFor(invocation, "call");
  if (!memberId || !invocationId) return;
  addCarrier(
    context,
    memberId,
    invocationId,
    [consumer.node, member, method, invocation],
    "The exact context snapshot member feeds its immediate compiler-resolved method call without an alias, spread, computed key, or rename.",
    "direct-snapshot-member",
  );
  const owner = nearestFunction(context, invocation);
  if (!owner || owner.declaration.body !== invocation) return;
  for (const caller of calls) {
    if (caller.target?.id !== owner.id) continue;
    const showRenderProp = exactShowRenderProp(context, caller.node);
    if (!showRenderProp) continue;
    addCarrier(
      context,
      invocationId,
      caller.id,
      [invocation, owner.declaration, caller.node, showRenderProp.show, showRenderProp.when],
      "The compiler-resolved Show condition receives the exact expression-bodied function result from this direct snapshot member path.",
      "expression-body-return",
    );
    addShowRenderPropCarriers(context, caller, showRenderProp);
  }
}

/** Bridge one resolved Solid Show condition to its one direct render function. */
function addShowRenderPropCarriers(
  context: CarrierContext,
  condition: CallExpressionInfo,
  renderProp: ShowRenderProp,
): void {
  const renderPropId = context.elementFor(renderProp.renderProp, "literal");
  if (!renderPropId) return;
  addCarrier(
    context,
    condition.id,
    renderPropId,
    [condition.node, renderProp.show, renderProp.when, renderProp.renderProp],
    "The compiler-resolved Solid Show condition supplies this exact direct JSX child render function.",
    "solid-show-render-prop",
  );
}

function exactShowRenderProp(
  context: CarrierContext,
  condition: TypeScript.CallExpression,
): ShowRenderProp | null {
  const when = exactShowWhenAttribute(context, condition);
  if (!when) return null;
  const show = openingForAttribute(context.ts, when);
  if (!show || !isSolidShow(context, show) || !hasOneStaticShowWhen(context.ts, show, when)) return null;
  const renderProp = singleShowRenderProp(context.ts, show);
  return renderProp ? { show, when, renderProp: renderProp.renderProp } : null;
}

function exactShowWhenAttribute(
  context: CarrierContext,
  condition: TypeScript.CallExpression,
): TypeScript.JsxAttribute | null {
  const expression = condition.parent;
  if (!context.ts.isJsxExpression(expression) || expression.expression !== condition) return null;
  const attribute = expression.parent;
  if (!context.ts.isJsxAttribute(attribute)
    || attribute.initializer !== expression
    || !context.ts.isIdentifier(attribute.name)
    || attribute.name.text !== "when") {
    return null;
  }
  return attribute;
}

function isSolidShow(
  context: CarrierContext,
  opening: TypeScript.JsxOpeningLikeElement,
): boolean {
  if (context.moduleFor(opening.tagName) !== "solid-js" || !context.symbolId(opening.tagName)) return false;
  let symbol = context.checker.getSymbolAtLocation(opening.tagName);
  if (!symbol) return false;
  try {
    if (symbol.flags & context.ts.SymbolFlags.Alias) symbol = context.checker.getAliasedSymbol(symbol);
  } catch {
    return false;
  }
  return symbol.getName() === "Show";
}

function hasOneStaticShowWhen(
  ts: typeof TypeScript,
  show: TypeScript.JsxOpeningLikeElement,
  expected: TypeScript.JsxAttribute,
): boolean {
  let count = 0;
  for (const property of show.attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) return false;
    if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name) || property.name.text !== "when") continue;
    if (property !== expected) return false;
    count += 1;
  }
  return count === 1;
}

function singleShowRenderProp(
  ts: typeof TypeScript,
  show: TypeScript.JsxOpeningLikeElement,
): Pick<ShowRenderProp, "renderProp"> | null {
  if (!ts.isJsxOpeningElement(show) || !ts.isJsxElement(show.parent)) return null;
  const children = show.parent.children.filter((child) =>
    !ts.isJsxText(child) || child.getText(child.getSourceFile()).trim().length > 0,
  );
  if (children.length !== 1 || !ts.isJsxExpression(children[0])) return null;
  const expression = children[0].expression;
  if (!expression || !ts.isArrowFunction(expression) || expression.parameters.length !== 1) return null;
  const parameter = expression.parameters[0];
  if (parameter.dotDotDotToken || parameter.questionToken || parameter.initializer) {
    return null;
  }
  return { renderProp: expression };
}

function openingForAttribute(
  ts: typeof TypeScript,
  attribute: TypeScript.JsxAttribute,
): TypeScript.JsxOpeningLikeElement | null {
  const attributes = attribute.parent;
  if (!ts.isJsxAttributes(attributes)) return null;
  const opening = attributes.parent;
  return ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening) ? opening : null;
}

function directPropertyReceiver(
  ts: typeof TypeScript,
  node: TypeScript.Expression,
): TypeScript.PropertyAccessExpression | null {
  const parent = node.parent;
  return ts.isPropertyAccessExpression(parent) && parent.expression === node
    ? parent
    : null;
}

function directAwaitedCall(
  ts: typeof TypeScript,
  variable: TypeScript.VariableDeclaration,
): TypeScript.CallExpression | null {
  const initializer = variable.initializer;
  if (!initializer || !ts.isAwaitExpression(initializer)) return null;
  return ts.isCallExpression(initializer.expression) ? initializer.expression : null;
}

function isExactReadStoreCall(
  context: CarrierContext,
  call: TypeScript.CallExpression,
): boolean {
  const target = context.targetFunction(call.expression);
  return Boolean(
    target
    && target.name === "readStore"
    && isPath(target.declaration.getSourceFile(), context.root, "src/lib/soccer/store-persistence.ts")
    && context.symbolId(call.expression),
  );
}

function nearestFunction(context: CarrierContext, node: TypeScript.Node): FunctionInfo | null {
  const functionNode = nearestFunctionNode(context.ts, node);
  return functionNode ? context.functionForNode(functionNode) : null;
}

function nearestFunctionNode(
  ts: typeof TypeScript,
  node: TypeScript.Node,
): TypeScript.FunctionLikeDeclaration | null {
  let current: TypeScript.Node | undefined = node;
  while (current) {
    const functionLike = asFunctionLike(ts, current);
    if (functionLike) return functionLike;
    current = current.parent;
  }
  return null;
}

function initializerExpression(
  ts: typeof TypeScript,
  variable: TypeScript.VariableDeclaration,
): TypeScript.Expression | null {
  return variable.initializer ? unwrap(ts, variable.initializer) : null;
}

function firstIdentifier(
  ts: typeof TypeScript,
  name: TypeScript.BindingName,
): TypeScript.Identifier | null {
  if (ts.isIdentifier(name)) return name;
  for (const element of name.elements) {
    if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) return element.name;
  }
  return null;
}

function addCarrier(
  context: CarrierContext,
  from: string,
  to: string,
  nodes: readonly TypeScript.Node[],
  detail: string,
  proofKind: "carrier-boundary" | "awaited-call-alias" | "direct-snapshot-member" | "expression-body-return" | "solid-show-render-prop" | "context-continuity" = "carrier-boundary",
): void {
  const locations = nodes.map((node) => context.location(node));
  context.addRelation(
    from,
    to,
    CARRIER,
    locations,
    proof(proofKind, detail, locations),
    "proven",
  );
}

function isPath(file: TypeScript.SourceFile, root: string, expected: string): boolean {
  const target = path.resolve(file.fileName);
  return target === path.resolve(root, expected)
    || target === path.resolve(root, "app", expected);
}
