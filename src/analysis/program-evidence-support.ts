import path from "node:path";
import * as TypeScript from "typescript";
import type {
  ProgramElement,
  ProgramEvidenceLocation,
  ProgramOperationKind,
  ProgramProof,
  ProgramProofKind,
  ProgramRelation,
} from "./program-evidence";

export function asFunctionLike(
  ts: typeof TypeScript,
  node: TypeScript.Node,
): TypeScript.FunctionLikeDeclaration | null {
  return ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
    ? node
    : null;
}

export function functionNameNode(ts: typeof TypeScript, node: TypeScript.FunctionLikeDeclaration): TypeScript.Node | null {
  if (node.name) return node.name;
  const parent = node.parent;
  return parent && ts.isVariableDeclaration(parent) ? parent.name : null;
}

export function bindingIdentifiers(ts: typeof TypeScript, name: TypeScript.BindingName): TypeScript.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  const result: TypeScript.Identifier[] = [];
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) result.push(...bindingIdentifiers(ts, element.name));
  }
  return result;
}

export function firstBindingIdentifier(ts: typeof TypeScript, name: TypeScript.BindingName) {
  return bindingIdentifiers(ts, name)[0] ?? null;
}

export function containsJsx(ts: typeof TypeScript, node: TypeScript.Node) {
  let found = false;
  const visit = (child: TypeScript.Node) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) found = true;
    else ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

export function isHandlerLike(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.FunctionLikeDeclaration,
  name: string,
) {
  if (/^(handle|handler|serve|request|respond|main|run|execute)/i.test(name)) return true;
  const handlerParameter = node.parameters.some(
    (parameter) =>
      /^(request|req|response|res|reply|event|context)$/i.test(
        parameter.name.getText(),
      ) ||
      /Request|Response|IncomingMessage|ServerResponse|Event|Context/.test(
        safeType(checker, parameter),
      ),
  );
  return (
    (/handler$/i.test(name) && handlerParameter) ||
    (handlerParameter &&
      node.parameters.some(
        (parameter) =>
          /^(request|req|response|res|reply)$/i.test(
            parameter.name.getText(),
          ) ||
          /Request|Response|IncomingMessage|ServerResponse/.test(
            safeType(checker, parameter),
          ),
      ))
  );
}

export type ParameterOriginRole = "request" | "event" | null;

export function parameterOriginRole(checker: TypeScript.TypeChecker, parameter: TypeScript.ParameterDeclaration, handler: boolean): ParameterOriginRole {
  if (!handler) return null;
  const name = parameter.name.getText();
  const type = safeType(checker, parameter);
  if (/^(response|res|reply)$/i.test(name) || /\bServerResponse\b/.test(type)) return null;
  if (/^(request|req)$/i.test(name) || /\b(?:IncomingMessage|ServerRequest|Request)\b/.test(type)) return "request";
  if (/^event$/i.test(name) || /\b[A-Za-z_$][\w$]*Event\b/.test(type)) return "event";
  return null;
}

export type ExternalServiceCallKind = "external-read" | "message" | null;

export function externalServiceCallKind(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.CallExpression,
): ExternalServiceCallKind {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const declarations = checker.getSymbolAtLocation(node.expression)?.declarations ?? [];
  if (!declarations.some((declaration) => isUnimplementedServiceDeclaration(ts, declaration))) return null;
  const method = node.expression.name.text;
  if (/^(query|find|findOne|findMany|get|load|read|lookup|scan|select)$/i.test(method)) return "external-read";
  if (/^(put|publish|send|emit|enqueue|produce|dispatch)$/i.test(method)) return "message";
  return null;
}

function isUnimplementedServiceDeclaration(ts: typeof TypeScript, declaration: TypeScript.Declaration) {
  return ts.isMethodSignature(declaration)
    || ts.isPropertySignature(declaration)
    || ts.isMethodDeclaration(declaration) && !declaration.body
    || ts.isPropertyDeclaration(declaration) && !declaration.initializer;
}

export type ResponseReturnRole = "http-response" | "response" | null;

