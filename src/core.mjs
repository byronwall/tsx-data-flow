import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const DEFAULT_IGNORED_PARTS = new Set([
  "node_modules",
  "dist",
  "build",
  ".solid",
  ".vinxi",
  ".output",
  "coverage",
  "styled-system",
]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const VALID_FORMATS = new Set(["json", "markdown"]);
const VALID_VIEWS = new Set([
  "findings",
  "work-packets",
  "dossier",
  "fan-out",
  "fan-in",
  "path-gallery",
  "path-census",
  "path-families",
  "transformation-ledger",
  "defensive-ledger",
  "prop-relay",
  "context-relay",
  "repair-map",
]);
// This package's own directory (one level up from src/). Used as a last-resort
// location for resolving the bundled `typescript` dependency.
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Run as a global CLI, the analyzer is invoked from inside the target project,
// so the current working directory is the right default root.
const defaultRoot = process.cwd();

export function parseArgs(argv, defaults = {}) {
  const args = {
    root: defaults.root ?? defaultRoot,
    source: defaults.source ?? null,
    tsconfig: defaults.tsconfig ?? null,
    typescriptFrom: defaults.typescriptFrom ?? null,
    format: defaults.format ?? "markdown",
    view: defaults.view ?? "work-packets",
    scope: defaults.scope ?? null,
    out: defaults.out ?? null,
    baseline: defaults.baseline ?? null,
    maxItems: defaults.maxItems ?? 20,
    includeTests: defaults.includeTests ?? false,
    failOnRegression: defaults.failOnRegression ?? false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [name, inlineValue] = raw.split("=", 2);
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${raw}`);
      return argv[index];
    };

    switch (name) {
      case "--root":
        args.root = readValue();
        break;
      case "--source":
        args.source = readValue();
        break;
      case "--tsconfig":
        args.tsconfig = readValue();
        break;
      case "--typescript-from":
        args.typescriptFrom = readValue();
        break;
      case "--format":
        args.format = readValue();
        break;
      case "--view":
        args.view = readValue();
        break;
      case "--scope":
        args.scope = readValue();
        break;
      case "--max-items":
        args.maxItems = Number.parseInt(readValue(), 10);
        break;
      case "--out":
        args.out = readValue();
        break;
      case "--baseline":
        args.baseline = readValue();
        break;
      case "--include-tests":
        args.includeTests = true;
        break;
      case "--fail-on-regression":
        args.failOnRegression = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${raw}`);
    }
  }

  if (!VALID_FORMATS.has(args.format)) {
    throw new Error("--format must be json or markdown");
  }
  if (!VALID_VIEWS.has(args.view)) {
    throw new Error(
      `--view must be one of: ${Array.from(VALID_VIEWS).join(", ")}`,
    );
  }
  if (!Number.isFinite(args.maxItems) || args.maxItems < 1) {
    throw new Error("--max-items must be a positive number");
  }

  args.root = path.resolve(args.root);
  args.source = args.source
    ? path.resolve(args.root, args.source)
    : findDefaultSource(args.root);
  args.tsconfig = args.tsconfig
    ? path.resolve(args.root, args.tsconfig)
    : findDefaultTsconfig(args.root, args.source);
  args.typescriptFrom = args.typescriptFrom
    ? path.resolve(args.root, args.typescriptFrom)
    : null;
  args.out = args.out ? path.resolve(process.cwd(), args.out) : null;
  args.baseline = args.baseline
    ? path.resolve(process.cwd(), args.baseline)
    : null;

  return args;
}

export function helpText() {
  return `tsx-dataflow — render-path data-flow analyzer for TS/TSX projects

Usage:
  tsx-dataflow [options]

Options:
  --root <path>             Project root. Defaults to the current directory.
  --source <path>           Source root. Defaults to ./src (or ./app/src) when present.
  --tsconfig <path>         TypeScript config. Defaults to the nearest tsconfig.json.
  --typescript-from <path>  Extra directory used to resolve TypeScript.
  --format <json|markdown>  Output format. Defaults to markdown.
  --view <name>             Report view. Defaults to work-packets.
  --scope <value>           Limit report to a file, component, or symbol substring.
  --max-items <number>      Limit displayed findings or rows. Defaults to 20.
  --baseline <path>         Compare against a prior JSON report.
  --fail-on-regression      Exit non-zero only when baseline comparison regresses.
  --out <path>              Write report to a file instead of stdout.
  --include-tests           Include *.test.* and *.spec.* files.
  --help                    Show this help.

Views:
  ${Array.from(VALID_VIEWS).join(", ")}
`;
}

export function findDefaultSource(root) {
  const source = path.join(root, "src");
  if (fs.existsSync(source)) return source;
  const appSource = path.join(root, "app", "src");
  if (fs.existsSync(appSource)) return appSource;
  return root;
}

export function findDefaultTsconfig(root, sourceRoot) {
  const candidates = [
    path.join(path.dirname(sourceRoot), "tsconfig.json"),
    path.join(root, "app", "tsconfig.json"),
    path.join(root, "tsconfig.json"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function loadTypescript(args) {
  const bases = [
    args.typescriptFrom,
    args.tsconfig ? path.dirname(args.tsconfig) : null,
    args.source,
    path.join(args.root, "app"),
    args.root,
    process.cwd(),
    // Fall back to the analyzer's own dependency when the target project does
    // not ship its own TypeScript install.
    packageDir,
  ].filter(Boolean);

  const attempted = [];
  for (const base of unique(bases)) {
    try {
      const resolved = require.resolve("typescript", { paths: [base] });
      return { ts: require(resolved), modulePath: resolved };
    } catch {
      attempted.push(base);
    }
  }

  throw new Error(
    `Unable to resolve "typescript".\n` +
      `Tried:\n${attempted.map((base) => `  - ${base}`).join("\n")}\n` +
      `Install TypeScript in the target project ` +
      `(npm install -D typescript / pnpm add -D typescript / bun add -d typescript), ` +
      `or pass --typescript-from <path-to-a-dir-with-typescript-installed>.`,
  );
}

export function collectSourceFiles(ts, args) {
  if (args.tsconfig && fs.existsSync(args.tsconfig)) {
    const configFile = ts.readConfigFile(args.tsconfig, ts.sys.readFile);
    if (configFile.error) {
      const message = ts.flattenDiagnosticMessageText(
        configFile.error.messageText,
        "\n",
      );
      throw new Error(`Failed to read ${args.tsconfig}: ${message}`);
    }
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(args.tsconfig),
      undefined,
      args.tsconfig,
    );
    return parsed.fileNames.filter((file) => shouldAnalyzeFile(file, args));
  }

  return walkFiles(args.source).filter((file) => shouldAnalyzeFile(file, args));
}

export async function analyzeProject(args) {
  const { ts, modulePath } = loadTypescript(args);
  const files = collectSourceFiles(ts, args);
  const program = ts.createProgram(files, readCompilerOptions(ts, args));
  return buildReport(ts, program, args, modulePath);
}

export function analyzeProgram(ts, program, args = {}) {
  return buildReport(ts, program, {
    root: args.root ?? process.cwd(),
    source: args.source ?? process.cwd(),
    scope: args.scope ?? null,
    maxItems: args.maxItems ?? 20,
    baseline: args.baseline ?? null,
  });
}

export function renderReport(report, args) {
  if (args.format === "json") {
    return `${JSON.stringify(selectViewPayload(report, args), null, 2)}\n`;
  }

  switch (args.view) {
    case "findings":
      return renderFindings(report, args);
    case "work-packets":
      return renderWorkPackets(report, args);
    case "dossier":
      return renderDossier(report);
    case "fan-out":
      return renderFanOut(report, args);
    case "fan-in":
      return renderFanIn(report, args);
    case "path-gallery":
      return renderPathGallery(report, args);
    case "path-census":
      return renderPathCensus(report);
    case "path-families":
      return renderPathFamilies(report, args);
    case "transformation-ledger":
      return renderTransformationLedger(report);
    case "defensive-ledger":
      return renderDefensiveLedger(report, args);
    case "prop-relay":
      return renderPropRelay(report, args);
    case "context-relay":
      return renderContextRelay(report, args);
    case "repair-map":
      return renderRepairMap(report, args);
    default:
      return renderWorkPackets(report, args);
  }
}

export async function writeReport(reportText, outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, reportText);
}

function buildReport(ts, program, args, typescriptModulePath = null) {
  const checker = program.getTypeChecker();
  const graph = createGraph(args.root);
  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isDeclarationFile)
    .filter((sourceFile) => shouldAnalyzeFile(sourceFile.fileName, args));
  const sinks = [];

  for (const sourceFile of sourceFiles) {
    sinks.push(...analyzeSourceFile(ts, checker, graph, sourceFile, args));
  }

  const filteredSinks = applyScope(sinks, args.scope);
  groundReachability(filteredSinks);
  const contextRelay = applyContextRelayScope(
    analyzeContextRelay(ts, sourceFiles, args.root),
    args.scope,
  );
  const rankings = rankSinks(filteredSinks.filter((sink) => sink.category !== "event-handler"));
  const baseline = args.baseline ? compareBaseline(rankings, args.baseline) : null;

  return {
    analysisVersion: 1,
    generatedAt: new Date().toISOString(),
    meta: {
      root: args.root,
      source: args.source,
      tsconfig: args.tsconfig ?? null,
      typescript: typescriptModulePath,
      scope: args.scope,
    },
    graph: {
      nodes: graph.nodes,
      edges: graph.edges,
      unknownEdges: graph.edges.filter((edge) => edge.unknown).length,
    },
    sinks: filteredSinks,
    contextRelay,
    rankings,
    baseline,
    summary: summarize(filteredSinks, graph),
  };
}

