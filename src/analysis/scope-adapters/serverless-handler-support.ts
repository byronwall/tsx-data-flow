import { readFileSync } from "node:fs";
import path from "node:path";
import * as TypeScript from "typescript";
import type { SourceIdentity, SourceLocation } from "../scope-seam";

export type EvidenceElement = {
  id: string;
  kind: string;
  label: string;
  location: SourceLocation;
  symbol?: string | null;
  symbolId?: string | null;
  source?: SourceIdentity;
};

type SourceFile = {
  absoluteFile: string;
  relativeFile: string;
  source: string;
  syntax: TypeScript.SourceFile;
};

type HandlerDiscovery = {
  factory: TypeScript.FunctionDeclaration;
  handler: TypeScript.FunctionExpression | TypeScript.ArrowFunction;
  assignment: TypeScript.VariableDeclaration;
  call: TypeScript.CallExpression;
  event: TypeScript.ParameterDeclaration;
  context: TypeScript.ParameterDeclaration;
};

export type ServerlessHandlerDiscovery = {
  entry: EvidenceElement;
  factoryName: string;
  handlerName: string;
  assignmentName: string;
  factoryLocation: SourceLocation;
  assignmentLocation: SourceLocation;
  callLocation: SourceLocation;
  eventLocation: SourceLocation;
  contextLocation: SourceLocation;
};

/** Find factory-created handlers and retain only source-backed discoveries. */
export function discoverServerlessHandlers(
  root: string,
  elements: readonly EvidenceElement[],
): ServerlessHandlerDiscovery[] {
  const discoveries: ServerlessHandlerDiscovery[] = [];
  for (const sourceFile of sourceFiles(root, elements)) {
    for (const discovery of discoverHandlers(sourceFile)) {
      const handlerLocation = sourceLocationAt(
        root,
        sourceFile.absoluteFile,
        sourceFile.source,
        discovery.handler.getStart(sourceFile.syntax),
        discovery.handler.getEnd(),
      );
      const entry = selectEntryElement(
        root,
        elements,
        sourceFile.absoluteFile,
        handlerLocation,
        discovery.handler,
      );
      if (!entry) continue;

      const factoryName = discovery.factory.name?.text ?? "<anonymous>";
      const handlerName = discovery.handler.name?.text ?? "<anonymous>";
      const assignmentName = TypeScript.isIdentifier(discovery.assignment.name)
        ? discovery.assignment.name.text
        : "<binding>";
      discoveries.push({
        entry,
        factoryName,
        handlerName,
        assignmentName,
        factoryLocation: nodeLocation(root, sourceFile, discovery.factory),
        assignmentLocation: nodeLocation(root, sourceFile, discovery.assignment),
        callLocation: nodeLocation(root, sourceFile, discovery.call),
        eventLocation: nodeLocation(root, sourceFile, discovery.event),
        contextLocation: nodeLocation(root, sourceFile, discovery.context),
      });
    }
  }
  return discoveries;
}

export function sourceIdentityForElement(element: EvidenceElement): SourceIdentity {
  if (element.source) return element.source;
  const start = positionKey(element.location.span.startLine, element.location.span.startColumn);
  const end = positionKey(element.location.span.endLine, element.location.span.endColumn);
  return { file: element.location.file, start, end: Math.max(start + 1, end) };
}

function discoverHandlers(sourceFile: SourceFile): HandlerDiscovery[] {
  const factories = functionDeclarations(sourceFile.syntax);
  const discoveries: HandlerDiscovery[] = [];
  for (const assignment of factoryAssignments(sourceFile.syntax, factories)) {
    const factory = factories.find((candidate) => candidate.name?.text === assignment.factoryName);
    if (!factory) continue;
    const returnedHandlers = returnedHandlersFor(factory);
    const matchingHandlers = returnedHandlers
      .map((handler) => ({ handler, event: parameterNamed(handler, "event"), context: parameterNamed(handler, "context") }))
      .filter((match): match is { handler: TypeScript.FunctionExpression | TypeScript.ArrowFunction; event: TypeScript.ParameterDeclaration; context: TypeScript.ParameterDeclaration } => Boolean(match.event && match.context));
    if (matchingHandlers.length !== 1) continue;
    const match = matchingHandlers[0];
    discoveries.push({
      factory,
      handler: match.handler,
      assignment: assignment.variable,
      call: assignment.call,
      event: match.event,
      context: match.context,
    });
  }
  return discoveries;
}

