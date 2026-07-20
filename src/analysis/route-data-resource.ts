import path from "node:path";
import type * as TypeScript from "typescript";

export function resourceBoundaryIdentity(root: string, declaration: TypeScript.VariableDeclaration) {
  const file = path.relative(path.resolve(root), path.resolve(declaration.getSourceFile().fileName)).replaceAll(path.sep, "/");
  return `resource:${file}:${declaration.getStart(declaration.getSourceFile())}`;
}

export function resolveResourceFetcher(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  node: TypeScript.CallExpression,
) {
  const target = resourceFetcherTargets(ts, node).filter((expression) =>
    resolvedDeclarations(ts, checker, expression).some((declaration) => firstParty(root, declaration)),
  );
  const declarations = new Map<string, TypeScript.Declaration>();
  let retainedTarget: TypeScript.LeftHandSideExpression | null = null;
  for (const expression of target) {
    for (const declaration of resolvedDeclarations(ts, checker, expression).filter((item) => firstParty(root, item))) {
      declarations.set(declarationIdentity(declaration), declaration);
      retainedTarget = expression;
    }
  }
  if (declarations.size !== 1 || !retainedTarget) return null;
  const label = ts.isIdentifier(retainedTarget) ? retainedTarget.text : ts.isPropertyAccessExpression(retainedTarget) ? retainedTarget.name.text : null;
  const resolved = [...declarations.values()];
  const outputs = resolved.flatMap((declaration) => declarationReturnExpressions(ts, declaration));
  return label ? { label, declarations: resolved, output: outputs.length === 1 ? outputs[0] : null } : null;
}

export function returnedConsumerValue(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  source: TypeScript.CallExpression,
) {
  const owner = enclosingConsumer(ts, source);
  if (!owner) return null;
  const returnExpressions = returnedExpressions(ts, owner);
  if (returnExpressions.some((expression) => containsNode(expression, source))) {
    return returnExpressions.find((expression) => containsNode(expression, source)) ?? null;
  }
  const mutatedReturn = returnedMutationValue(ts, checker, source, owner, returnExpressions);
  if (mutatedReturn) return mutatedReturn;
  const binding = constBindingFor(ts, source);
  if (!binding) return null;
  return returnExpressions.find((expression) =>
    expressionDependsOnDeclaration(ts, checker, expression, binding, new Set())
  ) ?? null;
}

function resourceFetcherTargets(ts: typeof TypeScript, node: TypeScript.CallExpression) {
  const fetcher = callExpressionName(ts, node) === "createResource" && node.arguments.length >= 2 ? node.arguments[1] : node.arguments[0];
  if (!fetcher) return [];
  const returned = ts.isIdentifier(fetcher) || ts.isPropertyAccessExpression(fetcher)
    ? [fetcher]
    : ts.isArrowFunction(fetcher) || ts.isFunctionExpression(fetcher)
      ? ts.isBlock(fetcher.body)
        ? fetcher.body.statements.filter(ts.isReturnStatement).flatMap((statement) => statement.expression ? [statement.expression] : [])
        : [fetcher.body]
      : [];
  return returned.flatMap((expression) => returnedCallTargets(ts, expression));
}

function returnedCallTargets(ts: typeof TypeScript, value: TypeScript.Expression): TypeScript.LeftHandSideExpression[] {
  const expression = unwrapExpression(ts, value);
  if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) return [expression];
  if (ts.isCallExpression(expression)) return ts.isIdentifier(expression.expression) || ts.isPropertyAccessExpression(expression.expression) ? [expression.expression] : [];
  if (ts.isConditionalExpression(expression)) return [...returnedCallTargets(ts, expression.whenTrue), ...returnedCallTargets(ts, expression.whenFalse)];
  if (ts.isBinaryExpression(expression)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return returnedCallTargets(ts, expression.right);
    if (expression.operatorToken.kind === ts.SyntaxKind.BarBarToken || expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) return [...returnedCallTargets(ts, expression.left), ...returnedCallTargets(ts, expression.right)];
  }
  return [];
}

