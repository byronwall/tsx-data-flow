import type * as TypeScript from "typescript";
import path from "node:path";
import { locationOf } from "./graph";

export interface ContextRelayFinding {
  parentFile: string; line: number; column: number; childComponent: string;
  childFile: string; contextHooks: string[]; props: string[]; sharedProps: string[];
  score: number; signal: string;
}

export function analyzeContextRelay(ts: typeof TypeScript, sourceFiles: TypeScript.SourceFile[], root: string) {
  return sourceFiles
    .flatMap((sourceFile: TypeScript.SourceFile) => contextRelayFindingsForFile(ts, sourceFile, root))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.props.length - left.props.length ||
        left.parentFile.localeCompare(right.parentFile),
    );
}

function contextRelayFindingsForFile(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, root: string) {
  if (
    !sourceFile.fileName.endsWith(".tsx") &&
    !sourceFile.fileName.endsWith(".jsx")
  ) {
    return [];
  }

  const importMap = localComponentImportMap(ts, sourceFile, root);
  const contextHooks = contextHookNames(ts, sourceFile);
  if (contextHooks.size === 0) return [];

  const usedContextHooks = new Set<string>();
  const findings: ContextRelayFinding[] = [];
  const currentFeature = featureKeyFor(relativePath(root, sourceFile.fileName));

  const visit = (node: TypeScript.Node) => {
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
          .map((attribute: TypeScript.Node) => jsxAttributeName(ts, attribute))
          .filter(Boolean)
          .filter((name: string) => !localDisplayPropNames.has(name));
        const sharedProps = props.filter(isSharedContextPropName);
        if (props.length >= 3 || sharedProps.length > 0) {
          const location = locationOf(sourceFile, jsx.node);
          findings.push({
            parentFile: relativePath(root, sourceFile.fileName),
            line: location.line,
            column: location.column,
            childComponent: jsx.tag,
            childFile: imported.file,
            contextHooks: Array.from(
              usedContextHooks.size > 0 ? usedContextHooks : contextHooks,
            ),
            props,
            sharedProps,
            score: sharedProps.length * 3 + props.length,
            signal:
              sharedProps.length > 0
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

function localComponentImportMap(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, root: string) {
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

function contextHookNames(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile) {
  const hooks = new Set<string>();
  const visit = (node: TypeScript.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.includes("context") || specifier.includes("Context")) {
        const namedBindings = node.importClause?.namedBindings;
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          for (const element of namedBindings.elements) {
            if (/^use[A-Z]/.test(element.name.text)) {
              hooks.add(element.name.text);
            }
          }
        }
      }
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      /^use[A-Z]/.test(node.name.text)
    ) {
      hooks.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hooks;
}

function jsxTagAndAttributes(ts: typeof TypeScript, node: TypeScript.Node) {
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

function jsxAttributeName(ts: typeof TypeScript, attribute: TypeScript.Node) {
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

function isSharedContextPropName(name: string) {
  return sharedContextPropPattern.test(name);
}

function featureKeyFor(file: string) {
  const parts = file.split("/").filter(Boolean);
  const sourceIndex = parts.findIndex((part) => part === "src");
  const offset = sourceIndex >= 0 ? sourceIndex + 1 : 0;
  const directoryParts = parts.slice(
    offset,
    Math.max(offset + 1, parts.length - 1),
  );
  return directoryParts.slice(0, 3).join("/") || path.dirname(file);
}

function relativePath(root: string, file: string) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
