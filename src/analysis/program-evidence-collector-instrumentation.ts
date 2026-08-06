import type {
  ProgramEvidenceCollectionStats,
  ProgramEvidenceMemorySample,
  ProgramEvidencePhaseName,
  ProgramEvidencePhaseStats,
  ProgramEvidenceRelationStats,
} from "./program-evidence";
import type { ProgramEvidenceDeclarationCatalogImportStats } from "./program-evidence-declaration-catalog";

const PHASE_NAMES: readonly ProgramEvidencePhaseName[] = [
  "declarations",
  "nodes",
  "connectCalls",
  "connectPendingReferences",
  "renderComponents",
  "connectHttpBridges",
];

export function emptyProgramEvidenceCollectionStats(sourceFilesVisited: number): ProgramEvidenceCollectionStats {
  const phases = Object.fromEntries(PHASE_NAMES.map((name) => [name, emptyPhaseStats()])) as Record<ProgramEvidencePhaseName, ProgramEvidencePhaseStats>;
  return {
    sourceFilesVisited,
    astUnitsVisited: 0,
    phases,
    relation: emptyRelationStats(),
    declarationCatalog: emptyProgramEvidenceDeclarationCatalogImportStats(),
  };
}

export function emptyProgramEvidenceRelationStats(): ProgramEvidenceRelationStats {
  return emptyRelationStats();
}

export function addProgramEvidenceCollectionStats(
  target: ProgramEvidenceCollectionStats,
  source: ProgramEvidenceCollectionStats,
): void {
  target.sourceFilesVisited += source.sourceFilesVisited;
  target.astUnitsVisited += source.astUnitsVisited;
  for (const name of PHASE_NAMES) {
    const targetPhase = target.phases[name];
    const sourcePhase = source.phases[name];
    targetPhase.calls += sourcePhase.calls;
    targetPhase.elapsedMs += sourcePhase.elapsedMs;
    targetPhase.inputCount += sourcePhase.inputCount;
    targetPhase.outputCount += sourcePhase.outputCount;
    if (!targetPhase.memoryStart && sourcePhase.memoryStart) targetPhase.memoryStart = sourcePhase.memoryStart;
    if (sourcePhase.memoryEnd) targetPhase.memoryEnd = sourcePhase.memoryEnd;
  }
  target.relation.candidateCalls += source.relation.candidateCalls;
  target.relation.acceptedCandidates += source.relation.acceptedCandidates;
  target.relation.proofCount += source.relation.proofCount;
  target.relation.proofLocationCount += source.relation.proofLocationCount;
  target.relation.locationCalls += source.relation.locationCalls;
  target.relation.locationElapsedMs += source.relation.locationElapsedMs;
  target.relation.relationIdCalls += source.relation.relationIdCalls;
  target.relation.relationIdElapsedMs += source.relation.relationIdElapsedMs;
  target.relation.sinkCalls += source.relation.sinkCalls;
  target.relation.sinkElapsedMs += source.relation.sinkElapsedMs;
  target.relation.retainedRecipes += source.relation.retainedRecipes;
  target.declarationCatalog.catalogEntries += source.declarationCatalog.catalogEntries;
  target.declarationCatalog.catalogBytesEstimate += source.declarationCatalog.catalogBytesEstimate;
  target.declarationCatalog.importedEntries += source.declarationCatalog.importedEntries;
  target.declarationCatalog.skippedDeclarationFiles += source.declarationCatalog.skippedDeclarationFiles;
  target.declarationCatalog.skippedDeclarationAstUnits += source.declarationCatalog.skippedDeclarationAstUnits;
  target.declarationCatalog.importElapsedMs += source.declarationCatalog.importElapsedMs;
  if (!target.declarationCatalog.importMemoryStart && source.declarationCatalog.importMemoryStart) {
    target.declarationCatalog.importMemoryStart = source.declarationCatalog.importMemoryStart;
  }
  if (source.declarationCatalog.importMemoryEnd) {
    target.declarationCatalog.importMemoryEnd = source.declarationCatalog.importMemoryEnd;
  }
}

export function readProgramEvidenceMemory(): ProgramEvidenceMemorySample | null {
  try {
    const memory = process.memoryUsage();
    return { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal };
  } catch {
    return null;
  }
}

function emptyPhaseStats(): ProgramEvidencePhaseStats {
  return { calls: 0, elapsedMs: 0, inputCount: 0, outputCount: 0, memoryStart: null, memoryEnd: null };
}

function emptyRelationStats(): ProgramEvidenceRelationStats {
  return {
    candidateCalls: 0,
    acceptedCandidates: 0,
    proofCount: 0,
    proofLocationCount: 0,
    locationCalls: 0,
    locationElapsedMs: 0,
    relationIdCalls: 0,
    relationIdElapsedMs: 0,
    sinkCalls: 0,
    sinkElapsedMs: 0,
    retainedRecipes: 0,
  };
}

export function emptyProgramEvidenceDeclarationCatalogImportStats(): ProgramEvidenceDeclarationCatalogImportStats {
  return {
    catalogEntries: 0,
    catalogBytesEstimate: 0,
    importedEntries: 0,
    skippedDeclarationFiles: 0,
    skippedDeclarationAstUnits: 0,
    importElapsedMs: 0,
    importMemoryStart: null,
    importMemoryEnd: null,
  };
}
