import * as TypeScript from "typescript";
import type {
  EvidenceConfidence,
  ProgramEvidenceCollectionStats,
  ProgramEvidenceLocation,
  ProgramEvidenceOptions,
  ProgramProof,
  ProgramRelationKind,
} from "./program-evidence";
import { ProgramEvidenceCollector } from "./program-evidence-collector";
import {
  CompactRelationIndex,
  createCompactRelationDescriptor,
  type CompactRelationDescriptor,
  type CompactRelationLocationToken,
} from "./program-evidence-connector-index";
import type { ProgramEvidenceDeclarationCatalog } from "./program-evidence-declaration-catalog";
import { ProgramFactIndex } from "./program-fact-index";
import { emptyProgramEvidenceCollectionStats } from "./program-evidence-collector-instrumentation";
import type { SliceDirection } from "./scope-seam";
import type { AnalysisCancellationToken } from "./cancellation";

/** The source-backed relation input before it becomes a public relation. */
export type RelationRecipeInput = {
  id: string;
  from: string;
  to: string;
  kind: ProgramRelationKind;
  evidence: ProgramEvidenceLocation[];
  proof: ProgramProof;
  confidence: EvidenceConfidence;
};

/** A deferred relation record. It is not exposed as a ProgramRelation. */
export type RelationRecipe = RelationRecipeInput & { sequence: number };

export type RelationSink = (input: RelationRecipeInput) => void;

/** Deduplicate relation recipes retained for one requested frontier. */
export class RelationRecipeStore {
  private readonly recipes: RelationRecipe[] = [];
  private readonly keys = new Set<string>();

  add(input: RelationRecipeInput): void {
    if (this.keys.has(input.id)) return;
    this.keys.add(input.id);
    this.recipes.push({ ...input, sequence: this.recipes.length });
  }

  get values(): readonly RelationRecipe[] {
    return this.recipes;
  }

  get size(): number {
    return this.recipes.length;
  }
}

export type RelationFrontier = {
  recipes: readonly RelationRecipe[];
  relationIndexCount: number;
  sourceFilesVisited: number;
  astUnitsVisited: number;
  partitionsVisited: number;
  recipesExamined: number;
  collectorStats: ProgramEvidenceCollectionStats;
};

export interface RelationFrontierLoader {
  load(elementId: string, direction: SliceDirection, cancellation?: AnalysisCancellationToken): RelationFrontier;
}

type RelationSource = {
  index: CompactRelationIndex;
  collectorStats: ProgramEvidenceCollectionStats;
};

/**
 * Load relation recipes from one provider-local compact relation source.
 *
 * The first frontier collects the configured source files once. Later frontier
 * requests read endpoint and producer-file buckets without replaying source.
 */
export class ProgramEvidenceRelationFrontierLoader implements RelationFrontierLoader {
  private source: RelationSource | null = null;

  constructor(
    private readonly ts: typeof TypeScript,
    private readonly program: TypeScript.Program,
    private readonly root: string,
    private readonly options: ProgramEvidenceOptions,
    private readonly factIndex: ProgramFactIndex,
    private readonly sourceFiles: readonly TypeScript.SourceFile[],
    private readonly declarationCatalog?: ProgramEvidenceDeclarationCatalog,
  ) {}

  load(elementId: string, direction: SliceDirection, cancellation?: AnalysisCancellationToken): RelationFrontier {
    cancellation?.throwIfCancelled();
    const recipes = new RelationRecipeStore();
    const sourceWasLoaded = this.source !== null;
    const source = this.relationSource(cancellation);
    let recipesExamined = 0;
    for (const primaryFile of this.factIndex.relationSourceFilesFor(elementId)) {
      cancellation?.throwIfCancelled();
      const descriptors = source.index.query({
        elementId,
        direction,
        producerFile: primaryFile,
      });
      recipesExamined += descriptors.length;
      for (const descriptor of descriptors) {
        recipes.add(recipeFromDescriptor(descriptor));
      }
    }
    const collectorStats = sourceWasLoaded
      ? emptyProgramEvidenceCollectionStats(0)
      : source.collectorStats;
    return {
      recipes: recipes.values,
      relationIndexCount: recipes.size * 2,
      sourceFilesVisited: collectorStats.sourceFilesVisited,
      astUnitsVisited: collectorStats.astUnitsVisited,
      partitionsVisited: sourceWasLoaded ? 0 : 1,
      recipesExamined,
      collectorStats,
    };
  }

