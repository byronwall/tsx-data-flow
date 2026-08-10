import type {
  CollectedProgramFacts,
  ProgramEvidence,
} from "./program-evidence";
import type { RelationSink } from "./program-evidence-relation-loading";
import { ProgramEvidenceCollectorJsxSupport } from "./program-evidence-collector-jsx-support";
import { relative } from "./program-evidence-support";

export class ProgramEvidenceCollector extends ProgramEvidenceCollectorJsxSupport {
  collect(): ProgramEvidence {
    this.collectSourceFacts();
    const elements = this.facts.map((fact) => this.hydrateFact(fact));
    const indexes = this.buildIndexes(elements);
    return {
      elements,
      relations: this.relations,
      gaps: this.gaps,
      sourceFiles: this.files.map((file) => relative(this.root, file.fileName)),
      indexes,
      coverage: {
        sourceFiles: this.files.length,
        elements: elements.length,
        relations: this.relations.length,
        provenRelations: this.relations.filter(
          (relation) => relation.confidence === "proven",
        ).length,
        partialRelations: this.relations.filter(
          (relation) => relation.confidence === "partial",
        ).length,
        gaps: this.gaps.length,
      },
    };
  }

  collectDeferredFacts(): CollectedProgramFacts {
    this.collectSourceFacts();
    return {
      facts: this.facts,
      gaps: this.gaps,
      sourceFiles: this.files.map((file) => relative(this.root, file.fileName)),
    };
  }

  /** Collect source facts without retaining any relation records. */
  collectFactsOnly(): CollectedProgramFacts {
    this.relationsDiscarded = true;
    this.declarationRelationDescriptors.length = 0;
    this.declarationAstUnitsByFile.clear();
    try {
      this.collectSourceFacts();
    } finally {
      this.relationsDiscarded = false;
    }
    return {
      facts: this.facts,
      gaps: this.gaps,
      sourceFiles: this.files.map((file) => relative(this.root, file.fileName)),
    };
  }

  /** Replay relation-producing passes for one caller-selected frontier. */
  collectRelations(sink: RelationSink): void {
    if (!this.sourceFactsCollected) this.collectFactsOnly();
    this.calls.length = 0;
    this.references.length = 0;
    this.httpFetches.length = 0;
    this.httpResources.length = 0;
    this.httpResponses.length = 0;
    const previousSink = this.relationSink;
    this.relationSink = sink;
    try {
      this.collectSourceFacts();
    } finally {
      this.relationSink = previousSink;
    }
  }

  private collectSourceFacts(): void {
    this.resetCollectionStats(this.files.length);
    if (this.declarationCatalog) {
      this.replayDeclarationRelations();
    } else {
      const declarationsFactsBefore = this.facts.length;
      this.declarationRelationCaptureEnabled = this.relationsDiscarded;
      try {
        this.measurePhase(
          "declarations",
          this.files.length,
          () => {
            for (const file of this.files) {
              this.checkCancellation();
              const astUnitsBefore = this.collectionStats.astUnitsVisited;
              this.collectDeclarations(file);
              if (this.collectionProfilingEnabled) {
                this.declarationAstUnitsByFile.set(
                  relative(this.root, file.fileName),
                  this.collectionStats.astUnitsVisited - astUnitsBefore,
                );
              }
              this.reportCollectorProgress("declarations", file);
            }
          },
          () => this.facts.length - declarationsFactsBefore,
        );
      } finally {
        this.declarationRelationCaptureEnabled = false;
      }
      this.declarationFactEnd = this.facts.length;
    }
    const nodesFactsBefore = this.facts.length;
    this.measurePhase(
      "nodes",
      this.files.length,
      () => {
        for (const file of this.files) {
          this.checkCancellation();
          this.collectNodes(file);
          this.reportCollectorProgress("nodes", file);
        }
      },
      () => this.facts.length - nodesFactsBefore,
    );
    this.checkCancellation();
    this.measurePhase("connectCalls", this.calls.length, () => this.connectCalls());
    this.checkCancellation();
    this.measurePhase("connectPendingReferences", this.references.length, () => this.connectPendingReferences());
    this.checkCancellation();
    this.measurePhase("connectHttpBridges", this.calls.length + this.httpFetches.length, () => this.connectProgramEvidenceTransport());
    this.checkCancellation();
    this.sourceFactsCollected = true;
  }
}
