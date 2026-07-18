import path from "node:path";
import type * as TypeScript from "typescript";
import type { RouteComponentRecord, RouteRecord } from "./route-data";

const ROUTE_EXT = /\.(?:tsx?|jsx?)$/;

export function routePatternFromFile(relativeFile: string) {
  const normalized = relativeFile.replaceAll("\\", "/");
  const marker = normalized.lastIndexOf("/routes/");
  if (marker < 0 && !normalized.startsWith("routes/")) return null;
  const after = marker >= 0 ? normalized.slice(marker + "/routes/".length) : normalized.slice("routes/".length);
  if (!ROUTE_EXT.test(after)) return null;
  const segments = after.replace(ROUTE_EXT, "").split("/").filter(Boolean);
  if (segments.at(-1) === "index") segments.pop();
  const pathPattern = `/${segments.join("/")}`.replace(/\/$/, "") || "/";
  const parameters = segments.flatMap((segment) => {
    const match = segment.match(/^\[(\.\.\.)?([^\]]+)\]$/);
    return match ? [{ name: match[2], kind: match[1] ? "catch-all" as const : "dynamic" as const }] : [];
  });
  return { pathPattern, parameters };
}

export function discoverRoute(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, sourceFile: TypeScript.SourceFile): RouteRecord | null {
  const file = relative(root, sourceFile.fileName);
  const pattern = routePatternFromFile(file);
  if (!pattern) return null;
  let defaultNode: TypeScript.Node | null = null;
  let componentName: string | null = null;
  const componentNames = new Set<string>();
  const visit = (node: TypeScript.Node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) componentNames.add(node.name.text);
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && /^[A-Z]/.test(node.tagName.getText(sourceFile))) componentNames.add(node.tagName.getText(sourceFile));
    if (ts.isExportAssignment(node) && !node.isExportEquals) { defaultNode = node.expression; componentName = node.expression.getText(sourceFile); }
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) { defaultNode = node; componentName = node.name?.text ?? "default"; }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const retained = defaultNode as TypeScript.Node | null;
  const point = retained ? sourceFile.getLineAndCharacterOfPosition(retained.getStart(sourceFile)) : { line: 0, character: 0 };
  const symbol = retained ? checker.getSymbolAtLocation(ts.isIdentifier(retained) ? retained : (retained as TypeScript.NamedDeclaration).name ?? retained) : undefined;
  const componentHierarchy = retained ? routeComponentHierarchy(ts, sourceFile, retained, componentName) : [];
  return {
    key: `route:${stableHash(`${pattern.pathPattern}:${file}`)}`, pathPattern: pattern.pathPattern, file,
    componentIdentityId: symbol ? `symbol:${stableHash(checker.getFullyQualifiedName(symbol))}` : null,
    parameters: pattern.parameters, confidence: retained ? "high" : "medium",
    evidence: retained ? {
      id: `evidence:${stableHash(`${file}:${point.line + 1}:${point.character + 1}:route`)}`, expression: retained.getText(sourceFile).slice(0, 240), operationKind: "route-component", file,
      line: point.line + 1, column: point.character + 1, span: spanFor(sourceFile, retained), inputType: "route module", outputType: safeTypeAt(checker, retained),
      compilerIdentity: symbol ? checker.getFullyQualifiedName(symbol) : null, confidence: "high", unknownReason: null,
    } : null,
    componentNames: [...componentNames, ...(componentName ? [componentName] : [])].filter((value, index, all) => all.indexOf(value) === index).slice(0, 12),
    componentHierarchy, sinkIds: [],
    omissions: pattern.parameters.some((parameter) => parameter.kind === "catch-all") ? ["Catch-all route matching is represented, but segment constraints are not analyzed."] : [],
  };
}