function functionDeclarations(sourceFile: TypeScript.SourceFile): TypeScript.FunctionDeclaration[] {
  const declarations: TypeScript.FunctionDeclaration[] = [];
  const visit = (node: TypeScript.Node) => {
    if (TypeScript.isFunctionDeclaration(node) && node.name) declarations.push(node);
    TypeScript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return declarations;
}

function factoryAssignments(
  sourceFile: TypeScript.SourceFile,
  factories: readonly TypeScript.FunctionDeclaration[],
): { variable: TypeScript.VariableDeclaration; call: TypeScript.CallExpression; factoryName: string }[] {
  const assignments: { variable: TypeScript.VariableDeclaration; call: TypeScript.CallExpression; factoryName: string }[] = [];
  const visit = (node: TypeScript.Node) => {
    if (TypeScript.isVariableDeclaration(node) && TypeScript.isIdentifier(node.name)) {
      const initializer = node.initializer ? unwrapExpression(node.initializer) : null;
      if (initializer && TypeScript.isCallExpression(initializer) && TypeScript.isIdentifier(initializer.expression)) {
        const factoryName = initializer.expression.text;
        const hasFactory = factories.filter((factory) => factory.name?.text === factoryName).length === 1;
        if (hasFactory && isTopLevelHandlerAssignment(node, sourceFile)) {
          assignments.push({ variable: node, call: initializer, factoryName });
        }
      }
    }
    TypeScript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return assignments;
}

function isTopLevelHandlerAssignment(
  variable: TypeScript.VariableDeclaration,
  sourceFile: TypeScript.SourceFile,
): boolean {
  if (!TypeScript.isIdentifier(variable.name)) return false;
  const variableStatement = variable.parent.parent;
  if (!TypeScript.isVariableStatement(variableStatement) || variableStatement.parent !== sourceFile) return false;
  const exported = variableStatement.modifiers?.some((modifier) => modifier.kind === TypeScript.SyntaxKind.ExportKeyword) ?? false;
  return exported || /handler/i.test(variable.name.text);
}

function returnedHandlersFor(
  factory: TypeScript.FunctionDeclaration,
): (TypeScript.FunctionExpression | TypeScript.ArrowFunction)[] {
  if (!factory.body) return [];
  const handlers: (TypeScript.FunctionExpression | TypeScript.ArrowFunction)[] = [];
  const visit = (node: TypeScript.Node) => {
    if (TypeScript.isReturnStatement(node) && node.expression) {
      const returned = unwrapExpression(node.expression);
      if (TypeScript.isFunctionExpression(returned) || TypeScript.isArrowFunction(returned)) handlers.push(returned);
    }
    if (node !== factory.body && isNestedFunction(node)) return;
    TypeScript.forEachChild(node, visit);
  };
  visit(factory.body);
  return handlers;
}

function isNestedFunction(node: TypeScript.Node): boolean {
  return TypeScript.isFunctionDeclaration(node)
    || TypeScript.isFunctionExpression(node)
    || TypeScript.isArrowFunction(node);
}

function parameterNamed(
  handler: TypeScript.FunctionExpression | TypeScript.ArrowFunction,
  name: string,
): TypeScript.ParameterDeclaration | null {
  const matches = handler.parameters.filter(
    (parameter) => TypeScript.isIdentifier(parameter.name) && parameter.name.text === name,
  );
  return matches.length === 1 ? matches[0] : null;
}

function unwrapExpression(node: TypeScript.Expression): TypeScript.Expression {
  if (TypeScript.isParenthesizedExpression(node)
    || TypeScript.isAsExpression(node)
    || TypeScript.isTypeAssertionExpression(node)
    || TypeScript.isNonNullExpression(node)
    || TypeScript.isSatisfiesExpression(node)
    || TypeScript.isAwaitExpression(node)) {
    return unwrapExpression(node.expression);
  }
  return node;
}

function selectEntryElement(
  root: string,
  elements: readonly EvidenceElement[],
  targetFile: string,
  handlerLocation: SourceLocation,
  handler: TypeScript.FunctionExpression | TypeScript.ArrowFunction,
): EvidenceElement | null {
  const matches = elements.filter((element) =>
    sameFile(root, element.location.file, targetFile)
    && (element.kind === "function-entry" || element.kind === "handler-entry")
    && sameSpan(element.location, handlerLocation)
    && labelMatchesHandler(element, handler),
  );
  return matches.length === 1 ? matches[0] : null;
}

function labelMatchesHandler(
  element: EvidenceElement,
  handler: TypeScript.FunctionExpression | TypeScript.ArrowFunction,
): boolean {
  const name = handler.name?.text;
  if (!name) return true;
  const symbol = element.symbol ?? element.symbolId;
  return element.label === name || symbol === name || symbol?.endsWith(`.${name}`) === true;
}

function sameSpan(left: SourceLocation, right: SourceLocation): boolean {
  return left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}

function sourceFiles(root: string, elements: readonly EvidenceElement[]): SourceFile[] {
  const files = new Map<string, SourceFile>();
  for (const element of elements) {
    const absoluteFile = absoluteFileFor(root, element.location.file);
    if (!absoluteFile || !isTypeScriptSource(absoluteFile) || files.has(absoluteFile)) continue;
    let source: string;
    try {
      source = readFileSync(absoluteFile, "utf8");
    } catch {
      continue;
    }
    files.set(absoluteFile, {
      absoluteFile,
      relativeFile: relativeFile(root, absoluteFile),
      source,
      syntax: TypeScript.createSourceFile(
        absoluteFile,
        source,
        TypeScript.ScriptTarget.Latest,
        true,
        path.extname(absoluteFile).toLowerCase() === ".tsx" ? TypeScript.ScriptKind.TSX : TypeScript.ScriptKind.TS,
      ),
    });
  }
  return [...files.values()].sort((left, right) => left.relativeFile.localeCompare(right.relativeFile));
}

function nodeLocation(root: string, sourceFile: SourceFile, node: TypeScript.Node): SourceLocation {
  return sourceLocationAt(
    root,
    sourceFile.absoluteFile,
    sourceFile.source,
    node.getStart(sourceFile.syntax),
    node.getEnd(),
  );
}

function sourceLocationAt(
  root: string,
  file: string,
  source: string,
  start: number,
  end: number,
): SourceLocation {
  const startPoint = lineAndColumn(source, start);
  const endPoint = lineAndColumn(source, Math.max(start + 1, end));
  return {
    file: relativeFile(root, file),
    line: startPoint.line,
    column: startPoint.column,
    span: {
      startLine: startPoint.line,
      startColumn: startPoint.column,
      endLine: endPoint.line,
      endColumn: endPoint.column,
    },
  };
}

function lineAndColumn(source: string, offset: number): { line: number; column: number } {
  const boundedOffset = Math.max(0, Math.min(offset, source.length));
  const prefix = source.slice(0, boundedOffset);
  const lineBreaks = prefix.match(/\n/g)?.length ?? 0;
  const lastBreak = prefix.lastIndexOf("\n");
  return { line: lineBreaks + 1, column: boundedOffset - lastBreak };
}

function positionKey(line: number, column: number): number {
  return line * 1_000_000 + column;
}

function absoluteFileFor(root: string, file: string): string | null {
  const absolute = path.normalize(path.isAbsolute(file) ? file : path.resolve(root, file));
  return isInside(path.resolve(root), absolute) ? absolute : null;
}

function sameFile(root: string, evidenceFile: string, targetFile: string): boolean {
  const absoluteEvidenceFile = absoluteFileFor(root, evidenceFile);
  return absoluteEvidenceFile !== null && path.normalize(absoluteEvidenceFile) === path.normalize(targetFile);
}

function relativeFile(root: string, file: string): string {
  return path.relative(path.resolve(root), path.resolve(file)).replaceAll(path.sep, "/");
}

function isTypeScriptSource(file: string): boolean {
  return [".ts", ".tsx", ".mts", ".cts"].includes(path.extname(file).toLowerCase());
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}
