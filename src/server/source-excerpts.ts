import path from "node:path";
import type * as TypeScript from "typescript";
import {
  SOURCE_EXCERPT_MAX_LINES,
  SOURCE_EXCERPT_MAX_SPAN_LINES,
  type SourceExcerptData,
  type SourceExcerptRequest,
  type SourceExcerptSpan,
} from "../api/contracts";

const MAX_SOURCE_EXCERPT_BYTES = 512 * 1024;
const SUPPORTED_SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export function isSupportedSourcePath(file: string) {
  const normalized = file.toLowerCase();
  return !normalized.endsWith(".d.ts") && SUPPORTED_SOURCE_EXTENSIONS.has(path.extname(normalized));
}

export function buildSourceExcerpt(
  ts: typeof TypeScript,
  request: SourceExcerptRequest,
  source: string,
): SourceExcerptData | null {
  if (!isSupportedSourcePath(request.path)) return null;
  const lines = source.split(/\r?\n/);
  const { span } = request;
  if (!validSpan(span, lines)) return null;
  if (span.endLine - span.startLine + 1 > SOURCE_EXCERPT_MAX_SPAN_LINES) return null;

  const startLine = Math.max(1, span.startLine - request.contextBefore);
  const endLine = Math.min(lines.length, span.endLine + request.contextAfter);
  if (endLine - startLine + 1 > SOURCE_EXCERPT_MAX_LINES) return null;
  const excerptLines = lines.slice(startLine - 1, endLine);
  if (Buffer.byteLength(excerptLines.join("\n"), "utf8") > MAX_SOURCE_EXCERPT_BYTES) return null;

  const sourceFile = ts.createSourceFile(
    request.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(ts, request.path),
  );
  const containingFunction = findContainingFunction(ts, sourceFile, span);
  return {
    path: request.path,
    focus: {
      line: span.startLine,
      column: span.startColumn,
      endLine: span.endLine,
      endColumn: span.endColumn,
    },
    lines: excerptLines.map((text, index) => ({
      number: startLine + index,
      text,
      focus: startLine + index >= span.startLine && startLine + index <= span.endLine,
    })),
    containingFunction,
    file: { lineCount: lines.length },
  };
}

function validSpan(span: SourceExcerptSpan, lines: string[]) {
  if (span.startLine > lines.length || span.endLine > lines.length) return false;
  if (span.endLine < span.startLine) return false;
  if (span.endLine === span.startLine && span.endColumn < span.startColumn) return false;
  if (span.startColumn > lines[span.startLine - 1].length + 1) return false;
  if (span.endColumn > lines[span.endLine - 1].length + 1) return false;
  return true;
}

function findContainingFunction(
  ts: typeof TypeScript,
  sourceFile: TypeScript.SourceFile,
  span: SourceExcerptSpan,
) {
  const focusStart = positionAt(sourceFile, span.startLine, span.startColumn);
  const focusEnd = positionAt(sourceFile, span.endLine, span.endColumn);
  let containing: TypeScript.Node | null = null;
  const visit = (node: TypeScript.Node) => {
    if (node.getStart(sourceFile) > focusStart || node.getEnd() < focusEnd) return;
    if (isFunctionLike(ts, node)) containing = node;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return containing ? functionMetadata(ts, sourceFile, containing) : null;
}

function positionAt(sourceFile: TypeScript.SourceFile, line: number, column: number) {
  return sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
}

function isFunctionLike(ts: typeof TypeScript, node: TypeScript.Node) {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node);
}

function functionMetadata(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, node: TypeScript.Node) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    label: functionLabel(ts, sourceFile, node),
    kind: functionKind(ts, node),
    span: {
      startLine: start.line + 1,
      startColumn: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
    },
  };
}

function functionLabel(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, node: TypeScript.Node) {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.name) return node.name.getText(sourceFile);
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent)) return node.parent.name.getText(sourceFile);
  if (ts.isConstructorDeclaration(node)) return "constructor";
  return "anonymous function";
}

function functionKind(ts: typeof TypeScript, node: TypeScript.Node) {
  if (ts.isMethodDeclaration(node)) return "method";
  if (ts.isGetAccessorDeclaration(node)) return "getter";
  if (ts.isSetAccessorDeclaration(node)) return "setter";
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isArrowFunction(node)) return "arrow";
  return "function";
}

function scriptKindFor(ts: typeof TypeScript, file: string) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