function analyzeSourceFile(ts, checker, graph, sourceFile, args) {
  const context = buildFileContext(ts, sourceFile);
  const sinks = [];

  const visit = (node) => {
    const sinkExpression = getSinkExpression(ts, node);
    if (sinkExpression) {
      const trace = traceExpression(ts, checker, graph, sinkExpression.expression, {
        ...context,
        sourceFile,
        root: args.root,
        stack: new Set(),
      });
      const sinkNode = addNode(graph, {
        kind: "jsx-sink",
        label: sinkExpression.label,
        file: relativePath(args.root, sourceFile.fileName),
        location: locationOf(sourceFile, node),
        type: "DOM",
      });
      addEdge(graph, trace.lastNodeId, sinkNode.id, "jsx-sink", node);
      sinks.push(buildSinkRecord(ts, checker, sourceFile, node, sinkExpression, trace, sinkNode, args.root));
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return sinks;
}

function buildFileContext(ts, sourceFile) {
  const variables = new Map();
  const functions = new Map();
  const accessors = new Map();
  const parameters = new Set();

  const visit = (node) => {
    if (ts.isVariableDeclaration(node)) {
      registerVariable(ts, node, variables, accessors);
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name)) parameters.add(parameter.name.text);
      }
    }
    if (
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      node.parent &&
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      functions.set(node.parent.name.text, node);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name)) parameters.add(parameter.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { variables, functions, accessors, parameters };
}

function registerVariable(ts, node, variables, accessors) {
  if (ts.isIdentifier(node.name)) {
    variables.set(node.name.text, node);
    if (node.initializer && isCallNamed(ts, node.initializer, "createMemo")) {
      accessors.set(node.name.text, { kind: "memo", declaration: node });
    }
    return;
  }

  if (ts.isArrayBindingPattern(node.name) && node.initializer) {
    const callName = getCallName(ts, node.initializer);
    node.name.elements.forEach((element, index) => {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        variables.set(element.name.text, node);
        if (index === 0 && ["createSignal", "createResource"].includes(callName)) {
          accessors.set(element.name.text, {
            kind: callName === "createSignal" ? "signal" : "resource",
            declaration: node,
          });
        }
      }
    });
    return;
  }

  if (ts.isObjectBindingPattern(node.name)) {
    node.name.elements.forEach((element) => {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        variables.set(element.name.text, node);
      }
    });
  }
}

function getSinkExpression(ts, node) {
  if (ts.isJsxExpression(node) && node.expression) {
    const parent = node.parent;
    if (parent && ts.isJsxAttribute(parent)) return null;
    return {
      expression: node.expression,
      category: "rendered-value",
      label: `JSX ${node.expression.getText().slice(0, 80)}`,
    };
  }

  if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)) {
    const expression = node.initializer.expression;
    if (!expression) return null;
    const name = node.name.getText();
    const event = /^on[A-Z]/.test(name);
    return {
      expression,
      category: event ? "event-handler" : classifyAttribute(name),
      label: `${name}={...}`,
    };
  }
  return null;
}

function traceExpression(ts, checker, graph, expression, context) {
  const text = expression.getText();
  if (context.stack.has(expression)) {
    return sourceTrace(graph, expression, "cycle", text, true);
  }
  const nextContext = { ...context, stack: new Set([...context.stack, expression]) };

  if (ts.isIdentifier(expression)) {
    return traceIdentifier(ts, checker, graph, expression, nextContext);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return tracePropertyAccess(ts, checker, graph, expression, nextContext);
  }
  if (ts.isElementAccessExpression(expression)) {
    return addOperationTrace(ts, graph, "property-read", expression, [
      traceExpression(ts, checker, graph, expression.expression, nextContext),
    ]);
  }
  if (ts.isCallExpression(expression)) {
    return traceCallExpression(ts, checker, graph, expression, nextContext);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return traceObjectLiteral(ts, checker, graph, expression, nextContext);
  }
  if (ts.isConditionalExpression(expression)) {
    return addOperationTrace(ts, graph, "conditional", expression, [
      traceExpression(ts, checker, graph, expression.condition, nextContext),
      traceExpression(ts, checker, graph, expression.whenTrue, nextContext),
      traceExpression(ts, checker, graph, expression.whenFalse, nextContext),
    ]);
  }
  if (ts.isBinaryExpression(expression)) {
    return traceBinaryExpression(ts, checker, graph, expression, nextContext);
  }
  if (ts.isParenthesizedExpression(expression)) {
    return traceExpression(ts, checker, graph, expression.expression, nextContext);
  }
  if (ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) {
    return traceExpression(ts, checker, graph, expression.expression, nextContext);
  }
  if (ts.isTemplateExpression(expression)) {
    return addOperationTrace(
      ts,
      graph,
      "template",
      expression,
      expression.templateSpans.map((span) =>
        traceExpression(ts, checker, graph, span.expression, nextContext),
      ),
    );
  }
  if (ts.isPrefixUnaryExpression(expression)) {
    return addOperationTrace(ts, graph, "conditional", expression, [
      traceExpression(ts, checker, graph, expression.operand, nextContext),
    ]);
  }

  return sourceTrace(graph, expression, "literal", text, false);
}

