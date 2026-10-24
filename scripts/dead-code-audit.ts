// Dead-code audit: which source files and exports are reachable only from tests
// (or from nothing). "Dead" means no production entry point reaches it; a test
// import does not keep code alive. Re-run after each cleanup pass, because
// removing one dead caller can expose more dead callees.
//
//   pnpm audit:dead-code            # Markdown summary on stdout
//   pnpm audit:dead-code --json out.json
import fs from "node:fs";
import path from "node:path";
import TypeScript from "typescript";

const ts = TypeScript;
const root = process.cwd();
const rel = (file: string) => path.relative(root, file);
const isTest = (file: string) => rel(file).startsWith("test/");
const isOurs = (file: string) => file.startsWith(root) && !file.includes("node_modules");

// Production entry points. Keep in sync with package.json bins/scripts, the
// worker URL in src/server/analysis-service.ts, and src/frontend/index.html.
const PRODUCT_ENTRIES = [
  "bin/tsx-dataflow.ts",
  "bin/tsx-dataflow-serve.ts",
  "bin/analysis-worker.ts",
  "src/server-cli.ts",
  "src/server/analysis-worker.ts",
  "src/frontend/src/App.tsx",
];
const TOOLING_ENTRIES = [
  "examples/regenerate.ts",
  "vite.frontend.config.ts",
  ...fs.readdirSync("scripts").filter((file) => file.endsWith(".ts")).map((file) => `scripts/${file}`),
];

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "__snapshots__" ? [] : walk(full);
    return /\.(ts|tsx|mts)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

const files = [...walk("src"), ...walk("bin"), ...walk("scripts"), ...walk("test"), ...TOOLING_ENTRIES.filter((file) => !file.startsWith("scripts/"))]
  .map((file) => path.resolve(file));
const options: TypeScript.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
  jsxImportSource: "solid-js",
  noEmit: true,
  skipLibCheck: true,
};
const program = ts.createProgram(files, options);
const checker = program.getTypeChecker();
const ourSourceFiles = program.getSourceFiles().filter((sourceFile) => isOurs(sourceFile.fileName));

// File import graph, including re-export edges. `runtimeImports` drops
// type-only edges so a module kept alive only by `import type` shows up.
const imports = new Map<string, Set<string>>();
const runtimeImports = new Map<string, Set<string>>();
const isTypeOnlyEdge = (node: TypeScript.ImportDeclaration | TypeScript.ExportDeclaration) => {
  if (ts.isExportDeclaration(node)) return node.isTypeOnly;
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return !clause.name && bindings !== undefined && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
};
for (const sourceFile of ourSourceFiles) {
  const dependencies = new Set<string>();
  const runtimeDependencies = new Set<string>();
  const visit = (node: TypeScript.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const resolved = ts.resolveModuleName(node.moduleSpecifier.text, sourceFile.fileName, options, ts.sys).resolvedModule?.resolvedFileName;
      if (resolved && isOurs(resolved)) {
        dependencies.add(path.resolve(resolved));
        if (!isTypeOnlyEdge(node)) runtimeDependencies.add(path.resolve(resolved));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  imports.set(path.resolve(sourceFile.fileName), dependencies);
  runtimeImports.set(path.resolve(sourceFile.fileName), runtimeDependencies);
}

function reach(starts: string[], graph = imports) {
  const seen = new Set<string>();
  const stack = starts.map((file) => path.resolve(file));
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const dependency of graph.get(file) ?? []) stack.push(dependency);
  }
  return seen;
}

const product = reach(PRODUCT_ENTRIES);
const runtimeLive = reach([...PRODUCT_ENTRIES, ...TOOLING_ENTRIES], runtimeImports);
const live = reach([...PRODUCT_ENTRIES, ...TOOLING_ENTRIES]);
const testReach = reach([...imports.keys()].filter(isTest));
const sourceFiles = [...imports.keys()].filter((file) => !isTest(file));
const lineCount = (file: string) => fs.readFileSync(file, "utf8").split("\n").length;

