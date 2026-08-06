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

type BinRegistration = {
  command: string;
  target: string;
  location: SourceLocation;
};

type HandlerDeclaration = {
  name: string;
  start: number;
  nameStart: number;
  end: number;
  line: number;
  column: number;
  calledByGuard: boolean;
};

/** Discover Node CLI scopes from one local package bin registration. */
export function discoverNodeCliCandidates(
  root: string,
  evidence: ScopeEvidence,
): ScopeCandidate[] {
  const candidates: ScopeCandidate[] = [];
  const seenEntryIds = new Set<string>();
  for (const registration of packageBinRegistrations(root)) {
    const targetFile = absoluteFileFor(root, registration.target);
    if (!targetFile || !existsSync(targetFile)) continue;
    let source: string;
    try {
      source = readFileSync(targetFile, "utf8");
    } catch {
      continue;
    }
    const handler = findHandlerDeclaration(source);
    if (!handler) continue;
    const entry = selectEntryElement(root, evidence.elements, targetFile, handler);
    if (!entry || seenEntryIds.has(entry.id)) continue;
    seenEntryIds.add(entry.id);

    const handlerLocation = sourceLocationAt(
      root,
      targetFile,
      source,
      handler.start,
      handler.end,
    );
    const handlerDetail = handler.calledByGuard
      ? `${handler.name} is the function called by the command-entry guard in ${relativeFile(root, targetFile)}.`
      : `${handler.name} is the named command handler in the registered entry file ${relativeFile(root, targetFile)}.`;
    const proof: EvidenceProof[] = [
      {
        kind: "node-cli-bin-registration",
        detail: `package.json registers ${registration.target} for the ${registration.command} command through bin metadata.`,
        locations: [registration.location, handlerLocation],
        status: "proven",
      },
      {
        kind: "node-cli-handler",
        detail: handlerDetail,
        locations: [handlerLocation, entry.location],
        status: "proven",
      },
    ];
    const defaults = scopePolicy({
      direction: "forward",
      boundaryPolicy: boundaryPolicy({ maxElements: 512, maxRelations: 1024 }),
    });
    candidates.push({
      id: scopeCandidateId("node-cli", sourceIdentityForElement(entry)),
      kind: "command",
      adapter: "node-cli",
      label: registration.command,
      entryElementId: entry.id,
      entry: entry.location,
      framework: null,
      proof,
      defaults,
    });
  }
  return candidates;
}

/** Convert a Node CLI candidate into the shared slice seed. */
export function buildNodeCliSeed(candidate: ScopeCandidate): ScopeSeed {
  return scopeSeedFor(candidate);
}

export type EvidenceSliceAdapterInput = {
  evidence: ProgramEvidence;
  seeds: ScopeSeed[];
};

export async function loadNodeCliEvidence(
  fixtureRoot: string,
): Promise<EvidenceSliceAdapterInput> {
  const root = path.resolve(fixtureRoot);
  const evidence = await collectProgramEvidenceForRoot(root);
  const candidates = discoverNodeCliCandidates(root, evidence);
  return { evidence, seeds: candidates.map(buildNodeCliSeed) };
}

export const evidenceSliceAdapter = {
  name: "node-cli",
  load: loadNodeCliEvidence,
};

function packageBinRegistrations(root: string): BinRegistration[] {
  const packageFile = path.join(path.resolve(root), "package.json");
  if (!existsSync(packageFile)) return [];
  let source: string;
  let packageJson: {
    name?: unknown;
    bin?: unknown;
  };
  try {
    source = readFileSync(packageFile, "utf8");
    packageJson = JSON.parse(source) as typeof packageJson;
  } catch {
    return [];
  }

  const registrations: BinRegistration[] = [];
  if (typeof packageJson.bin === "string" && typeof packageJson.name === "string") {
    const location = jsonLocation(root, packageFile, source, "bin", packageJson.bin);
    if (location) registrations.push({ command: packageJson.name, target: packageJson.bin, location });
    return registrations;
  }
  if (!isRecord(packageJson.bin)) return registrations;
  for (const [command, target] of Object.entries(packageJson.bin)) {
    if (typeof target !== "string") continue;
    const location = jsonLocation(root, packageFile, source, command, target);
    if (location) registrations.push({ command, target, location });
  }
  return registrations;
}