function unwrapExpression(ts: typeof TypeScript, expression: TypeScript.Expression): TypeScript.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAwaitExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
  return current;
}

export function resolvedDeclarations(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.LeftHandSideExpression) {
  const target = ts.isPropertyAccessExpression(expression) ? expression.name : expression;
  let symbol = checker.getSymbolAtLocation(target);
  try {
    if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  } catch {
    // An unresolved alias does not establish a resource fetcher.
  }
  return symbol?.valueDeclaration ? [symbol.valueDeclaration] : symbol?.declarations ?? [];
}

export function declarationIdentity(declaration: TypeScript.Declaration) {
  return `${path.normalize(declaration.getSourceFile().fileName)}:${declaration.getStart(declaration.getSourceFile())}`;
}

function enclosingConsumer(ts: typeof TypeScript, node: TypeScript.Node): TypeScript.FunctionLikeDeclaration | null {
  let current: TypeScript.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current)
      || ts.isMethodDeclaration(current)
      || ts.isArrowFunction(current)
      || ts.isFunctionExpression(current)
      || ts.isGetAccessorDeclaration(current)
      || ts.isSetAccessorDeclaration(current)
      || ts.isConstructorDeclaration(current)
    ) return current;
    current = current.parent;
  }
  return null;
}

function returnedExpressions(ts: typeof TypeScript, owner: TypeScript.FunctionLikeDeclaration) {
  if (ts.isArrowFunction(owner) && !ts.isBlock(owner.body)) return [owner.body];
  const expressions: TypeScript.Expression[] = [];
  const visit = (node: TypeScript.Node) => {
    if (node !== owner && (
      ts.isFunctionDeclaration(node)
      || ts.isMethodDeclaration(node)
      || ts.isArrowFunction(node)
      || ts.isFunctionExpression(node)
      || ts.isGetAccessorDeclaration(node)
      || ts.isSetAccessorDeclaration(node)
      || ts.isConstructorDeclaration(node)
    )) return;
    if (ts.isReturnStatement(node) && node.expression) expressions.push(node.expression);
    ts.forEachChild(node, visit);
  };
  if (owner.body) visit(owner.body);
  return expressions;
}

function declarationReturnExpressions(ts: typeof TypeScript, declaration: TypeScript.Declaration) {
  if (
    ts.isFunctionDeclaration(declaration)
    || ts.isMethodDeclaration(declaration)
    || ts.isGetAccessorDeclaration(declaration)
    || ts.isSetAccessorDeclaration(declaration)
    || ts.isConstructorDeclaration(declaration)
  ) return returnedExpressions(ts, declaration);
  if (
    ts.isVariableDeclaration(declaration)
    && declaration.initializer
    && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
  ) return returnedExpressions(ts, declaration.initializer);
  return [];
}

function constBindingFor(ts: typeof TypeScript, source: TypeScript.Expression) {
  let current: TypeScript.Node = source;
  while (
    ts.isAwaitExpression(current.parent)
    || ts.isParenthesizedExpression(current.parent)
    || ts.isAsExpression(current.parent)
    || ts.isTypeAssertionExpression(current.parent)
    || ts.isNonNullExpression(current.parent)
    || ts.isSatisfiesExpression(current.parent)
    || (
      ts.isConditionalExpression(current.parent)
      && (current.parent.whenTrue === current || current.parent.whenFalse === current)
    )
    || (
      ts.isBinaryExpression(current.parent)
      && (
        current.parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        || current.parent.operatorToken.kind === ts.SyntaxKind.BarBarToken
        || current.parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      )
    )
  ) {
    current = current.parent;
  }
  const declaration = current.parent;
  if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== current || !ts.isIdentifier(declaration.name)) return null;
  const list = declaration.parent;
  return ts.isVariableDeclarationList(list) && Boolean(list.flags & ts.NodeFlags.Const) ? declaration : null;
}

