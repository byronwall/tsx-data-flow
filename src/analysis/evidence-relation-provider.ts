import { performance } from "node:perf_hooks";
import * as TypeScript from "typescript";
import type {
  ProgramEvidenceGap,
  ProgramRelation,
} from "./program-evidence";
import { EvidenceCollector, type ProgramEvidenceOptions } from "./program-evidence";
import { ProgramFactIndex } from "./program-fact-index";


import {
  ProgramEvidenceRelationFrontierLoader,
} from "./program-evidence-relation-loading";
import type {
  RelationFrontierLoader,
  RelationRecipe as ProgramEvidenceRelationRecipe,
} from "./program-evidence-relation-loading";
import type { SliceDirection } from "./scope-seam";
import type { AnalysisCancellationToken } from "./cancellation";
import { LazyEvidenceRelationProviderCore } from "./evidence-relation-provider-lazy";


import type {
  EvidenceProviderInstrumentation as InstrumentationEvidenceProviderInstrumentation,
  ProviderOptions,
} from "./evidence-relation-provider-instrumentation";
export type RelationRecipe = ProgramEvidenceRelationRecipe;
export type EvidenceProviderInstrumentation = InstrumentationEvidenceProviderInstrumentation;

export interface EvidenceRelationProvider {
  readonly factIndex: ProgramFactIndex;
  readonly facts: ProgramFactIndex;
  getRelations(elementId: string, direction: SliceDirection, cancellation?: AnalysisCancellationToken): readonly ProgramRelation[];
  getGaps(elementId: string): readonly ProgramEvidenceGap[];
  getInstrumentation(): EvidenceProviderInstrumentation;
}

export type LazyProgramEvidenceProvider = EvidenceRelationProvider;

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

/** Create a source-backed lazy provider from an existing TypeScript program. */
export function createLazyProgramEvidenceProvider(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  options: ProgramEvidenceOptions = {},
): LazyProgramEvidenceProvider {
  return createLazyProvider(ts, program, root, options);
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
