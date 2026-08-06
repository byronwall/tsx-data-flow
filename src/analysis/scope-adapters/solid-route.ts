import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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
  symbol?: string | null;
  symbolId?: string | null;
  source?: SourceIdentity;
};

type ScopeEvidence = {
  elements: readonly EvidenceElement[];
  relations: readonly unknown[];
};

type DefaultExport = {
  name: string | null;
  start: number;
  nameStart: number;
  end: number;
  line: number;
  column: number;
};

type RouteFile = {
  absoluteFile: string;
  relativeFile: string;
  source: string;
  path: string;
};

type FrameworkProof = {
  detail: string;
  location: SourceLocation;
};

/** Discover Solid route scopes from route-convention and source evidence. */
export function discoverSolidRouteCandidates(
  root: string,
  evidence: ScopeEvidence,
): ScopeCandidate[] {
  const candidates: ScopeCandidate[] = [];
  for (const routeFile of routeFiles(root, evidence.elements)) {
    const defaultExport = findDefaultExport(routeFile.source);
    const frameworkProof = defaultExport
      ? solidFrameworkProof(root, routeFile)
      : null;
    if (!defaultExport || !frameworkProof) continue;

    const entry = selectEntryElement(
      root,
      evidence.elements,
      routeFile,
      defaultExport,
    );
    if (!entry) continue;

    const routeLocation = sourceLocationAt(
      root,
      routeFile.absoluteFile,
      routeFile.source,
      defaultExport.start,
      defaultExport.end,
    );
    const proof: EvidenceProof[] = [
      {
        kind: "solid-route-convention",
        detail: `The default export in ${routeFile.relativeFile} is a route under the routes directory convention for ${routeFile.path}.`,
        locations: [routeLocation, entry.location],
        status: "proven",
      },
      {
        kind: "solid-framework",
        detail: frameworkProof.detail,
        locations: [frameworkProof.location, entry.location],
        status: "proven",
      },
    ];
    const defaults = scopePolicy({
      direction: "both",
      boundaryPolicy: boundaryPolicy({ maxElements: 512, maxRelations: 1024 }),
    });
    candidates.push({
      id: scopeCandidateId("solid-route", sourceIdentityForElement(entry)),
      kind: "route",
      adapter: "solid-route",
      label: `Solid route ${routeFile.path}`,
      entryElementId: entry.id,
      entry: entry.location,
      framework: "solid",
      proof,
      defaults,
    });
  }
  return candidates;
}

/** Convert a Solid route candidate into the shared slice seed. */
export function buildSolidRouteSeed(candidate: ScopeCandidate): ScopeSeed {
  return scopeSeedFor(candidate);
}

export type EvidenceSliceAdapterInput = {
  evidence: ProgramEvidence;
  seeds: ScopeSeed[];
};

export async function loadSolidRouteEvidence(fixtureRoot: string): Promise<EvidenceSliceAdapterInput> {
  const root = path.resolve(fixtureRoot);
  const evidence = await collectProgramEvidenceForRoot(root);
  const candidates = discoverSolidRouteCandidates(root, evidence);
  return { evidence, seeds: candidates.map(buildSolidRouteSeed) };
}

export const evidenceSliceAdapter = {
  name: "solid-route",
  load: loadSolidRouteEvidence,
};

function routeFiles(root: string, elements: readonly EvidenceElement[]): RouteFile[] {
  const files = new Map<string, RouteFile>();
  for (const element of elements) {
    const absoluteFile = absoluteFileFor(root, sourceIdentityForElement(element).file);
    if (!absoluteFile || !isRouteSourceFile(root, absoluteFile)) continue;
    if (files.has(absoluteFile)) continue;
    let source: string;
    try {
      source = readFileSync(absoluteFile, "utf8");
    } catch {
      continue;
    }
    const routePath = routePathFor(root, absoluteFile);
    if (!routePath) continue;
    files.set(absoluteFile, {
      absoluteFile,
      relativeFile: relativeFile(root, absoluteFile),
      source,
      path: routePath,
    });
  }
  return [...files.values()].sort((left, right) => left.relativeFile.localeCompare(right.relativeFile));
}

