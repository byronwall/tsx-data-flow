import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as TypeScript from "typescript";
import {
  collectProgramEvidenceForRoot,
  type ProgramEvidence,
} from "../program-evidence";
import {
  boundaryPolicy,
  scopeCandidateId,
  scopePolicy,
  scopeSeedFor,
  type EvidenceProof,
  type ScopeCandidate,
  type ScopeSeed,
  type SourceIdentity,
  type SourceLocation,
} from "../scope-seam";

type EvidenceElement = {
  id: string;
  kind: string;
  label: string;
  location: SourceLocation;
  module?: string | null;
  ownerId?: string | null;
  source?: SourceIdentity;
  attributes?: Record<string, string | number | boolean | null>;
};

type ScopeEvidence = {
  elements: readonly EvidenceElement[];
};

type SolidClientEvidence = {
  entry: EvidenceElement;
  importDeclaration: TypeScript.ImportDeclaration;
  createResourceImport: TypeScript.ImportSpecifier;
  forImport: TypeScript.ImportSpecifier;
  createResourceCall: EvidenceElement;
  forOccurrence: EvidenceElement;
};

/** Discover the one exported Solid client component in the full-stack fixture. */
export function discoverSolidFullStackCandidates(
  root: string,
  evidence: ScopeEvidence,
): ScopeCandidate[] {
  const clientEvidence = findSolidClientEvidence(root, evidence.elements);
  if (!clientEvidence) return [];

  const relativeClientFile = relativeFile(root, clientFile(root));
  const importLocation = sourceLocationAt(
    root,
    clientFile(root),
    readSource(clientFile(root)) ?? "",
    clientEvidence.importDeclaration.getStart(clientEvidence.importDeclaration.getSourceFile()),
    clientEvidence.importDeclaration.getEnd(),
  );
  const proof: EvidenceProof[] = [
    {
      kind: "solid-full-stack-client-entry",
      detail: `The exported RecordsPage component in ${relativeClientFile} matches one component-definition in program evidence.`,
      locations: [clientEvidence.entry.location],
      status: "proven",
    },
    {
      kind: "solid-framework-import",
      detail: `${relativeClientFile} imports createResource and For from solid-js.`,
      locations: [
        importLocation,
        sourceLocationForNode(root, clientEvidence.createResourceImport),
        sourceLocationForNode(root, clientEvidence.forImport),
      ],
      status: "proven",
    },
    {
      kind: "solid-framework-use",
      detail: `RecordsPage contains a compiler-resolved Solid createResource call and a For JSX occurrence.`,
      locations: [clientEvidence.createResourceCall.location, clientEvidence.forOccurrence.location],
      status: "proven",
    },
  ];
  const defaults = scopePolicy({
    direction: "both",
    boundaryPolicy: boundaryPolicy({ maxElements: 512, maxRelations: 1024 }),
  });

  return [{
    id: scopeCandidateId("solid-full-stack", sourceIdentityForElement(clientEvidence.entry)),
    kind: "function",
    adapter: "solid-full-stack",
    label: "Solid full-stack RecordsPage",
    entryElementId: clientEvidence.entry.id,
    entry: clientEvidence.entry.location,
    framework: "solid",
    proof,
    defaults,
  }];
}

/** Convert a Solid full-stack candidate into the shared slice seed. */
export function buildSolidFullStackSeed(candidate: ScopeCandidate): ScopeSeed {
  return scopeSeedFor(candidate);
}

export type EvidenceSliceAdapterInput = {
  evidence: ProgramEvidence;
  seeds: ScopeSeed[];
};

export async function loadSolidFullStackEvidence(
  fixtureRoot: string,
): Promise<EvidenceSliceAdapterInput> {
  const root = path.resolve(fixtureRoot);
  const evidence = await collectProgramEvidenceForRoot(root);
  const candidates = discoverSolidFullStackCandidates(root, evidence);
  return { evidence, seeds: candidates.map(buildSolidFullStackSeed) };
}

