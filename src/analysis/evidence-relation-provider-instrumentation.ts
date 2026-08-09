import type { ProgramEvidenceCollectionStats } from "./program-evidence";
import type { ProgramFactIndex } from "./program-fact-index";

export type MemorySnapshot = {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
};

export type EvidenceProviderInstrumentation = {
  factCount: number;
  compactFactCount: number;
  compactFactBytesEstimate: number;
  hydratedElementCount: number;
  hydrationTimeMs: number;
  factIterations: number;
  factMemoHits: number;
  expansionRequests: number;
  materializedRelationCount: number;
  memoHits: number;
  collectionTimeMs: number;
  expansionTimeMs: number;
  collectionElapsedMs: number;
  expansionElapsedMs: number;
  recipeCount: number;
  relationIndexCount: number;
  initialRecipeCount: number;
  initialRelationIndexCount: number;
  lastExpansionRecipeCount: number;
  lastExpansionRelationIndexCount: number;
  lastExpansionScannedRelationCount: number;
  lastExpansionSourceFilesVisited: number;
  lastExpansionAstUnitsVisited: number;
  lastExpansionPartitionsVisited: number;
  lastExpansionRecipesExamined: number;
  totalExpansionScannedRelationCount: number;
  totalExpansionSourceFilesVisited: number;
  totalExpansionAstUnitsVisited: number;
  totalExpansionPartitionsVisited: number;
  totalExpansionRecipesExamined: number;
  deferredCollection: ProgramEvidenceCollectionStats;
  memory: MemorySnapshot | null;
};

export type InstrumentationState = {
  factCount: number;
  expansionRequests: number;
  materializedRelationCount: number;
  memoHits: number;
  collectionTimeMs: number;
  expansionTimeMs: number;
  recipeCount: number;
  relationIndexCount: number;
  initialRecipeCount: number;
  initialRelationIndexCount: number;
  lastExpansionRecipeCount: number;
  lastExpansionRelationIndexCount: number;
  lastExpansionScannedRelationCount: number;
  lastExpansionSourceFilesVisited: number;
  lastExpansionAstUnitsVisited: number;
  lastExpansionPartitionsVisited: number;
  lastExpansionRecipesExamined: number;
  totalExpansionScannedRelationCount: number;
  totalExpansionSourceFilesVisited: number;
  totalExpansionAstUnitsVisited: number;
  totalExpansionPartitionsVisited: number;
  totalExpansionRecipesExamined: number;
  deferredCollection: ProgramEvidenceCollectionStats;
  memory: MemorySnapshot | null;
};

export type ProviderOptions = {
  collectionTimeMs?: number;
  memory?: MemorySnapshot | null;
};

export function instrumentationSnapshot(
  state: InstrumentationState,
  factIndex: ProgramFactIndex,
): EvidenceProviderInstrumentation {
  const facts = factIndex.getInstrumentation();
  return {
    factCount: state.factCount,
    compactFactCount: facts.compactFactCount,
    compactFactBytesEstimate: facts.compactFactBytesEstimate,
    hydratedElementCount: facts.hydratedElementCount,
    hydrationTimeMs: facts.hydrationTimeMs,
    factIterations: facts.factIterations,
    factMemoHits: facts.memoHits,
    expansionRequests: state.expansionRequests,
    materializedRelationCount: state.materializedRelationCount,
    memoHits: state.memoHits + facts.memoHits,
    collectionTimeMs: state.collectionTimeMs,
    expansionTimeMs: state.expansionTimeMs,
    collectionElapsedMs: state.collectionTimeMs,
    expansionElapsedMs: state.expansionTimeMs,
    recipeCount: state.recipeCount,
    relationIndexCount: state.relationIndexCount,
    initialRecipeCount: state.initialRecipeCount,
    initialRelationIndexCount: state.initialRelationIndexCount,
    lastExpansionRecipeCount: state.lastExpansionRecipeCount,
    lastExpansionRelationIndexCount: state.lastExpansionRelationIndexCount,
    lastExpansionScannedRelationCount: state.lastExpansionScannedRelationCount,
    lastExpansionSourceFilesVisited: state.lastExpansionSourceFilesVisited,
    lastExpansionAstUnitsVisited: state.lastExpansionAstUnitsVisited,
    lastExpansionPartitionsVisited: state.lastExpansionPartitionsVisited,
    lastExpansionRecipesExamined: state.lastExpansionRecipesExamined,
    totalExpansionScannedRelationCount: state.totalExpansionScannedRelationCount,
    totalExpansionSourceFilesVisited: state.totalExpansionSourceFilesVisited,
    totalExpansionAstUnitsVisited: state.totalExpansionAstUnitsVisited,
    totalExpansionPartitionsVisited: state.totalExpansionPartitionsVisited,
    totalExpansionRecipesExamined: state.totalExpansionRecipesExamined,
    deferredCollection: state.deferredCollection,
    memory: state.memory ? { ...state.memory } : null,
  };
}

export function readMemorySnapshot(): MemorySnapshot | null {
  try {
    const memory = process.memoryUsage();
    return {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
    };
  } catch {
    return null;
  }
}