// Symbol references: count referencing files per declaration, split into live
// production files and test files. References from dead files do not count.
type References = { live: Set<string>; test: Set<string>; self: number };
const references = new Map<TypeScript.Symbol, References>();
const declaringFile = new Map<TypeScript.Symbol, string>();
const target = (symbol: TypeScript.Symbol) => {
  if (!(symbol.flags & ts.SymbolFlags.Alias)) return symbol;
  try { return checker.getAliasedSymbol(symbol); } catch { return symbol; }
};
for (const sourceFile of ourSourceFiles) {
  const current = path.resolve(sourceFile.fileName);
  const visit = (node: TypeScript.Node) => {
    if (ts.isIdentifier(node)) {
      let symbol = checker.getSymbolAtLocation(node);
      if (ts.isShorthandPropertyAssignment(node.parent)) symbol = checker.getShorthandAssignmentValueSymbol(node.parent) ?? symbol;
      const declaration = symbol && target(symbol).declarations?.[0];
      if (symbol && declaration && isOurs(declaration.getSourceFile().fileName)) {
        const resolved = target(symbol);
        const declarationFile = path.resolve(declaration.getSourceFile().fileName);
        let entry = references.get(resolved);
        if (!entry) {
          entry = { live: new Set(), test: new Set(), self: 0 };
          references.set(resolved, entry);
          declaringFile.set(resolved, declarationFile);
        }
        if (declarationFile === current) entry.self++;
        else if (isTest(current)) entry.test.add(rel(current));
        else if (live.has(current)) entry.live.add(rel(current));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

type ExportRow = { file: string; name: string; isType: boolean; testFiles: string[]; internalUses: number };
const deadExports: ExportRow[] = [];
const testOnlyExports: ExportRow[] = [];
const internalOnlyExports: ExportRow[] = [];
for (const file of sourceFiles.filter((candidate) => live.has(candidate))) {
  const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(file)!);
  if (!moduleSymbol) continue;
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = target(exported);
    if (declaringFile.has(symbol) && declaringFile.get(symbol) !== file) continue;
    const entry = references.get(symbol) ?? { live: new Set<string>(), test: new Set<string>(), self: 1 };
    if (entry.live.size > 0) continue;
    const row = {
      file: rel(file),
      name: exported.name,
      isType: Boolean(symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)),
      testFiles: [...entry.test],
      internalUses: entry.self - 1,
    };
    if (row.internalUses > 0) internalOnlyExports.push(row);
    else if (row.testFiles.length > 0) testOnlyExports.push(row);
    else deadExports.push(row);
  }
}

const deadFiles = sourceFiles.filter((file) => !live.has(file)).map((file) => ({
  file: rel(file),
  lines: lineCount(file),
  testedBy: testReach.has(file) ? [...imports].filter(([from, to]) => isTest(from) && to.has(file)).map(([from]) => rel(from)) : [],
}));
const toolingOnlyFiles = sourceFiles.filter((file) => live.has(file) && !product.has(file)).map(rel);
// Type-only reach is fine for files that hold only types; the interesting rows
// are files with runtime code that nothing ever executes.
const typeOnlyFiles = sourceFiles.filter((file) => live.has(file) && !runtimeLive.has(file)).map((file) => ({ file: rel(file), lines: lineCount(file) }));

const jsonIndex = process.argv.indexOf("--json");
if (jsonIndex >= 0) {
  fs.writeFileSync(process.argv[jsonIndex + 1], JSON.stringify({ deadFiles, toolingOnlyFiles, typeOnlyFiles, deadExports, testOnlyExports, internalOnlyExports }, null, 1));
}

const code = (value: string) => `\`${value}\``;
const groupByFile = (rows: ExportRow[]) => {
  const grouped = new Map<string, string[]>();
  for (const row of rows) grouped.set(row.file, [...(grouped.get(row.file) ?? []), row.name]);
  return [...grouped].map(([file, names]) => `| ${code(file)} | ${names.map(code).join(", ")} |`);
};
const output = [
  "# Dead-code audit",
  "",
  `Unreachable source files: ${deadFiles.length} (${deadFiles.reduce((sum, row) => sum + row.lines, 0)} lines)`,
  "",
  "| File | Lines | Imported by tests |",
  "|---|---:|---|",
  ...deadFiles.map((row) => `| ${code(row.file)} | ${row.lines} | ${row.testedBy.map(code).join(", ")} |`),
  "",
  `Tooling-only files (reached from scripts/examples, not the product): ${toolingOnlyFiles.map(code).join(", ")}`,
  "",
  `Files reached only through \`import type\` (their runtime code never executes): ${typeOnlyFiles.length}`,
  "",
  ...typeOnlyFiles.map((row) => `- ${code(row.file)} (${row.lines} lines)`),
  "",
  `Unused value exports in live files: ${deadExports.filter((row) => !row.isType).length}`,
  "",
  "| File | Exports |",
  "|---|---|",
  ...groupByFile(deadExports.filter((row) => !row.isType)),
  "",
  `Unused type exports in live files: ${deadExports.filter((row) => row.isType).length}`,
  "",
  "| File | Exports |",
  "|---|---|",
  ...groupByFile(deadExports.filter((row) => row.isType)),
  "",
  `Test-only exports in live files: ${testOnlyExports.length}`,
  "",
  "| File | Exports |",
  "|---|---|",
  ...groupByFile(testOnlyExports),
  "",
  `Exports used only inside their own file (drop the \`export\`): ${internalOnlyExports.length}`,
];
process.stdout.write(`${output.join("\n")}\n`);