function findHandlerDeclaration(source: string): HandlerDeclaration | null {
  const guardedCall = /if\s*\(\s*isCommandEntry\s*\(\s*\)\s*\)\s*\{\s*(?:void\s+)?([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;?\s*\}/m.exec(source)
    ?? /if\s*\(\s*require\.main[^)]*\)\s*\{\s*(?:void\s+)?([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;?\s*\}/m.exec(source);
  const declarations = [
    ...findFunctionDeclarations(source),
    ...findArrowDeclarations(source),
  ];
  const desiredName = guardedCall?.[1] ?? "main";
  const matches = declarations.filter((declaration) => declaration.name === desiredName);
  if (matches.length !== 1) return null;
  return { ...matches[0], calledByGuard: Boolean(guardedCall) };
}

function findFunctionDeclarations(source: string): HandlerDeclaration[] {
  const declarations: HandlerDeclaration[] = [];
  const pattern = /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const start = match.index + match[0].indexOf("function");
    const nameStart = match.index + match[0].indexOf(name);
    declarations.push({
      name,
      start,
      nameStart,
      end: match.index + match[0].length,
      ...lineAndColumn(source, start),
      calledByGuard: false,
    });
  }
  return declarations;
}

function findArrowDeclarations(source: string): HandlerDeclaration[] {
  const declarations: HandlerDeclaration[] = [];
  const pattern = /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const start = match.index + match[0].indexOf("const");
    const nameStart = match.index + match[0].indexOf(name);
    declarations.push({
      name,
      start,
      nameStart,
      end: match.index + match[0].length,
      ...lineAndColumn(source, start),
      calledByGuard: false,
    });
  }
  return declarations;
}

function selectEntryElement(
  root: string,
  elements: readonly EvidenceElement[],
  targetFile: string,
  handler: HandlerDeclaration,
): EvidenceElement | null {
  const matches = elements
    .filter((element) => sameFile(root, element.location.file, targetFile))
    .map((element) => ({ element, score: handlerScore(element, handler) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
  if (matches.length === 0) return null;
  if (matches.length > 1 && matches[0].score === matches[1].score) return null;
  return matches[0].element;
}

function handlerScore(element: EvidenceElement, handler: HandlerDeclaration): number {
  const pointMatches = locationContainsPoint(element.location, handler.line, handler.column);
  const lineMatches = element.location.span.startLine <= handler.line
    && element.location.span.endLine >= handler.line;
  const labelMatches = labelMatchesName(element, handler.name);
  const kindMatches = /function|handler|entry/i.test(element.kind);
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

function jsonLocation(
  root: string,
  file: string,
  source: string,
  key: string,
  target: string,
): SourceLocation | null {
  const binStart = source.search(/"bin"\s*:/);
  if (binStart < 0) return null;
  const keyLiteral = JSON.stringify(key);
  const keyStart = key === "bin"
    ? binStart
    : source.indexOf(keyLiteral, binStart);
  if (keyStart < 0) return null;
  const targetLiteral = JSON.stringify(target);
  const targetStart = source.indexOf(targetLiteral, keyStart + keyLiteral.length);
  if (targetStart < 0) return null;
  return sourceLocationAt(
    root,
    file,
    source,
    keyStart,
    targetStart + targetLiteral.length,
  );
}

function sourceIdentityForElement(element: EvidenceElement): SourceIdentity {
  if (element.source) return element.source;
  const start = positionKey(element.location.span.startLine, element.location.span.startColumn);
  const end = positionKey(element.location.span.endLine, element.location.span.endColumn);
  return { file: element.location.file, start, end: Math.max(start + 1, end) };
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

function locationContainsPoint(location: SourceLocation, line: number, column: number): boolean {
  const start = positionKey(location.span.startLine, location.span.startColumn);
  const end = positionKey(location.span.endLine, location.span.endColumn);
  const point = positionKey(line, column);
  return start <= point && end >= point;
}

function positionKey(line: number, column: number): number {
  return line * 1_000_000 + column;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