function traceIdentifier(ts, checker, graph, expression, context) {
  const name = expression.text;
  const accessor = context.accessors.get(name);
  if (accessor) return traceAccessor(ts, checker, graph, expression, accessor, context);

  const declaration = context.variables.get(name);
  if (declaration?.initializer && declaration.initializer !== expression) {
    const trace = traceExpression(ts, checker, graph, declaration.initializer, context);
    return addOperationTrace(ts, graph, "alias", expression, [trace], { label: name });
  }

  const isParameter = context.parameters.has(name);
  const unknown = !isParameter && !declaration;
  // Track the root kind separately from the graph node kind: a bare parameter
  // object (e.g. `props`) is too coarse to be one fan-out "source", so we tag
  // it `parameter` and let property reads off it refine into concrete sources.
  const rootKind = unknown ? "unknown-source" : isParameter ? "parameter" : "source";
  return sourceTrace(graph, expression, unknown ? "unknown-source" : "source", name, unknown, rootKind);
}

function traceAccessor(ts, checker, graph, expression, accessor, context) {
  const call = accessor.declaration.initializer;
  if (!call || !ts.isCallExpression(call)) {
    return sourceTrace(graph, expression, "solid-accessor", expression.getText(), true);
  }
  if (accessor.kind === "memo") {
    const callback = call.arguments[0];
    const body = getFunctionReturnExpression(ts, callback);
    if (body) {
      const trace = traceExpression(ts, checker, graph, body, context);
      return addOperationTrace(ts, graph, "solid-accessor", expression, [trace], {
        label: `${expression.text}() memo`,
      });
    }
  }
  if (accessor.kind === "signal") {
    const trace = call.arguments[0]
      ? traceExpression(ts, checker, graph, call.arguments[0], context)
      : sourceTrace(graph, expression, "solid-accessor", `${expression.text}()`, true);
    return addOperationTrace(ts, graph, "solid-accessor", expression, [trace], {
      label: `${expression.text}() signal`,
    });
  }
  return sourceTrace(graph, expression, "solid-accessor", `${expression.text}() resource`, true);
}

function tracePropertyAccess(ts, checker, graph, expression, context) {
  const receiverTrace = traceExpression(ts, checker, graph, expression.expression, context);
  const kind = expression.questionDotToken ? "optional-read" : "property-read";
  const operation = addOperationTrace(ts, graph, kind, expression, [receiverTrace], {
    label: expression.name.text,
  });
  // Refine the first concrete property read off a bare parameter into a
  // qualified root (`props` -> `props.meta`). `props` alone is too coarse to
  // rank as one source; the property read is the value that actually fans out.
  if (
    ts.isIdentifier(expression.expression) &&
    receiverTrace.rootInfos?.length === 1 &&
    receiverTrace.rootInfos[0].kind === "parameter" &&
    receiverTrace.rootInfos[0].label === expression.expression.text
  ) {
    const qualified = `${expression.expression.text}.${expression.name.text}`;
    operation.rootInfos = [{ label: qualified, kind: "prop-read" }];
    operation.roots = [qualified];
  }
  if (expression.questionDotToken) {
    operation.defenses.push(defenseRecord(ts, checker, expression.expression, expression, kind));
  }
  return operation;
}

function traceCallExpression(ts, checker, graph, expression, context) {
  const callee = getCallName(ts, expression);
  if (ts.isIdentifier(expression.expression) && context.functions.has(callee)) {
    const fn = context.functions.get(callee);
    const returnExpression = getFunctionReturnExpression(ts, fn);
    const traces = expression.arguments.map((argument) =>
      traceExpression(ts, checker, graph, argument, context),
    );
    if (returnExpression) {
      traces.push(traceExpression(ts, checker, graph, returnExpression, context));
    }
    return addOperationTrace(ts, graph, "call", expression, traces, { label: callee });
  }

  if (ts.isIdentifier(expression.expression) && context.accessors.has(callee)) {
    return traceAccessor(ts, checker, graph, expression.expression, context.accessors.get(callee), context);
  }

  const traces = [];
  if (ts.isPropertyAccessExpression(expression.expression)) {
    traces.push(traceExpression(ts, checker, graph, expression.expression.expression, context));
  }
  traces.push(
    ...expression.arguments.map((argument) =>
      traceExpression(ts, checker, graph, argument, context),
    ),
  );
  return addOperationTrace(ts, graph, "call", expression, traces, {
    label: callee || "call",
    unknown: !callee || !context.functions.has(callee),
  });
}

function traceObjectLiteral(ts, checker, graph, expression, context) {
  const traces = [];
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      traces.push(traceExpression(ts, checker, graph, property.expression, context));
    } else if (ts.isPropertyAssignment(property)) {
      traces.push(traceExpression(ts, checker, graph, property.initializer, context));
    } else if (ts.isShorthandPropertyAssignment(property)) {
      traces.push(traceExpression(ts, checker, graph, property.name, context));
    }
  }
  return addOperationTrace(ts, graph, "object-pack", expression, traces);
}

function traceBinaryExpression(ts, checker, graph, expression, context) {
  const operator = expression.operatorToken.kind;
  const kind =
    operator === ts.SyntaxKind.QuestionQuestionToken ||
    operator === ts.SyntaxKind.BarBarToken
      ? "fallback"
      : "conditional";
  const trace = addOperationTrace(ts, graph, kind, expression, [
    traceExpression(ts, checker, graph, expression.left, context),
    traceExpression(ts, checker, graph, expression.right, context),
  ]);
  if (operator === ts.SyntaxKind.QuestionQuestionToken) {
    trace.defenses.push(defenseRecord(ts, checker, expression.left, expression, "fallback"));
  }
  return trace;
}

function addOperationTrace(ts, graph, kind, expression, traces, options = {}) {
  const label = options.label ?? expression.getText().slice(0, 80);
  const node = addNode(graph, {
    kind,
    label,
    file: relativePath(graph.root, expression.getSourceFile().fileName),
    location: locationOf(expression.getSourceFile(), expression),
    type: safeTypeText(options.type),
  });
  const edges = [];
  const rootInfos = [];
  const defenses = [];
  let longest = [label];
  for (const trace of traces.filter(Boolean)) {
    addEdge(graph, trace.lastNodeId, node.id, kind, expression, options.unknown);
    edges.push(...trace.edges, kind);
    rootInfos.push(...(trace.rootInfos ?? trace.roots.map((root) => ({ label: root, kind: "source" }))));
    defenses.push(...trace.defenses);
    if (trace.longestPath.length + 1 > longest.length) {
      longest = [...trace.longestPath, label];
    }
  }
  if (traces.length === 0) rootInfos.push({ label, kind: "operation" });
  const dedupedRoots = uniqueRootInfos(rootInfos);
  return {
    lastNodeId: node.id,
    roots: dedupedRoots.map((root) => root.label),
    rootInfos: dedupedRoots,
    edges,
    defenses,
    longestPath: longest,
  };
}