  private relationSource(cancellation?: AnalysisCancellationToken): RelationSource {
    if (this.source) return this.source;
    cancellation?.throwIfCancelled();
    const index = new CompactRelationIndex();
    const seenByProducer = new Map<string, Set<string>>();
    const sequenceByProducer = new Map<string, number>();
    const collector = new ProgramEvidenceCollector(
      this.ts,
      this.program,
      this.root,
      {
        ...this.options,
        sourceFiles: this.sourceFiles,
        declarationCatalog: this.declarationCatalog,
        cancellation,
      },
      (input) => {
        const producerFile = input.evidence[0]?.file ?? null;
        const producerKey = producerFile ?? "\u0000";
        const seen = seenByProducer.get(producerKey) ?? new Set<string>();
        if (seen.has(input.id)) return;
        const sourceSequence = sequenceByProducer.get(producerKey) ?? 0;
        const descriptor = createCompactRelationDescriptor({
          from: input.from,
          to: input.to,
          kind: input.kind,
          evidence: input.evidence.map(compactLocation),
          proof: {
            kind: input.proof.kind,
            detail: input.proof.detail,
            locations: input.proof.locations.map(compactLocation),
          },
          confidence: input.confidence,
          sourceSequence,
          contributingFiles: contributingFiles(input),
          producerFile,
        });
        if (descriptor.descriptorId !== input.id) {
          throw new Error(`Compact relation identity mismatch for ${input.id}.`);
        }
        seen.add(input.id);
        seenByProducer.set(producerKey, seen);
        sequenceByProducer.set(producerKey, sourceSequence + 1);
        index.add(descriptor);
      },
    );
    let stats: ProgramEvidenceCollectionStats;
    try {
      collector.collectDeferredFacts();
      cancellation?.throwIfCancelled();
      stats = collector.getCollectionStats();
    } finally {
      collector.releaseTransientState();
    }
    this.reportSourceProfile(index, stats);
    this.source = {
      index,
      collectorStats: stats,
    };
    cancellation?.throwIfCancelled();
    return this.source;
  }

  private reportSourceProfile(index: CompactRelationIndex, stats: ProgramEvidenceCollectionStats): void {
    if (process.env.TSX_DATA_FLOW_COLLECTOR_PROFILE !== "1") return;
    process.stderr.write(`[collector-profile] ${JSON.stringify({ relationSource: "provider", descriptors: index.size, ...stats })}\n`);
  }
}

function compactLocation(location: ProgramEvidenceLocation): CompactRelationLocationToken {
  return {
    file: location.file,
    start: {
      line: location.span.startLine,
      column: location.span.startColumn,
    },
    end: {
      line: location.span.endLine,
      column: location.span.endColumn,
    },
  };
}

function expandLocation(location: CompactRelationLocationToken): ProgramEvidenceLocation {
  return {
    file: location.file,
    line: location.start.line,
    column: location.start.column,
    span: {
      startLine: location.start.line,
      startColumn: location.start.column,
      endLine: location.end.line,
      endColumn: location.end.column,
    },
  };
}

function contributingFiles(input: RelationRecipeInput): string[] {
  return [...new Set([
    ...input.evidence.map((location) => location.file),
    ...input.proof.locations.map((location) => location.file),
  ])];
}

function recipeFromDescriptor(descriptor: CompactRelationDescriptor): RelationRecipeInput {
  return {
    id: descriptor.descriptorId,
    from: descriptor.from,
    to: descriptor.to,
    kind: descriptor.kind,
    evidence: descriptor.evidence.map(expandLocation),
    proof: {
      kind: descriptor.proof.kind,
      detail: descriptor.proof.detail,
      locations: descriptor.proof.locations.map(expandLocation),
    },
    confidence: descriptor.confidence,
  };
}