export const evidenceSliceAdapter = {
  name: "solid-full-stack",
  load: loadSolidFullStackEvidence,
};

function findSolidClientEvidence(
  root: string,
  elements: readonly EvidenceElement[],
): SolidClientEvidence | null {
  const file = clientFile(root);
  if (!existsSync(file)) return null;
  const source = readSource(file);
  if (source === null) return null;
  const syntax = TypeScript.createSourceFile(
    file,
    source,
    TypeScript.ScriptTarget.Latest,
    true,
    TypeScript.ScriptKind.TSX,
  );
  const declarations = syntax.statements.filter(
    (statement): statement is TypeScript.FunctionDeclaration =>
      TypeScript.isFunctionDeclaration(statement)
      && statement.name?.text === "RecordsPage"
      && hasExportModifier(statement)
      && Boolean(statement.body),
  );
  if (declarations.length !== 1) return null;

  const declaration = declarations[0];
  const imports = namedSolidImports(syntax);
  const createResourceImports = imports.filter((specifier) => importedName(specifier) === "createResource");
  const forImports = imports.filter((specifier) => importedName(specifier) === "For");
  if (createResourceImports.length !== 1 || forImports.length !== 1) return null;

  const createResourceImport = createResourceImports[0];
  const forImport = forImports[0];
  const createResourceCall = findCall(declaration.body!, createResourceImport.name.text);
  const forTag = findJsxTag(declaration.body!, forImport.name.text);
  if (!createResourceCall || !forTag) return null;

  const entryLocation = sourceLocationForNode(root, declaration);
  const entryMatches = elements.filter((element) =>
    element.kind === "component-definition"
    && element.label === "RecordsPage"
    && sameFile(element.location.file, relativeFile(root, file))
    && sameLocation(element.location, entryLocation),
  );
  if (entryMatches.length !== 1) return null;

  const entry = entryMatches[0];
  const createResourceCalls = elements.filter((element) =>
    element.kind === "call"
    && (element.module === undefined || element.module === "solid-js")
    && attribute(element, "callee") === "createResource"
    && sameFile(element.location.file, relativeFile(root, file))
    && locationContains(entry.location, element.location)
    && sameLocation(element.location, sourceLocationForNode(root, createResourceCall)),
  );
  const forOccurrences = elements.filter((element) =>
    element.kind === "jsx-occurrence"
    && (attribute(element, "tag") === "For" || element.label === "For")
    && sameFile(element.location.file, relativeFile(root, file))
    && locationContains(entry.location, element.location)
    && sameLocation(element.location, sourceLocationForNode(root, forTag)),
  );
  if (createResourceCalls.length !== 1 || forOccurrences.length !== 1) return null;

  const importDeclaration = syntax.statements.find(
    (statement): statement is TypeScript.ImportDeclaration =>
      TypeScript.isImportDeclaration(statement)
      && TypeScript.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text === "solid-js",
  );
  if (!importDeclaration) return null;

  return {
    entry,
    importDeclaration,
    createResourceImport,
    forImport,
    createResourceCall: createResourceCalls[0],
    forOccurrence: forOccurrences[0],
  };
}

function namedSolidImports(sourceFile: TypeScript.SourceFile): TypeScript.ImportSpecifier[] {
  const imports: TypeScript.ImportSpecifier[] = [];
  for (const statement of sourceFile.statements) {
    if (!TypeScript.isImportDeclaration(statement)
      || !TypeScript.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "solid-js"
      || !statement.importClause
      || !statement.importClause.namedBindings
      || !TypeScript.isNamedImports(statement.importClause.namedBindings)) continue;
    imports.push(...statement.importClause.namedBindings.elements);
  }
  return imports;
}