// Deduplicate root descriptors by label, keeping the first (most specific)
// kind seen. Sources are tracked with their node kind so reports can filter
// out literal/primitive roots that are not actionable "sources".
function uniqueRootInfos(rootInfos) {
  const seen = new Map();
  for (const info of rootInfos) {
    if (!info || !info.label) continue;
    if (!seen.has(info.label)) seen.set(info.label, info);
  }
  return Array.from(seen.values());
}

function sourceTrace(graph, expression, kind, label, unknown, rootKind = kind) {
  const node = addNode(graph, {
    kind,
    label,
    file: relativePath(graph.root, expression.getSourceFile().fileName),
    location: locationOf(expression.getSourceFile(), expression),
    type: safeTypeText(),
  });
  return {
    lastNodeId: node.id,
    roots: [label],
    rootInfos: [{ label, kind: rootKind }],
    edges: [],
    defenses: [],
    longestPath: [label],
    unknown,
  };
}

function buildSinkRecord(ts, checker, sourceFile, node, sinkExpression, trace, sinkNode, root) {
  const location = locationOf(sourceFile, node);
  const metrics = metricsFor(trace);
  const sinkId = `RPF-${String(location.line).padStart(3, "0")}-${String(location.column).padStart(2, "0")}`;
  return {
    id: sinkId,
    file: relativePath(root, sourceFile.fileName),
    line: location.line,
    column: location.column,
    category: sinkExpression.category,
    label: sinkExpression.label,
    expression: sinkExpression.expression.getText(),
    type: safeTypeText(checker.typeToString(checker.getTypeAtLocation(sinkExpression.expression))),
    roots: trace.roots,
    rootInfos: trace.rootInfos ?? trace.roots.map((root) => ({ label: root, kind: "source" })),
    representativePath: trace.longestPath,
    nodeId: sinkNode.id,
    metrics,
    defenses: trace.defenses,
    confidence: confidenceFor(metrics, trace.defenses),
    queue: queueFor(metrics, trace.defenses),
  };
}

function metricsFor(trace) {
  const edgeCounts = countBy(trace.edges);
  const defensiveOperationCount =
    (edgeCounts.fallback ?? 0) + (edgeCounts["optional-read"] ?? 0);
  const representationChurn =
    (edgeCounts["object-pack"] ?? 0) + (edgeCounts["object-spread"] ?? 0) + (edgeCounts.alias ?? 0);
  const helperHops = edgeCounts.call ?? 0;
  const impossibleDefenseCount = trace.defenses.filter(
    (defense) => defense.verdict === "impossible",
  ).length;
  const unknownEdgeCount = trace.edges.filter((edge) => edge === "unknown").length;
  return {
    sliceSize: trace.edges.length + trace.longestPath.length,
    maximumPathDepth: trace.longestPath.length,
    helperHops,
    representationChurn,
    defensiveOperationCount,
    impossibleDefenseCount,
    controlDependencyCount: edgeCounts.conditional ?? 0,
    mergeWidth: trace.roots.length,
    // True downstream reach is a whole-report property (how many sinks this
    // sink's sources also feed), so it cannot be known from a single trace.
    // Seeded to 1 here and filled in by groundReachability once all sinks exist.
    reachableSinks: 1,
    repeatedNormalization: Math.max(0, defensiveOperationCount - 1),
    unknownEdgeCount,
  };
}

// Whole-graph grounding pass. The trace graph does not deduplicate nodes across
// sinks, so downstream reach cannot be read off the raw graph per source node.
// Instead aggregate by source identity (label): a source's reach is the number
// of distinct render sinks its actionable roots feed. Each sink then inherits
// the reach of its most-central source. This replaces the former constant base
// reach in centralityScore and the hardcoded `reachable sinks: 1`.
function groundReachability(sinks) {
  const reachByRoot = new Map();
  for (const sink of sinks) {
    for (const info of fanOutRootsFor(sink)) {
      reachByRoot.set(info.label, (reachByRoot.get(info.label) ?? 0) + 1);
    }
  }
  for (const sink of sinks) {
    let reach = 1;
    for (const info of fanOutRootsFor(sink)) {
      reach = Math.max(reach, reachByRoot.get(info.label) ?? 1);
    }
    sink.metrics.reachableSinks = reach;
  }
  // Queues depend on reach, so finalize them here (buildSinkRecord runs before
  // grounding). The central-leverage cutoff is the report's own top reach
  // quartile rather than a fixed magic number: it adapts to codebase size and
  // keeps central-leverage a meaningful minority. The floor of 3 means a sink
  // must feed at least three render sinks to qualify on small/flat projects.
  const reaches = sinks.map((sink) => sink.metrics.reachableSinks).sort((a, b) => a - b);
  const reachThreshold = Math.max(3, percentile(reaches, 0.75));
  for (const sink of sinks) {
    sink.queue = queueFor(sink.metrics, sink.defenses, reachThreshold);
  }
}

function defenseRecord(ts, checker, guardedExpression, node, operation) {
  const verdict = getNullishStatus(ts, checker, guardedExpression);
  return {
    operation,
    expression: node.getText(),
    guardedExpression: guardedExpression.getText(),
    type: safeTypeText(checker.typeToString(checker.getTypeAtLocation(guardedExpression))),
    verdict,
    location: locationOf(node.getSourceFile(), node),
  };
}