function findDefaultExport(source: string): DefaultExport | null {
  const functionExport = /\bexport\s+default\s+(?:async\s+)?function(?:\s+([A-Za-z_$][\w$]*))?/g.exec(source);
  if (functionExport) {
    const exportStart = functionExport.index + functionExport[0].indexOf("export");
    const name = functionExport[1] ?? null;
    const nameStart = name
      ? functionExport.index + functionExport[0].indexOf(name)
      : exportStart;
    return {
      name,
      start: exportStart,
      nameStart,
      end: Math.max(exportStart + 1, functionExport.index + functionExport[0].length),
      line: lineAndColumn(source, exportStart).line,
      column: lineAndColumn(source, exportStart).column,
    };
  }

  const namedExport = /\bexport\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}/g.exec(source);
  if (namedExport) {
    const exportStart = namedExport.index + namedExport[0].indexOf("export");
    const name = namedExport[1];
    return {
      name,
      start: exportStart,
      nameStart: namedExport.index + namedExport[0].indexOf(name),
      end: namedExport.index + namedExport[0].length,
      line: lineAndColumn(source, exportStart).line,
      column: lineAndColumn(source, exportStart).column,
    };
  }

  const expressionExport = /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;?/g.exec(source);
  if (!expressionExport) return null;
  const exportStart = expressionExport.index + expressionExport[0].indexOf("export");
  const name = expressionExport[1];
  return {
    name,
    start: exportStart,
    nameStart: expressionExport.index + expressionExport[0].indexOf(name),
    end: expressionExport.index + expressionExport[0].length,
    line: lineAndColumn(source, exportStart).line,
    column: lineAndColumn(source, exportStart).column,
  };
}

