import { describe, expect, it } from "vitest";
import type * as TypeScript from "typescript";
import { resolveResourceFetcher, returnedConsumerValue } from "../src/analysis/route-data-resource";
import { resolveBoundObjectProperty } from "../src/analysis/source-trace-object-bindings";
import { buildProgram } from "../src/project/typescript";
import type { TraceContext } from "../src/types";
import { createAnalyzerFixtureProject } from "./helpers/fixture-project";

describe("route data resource tracing", () => {
  it("retains a persisted read returned through a loop-populated collection", async () => {
    const fixture = await createAnalyzerFixtureProject({
      "src/inventory.ts": `
        declare function readJsonFile(path: string): { imageUrl: string };
        export function loadInventory(paths: string[]) {
          const results: Array<{ imageUrl: string }> = [];
          for (const path of paths) {
            const cached = readJsonFile(path);
            results.push(cached);
          }
          return results;
        }
      `,
    });
    const { ts, program } = buildProgram(fixture.args);
    const sourceFile = program.getSourceFile(`${fixture.root}/src/inventory.ts`)!;
    const readCall = findCall(ts, sourceFile, "readJsonFile");

    expect(returnedConsumerValue(ts, program.getTypeChecker(), readCall)?.getText(sourceFile)).toBe("results");
  });

  it("uses the createResource fetcher argument instead of an options object", async () => {
    const fixture = await createAnalyzerFixtureProject({
      "node_modules/solid-js/index.d.ts": "export declare function createResource<T>(source: () => string, fetcher: (id: string) => T, options?: object): T;",
      "src/resource.ts": `
        import { createResource } from "solid-js";
        export const loadRecord = (id: string) => ({ id });
        export const record = createResource(() => "a", loadRecord, { initialValue: null });
      `,
    });
    const { ts, program } = buildProgram(fixture.args);
    const sourceFile = program.getSourceFile(`${fixture.root}/src/resource.ts`)!;
    const resourceCall = findCall(ts, sourceFile, "createResource");

    expect(resolveResourceFetcher(ts, program.getTypeChecker(), fixture.root, resourceCall)?.label).toBe("loadRecord");
  });

  it("resolves only the requested property from a bound helper options object", async () => {
    const fixture = await createAnalyzerFixtureProject({
      "src/model.ts": `
        const source = { title: "Title", body: "Body" };
        const options = { stageContext: { title: source.title }, unrelated: { body: source.body } };
        function consume(model: typeof options) { return model.stageContext.title; }
        consume(options);
      `,
    });
    const { ts, program } = buildProgram(fixture.args);
    const sourceFile = program.getSourceFile(`${fixture.root}/src/model.ts`)!;
    const options = findVariable(ts, sourceFile, "options");
    const access = findPropertyAccess(ts, sourceFile, "model.stageContext.title");
    const context = traceContext(sourceFile);
    context.paramObjectBindings = new Map([["model", { expression: options.initializer as TypeScript.ObjectLiteralExpression, callerContext: context }]]);

    const resolved = resolveBoundObjectProperty(ts, access, context);

    expect(resolved?.expression.getText(sourceFile)).toBe("source.title");
    expect(resolved?.expression.getText(sourceFile)).not.toContain("source.body");
  });
});

function findCall(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, name: string) {
  return findNode(ts, sourceFile, (node): node is TypeScript.CallExpression =>
    ts.isCallExpression(node)
    && (ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "") === name,
  );
}

function findVariable(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, name: string) {
  return findNode(ts, sourceFile, (node): node is TypeScript.VariableDeclaration =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name,
  );
}

function findPropertyAccess(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, text: string) {
  return findNode(ts, sourceFile, (node): node is TypeScript.PropertyAccessExpression =>
    ts.isPropertyAccessExpression(node) && node.getText(sourceFile) === text,
  );
}

function findNode<T extends TypeScript.Node>(
  ts: typeof TypeScript,
  sourceFile: TypeScript.SourceFile,
  predicate: (node: TypeScript.Node) => node is T,
) {
  let found: T | null = null;
  const visit = (node: TypeScript.Node) => {
    if (!found && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!found) throw new Error("Expected syntax node was not found.");
  return found;
}

function traceContext(sourceFile: TypeScript.SourceFile): TraceContext {
  return {
    sourceFile,
    root: sourceFile.fileName,
    variables: new Map(),
    functions: new Map(),
    accessors: new Map(),
    parameters: new Set(),
    imports: new Set(),
    stack: new Set(),
    crossFile: null,
    crossDepth: 0,
    visitedFns: new Set(),
    paramBindings: null,
    paramObjectBindings: null,
  };
}
