import path from "node:path";
import { performance } from "node:perf_hooks";
import * as TypeScript from "typescript";
import type {
  ProgramEvidence,
  ProgramEvidenceCollectionStats,
  ProgramEvidenceGap,
  ProgramRelation,
  ProgramRelationKind,
} from "./program-evidence";
import { EvidenceCollector, type ProgramEvidenceOptions } from "./program-evidence";
import { ProgramFactIndex } from "./program-fact-index";
import { programForRoot } from "./program-evidence-loading";
import {
  addProgramEvidenceCollectionStats,
  emptyProgramEvidenceCollectionStats,
} from "./program-evidence-collector-instrumentation";
import {
  ProgramEvidenceRelationFrontierLoader,
  RelationRecipeStore as ProgramEvidenceRelationRecipeStore,
} from "./program-evidence-relation-loading";
import type {
  RelationFrontierLoader,
  RelationRecipe as ProgramEvidenceRelationRecipe,
  RelationRecipeInput as ProgramEvidenceRelationRecipeInput,
} from "./program-evidence-relation-loading";
import type { SliceDirection } from "./scope-seam";
import type { AnalysisCancellationToken } from "./cancellation";

/** Compatibility names retained for callers that imported recipe primitives. */
export type RelationRecipeInput = ProgramEvidenceRelationRecipeInput;
export type RelationRecipe = ProgramEvidenceRelationRecipe;
export const RelationRecipeStore = ProgramEvidenceRelationRecipeStore;

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

export interface EvidenceRelationProvider {
  readonly factIndex: ProgramFactIndex;
  readonly facts: ProgramFactIndex;
  getRelations(elementId: string, direction: SliceDirection, cancellation?: AnalysisCancellationToken): readonly ProgramRelation[];
  getGaps(elementId: string): readonly ProgramEvidenceGap[];
  getInstrumentation(): EvidenceProviderInstrumentation;
}

export type LazyProgramEvidenceProvider = EvidenceRelationProvider;

/** Relation kinds currently represented by the source-backed collector. */
export const SUPPORTED_LAZY_RELATION_KINDS: readonly ProgramRelationKind[] = [
  "contains",
  "declares-parameter",
  "definition",
  "references",
  "invokes",
  "argument",
  "argument-binding",
  "return-expression",
  "return-value",
  "performs",
  "field-input",
  "pack-field",
  "renders",
  "component-occurrence",
  "component-prop",
  "render-terminal",
  "input-call",
  "resource-loader",
  "resource-result",
  "effect-input",
  "http-bridge",
];

/** No generated relation kind is silently omitted by the current provider. */
export const UNSUPPORTED_LAZY_RELATION_KINDS: readonly ProgramRelationKind[] = [];