function solidFrameworkProof(root: string, routeFile: RouteFile): FrameworkProof | null {
  const importMatch = /(?:from\s*|import\s*\(\s*)["']solid-js["']/.exec(routeFile.source);
  if (importMatch) {
    return {
      detail: `${routeFile.relativeFile} imports the Solid runtime from solid-js.`,
      location: sourceLocationAt(
        root,
        routeFile.absoluteFile,
        routeFile.source,
        importMatch.index,
        importMatch.index + importMatch[0].length,
      ),
    };
  }

  const config = solidJsxConfig(root, routeFile.absoluteFile);
  if (!config) return null;
  return {
    detail: `${config.relativeFile} sets compilerOptions.jsxImportSource to solid-js.`,
    location: sourceLocationAt(root, config.absoluteFile, config.source, config.start, config.end),
  };
}

function solidJsxConfig(root: string, sourceFile: string): {
  absoluteFile: string;
  relativeFile: string;
  source: string;
  start: number;
  end: number;
} | null {
  let directory = path.dirname(sourceFile);
  const rootAbsolute = path.resolve(root);
  while (isInside(rootAbsolute, directory)) {
    const configFile = path.join(directory, "tsconfig.json");
    if (existsSync(configFile)) {
      try {
        const source = readFileSync(configFile, "utf8");
        const config = JSON.parse(source) as {
          compilerOptions?: { jsxImportSource?: unknown };
        };
        if (config.compilerOptions?.jsxImportSource === "solid-js") {
          const keyStart = source.indexOf("jsxImportSource");
          const start = keyStart >= 0 ? keyStart : 0;
          return {
            absoluteFile: configFile,
            relativeFile: relativeFile(root, configFile),
            source,
            start,
            end: keyStart >= 0 ? keyStart + "jsxImportSource".length : 1,
          };
        }
      } catch {
        // Invalid configuration is not framework evidence.
      }
    }
    if (directory === rootAbsolute) break;
    directory = path.dirname(directory);
  }
  return null;
}

function selectEntryElement(
  root: string,
  elements: readonly EvidenceElement[],
  routeFile: RouteFile,
  defaultExport: DefaultExport,
): EvidenceElement | null {
  const matches = elements
    .filter((element) => sameFile(root, element.location.file, routeFile.absoluteFile))
    .map((element) => ({ element, score: entryScore(element, defaultExport) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
  if (matches.length === 0) return null;
  if (matches.length > 1 && matches[0].score === matches[1].score) return null;
  return matches[0].element;
}

function entryScore(element: EvidenceElement, defaultExport: DefaultExport): number {
  const pointMatches = locationContainsPoint(element.location, defaultExport.line, defaultExport.column);
  const lineMatches = element.location.span.startLine <= defaultExport.line
    && element.location.span.endLine >= defaultExport.line;
  const labelMatches = defaultExport.name ? labelMatchesName(element, defaultExport.name) : false;
  const kindMatches = /component|function|route|entry/i.test(element.kind);
  return (pointMatches ? 8 : 0)
    + (lineMatches ? 4 : 0)
    + (labelMatches ? 6 : 0)
    + (kindMatches ? 1 : 0);
}

function labelMatchesName(element: EvidenceElement, name: string): boolean {
  const symbol = element.symbol ?? element.symbolId;
  if (element.label === name || symbol === name) return true;
  if (symbol?.endsWith(`.${name}`)) return true;
  return element.label.split(/[^A-Za-z0-9_$]+/).includes(name);
}

function routePathFor(root: string, file: string): string | null {
  const relative = relativeFile(root, file);
  const segments = relative.split("/");
  const routesIndex = segments.lastIndexOf("routes");
  if (routesIndex < 0) return null;
  const routeSegments = segments.slice(routesIndex + 1);
  if (routeSegments.length === 0) return null;
  const last = routeSegments[routeSegments.length - 1];
  routeSegments[routeSegments.length - 1] = last.replace(/\.(?:tsx?|mts|cts)$/, "");
  const mapped = routeSegments.filter((segment) => segment !== "index");
  return mapped.length === 0 ? "/" : `/${mapped.join("/")}`;
}

function isRouteSourceFile(root: string, file: string): boolean {
  const extension = path.extname(file).toLowerCase();
  if (extension !== ".ts" && extension !== ".tsx") return false;
  const segments = relativeFile(root, file).split("/");
  return segments.slice(0, -1).includes("routes");
}

function sourceIdentityForElement(element: EvidenceElement): SourceIdentity {
  if (element.source) return element.source;
  const start = positionKey(element.location.span.startLine, element.location.span.startColumn);
  const end = positionKey(element.location.span.endLine, element.location.span.endColumn);
  return { file: element.location.file, start, end: Math.max(start + 1, end) };
}

function positionKey(line: number, column: number): number {
  return line * 1_000_000 + column;
}

function locationContainsPoint(location: SourceLocation, line: number, column: number): boolean {
  const start = positionKey(location.span.startLine, location.span.startColumn);
  const end = positionKey(location.span.endLine, location.span.endColumn);
  const point = positionKey(line, column);
  return start <= point && end >= point;
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
  const lineBreaks = prefix.match(/\n/g)?.length ?? 0;
  const lastBreak = prefix.lastIndexOf("\n");
  return { line: lineBreaks + 1, column: boundedOffset - lastBreak };
}

function absoluteFileFor(root: string, file: string): string | null {
  const absolute = path.normalize(path.isAbsolute(file) ? file : path.resolve(root, file));
  return isInside(path.resolve(root), absolute) ? absolute : null;
}

function sameFile(root: string, evidenceFile: string, targetFile: string): boolean {
  const absoluteEvidenceFile = absoluteFileFor(root, evidenceFile);
  return absoluteEvidenceFile !== null && path.normalize(absoluteEvidenceFile) === path.normalize(targetFile);
}

function relativeFile(root: string, file: string): string {
  return path.relative(path.resolve(root), path.resolve(file)).replaceAll(path.sep, "/");
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}
