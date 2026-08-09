import path from "node:path";
import { performance } from "node:perf_hooks";
import * as TypeScript from "typescript";
import type {
  ProgramEvidence,
  ProgramEvidenceGap,
  ProgramRelation,
  ProgramRelationKind,
} from "./program-evidence";
import { EvidenceCollector, type ProgramEvidenceOptions } from "./program-evidence";
import { ProgramFactIndex } from "./program-fact-index";
import { programForRoot } from "./program-evidence-loading";
import {
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
import { LazyEvidenceRelationProviderCore } from "./evidence-relation-provider-lazy";
import {
  instrumentationSnapshot,
  readMemorySnapshot,
} from "./evidence-relation-provider-instrumentation";
import type {
  EvidenceProviderInstrumentation as InstrumentationEvidenceProviderInstrumentation,
  InstrumentationState,
  MemorySnapshot as InstrumentationMemorySnapshot,
  ProviderOptions,
} from "./evidence-relation-provider-instrumentation";

/** Compatibility names retained for callers that imported recipe primitives. */
export type RelationRecipeInput = ProgramEvidenceRelationRecipeInput;
export type RelationRecipe = ProgramEvidenceRelationRecipe;
export const RelationRecipeStore = ProgramEvidenceRelationRecipeStore;

export type MemorySnapshot = InstrumentationMemorySnapshot;
export type EvidenceProviderInstrumentation = InstrumentationEvidenceProviderInstrumentation;

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
  "component-prop-binding",
  "render-terminal",
  "input-call",
  "resource-loader",
  "resource-result",
  "effect-input",
  "http-bridge",
];

/** No generated relation kind is silently omitted by the current provider. */
export const UNSUPPORTED_LAZY_RELATION_KINDS: readonly ProgramRelationKind[] = [];

/**
 * Lazy relation provider backed by source-indexed relation recipes.
 *
 * The provider owns only the relations requested through getRelations. It
 * keeps endpoint recipes so a later frontier expansion can create exact proof
 * records without constructing a project-wide ProgramRelation array.
 */
export class LazyEvidenceRelationProvider extends LazyEvidenceRelationProviderCore implements EvidenceRelationProvider {
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
    super(factIndex, recipesOrLoader, gaps, options);
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