type InstrumentationState = {
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

type ProviderOptions = {
  collectionTimeMs?: number;
  memory?: MemorySnapshot | null;
};

type RelationCandidate = {
  recipe: RelationRecipe;
  direction: "forward" | "backward";
};

/**
 * Lazy relation provider backed by source-indexed relation recipes.
 *
 * The provider owns only the relations requested through getRelations. It
 * keeps endpoint recipes so a later frontier expansion can create exact proof
 * records without constructing a project-wide ProgramRelation array.
 */
export class LazyEvidenceRelationProvider implements EvidenceRelationProvider {
  readonly facts: ProgramFactIndex;
  readonly factIndex: ProgramFactIndex;

  private readonly outgoingRecipes = new Map<string, RelationRecipe[]>();
  private readonly incomingRecipes = new Map<string, RelationRecipe[]>();
  private readonly loadedRecipeIds = new Set<string>();
  private readonly gapsByElement = new Map<string, ProgramEvidenceGap[]>();
  private readonly relationCache = new Map<string, readonly ProgramRelation[]>();
  private readonly materializedById = new Map<string, ProgramRelation>();
  private readonly frontierLoader: RelationFrontierLoader | null;
  private readonly state: InstrumentationState;

  constructor(
    factIndex: ProgramFactIndex,
    recipes: readonly RelationRecipe[],
    gaps?: readonly ProgramEvidenceGap[],
    options?: ProviderOptions,
  );
  constructor(
    factIndex: ProgramFactIndex,
    frontierLoader: RelationFrontierLoader,
    gaps?: readonly ProgramEvidenceGap[],
    options?: ProviderOptions,
  );
  constructor(
    factIndex: ProgramFactIndex,
    recipesOrLoader: readonly RelationRecipe[] | RelationFrontierLoader,
    gaps: readonly ProgramEvidenceGap[] = [],
    options: ProviderOptions = {},
  ) {
    this.facts = factIndex;
    this.factIndex = factIndex;
    this.frontierLoader = isRelationFrontierLoader(recipesOrLoader) ? recipesOrLoader : null;
    const initialRecipeCount = isRelationFrontierLoader(recipesOrLoader) ? 0 : recipesOrLoader.length;
    this.state = {
      factCount: factIndex.factCount,
      expansionRequests: 0,
      materializedRelationCount: 0,
      memoHits: 0,
      collectionTimeMs: options.collectionTimeMs ?? 0,
      expansionTimeMs: 0,
      recipeCount: initialRecipeCount,
      relationIndexCount: initialRecipeCount * 2,
      initialRecipeCount,
      initialRelationIndexCount: initialRecipeCount * 2,
      lastExpansionRecipeCount: 0,
      lastExpansionRelationIndexCount: 0,
      lastExpansionScannedRelationCount: 0,
      lastExpansionSourceFilesVisited: 0,
      lastExpansionAstUnitsVisited: 0,
      lastExpansionPartitionsVisited: 0,
      lastExpansionRecipesExamined: 0,
      totalExpansionScannedRelationCount: 0,
      totalExpansionSourceFilesVisited: 0,
      totalExpansionAstUnitsVisited: 0,
      totalExpansionPartitionsVisited: 0,
      totalExpansionRecipesExamined: 0,
      deferredCollection: emptyProgramEvidenceCollectionStats(0),
      memory: options.memory === undefined ? readMemorySnapshot() : options.memory,
    };

    if (!isRelationFrontierLoader(recipesOrLoader)) for (const recipe of recipesOrLoader) this.addRecipe(recipe);
    for (const gap of gaps) {
      const elementGaps = this.gapsByElement.get(gap.from) ?? [];
      elementGaps.push(gap);
      this.gapsByElement.set(gap.from, elementGaps);
    }
  }

  getRelations(elementId: string, direction: SliceDirection, cancellation?: AnalysisCancellationToken): readonly ProgramRelation[] {
    cancellation?.throwIfCancelled();
    this.state.expansionRequests += 1;
    const cacheKey = `${elementId}:${direction}`;
    const cached = this.relationCache.get(cacheKey);
    if (cached) {
      this.state.memoHits += 1;
      this.resetLastExpansionStats();
      return cached;
    }

    const started = performance.now();
    this.loadFrontier(elementId, direction, cancellation);
    cancellation?.throwIfCancelled();
    const candidates = this.candidatesFor(elementId, direction);
    const relations = candidates
      .sort((left, right) => this.compareCandidates(left, right, direction))
      .map(({ recipe }) => this.materialize(recipe));
    this.relationCache.set(cacheKey, relations);
    this.state.expansionTimeMs += performance.now() - started;
    return relations;
  }

  getGaps(elementId: string): readonly ProgramEvidenceGap[] {
    return this.gapsByElement.get(elementId) ?? [];
  }

  getInstrumentation(): EvidenceProviderInstrumentation {
    return instrumentationSnapshot(this.state, this.factIndex);
  }

  get instrumentation(): EvidenceProviderInstrumentation {
    return this.getInstrumentation();
  }

  private candidatesFor(elementId: string, direction: SliceDirection): RelationCandidate[] {
    const candidates: RelationCandidate[] = [];
    if (direction === "forward" || direction === "both") {
      for (const recipe of this.outgoingRecipes.get(elementId) ?? []) candidates.push({ recipe, direction: "forward" });
    }
    if (direction === "backward" || direction === "both") {
      for (const recipe of this.incomingRecipes.get(elementId) ?? []) candidates.push({ recipe, direction: "backward" });
    }
    const unique = new Map<string, RelationCandidate>();
    for (const candidate of candidates) if (!unique.has(candidate.recipe.id)) unique.set(candidate.recipe.id, candidate);
    return [...unique.values()];
  }

  private loadFrontier(elementId: string, direction: SliceDirection, cancellation?: AnalysisCancellationToken): void {
    this.resetLastExpansionStats();
    if (!this.frontierLoader) return;
    const frontier = this.frontierLoader.load(elementId, direction, cancellation);
    cancellation?.throwIfCancelled();
    addProgramEvidenceCollectionStats(this.state.deferredCollection, frontier.collectorStats);
    for (const recipe of frontier.recipes) this.addRecipe(recipe);
    this.state.lastExpansionRecipeCount = frontier.recipes.length;
    this.state.lastExpansionRelationIndexCount = frontier.relationIndexCount;
    this.state.lastExpansionScannedRelationCount = frontier.recipes.length;
    this.state.lastExpansionSourceFilesVisited = frontier.sourceFilesVisited;
    this.state.lastExpansionAstUnitsVisited = frontier.astUnitsVisited;
    this.state.lastExpansionPartitionsVisited = frontier.partitionsVisited;
    this.state.lastExpansionRecipesExamined = frontier.recipesExamined;
    this.state.totalExpansionScannedRelationCount += frontier.recipes.length;
    this.state.totalExpansionSourceFilesVisited += frontier.sourceFilesVisited;
    this.state.totalExpansionAstUnitsVisited += frontier.astUnitsVisited;
    this.state.totalExpansionPartitionsVisited += frontier.partitionsVisited;
    this.state.totalExpansionRecipesExamined += frontier.recipesExamined;
  }

  private addRecipe(recipe: RelationRecipe): void {
    if (this.loadedRecipeIds.has(recipe.id)) return;
    this.loadedRecipeIds.add(recipe.id);
    const outgoing = this.outgoingRecipes.get(recipe.from) ?? [];
    outgoing.push(recipe);
    this.outgoingRecipes.set(recipe.from, outgoing);
    const incoming = this.incomingRecipes.get(recipe.to) ?? [];
    incoming.push(recipe);
    this.incomingRecipes.set(recipe.to, incoming);
    if (this.frontierLoader) {
      this.state.recipeCount += 1;
      this.state.relationIndexCount += 2;
    }
  }

  private resetLastExpansionStats(): void {
    this.state.lastExpansionRecipeCount = 0;
    this.state.lastExpansionRelationIndexCount = 0;
    this.state.lastExpansionScannedRelationCount = 0;
    this.state.lastExpansionSourceFilesVisited = 0;
    this.state.lastExpansionAstUnitsVisited = 0;
    this.state.lastExpansionPartitionsVisited = 0;
    this.state.lastExpansionRecipesExamined = 0;
  }

  private compareCandidates(left: RelationCandidate, right: RelationCandidate, direction: SliceDirection): number {
    const leftTarget = left.direction === "forward" ? left.recipe.to : left.recipe.from;
    const rightTarget = right.direction === "forward" ? right.recipe.to : right.recipe.from;
    const priority = this.factIndex.comparePriority(leftTarget, rightTarget, direction);
    return priority || left.recipe.sequence - right.recipe.sequence;
  }

  private materialize(recipe: RelationRecipe): ProgramRelation {
    const existing = this.materializedById.get(recipe.id);
    if (existing) return existing;
    const relation: ProgramRelation = {
      id: recipe.id,
      from: recipe.from,
      to: recipe.to,
      kind: recipe.kind,
      evidence: recipe.evidence,
      proof: recipe.proof,
      confidence: recipe.confidence,
    };
    this.materializedById.set(recipe.id, relation);
    this.state.materializedRelationCount += 1;
    return relation;
  }
}

/**
 * Compatibility provider for an already collected ProgramEvidence payload.
 * It preserves the eager arrays while exposing the same query seam.
 */
export class ArrayEvidenceRelationProvider implements EvidenceRelationProvider {
  readonly facts: ProgramFactIndex;
  readonly factIndex: ProgramFactIndex;

  private readonly state: InstrumentationState;
  private readonly gapCache = new Map<string, readonly ProgramEvidenceGap[]>();

  constructor(private readonly evidence: ProgramEvidence) {
    this.facts = new ProgramFactIndex(evidence.elements, evidence.sourceFiles);
    this.factIndex = this.facts;
    this.state = {
      factCount: evidence.elements.length,
      expansionRequests: 0,
      materializedRelationCount: evidence.relations.length,
      memoHits: 0,
      collectionTimeMs: 0,
      expansionTimeMs: 0,
      recipeCount: evidence.relations.length,
      relationIndexCount: evidence.relations.length * 2,
      initialRecipeCount: evidence.relations.length,
      initialRelationIndexCount: evidence.relations.length * 2,
      lastExpansionRecipeCount: 0,
      lastExpansionRelationIndexCount: 0,
      lastExpansionScannedRelationCount: 0,
      lastExpansionSourceFilesVisited: 0,
      lastExpansionAstUnitsVisited: 0,
      lastExpansionPartitionsVisited: 0,
      lastExpansionRecipesExamined: 0,
      totalExpansionScannedRelationCount: 0,
      totalExpansionSourceFilesVisited: 0,
      totalExpansionAstUnitsVisited: 0,
      totalExpansionPartitionsVisited: 0,
      totalExpansionRecipesExamined: 0,
      deferredCollection: emptyProgramEvidenceCollectionStats(0),
      memory: readMemorySnapshot(),
    };
  }

  getRelations(elementId: string, direction: SliceDirection): readonly ProgramRelation[] {
    this.state.expansionRequests += 1;
    const started = performance.now();
    const candidates: Array<{ relation: ProgramRelation; targetId: string; sequence: number }> = [];
    let sequence = 0;
    if (direction === "forward" || direction === "both") {
      for (const relationId of this.evidence.indexes.outgoingRelationIds.get(elementId) ?? []) {
        const relation = this.evidence.indexes.relationsById.get(relationId);
        if (relation) candidates.push({ relation, targetId: relation.to, sequence: sequence++ });
      }
    }
    if (direction === "backward" || direction === "both") {
      for (const relationId of this.evidence.indexes.incomingRelationIds.get(elementId) ?? []) {
        const relation = this.evidence.indexes.relationsById.get(relationId);
        if (relation) candidates.push({ relation, targetId: relation.from, sequence: sequence++ });
      }
    }
    candidates.sort((left, right) => this.facts.comparePriority(left.targetId, right.targetId, direction) || left.sequence - right.sequence);
    this.state.expansionTimeMs += performance.now() - started;
    return candidates.map(({ relation }) => relation);
  }

  getGaps(elementId: string): readonly ProgramEvidenceGap[] {
    const cached = this.gapCache.get(elementId);
    if (cached) {
      this.state.memoHits += 1;
      return cached;
    }
    const gaps = this.evidence.gaps.filter((gap) => gap.from === elementId);
    this.gapCache.set(elementId, gaps);
    return gaps;
  }

  getInstrumentation(): EvidenceProviderInstrumentation {
    return instrumentationSnapshot(this.state, this.factIndex);
  }

  get instrumentation(): EvidenceProviderInstrumentation {
    return this.getInstrumentation();
  }
}

export function createArrayEvidenceRelationProvider(evidence: ProgramEvidence): ArrayEvidenceRelationProvider {
  return new ArrayEvidenceRelationProvider(evidence);
}

export function createEvidenceRelationProvider(evidence: ProgramEvidence): ArrayEvidenceRelationProvider {
  return createArrayEvidenceRelationProvider(evidence);
}

/** Create a source-backed lazy provider from an existing TypeScript program. */
export function createLazyProgramEvidenceProvider(
  root: string,
  options?: ProgramEvidenceOptions,
): LazyProgramEvidenceProvider;
export function createLazyProgramEvidenceProvider(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  options?: ProgramEvidenceOptions,
): LazyProgramEvidenceProvider;
export function createLazyProgramEvidenceProvider(
  first: string | typeof TypeScript,
  second?: TypeScript.Program | ProgramEvidenceOptions,
  third?: string,
  fourth: ProgramEvidenceOptions = {},
): LazyProgramEvidenceProvider {
  if (typeof first === "string") {
    const root = path.resolve(first);
    const options = (second as ProgramEvidenceOptions | undefined) ?? {};
    return createLazyProvider(TypeScript, programForRoot(root), root, options);
  }
  return createLazyProvider(first, second as TypeScript.Program, third as string, fourth);
}

/** Descriptive alias for callers that use the provider terminology. */
export const createProgramEvidenceProvider = createLazyProgramEvidenceProvider;

/** Root-loading alias used by bounded large-project initialization probes. */
export function createLazyProgramEvidenceProviderForRoot(root: string, options?: ProgramEvidenceOptions): LazyProgramEvidenceProvider {
  return createLazyProgramEvidenceProvider(root, options);
}

/** Adapt an existing eager result to the provider seam. */
export function providerForProgramEvidence(evidence: ProgramEvidence): EvidenceRelationProvider {
  return createEvidenceRelationProvider(evidence);
}

/** Build the compact fact index used by either provider implementation. */
export function factIndexForProgramEvidence(evidence: ProgramEvidence): ProgramFactIndex {
  return new ProgramFactIndex(evidence.elements, evidence.sourceFiles);
}

function createLazyProvider(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  options: ProgramEvidenceOptions,
): LazyProgramEvidenceProvider {
  const started = performance.now();
  const collector = new EvidenceCollector(ts, program, root, options);
  const collected = collector.collectFactsOnly();
  const declarationCatalog = collector.createDeclarationCatalog();
  const facts = new ProgramFactIndex(
    collected.facts,
    collected.sourceFiles,
    (fact) => collector.hydrateFact(fact),
  );
  const frontierLoader = new ProgramEvidenceRelationFrontierLoader(
    ts,
    program,
    root,
    options,
    facts,
    collector.sourceFiles,
    declarationCatalog,
  );
  const provider = new LazyEvidenceRelationProvider(
    facts,
    frontierLoader,
    collected.gaps,
    { collectionTimeMs: performance.now() - started },
  );
  collector.releaseTransientState();
  return provider;
}

function instrumentationSnapshot(state: InstrumentationState, factIndex: ProgramFactIndex): EvidenceProviderInstrumentation {
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

function readMemorySnapshot(): MemorySnapshot | null {
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

function isRelationFrontierLoader(
  value: readonly RelationRecipe[] | RelationFrontierLoader,
): value is RelationFrontierLoader {
  return !Array.isArray(value);
}