function getNullishStatus(ts, checker, expression) {
  const type = checker.getTypeAtLocation(expression);
  const members = type.isUnion() ? type.types : [type];
  const uncertain = members.some(
    (member) =>
      (member.flags &
        (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) !==
      0,
  );
  if (uncertain) return "unknown";
  const containsNullish = members.some(
    (member) => (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0,
  );
  return containsNullish ? "possible" : "impossible";
}

function rankSinks(sinks) {
  const enriched = sinks.map((sink) => {
    const burden = burdenScore(sink.metrics);
    const centrality = centralityScore(sink.metrics);
    const changeRisk = changeRiskScore(sink.metrics);
    const confidence = sink.confidence / 100;
    return {
      ...sink,
      scores: {
        burden,
        centrality,
        changeRisk,
        quickWin: confidence * burden * Math.pow(1 - centrality, 0.7) / (0.25 + changeRisk),
        centralLeverage:
          confidence * burden * centrality * Math.max(0.1, centrality) / (0.25 + changeRisk),
        investigationPriority: burden * centrality * Math.min(1, sink.metrics.unknownEdgeCount / 3),
      },
    };
  });
  return {
    all: enriched.sort((left, right) => right.scores.burden - left.scores.burden),
    quickWins: enriched
      .filter((sink) => sink.queue === "peripheral-quick-win")
      .sort((left, right) => right.scores.quickWin - left.scores.quickWin),
    centralLeverage: enriched
      .filter((sink) => sink.queue === "central-leverage")
      .sort((left, right) => right.scores.centralLeverage - left.scores.centralLeverage),
    investigations: enriched
      .filter((sink) => sink.queue === "investigation")
      .sort(
        (left, right) =>
          right.scores.investigationPriority - left.scores.investigationPriority,
      ),
  };
}

function renderFindings(report, args) {
  const sinks = report.rankings.all.slice(0, args.maxItems);
  const lines = ["# Render-Path Findings", ""];
  for (const sink of sinks) {
    lines.push(`${sink.id}  ${severityFor(sink)}  ${findingTitle(sink)}`);
    lines.push(`${sink.file}:${sink.line}`);
    lines.push("");
    lines.push("Sink");
    lines.push(`  ${sink.expression}`);
    lines.push("");
    lines.push("Source");
    lines.push(`  ${sink.roots.join(", ") || "unknown"}`);
    lines.push("");
    lines.push("Metrics");
    lines.push(`  path depth:                 ${sink.metrics.maximumPathDepth}`);
    lines.push(`  helper hops:                ${sink.metrics.helperHops}`);
    lines.push(`  representation changes:     ${sink.metrics.representationChurn}`);
    lines.push(`  defensive operations:       ${sink.metrics.defensiveOperationCount}`);
    lines.push(`  impossible defenses:        ${sink.metrics.impossibleDefenseCount}`);
    lines.push(`  downstream sink count:      ${sink.metrics.reachableSinks}`);
    lines.push(`  centrality percentile:      ${Math.round(sink.scores.centrality * 100)}`);
    lines.push(`  analysis confidence:        ${sink.confidence}%`);
    lines.push("");
    lines.push("Representative path");
    for (const item of sink.representativePath) lines.push(`  -> ${item}`);
    lines.push("");
    lines.push("Finding");
    lines.push(`  ${findingSentence(sink)}`);
    lines.push("");
  }
  appendBaseline(lines, report);
  return `${lines.join("\n")}\n`;
}

function renderWorkPackets(report, args) {
  const sinks = report.rankings.all.slice(0, args.maxItems);
  const lines = ["# Render-Path Data-Flow Work Packets", ""];
  appendFeatureClusters(lines, report, args);
  sinks.forEach((sink, index) => {
    lines.push(`## WORK ITEM DF-${String(index + 1).padStart(3, "0")}`);
    lines.push(`Simplify ${sink.label} in ${sink.file}`);
    lines.push("");
    lines.push("Scope");
    lines.push(`  pivot:             ${sink.roots[0] ?? "unknown"}`);
    lines.push(`  files:             1`);
    lines.push(`  components:        ${Math.max(1, sink.metrics.mergeWidth)}`);
    lines.push(`  reachable sinks:   ${sink.metrics.reachableSinks}`);
    lines.push(`  confidence:        ${sink.confidence}%`);
    lines.push("");
    lines.push("Why this was selected");
    lines.push(`  path depth ${sink.metrics.maximumPathDepth}`);
    lines.push(`  ${sink.metrics.defensiveOperationCount} defensive operations`);
    lines.push(`  ${sink.metrics.representationChurn} representation-only transformations`);
    lines.push(`  ${sink.metrics.impossibleDefenseCount} type-impossible fallbacks`);
    lines.push("");
    lines.push("Representative path");
    sink.representativePath.forEach((item) => lines.push(`  -> ${item}`));
    lines.push("");
    lines.push("Candidate edits");
    candidateEditsFor(sink).forEach((edit, editIndex) => {
      lines.push(`  ${editIndex + 1}. ${edit}`);
    });
    lines.push("");
    lines.push("Risk");
    lines.push(`  queue: ${sink.queue}`);
    if (sink.metrics.unknownEdgeCount > 0) {
      lines.push(`  ${sink.metrics.unknownEdgeCount} unknown edge(s) require investigation`);
    }
    lines.push("");
  });
  appendBaseline(lines, report);
  return `${lines.join("\n")}\n`;
}

function renderDossier(report) {
  const summary = report.summary;
  const topSink = report.rankings.all[0];
  return [
    "# Render Graph Dossier",
    "",
    `${summary.nodes} nodes | ${summary.edges} edges | ${summary.sources} sources | ${summary.sinks} sinks`,
    `${summary.pathFamilies} path families | ${summary.unknownEdges} unknown edges`,
    "",
    "Primary pivot",
    `  ${topSink?.roots[0] ?? "none"}`,
    `  sink reach: ${topSink ? topSink.metrics.reachableSinks : 0}`,
    `  burden score: ${topSink ? topSink.scores.burden.toFixed(2) : "0.00"}`,
    "",
  ].join("\n");
}

function renderFanOut(report, args) {
  const rows = fanOutRows(report.sinks).slice(0, args.maxItems);
  return tableReport("Consumer Fan-Out", ["Source", "Sinks", "Components", "Operations"], rows);
}

function renderFanIn(report, args) {
  const rows = report.rankings.all.slice(0, args.maxItems).map((sink) => [
    `${sink.file}:${sink.line}`,
    String(sink.metrics.mergeWidth),
    String(sink.metrics.controlDependencyCount),
    String(sink.metrics.maximumPathDepth),
  ]);
  return tableReport("Sink Fan-In", ["Sink", "Root sources", "Predicates", "Max distance"], rows);
}

function renderPathGallery(report, args) {
  const sinks = report.rankings.all.slice(0, args.maxItems);
  const lines = ["# Path Gallery", ""];
  for (const sink of sinks) {
    lines.push(`## ${sink.file}:${sink.line} depth=${sink.metrics.maximumPathDepth}`);
    sink.representativePath.forEach((item) => lines.push(`  -> ${item}`));
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderPathCensus(report) {
  const depths = report.sinks.map((sink) => sink.metrics.maximumPathDepth).sort((a, b) => a - b);
  return [
    "# Path Census",
    "",
    `Sources:              ${report.summary.sources}`,
    `Sinks:                ${report.summary.sinks}`,
    `Known path families:  ${report.summary.pathFamilies}`,
    `Unknown edges:        ${report.summary.unknownEdges}`,
    "",
    "Path depth",
    `  median    ${percentile(depths, 0.5)}`,
    `  p90       ${percentile(depths, 0.9)}`,
    `  maximum   ${depths.at(-1) ?? 0}`,
    "",
  ].join("\n");
}

function renderPathFamilies(report, args) {
  const rows = familyRows(report.sinks).slice(0, args.maxItems);
  return tableReport("Path Families", ["Signature", "Paths", "Sinks", "Max depth"], rows);
}

function renderTransformationLedger(report) {
  const sink = report.rankings.all[0];
  if (!sink) return "# Transformation Ledger\n\nNo sinks found.\n";
  const lines = ["# Transformation Ledger", "", `${sink.file}:${sink.line}`, ""];
  sink.representativePath.forEach((item, index) => {
    const operation = index === sink.representativePath.length - 1 ? "JSX text" : "data-flow";
    lines.push(`${String(index + 1).padStart(2, " ")}  ${item}  ${operation}`);
  });
  lines.push("");
  lines.push("Summary");
  lines.push(`  semantic transformations:        ${sink.metrics.helperHops}`);
  lines.push(`  representation-only steps:       ${sink.metrics.representationChurn}`);
  lines.push(`  defensive steps:                 ${sink.metrics.defensiveOperationCount}`);
  lines.push(`  total steps:                     ${sink.metrics.maximumPathDepth}`);
  return `${lines.join("\n")}\n`;
}

function renderDefensiveLedger(report, args) {
  const defenses = report.sinks.flatMap((sink) =>
    sink.defenses.map((defense) => [sink, defense]),
  );
  const rows = defenses.slice(0, args.maxItems).map(([sink, defense]) => [
    `${sink.file}:${defense.location.line}`,
    defense.expression,
    defense.type,
    defense.verdict,
  ]);
  return tableReport("Defensive Logic", ["Location", "Expression", "Type", "Verdict"], rows);
}

function renderPropRelay(report, args) {
  const rows = report.rankings.all.slice(0, args.maxItems).map((sink) => [
    `${sink.file}:${sink.line}`,
    String(Math.max(0, sink.metrics.mergeWidth - 1)),
    String(sink.metrics.representationChurn),
    sink.metrics.helperHops === 0 ? "pure data relay" : "transformed relay",
  ]);
  return tableReport("Prop Relay", ["Sink", "Component boundaries", "Wrappers", "Classification"], rows);
}

function renderContextRelay(report, args) {
  const rows = report.contextRelay.slice(0, args.maxItems).map((finding) => [
    `${finding.parentFile}:${finding.line}`,
    finding.childComponent,
    finding.contextHooks.join(", "),
    finding.props.join(", "),
    finding.signal,
  ]);
  return tableReport(
    "Context Relay",
    ["Parent", "Child", "Context hooks in parent", "Passed props", "Signal"],
    rows,
  );
}

function renderRepairMap(report, args) {
  const lines = ["# Repair Map", ""];
  appendFeatureClusters(lines, report, args);
  for (const [heading, sinks] of [
    ["Peripheral quick wins", report.rankings.quickWins],
    ["Central leverage", report.rankings.centralLeverage],
    ["Investigate", report.rankings.investigations],
  ]) {
    lines.push(`## ${heading}`);
    const selected = sinks.slice(0, args.maxItems);
    if (selected.length === 0) lines.push("  none");
    selected.forEach((sink) => {
      lines.push(
        `  ${sink.scores.burden.toFixed(1)}  ${sink.file}:${sink.line} ${findingTitle(sink)}`,
      );
    });
    lines.push("");
  }
  appendBaseline(lines, report);
  return `${lines.join("\n")}\n`;
}

function appendFeatureClusters(lines, report, args) {
  const rows = featureClusterRows(report.rankings.all).slice(0, Math.min(args.maxItems, 8));
  if (rows.length === 0) return;
  lines.push("## Feature Clusters");
  lines.push("");
  lines.push("| Feature area | Sinks | Files | Max depth | Wrappers | Suggested first cut |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    lines.push(`| ${row.map(formatTableCell).join(" | ")} |`);
  }
  lines.push("");
}

function featureClusterRows(sinks) {
  const clusters = new Map();
  for (const sink of sinks) {
    const key = featureKeyFor(sink.file);
    const cluster = clusters.get(key) ?? {
      sinks: 0,
      files: new Set(),
      maxDepth: 0,
      wrappers: 0,
      providerContextSignals: 0,
    };
    cluster.sinks += 1;
    cluster.files.add(sink.file);
    cluster.maxDepth = Math.max(cluster.maxDepth, sink.metrics.maximumPathDepth);
    cluster.wrappers += sink.metrics.representationChurn;
    if (isProviderContextCandidate(sink)) cluster.providerContextSignals += 1;
    clusters.set(key, cluster);
  }
  return Array.from(clusters.entries())
    .map(([feature, cluster]) => [
      feature,
      String(cluster.sinks),
      String(cluster.files.size),
      String(cluster.maxDepth),
      String(cluster.wrappers),
      cluster.providerContextSignals > 0
        ? "Provider/Context audit"
        : "local boundary cleanup",
    ])
    .sort(
      (left, right) =>
        Number(right[1]) - Number(left[1]) ||
        Number(right[3]) - Number(left[3]) ||
        Number(right[4]) - Number(left[4]),
    );
}

function featureKeyFor(file) {
  const parts = file.split("/");
  const sourceIndex = parts.findIndex((part) => part === "src");
  const offset = sourceIndex >= 0 ? sourceIndex + 1 : 0;
  const directoryParts = parts.slice(offset, Math.max(offset + 1, parts.length - 1));
  return directoryParts.slice(0, 3).join("/") || path.dirname(file);
}

function candidateEditsFor(sink) {
  if (hasContextHookRoot(sink)) {
    return [
      "This flow already starts at a feature hook; do not reintroduce parent pass-through props.",
      "If the same property chain appears repeatedly, extract a named selector/action on the feature model.",
      "Keep only row-local items and narrow display props outside the Provider/Context.",
    ];
  }

  if (isProviderContextCandidate(sink)) {
    return [
      "Check whether this feature already has or needs a Provider/Context boundary.",
      "Move shared filters, table state, action state, drafts, and derived selectors behind the feature hook.",
      "Remove same-feature pass-through props; keep only row-local items and narrow display props.",
    ];
  }

  if (sink.metrics.impossibleDefenseCount > 0) {
    return [
      "Add or confirm boundary coverage for the source invariant.",
      "Remove type-impossible defensive operations.",
      "Inline representation-only wrappers when they have no semantic role.",
    ];
  }

  return [
    "Move repeated parsing, formatting, or normalization to the nearest data/model boundary.",
    "Inline representation-only wrappers when they have no semantic role.",
    "Keep the change scoped to the feature area named in the cluster summary.",
  ];
}

function isProviderContextCandidate(sink) {
  return (
    hasContextHookRoot(sink) ||
    sink.metrics.reachableSinks > 5 ||
    sink.metrics.maximumPathDepth > 10 ||
    (sink.metrics.representationChurn > 1 && sink.metrics.mergeWidth > 1)
  );
}

function hasContextHookRoot(sink) {
  return sink.roots.some((root) => /^use[A-Z]/.test(root));
}

function selectViewPayload(report, args) {
  return {
    analysisVersion: report.analysisVersion,
    generatedAt: report.generatedAt,
    summary: report.summary,
    view: args.view,
    sinks: report.rankings.all.slice(0, args.maxItems),
    contextRelay: args.view === "context-relay"
      ? report.contextRelay.slice(0, args.maxItems)
      : undefined,
    graph: args.view === "dossier" ? boundedGraph(report.graph, args.maxItems) : undefined,
    baseline: report.baseline,
  };
}

function boundedGraph(graph, maxItems) {
  return {
    nodes: graph.nodes.slice(0, maxItems),
    edges: graph.edges.slice(0, maxItems),
    omittedNodes: Math.max(0, graph.nodes.length - maxItems),
    omittedEdges: Math.max(0, graph.edges.length - maxItems),
    unknownEdges: graph.unknownEdges,
  };
}

function compareBaseline(rankings, baselinePath) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const currentWorst = rankings.all[0]?.scores.burden ?? 0;
  const baselineWorst = baseline.sinks?.[0]?.scores?.burden ?? 0;
  return {
    currentWorst,
    baselineWorst,
    regressed: currentWorst > baselineWorst,
  };
}

function readCompilerOptions(ts, args) {
  const fallback = { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true };
  if (!args.tsconfig || !fs.existsSync(args.tsconfig)) return fallback;
  const configFile = ts.readConfigFile(args.tsconfig, ts.sys.readFile);
  if (configFile.error) return fallback;
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(args.tsconfig),
    undefined,
    args.tsconfig,
  );
  return parsed.options;
}

function shouldAnalyzeFile(file, args) {
  const ext = path.extname(file);
  if (!SOURCE_EXTENSIONS.includes(ext)) return false;
  if (file.endsWith(".d.ts")) return false;
  if (!isWithin(file, args.source)) return false;
  const relativeParts = path.relative(args.root, file).split(path.sep);
  if (relativeParts.some((part) => DEFAULT_IGNORED_PARTS.has(part))) return false;
  if (!args.includeTests && /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return false;
  return true;
}

function walkFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(current);
    return [current];
  });
}