function routeComponentHierarchy(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, retained: TypeScript.Node, componentName: string | null): RouteComponentRecord[] {
  const localComponents = new Map<string, TypeScript.Node>();
  const collect = (node: TypeScript.Node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) localComponents.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) localComponents.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  const rootName = componentName && componentName !== "default" ? componentName : ts.isFunctionDeclaration(retained) && retained.name ? retained.name.text : "Route component";
  const rootDeclaration = localComponents.get(rootName) ?? retained;
  const records: RouteComponentRecord[] = [];
  const expanded = new Set<string>([rootName]);
  const add = (label: string, node: TypeScript.Node, parentId: string | null, role: RouteComponentRecord["role"]) => {
    const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const id = `route-component:${stableHash(`${sourceFile.fileName}:${node.getStart(sourceFile)}:${label}`)}`;
    records.push({ id, label, file: sourceFile.fileName, line: point.line + 1, parentId, role });
    return id;
  };
  const rootId = add(rootName, rootDeclaration, null, "route");
  const framework = new Set(["ErrorBoundary", "For", "Index", "Match", "Meta", "Portal", "Show", "Suspense", "Switch", "Title"]);
  const walk = (node: TypeScript.Node, parentId: string) => {
    if (records.length >= 24) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const label = opening.tagName.getText(sourceFile);
      if (/^[A-Z]/.test(label)) {
        const id = add(label, opening, parentId, framework.has(label) ? "framework" : "component");
        if (!expanded.has(label) && localComponents.has(label)) {
          expanded.add(label);
          walk(localComponents.get(label)!, id);
        }
        if (ts.isJsxElement(node)) for (const child of node.children) walk(child, id);
        return;
      }
    }
    ts.forEachChild(node, (child) => walk(child, parentId));
  };
  walk(rootDeclaration, rootId);
  return records;
}

export function collectReachableFiles(ts: typeof TypeScript, root: string, start: TypeScript.SourceFile, filesByName: Map<string, TypeScript.SourceFile>) {
  // Large applications commonly route through barrel modules and shared UI
  // packages before reaching a leaf component. A small cap silently severed
  // those component/prop paths based on import traversal order.
  const reachableFileSafetyLimit = 5_000;
  const reachable = new Map<string, TypeScript.SourceFile>();
  const queue: TypeScript.SourceFile[] = [start];
  while (queue.length && reachable.size < reachableFileSafetyLimit) {
    const file = queue.shift()!;
    const normalized = path.normalize(file.fileName);
    if (reachable.has(normalized)) continue;
    reachable.set(normalized, file);
    for (const specifier of moduleSpecifiers(ts, file)) {
      for (const candidate of resolveImportCandidates(root, file.fileName, specifier)) {
        const dependency = filesByName.get(path.normalize(candidate));
        if (dependency && !reachable.has(path.normalize(dependency.fileName))) { queue.push(dependency); break; }
      }
    }
  }
  return new Set(reachable.keys());
}

function moduleSpecifiers(ts: typeof TypeScript, file: TypeScript.SourceFile) {
  const values: string[] = [];
  const visit = (node: TypeScript.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) values.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) values.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return values;
}
function resolveImportCandidates(root: string, from: string, specifier: string) {
  if (!specifier.startsWith(".") && !specifier.startsWith("~/")) return [];
  const normalizedFrom = from.replaceAll(path.sep, "/");
  const sourceMarker = normalizedFrom.lastIndexOf("/src/");
  const sourceRoot = sourceMarker >= 0 ? normalizedFrom.slice(0, sourceMarker + "/src".length) : path.join(root, "src");
  const base = specifier.startsWith("~/") ? path.join(sourceRoot, specifier.slice(2)) : path.resolve(path.dirname(from), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
}
function spanFor(file: TypeScript.SourceFile, node: TypeScript.Node) { const start = file.getLineAndCharacterOfPosition(node.getStart(file)); const end = file.getLineAndCharacterOfPosition(node.getEnd()); return { startLine: start.line + 1, startColumn: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 }; }
function safeTypeAt(checker: TypeScript.TypeChecker, node: TypeScript.Node) { try { return checker.typeToString(checker.getTypeAtLocation(node), node, 1); } catch { return "unknown"; } }
function relative(root: string, file: string) { return path.relative(root, file).replaceAll(path.sep, "/"); }
export function stableHash(value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }
