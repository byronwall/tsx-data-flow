import { performance } from "node:perf_hooks";
import type { ProgramEvidenceGap, ProgramRelation } from "./program-evidence";
import {
  addProgramEvidenceCollectionStats,
  emptyProgramEvidenceCollectionStats,
} from "./program-evidence-collector-instrumentation";
import { ProgramFactIndex } from "./program-fact-index";
import type {
  RelationFrontierLoader,
  RelationRecipe,
} from "./program-evidence-relation-loading";
import {
  instrumentationSnapshot,
  readMemorySnapshot,
  type EvidenceProviderInstrumentation,
  type InstrumentationState,
  type ProviderOptions,
} from "./evidence-relation-provider-instrumentation";
import type { AnalysisCancellationToken } from "./cancellation";
import type { SliceDirection } from "./scope-seam";

type RelationCandidate = {
  recipe: RelationRecipe;
  direction: "forward" | "backward";
};

/** Source-indexed provider implementation used by the public compatibility class. */
export class LazyEvidenceRelationProviderCore {
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

function isRelationFrontierLoader(
  value: readonly RelationRecipe[] | RelationFrontierLoader,
): value is RelationFrontierLoader {
  return !Array.isArray(value);
}