function createGraph(root = defaultRoot) {
  return { nodes: [], edges: [], nextNodeId: 1, nextEdgeId: 1, root };
}

function addNode(graph, node) {
  const record = { id: `n${graph.nextNodeId}`, ...node };
  graph.nextNodeId += 1;
  graph.nodes.push(record);
  return record;
}

function addEdge(graph, from, to, kind, node, unknown = false) {
  if (!from || !to) return null;
  const record = {
    id: `e${graph.nextEdgeId}`,
    from,
    to,
    kind,
    unknown: Boolean(unknown),
    location: node ? locationOf(node.getSourceFile(), node) : null,
  };
  graph.nextEdgeId += 1;
  graph.edges.push(record);
  return record;
}

function classifyAttribute(name) {
  if (["class", "className", "style"].includes(name)) return "style";
  if (["when", "each"].includes(name)) return "render-control";
  return "attribute";
}

function getFunctionReturnExpression(ts, fn) {
  if (!fn) return null;
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return fn.body;
  let found = null;
  const visit = (node) => {
    if (!found && ts.isReturnStatement(node) && node.expression) found = node.expression;
    if (!found) ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return found;
}

function isCallNamed(ts, node, name) {
  return ts.isCallExpression(node) && getCallName(ts, node) === name;
}

function getCallName(ts, node) {
  if (!ts.isCallExpression(node)) return "";
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return "";
}

function locationOf(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: position.line + 1, column: position.character + 1 };
}

