import path from "node:path";
import ts from "typescript";

const configPath = path.resolve(process.argv[2] ?? "tsconfig.server.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.dirname(configPath),
  { noEmit: true, noImplicitAny: false, strict: false },
  configPath,
);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const callsByDeclaration = new Map();
const write = process.argv.includes("--write");
const editsByFile = new Map();

for (const sourceFile of program.getSourceFiles()) {
  if (sourceFile.isDeclarationFile) continue;
  visit(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const declaration = checker.getResolvedSignature(node)?.declaration;
    if (!declaration) return;
    const calls = callsByDeclaration.get(declaration) ?? [];
    calls.push(node);
    callsByDeclaration.set(declaration, calls);
  });
}

const rows = [];
for (const sourceFile of program.getSourceFiles()) {
  if (sourceFile.isDeclarationFile || sourceFile.fileName.includes("node_modules"))
    continue;
  visit(sourceFile, (node) => {
    if (!ts.isFunctionLike(node) || !node.parameters.some((p) => !p.type)) return;
    const calls = callsByDeclaration.get(node) ?? [];
    node.parameters.forEach((parameter, index) => {
      if (parameter.type) return;
      const inferred = new Set();
      for (const call of calls) {
        const argument = call.arguments[index];
        if (!argument) continue;
        const type = checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(argument));
        const text = checker.typeToString(
          type,
          node,
          ts.TypeFormatFlags.NoTruncation |
            ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
        );
        if (text !== "any" && text !== "unknown" && text !== "never") inferred.add(text);
      }
      const contextual = checker.getContextualType(parameter.name);
      const contextText = contextual
        ? checker.typeToString(contextual, node, ts.TypeFormatFlags.NoTruncation)
        : null;
      const position = sourceFile.getLineAndCharacterOfPosition(parameter.getStart());
      const suggested = suggestionFor(parameter, [...inferred], contextText);
      if (write && suggested) {
        const edits = editsByFile.get(sourceFile.fileName) ?? [];
        edits.push({ position: parameter.name.end, text: `: ${suggested}` });
        editsByFile.set(sourceFile.fileName, edits);
      }
      rows.push({
        file: path.relative(process.cwd(), sourceFile.fileName),
        line: position.line + 1,
        function: functionName(node),
        parameter: parameter.name.getText(sourceFile),
        calls: calls.length,
        inferred: [...inferred].sort(),
        contextual: contextText === "any" ? null : contextText,
        suggested,
      });
    });
  });
}

const resolved = rows.filter((row) => row.inferred.length || row.contextual);
if (write) {
  for (const [file, edits] of editsByFile) {
    let text = ts.sys.readFile(file);
    for (const edit of edits.sort((a, b) => b.position - a.position)) {
      text = text.slice(0, edit.position) + edit.text + text.slice(edit.position);
    }
    fsWrite(file, text);
  }
}
const repeated = new Map();
for (const row of resolved) {
  const signature = row.inferred.join(" | ") || row.contextual;
  repeated.set(signature, (repeated.get(signature) ?? 0) + 1);
}
process.stdout.write(
  `${JSON.stringify(
    {
      summary: {
        parameters: rows.length,
        resolved: resolved.length,
        unresolved: rows.length - resolved.length,
        reusableShapes: [...repeated.values()].filter((count) => count > 1).length,
      },
      reusable: [...repeated]
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40),
      parameters: rows,
    },
    null,
    2,
  )}\n`,
);

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function functionName(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name))
    return node.parent.name.text;
  return "<callback>";
}

function suggestionFor(parameter, inferred, contextual) {
  const name = ts.isIdentifier(parameter.name) ? parameter.name.text : "";
  const domain = (type) => {
    let relative = path.relative(
      path.dirname(parameter.getSourceFile().fileName),
      path.resolve("src/types.ts"),
    ).replaceAll(path.sep, "/").replace(/\.ts$/, ".js");
    if (!relative.startsWith(".")) relative = `./${relative}`;
    return `import("${relative}").${type}`;
  };
  if (/^(?:sink|current|top|other|left|right)$/.test(name) && parameter.parent.parameters.some((p) => ts.isIdentifier(p.name) && /sink/i.test(p.name.text)))
    return domain("Sink");
  if (/sinks$/i.test(name)) return `${domain("Sink")}[]`;
  if (name === "report") return domain("AnalysisReport");
  if (name === "args") return domain("AnalyzerArgs");
  if (name === "graph") return domain("AnalysisGraph");
  if (name === "trace") return domain("TraceResult");
  if (name === "metrics") return domain("SinkMetrics");
  if (/^(?:string|number|boolean)$/.test(contextual ?? "")) return contextual;
  if (name === "ts") return 'typeof import("typescript")';
  if (name === "checker") return 'import("typescript").TypeChecker';
  if (name === "sourceFile") return 'import("typescript").SourceFile';
  if (name === "sourceFiles") return 'import("typescript").SourceFile[]';
  if (name === "program") return 'import("typescript").Program';
  if (name === "useChecker") return 'import("typescript").TypeChecker';
  if (name === "symbol") return 'import("typescript").Symbol';
  if (name === "identifier") return 'import("typescript").Identifier';
  if (name === "declaration") return 'import("typescript").Declaration';
  if (name === "fnNode") return 'import("typescript").FunctionLikeDeclaration';
  if (/^(?:root|file|relPath|label|name|text|view|scope|pattern|kind|operation|callee|typeText|expressionText|noun)$/.test(name)) return "string";
  if (/^(?:line|column|depth|index|count|startLine|endLine)$/.test(name)) return "number";
  if (name === "context" && parameter.getSourceFile().fileName.includes("source-trace")) return domain("TraceContext");
  if (name === "paramNames") return "string[]";
  if (name === "defenses") return `${domain("DefenseRecord")}[]`;
  const siblingNames = parameter.parent.parameters
    .filter((p) => ts.isIdentifier(p.name))
    .map((p) => p.name.text);
  if (["node", "expression", "fn", "attribute", "opening"].includes(name) && siblingNames.includes("ts"))
    return 'import("typescript").Node';
  const candidates = [...new Set(inferred)].filter(
    (type) => /^(?:string|number|boolean|string\[\]|number\[\]|URL)$/.test(type),
  );
  if (candidates.length === 1) return candidates[0];
  if (/^(?:string|number|boolean)$/.test(contextual ?? "")) return contextual;
  return null;
}

function fsWrite(file, text) {
  ts.sys.writeFile(file, text);
}