export function responseReturnRole(ts: typeof TypeScript, node: TypeScript.Expression): ResponseReturnRole {
  const expression = unwrap(ts, node);
  if (ts.isNewExpression(expression) && calleeName(ts, expression.expression) === "Response") return "http-response";
  if (
    ts.isCallExpression(expression) &&
    /(?:response|respond|jsonResponse|sendJson)$/i.test(
      lastName(calleeName(ts, expression.expression)),
    )
  ) {
    return "response";
  }
  if (!ts.isObjectLiteralExpression(expression)) return null;
  const properties = new Set(expression.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return [];
    return [property.name.getText(expression.getSourceFile()).replace(/["']/g, "")];
  }));
  return properties.has("statusCode") && properties.has("body") ? "response" : null;
}

export function functionOperation(name: string): ProgramOperationKind | null {
  if (/^parse/.test(name)) return "parse";
  if (/^(validate|assert|check|is[A-Z])/.test(name)) return "validate";
  if (/^(select|pick|omit|filter|map|find|reduce|aggregate|pack|to[A-Z].*Model)/.test(name)) return "selection";
  if (/^(serialize|encode|stringify)/.test(name)) return "serialize";
  return null;
}

export function callOperation(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  node: TypeScript.CallExpression,
): ProgramOperationKind | null {
  const name = calleeName(ts, node.expression);
  const module = importModule(ts, checker, node.expression);
  if (name === "JSON.parse" || /(^|\.)parse$/.test(name)) return "parse";
  if (name === "JSON.stringify" || /(^|\.)(serialize|stringify|encode)$/.test(name)) return "serialize";
  if (/^(validate|assert|check|safeParse|is[A-Z])/.test(name)) return "validate";
  if (/^(select|pick|omit|filter|map|find|reduce|aggregate|pack)$/.test(name) || ["filter", "map", "reduce", "flatMap"].includes(name)) return "selection";
  if (module === "solid-js" && name === "createResource") return "resource";
  return null;
}

export function isResourceFactory(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Expression) {
  if (!ts.isCallExpression(node)) return false;
  const name = calleeName(ts, node.expression);
  const module = importModule(ts, checker, node.expression);
  return module === "solid-js" && name === "createResource" || /^(createResource|createQuery|useResource)$/.test(name);
}

export function isFileOperation(
  module: string | null,
  name: string,
  operation: "read" | "write",
) {
  if (!module || !/^(node:)?fs(\/|$)/.test(module)) return false;
  return operation === "read"
    ? /^(readFile|readFileSync|createReadStream|readdir|stat|access)$/.test(
        name,
      )
    : /^(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)$/.test(
        name,
      );
}

export function isNetworkOperation(module: string | null, name: string) {
  return Boolean(module && /^(node:)?https?$/.test(module) && /^(request|get|post)$/.test(name));
}

export function isFrameworkCall(module: string, name: string) {
  return module === "solid-js" && /^(createResource|createEffect|createMemo|createSignal|onMount|batch|untrack|Show|For)$/.test(name);
}

export function outputKind(name: string, node: TypeScript.CallExpression): "stdout" | "stderr" | null {
  const expression = node.expression.getText();
  const operation = lastName(name);
  if (expression === "process.stderr.write") return "stderr";
  if (expression === "process.stdout.write") return "stdout";
  return expression.startsWith("console.") && /^(log|info|debug|warn|error)$/.test(operation) ? "stdout" : null;
}

export function isExit(name: string, node: TypeScript.CallExpression) {
  return lastName(name) === "exit" && /process\.exit$/.test(node.expression.getText());
}

export function isHttpResponse(
  ts: typeof TypeScript,
  node: TypeScript.CallExpression,
  checker?: TypeScript.TypeChecker,
) {
  const receiver = thisReceiver(ts, node.expression);
  const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
  if (
    ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "json"
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "Response"
    && checker?.getSymbolAtLocation(node.expression.expression)
  ) return true;
  return Boolean(receiver && /^(end|json|send|write|writeHead|redirect)$/.test(name) && /^(res|response|reply)$/i.test(receiver.getText()));
}

export function isEffectName(name: string) {
  return /^(publish|send|emit|spawn|exec|execFile|close|destroy)$/.test(lastName(name));
}

export function isKnownGlobal(name: string) {
  return new Set(["fetch", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "Promise", "Error", "URL", "Date", "Math"]).has(name);
}

export function lastName(name: string) {
  return name.split(".").at(-1) ?? name;
}

export function propertyBase(ts: typeof TypeScript, node: TypeScript.PropertyAccessExpression, names: string[]) {
  const chain = node.getText(node.getSourceFile());
  if (names.includes(chain)) return node;
  return ts.isPropertyAccessExpression(node.expression) &&
    names.includes(node.expression.getText(node.getSourceFile()))
    ? node.expression
    : null;
}

export function isExitStatusAssignment(ts: typeof TypeScript, node: TypeScript.BinaryExpression) {
  return (
    ts.isPropertyAccessExpression(node.left) &&
    node.left.getText(node.getSourceFile()) === "process.exitCode" &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  );
}

export function thisReceiver(ts: typeof TypeScript, node: TypeScript.Node) {
  return ts.isPropertyAccessExpression(node) ? node.expression : null;
}

export function calleeName(ts: typeof TypeScript | null, node: TypeScript.Node): string {
  if (!ts) return node.getText();
  if (ts.isPropertyAccessExpression(node)) return `${calleeName(ts, node.expression)}.${node.name.text}`;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return node.getText(node.getSourceFile()).replace(/\s+/g, " ");
}

export function staticMethod(node: TypeScript.CallExpression) {
  const options = node.arguments[1];
  if (!options || !node.getSourceFile().text) return null;
  const match = options.getText(node.getSourceFile()).match(/method\s*:\s*["']([^"']+)["']/);
  return match?.[1] ?? "GET";
}

export function staticTarget(node: TypeScript.CallExpression) {
  const first = node.arguments[0];
  return first && (TypeScript.isStringLiteral(first) || TypeScript.isNoSubstitutionTemplateLiteral(first)) ? first.text : null;
}

export function isSelectionOperator(ts: typeof TypeScript, kind: TypeScript.SyntaxKind) {
  return [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken].includes(kind);
}

export function jsxOpeningAncestor(ts: typeof TypeScript, node: TypeScript.JsxExpression) {
  let current: TypeScript.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) return current.openingElement;
    if (ts.isJsxSelfClosingElement(current)) return current;
    if (asFunctionLike(ts, current)) return null;
    current = current.parent;
  }
  return null;
}