function applyScope(sinks, scope) {
  if (!scope) return sinks;
  return sinks.filter(
    (sink) =>
      sink.file.includes(scope) ||
      sink.label.includes(scope) ||
      sink.roots.some((root) => root.includes(scope)),
  );
}

function summarize(sinks, graph) {
  return {
    sources: unique(sinks.flatMap((sink) => sink.roots)).length,
    sinks: sinks.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    unknownEdges: graph.edges.filter((edge) => edge.unknown).length,
    pathFamilies: familyRows(sinks).length,
  };
}

function fanOutRows(sinks) {
  return Object.entries(
    sinks.reduce((acc, sink) => {
      for (const info of fanOutRootsFor(sink)) {
        acc[info.label] ??= { sinks: 0, components: new Set(), operations: 0 };
        acc[info.label].sinks += 1;
        acc[info.label].components.add(sink.file);
        acc[info.label].operations += sink.metrics.sliceSize;
      }
      return acc;
    }, {}),
  )
    .map(([root, value]) => [
      root,
      String(value.sinks),
      String(value.components.size),
      String(value.operations),
    ])
    .sort((left, right) => Number(right[1]) - Number(left[1]));
}

// Global identifiers and language keywords that the local file context cannot
// resolve and that surface as `unknown-source` roots, but are never an ownable
// domain "source" a developer could centralize. Excluded from fan-out ranking.
const NON_FAN_OUT_GLOBALS = new Set([
  "undefined",
  "null",
  "NaN",
  "Infinity",
  "Math",
  "JSON",
  "Object",
  "Array",
  "Number",
  "String",
  "Boolean",
  "Date",
  "console",
  "window",
  "document",
  "globalThis",
]);

// Fan-out ranks the sources a value flows from. Literals/primitives (`0`,
// `false`, `""`, `[]`) and bare parameter objects (`props`) are not actionable
// "sources" — a developer cannot own or centralize them — so they are excluded,
// as are unresolved language globals (`undefined`, `Math`). Property reads off
// a parameter (`props.meta`) and named locals are kept.
function fanOutRootsFor(sink) {
  const infos = sink.rootInfos ?? sink.roots.map((root) => ({ label: root, kind: "source" }));
  return infos.filter(
    (info) =>
      info.kind !== "literal" &&
      info.kind !== "parameter" &&
      !NON_FAN_OUT_GLOBALS.has(info.label),
  );
}

function analyzeContextRelay(ts, sourceFiles, root) {
  return sourceFiles.flatMap((sourceFile) =>
    contextRelayFindingsForFile(ts, sourceFile, root),
  ).sort(
    (left, right) =>
      right.score - left.score ||
      right.props.length - left.props.length ||
      left.parentFile.localeCompare(right.parentFile),
  );
}

function contextRelayFindingsForFile(ts, sourceFile, root) {
  if (!sourceFile.fileName.endsWith(".tsx") && !sourceFile.fileName.endsWith(".jsx")) {
    return [];
  }

  const importMap = localComponentImportMap(ts, sourceFile, root);
  const contextHooks = contextHookNames(ts, sourceFile);
  if (contextHooks.size === 0) return [];

  const usedContextHooks = new Set();
  const findings = [];
  const currentFeature = featureKeyFor(relativePath(root, sourceFile.fileName));

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      contextHooks.has(node.expression.text)
    ) {
      usedContextHooks.add(node.expression.text);
    }

    const jsx = jsxTagAndAttributes(ts, node);
    if (jsx) {
      const imported = importMap.get(jsx.tag);
      if (imported?.feature === currentFeature) {
        const props = jsx.attributes
          .map((attribute) => jsxAttributeName(ts, attribute))
          .filter(Boolean)
          .filter((name) => !localDisplayPropNames.has(name));
        const sharedProps = props.filter(isSharedContextPropName);
        if (props.length >= 3 || sharedProps.length > 0) {
          const location = locationOf(sourceFile, jsx.node);
          findings.push({
            parentFile: relativePath(root, sourceFile.fileName),
            line: location.line,
            column: location.column,
            childComponent: jsx.tag,
            childFile: imported.file,
            contextHooks: Array.from(usedContextHooks.size > 0 ? usedContextHooks : contextHooks),
            props,
            sharedProps,
            score: sharedProps.length * 3 + props.length,
            signal: sharedProps.length > 0
              ? "shared prop names"
              : "same-feature prop bundle",
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

function localComponentImportMap(ts, sourceFile, root) {
  const imports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith(".")) continue;
    const clause = statement.importClause;
    if (!clause) continue;
    const importedFile = relativePath(
      root,
      path.resolve(path.dirname(sourceFile.fileName), specifier),
    );
    const feature = featureKeyFor(importedFile);
    if (clause.name && /^[A-Z]/.test(clause.name.text)) {
      imports.set(clause.name.text, { file: importedFile, feature });
    }
    const namedBindings = clause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        if (/^[A-Z]/.test(element.name.text)) {
          imports.set(element.name.text, { file: importedFile, feature });
        }
      }
    }
  }
  return imports;
}

function contextHookNames(ts, sourceFile) {
  const hooks = new Set();
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.includes("context") || specifier.includes("Context")) {
        const namedBindings = node.importClause?.namedBindings;
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          for (const element of namedBindings.elements) {
            if (/^use[A-Z]/.test(element.name.text)) hooks.add(element.name.text);
          }
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name && /^use[A-Z]/.test(node.name.text)) {
      hooks.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hooks;
}

function jsxTagAndAttributes(ts, node) {
  if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName)) {
    return {
      node,
      tag: node.tagName.text,
      attributes: Array.from(node.attributes.properties),
    };
  }
  if (ts.isJsxOpeningElement(node) && ts.isIdentifier(node.tagName)) {
    return {
      node,
      tag: node.tagName.text,
      attributes: Array.from(node.attributes.properties),
    };
  }
  return null;
}

