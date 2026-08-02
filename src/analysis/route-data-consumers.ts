import path from "node:path";
import type * as TypeScript from "typescript";
import type { RouteComponentRecord } from "./route-data";
import {
  declarationIdentity,
  resolveResourceFetcher,
  resolvedDeclarations,
  returnedConsumerFieldPaths,
  returnedConsumerValue,
} from "./route-data-resource";

export function collectCalledDeclarations(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  program: TypeScript.Program,
  root: string,
  routeFile: TypeScript.SourceFile,
  renderedComponents: RouteComponentRecord[],
) {
  const called = new Map<string, Set<string>>();
  const consumerFields = new Map<string, Map<string, string[]>>();
  const resourceOutputs = new Map<string, TypeScript.Expression>();
  const queue: Array<{
    declaration: TypeScript.Node;
    resourceLabels: string[];
    fieldsByResource: Map<string, string[]>;
  }> = [];
  const enqueueRecord = (entry: typeof queue[number], priority: boolean) =>
    priority ? queue.unshift(entry) : queue.push(entry);
  const enqueue = (
    declaration: TypeScript.Declaration | TypeScript.SourceFile | null,
    resourceLabels: string[] = [],
    priority = false,
    fieldsByResource = new Map<string, string[]>(),
  ) => {
    if (!declaration || !inside(root, declaration.getSourceFile().fileName)) return;
    const key = declarationIdentity(declaration);
    const retained = called.get(key);
    const retainedFields = consumerFields.get(key) ?? new Map<string, string[]>();
    let fieldsChanged = false;
    for (const [label, fields] of fieldsByResource) {
      const merged = [...new Set([...(retainedFields.get(label) ?? []), ...fields])].sort(lexical);
      if (merged.length !== (retainedFields.get(label)?.length ?? 0)) fieldsChanged = true;
      retainedFields.set(label, merged);
    }
    consumerFields.set(key, retainedFields);
    if (!retained) {
      called.set(key, new Set(resourceLabels));
      enqueueRecord({ declaration, resourceLabels, fieldsByResource: retainedFields }, priority);
      return;
    }
    const added = resourceLabels.filter((label) => !retained.has(label));
    if (!added.length && !fieldsChanged) return;
    added.forEach((label) => retained.add(label));
    enqueueRecord({ declaration, resourceLabels: [...retained], fieldsByResource: retainedFields }, priority);
  };
  for (const component of renderedComponents) {
    const sourceFile = program.getSourceFile(path.normalize(path.resolve(root, component.file)));
    enqueue(sourceFile ? namedDeclarationAt(ts, sourceFile, component.label, component.line) : null);
  }
  if (!queue.length) enqueue(routeFile);
  while (queue.length && called.size < 10_000) {
    const current = queue.shift()!;
    const visit = (node: TypeScript.Node) => {
      if (ts.isCallExpression(node)) {
        const returned = returnedConsumerValue(ts, checker, node);
        const returnedResourceLabels = returned ? current.resourceLabels : [];
        const returnedFields = new Map<string, string[]>();
        if (returned) {
          for (const label of returnedResourceLabels) {
            const inherited = current.fieldsByResource.get(label) ?? [];
            const direct = returnedConsumerFieldPaths(ts, checker, node, returned);
            returnedFields.set(label, inherited.length ? inherited : direct);
          }
        }
        for (const declaration of resolvedDeclarations(ts, checker, node.expression)) {
          enqueue(declaration, returnedResourceLabels, returnedResourceLabels.length > 0, returnedFields);
        }
        if (["createResource", "createAsync"].includes(callExpressionName(ts, node))) {
          const fetcher = resolveResourceFetcher(ts, checker, root, node);
          if (fetcher) {
            if (fetcher.output) resourceOutputs.set(fetcher.label, fetcher.output);
            for (const declaration of fetcher.declarations) {
              enqueue(declaration, [fetcher.label], true, new Map([[fetcher.label, []]]));
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(current.declaration);
  }
  return { declarations: called, resourceOutputs, consumerFields };
}

function namedDeclarationAt(
  ts: typeof TypeScript,
  sourceFile: TypeScript.SourceFile,
  name: string,
  line: number,
) {
  let sameLine: TypeScript.Declaration | null = null;
  const visit = (node: TypeScript.Node) => {
    if (declarationName(ts, node) === name) {
      const declaration = node as TypeScript.Declaration;
      const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      if (point.line + 1 === line) sameLine = declaration;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sameLine;
}

function declarationName(ts: typeof TypeScript, node: TypeScript.Node) {
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node))
    && node.name
    && ts.isIdentifier(node.name)
  ) return node.name.text;
  return null;
}

function callExpressionName(ts: typeof TypeScript, node: TypeScript.CallExpression) {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return "";
}

function inside(root: string, file: string) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function lexical(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