function findCall(node: TypeScript.Node, localName: string): TypeScript.CallExpression | null {
  let found: TypeScript.CallExpression | null = null;
  const visit = (candidate: TypeScript.Node) => {
    if (found) return;
    if (TypeScript.isCallExpression(candidate)
      && TypeScript.isIdentifier(candidate.expression)
      && candidate.expression.text === localName) {
      found = candidate;
      return;
    }
    TypeScript.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

function findJsxTag(
  node: TypeScript.Node,
  localName: string,
): TypeScript.JsxOpeningLikeElement | null {
  let found: TypeScript.JsxOpeningLikeElement | null = null;
  const visit = (candidate: TypeScript.Node) => {
    if (found) return;
    const opening = TypeScript.isJsxElement(candidate)
      ? candidate.openingElement
      : TypeScript.isJsxSelfClosingElement(candidate)
        ? candidate
        : null;
    if (opening && TypeScript.isIdentifier(opening.tagName) && opening.tagName.text === localName) {
      found = opening;
      return;
    }
    TypeScript.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

function sourceIdentityForElement(element: EvidenceElement): SourceIdentity {
  if (element.source) return element.source;
  const start = positionKey(element.location.span.startLine, element.location.span.startColumn);
  const end = positionKey(element.location.span.endLine, element.location.span.endColumn);
  return {
    file: element.location.file,
    start,
    end: Math.max(start + 1, end),
  };
}

function sourceLocationForNode(root: string, node: TypeScript.Node): SourceLocation {
  const sourceFile = node.getSourceFile();
  return sourceLocationAt(root, sourceFile.fileName, sourceFile.getFullText(), node.getStart(sourceFile), node.getEnd());
}

function sourceLocationAt(
  root: string,
  file: string,
  source: string,
  start: number,
  end: number,
): SourceLocation {
  const startPoint = lineAndColumn(source, start);
  const endPoint = lineAndColumn(source, Math.max(start + 1, end));
  return {
    file: relativeFile(root, file),
    line: startPoint.line,
    column: startPoint.column,
    span: {
      startLine: startPoint.line,
      startColumn: startPoint.column,
      endLine: endPoint.line,
      endColumn: endPoint.column,
    },
  };
}

function lineAndColumn(source: string, offset: number): { line: number; column: number } {
  const boundedOffset = Math.max(0, Math.min(offset, source.length));
  const prefix = source.slice(0, boundedOffset);
  const line = prefix.split("\n").length;
  const lastBreak = prefix.lastIndexOf("\n");
  return { line, column: boundedOffset - lastBreak };
}

function locationContains(outer: SourceLocation, inner: SourceLocation): boolean {
  return positionKey(outer.span.startLine, outer.span.startColumn) <= positionKey(inner.span.startLine, inner.span.startColumn)
    && positionKey(outer.span.endLine, outer.span.endColumn) >= positionKey(inner.span.endLine, inner.span.endColumn);
}

function sameLocation(left: SourceLocation, right: SourceLocation): boolean {
  return left.file === right.file
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}

function sameFile(left: string, right: string): boolean {
  return left.replaceAll("\\", "/") === right.replaceAll("\\", "/");
}

function positionKey(line: number, column: number): number {
  return line * 1_000_000 + column;
}

function attribute(element: EvidenceElement, name: string): string | null {
  const value = element.attributes?.[name];
  if (typeof value === "string") return value;
  if (name === "callee" && element.label.startsWith("createResource(")) return "createResource";
  if (name === "tag" && element.label === "For") return "For";
  return null;
}

function importedName(specifier: TypeScript.ImportSpecifier): string {
  return specifier.propertyName?.text ?? specifier.name.text;
}

function hasExportModifier(node: TypeScript.FunctionDeclaration): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === TypeScript.SyntaxKind.ExportKeyword) ?? false;
}

function clientFile(root: string): string {
  return path.join(path.resolve(root), "src", "client.tsx");
}

function readSource(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function relativeFile(root: string, file: string): string {
  return path.relative(path.resolve(root), path.resolve(file)).replaceAll("\\", "/");
}
