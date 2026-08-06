import path from "node:path";
import type * as TypeScript from "typescript";
import { sourceIdentityForNode } from "./route-occurrence-support";
import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "./cancellation";

export type RouteOccurrenceDeclarationIndex = ReadonlyMap<string, TypeScript.Declaration>;

const indexesByProgram = new WeakMap<
  TypeScript.Program,
  Map<string, RouteOccurrenceDeclarationIndex>
>();

export function routeOccurrenceDeclarationIndex(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  files: readonly TypeScript.SourceFile[],
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteOccurrenceDeclarationIndex {
  cancellation.throwIfCancelled();
  const rootKey = path.resolve(root);
  const indexesByRoot = indexesByProgram.get(program) ?? new Map();
  indexesByProgram.set(program, indexesByRoot);
  const retained = indexesByRoot.get(rootKey);
  if (retained) return retained;

  const declarations = new Map<string, TypeScript.Declaration>();
  for (const file of files) {
    cancellation.throwIfCancelled();
    visitDeclarations(ts, file, (declaration) => {
      const identity = sourceIdentityForNode(root, declaration);
      if (!declarations.has(identity)) declarations.set(identity, declaration);
    }, cancellation);
  }
  indexesByRoot.set(rootKey, declarations);
  return declarations;
}

function visitDeclarations(
  ts: typeof TypeScript,
  file: TypeScript.SourceFile,
  retain: (declaration: TypeScript.Declaration) => void,
  cancellation: AnalysisCancellationToken,
): void {
  let visited = 0;
  const visit = (node: TypeScript.Node) => {
    visited += 1;
    if (visited % 128 === 0) cancellation.throwIfCancelled();
    if (
      ts.isFunctionDeclaration(node)
      || ts.isClassDeclaration(node)
      || ts.isMethodDeclaration(node)
    ) {
      retain(node);
    }
    if (
      ts.isVariableDeclaration(node)
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      retain(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  cancellation.throwIfCancelled();
}