function jsxAttributeName(ts, attribute) {
  if (!ts.isJsxAttribute(attribute)) return "";
  return attribute.name.getText();
}

const localDisplayPropNames = new Set([
  "aria-label",
  "as",
  "children",
  "class",
  "className",
  "data-testid",
  "disabled",
  "fallback",
  "href",
  "id",
  "key",
  "label",
  "ref",
  "style",
  "title",
  "variant",
]);

const sharedContextPropPattern =
  /^(action|actions|can[A-Z]|colorSwatches|detail|filters|fragments|inspector|metadata|model|modes|nodeByDomPath|notes|on[A-Z]|pending|section|selected|selection|settings|state|table|toolModes|view|workspace|zoom)$/u;

function isSharedContextPropName(name) {
  return sharedContextPropPattern.test(name);
}

function applyContextRelayScope(findings, scope) {
  if (!scope) return findings;
  return findings.filter(
    (finding) =>
      finding.parentFile.includes(scope) ||
      finding.childFile.includes(scope) ||
      finding.childComponent.includes(scope) ||
      finding.props.some((prop) => prop.includes(scope)),
  );
}

function familyRows(sinks) {
  const families = new Map();
  for (const sink of sinks) {
    const signature = signatureFor(sink);
    const family = families.get(signature) ?? {
      paths: 0,
      sinks: 0,
      maxDepth: 0,
    };
    family.paths += 1;
    family.sinks += 1;
    family.maxDepth = Math.max(family.maxDepth, sink.metrics.maximumPathDepth);
    families.set(signature, family);
  }
  return Array.from(families.entries()).map(([signature, family]) => [
    signature,
    String(family.paths),
    String(family.sinks),
    String(family.maxDepth),
  ]);
}

function signatureFor(sink) {
  const parts = [];
  if (sink.metrics.representationChurn > 0) parts.push("object-pack");
  if (sink.metrics.helperHops > 0) parts.push("call");
  if (sink.metrics.controlDependencyCount > 0) parts.push("conditional");
  if (sink.metrics.impossibleDefenseCount > 0) parts.push("impossible-defense");
  else if (sink.metrics.defensiveOperationCount > 0) parts.push("fallback");
  parts.push("jsx-sink");
  if (sink.metrics.unknownEdgeCount > 0) parts.push("(unknown)");
  // Prefix a depth band so the otherwise-dominant bare `jsx-sink` bucket splits
  // into recognizable shapes (a trivial direct read vs. a deep relayed path) and
  // no single signature swamps the report.
  return `${depthBand(sink.metrics.maximumPathDepth)} ${parts.join(" -> ")}`;
}

// Coarse depth bands. Boundaries chosen against the modeler corpus (median
// depth 2, p90 6): a direct read lands in `trivial`, plain property reads in
// `shallow`, helper/relay chains in `medium`, and architectural relays in `deep`.
function depthBand(depth) {
  if (depth <= 1) return "trivial";
  if (depth <= 3) return "shallow";
  if (depth <= 7) return "medium";
  return "deep";
}

function tableReport(title, headers, rows) {
  const lines = [
    `# ${title}`,
    "",
    `| ${headers.map(formatTableCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) lines.push(`| ${row.map(formatTableCell).join(" | ")} |`);
  return `${lines.join("\n")}\n`;
}

function formatTableCell(value) {
  return String(value).replaceAll("\n", " ").replaceAll("|", "\\|");
}

function appendBaseline(lines, report) {
  if (!report.baseline) return;
  lines.push("Baseline");
  lines.push(`  current worst:  ${report.baseline.currentWorst.toFixed(2)}`);
  lines.push(`  baseline worst: ${report.baseline.baselineWorst.toFixed(2)}`);
  lines.push(`  regressed:      ${report.baseline.regressed ? "yes" : "no"}`);
}

function confidenceFor(metrics, defenses) {
  if (metrics.unknownEdgeCount > 0) return 72;
  if (defenses.some((defense) => defense.verdict === "unknown")) return 80;
  if (metrics.impossibleDefenseCount > 0) return 99;
  return 88;
}

function queueFor(metrics, defenses, reachThreshold = 3) {
  if (metrics.unknownEdgeCount > 0 || defenses.some((defense) => defense.verdict === "unknown")) {
    return "investigation";
  }
  // Central-leverage = a source that feeds many render sinks (top reach
  // quartile for the report, passed in) or a pathologically deep relay path.
  if (metrics.reachableSinks >= reachThreshold || metrics.maximumPathDepth > 10) {
    return "central-leverage";
  }
  return "peripheral-quick-win";
}

function burdenScore(metrics) {
  return clamp01(
    0.15 * normalized(metrics.maximumPathDepth) +
      0.15 * normalized(metrics.helperHops) +
      0.2 * normalized(metrics.representationChurn) +
      0.15 * normalized(metrics.defensiveOperationCount) +
      0.15 * normalized(metrics.impossibleDefenseCount) +
      0.1 * normalized(metrics.controlDependencyCount) +
      0.1 * normalized(metrics.repeatedNormalization),
  );
}

function centralityScore(metrics) {
  // Grounded in true downstream reach (reachableSinks) rather than a constant
  // base value: a source feeding many sinks now outranks an equally-deep but
  // isolated one. Depth, helper hops, fan-in, and slice size remain secondary.
  return clamp01(
    0.4 * normalized(metrics.reachableSinks) +
      0.2 * normalized(metrics.maximumPathDepth) +
      0.15 * normalized(metrics.helperHops) +
      0.15 * normalized(metrics.mergeWidth) +
      0.1 * normalized(metrics.sliceSize),
  );
}

function changeRiskScore(metrics) {
  // Editing a widely-reaching source touches more render sinks, so reach is the
  // dominant change-risk signal alongside unknown edges and control flow.
  return clamp01(
    0.25 * normalized(metrics.reachableSinks) +
      0.25 * normalized(metrics.unknownEdgeCount) +
      0.15 * normalized(metrics.controlDependencyCount) +
      0.1 * normalized(metrics.helperHops) +
      0.25 * normalized(metrics.sliceSize),
  );
}

function findingTitle(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) {
    return "type-impossible defensive render path";
  }
  if (sink.metrics.representationChurn > 1) return "representation-heavy render path";
  if (sink.metrics.helperHops > 1) return "helper-heavy render path";
  return "render-path data-flow hotspot";
}

function findingSentence(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) {
    return "A nullish fallback or optional access is unreachable under the checked TypeScript program.";
  }
  return "This rendered value has more data-flow plumbing than nearby JSX should usually need.";
}

function severityFor(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) return "HIGH";
  if (sink.scores.burden > 0.55) return "MEDIUM";
  return "LOW";
}

function percentile(values, target) {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.floor(values.length * target))];
}

function normalized(value) {
  return Math.min(1, Math.log1p(value) / Math.log1p(20));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function isWithin(file, root) {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function safeTypeText(value = "") {
  return value || "unknown";
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