function expressionDependsOnDeclaration(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Expression,
  target: TypeScript.VariableDeclaration,
  visited: Set<TypeScript.VariableDeclaration>,
) {
  let found = false;
  const visit = (node: TypeScript.Node) => {
    if (found) return;
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol?.valueDeclaration === target || symbol?.declarations?.includes(target)) {
        found = true;
        return;
      }
      const declaration = symbol?.valueDeclaration;
      if (
        declaration
        && ts.isVariableDeclaration(declaration)
        && declaration.getSourceFile() === target.getSourceFile()
        && !visited.has(declaration)
      ) {
        visited.add(declaration);
        const dependencies = [
          ...(declaration.initializer ? [declaration.initializer] : []),
          ...iterationInputsFor(ts, declaration),
          ...mutationInputsFor(ts, checker, declaration),
        ];
        if (dependencies.some((dependency) =>
          expressionDependsOnDeclaration(ts, checker, dependency, target, visited)
        )) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function returnedMutationValue(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  source: TypeScript.CallExpression,
  owner: TypeScript.FunctionLikeDeclaration,
  returnExpressions: TypeScript.Expression[],
) {
  let current: TypeScript.Node | undefined = source;
  while (current && current !== owner) {
    if (
      ts.isCallExpression(current)
      && current.arguments.some((argument) => containsNode(argument, source))
      && ts.isPropertyAccessExpression(current.expression)
      && ["push", "unshift", "splice", "set", "add"].includes(current.expression.name.text)
      && ts.isIdentifier(current.expression.expression)
    ) {
      const declaration = variableDeclarationFor(ts, checker, current.expression.expression);
      if (!declaration) return null;
      return returnExpressions.find((expression) =>
        expressionDependsOnDeclaration(ts, checker, expression, declaration, new Set())
      ) ?? null;
    }
    current = current.parent;
  }
  return null;
}

function iterationInputsFor(
  ts: typeof TypeScript,
  declaration: TypeScript.VariableDeclaration,
) {
  const list = declaration.parent;
  const statement = ts.isVariableDeclarationList(list) ? list.parent : null;
  return statement
    && (ts.isForOfStatement(statement) || ts.isForInStatement(statement))
    && statement.initializer === list
    ? [statement.expression]
    : [];
}

function mutationInputsFor(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.VariableDeclaration,
) {
  const owner = enclosingConsumer(ts, declaration);
  if (!owner?.body) return [];
  const inputs: TypeScript.Expression[] = [];
  const visit = (node: TypeScript.Node) => {
    if (node !== owner && ts.isFunctionLike(node)) return;
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ["push", "unshift", "splice", "set", "add"].includes(node.expression.name.text)
      && ts.isIdentifier(node.expression.expression)
      && variableDeclarationFor(ts, checker, node.expression.expression) === declaration
    ) {
      inputs.push(...node.arguments);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(owner.body);
  return inputs;
}

function variableDeclarationFor(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  identifier: TypeScript.Identifier,
) {
  const declaration = checker.getSymbolAtLocation(identifier)?.valueDeclaration;
  return declaration && ts.isVariableDeclaration(declaration) ? declaration : null;
}

function containsNode(container: TypeScript.Node, target: TypeScript.Node) {
  return container.getSourceFile() === target.getSourceFile() && container.getStart() <= target.getStart() && container.getEnd() >= target.getEnd();
}

function callExpressionName(ts: typeof TypeScript, node: TypeScript.CallExpression) {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return "";
}

function inside(root: string, file: string) {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== "..");
}

function firstParty(root: string, declaration: TypeScript.Declaration) {
  const sourceFile = declaration.getSourceFile();
  if (sourceFile.isDeclarationFile || !inside(root, sourceFile.fileName)) return false;
  return !path.relative(path.resolve(root), path.resolve(sourceFile.fileName)).split(path.sep).includes("node_modules");
}