export function unwrap(ts: typeof TypeScript, node: TypeScript.Expression): TypeScript.Expression {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return unwrap(ts, node.expression);
  }
  return node;
}

export function compilerSymbolId(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, node: TypeScript.Node) {
  let symbol: TypeScript.Symbol | undefined;
  try {
    symbol = checker.getSymbolAtLocation(node);
    if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  } catch {
    return null;
  }
  if (!symbol) return null;
  const declaration = symbol.declarations?.find((item) => inside(root, item.getSourceFile().fileName));
  const suffix = declaration ? `@${relative(root, declaration.getSourceFile().fileName)}:${declaration.getStart(declaration.getSourceFile())}` : "";
  return `${checker.getFullyQualifiedName(symbol)}${suffix}`;
}

export function importModule(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  let symbol: TypeScript.Symbol | undefined;
  try {
    symbol = checker.getSymbolAtLocation(node);
  } catch {
    return null;
  }
  let current: TypeScript.Node | undefined;
  for (const declaration of symbol?.declarations ?? []) {
    current = declaration;
    while (current) {
      if (ts.isImportDeclaration(current) && ts.isStringLiteral(current.moduleSpecifier)) return current.moduleSpecifier.text;
      current = current.parent;
    }
  }
  return null;
}

export function typeId(checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  const text = safeType(checker, node);
  return text === "unknown" ? null : text;
}

export function safeType(checker: TypeScript.TypeChecker, node: TypeScript.Node) {
  try {
    return checker.typeToString(checker.getTypeAtLocation(node), node, TypeScript.TypeFormatFlags.NoTruncation);
  } catch {
    return "unknown";
  }
}

export function locationFor(
  root: string,
  file: TypeScript.SourceFile,
  node: TypeScript.Node,
): ProgramEvidenceLocation {
  const start = file.getLineAndCharacterOfPosition(node.getStart(file));
  const end = file.getLineAndCharacterOfPosition(node.getEnd());
  return {
    file: relative(root, file.fileName),
    line: start.line + 1,
    column: start.character + 1,
    span: {
      startLine: start.line + 1,
      startColumn: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
    },
  };
}

export function nodeKey(root: string, node: TypeScript.Node) {
  const location = locationFor(root, node.getSourceFile(), node);
  return `${location.file}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}

export function relative(root: string, file: string) {
  return path.relative(root, path.resolve(file)).replaceAll(path.sep, "/");
}

export function inside(root: string, file: string) {
  const value = path.relative(root, path.resolve(file));
  return value === "" || !value.startsWith(`..${path.sep}`) && value !== "..";
}

export function proof(kind: ProgramProofKind, detail: string, locations: ProgramEvidenceLocation[]): ProgramProof {
  return { kind, detail, locations };
}

export function stableId(prefix: string, fields: unknown[]) {
  let hash = 2166136261;
  const value = fields.map(stableSerialize).join("|");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}:${(hash >>> 0).toString(36)}`;
}

export function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${key}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return String(value);
}

export function groupElements<T extends string>(items: ProgramElement[], key: (item: ProgramElement) => T) {
  const groups = new Map<T, string[]>();
  for (const item of items) {
    const group = groups.get(key(item)) ?? [];
    group.push(item.id);
    groups.set(key(item), group);
  }
  return groups;
}

export function groupRelations<T extends string>(items: ProgramRelation[], key: (item: ProgramRelation) => T) {
  const groups = new Map<T, string[]>();
  for (const item of items) {
    const group = groups.get(key(item)) ?? [];
    group.push(item.id);
    groups.set(key(item), group);
  }
  return groups;
}
